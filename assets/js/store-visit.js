(() => {
  'use strict';

  const db = window.storeVisitDB;
  const updates = 'BroadcastChannel' in window ? new BroadcastChannel('lukfook-store-visit') : null;
  const photoLimit = 3;
  const get = (id) => document.getElementById(id);
  const form = get('visitForm');
  const fields = get('visitFields');
  const branch = get('visitBranch');
  const branchPicker = get('visitBranchOptions');
  const branchFile = get('visitBranchFile');
  const branchFileStatus = get('visitBranchFileStatus');
  const district = get('visitDistrict');
  const branchStorageKey = 'lukfook:store-visit:branch-directory';
  const builtInBranches = window.storeVisitBranches ?? [];
  const category = get('visitCategory');
  const note = get('visitNote');
  const state = get('visitState');
  const filterBranch = get('visitFilterBranch');
  const filterState = get('visitFilterState');
  const feedback = get('visitFeedback');
  const empty = get('visitEmpty');
  const list = get('visitList');
  const listTitle = get('visitListTitle');
  const cancel = get('visitCancel');
  const stateLabels = new Map(Array.from(state.options, ({ value, text }) => [value, text]));
  const dayFormat = new Intl.DateTimeFormat('zh-HK', { dateStyle: 'medium' });
  const filenameDateFormat = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short' });
  const dateFormat = new Intl.DateTimeFormat('zh-HK', { dateStyle: 'medium', timeStyle: 'short' });
  const save = get('visitSave');
  const draftGallery = get('visitDraftPhotos');
  const email = get('visitEmail');
  const share = get('visitShare');
  const emailOptions = get('visitEmailOptions');
  const emailPhotos = get('visitEmailPhotos');
  const shareStatus = get('visitShareStatus');
  const reportButton = get('visitReport');
  const reportCount = get('visitReportCount');
  const pdfTitle = get('visitPdfTitle');
  const pdfDialog = get('visitPdf');
  const pdfStatus = get('visitPdfStatus');
  const pdfDownload = get('visitPdfDownload');
  const pdfShare = get('visitPdfShare');
  const photoInputs = [get('visitCamera'), get('visitPhotoPicker')];
  let editing = null;
  let draftPhotos = [];
  let busy = false;
  let renderVersion = 0;
  let shareData;
  let pdfFile;
  let pdfUrl;
  let pdfJob = 0;
  let visibleIssues = [];
  let branchDirectory = [];
  let branchesByCode = new Map();
  let branchesByName = new Map();

  function branchKey(value) {
    return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleUpperCase('en');
  }

  function parseDirectory(value) {
    if (!Array.isArray(value) || value.length === 0 || value.length > 5000) throw Error('Invalid directory');
    const codes = new Set();
    return value.map((row) => {
      const fields = ['code', 'name', 'country', 'district'];
      if (!row || fields.some((field) => typeof row[field] !== 'string' || !row[field].trim() || row[field].length > 120) ||
          row.code.trim().length > branch.maxLength) throw Error('Invalid branch');
      const item = Object.fromEntries(fields.map((field) => [field, row[field].trim().replace(/\s+/g, ' ')]));
      const key = branchKey(item.code);
      if (codes.has(key)) throw Error('Duplicate branch code');
      codes.add(key);
      return item;
    });
  }

  function indexDirectory(rows = []) {
    branchesByCode = new Map();
    branchesByName = new Map();
    for (const item of [...builtInBranches, ...rows]) {
      const key = branchKey(item.code);
      const existing = branchesByCode.get(key);
      branchesByCode.set(key, {
        ...item,
        aliases: [...(existing?.aliases ?? []), ...(item.aliases ?? [])]
      });
    }
    branchDirectory = [...branchesByCode.values()];
    for (const item of branchDirectory) {
      const names = new Set([item.name, ...(item.aliases ?? [])].map(branchKey));
      for (const name of names) {
        branchesByName.set(name, branchesByName.has(name) ? null : item);
      }
    }
  }

  function loadDirectory() {
    let rows = [];
    try {
      const raw = localStorage.getItem(branchStorageKey);
      if (raw) rows = parseDirectory(JSON.parse(raw));
    } catch {
      // The built-in branch list is available without local storage.
    }
    indexDirectory(rows);
    branchFileStatus.textContent = rows.length
      ? `已套用更新名單，共 ${branchDirectory.length} 間分行。`
      : `已內置 ${branchDirectory.length} 間分行。`;
  }

  function branchInfo(value, savedDistrict = '') {
    const key = branchKey(value);
    const item = branchesByCode.get(key) ?? branchesByName.get(key);
    return item
      ? { code: item.code, name: item.name, label: `${item.code} · ${item.name}`, district: item.district }
      : { code: value, label: value, district: savedDistrict };
  }

  function updateDistrict(applyCode = false) {
    const info = branchInfo(branch.value, editing?.branch === branch.value ? editing.district : '');
    if (applyCode && info.name) branch.value = info.code;
    branchPicker.value = info.code;
    if (branchPicker.selectedIndex === -1) branchPicker.value = '';
    district.textContent = !branch.value.trim() ? '' : info.name
      ? `${info.name}｜分區：${info.district}`
      : `分區：${info.district || '未有分區資料'}`;
  }

  function renderBranchPicker(branches) {
    const groups = new Map();
    for (const item of branchDirectory) {
      const groupName = `${item.country} · ${item.district}`;
      if (!groups.has(groupName)) {
        const group = document.createElement('optgroup');
        group.label = groupName;
        groups.set(groupName, group);
      }
      groups.get(groupName).append(new Option(`${item.code} · ${item.name}`, item.code));
    }
    const manual = branches.filter(({ code }) => !branchesByCode.has(branchKey(code)));
    const options = new Option(groups.size || manual.length ? '選擇分行' : '請匯入名單或手動輸入', '');
    options.disabled = true;
    branchPicker.replaceChildren(options, ...groups.values(), ...manual.map(({ code, label }) => new Option(label, code)));
    branchPicker.value = '';
    branchPicker.disabled = !groups.size && !manual.length;
  }

  loadDirectory();

  function setBusy(value) {
    busy = value;
    save.disabled = value;
    cancel.disabled = value;
    for (const input of photoInputs) input.disabled = value;
  }

  function announce(message, error = false) {
    feedback.classList.toggle('is-error', error);
    feedback.textContent = message;
  }

  function clearPhotos(container) {
    for (const img of container.querySelectorAll('img[data-visit-photo]')) {
      URL.revokeObjectURL(img.src);
    }
    container.replaceChildren();
  }

  function renderPhotos(container, photos, action) {
    clearPhotos(container);
    photos.forEach((photo, index) => {
      const figure = document.createElement('figure');
      figure.className = 'visit-photo';
      const img = document.createElement('img');
      img.dataset.visitPhoto = '';
      img.src = URL.createObjectURL(photo);
      img.alt = `現場相片 ${index + 1}`;
      figure.append(img);
      if (action) figure.append(action(img.src, index));
      container.append(figure);
    });
  }

  function renderDraftPhotos() {
    renderPhotos(draftGallery, draftPhotos, (_, index) => actionButton(`移除相片 ${index + 1}`, () => {
      if (busy) return;
      draftPhotos.splice(index, 1);
      renderDraftPhotos();
      photoInputs[0].focus();
    }));
  }

  async function preparePhoto(file) {
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();

      const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d', { alpha: false });
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return await new Promise((resolve, reject) => {
        canvas.toBlob((photo) => photo ? resolve(photo) : reject(new Error('Photo conversion failed')), 'image/jpeg', 0.82);
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function addPhotos(event) {
    const input = event.currentTarget;
    const files = Array.from(input.files);
    input.value = '';
    if (!files.length || busy) return;

    const available = photoLimit - draftPhotos.length;
    if (available === 0) {
      announce('每項問題最多 3 張相片，請先移除一張。', true);
      return;
    }

    setBusy(true);
    announce('正在處理相片…');
    let failed = 0;
    for (const file of files.slice(0, available)) {
      try {
        draftPhotos.push(await preparePhoto(file));
      } catch {
        failed += 1;
      }
    }
    setBusy(false);
    renderDraftPhotos();
    if (failed) announce(`有 ${failed} 張相片未能讀取。可改用 JPEG 或 PNG。`, true);
    else if (files.length > available) announce('已加入可容納的相片。每項問題最多 3 張。');
    else announce(`已選取 ${draftPhotos.length} 張相片，請儲存問題。`);
  }

  function openEmail(issue) {
    const subject = `巡舖記錄｜${issue.branch}｜${issue.category}`.replace(/[\r\n]/g, ' ');
    const body = [
      `分行：${issue.branch}`,
      `記錄時間：${dateFormat.format(new Date(issue.createdAt))}`,
      `類別：${issue.category}`,
      `跟進狀態：${stateLabels.get(issue.state)}`,
      '',
      issue.note
    ].join('\r\n');
    const photos = issue.photos ?? [];
    shareData = { title: subject, text: body };
    if (photos.length) {
      shareData.files = photos.map((photo, index) =>
        new File([photo], `store-visit-${index + 1}.jpg`, { type: 'image/jpeg' })
      );
    }
    share.hidden = !navigator.share || (photos.length > 0 && !navigator.canShare?.(shareData));
    emailOptions.open = share.hidden;
    get('visitEmailHelp').hidden = share.hidden;
    shareStatus.textContent = '';
    get('visitEmailBody').value = body;

    const draft = `mailto:?subject=${encodeURIComponent(subject)}`;
    const withBody = `${draft}&body=${encodeURIComponent(body)}`;
    const includeBody = withBody.length <= 1800;
    get('visitMailto').href = includeBody ? withBody : draft;
    const instructions = ['填上你自己嘅電郵地址。'];
    if (!includeBody) instructions.push('內容較長，請複製下方文字到電郵。');
    if (photos.length) instructions.push('請先下載相片，再喺電郵草稿加入附件。');
    get('visitManualHelp').textContent = instructions.join('');
    renderPhotos(emailPhotos, photos, (url, index) => {
      const download = document.createElement('a');
      download.className = 'button button-secondary';
      download.href = url;
      download.download = shareData.files[index].name;
      download.textContent = `下載相片 ${index + 1}`;
      return download;
    });
    email.showModal();
  }

  function issuePdfData(issue) {
    const info = branchInfo(issue.branch, issue.district);
    return {
      details: {
        '分行': info.label,
        '分區': info.district || '未有分區資料',
        '記錄時間': dateFormat.format(new Date(issue.createdAt)),
        '問題類別': issue.category,
        '跟進狀態': stateLabels.get(issue.state)
      },
      note: issue.note,
      photos: issue.photos
    };
  }

  function exportIssue(issue) {
    const name = issue.branch.replace(/[^\p{L}\p{N}_-]/gu, '-').slice(0, 35);
    const date = filenameDateFormat.format(new Date(issue.createdAt));
    return exportPdf([issuePdfData(issue)], `巡舖記錄-${name}-${date}.pdf`);
  }

  function exportReport() {
    const firstDay = dayFormat.format(new Date(visibleIssues.at(-1).createdAt));
    const lastDay = dayFormat.format(new Date(visibleIssues[0].createdAt));
    const counts = new Map([...stateLabels.keys()].map((state) => [state, 0]));
    for (const issue of visibleIssues) counts.set(issue.state, (counts.get(issue.state) ?? 0) + 1);

    const report = {
      details: {
        '記錄期間': firstDay === lastDay ? firstDay : `${firstDay} 至 ${lastDay}`,
        '涵蓋分行': filterBranch.selectedOptions[0]?.text || '全部分行',
        '涵蓋狀態': stateLabels.get(filterState.value) || '全部狀態'
      },
      counts: [
        ['問題總數', visibleIssues.length],
        ...[...stateLabels].map(([state, label]) => [label, counts.get(state)])
      ]
    };
    return exportPdf(visibleIssues.map(issuePdfData), `巡舖報告-${filenameDateFormat.format(new Date())}.pdf`, report);
  }

  async function exportPdf(issues, filename, report) {
    const job = ++pdfJob;
    pdfDownload.hidden = true;
    pdfShare.hidden = true;
    pdfTitle.textContent = report ? '匯出巡舖報告' : '匯出巡舖記錄';
    pdfStatus.textContent = '正在製作 PDF…';
    pdfDialog.showModal();
    try {
      const blob = await window.makeStoreVisitPdf(issues, report);
      if (!pdfDialog.open || job !== pdfJob) return;
      pdfFile = new File([blob], filename, { type: blob.type });
      pdfUrl = URL.createObjectURL(pdfFile);
      pdfDownload.href = pdfUrl;
      pdfDownload.download = pdfFile.name;
      pdfDownload.hidden = false;
      pdfShare.hidden = !navigator.share || !navigator.canShare?.({ files: [pdfFile] });
      pdfStatus.textContent = 'PDF 已準備好。';
    } catch {
      if (pdfDialog.open && job === pdfJob) pdfStatus.textContent = '未能製作 PDF，請關閉視窗後再試。';
    }
  }

  pdfShare.addEventListener('click', async () => {
    try {
      await navigator.share({ files: [pdfFile] });
    } catch (error) {
      if (error.name !== 'AbortError') pdfStatus.textContent = '未能開啟分享選單，請使用「下載 PDF」。';
    }
  });
  pdfDialog.addEventListener('close', () => {
    if (pdfDialog.open) return;
    pdfJob += 1;
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    pdfDownload.removeAttribute('href');
    pdfUrl = undefined;
    pdfFile = undefined;
  });

  function resetForm(branchName = '') {
    editing = null;
    draftPhotos = [];
    renderDraftPhotos();
    form.reset();
    branch.value = branchName;
    updateDistrict();
    get('visitFormTitle').textContent = '新增問題';
    get('visitSave').textContent = '儲存問題';
    cancel.hidden = true;
  }

  function editIssue(issue) {
    if (busy) return;
    editing = issue;
    draftPhotos = [...(issue.photos ?? [])];
    renderDraftPhotos();
    branch.value = issue.branch;
    updateDistrict();
    category.value = issue.category;
    note.value = issue.note;
    state.value = issue.state;
    get('visitFormTitle').textContent = '編輯問題';
    get('visitSave').textContent = '儲存修改';
    cancel.hidden = false;
    announce('');
    note.focus();
  }

  async function deleteIssue(issue) {
    if (busy || !window.confirm(`刪除「${issue.branch}」這項問題記錄？`)) return;
    setBusy(true);
    try {
      if (!await db.change(issue, issue, true)) {
        announce('記錄已在另一個分頁更改或刪除，請重新查看。', true);
        await render();
        return;
      }
      if (editing?.id === issue.id) resetForm(issue.branch);
      updates?.postMessage('changed');
      await render();
      listTitle.focus({ preventScroll: true });
      announce('已刪除問題。');
    } catch {
      announce('未能刪除記錄，請檢查瀏覽器的網站儲存設定。', true);
    } finally {
      setBusy(false);
    }
  }

  function actionButton(label, handler, extraClass = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `button button-secondary ${extraClass}`.trim();
    button.textContent = label;
    button.addEventListener('click', handler);
    return button;
  }

  function renderIssue(issue) {
    const record = document.createElement('li');
    record.className = 'visit-record';

    const heading = document.createElement('div');
    heading.className = 'visit-record-heading';
    const title = document.createElement('h3');
    const info = branchInfo(issue.branch, issue.district);
    title.textContent = `${info.label} · ${issue.category}`;
    const tag = document.createElement('span');
    tag.className = 'visit-tag';
    tag.dataset.state = issue.state;
    tag.textContent = stateLabels.get(issue.state);
    heading.append(title, tag);

    const time = document.createElement('time');
    time.dateTime = issue.createdAt;
    time.textContent = dateFormat.format(new Date(issue.createdAt));
    const districtLabel = document.createElement('span');
    districtLabel.className = 'visit-district';
    districtLabel.textContent = info.district ? ` · ${info.district}` : '';
    const description = document.createElement('p');
    description.textContent = issue.note;

    const actions = document.createElement('div');
    actions.className = 'action-row';
    actions.append(
      actionButton('編輯／跟進', () => editIssue(issue)),
      actionButton('匯出 PDF', () => exportIssue(issue)),
      actionButton('電郵畀自己', () => openEmail(issue)),
      actionButton('刪除', () => deleteIssue(issue), 'visit-delete')
    );
    record.append(heading, time, districtLabel, description);
    if (issue.photos?.length) {
      const gallery = document.createElement('div');
      gallery.className = 'visit-photos';
      renderPhotos(gallery, issue.photos);
      record.append(gallery);
    }
    record.append(actions);
    return record;
  }

  async function render() {
    const version = ++renderVersion;
    reportButton.disabled = true;
    let issues;
    try {
      issues = await db.list();
      issues.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch {
      if (version !== renderVersion) return;
      fields.disabled = true;
      visibleIssues = [];
      reportCount.textContent = '';
      clearPhotos(list);
      empty.textContent = '未能讀取本機記錄，請檢查瀏覽器的網站儲存設定。';
      empty.hidden = false;
      return;
    }

    if (version !== renderVersion) return;
    fields.disabled = false;
    const selectedBranch = filterBranch.value;
    const seenBranches = new Map();
    for (const issue of issues) {
      const info = branchInfo(issue.branch, issue.district);
      seenBranches.set(info.code, info);
    }
    const branches = [...seenBranches.values()].sort((a, b) => a.code.localeCompare(b.code, 'zh-HK', { numeric: true }));
    filterBranch.replaceChildren(new Option('全部分行', ''), ...branches.map(({ code, label }) => new Option(label, code)));
    filterBranch.value = seenBranches.has(selectedBranch) ? selectedBranch : '';
    renderBranchPicker(branches);
    updateDistrict();

    visibleIssues = issues.filter((issue) =>
      (!filterBranch.value || branchInfo(issue.branch).code === filterBranch.value) &&
      (!filterState.value || issue.state === filterState.value)
    );
    clearPhotos(list);
    list.append(...visibleIssues.map(renderIssue));
    reportButton.disabled = visibleIssues.length === 0;
    reportCount.textContent = visibleIssues.length ? `目前顯示 ${visibleIssues.length} 項，合併為一份報告。` : '';
    empty.textContent = issues.length ? '沒有符合篩選條件的問題。' : '暫未有巡舖記錄。';
    empty.hidden = visibleIssues.length > 0;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    const branchName = branch.value.trim();
    const description = note.value.trim();
    if (!branchName || !description) {
      announce('請填寫分行及問題描述。', true);
      (branchName ? note : branch).focus();
      return;
    }

    setBusy(true);
    try {
      const info = branchInfo(branchName, editing?.branch === branchName ? editing.district : '');
      const issue = {
        id: editing?.id ?? window.crypto.randomUUID(),
        revision: window.crypto.randomUUID(),
        createdAt: editing?.createdAt ?? new Date().toISOString(),
        branch: info.code,
        district: info.district,
        category: category.value,
        note: description,
        state: state.value,
        photos: draftPhotos
      };
      if (!await db.change(issue, editing)) {
        announce('記錄已在另一個分頁更改或刪除。請重新開啟最新記錄。', true);
        await render();
        return;
      }
      const wasEditing = editing !== null;
      resetForm(info.code);
      filterBranch.value = '';
      filterState.value = '';
      updates?.postMessage('changed');
      await render();
      if (wasEditing) listTitle.focus();
      announce(wasEditing ? '已儲存修改。' : '已新增問題。');
    } catch {
      announce('未能儲存問題。請檢查瀏覽器的網站儲存設定或可用空間。', true);
    } finally {
      setBusy(false);
    }
  });

  cancel.addEventListener('click', () => {
    resetForm(editing.branch);
    listTitle.focus();
    announce('');
  });
  branch.addEventListener('input', () => updateDistrict());
  branch.addEventListener('change', () => updateDistrict(true));
  branchPicker.addEventListener('change', () => {
    if (branchPicker.value) branch.value = branchPicker.value;
    updateDistrict(true);
  });
  branchFile.addEventListener('change', async () => {
    const file = branchFile.files[0];
    branchFile.value = '';
    if (!file) return;
    branchFile.disabled = true;
    try {
      if (file.size > 1024 * 1024) throw Error('Directory too large');
      const rows = parseDirectory(JSON.parse(await file.text()));
      localStorage.setItem(branchStorageKey, JSON.stringify(rows));
      indexDirectory(rows);
      branchFileStatus.textContent = `已套用更新名單，共 ${branchDirectory.length} 間分行。`;
      await render();
    } catch {
      branchFileStatus.textContent = '未能匯入分行名單。請檢查 JSON 檔案及瀏覽器儲存設定。';
    } finally {
      branchFile.disabled = false;
    }
  });
  window.addEventListener('storage', (event) => {
    if (event.key === branchStorageKey) {
      loadDirectory();
      render();
    }
  });
  reportButton.addEventListener('click', exportReport);
  filterBranch.addEventListener('change', render);
  filterState.addEventListener('change', render);
  for (const input of photoInputs) input.addEventListener('change', addPhotos);
  share.addEventListener('click', async () => {
    share.disabled = true;
    try {
      await navigator.share(shareData);
    } catch (error) {
      if (error.name !== 'AbortError') {
        emailOptions.open = true;
        shareStatus.textContent = '未能開啟分享選單，請使用手動電郵方式。';
      }
    } finally {
      share.disabled = false;
    }
  });
  get('visitCopyEmail').addEventListener('click', async () => {
    const body = get('visitEmailBody');
    try {
      await navigator.clipboard.writeText(body.value);
      shareStatus.textContent = '已複製電郵內容。';
    } catch {
      body.focus();
      body.select();
      shareStatus.textContent = '已選取電郵內容，可使用系統複製功能。';
    }
  });
  email.addEventListener('close', () => {
    clearPhotos(emailPhotos);
    shareData = undefined;
  });
  updates?.addEventListener('message', render);
  render();
})();
