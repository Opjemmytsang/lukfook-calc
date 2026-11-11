(() => {
  'use strict';

  const prefix = 'lukfook:store-visit:issue:';
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
  let editing = null;

  function announce(message, error = false) {
    feedback.classList.toggle('is-error', error);
    feedback.textContent = message;
  }

  function loadIssues() {
    // Store each issue separately so changes to different issues in two tabs do not overwrite each other.
    const storage = window.localStorage;
    return Object.keys(storage)
      .filter((key) => key.startsWith(prefix))
      .map((key) => JSON.parse(storage.getItem(key)))
      .filter(Boolean)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  function resetForm(branchName = '') {
    editing = null;
    form.reset();
    branch.value = branchName;
    get('visitFormTitle').textContent = '新增問題';
    get('visitSave').textContent = '儲存問題';
    cancel.hidden = true;
  }

  function editIssue(issue) {
    editing = issue;
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

  function deleteIssue(issue) {
    if (!window.confirm(`刪除「${issue.branch}」這項問題記錄？`)) return;
    try {
      window.localStorage.removeItem(prefix + issue.id);
    } catch {
      announce('未能刪除記錄，請檢查瀏覽器的網站儲存設定。', true);
      return;
    }
    if (editing?.id === issue.id) resetForm(issue.branch);
    render();
    listTitle.focus({ preventScroll: true });
    announce('已刪除問題。');
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
    actions.append(
      actionButton('編輯／跟進', () => editIssue(issue)),
      actionButton('刪除', () => deleteIssue(issue), 'visit-delete')
    );
    record.append(heading, time, description, actions);
    return record;
  }

  function render() {
    let issues;
    try {
      issues = loadIssues();
    } catch {
      fields.disabled = true;
      list.replaceChildren();
      empty.textContent = '未能讀取本機記錄，請檢查瀏覽器的網站儲存設定。';
      empty.hidden = false;
      return;
    }

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
    list.replaceChildren(...visible.map(renderIssue));
    empty.textContent = issues.length ? '沒有符合篩選條件的問題。' : '暫未有巡舖記錄。';
    empty.hidden = visible.length > 0;
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const branchName = branch.value.trim();
    const description = note.value.trim();
    if (!branchName || !description) {
      announce('請填寫分行及問題描述。', true);
      (branchName ? note : branch).focus();
      return;
    }

    const issue = {
      id: editing?.id ?? window.crypto.randomUUID(),
      createdAt: editing?.createdAt ?? new Date().toISOString(),
      branch: branchName,
      category: category.value,
      note: description,
      state: state.value
    };

    try {
      const key = prefix + issue.id;
      if (editing && window.localStorage.getItem(key) !== JSON.stringify(editing)) {
        announce('記錄已在另一個分頁更改或刪除。請重新開啟最新記錄，或先複製目前的問題描述。', true);
        return;
      }
      window.localStorage.setItem(key, JSON.stringify(issue));
    } catch {
      announce('未能儲存問題。請檢查瀏覽器的網站儲存設定或可用空間。', true);
      return;
    }

    const wasEditing = editing !== null;
    resetForm(branchName);
    filterBranch.value = '';
    filterState.value = '';
    render();
    if (wasEditing) listTitle.focus();
    announce(wasEditing ? '已儲存修改。' : '已新增問題。');
  });

  cancel.addEventListener('click', () => {
    resetForm(editing.branch);
    listTitle.focus();
    announce('');
  });
  filterBranch.addEventListener('change', render);
  filterState.addEventListener('change', render);
  window.addEventListener('storage', (event) => {
    if (event.key === null || event.key.startsWith(prefix)) render();
  });
  render();
})();
