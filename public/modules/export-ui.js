// export-ui.js — Export & Import UI module
// Extracted from app-modular.js (main branch)

/**
 * createExportUI — factory that injects all state/service dependencies
 * and returns the export/import functions as a module API.
 */
export function createExportUI({
  // State getters
  getCurrentCoach,
  getCurrentMonth,
  getTimeData,
  getSelectedDay,
  getCurrentUser,
  getCurrentAccessToken,

  // Services
  supabase,
  supabaseUrl,
  supabaseKey,
  logAuditEvent,
  buildMonthlyAuditPayload,

  // Runtime utils
  downloadBlob,
  loadExcelJs,
  blobToDataUrl,
  isStandaloneApp,

  // Domain utils
  escapeHtml,
  normalizeMonth,
  getCoachDisplayName,
  getProfileLabel,
  getProfileType,
  isVolunteerProfile,
  getMileageScaleDescription,
  getMonthlyMileageBreakdown,
  getMileageYearBreakdown,
  parseFiscalPower,
  getMileageScaleBand,
  calculateAnnualMileageAmount,
  getMileageYearBreakdownFn,
}) {
  // ─────────────────────────────────────────────────────────────────
  // Internal helpers (mirror of private functions in app-modular.js)
  // ─────────────────────────────────────────────────────────────────

  function __formatMonthLabel(monthValue) {
    const normalized = normalizeMonth(monthValue);
    const [year, month] = String(normalized || '').split('-');
    if (!year || !month) return normalized;
    return `${month}/${year}`;
  }

  function __closeMileagePreviewModal() {
    const modal = document.getElementById('mileagePreviewModal');
    if (modal) modal.classList.remove('active');
  }

  function __getMonthlyExpenseReceiptIssues(coachId, year, month) {
    const timeData = getTimeData();
    const issues = [];
    Object.keys(timeData)
      .filter((key) => key.startsWith(`${coachId}-${year}-${month}`))
      .sort()
      .forEach((key) => {
        const date = key.split('-').slice(-3).join('-');
        const data = timeData[key] || {};
        const missing = [];
        if ((data.peage || 0) > 0 && !data.justificationUrl) missing.push('péage');
        if ((data.hotel || 0) > 0 && !data.hotelJustificationUrl) missing.push('hôtel');
        if ((data.achat || 0) > 0 && !data.achatJustificationUrl) missing.push('achat');
        if (missing.length) issues.push({ date, missing });
      });
    return issues;
  }

  function __showMileagePreviewModal(html, fileName, downloadHtml = html) {
    let modal = document.getElementById('mileagePreviewModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'mileagePreviewModal';
      modal.className = 'modal export-preview-modal';
      modal.innerHTML = `
        <div class="modal-content export-preview-content">
          <h2>Aperçu note de frais</h2>
          <div class="export-preview-toolbar">
            <button id="previewPrintBtn" class="btn-primary">🖨️ Imprimer / PDF</button>
            <button id="previewDownloadBtn" class="btn-secondary">💾 Télécharger HTML</button>
            <button id="previewCloseBtn" class="btn-danger">Fermer</button>
          </div>
          <iframe id="mileagePreviewFrame" class="export-preview-frame" title="Aperçu note de frais"></iframe>
        </div>
      `;
      document.body.appendChild(modal);
      modal.addEventListener('click', (e) => { if (e.target === modal) __closeMileagePreviewModal(); });
      modal.querySelector('#previewCloseBtn')?.addEventListener('click', __closeMileagePreviewModal);
    }

    const iframe = modal.querySelector('#mileagePreviewFrame');
    const printBtn = modal.querySelector('#previewPrintBtn');
    const downloadBtn = modal.querySelector('#previewDownloadBtn');

    if (printBtn) printBtn.disabled = true;
    if (iframe) {
      iframe.onload = () => { if (printBtn) printBtn.disabled = false; };
      iframe.srcdoc = html;
    } else if (printBtn) {
      printBtn.disabled = false;
    }
    if (printBtn) {
      printBtn.onclick = () => {
        try {
          iframe?.contentWindow?.focus();
          iframe?.contentWindow?.print();
        } catch {
          alert("Impossible d'imprimer cet aperçu. Utilisez Télécharger HTML.");
        }
      };
    }
    if (downloadBtn) {
      downloadBtn.onclick = () => {
        const blob = new Blob([downloadHtml], { type: 'text/html;charset=utf-8;' });
        downloadBlob(blob, fileName);
      };
    }
    modal.classList.add('active');
  }

  // ─────────────────────────────────────────────────────────────────
  // exportDeclarationXLS
  // ─────────────────────────────────────────────────────────────────

  async function exportDeclarationXLS() {
    const currentCoach = getCurrentCoach();
    const currentMonth = getCurrentMonth();
    const timeData = getTimeData();
    const currentUser = getCurrentUser();

    if (!currentCoach || !currentMonth) { alert('Veuillez sélectionner un profil et un mois.'); return; }
    if (isVolunteerProfile(currentCoach)) { alert("L'export de déclaration salaire n'est pas disponible pour un profil bénévole."); return; }

    const [year, month] = currentMonth.split('-');
    const rows = Object.keys(timeData)
      .filter((key) => key.startsWith(`${currentCoach.id}-${year}-${month}`))
      .sort()
      .map((key) => {
        const date = key.split('-').slice(-3).join('-');
        const data = timeData[key];
        const hours = Number(data.hours) || 0;
        const hourlyRate = Number(currentCoach.hourly_rate) || 0;
        const trainingAmount = hours * hourlyRate;
        const competitionAllowance = data.competition ? (Number(currentCoach.daily_allowance) || 0) : 0;
        return {
          date,
          description: data.description || (data.competition ? 'Jour de compétition' : 'Entraînement'),
          hours, hourlyRate, trainingAmount,
          competition: !!data.competition,
          competitionAllowance,
          declaredTotal: trainingAmount + competitionAllowance,
        };
      });

    if (!rows.length) { alert('Aucune donnée à déclarer pour ce mois.'); return; }

    const totalHours = rows.reduce((sum, r) => sum + r.hours, 0);
    const competitionDays = rows.reduce((sum, r) => sum + (r.competition ? 1 : 0), 0);
    const totalTrainingAmount = rows.reduce((sum, r) => sum + r.trainingAmount, 0);
    const totalCompetitionAllowance = rows.reduce((sum, r) => sum + r.competitionAllowance, 0);
    const grandTotal = rows.reduce((sum, r) => sum + r.declaredTotal, 0);
    const coachDisplayName = getCoachDisplayName(currentCoach) || currentCoach.name;
    const exportDate = new Date().toLocaleDateString('fr-FR');

    const ExcelJS = await loadExcelJs();
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Judo Club de Cattenom-Rodemack';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Déclaration salaire', {
      properties: { defaultRowHeight: 22 },
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 } },
      views: [{ showGridLines: false }],
    });
    worksheet.columns = [{ width: 14 }, { width: 28 }, { width: 12 }, { width: 12 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 14 }];

    const navyFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F3460' } };
    const lightFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF2FF' } };
    const totalFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9F1FB' } };
    const border = { top: { style: 'thin', color: { argb: 'FFC7D2E0' } }, left: { style: 'thin', color: { argb: 'FFC7D2E0' } }, bottom: { style: 'thin', color: { argb: 'FFC7D2E0' } }, right: { style: 'thin', color: { argb: 'FFC7D2E0' } } };

    try {
      const logoResponse = await fetch(new URL('logo-jcc.png', window.location.href));
      if (logoResponse.ok) {
        const logoBase64 = await blobToDataUrl(await logoResponse.blob());
        const imageId = workbook.addImage({ base64: logoBase64, extension: 'png' });
        worksheet.addImage(imageId, { tl: { col: 0.15, row: 0.15 }, ext: { width: 58, height: 58 } });
      }
    } catch (e) { console.warn('Impossible de charger le logo pour export XLSX:', e); }

    worksheet.mergeCells('C1:H1');
    worksheet.getCell('C1').value = 'Déclaration salaire';
    worksheet.getCell('C1').font = { name: 'Calibri', size: 18, bold: true, color: { argb: 'FF0F3460' } };
    worksheet.mergeCells('C2:H2');
    worksheet.getCell('C2').value = `Judo Club de Cattenom-Rodemack — période ${month}/${year}`;
    worksheet.getCell('C2').font = { name: 'Calibri', size: 11, color: { argb: 'FF526274' } };

    const metaRows = [
      ['Intervenant', coachDisplayName || 'Non renseigné', 'Mois déclaré', `${month}/${year}`],
      ['Adresse', currentCoach.address || 'Non renseignée', 'Taux horaire', Number(currentCoach.hourly_rate) || 0],
      ['Indemnité forfaitaire compétition', Number(currentCoach.daily_allowance) || 0, 'Date d\'édition', exportDate],
    ];
    metaRows.forEach((values, index) => {
      const rowNumber = 5 + index;
      const row = worksheet.getRow(rowNumber);
      row.values = values;
      [1, 3].forEach((col) => { const cell = row.getCell(col); cell.fill = lightFill; cell.font = { bold: true, color: { argb: 'FF0F3460' } }; cell.border = border; });
      [2, 4].forEach((col) => { const cell = row.getCell(col); cell.border = border; if (rowNumber === 6 && col === 4) cell.numFmt = '#,##0.00 €'; if (rowNumber === 7 && col === 2) cell.numFmt = '#,##0.00 €'; });
    });

    worksheet.mergeCells('A9:H9');
    const st = worksheet.getCell('A9'); st.value = 'Synthèse à déclarer'; st.font = { bold: true, size: 12, color: { argb: 'FF0F3460' } };
    const sh = worksheet.getRow(10);
    sh.values = ['Heures prestées', 'Jours de compétition', 'Montant heures', 'Indemnités forfaitaires', 'Total déclaration'];
    sh.eachCell((cell, col) => { if (col <= 5) { cell.fill = navyFill; cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.border = border; cell.alignment = { horizontal: 'center' }; } });
    const sv = worksheet.getRow(11);
    sv.values = [totalHours, competitionDays, totalTrainingAmount, totalCompetitionAllowance, grandTotal];
    sv.eachCell((cell, col) => { if (col <= 5) { cell.border = border; cell.alignment = { horizontal: col <= 2 ? 'center' : 'right' }; if (col >= 3) cell.numFmt = '#,##0.00 €'; if (col === 1) cell.numFmt = '0.0'; } });

    worksheet.mergeCells('A13:H13');
    const dt = worksheet.getCell('A13'); dt.value = 'Détail de la déclaration'; dt.font = { bold: true, size: 12, color: { argb: 'FF0F3460' } };
    const dh = worksheet.getRow(14);
    dh.values = ['Date', 'Libellé', 'Heures prestées', 'Taux horaire', 'Montant heures', 'Jour compétition', 'Indemnité forfaitaire', 'Total déclaré'];
    dh.eachCell((cell) => { cell.fill = navyFill; cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.border = border; cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; });

    let drn = 15;
    rows.forEach((rowData, index) => {
      const row = worksheet.getRow(drn);
      row.values = [rowData.date, rowData.description, rowData.hours, rowData.hourlyRate, rowData.trainingAmount, rowData.competition ? 'Oui' : 'Non', rowData.competitionAllowance, rowData.declaredTotal];
      row.eachCell((cell, col) => {
        cell.border = border;
        cell.alignment = { vertical: 'middle', horizontal: [3,4,5,7,8].includes(col) ? 'right' : (col === 6 ? 'center' : 'left'), wrapText: col === 2 };
        if (index % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FBFF' } };
        if (col === 3) cell.numFmt = '0.0';
        if ([4,5,7,8].includes(col)) cell.numFmt = '#,##0.00 €';
      });
      drn++;
    });
    const tr = worksheet.getRow(drn);
    tr.values = ['TOTAL', '', totalHours, '', totalTrainingAmount, competitionDays, totalCompetitionAllowance, grandTotal];
    tr.eachCell((cell, col) => {
      cell.border = border; cell.fill = totalFill; cell.font = { bold: true };
      cell.alignment = { vertical: 'middle', horizontal: [3,5,6,7,8].includes(col) ? 'right' : 'left' };
      if (col === 3) cell.numFmt = '0.0';
      if ([5,7,8].includes(col)) cell.numFmt = '#,##0.00 €';
    });

    worksheet.mergeCells(`A${drn + 2}:H${drn + 3}`);
    const nc = worksheet.getCell(`A${drn + 2}`);
    nc.value = 'Ce fichier correspond à la déclaration salaire du mois. Il peut être ouvert dans Excel sans avertissement de format puis imprimé en PDF si nécessaire.';
    nc.alignment = { wrapText: true, vertical: 'top' }; nc.border = border;
    nc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FBFF' } };

    const buffer = await workbook.xlsx.writeBuffer();
    const safeName = String(currentCoach.name || 'intervenant').replace(/[^a-z0-9_\-]/gi, '_');
    downloadBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `declaration_salaire_${safeName}_${currentMonth}.xlsx`);
    await logAuditEvent('export.declaration_xlsx', 'export', buildMonthlyAuditPayload({ coach: currentCoach, entityId: `${currentCoach.id}-${currentMonth}`, metadata: { coach_name: coachDisplayName || null, total_hours: totalHours, competition_days: competitionDays, total_amount: grandTotal } }));
  }

  // ─────────────────────────────────────────────────────────────────
  // exportExpenseHTML
  // ─────────────────────────────────────────────────────────────────

  function exportExpenseHTML() {
    const currentCoach = getCurrentCoach();
    const currentMonth = getCurrentMonth();
    const timeData = getTimeData();

    if (!currentCoach || !currentMonth) { alert('Veuillez sélectionner un profil et un mois.'); return; }
    const [year, month] = currentMonth.split('-');
    const mileageBreakdown = getMonthlyMileageBreakdown(currentCoach, currentMonth);
    const receiptIssues = __getMonthlyExpenseReceiptIssues(currentCoach.id, year, month);

    if (receiptIssues.length) {
      const details = receiptIssues.map((i) => `- ${i.date} : justificatif manquant pour ${i.missing.join(', ')}`).join('\n');
      alert(`Impossible d'exporter la note de frais.\nAjoutez les justificatifs obligatoires pour :\n${details}`);
      return;
    }

    const rows = [];
    let total = 0;
    Object.keys(timeData)
      .filter((key) => key.startsWith(`${currentCoach.id}-${year}-${month}`))
      .sort()
      .forEach((key) => {
        const date = key.split('-').slice(-3).join('-');
        const data = timeData[key];
        const hasExpense = (data.km || 0) > 0 || (data.peage || 0) > 0 || (data.hotel || 0) > 0 || (data.achat || 0) > 0;
        if (!hasExpense) return;
        const mileage = mileageBreakdown.byKey?.[key] || { amount: 0, effectiveRate: 0 };
        const amount = mileage.amount + (data.peage || 0) + (data.hotel || 0) + (data.achat || 0);
        total += amount;
        rows.push({ date, ...data, mileageAmount: mileage.amount, tollAmount: data.peage || 0, hotelAmount: data.hotel || 0, purchaseAmount: data.achat || 0, amount, effectiveRate: mileage.effectiveRate });
      });

    if (total === 0) { alert('Aucune dépense saisie pour ce mois.'); return; }

    const logoUrl = new URL('logo-jcc.png', window.location.href).href;
    const coachDisplayName = getCoachDisplayName(currentCoach) || currentCoach.name;
    const profileLabel = getProfileLabel(currentCoach, { capitalized: true });
    const signatureLabel = isVolunteerProfile(currentCoach) ? 'Signature du bénévole' : 'Signature du salarié';
    const totalMileageAmount = rows.reduce((s, r) => s + (r.mileageAmount || 0), 0);
    const totalTollAmount = rows.reduce((s, r) => s + (r.tollAmount || 0), 0);
    const totalHotelAmount = rows.reduce((s, r) => s + (r.hotelAmount || 0), 0);
    const totalPurchaseAmount = rows.reduce((s, r) => s + (r.purchaseAmount || 0), 0);
    const totalMileageKm = rows.reduce((s, r) => s + (Number(r.km) || 0), 0);
    const mileageScaleDescription = getMileageScaleDescription(currentCoach.fiscal_power);

    const esc = (v, fb = '') => escapeHtml(v || fb);
    const sanitizeUrl = (v) => {
      if (!v) return '';
      try { const u = new URL(String(v), window.location.href); if (!['http:', 'https:'].includes(u.protocol.toLowerCase())) return ''; return escapeHtml(u.href); } catch { return ''; }
    };
    const buildJustifLinks = (row) => {
      const links = [];
      const t = sanitizeUrl(row.justificationUrl); const h = sanitizeUrl(row.hotelJustificationUrl); const a = sanitizeUrl(row.achatJustificationUrl);
      if (t) links.push(`<a href="${t}" target="_blank" rel="noopener noreferrer">Péage</a>`);
      if (h) links.push(`<a href="${h}" target="_blank" rel="noopener noreferrer">Hôtel</a>`);
      if (a) links.push(`<a href="${a}" target="_blank" rel="noopener noreferrer">Achat</a>`);
      return links.length ? `<div class="justif-links">${links.join('')}</div>` : '<span class="meta-line">Aucun justificatif</span>';
    };

    const usePreviewModal = isStandaloneApp();
    const renderHtml = ({ embeddedPreview = false, includeCloseButton = true } = {}) => {
      const controls = embeddedPreview ? '' : `
        <button class="print-button no-print" onclick="window.print()">🖨️ Imprimer / Enregistrer en PDF</button>
        ${includeCloseButton ? '<button class="print-button close-button no-print" onclick="window.close()">✖ Fermer</button>' : ''}`;
      const tableRows = rows.map((row) => `
        <tr>
          <td>${esc(row.date)}</td>
          <td>${esc(row.departurePlace)} → ${esc(row.arrivalPlace)}</td>
          <td class="right">${Number(row.km) || 0}</td>
          <td class="right">${(row.effectiveRate || 0).toFixed(3)} €/km</td>
          <td class="right">${(row.mileageAmount || 0).toFixed(2)} €</td>
          <td class="right">${(row.tollAmount || 0).toFixed(2)} €</td>
          <td class="right">${(row.hotelAmount || 0).toFixed(2)} €</td>
          <td class="right">${(row.purchaseAmount || 0).toFixed(2)} €</td>
          <td class="right bold">${(row.amount || 0).toFixed(2)} €</td>
          <td>${buildJustifLinks(row)}</td>
        </tr>`);
      return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Note de frais - ${esc(currentCoach.name)} - ${month}/${year}</title><style>body{font-family:sans-serif;font-size:13px;margin:20px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px 8px}th{background:#0f3460;color:#fff}.right{text-align:right}.bold{font-weight:bold}.no-print{margin-bottom:12px}.print-button{padding:8px 16px;margin-right:8px;cursor:pointer}@media print{.no-print{display:none}}</style></head><body>
        ${controls}
        <h2>Note de frais — ${esc(coachDisplayName)} — ${month}/${year}</h2>
        <p>${esc(profileLabel)} | ${esc(currentCoach.address, 'Adresse non renseignée')}</p>
        <p>Barème kilométrique : ${esc(mileageScaleDescription)} (puissance fiscale : ${esc(String(currentCoach.fiscal_power), '?')})</p>
        <table><thead><tr><th>Date</th><th>Trajet</th><th>Km</th><th>Taux</th><th>Km (€)</th><th>Péage</th><th>Hôtel</th><th>Achat</th><th>Total</th><th>Justificatifs</th></tr></thead><tbody>
        ${tableRows.join('')}
        </tbody><tfoot><tr><th colspan="2">TOTAL</th><th class="right">${totalMileageKm}</th><th></th><th class="right">${totalMileageAmount.toFixed(2)} €</th><th class="right">${totalTollAmount.toFixed(2)} €</th><th class="right">${totalHotelAmount.toFixed(2)} €</th><th class="right">${totalPurchaseAmount.toFixed(2)} €</th><th class="right bold">${total.toFixed(2)} €</th><th></th></tr></tfoot></table>
        <br><p>Signature de l'employeur :</p><br><p>${esc(signatureLabel)} :</p>
        </body></html>`;
    };

    const safeName = String(currentCoach.name || 'intervenant').replace(/[^a-z0-9_\-]/gi, '_');
    const fileName = `note_de_frais_${safeName}_${currentMonth}.html`;
    if (usePreviewModal) {
      __showMileagePreviewModal(renderHtml({ embeddedPreview: true }), fileName, renderHtml({ embeddedPreview: false, includeCloseButton: false }));
    } else {
      const blob = new Blob([renderHtml({ embeddedPreview: false })], { type: 'text/html;charset=utf-8;' });
      downloadBlob(blob, fileName);
    }
    logAuditEvent('export.expense_html', 'export', buildMonthlyAuditPayload({ coach: currentCoach, entityId: `${currentCoach.id}-${currentMonth}`, metadata: { total_amount: total } }));
  }

  // ─────────────────────────────────────────────────────────────────
  // exportTimesheetHTML
  // ─────────────────────────────────────────────────────────────────

  async function exportTimesheetHTML() {
    const currentCoach = getCurrentCoach();
    const currentMonth = getCurrentMonth();
    const timeData = getTimeData();

    if (!currentCoach || !currentMonth) { alert('Veuillez sélectionner un profil et un mois.'); return; }
    const [year, month] = currentMonth.split('-');
    const coachDisplayName = getCoachDisplayName(currentCoach) || currentCoach.name;
    const safeName = String(currentCoach.name || 'intervenant').replace(/[^a-z0-9_\-]/gi, '_');
    const fileName = `fiche_presence_${safeName}_${currentMonth}.html`;
    let totalHours = 0; let compDays = 0;
    const rows = [];
    Object.keys(timeData).filter((key) => key.startsWith(`${currentCoach.id}-${year}-${month}`)).sort().forEach((key) => {
      const date = key.split('-').slice(-3).join('-');
      const data = timeData[key];
      totalHours += data.hours || 0;
      if (data.competition) compDays++;
      rows.push({ date, hours: data.hours || 0, competition: data.competition || false, description: data.description || '' });
    });
    if (!rows.length) { alert('Aucune donnée saisie pour ce mois.'); return; }
    const tableRows = rows.map((r) => `<tr><td>${escapeHtml(r.date)}</td><td class="right">${r.hours}</td><td class="center">${r.competition ? '🏆 Oui' : 'Non'}</td><td>${escapeHtml(r.description)}</td></tr>`).join('');
    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Fiche présence - ${escapeHtml(currentCoach.name)} - ${month}/${year}</title><style>body{font-family:sans-serif;font-size:13px;margin:20px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px 8px}th{background:#0f3460;color:#fff}.right{text-align:right}.center{text-align:center}.no-print{margin-bottom:12px}button{padding:8px 16px;cursor:pointer;margin-right:8px}@media print{.no-print{display:none}}</style></head><body>
      <button class="no-print" onclick="window.print()">🖨️ Imprimer / PDF</button>
      <h2>Fiche de présence — ${escapeHtml(coachDisplayName)} — ${month}/${year}</h2>
      <table><thead><tr><th>Date</th><th>Heures</th><th>Compétition</th><th>Description</th></tr></thead>
      <tbody>${tableRows}</tbody>
      <tfoot><tr><th colspan="1">TOTAL</th><th class="right">${totalHours.toFixed(1)}</th><th class="center">${compDays} jour(s)</th><th></th></tr></tfoot></table>
      <br><p>Signature de l'employeur :</p><br><p>Signature du salarié :</p></body></html>`;
    downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8;' }), fileName);
    await logAuditEvent('export.timesheet_html', 'export', buildMonthlyAuditPayload({ coach: currentCoach, entityId: `${currentCoach.id}-${currentMonth}`, metadata: { total_hours: totalHours, competition_days: compDays } }));
  }

  // ─────────────────────────────────────────────────────────────────
  // exportMonthlyExpenses — calls Supabase Edge Function
  // ─────────────────────────────────────────────────────────────────

  async function exportMonthlyExpenses(format = 'csv', month = null) {
    const currentAccessToken = getCurrentAccessToken();
    const resolvedMonth = month || getCurrentMonth();
    if (!resolvedMonth) { alert('Veuillez sélectionner un mois.'); return; }
    const btn = document.getElementById('exportMonthlyExpensesBtn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Export en cours…'; }
    try {
      const res = await globalThis.fetch(`${supabaseUrl}/functions/v1/export-monthly-expenses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${currentAccessToken}`, 'Content-Type': 'application/json', apikey: supabaseKey },
        body: JSON.stringify({ month: resolvedMonth, format }),
      });
      if (!res.ok) { const t = await res.text(); alert('Erreur export : ' + t); return; }
      const blob = await res.blob();
      const ext = format === 'xlsx' ? 'xlsx' : 'csv';
      downloadBlob(blob, `export_frais_${resolvedMonth}.${ext}`);
    } catch (e) { alert('Erreur lors de l\'export : ' + e.message); } finally {
      if (btn) { btn.disabled = false; btn.textContent = '📊 Export mensuel frais'; }
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // exportBackupJSON
  // ─────────────────────────────────────────────────────────────────

  async function exportBackupJSON() {
    const currentAccessToken = getCurrentAccessToken();
    const currentUser = getCurrentUser();
    if (!currentUser) { alert('Non connecté.'); return; }
    try {
      const [coachesRes, timeDataRes] = await Promise.all([
        globalThis.fetch(`${supabaseUrl}/rest/v1/users?select=*`, { headers: { apikey: supabaseKey, Authorization: `Bearer ${currentAccessToken}` } }),
        globalThis.fetch(`${supabaseUrl}/rest/v1/time_data?select=*`, { headers: { apikey: supabaseKey, Authorization: `Bearer ${currentAccessToken}` } }),
      ]);
      const coachesData = await coachesRes.json();
      const timeDataData = await timeDataRes.json();
      const backup = { exportedAt: new Date().toISOString(), coaches: coachesData, time_data: timeDataData };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      downloadBlob(blob, `backup_jcc_${new Date().toISOString().slice(0, 10)}.json`);
      await logAuditEvent('export.backup_json', 'export', { entityId: null, targetUserId: null, targetEmail: null, metadata: { exported_by: currentUser.email } });
    } catch (e) { alert('Erreur lors de la sauvegarde : ' + e.message); }
  }

  // ─────────────────────────────────────────────────────────────────
  // importCoachData
  // ─────────────────────────────────────────────────────────────────

  async function importCoachData(data) {
    const currentAccessToken = getCurrentAccessToken();
    if (!data || !data.coaches || !data.time_data) { alert('Format de fichier JSON invalide.'); return; }
    if (!confirm(`Importer ${data.coaches.length} profil(s) et ${data.time_data.length} entrée(s) ? Les données existantes ne seront pas supprimées.`)) return;
    try {
      for (const coach of data.coaches) {
        await globalThis.fetch(`${supabaseUrl}/rest/v1/users`, {
          method: 'POST',
          headers: { apikey: supabaseKey, Authorization: `Bearer ${currentAccessToken}`, 'Content-Type': 'application/json', Prefer: 'return=representation,resolution=merge-duplicates' },
          body: JSON.stringify(coach),
        });
      }
      for (const row of data.time_data) {
        await globalThis.fetch(`${supabaseUrl}/rest/v1/time_data`, {
          method: 'POST',
          headers: { apikey: supabaseKey, Authorization: `Bearer ${currentAccessToken}`, 'Content-Type': 'application/json', Prefer: 'return=representation,resolution=merge-duplicates' },
          body: JSON.stringify(row),
        });
      }
      alert('Import terminé avec succès.');
    } catch (e) { alert('Erreur lors de l\'import : ' + e.message); }
  }

  // ─────────────────────────────────────────────────────────────────
  // openMileagePreviewModal & openMonthlySummaryPreviewModal
  // ─────────────────────────────────────────────────────────────────

  async function openMileagePreviewModal() {
    // Re-uses exportExpenseHTML with preview mode
    exportExpenseHTML();
  }

  async function openMonthlySummaryPreviewModal() {
    const currentMonth = getCurrentMonth();
    if (!currentMonth) { alert('Veuillez sélectionner un mois.'); return; }
    exportMonthlyExpenses('csv', currentMonth);
  }

  // ─────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────

  return {
    exportDeclarationXLS,
    exportExpenseHTML,
    exportTimesheetHTML,
    exportMonthlyExpenses,
    exportBackupJSON,
    importCoachData,
    openMileagePreviewModal,
    openMonthlySummaryPreviewModal,
  };
}
