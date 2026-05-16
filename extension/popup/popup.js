// popup.js — v2026.05.16-20
let adherents = [];
let selected  = new Set();

const list    = document.getElementById('adherent-list');
const btnFill = document.getElementById('btn-fill');
const btnLoad = document.getElementById('btn-load');
const btnAll  = document.getElementById('btn-all');
const btnNone = document.getElementById('btn-none');
const counter = document.getElementById('counter');
const status  = document.getElementById('status');
const progressWrap = document.querySelector('.progress-wrap');
const progressFill = document.querySelector('.progress-fill');
const progressCurrent = document.querySelector('.progress-current');

function showStatus(msg, type = 'info') {
  status.textContent = msg;
  status.className = `status ${type}`;
  status.classList.remove('hidden');
}

function updateCounter() {
  const n = selected.size;
  counter.textContent = `${n} sélectionné(s)`;
  btnFill.disabled = n === 0;
}

function renderList() {
  list.innerHTML = '';
  if (adherents.length === 0) {
    list.innerHTML = '<div style="padding:10px;text-align:center;color:#999;font-size:12px">Aucun adhérent chargé</div>';
    return;
  }
  adherents.forEach((a, i) => {
    const item = document.createElement('label');
    item.className = 'adherent-item' + (selected.has(i) ? ' checked' : '');
    item.innerHTML = `
      <input type="checkbox" value="${i}" ${selected.has(i) ? 'checked' : ''}>
      <span class="name">${a.nom} ${a.prenom}</span>
      <span class="ddn">${a.date_naissance || ''}</span>
    `;
    item.querySelector('input').addEventListener('change', e => {
      if (e.target.checked) { selected.add(i);    item.classList.add('checked'); }
      else                  { selected.delete(i); item.classList.remove('checked'); }
      updateCounter();
    });
    list.appendChild(item);
  });
  updateCounter();
}

btnAll.addEventListener('click',  () => { adherents.forEach((_, i) => selected.add(i));  renderList(); });
btnNone.addEventListener('click', () => { selected.clear(); renderList(); });

// Sync statut + progression depuis le background
function syncStatus() {
  chrome.storage.session.get(['flowStatus', 'queueProgress'], r => {
    if (r.flowStatus) showStatus(r.flowStatus.msg, r.flowStatus.type);
    if (r.queueProgress) {
      const { current, total } = r.queueProgress;
      if (total > 0) {
        const pct = Math.round((current / total) * 100);
        progressWrap.classList.add('visible');
        progressFill.style.width = pct + '%';
        progressCurrent.textContent = `${current}/${total}`;
      }
    }
  });
}
setInterval(syncStatus, 800);
syncStatus();

btnFill.addEventListener('click', async () => {
  if (selected.size === 0) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !tab.url.includes('moncompte.ffjudo.com')) {
    showStatus("Ouvrez d'abord moncompte.ffjudo.com.", 'error');
    return;
  }
  const queue = [...selected].sort((a, b) => a - b).map(i => adherents[i]);
  showStatus(`Lancement de ${queue.length} saisie(s)...`, 'info');
  progressWrap.classList.add('visible');
  progressFill.style.width = '0%';
  progressCurrent.textContent = `0/${queue.length}`;
  chrome.runtime.sendMessage({ action: 'startQueue', tabId: tab.id, tabUrl: tab.url, queue });
});

btnLoad.addEventListener('click', () => {
  chrome.storage.local.get(['adherents'], result => {
    if (result.adherents?.length > 0) {
      adherents = result.adherents;
      renderList();
      showStatus(`${adherents.length} adhérent(s) chargé(s).`, 'success');
    } else {
      showStatus("Aucune donnée. Importez d'abord les adhérents.", 'error');
    }
  });
});

// Chargement auto au démarrage
chrome.storage.local.get(['adherents'], result => {
  if (result.adherents?.length > 0) {
    adherents = result.adherents;
    renderList();
  }
});
