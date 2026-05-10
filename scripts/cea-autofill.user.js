// ==UserScript==
// @name         JCC Cattenom → CEA URSSAF Autofill
// @namespace    https://github.com/gaelc08/jccattenom-app
// @version      2.4.1
// @description  Lit la synthèse du mois depuis l'app JCC Cattenom et pré-remplit le portail CEA URSSAF
// @author       Gaël CANTARERO
// @match        *://*/*
// @updateURL    https://raw.githubusercontent.com/gaelc08/jccattenom-app/main/scripts/cea-autofill.user.js
// @downloadURL  https://raw.githubusercontent.com/gaelc08/jccattenom-app/main/scripts/cea-autofill.user.js
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // Ne s'exécute que sur le portail CEA
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
    #jcc-panel-header span { font-weight: 600; font-size: 14px; }
    #jcc-panel-body { padding: 12px 14px; }
    #jcc-panel table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
    #jcc-panel td { padding: 3px 0; }
    #jcc-panel td:first-child { color: #8bacc8; width: 60%; }
    #jcc-panel td:last-child { text-align: right; font-weight: 500; }
    .jcc-btn {
      width: 100%; border: none; border-radius: 7px; padding: 8px;
      font-size: 13px; font-weight: 600; cursor: pointer;
      transition: background 0.2s; margin-bottom: 6px;
    }
    #jcc-import-btn  { background: #2d4a3e; color: #7ec8a0; }
    #jcc-import-btn:hover { background: #3a5e4f; }
    #jcc-step1-btn, #jcc-fill-btn { background: #1a6fa8; color: white; }
    #jcc-step1-btn:hover, #jcc-fill-btn:hover { background: #1e84c8; }
    #jcc-step1-btn:disabled, #jcc-fill-btn:disabled { background: #555; cursor: default; }
    #jcc-status { margin-top: 6px; font-size: 11px; color: #7ec8a0; min-height: 16px; text-align: center; }
    #jcc-status.error { color: #f08080; }
    .jcc-badge { background: #e67e22; color: white; border-radius: 9999px; padding: 1px 7px; font-size: 11px; font-weight: 700; }
    .jcc-step-label { font-size: 11px; color: #8bacc8; margin-bottom: 4px; text-align: center; }
  `;
  document.head.appendChild(style);

  let payload = null;

  function loadPayload() {
    try { const r = storageGet(); if (r) payload = JSON.parse(r); } catch(e) { payload = null; }
  }
  function savePayload(data) {
    payload = data;
    storageSet(JSON.stringify(data));
  }

  function detectStep() {
    const txt = document.title + ' ' + document.body.innerText.slice(0, 500);
    if (/salarié.*période|choix du salarié|choix de la période/i.test(txt)) return 'step1';
    if (/rémunération/i.test(txt)) return 'step3';
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

  function findInputNearLabel(labelText) {
    for (const el of document.querySelectorAll('td, th, label, span, div')) {
      if (el.textContent.trim().toLowerCase().includes(labelText.toLowerCase())) {
        const input =
          el.nextElementSibling?.querySelector('input') ||
          el.closest('tr')?.querySelector('input') ||
          el.closest('td')?.nextElementSibling?.querySelector('input');
        if (input) return input;
      }
    }
    return null;
  }

  // Civilités à ignorer lors du matching
  const CIVILITES = ['MR', 'MME', 'M.', 'MME.', 'DR', 'DR.', 'MLLE'];

  /**
   * Extrait les mots significatifs d'un nom affiché par getCoachDisplayName
   * Format attendu depuis l'app : "NOM Prénom" (ex: "CHERRIER Valentin")
   * Format CEA : "MR NOM Prénom" ou "MME NOM Prénom"
   * On ignore les civilités et on cherche chaque mot dans l'option du select.
   */
  function extractMotsCle(nom) {
    return (nom || '')
      .toUpperCase()
      .trim()
      .split(/\s+/)
      .filter(m => m.length > 1 && !CIVILITES.includes(m));
  }

  function fillStep1(data) {
    let filled = 0;

    // Mots-clés depuis le nom de l'app (format "NOM Prénom")
    const motsCle = extractMotsCle(data.nomCoach);

    for (const sel of document.querySelectorAll('select')) {
      for (const opt of sel.options) {
        const optTxt = opt.text.toUpperCase();
        // On veut que tous les mots-clés soient présents dans l'option
        const matches = motsCle.filter(m => optTxt.includes(m));
        if (motsCle.length > 0 && matches.length === motsCle.length) {
          sel.value = opt.value;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          filled++;
          break;
        }
      }
    }

    // Fallback : si le select n'a pas matché, on essaie un input texte
    if (filled === 0 && data.nomCoach) {
      for (const inp of document.querySelectorAll('input[type="text"]')) {
        if (/salar|nom|prénom|prenom/i.test(inp.name + inp.id + inp.placeholder)) {
          fillInput(inp, data.nomCoach);
          filled++;
          break;
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

  function fillStep3(data) {
    let filled = 0;
    const try$ = (sel, val) => {
      const el = document.querySelector(sel);
      return el ? (fillNumeric(el, val) ? (filled++, true) : false) : false;
    };

    if (!try$('input[name="salairebrut"]',      data.salaireBrut))
    if (!try$('input[id*="salairebrut"]',       data.salaireBrut))
    if (!try$('input[id*="salaireBrut"]',       data.salaireBrut))
    if (!try$('input[id*="remunerationBrute"]', data.salaireBrut)) {
      const el = findInputNearLabel('salaire brut');
      if (el) { fillNumeric(el, data.salaireBrut); filled++; }
    }

    if (!try$('input[name="nbheures"]', data.heures))
    if (!try$('input[id*="nbHeures"]',  data.heures))
    if (!try$('input[id*="heures"]',    data.heures)) {
      const el = findInputNearLabel('heures');
      if (el) { fillNumeric(el, data.heures); filled++; }
    }

    if (!try$('input[name="tauxhoraire"]', data.tauxHoraire))
    if (!try$('input[id*="tauxHoraire"]',  data.tauxHoraire)) {
      const el = findInputNearLabel('taux horaire');
      if (el) { fillNumeric(el, data.tauxHoraire); filled++; }
    }
    return filled;
  }

  function buildPanel() {
    loadPayload();
    const step = detectStep();

    const panel = document.createElement('div');
    panel.id = 'jcc-panel';
    panel.innerHTML = `
      <div id="jcc-panel-header">
        <span>🥋 JCC Cattenom → CEA</span>
        <span class="jcc-badge">AUTO</span>
      </div>
      <div id="jcc-panel-body">
        <button class="jcc-btn" id="jcc-import-btn">📋 Coller les données depuis l'app</button>
        <table id="jcc-data-table"></table>
        ${ step === 'step1' ? `
          <div class="jcc-step-label">📍 Étape 1 — Salarié &amp; Période</div>
          <button class="jcc-btn" id="jcc-step1-btn">▶ Remplir salarié + période</button>
        ` : step === 'step3' ? `
          <div class="jcc-step-label">📍 Étape 3 — Rémunération</div>
          <button class="jcc-btn" id="jcc-fill-btn">▶ Remplir salaire &amp; heures</button>
        ` : `
          <div class="jcc-step-label" style="color:#e67e22">Étape non reconnue — navigue vers étape 1 ou 3</div>
        `}
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
        savePayload(data); renderTable();
        setStatus('✅ Données importées !');
      } catch(e) {
        setStatus('❌ Clipboard invalide — utilisez "Copier pour CEA" dans l\'app.', true);
      }
    });

    const s1 = panel.querySelector('#jcc-step1-btn');
    if (s1) s1.addEventListener('click', () => {
      if (!payload) { setStatus('⚠ Importez d\'abord les données.', true); return; }
      const n = fillStep1(payload);
      setStatus(n > 0 ? `✅ ${n} champ(s) rempli(s) — vérifiez puis Suivant` : '⚠ Aucun champ trouvé.');
    });

    const s3 = panel.querySelector('#jcc-fill-btn');
    if (s3) s3.addEventListener('click', () => {
      if (!payload) { setStatus('⚠ Importez d\'abord les données.', true); return; }
      const n = fillStep3(payload);
      setStatus(n > 0 ? `✅ ${n} champ(s) rempli(s)` : '⚠ Aucun champ trouvé.');
    });

    renderTable();
  }

  function renderTable() {
    const t = document.getElementById('jcc-data-table');
    if (!t) return;
    if (!payload) {
      t.innerHTML = '<tr><td colspan="2" style="color:#8bacc8;font-style:italic;text-align:center;padding:8px">Aucune donnée chargée</td></tr>';
      return;
    }
    const rows = [
      ['Coach',             payload.nomCoach],
      ['Mois',              payload.mois],
      ['Heures',            payload.heures != null ? payload.heures + ' h' : '—'],
      ['Taux horaire',      payload.tauxHoraire != null ? payload.tauxHoraire + ' €' : '—'],
      ['Salaire formation', payload.salaireFormation != null ? payload.salaireFormation + ' €' : '—'],
      ['Jours compét.',     payload.joursComp != null ? payload.joursComp + ' j' : '—'],
      ['Salaire compét.',   payload.salaireComp != null ? payload.salaireComp + ' €' : '—'],
      ['Total brut',        payload.salaireBrut != null ? payload.salaireBrut + ' €' : '—'],
    ];
    t.innerHTML = rows.map(([l,v]) => `<tr><td>${l}</td><td>${v ?? '—'}</td></tr>`).join('');
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
