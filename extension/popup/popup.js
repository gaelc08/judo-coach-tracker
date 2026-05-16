// popup.js — v2026.05.16-15
// Flux automatique : étape1 → intermédiaire → étape2
let adherents = [];
let activeAdherent = null;
let pollTimer = null;

const select  = document.getElementById('adherent-select');
const fiche   = document.getElementById('fiche');
const btnFill = document.getElementById('btn-fill');
const btnLoad = document.getElementById('btn-load');
const status  = document.getElementById('status');

// -----------------------------------------------------------------------
// UI helpers
// -----------------------------------------------------------------------
function showStatus(msg, type = 'info') {
  status.textContent = msg;
  status.className = `status ${type}`;
  status.classList.remove('hidden');
}
function hideFiche() { fiche.classList.add('hidden'); btnFill.disabled = true; }
function showFiche(a) {
  document.getElementById('f-nom').textContent        = a.nom || '—';
  document.getElementById('f-prenom').textContent     = a.prenom || '—';
  document.getElementById('f-ddn').textContent        = a.date_naissance || '—';
  document.getElementById('f-email').textContent      = a.email || '—';
  document.getElementById('f-tel').textContent        = a.telephone || '—';
  document.getElementById('f-adresse').textContent    = a.adresse || '—';
  document.getElementById('f-cp').textContent         = a.code_postal || '—';
  document.getElementById('f-ville').textContent      = a.ville || '—';
  document.getElementById('f-sexe').textContent       = a.sexe || '—';
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

// -----------------------------------------------------------------------
// Détection de l'étape courante selon l'URL
// -----------------------------------------------------------------------
function detectStep(url) {
  if (url.includes('/achat-licence/creation-licence-club/etape_1')) return 'etape2';
  if (url.includes('/saisir-licence/etape-2'))                       return 'intermediaire';
  if (url.includes('/saisir-licence'))                               return 'etape1';
  if (url.includes('/prise-licence'))                                return 'depart';
  return null;
}

// -----------------------------------------------------------------------
// Arrêter le polling
// -----------------------------------------------------------------------
function stopPoll() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

// -----------------------------------------------------------------------
// pageScript : remplissage étape 1 (world MAIN)
// -----------------------------------------------------------------------
function fillEtape1(adherent) {
  let f = 0;
  function si(name, val) {
    const el = document.querySelector(`[name="${name}"]`);
    if (!el || val == null) return false;
    el.value = val;
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  function ss(name, val) {
    const el = document.querySelector(`[name="${name}"]`);
    if (!el || val == null) return false;
    el.value = val;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  if (si('nom',       adherent.nom))                       f++;
  if (si('prenom',    adherent.prenom))                     f++;
  if (ss('sexe',      adherent.sexe === 'F' ? 'F' : 'M')) f++;
  if (si('naissance', adherent.date_naissance || ''))      f++;
  return { step: 1, success: f > 0, filled: f };
}

// -----------------------------------------------------------------------
// pageScript : clic sur "Je souhaite créer une licence" (world MAIN)
// -----------------------------------------------------------------------
function clickCreerLicence() {
  const btn = Array.from(document.querySelectorAll('a.big-btn'))
    .find(a => a.textContent.trim().toLowerCase().includes('créer une licence'));
  if (btn) { btn.click(); return true; }
  return false;
}

// -----------------------------------------------------------------------
// pageScript : remplissage étape 2 (world MAIN)
// -----------------------------------------------------------------------
function fillEtape2(adherent) {
  function norm(s) { return (s || '').toUpperCase().replace(/-/g, ' '); }
  function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
  function si(name, val) {
    const el = document.querySelector(`[name="${name}"]`);
    if (!el || val == null) return false;
    el.value = val;
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  function ss(name, val) {
    const el = document.querySelector(`[name="${name}"]`);
    if (!el || val == null) return false;
    el.value = val;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  function sr(name, val) {
    const el = document.querySelector(`input[name="${name}"][value="${val}"]`);
    if (!el) return false;
    el.checked = true;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  function sc(id, checked) {
    const el = document.getElementById(id) || document.querySelector(`input[name="${id}"]`);
    if (!el) return false;
    el.checked = checked;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  function clickOpt(el) {
    ['mouseenter','mouseover','mousedown','mouseup','click'].forEach(type =>
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0 }))
    );
  }
  function fillSelect2(selectName, searchText, targetText) {
    return new Promise(resolve => {
      jQuery('.select2-container--open [name]').each(function() {
        try { jQuery(this).select2('close'); } catch(e) {}
      });
      const $sel = jQuery(`[name="${selectName}"]`);
      if (!$sel.length || !$sel.data('select2')) { resolve(false); return; }
      setTimeout(() => {
        $sel.select2('open');
        setTimeout(() => {
          const input = document.querySelector('.select2-container--open .select2-search__field');
          if (!input) { $sel.select2('close'); resolve(false); return; }
          input.focus(); input.value = searchText;
          input.dispatchEvent(new Event('input',         { bubbles: true }));
          input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
          setTimeout(() => {
            const opts = document.querySelectorAll(
              '.select2-container--open .select2-results__option:not(.select2-results__option--disabled):not(.select2-results__option--loading)'
            );
            const nt = norm(targetText);
            let match = Array.from(opts).find(o => norm(o.textContent).includes(nt));
            if (!match && opts[0]) match = opts[0];
            if (match) { clickOpt(match); setTimeout(() => resolve(true), 400); }
            else { $sel.select2('close'); resolve(false); }
          }, 1500);
        }, 500);
      }, 200);
    });
  }

  let f = 0;
  if (si('nom',            adherent.nom))           f++;
  if (si('prenom',         adherent.prenom))         f++;
  if (si('date_naissance', adherent.date_naissance)) f++;
  if (si('portable',       adherent.telephone))      f++;
  if (si('mail',           adherent.email))          f++;
  if (si('mail-confirm',   adherent.email))          f++;
  if (ss('sexe',           adherent.sexe === 'F' ? 'F' : 'M')) f++;

  const cpTarget = adherent.ville
    ? `${adherent.code_postal} ${adherent.ville}`
    : adherent.code_postal;

  return fillSelect2('cp', adherent.code_postal, cpTarget)
    .then(ok => { if (ok) f++; return wait(1200); })
    .then(() => {
      if (!adherent.adresse) return;
      return fillSelect2('adresse', adherent.adresse, adherent.adresse)
        .then(ok => { if (ok) f++; });
    })
    .then(() => {
      if (ss('pratiques_1',    adherent.pratique || '1'))      f++;
      if (sr('type_pratique_1', adherent.type_pratique || 'L')) f++;
      sr('handicap', '0');
      if (adherent.certificat) ss('certificat', adherent.certificat);
      if (adherent.certificat === 'QU') sc('chk_questionnaire', true);
      if (sr('fonction',    adherent.fonction || '4'))  f++;
      sr('souscription', '1');
      sr('newsletter',   '0');
      if (sc('assurance', true)) f++;
      sc('rgpd', true);
      return { step: 2, success: f > 0, filled: f };
    });
}

// -----------------------------------------------------------------------
// Exécuter un script dans l'onglet actif (world MAIN)
// -----------------------------------------------------------------------
async function runInTab(tab, fn, args = []) {
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: 'MAIN',
    func: fn,
    args
  });
  return results[0].result;
}

// -----------------------------------------------------------------------
// Démarrage du flux automatique
// -----------------------------------------------------------------------
async function startFlow(tab, adherent) {
  stopPoll();
  activeAdherent = adherent;

  const url = tab.url;
  const step = detectStep(url);

  // --- ÉTAPE 1 ---
  if (step === 'etape1') {
    showStatus('Étape 1 : remplissage...', 'info');
    const r = await runInTab(tab, fillEtape1, [adherent]);
    if (!r || !r.success) { showStatus('Étape 1 : aucun champ rempli.', 'error'); return; }
    showStatus(`Étape 1 : ${r.filled} champ(s) ✅ — Clique sur "Valider" puis attends...`, 'info');
    // Surveiller la page intermédiaire
    watchForStep(tab.id, 'intermediaire');
    return;
  }

  // --- PAGE INTERMÉDIAIRE ---
  if (step === 'intermediaire') {
    showStatus('Page intermédiaire — clic sur "Je souhaite créer une licence"...', 'info');
    await new Promise(r => setTimeout(r, 600));
    const ok = await runInTab(tab, clickCreerLicence);
    if (!ok) { showStatus('Bouton "créer une licence" introuvable.', 'error'); return; }
    showStatus('Navigation vers étape 2...', 'info');
    watchForStep(tab.id, 'etape2');
    return;
  }

  // --- ÉTAPE 2 ---
  if (step === 'etape2') {
    showStatus('Étape 2 : remplissage...', 'info');
    await new Promise(r => setTimeout(r, 800));
    const r = await runInTab(tab, fillEtape2, [adherent]);
    if (!r) { showStatus('Étape 2 : pas de réponse.', 'error'); return; }
    showStatus(
      r.success ? `Étape 2 : ${r.filled} champ(s) rempli(s) ✅` : `Étape 2 : ${r.error || 'aucun champ.'}`,
      r.success ? 'success' : 'error'
    );
    activeAdherent = null;
    return;
  }

  // --- PAGE DE DÉPART : naviguer vers saisir-licence ---
  if (step === 'depart') {
    showStatus('Navigation vers "Saisir une licence"...', 'info');
    await chrome.tabs.update(tab.id, { url: 'https://moncompte.ffjudo.com/espace-club/prise-licence/saisir-licence' });
    watchForStep(tab.id, 'etape1');
    return;
  }

  showStatus('Page FFJDA non reconnue. Va sur prise-licence.', 'error');
}

// -----------------------------------------------------------------------
// Surveiller un changement d'URL (polling 500ms, timeout 60s)
// -----------------------------------------------------------------------
function watchForStep(tabId, targetStep) {
  stopPoll();
  const deadline = Date.now() + 60000;
  pollTimer = setInterval(async () => {
    if (!activeAdherent) { stopPoll(); return; }
    if (Date.now() > deadline) {
      stopPoll();
      showStatus(`Timeout : étape "${targetStep}" non atteinte.`, 'error');
      return;
    }
    let tab;
    try { [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); }
    catch(e) { stopPoll(); return; }
    if (!tab || tab.id !== tabId) return;

    const current = detectStep(tab.url || '');
    if (current === targetStep) {
      stopPoll();
      // Petite pause pour que la page soit stable
      await new Promise(r => setTimeout(r, 600));
      await startFlow(tab, activeAdherent);
    }
  }, 500);
}

// -----------------------------------------------------------------------
// Bouton Remplir
// -----------------------------------------------------------------------
btnFill.addEventListener('click', async () => {
  const idx = select.value;
  if (idx === '') return;
  const adherent = adherents[parseInt(idx)];

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !tab.url.includes('moncompte.ffjudo.com')) {
    showStatus("Ouvrez d'abord moncompte.ffjudo.com.", 'error');
    return;
  }

  await startFlow(tab, adherent);
});

// -----------------------------------------------------------------------
// Chargement select + events
// -----------------------------------------------------------------------
btnLoad.addEventListener('click', () => {
  chrome.storage.local.get(['adherents'], result => {
    if (result.adherents?.length > 0) {
      adherents = result.adherents;
      populateSelect(adherents);
      showStatus(`${adherents.length} adhérent(s) chargé(s).`, 'success');
    } else {
      showStatus("Aucune donnée. Importez d'abord les adhérents.", 'error');
    }
  });
});

select.addEventListener('change', () => {
  const idx = select.value;
  if (idx === '') { hideFiche(); return; }
  showFiche(adherents[parseInt(idx)]);
});

chrome.storage.local.get(['adherents'], result => {
  if (result.adherents?.length > 0) {
    adherents = result.adherents;
    populateSelect(adherents);
  }
});
