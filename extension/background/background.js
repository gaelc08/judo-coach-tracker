// background.js — v2026.05.18-03
// Saisie nouvelle licence + renouvellement (flux complet)

let flowState = null;
// flowState = { mode, tabId, queue, current, results, _step }

function setStatus(msg, type = 'info') {
  chrome.storage.session.set({ flowStatus: { msg, type, ts: Date.now() } });
}
function setProgress(current, total) {
  chrome.storage.session.set({ queueProgress: { current, total } });
}

function detectStep(url) {
  if (!url) return null;
  // Renouvellement
  if (/\/fiche-licence\/select\//.test(url))                              return 'renew_fiche';
  if (url.includes('/achat-licence/renouvellement-licence-club/etape_1')) return 'renew_form';
  if (url.includes('/renouvellement-licencie-club'))                       return 'renew_search';
  // Nouvelle licence
  if (url.includes('/achat-licence/creation-licence-club/etape_1'))       return 'etape2';
  if (url.includes('/saisir-licence/etape-2'))                            return 'intermediaire';
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

// ----------------------------------------------------------------
// Scripts injectés dans la page
// ----------------------------------------------------------------

// Étape 1 nouvelle licence : saisie identité
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
  if (si('nom',       adherent.nom))                       f++;
  if (si('prenom',    adherent.prenom))                    f++;
  if (ss('sexe',      adherent.sexe === 'F' ? 'F' : 'M')) f++;
  if (si('naissance', adherent.date_naissance || ''))      f++;
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

// Étape 2 commune (nouvelle licence & renouvellement)
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
  if (adherent.telephone) si('portable', adherent.telephone) && f++;
  if (adherent.email) {
    si('mail',         adherent.email) && f++;
    si('mail-confirm', adherent.email) && f++;
  }
  if (ss('pratiques_1',     adherent.pratique || '1'))       f++;
  if (sr('type_pratique_1', adherent.type_pratique || 'L'))  f++;
  sr('handicap', '0');
  if (adherent.certificat) ss('certificat', adherent.certificat);
  if (adherent.certificat === 'QU') sc('chk_questionnaire', true);
  if (sr('fonction', adherent.fonction || '4'))              f++;
  sr('souscription', '1');
  sr('newsletter',   '0');
  if (sc('assurance', true)) f++;
  sc('rgpd', true);

  const cpEl  = document.querySelector('[name="cp"]');
  const hasCP = cpEl && cpEl.value && cpEl.value.trim().length > 0;

  const doAddr = () => {
    if (hasCP || !adherent.code_postal) return Promise.resolve();
    const cpTarget = adherent.ville
      ? `${adherent.code_postal} ${adherent.ville}`
      : adherent.code_postal;
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

// ----------------------------------------------------------------
// Renouvellement : scripts injectés dans chaque étape
// ----------------------------------------------------------------

/**
 * Remplit le formulaire de recherche (nom + prénom) et clique "RECHERCHER".
 * Retourne true si le bouton a été cliqué.
 */
function fillSearchForm(adherent) {
  function setField(name, val) {
    const el = document.querySelector(`[name="${name}"]`);
    if (!el) return;
    el.value = val;
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  setField('nom',    adherent.nom);
  setField('prenom', adherent.prenom);
  const btn = Array.from(document.querySelectorAll('button'))
    .find(b => b.textContent.trim().toUpperCase().includes('RECHERCHER'));
  if (btn) { btn.click(); return true; }
  return false;
}

/**
 * Cherche dans la page les liens .bluelink (ou liens ancre) correspondant
 * au licencié et retourne { found, href } ou null.
 * Utilisé en polling depuis le background.
 */
function findLicenceLink(adherent) {
  function norm(s) {
    return (s || '').toUpperCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[\s-]+/g, ' ').trim();
  }
  const nomA    = norm(adherent.nom);
  const prenomA = norm(adherent.prenom);

  // Sélectionner tous les liens qui ressemblent à des résultats de recherche
  const candidates = Array.from(document.querySelectorAll('a[href]'))
    .filter(a => a.href.includes('/fiche-licence/') || a.classList.contains('bluelink'));

  const match = candidates.find(a => {
    const t = norm(a.textContent);
    return t.includes(nomA) && t.includes(prenomA);
  });

  if (match) return { found: true, href: match.href };

  // Vérifier si un message "aucun résultat" est présent
  const noResult = Array.from(document.querySelectorAll('p, div, span'))
    .some(el => el.textContent.toLowerCase().includes('aucun licencié'));
  return { found: false, noResult };
}

/**
 * Sur la page fiche-licence/select, clique sur le bouton de renouvellement.
 * Cherche un bouton contenant "renouveler" ou "renouvellement".
 */
function clickRenewButton() {
  const candidates = Array.from(document.querySelectorAll('a, button'));
  const btn = candidates.find(el => {
    const t = el.textContent.trim().toLowerCase();
    return t.includes('renouveler') || t.includes('renouvellement');
  });
  if (btn) { btn.click(); return { clicked: true, text: btn.textContent.trim() }; }
  // Debug : renvoyer tous les boutons trouvés
  return {
    clicked: false,
    available: candidates
      .filter(el => el.textContent.trim().length > 1 && el.textContent.trim().length < 60)
      .map(el => el.textContent.trim())
      .slice(0, 10)
  };
}

// ----------------------------------------------------------------
// Polling DOM : attend que les résultats de recherche apparaissent
// ----------------------------------------------------------------

async function pollForResults(tabId, adherent, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const r = await runInTab(tabId, findLicenceLink, [adherent]);
      if (r && r.found)     return { found: true,  href: r.href };
      if (r && r.noResult)  return { found: false, noResult: true };
    } catch (e) {
      // La page est peut-être encore en train de charger
    }
  }
  return { found: false, timeout: true };
}

// ----------------------------------------------------------------
// Queue : passage à l'adhérent suivant
// ----------------------------------------------------------------

function nextInQueue() {
  if (!flowState) return;
  flowState.current++;
  const { current, queue, tabId, mode } = flowState;
  setProgress(current, queue.length);

  if (current >= queue.length) {
    const label = mode === 'renouvellement' ? 'renouvellement(s)' : 'licence(s) saisie(s)';
    setStatus(`✅ ${queue.length} ${label} avec succès !`, 'success');
    flowState = null;
    return;
  }

  const adherent = queue[current];
  setStatus(`[${current + 1}/${queue.length}] ${adherent.nom} ${adherent.prenom}...`, 'info');

  const targetUrl = mode === 'renouvellement'
    ? 'https://moncompte.ffjudo.com/espace-club/prise-licence/renouvellement-licencie-club'
    : 'https://moncompte.ffjudo.com/espace-club/prise-licence/saisir-licence';
  chrome.tabs.update(tabId, { url: targetUrl });
}

// ----------------------------------------------------------------
// Gestionnaire central (appelé à chaque navigation complète)
// ----------------------------------------------------------------

async function handleNavigation(tabId, url) {
  if (!flowState || flowState.tabId !== tabId) return;
  const step     = detectStep(url);
  if (!step) return;
  const adherent = flowState.queue[flowState.current];
  const idx      = flowState.current;
  const total    = flowState.queue.length;

  // ============================================================
  // RENOUVELLEMENT
  // ============================================================

  if (step === 'renew_search') {
    setStatus(`[${idx + 1}/${total}] ${adherent.nom} — recherche...`, 'info');
    await new Promise(r => setTimeout(r, 1000));

    // 1. Remplir et soumettre le formulaire de recherche
    try {
      const clicked = await runInTab(tabId, fillSearchForm, [adherent]);
      if (!clicked) {
        setStatus(`[${idx + 1}/${total}] Bouton Rechercher introuvable.`, 'error');
        return;
      }
    } catch (e) {
      setStatus('Erreur formulaire recherche : ' + e.message, 'error');
      return;
    }

    // 2. Polling DOM : attendre que les résultats apparaissent
    // (la page ne change pas d'URL après la recherche)
    setStatus(`[${idx + 1}/${total}] ${adherent.nom} — attente des résultats...`, 'info');
    const res = await pollForResults(tabId, adherent);

    if (res.found) {
      // 3. Naviguer directement vers la fiche (plus fiable que .click())
      setStatus(`[${idx + 1}/${total}] ${adherent.nom} — ouverture fiche...`, 'info');
      chrome.tabs.update(tabId, { url: res.href });
    } else if (res.noResult) {
      setStatus(`[${idx + 1}/${total}] ${adherent.nom} — non trouvé (pas de licence active ?).`, 'error');
      setTimeout(() => nextInQueue(), 4000);
    } else {
      setStatus(`[${idx + 1}/${total}] ${adherent.nom} — timeout recherche.`, 'error');
      setTimeout(() => nextInQueue(), 4000);
    }
    return;
  }

  if (step === 'renew_fiche') {
    // Page fiche-licence/select : cliquer le bouton Renouveler
    setStatus(`[${idx + 1}/${total}] ${adherent.nom} — fiche licence, clic renouveler...`, 'info');
    await new Promise(r => setTimeout(r, 1200));
    try {
      const r = await runInTab(tabId, clickRenewButton);
      if (r && r.clicked) {
        setStatus(`[${idx + 1}/${total}] ${adherent.nom} — renouvellement en cours...`, 'info');
      } else {
        // Bouton non trouvé — afficher ce qui est disponible pour debug
        const available = r?.available?.join(' | ') || '';
        setStatus(`[${idx + 1}/${total}] Bouton renouveler introuvable. Disponible : ${available}`, 'error');
      }
    } catch (e) {
      setStatus('Erreur fiche licence : ' + e.message, 'error');
    }
    return;
  }

  if (step === 'renew_form') {
    // Formulaire de renouvellement (/achat-licence/renouvellement-licence-club/etape_1)
    setStatus(`[${idx + 1}/${total}] ${adherent.nom} — formulaire renouvellement...`, 'info');
    await new Promise(r => setTimeout(r, 1200));
    try {
      const r = await runInTab(tabId, fillEtape2, [adherent]);
      if (!r) {
        setStatus(`Renouvellement [${idx + 1}] : pas de réponse.`, 'error');
        return;
      }
      if (r.success) {
        setStatus(`[${idx + 1}/${total}] ${adherent.nom} ✅`, 'success');
        setTimeout(() => nextInQueue(), 2500);
      } else {
        setStatus(`Renouvellement [${idx + 1}] : échec (${r.error || 'inconnu'}).`, 'error');
      }
    } catch (e) {
      setStatus('Erreur formulaire renouvellement : ' + e.message, 'error');
    }
    return;
  }

  // ============================================================
  // NOUVELLE LICENCE
  // ============================================================

  if (step === 'etape1') {
    setStatus(`[${idx + 1}/${total}] ${adherent.nom} — étape 1...`, 'info');
    await new Promise(r => setTimeout(r, 800));
    try {
      const r = await runInTab(tabId, fillEtape1, [adherent]);
      if (!r || !r.success) {
        setStatus(`[${idx + 1}/${total}] Étape 1 : aucun champ rempli.`, 'error');
        return;
      }
      setStatus(`[${idx + 1}/${total}] ${adherent.nom} — étape 1 ✅ → Validation...`, 'info');
    } catch (e) { setStatus('Erreur étape 1 : ' + e.message, 'error'); }
    return;
  }

  if (step === 'intermediaire') {
    setStatus(`[${idx + 1}/${total}] ${adherent.nom} — création licence...`, 'info');
    await new Promise(r => setTimeout(r, 1000));
    try {
      const ok = await runInTab(tabId, clickCreerLicence);
      if (!ok) { setStatus('Bouton "créer une licence" introuvable.', 'error'); return; }
    } catch (e) { setStatus('Erreur intermédiaire : ' + e.message, 'error'); }
    return;
  }

  if (step === 'etape2') {
    setStatus(`[${idx + 1}/${total}] ${adherent.nom} — étape 2...`, 'info');
    await new Promise(r => setTimeout(r, 1200));
    try {
      const r = await runInTab(tabId, fillEtape2, [adherent]);
      if (!r) {
        setStatus(`Étape 2 [${idx + 1}] : pas de réponse.`, 'error');
        return;
      }
      if (r.success) {
        setStatus(`[${idx + 1}/${total}] ${adherent.nom} ✅`, 'success');
        setTimeout(() => nextInQueue(), 2500);
      } else {
        setStatus(`Étape 2 [${idx + 1}] : échec (${r.error || 'inconnu'}).`, 'error');
      }
    } catch (e) { setStatus('Erreur étape 2 : ' + e.message, 'error'); }
    return;
  }
}

// ----------------------------------------------------------------
// Listener principal : détection des navigations
// ----------------------------------------------------------------

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url || !tab.url.includes('moncompte.ffjudo.com')) return;
  handleNavigation(tabId, tab.url);
});

// ----------------------------------------------------------------
// Messages depuis la popup
// ----------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

  if (msg.action === 'startQueue' || msg.action === 'startRenewalQueue') {
    const { tabId, tabUrl, queue } = msg;
    const mode = msg.action === 'startRenewalQueue' ? 'renouvellement' : 'nouvelle';
    if (!queue || queue.length === 0) {
      setStatus('Aucun adhérent sélectionné.', 'error');
      sendResponse({ ok: false });
      return true;
    }
    flowState = { mode, tabId, queue, current: 0, results: [] };
    setProgress(0, queue.length);
    const adherent = queue[0];
    setStatus(`[1/${queue.length}] ${adherent.nom} ${adherent.prenom}...`, 'info');

    const targetUrl = mode === 'renouvellement'
      ? 'https://moncompte.ffjudo.com/espace-club/prise-licence/renouvellement-licencie-club'
      : 'https://moncompte.ffjudo.com/espace-club/prise-licence/saisir-licence';

    if (mode === 'renouvellement') {
      chrome.tabs.update(tabId, { url: targetUrl });
    } else {
      const step = detectStep(tabUrl);
      if (step && step !== 'depart') {
        handleNavigation(tabId, tabUrl);
      } else {
        chrome.tabs.update(tabId, { url: targetUrl });
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
