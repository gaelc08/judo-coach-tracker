// background.js — v2026.05.16-20
// Support saisie multiple via queue

let flowState = null;
// flowState = { tabId, queue: [...], current: 0, results: [] }

function setStatus(msg, type = 'info') {
  chrome.storage.session.set({ flowStatus: { msg, type, ts: Date.now() } });
}
function setProgress(current, total) {
  chrome.storage.session.set({ queueProgress: { current, total } });
}

function detectStep(url) {
  if (!url) return null;
  if (url.includes('/achat-licence/creation-licence-club/etape_1')) return 'etape2';
  if (url.includes('/saisir-licence/etape-2'))                       return 'intermediaire';
  if (url.includes('/saisir-licence'))                               return 'etape1';
  if (url.includes('/prise-licence'))                                return 'depart';
  return null;
}

async function runInTab(tabId, fn, args = []) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: fn,
    args
  });
  return results[0].result;
}

// ---- Scripts injectés ----

function fillEtape1(adherent) {
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
  let f = 0;
  if (si('nom',       adherent.nom))                      f++;
  if (si('prenom',    adherent.prenom))                    f++;
  if (ss('sexe',      adherent.sexe === 'F' ? 'F' : 'M')) f++;
  if (si('naissance', adherent.date_naissance || ''))     f++;
  setTimeout(() => {
    const btn = Array.from(document.querySelectorAll('button[type="submit"]'))
      .find(b => b.textContent.trim().toLowerCase().includes('valider'));
    if (btn) btn.click();
  }, 400);
  return { step: 1, success: f > 0, filled: f };
}

function clickCreerLicence() {
  const btn = Array.from(document.querySelectorAll('a.big-btn'))
    .find(a => a.textContent.trim().toLowerCase().includes('créer une licence'));
  if (btn) { btn.click(); return true; }
  return false;
}

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
  if (ss('sexe', adherent.sexe === 'F' ? 'F' : 'M')) f++;

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
      if (ss('pratiques_1',     adherent.pratique || '1'))      f++;
      if (sr('type_pratique_1', adherent.type_pratique || 'L')) f++;
      sr('handicap', '0');
      if (adherent.certificat) ss('certificat', adherent.certificat);
      if (adherent.certificat === 'QU') sc('chk_questionnaire', true);
      if (sr('fonction',    adherent.fonction || '4')) f++;
      sr('souscription', '1');
      sr('newsletter',   '0');
      if (sc('assurance', true)) f++;
      sc('rgpd', true);
      return wait(400).then(() => {
        const suivant = Array.from(document.querySelectorAll('button.big-btn[type="submit"]'))
          .find(b => b.textContent.trim().toLowerCase().includes('suivant'));
        if (suivant) { suivant.click(); f++; }
        return { step: 2, success: f > 0, filled: f, submitted: !!suivant };
      });
    });
}

// ---- Queue : passer à l'adhérent suivant ----

function nextInQueue() {
  if (!flowState) return;
  flowState.current++;
  const { current, queue, tabId } = flowState;
  setProgress(current, queue.length);

  if (current >= queue.length) {
    setStatus(`✅ ${queue.length} licence(s) saisie(s) avec succès !`, 'success');
    flowState = null;
    return;
  }

  const adherent = queue[current];
  setStatus(`[${current + 1}/${queue.length}] ${adherent.nom} ${adherent.prenom}...`, 'info');
  chrome.tabs.update(tabId, {
    url: 'https://moncompte.ffjudo.com/espace-club/prise-licence/saisir-licence'
  });
}

// ---- Gestionnaire central ----

async function handleNavigation(tabId, url) {
  if (!flowState || flowState.tabId !== tabId) return;
  const step = detectStep(url);
  if (!step) return;
  const adherent = flowState.queue[flowState.current];
  const idx      = flowState.current;
  const total    = flowState.queue.length;

  if (step === 'etape1') {
    setStatus(`[${idx + 1}/${total}] ${adherent.nom} — étape 1...`, 'info');
    await new Promise(r => setTimeout(r, 800));
    try {
      const r = await runInTab(tabId, fillEtape1, [adherent]);
      if (!r || !r.success) { setStatus(`[${idx + 1}/${total}] Étape 1 : aucun champ.`, 'error'); return; }
      setStatus(`[${idx + 1}/${total}] ${adherent.nom} — étape 1 ✅ → Valider...`, 'info');
    } catch(e) { setStatus('Erreur étape 1 : ' + e.message, 'error'); }
    return;
  }

  if (step === 'intermediaire') {
    setStatus(`[${idx + 1}/${total}] ${adherent.nom} — création licence...`, 'info');
    await new Promise(r => setTimeout(r, 1000));
    try {
      const ok = await runInTab(tabId, clickCreerLicence);
      if (!ok) { setStatus('Bouton "créer une licence" introuvable.', 'error'); return; }
    } catch(e) { setStatus('Erreur intermédiaire : ' + e.message, 'error'); }
    return;
  }

  if (step === 'etape2') {
    setStatus(`[${idx + 1}/${total}] ${adherent.nom} — étape 2...`, 'info');
    await new Promise(r => setTimeout(r, 1000));
    try {
      const r = await runInTab(tabId, fillEtape2, [adherent]);
      if (!r) { setStatus(`Étape 2 [${idx + 1}] : pas de réponse.`, 'error'); return; }
      if (r.success) {
        setStatus(`[${idx + 1}/${total}] ${adherent.nom} ✅`, 'success');
        // Attendre que la FFJDA traite le submit avant de passer au suivant
        setTimeout(() => nextInQueue(), 2500);
      } else {
        setStatus(`Étape 2 [${idx + 1}] : ${r.error || 'erreur inconnue'}`, 'error');
      }
    } catch(e) { setStatus('Erreur étape 2 : ' + e.message, 'error'); }
    return;
  }
}

// ---- Listener principal ----

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url || !tab.url.includes('moncompte.ffjudo.com')) return;
  handleNavigation(tabId, tab.url);
});

// ---- Messages depuis la popup ----

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'startQueue') {
    const { tabId, tabUrl, queue } = msg;
    if (!queue || queue.length === 0) {
      setStatus('Aucun adhérent sélectionné.', 'error');
      sendResponse({ ok: false });
      return true;
    }
    flowState = { tabId, queue, current: 0, results: [] };
    setProgress(0, queue.length);
    const adherent = queue[0];
    setStatus(`[1/${queue.length}] ${adherent.nom} ${adherent.prenom}...`, 'info');
    const step = detectStep(tabUrl);
    if (step && step !== 'depart') {
      handleNavigation(tabId, tabUrl);
    } else {
      chrome.tabs.update(tabId, {
        url: 'https://moncompte.ffjudo.com/espace-club/prise-licence/saisir-licence'
      });
    }
    sendResponse({ ok: true, total: queue.length });
    return true;
  }

  if (msg.action === 'cancelFlow') {
    flowState = null;
    setStatus('Flux annulé.', 'info');
    sendResponse({ ok: true });
    return true;
  }
});
