// ==UserScript==
// @name         JC Cattenom → CEA URSSAF Autofill
// @namespace    https://github.com/gaelc08/jccattenom-app
// @version      2.10.1
// @description  Lit la synthèse du mois depuis l'app JC Cattenom et pré-remplit le portail CEA URSSAF
// @author       Gaël CANTARERO
// @match        *://*/*
// @updateURL    https://raw.githubusercontent.com/gaelc08/jccattenom-app/main/scripts/cea-autofill.user.js
// @downloadURL  https://raw.githubusercontent.com/gaelc08/jccattenom-app/main/scripts/cea-autofill.user.js
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  if (!location.hostname.includes('cea.urssaf.fr')) return;

  const STORAGE_KEY = 'jcc_cea_payload';

  let _memStore = null;
  function storageGet() {
    try { return localStorage.getItem(STORAGE_KEY); } catch(e) { return _memStore; }
  }
  function storageSet(val) {
    try { localStorage.setItem(STORAGE_KEY, val); } catch(e) {}
    _memStore = val;
  }

  const style = document.createElement('style');
  style.textContent = `
    #jcc-panel {
      position: fixed; bottom: 20px; right: 20px; z-index: 99999;
      background: #1c2b3a; color: #e8f0f7; border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4); font-family: 'Segoe UI', sans-serif;
      font-size: 13px; min-width: 290px; max-width: 350px; overflow: hidden;
    }
    #jcc-panel-header {
      background: #0d3b5e; padding: 10px 14px; display: flex;
      align-items: center; justify-content: space-between; cursor: pointer; user-select: none;
    }
    #jcc-panel-header span { font-weight: 600; font-size: 14px; color: #ffffff; }
    #jcc-panel-body { padding: 12px 14px; }
    #jcc-panel table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
    #jcc-panel tr { border-bottom: 1px solid rgba(255,255,255,0.06); }
    #jcc-panel tr:last-child { border-bottom: none; }
    #jcc-panel td { padding: 5px 2px; }
    #jcc-panel td:first-child { color: #a8c8e8; width: 55%; font-size: 12px; }
    #jcc-panel td:last-child { text-align: right; font-weight: 700; color: #ffffff; font-size: 13px; }
    .jcc-btn {
      width: 100%; border: none; border-radius: 7px; padding: 8px;
      font-size: 13px; font-weight: 600; cursor: pointer;
      transition: background 0.2s; margin-bottom: 6px;
    }
    #jcc-import-btn  { background: #2d4a3e; color: #7ec8a0; }
    #jcc-import-btn:hover { background: #3a5e4f; }
    #jcc-step-btn { background: #1a6fa8; color: white; }
    #jcc-step-btn:hover { background: #1e84c8; }
    #jcc-step-btn:disabled { background: #555; cursor: default; }
    #jcc-status { margin-top: 6px; font-size: 11px; color: #7ec8a0; min-height: 16px; text-align: center; }
    #jcc-status.error { color: #f08080; }
    .jcc-badge { background: #e67e22; color: white; border-radius: 9999px; padding: 1px 7px; font-size: 11px; font-weight: 700; }
    .jcc-step-label { font-size: 11px; color: #a8c8e8; margin-bottom: 4px; text-align: center; }
    .jcc-divider { border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 8px 0; }
    .jcc-total td:first-child { color: #7ec8a0 !important; font-weight: 600; }
    .jcc-total td:last-child  { color: #7ec8a0 !important; font-size: 14px !important; }
  `;
  document.head.appendChild(style);

  let payload = null;
  let _lastStep = null;

  function loadPayload() {
    try { const r = storageGet(); if (r) payload = JSON.parse(r); } catch(e) { payload = null; }
  }
  function savePayload(data) {
    payload = data;
    storageSet(JSON.stringify(data));
  }

  function detectStep() {
    if (
      document.getElementById('inRemunerationEuro') ||
      document.getElementById('inNombreHeures')      ||
      document.getElementById('inPayeSalaire')
    ) return 'step3';

    if (
      document.getElementById('btnSuivant') &&
      document.getElementById('prestation.salaire1') &&
      !document.querySelector('select')
    ) return 'step2';

    const hasSelectOrDate = !!(
      document.querySelector('select') ||
      Array.from(document.querySelectorAll('input[type="text"]'))
        .some(i => /date|du|au|période|periode|debut|fin/i.test(i.name + i.id + i.placeholder))
    );
    if (hasSelectOrDate) return 'step1';

    return 'other';
  }

  function fillInput(el, value) {
    if (!el || value == null) return false;
    el.value = String(value);
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function fillNumeric(el, value) {
    if (!el || value == null) return false;
    return fillInput(el, String(value).replace('.', ','));
  }

  function toHHMN(heures) {
    const total = parseFloat(String(heures).replace(',', '.'));
    if (isNaN(total)) return String(heures);
    const h = Math.floor(total);
    const mn = Math.round((total - h) * 60);
    return `${h}:${String(mn).padStart(2, '0')}`;
  }

  function datePaiement(mois) {
    const [year, month] = mois.split('-').map(Number);
    const next = new Date(year, month, 1);
    const pad = n => String(n).padStart(2, '0');
    return `${pad(next.getDate())}/${pad(next.getMonth() + 1)}/${next.getFullYear()}`;
  }

  const CIVILITES = ['MR', 'MME', 'M.', 'MME.', 'DR', 'DR.', 'MLLE'];

  function extractMotsCle(nom) {
    return (nom || '')
      .toUpperCase().trim().split(/\s+/)
      .filter(m => m.length > 1 && !CIVILITES.includes(m));
  }

  function fillStep1(data) {
    let filled = 0;
    const motsCle = extractMotsCle(data.nomCoach);

    for (const sel of document.querySelectorAll('select')) {
      for (const opt of sel.options) {
        const optTxt = opt.text.toUpperCase();
        const matches = motsCle.filter(m => optTxt.includes(m));
        if (motsCle.length > 0 && matches.length === motsCle.length) {
          sel.value = opt.value;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          filled++; break;
        }
      }
    }

    if (filled === 0 && data.nomCoach) {
      for (const inp of document.querySelectorAll('input[type="text"]')) {
        if (/salar|nom|prénom|prenom/i.test(inp.name + inp.id + inp.placeholder)) {
          fillInput(inp, data.nomCoach); filled++; break;
        }
      }
    }

    if (data.mois) {
      const [year, month] = data.mois.split('-').map(Number);
      const lastDay = new Date(year, month, 0).getDate();
      const pad = n => String(n).padStart(2, '0');
      const dateDebut = `${pad(1)}/${pad(month)}/${year}`;
      const dateFin   = `${pad(lastDay)}/${pad(month)}/${year}`;

      const dateInputs = Array.from(document.querySelectorAll('input[type="text"]'))
        .filter(i => /date|du|au|période|debut|fin/i.test(
          i.name + i.id + i.placeholder +
          (i.closest('td')?.previousElementSibling?.textContent || '')));

      if (dateInputs.length >= 2) {
        fillInput(dateInputs[0], dateDebut) && filled++;
        fillInput(dateInputs[1], dateFin)   && filled++;
      } else {
        const all = Array.from(document.querySelectorAll('input[type="text"]'));
        if (all[0]) fillInput(all[0], dateDebut) && filled++;
        if (all[1]) fillInput(all[1], dateFin)   && filled++;
      }
    }
    return filled;
  }

  function fillStep2() {
    const btn = document.getElementById('btnSuivant');
    if (btn) { setTimeout(() => btn.click(), 300); return true; }
    return false;
  }

  function splitMontant(valeur) {
    const str = String(valeur != null ? valeur : '0').replace(',', '.');
    const [e, c = '00'] = parseFloat(str).toFixed(2).split('.');
    return [e, c];
  }

  function fillStep3(data) {
    let filled = 0;

    const inPaye = document.getElementById('inPayeSalaire');
    if (inPaye && data.mois) {
      fillInput(inPaye, datePaiement(data.mois));
      filled++;
    }

    const radioNet = document.getElementById('prestation.remunerationBrut2');
    if (radioNet && !radioNet.checked) {
      radioNet.checked = true;
      radioNet.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const inEuro = document.getElementById('inRemunerationEuro');
    const inCent = document.getElementById('inRemunerationCent');
    if ((inEuro || inCent) && data.salaireBrut != null) {
      const [euros, cents] = splitMontant(data.salaireBrut);
      if (inEuro) { fillInput(inEuro, euros); filled++; }
      if (inCent) { fillInput(inCent, cents); filled++; }
    }

    const inHeures = document.getElementById('inNombreHeures');
    if (inHeures && data.heures != null) {
      fillInput(inHeures, toHHMN(data.heures));
      filled++;
    }

    const inNbManif = document.getElementById('inNombreManifestation');
    const inMtManif = document.getElementById('inMontantManifestation');
    if (inNbManif && data.joursComp  != null) { fillNumeric(inNbManif, data.joursComp);   filled++; }
    if (inMtManif && data.salaireComp != null) { fillNumeric(inMtManif, data.salaireComp); filled++; }

    return filled;
  }

  function updateStepUI(step) {
    if (step === _lastStep) return;
    _lastStep = step;

    const zone = document.getElementById('jcc-step-zone');
    if (!zone) return;

    if (step === 'step1') {
      zone.innerHTML = `
        <div class="jcc-step-label">📍 Étape 1 — Salarié &amp; Période</div>
        <button class="jcc-btn" id="jcc-step-btn">▶ Remplir salarié + période</button>
      `;
      zone.querySelector('#jcc-step-btn').addEventListener('click', () => {
        if (!payload) { setStatus('⚠ Importez d\'abord les données.', true); return; }
        const n = fillStep1(payload);
        setStatus(n > 0 ? `✅ ${n} champ(s) rempli(s) — vérifiez puis Suivant` : '⚠ Aucun champ trouvé.');
      });
    } else if (step === 'step2') {
      zone.innerHTML = `
        <div class="jcc-step-label">📍 Étape 2 — Options (défaut)</div>
        <button class="jcc-btn" id="jcc-step-btn">▶ Passer à l'étape suivante</button>
      `;
      zone.querySelector('#jcc-step-btn').addEventListener('click', () => {
        const ok = fillStep2();
        setStatus(ok ? '⏩ Passage à l'étape 3…' : '⚠ Bouton Suivant introuvable.', !ok);
      });
    } else if (step === 'step3') {
      zone.innerHTML = `
        <div class="jcc-step-label">📍 Étape 3 — Rémunération</div>
        <button class="jcc-btn" id="jcc-step-btn">▶ Remplir salaire &amp; heures</button>
      `;
      zone.querySelector('#jcc-step-btn').addEventListener('click', () => {
        if (!payload) { setStatus('⚠ Importez d\'abord les données.', true); return; }
        const n = fillStep3(payload);
        setStatus(n > 0 ? `✅ ${n} champ(s) rempli(s)` : '⚠ Aucun champ trouvé.');
      });
    } else {
      zone.innerHTML = `<div class="jcc-step-label" style="color:#e67e22">Étape non reconnue</div>`;
    }
  }

  function buildPanel() {
    loadPayload();
    _lastStep = null;

    const panel = document.createElement('div');
    panel.id = 'jcc-panel';
    panel.innerHTML = `
      <div id="jcc-panel-header">
        <span>🥋 JC Cattenom → CEA</span>
        <span class="jcc-badge">AUTO</span>
      </div>
      <div id="jcc-panel-body">
        <button class="jcc-btn" id="jcc-import-btn">📋 Coller les données depuis l'app</button>
        <table id="jcc-data-table"></table>
        <hr class="jcc-divider">
        <div id="jcc-step-zone"></div>
        <div id="jcc-status"></div>
      </div>
    `;
    document.body.appendChild(panel);

    panel.querySelector('#jcc-panel-header').addEventListener('click', () => {
      const b = panel.querySelector('#jcc-panel-body');
      b.style.display = b.style.display === 'none' ? '' : 'none';
    });

    panel.querySelector('#jcc-import-btn').addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        const data = JSON.parse(text);
        if (data.salaireBrut == null && data.heures == null) throw new Error('invalide');
        savePayload(data);
        renderTable();
        setStatus('✅ Données importées !');
      } catch(e) {
        setStatus('❌ Clipboard invalide — utilisez "Copier pour CEA" dans l\'app.', true);
      }
    });

    renderTable();
    updateStepUI(detectStep());

    let _debounce = null;
    const observer = new MutationObserver(() => {
      clearTimeout(_debounce);
      _debounce = setTimeout(() => updateStepUI(detectStep()), 400);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function renderTable() {
    const t = document.getElementById('jcc-data-table');
    if (!t) return;
    if (!payload) {
      t.innerHTML = '<tr><td colspan="2" style="color:#a8c8e8;font-style:italic;text-align:center;padding:8px">Aucune donnée chargée</td></tr>';
      return;
    }
    const rows = [
      ['Coach',             payload.nomCoach,            false],
      ['Mois',              payload.mois,                false],
      ['Date paiement',     payload.mois ? datePaiement(payload.mois) : '—', false],
      ['Heures',            payload.heures != null ? toHHMN(payload.heures) : '—', false],
      ['Taux horaire',      payload.tauxHoraire != null ? payload.tauxHoraire + ' €' : '—', false],
      ['Salaire formation', payload.salaireFormation != null ? payload.salaireFormation + ' €' : '—', false],
      ['Jours compét.',     payload.joursComp != null ? payload.joursComp + ' j' : '—', false],
      ['Salaire compét.',   payload.salaireComp != null ? payload.salaireComp + ' €' : '—', false],
      ['Total net',         payload.salaireBrut != null ? payload.salaireBrut + ' €' : '—', true],
    ];
    t.innerHTML = rows.map(([l, v, highlight]) =>
      `<tr${highlight ? ' class="jcc-total"' : ''}><td>${l}</td><td>${v ?? '—'}</td></tr>`
    ).join('');
  }

  function setStatus(msg, isError = false) {
    const s = document.getElementById('jcc-status');
    if (!s) return;
    s.textContent = msg;
    s.className = isError ? 'error' : '';
    setTimeout(() => { if(s) s.textContent = ''; }, 5000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildPanel);
  } else {
    buildPanel();
  }

})();
