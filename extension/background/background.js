// background.js — v2026.05.18-01
// Saisie nouvelle licence + renouvellement

let flowState = null;
// flowState = { mode: 'nouvelle'|'renouvellement', tabId, queue, current, results }

function setStatus(msg, type = 'info') {
  chrome.storage.session.set({ flowStatus: { msg, type, ts: Date.now() } });
}
function setProgress(current, total) {
  chrome.storage.session.set({ queueProgress: { current, total } });
}

function detectStep(url) {
  if (!url) return null;
  // Renouvellement
  if (url.includes('/achat-licence/renouvellement-licence-club/etape_1')) return 'renew_form';
  if (url.includes('/renouvellement-licencie-club'))                       return 'renew_search';
  // Nouvelle licence
  if (url.includes('/achat-licence/creation-licence-club/etape_1'))        return 'etape2';
  if (url.includes('/saisir-licence/etape-2'))                             return 'intermediaire';
  if (url.includes('/saisir-licence'))                                     return 'etape1';
  if (url.includes('/prise-licence'))                                      return 'depart';
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
  // Remplir uniquement les champs vides ou à mettre à jour
  if (adherent.telephone) si('portable', adherent.telephone) && f++;
  if (adherent.email) {
    si('mail',         adherent.email) && f++;
    si('mail-confirm', adherent.email) && f++;
  }
  // Toujours remplir les champs obligatoires de pratique/fonction
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

  // CP/adresse uniquement si pas déjà remplis
  const cpEl = document.querySelector('[name="cp"]');
  const hasCP = cpEl && cpEl.value && cpEl.value.trim().length > 0;

  const doAddr = () => {
    if (hasCP || !adherent.code_postal) return Promise.resolve();
    const cpTarget = adherent.ville ? `${adherent.code_postal} ${adherent.ville}` : adherent.code_postal;
    return fillSelect2('cp', adherent.code_postal, cpTarget)
      .then(ok => { if (ok) f++; return wait(1200); })
      .then(() => {
        if (!adherent.adresse) return;
        return fillSelect2('adresse', adherent.adresse, adherent.adresse)
          .then(ok => { if (ok) f++; });
      });
  };

  return doAddr().then(() => wait(400)).then(() => {
    const suivant = Array.from(document.querySelectorAll('button.big-btn[type="submit"]'))
      .find(b => b.textContent.trim().toLowerCase().includes('suivant'));
    if (suivant) { suivant.click(); f++; }
    return { step: 2, success: f > 0, filled: f, submitted: !!suivant };
  });
}

// ---- Script renouvellement : recherche + clic sur le lien NOM Prénom ----

function searchAndClickRenew(adherent) {
  function norm(s) { return (s || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim(); }

  // Remplir le formulaire de recherche
  function setField(name, val) {
    const el = document.querySelector(`[name="${name}"]`);
    if (!el) return;
    el.value = val;
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // S'il y a déjà des résultats affichés (retour de recherche), chercher le lien
  const links = Array.from(document.querySelectorAll('a.bluelink'));
  if (links.length > 0) {
    const nomA = norm(adherent.nom);
    const prenomA = norm(adherent.prenom);
    const match = links.find(a => {
      const t = norm(a.textContent);
      return t.includes(nomA) && t.includes(prenomA);
    });
    if (match) { match.click(); return { found: true, clicked: true }; }
    return { found: false, clicked: false, msg: 'Licencié non trouvé dans les résultats' };
  }

  // Sinon, remplir et soumettre la recherche
  setField('nom',    adherent.nom);
  setField('prenom', adherent.prenom);
  setTimeout(() => {
    const btn = Array.from(document.querySelectorAll('button'))
      .find(b => b.textContent.trim().toUpperCase().includes('RECHERCHER'));
    if (btn) btn.click();
  }, 300);
  return { found: false, clicked: false, searching: true };
}

// ---- Queue : passer à l'adhérent suivant ----

function nextInQueue() {
  if (!flowState) return;
  flowState.current++;
  const { current, queue, tabId } = flowState;
  setProgress(current, queue.length);

  if (current >= queue.length) {
    const label = flowState.mode === 'renouvellement' ? 'renouvellement(s)' : 'licence(s) saisie(s)';
    setStatus(`✅ ${queue.length} ${label} avec succès !`, 'success');
    flowState = null;
    return;
  }

  const adherent = queue[current];
  setStatus(`[${current + 1}/${queue.length}] ${adherent.nom} ${adherent.prenom}...`, 'info');

  if (flowState.mode === 'renouvellement') {
    chrome.tabs.update(tabId, {
      url: 'https://moncompte.ffjudo.com/espace-club/prise-licence/renouvellement-licencie-club'
    });
  } else {
    chrome.tabs.update(tabId, {
      url: 'https://moncompte.ffjudo.com/espace-club/prise-licence/saisir-licence'
    });
  }
}

// ---- Gestionnaire central ----

async function handleNavigation(tabId, url) {
  if (!flowState || flowState.tabId !== tabId) return;
  const step = detectStep(url);
  if (!step) return;
  const adherent = flowState.queue[flowState.current];
  const idx      = flowState.current;
  const total    = flowState.queue.length;

  // === RENOUVELLEMENT ===

  if (step === 'renew_search') {
    setStatus(`[${idx + 1}/${total}] ${adherent.nom} — recherche...`, 'info');
    await new Promise(r => setTimeout(r, 1000));
    try {
      const r = await runInTab(tabId, searchAndClickRenew, [adherent]);
      if (r && r.searching) {
        // La recherche a été lancée, attendre le rechargement avec résultats
        flowState._renewSearching = true;
      } else if (r && r.clicked) {
        setStatus(`[${idx + 1}/${total}] ${adherent.nom} — trouvé, chargement fiche...`, 'info');
      } else {
        setStatus(`[${idx + 1}/${total}] ${adherent.nom} — ${r?.msg || 'introuvable'}`, 'error');
        // Passer au suivant après 3s
        setTimeout(() => nextInQueue(), 3000);
      }
    } catch(e) { setStatus('Erreur recherche : ' + e.message, 'error'); }
    return;
  }

  if (step === 'renew_form') {
    // Résultats de recherche chargés OU formulaire de renouvellement
    if (flowState._renewSearching) {
      // On est sur la page résultats — chercher et cliquer le lien
      flowState._renewSearching = false;
      setStatus(`[${idx + 1}/${total}] ${adherent.nom} — sélection dans les résultats...`, 'info');
      await new Promise(r => setTimeout(r, 800));
      // Note: l'URL contient encore /renouvellement-licencie-club après la recherche
      // On va détecter si c'est la liste ou le formulaire
      try {
        const r = await runInTab(tabId, searchAndClickRenew, [adherent]);
        if (r && r.clicked) {
          setStatus(`[${idx + 1}/${total}] ${adherent.nom} — trouvé, chargement...`, 'info');
        } else {
          setStatus(`[${idx + 1}/${total}] ${adherent.nom} — ${r?.msg || 'introuvable dans les résultats'}`, 'error');
          setTimeout(() => nextInQueue(), 3000);
        }
      } catch(e) { setStatus('Erreur sélection : ' + e.message, 'error'); }
      return;
    }

    // Formulaire de renouvellement (etape_1) — même que fillEtape2
    setStatus(`[${idx + 1}/${total}] ${adherent.nom} — formulaire renouvellement...`, 'info');
    await new Promise(r => setTimeout(r, 1000));
    try {
      const r = await runInTab(tabId, fillEtape2, [adherent]);
      if (!r) { setStatus(`Renouvellement [${idx + 1}] : pas de réponse.`, 'error'); return; }
      if (r.success) {
        setStatus(`[${idx + 1}/${total}] ${adherent.nom} ✅`, 'success');
        setTimeout(() => nextInQueue(), 2500);
      } else {
        setStatus(`Renouvellement [${idx + 1}] : ${r.error || 'erreur inconnue'}`, 'error');
      }
    } catch(e) { setStatus('Erreur formulaire renouvellement : ' + e.message, 'error'); }
    return;
  }

  // === NOUVELLE LICENCE ===

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

  if (msg.action === 'startQueue' || msg.action === 'startRenewalQueue') {
    const { tabId, tabUrl, queue } = msg;
    const mode = msg.action === 'startRenewalQueue' ? 'renouvellement' : 'nouvelle';
    if (!queue || queue.length === 0) {
      setStatus('Aucun adhérent sélectionné.', 'error');
      sendResponse({ ok: false });
      return true;
    }
    flowState = { mode, tabId, queue, current: 0, results: [], _renewSearching: false };
    setProgress(0, queue.length);
    const adherent = queue[0];
    setStatus(`[1/${queue.length}] ${adherent.nom} ${adherent.prenom}...`, 'info');

    if (mode === 'renouvellement') {
      chrome.tabs.update(tabId, {
        url: 'https://moncompte.ffjudo.com/espace-club/prise-licence/renouvellement-licencie-club'
      });
    } else {
      const step = detectStep(tabUrl);
      if (step && step !== 'depart') {
        handleNavigation(tabId, tabUrl);
      } else {
        chrome.tabs.update(tabId, {
          url: 'https://moncompte.ffjudo.com/espace-club/prise-licence/saisir-licence'
        });
      }
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
