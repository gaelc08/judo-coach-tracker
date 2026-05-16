// Données adhérents — chargées depuis chrome.storage.local
let adherents = [];

const select = document.getElementById('adherent-select');
const fiche = document.getElementById('fiche');
const btnFill = document.getElementById('btn-fill');
const btnLoad = document.getElementById('btn-load');
const status = document.getElementById('status');

function showStatus(msg, type = 'info') {
  status.textContent = msg;
  status.className = `status ${type}`;
  status.classList.remove('hidden');
}

function hideFiche() {
  fiche.classList.add('hidden');
  btnFill.disabled = true;
}

function showFiche(a) {
  document.getElementById('f-nom').textContent = a.nom || '—';
  document.getElementById('f-prenom').textContent = a.prenom || '—';
  document.getElementById('f-ddn').textContent = a.date_naissance || '—';
  document.getElementById('f-email').textContent = a.email || '—';
  document.getElementById('f-tel').textContent = a.telephone || '—';
  document.getElementById('f-adresse').textContent = a.adresse || '—';
  document.getElementById('f-cp').textContent = a.code_postal || '—';
  document.getElementById('f-ville').textContent = a.ville || '—';
  document.getElementById('f-sexe').textContent = a.sexe || '—';
  document.getElementById('f-discipline').textContent = a.discipline || '—';
  fiche.classList.remove('hidden');
  btnFill.disabled = false;
}

function populateSelect(data) {
  select.innerHTML = '<option value="">-- Sélectionner un adhérent --</option>';
  data.forEach((a, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `${a.nom} ${a.prenom}`;
    select.appendChild(opt);
  });
}

// Chargement des données depuis storage
btnLoad.addEventListener('click', () => {
  chrome.storage.local.get(['adherents'], (result) => {
    if (result.adherents && result.adherents.length > 0) {
      adherents = result.adherents;
      populateSelect(adherents);
      showStatus(`${adherents.length} adhérent(s) chargé(s).`, 'success');
    } else {
      showStatus('Aucune donnée. Importez d\'abord les adhérents.', 'error');
    }
  });
});

// Sélection d'un adhérent
select.addEventListener('change', () => {
  const idx = select.value;
  if (idx === '') { hideFiche(); return; }
  showFiche(adherents[parseInt(idx)]);
});

// Injection dans la page FFJDA
btnFill.addEventListener('click', async () => {
  const idx = select.value;
  if (idx === '') return;
  const adherent = adherents[parseInt(idx)];

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !tab.url || !tab.url.includes('moncompte.ffjudo.com')) {
    showStatus('Ouvrez d\'abord la page de saisie FFJDA.', 'error');
    return;
  }

  showStatus('Remplissage en cours...', 'info');

  chrome.tabs.sendMessage(tab.id, { action: 'fill_form', adherent }, (response) => {
    if (chrome.runtime.lastError) {
      showStatus('Erreur : rechargez la page FFJDA.', 'error');
      return;
    }
    if (!response) {
      showStatus('Pas de réponse de la page.', 'error');
      return;
    }
    const stepLabel = response.step === 1 ? 'Étape 1' : response.step === 2 ? 'Étape 2' : 'Page non reconnue';
    if (response.success) {
      showStatus(`${stepLabel} : ${response.filled} champ(s) rempli(s) ✅`, 'success');
    } else {
      showStatus(`${stepLabel} : aucun champ rempli.`, 'error');
    }
  });
});

// Chargement auto au démarrage
chrome.storage.local.get(['adherents'], (result) => {
  if (result.adherents && result.adherents.length > 0) {
    adherents = result.adherents;
    populateSelect(adherents);
  }
});
