// popup.js
let adherents = [];
let pendingAdherent = null; // adhérent en attente pour l'étape 2

const select   = document.getElementById('adherent-select');
const fiche    = document.getElementById('fiche');
const btnFill  = document.getElementById('btn-fill');
const btnLoad  = document.getElementById('btn-load');
const status   = document.getElementById('status');

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

btnLoad.addEventListener('click', () => {
  chrome.storage.local.get(['adherents'], (result) => {
    if (result.adherents && result.adherents.length > 0) {
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

// -----------------------------------------------------------------------
// Observer : détecte le passage étape 1 → 2 dans la page FFJDA
// -----------------------------------------------------------------------
function observerScript() {
  // Nettoyage d'un éventuel observer précédent
  if (window.__jccObserver) { window.__jccObserver.disconnect(); window.__jccObserver = null; }

  const obs = new MutationObserver(() => {
    if (document.querySelector('[name="date_naissance"]')) {
      obs.disconnect();
      window.__jccObserver = null;
      // Signale à la popup que l'étape 2 est prête
      window.dispatchEvent(new CustomEvent('jcc_step2_ready'));
    }
  });

  obs.observe(document.body, { childList: true, subtree: true });
  window.__jccObserver = obs;
}

// -----------------------------------------------------------------------
// pageScript : remplissage dans world MAIN
// -----------------------------------------------------------------------
function pageScript(adherent) {
  function norm(s) { return (s || '').toUpperCase().replace(/-/g, ' '); }
  function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

  function setInput(name, value) {
    const el = document.querySelector(`[name="${name}"]`);
    if (!el || value == null) return false;
    el.value = value;
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  function setSelect(name, value) {
    const el = document.querySelector(`[name="${name}"]`);
    if (!el || value == null) return false;
    el.value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  function setRadio(name, value) {
    const el = document.querySelector(`input[name="${name}"][value="${value}"]`);
    if (!el) return false;
    el.checked = true;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  function setCheckbox(id, checked) {
    const el = document.getElementById(id) || document.querySelector(`input[name="${id}"]`);
    if (!el) return false;
    el.checked = checked;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  function clickOption(el) {
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseover',  { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mousedown',  { bubbles: true, button: 0 }));
    el.dispatchEvent(new MouseEvent('mouseup',    { bubbles: true, button: 0 }));
    el.dispatchEvent(new MouseEvent('click',      { bubbles: true, button: 0 }));
  }
  function fillSelect2(selectName, searchText, targetText) {
    return new Promise((resolve) => {
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
          input.focus();
          input.value = searchText;
          input.dispatchEvent(new Event('input',         { bubbles: true }));
          input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
          setTimeout(() => {
            const opts = document.querySelectorAll(
              '.select2-container--open .select2-results__option:not(.select2-results__option--disabled):not(.select2-results__option--loading)'
            );
            const normTarget = norm(targetText);
            let match = Array.from(opts).find(o => norm(o.textContent).includes(normTarget));
            if (!match && opts[0]) match = opts[0];
            if (match) { clickOption(match); setTimeout(() => resolve(true), 400); }
            else { $sel.select2('close'); resolve(false); }
          }, 1500);
        }, 500);
      }, 200);
    });
  }

  const hasNaissance     = !!document.querySelector('[name="naissance"]');
  const hasDateNaissance = !!document.querySelector('[name="date_naissance"]');
  const step = (hasNaissance && !hasDateNaissance) ? 1 : hasDateNaissance ? 2 : 0;

  if (step === 1) {
    let f = 0;
    if (setInput('nom',       adherent.nom))                       f++;
    if (setInput('prenom',    adherent.prenom))                     f++;
    if (setSelect('sexe',     adherent.sexe === 'F' ? 'F' : 'M')) f++;
    if (setInput('naissance', adherent.date_naissance || ''))      f++;
    return Promise.resolve({ step: 1, success: f > 0, filled: f });
  }

  if (step === 2) {
    let f = 0;
    if (setInput('nom',            adherent.nom))           f++;
    if (setInput('prenom',         adherent.prenom))         f++;
    if (setInput('date_naissance', adherent.date_naissance)) f++;
    if (setInput('portable',       adherent.telephone))      f++;
    if (setInput('mail',           adherent.email))          f++;
    if (setInput('mail-confirm',   adherent.email))          f++;
    if (setSelect('sexe',          adherent.sexe === 'F' ? 'F' : 'M')) f++;
    const cpTarget = adherent.ville
      ? `${adherent.code_postal} ${adherent.ville}`
      : adherent.code_postal;
    return fillSelect2('cp', adherent.code_postal, cpTarget)
      .then(cpOk => { if (cpOk) f++; return wait(1200); })
      .then(() => {
        if (!adherent.adresse) return;
        return fillSelect2('adresse', adherent.adresse, adherent.adresse)
          .then(adOk => { if (adOk) f++; });
      })
      .then(() => {
        if (setSelect('pratiques_1',    adherent.pratique || '1'))      f++;
        if (setRadio('type_pratique_1', adherent.type_pratique || 'L')) f++;
        setRadio('handicap', '0');
        if (adherent.certificat) setSelect('certificat', adherent.certificat);
        if (adherent.certificat === 'QU' && setCheckbox('chk_questionnaire', true)) f++;
        if (setRadio('fonction',        adherent.fonction || '4'))      f++;
        setRadio('souscription', '1');
        setRadio('newsletter',   '0');
        if (setCheckbox('assurance', true)) f++;
        setCheckbox('rgpd', true);
        return { step: 2, success: f > 0, filled: f };
      });
  }

  return Promise.resolve({ step: 0, success: false, filled: 0, error: 'Page non reconnue' });
}

// -----------------------------------------------------------------------
// Exécution du remplissage sur l'onglet actif
// -----------------------------------------------------------------------
async function runFill(tab, adherent) {
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: 'MAIN',
    func: pageScript,
    args: [adherent]
  });
  return results[0].result;
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
    showStatus("Ouvrez d'abord la page de saisie FFJDA.", 'error');
    return;
  }

  showStatus('Remplissage en cours...', 'info');

  try {
    const r = await runFill(tab, adherent);
    if (!r) { showStatus('Pas de réponse.', 'error'); return; }

    if (r.step === 1 && r.success) {
      showStatus(`Étape 1 : ${r.filled} champ(s) ✅ — En attente de l'étape 2...`, 'info');
      pendingAdherent = adherent;

      // Installer l'observer dans la page
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        func: observerScript
      });

      // Écouter l'événement jcc_step2_ready via le content script
      // On utilise un polling léger côté popup (toutes les 500ms, max 60s)
      const pollStart = Date.now();
      const poll = setInterval(async () => {
        if (!pendingAdherent) { clearInterval(poll); return; }
        if (Date.now() - pollStart > 60000) {
          clearInterval(poll);
          showStatus('Timeout : étape 2 non détectée.', 'error');
          pendingAdherent = null;
          return;
        }
        // Vérifier si l'étape 2 est prête
        const check = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          world: 'MAIN',
          func: () => !!document.querySelector('[name="date_naissance"]')
        });
        if (check[0].result) {
          clearInterval(poll);
          const a = pendingAdherent;
          pendingAdherent = null;
          showStatus('Étape 2 détectée — remplissage...', 'info');
          // Petit délai pour laisser la page se stabiliser
          await new Promise(res => setTimeout(res, 800));
          try {
            const r2 = await runFill(tab, a);
            if (!r2) { showStatus('Pas de réponse étape 2.', 'error'); return; }
            showStatus(
              r2.success
                ? `Étape 2 : ${r2.filled} champ(s) rempli(s) ✅`
                : `Étape 2 : ${r2.error || 'aucun champ rempli.'}`,
              r2.success ? 'success' : 'error'
            );
          } catch(e) { showStatus('Erreur étape 2 : ' + e.message, 'error'); }
        }
      }, 500);

    } else {
      const stepLabel = r.step === 2 ? 'Étape 2' : 'Page';
      showStatus(
        r.success
          ? `${stepLabel} : ${r.filled} champ(s) rempli(s) ✅`
          : `${stepLabel} : ${r.error || 'aucun champ rempli.'}`,
        r.success ? 'success' : 'error'
      );
    }
  } catch (err) {
    showStatus('Erreur : ' + err.message, 'error');
  }
});

// Chargement auto
chrome.storage.local.get(['adherents'], (result) => {
  if (result.adherents && result.adherents.length > 0) {
    adherents = result.adherents;
    populateSelect(adherents);
  }
});
