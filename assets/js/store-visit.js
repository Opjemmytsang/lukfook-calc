(() => {
  'use strict';

  const db = window.storeVisitDB;
  const updates = 'BroadcastChannel' in window ? new BroadcastChannel('lukfook-store-visit') : null;
  const photoLimit = 3;
  const get = (id) => document.getElementById(id);
  const form = get('visitForm');
  const fields = get('visitFields');
  const branch = get('visitBranch');
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
  const dateFormat = new Intl.DateTimeFormat('zh-HK', { dateStyle: 'medium', timeStyle: 'short' });
  const save = get('visitSave');
  const draftGallery = get('visitDraftPhotos');
  const email = get('visitEmail');
  const share = get('visitShare');
  const emailOptions = get('visitEmailOptions');
  const emailPhotos = get('visitEmailPhotos');
  const shareStatus = get('visitShareStatus');
  const photoInputs = [get('visitCamera'), get('visitPhotoPicker')];
  let editing = null;
  let draftPhotos = [];
  let busy = false;
  let renderVersion = 0;
  let shareData;
  const mailSettings = get('visitAutoMailForm');
  const mailEndpoint = get('visitMailEndpoint');
  const mailKey = get('visitMailKey');
  const mailStatus = get('visitAutoMailStatus');
  const mailConfigKey = 'lukfook:store-visit:mail-config';
  let mailConfig = null;

  try {
    mailConfig = JSON.parse(window.sessionStorage.getItem(mailConfigKey));
  } catch {
    // Users can still configure mail for the lifetime of the open page.
  }
  mailEndpoint.value = mailConfig?.endpoint ?? '';
  mailStatus.textContent = mailConfig ? '已設定寄信服務。' : '尚未設定寄信服務。';

  mailSettings.addEventListener('submit', (event) => {
    event.preventDefault();
    const key = mailKey.value.trim();
    try {
      const url = new URL(mailEndpoint.value.trim());
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
          url.pathname !== '/send' || key.length < 32) {
        throw new Error('Invalid mail configuration');
      }
      mailConfig = { endpoint: url.href, key };
    } catch {
      mailStatus.textContent = '請輸入以 /send 結尾的 HTTPS 網址及有效存取金鑰。';
      return;
    }

    mailKey.value = '';
    try {
      window.sessionStorage.setItem(mailConfigKey, JSON.stringify(mailConfig));
      mailStatus.textContent = '已套用設定。';
    } catch {
      mailStatus.textContent = '已套用設定。重新載入頁面後需再輸入。';
    }
  });

  get('visitMailClear').addEventListener('click', () => {
    mailConfig = null;
    mailSettings.reset();
    try {
      window.sessionStorage.removeItem(mailConfigKey);
      mailStatus.textContent = '已停用自動電郵。';
    } catch {
      mailStatus.textContent = '已在此頁停用。未能清除分頁儲存的設定。';
    }
  });

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

  function emailContent(issue) {
    const subject = `巡舖記錄｜${issue.branch}｜${issue.category}`.replace(/[\r\n]/g, ' ');
    const body = [
      `分行：${issue.branch}`,
      `記錄時間：${dateFormat.format(new Date(issue.createdAt))}`,
      `類別：${issue.category}`,
      `跟進狀態：${stateLabels.get(issue.state)}`,
      '',
      issue.note
    ].join('\r\n');
    return { subject, text: body, photos: issue.photos ?? [] };
  }

  function encodePhoto(photo) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(photo);
    });
  }

  async function sendSavedIssue(issue) {
    const config = mailConfig;
    if (!config) {
      announce('記錄已儲存。請先設定寄信服務，再按「寄送電郵」。');
      return;
    }

    try {
      // Keep the first attempt's content for retries, including after a later edit.
      if (!issue.mailSnapshot) {
        const staged = { ...issue, revision: crypto.randomUUID(), mailSnapshot: emailContent(issue) };
        if (!await db.change(staged, issue)) {
          await render();
          announce('記錄已更新，請重新按「寄送電郵」。', true);
          return;
        }
        issue = staged;
      }
      const { subject, text, photos } = issue.mailSnapshot;
      const encoded = await Promise.all(photos.map(encodePhoto));
      announce('記錄已儲存，正在寄送電郵…');
      const response = await fetch(config.endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: issue.id, subject, text, photos: encoded }),
        redirect: 'error',
        signal: AbortSignal.timeout(15000)
      });
      if (!response.ok || !(await response.json()).ok) throw new Error('Email request failed');

      const sent = { ...issue, revision: crypto.randomUUID(), mailPending: false, mailSentAt: new Date().toISOString() };
      delete sent.mailSnapshot;
      if (!await db.change(sent, issue)) {
        announce('寄信服務已受理，但本機未能更新寄送狀態。請先查閱信箱。', true);
        return;
      }
      announce('記錄已儲存，寄信服務已受理。');
    } catch {
      announce('記錄已儲存，暫未確認寄送。可檢查設定或連線，再按「寄送電郵」。', true);
    } finally {
      updates?.postMessage('changed');
      await render();
    }
  }

  async function retryMail(issue) {
    if (busy) return;
    setBusy(true);
    try {
      await sendSavedIssue(issue);
    } finally {
      setBusy(false);
    }
  }

  function openEmail(issue) {
    const { subject, text: body, photos } = emailContent(issue);
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

  function resetForm(branchName = '') {
    editing = null;
    draftPhotos = [];
    renderDraftPhotos();
    form.reset();
    branch.value = branchName;
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
    title.textContent = `${issue.branch} · ${issue.category}`;
    const tag = document.createElement('span');
    tag.className = 'visit-tag';
    tag.dataset.state = issue.state;
    tag.textContent = stateLabels.get(issue.state);
    heading.append(title, tag);

    const time = document.createElement('time');
    time.dateTime = issue.createdAt;
    time.textContent = dateFormat.format(new Date(issue.createdAt));
    const description = document.createElement('p');
    description.textContent = issue.note;

    const actions = document.createElement('div');
    actions.className = 'action-row';
    if (issue.mailPending) actions.append(actionButton('寄送電郵', () => retryMail(issue)));
    actions.append(
      actionButton('編輯／跟進', () => editIssue(issue)),
      actionButton('電郵畀自己', () => openEmail(issue)),
      actionButton('刪除', () => deleteIssue(issue), 'visit-delete')
    );
    record.append(heading, time, description);
    if (issue.photos?.length) {
      const gallery = document.createElement('div');
      gallery.className = 'visit-photos';
      renderPhotos(gallery, issue.photos);
      record.append(gallery);
    }
    if (issue.mailPending || issue.mailSentAt) {
      const status = document.createElement('p');
      status.className = 'status';
      status.textContent = issue.mailSentAt ? '電郵：寄信服務已受理' : '電郵：待確認寄送';
      record.append(status);
    }
    record.append(actions);
    return record;
  }

  async function render() {
    const version = ++renderVersion;
    let issues;
    try {
      issues = await db.list();
      issues.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch {
      if (version !== renderVersion) return;
      fields.disabled = true;
      clearPhotos(list);
      empty.textContent = '未能讀取本機記錄，請檢查瀏覽器的網站儲存設定。';
      empty.hidden = false;
      return;
    }

    if (version !== renderVersion) return;
    fields.disabled = false;
    const selectedBranch = filterBranch.value;
    const branches = [...new Set(issues.map((issue) => issue.branch))]
      .sort((a, b) => a.localeCompare(b, 'zh-HK', { numeric: true }));
    filterBranch.replaceChildren(new Option('全部分行', ''), ...branches.map((name) => new Option(name, name)));
    filterBranch.value = branches.includes(selectedBranch) ? selectedBranch : '';
    get('visitBranchOptions').replaceChildren(...branches.map((name) => new Option(name)));

    const visible = issues.filter((issue) =>
      (!filterBranch.value || issue.branch === filterBranch.value) &&
      (!filterState.value || issue.state === filterState.value)
    );
    clearPhotos(list);
    list.append(...visible.map(renderIssue));
    empty.textContent = issues.length ? '沒有符合篩選條件的問題。' : '暫未有巡舖記錄。';
    empty.hidden = visible.length > 0;
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
      const issue = {
        ...editing,
        id: editing?.id ?? window.crypto.randomUUID(),
        revision: window.crypto.randomUUID(),
        createdAt: editing?.createdAt ?? new Date().toISOString(),
        branch: branchName,
        category: category.value,
        note: description,
        state: state.value,
        photos: draftPhotos
      };
      if (!editing) issue.mailPending = true;
      if (!await db.change(issue, editing)) {
        announce('記錄已在另一個分頁更改或刪除。請重新開啟最新記錄。', true);
        await render();
        return;
      }
      const wasEditing = editing !== null;
      resetForm(branchName);
      filterBranch.value = '';
      filterState.value = '';
      updates?.postMessage('changed');
      await render();
      if (wasEditing) listTitle.focus();
      if (wasEditing) announce('已儲存修改。');
      else await sendSavedIssue(issue);
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
