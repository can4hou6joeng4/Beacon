const form = document.getElementById('auditForm');
const pdfInput = document.getElementById('pdfInput');
const fileName = document.getElementById('fileName');
const submitBtn = document.getElementById('submitBtn');
const headline = document.getElementById('headline');
const subhead = document.getElementById('subhead');
const metrics = document.getElementById('metrics');
const tableHost = document.getElementById('tableHost');
const tabs = document.querySelectorAll('.tab');
const progressItems = document.querySelectorAll('#progressList li');
const downloadActions = document.getElementById('downloadActions');

let currentResult = null;
let currentJob = null;
let activeTab = 'matches';
const accessToken = new URLSearchParams(window.location.search).get('token') || '';

function apiUrl(path) {
  if (!accessToken) return path;
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}token=${encodeURIComponent(accessToken)}`;
}

pdfInput.addEventListener('change', () => {
  fileName.textContent = pdfInput.files[0]?.name || '文件只保存在本机任务目录';
});

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    tabs.forEach((item) => item.classList.remove('active'));
    tab.classList.add('active');
    activeTab = tab.dataset.tab;
    renderTable();
  });
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!pdfInput.files[0]) return;
  submitBtn.disabled = true;
  headline.textContent = '正在创建检查任务';
  subhead.textContent = 'PDF 会保存在本机 jobs 目录，后台开始解析和 OCR。';
  setProgress(1);
  const body = new FormData(form);
  const response = await fetch(apiUrl('/api/jobs'), { method: 'POST', body, headers: accessToken ? { 'X-Access-Token': accessToken } : {} });
  const payload = await response.json();
  if (!response.ok) {
    submitBtn.disabled = false;
    headline.textContent = payload.error || '上传失败';
    return;
  }
  currentJob = payload.job_id;
  pollStatus();
});

function setProgress(step) {
  progressItems.forEach((item, index) => item.classList.toggle('active', index <= step));
}

async function pollStatus() {
  const response = await fetch(apiUrl(`/api/jobs/${currentJob}/status`));
  const status = await response.json();
  headline.textContent = status.message || status.status;
  if (status.status === 'running') setProgress(3);
  if (status.status === 'complete') {
    setProgress(4);
    await loadResult();
    submitBtn.disabled = false;
    return;
  }
  if (status.status === 'failed') {
    submitBtn.disabled = false;
    headline.textContent = '检查失败';
    subhead.textContent = status.message || '请查看终端日志。';
    return;
  }
  window.setTimeout(pollStatus, 1500);
}

async function loadResult() {
  const response = await fetch(apiUrl(`/api/jobs/${currentJob}/result`));
  currentResult = await response.json();
  const summary = currentResult.summary;
  headline.textContent = summary.matches === 0 ? '未发现早于截止日期的证件' : `发现 ${summary.matches} 项早于截止日期`;
  subhead.textContent = `截止日期 ${summary.cutoff}，共识别 ${summary.validity_candidates} 个有效期字段。`;
  downloadActions.innerHTML = `
    <a href="${apiUrl(`/api/jobs/${currentJob}/matches.csv`)}">下载 CSV</a>
    <a href="${apiUrl(`/api/jobs/${currentJob}/result.json`)}">下载 JSON</a>
    <a href="${apiUrl(`/api/jobs/${currentJob}/ocr.txt`)}">下载 OCR</a>
  `;
  renderMetrics();
  renderTable();
}

function renderMetrics() {
  const manifest = currentResult.manifest || {};
  const summary = currentResult.summary;
  const data = [
    ['PDF 页数', manifest.page_count || 0],
    ['证件页', manifest.certificate_pages || summary.pages_ocr],
    ['有效期字段', summary.validity_candidates],
    ['命中项', summary.matches],
    ['需复核', summary.needs_review],
  ];
  metrics.innerHTML = data.map(([label, value]) => `<article class="metric"><span>${label}</span><strong>${value}</strong></article>`).join('');
}

function rowsForTab() {
  if (!currentResult) return [];
  if (activeTab === 'matches') return currentResult.matches || [];
  if (activeTab === 'near') return currentResult.near_expiry || [];
  return currentResult.needs_review || [];
}

function rowLabel(row) {
  const item = row.items?.[0];
  if (!item) return row.title || '';
  const index = item.person_index ? `${String(item.person_index).padStart(2, '0')} ` : '';
  return `${index}${item.person || ''} / ${item.bookmark || row.title || ''}`;
}

function renderTable() {
  const rows = rowsForTab();
  if (!currentResult) {
    tableHost.innerHTML = '<div class="empty-state">等待检查结果</div>';
    return;
  }
  if (rows.length === 0) {
    const copy = activeTab === 'matches' ? '没有早于截止日期的证件' : '当前分类没有记录';
    tableHost.innerHTML = `<div class="empty-state">${copy}</div>`;
    return;
  }
  tableHost.innerHTML = `
    <table>
      <thead><tr><th>页码</th><th>人员 / 证件</th><th>到期日</th><th>证据片段</th></tr></thead>
      <tbody>${rows.map((row) => `
        <tr>
          <td>${row.page}</td>
          <td>${escapeHtml(rowLabel(row))}</td>
          <td><span class="badge ${activeTab === 'matches' ? 'danger' : activeTab === 'review' ? 'warn' : ''}">${escapeHtml(row.expiry_date || '待复核')}</span></td>
          <td class="context">${escapeHtml(row.field_context || row.context || '')}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}
