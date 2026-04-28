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
  getCoaches,

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
        // Ouvrir le HTML complet dans un nouvel onglet et imprimer — plus fiable sur mobile
        const blob = new Blob([downloadHtml], { type: 'text/html;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const win = window.open(url, '_blank');
        if (win) {
          win.onload = () => {
            setTimeout(() => { win.print(); URL.revokeObjectURL(url); }, 300);
          };
        } else {
          // Fallback si les popups sont bloquées
          try {
            iframe?.contentWindow?.focus();
            iframe?.contentWindow?.print();
          } catch {
            alert("Activez les popups pour imprimer, ou utilisez Télécharger HTML.");
          }
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
    const today = new Date().toLocaleDateString('fr-FR');
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

    const safeCoachName = esc(currentCoach.name);
    const safeCoachDisplayName = esc(coachDisplayName, 'Non renseigné');
    const safeAddress = esc(currentCoach.address, 'Non renseignée');
    const safeProfileLabel = esc(profileLabel);
    const safeVehicle = esc(currentCoach.vehicle, 'Non renseigné');
    const safeFiscalPower = esc(currentCoach.fiscal_power, 'Non renseignée');
    const safeMileageScaleDescription = esc(mileageScaleDescription);
    const safeSignatureLabel = esc(signatureLabel);

    const usePreviewModal = isStandaloneApp();
    const renderHtml = ({ embeddedPreview = false, includeCloseButton = true } = {}) => {
      const controls = embeddedPreview ? '' : `
        <button class="print-button no-print" onclick="window.print()">🖨️ Imprimer / Enregistrer en PDF</button>
        ${includeCloseButton ? '<button class="print-button close-button no-print" onclick="window.close()">✖ Fermer</button>' : ''}`;
      const tableRows = rows.map((row) => `
        <tr>
          <td>${esc(row.date)}</td>
          <td><div class="expense-cell"><strong>${esc(row.description, 'Déplacement judo')}</strong><span class="route-line">${esc(row.departurePlace, '-')} → ${esc(row.arrivalPlace, '-')}</span>${buildJustifLinks(row)}</div></td>
          <td class="number">${Number(row.km) || 0}</td>
          <td class="amount">${(row.mileageAmount || 0).toFixed(2).replace('.', ',')} €</td>
          <td class="amount">${(row.tollAmount || 0).toFixed(2).replace('.', ',')} €</td>
          <td class="amount">${(row.hotelAmount || 0).toFixed(2).replace('.', ',')} €</td>
          <td class="amount">${(row.purchaseAmount || 0).toFixed(2).replace('.', ',')} €</td>
          <td class="amount">${(row.amount || 0).toFixed(2).replace('.', ',')} €</td>
        </tr>`);
      return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Note de frais - ${safeCoachName} - ${month}/${year}</title><style>*{box-sizing:border-box}@media print{@page{size:A4 portrait;margin:15mm}*{box-shadow:none!important;text-shadow:none!important;filter:none!important}html,body{width:194mm;margin:0;padding:0;background:white;-webkit-print-color-adjust:exact;print-color-adjust:exact}.no-print{display:none}.page-shell{box-shadow:none;border:none;margin:0;width:194mm;max-width:194mm;min-height:0!important;display:flex;border-radius:0}.page-inner{padding:0;min-height:0!important;display:flex;flex-direction:column}.header,.header-brand{display:flex!important;flex-direction:row!important;align-items:flex-start!important;justify-content:space-between!important}.document-badge{text-align:right!important;min-width:180px!important}.info-grid,.summary-grid,.signature{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important}.summary-card.total{grid-column:1/-1!important}.info-row{grid-template-columns:120px 1fr!important}}body{margin:0;padding:10px;background:#fff;color:#243447;font-family:Inter,Arial,sans-serif}.page-shell{width:${embeddedPreview ? '100%' : '194mm'};max-width:${embeddedPreview ? '100%' : '194mm'};min-height:${embeddedPreview ? '0' : '245mm'};margin:0 auto;background:#fff;border:none;border-radius:${embeddedPreview ? '0' : '12px'};box-shadow:none;display:flex;overflow:hidden}.page-inner{padding:8px 12px 12px;min-height:${embeddedPreview ? '0' : '245mm'};display:flex;flex-direction:column}.print-button{margin:0 0 10px;padding:8px 14px;background:linear-gradient(135deg,#0f3460,#145da0);color:white;border:none;border-radius:999px;cursor:pointer;font-size:.82rem;font-weight:700}.close-button{margin-left:8px;background:linear-gradient(135deg,#c0392b,#922b21)}.header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;border-bottom:2px solid #d8e2ef;padding-bottom:10px;margin-bottom:10px}.header-brand{display:flex;align-items:flex-start;gap:12px}.header-logo{width:160px;height:160px;flex:0 0 auto;display:flex;align-items:flex-start;justify-content:center}.header-logo img{max-width:144px;max-height:144px}.header-text{text-align:center}.header-text h1{margin:0 0 4px;font-size:1.1rem;color:#0f3460}.header-text p{margin:1px 0;color:#526274;font-size:.72rem}.document-badge{text-align:right;min-width:180px}.document-badge .label{display:inline-block;padding:5px 10px;border-radius:999px;background:#eaf2ff;color:#145da0;font-weight:700;font-size:.68rem;letter-spacing:.03em;text-transform:uppercase}.document-badge h2{margin:6px 0 2px;font-size:1rem;color:#0f3460}.document-badge p{margin:0;color:#66788a;font-size:.75rem}.info-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:10px}.info-card,.summary-card,.note{border:1px solid #d8e2ef;border-radius:16px;background:#f9fbfe}.info-card{padding:10px 12px}.info-card h3,.summary-section h3,.details-section h3{margin:0 0 8px;color:#0f3460;font-size:.86rem}.info-list{display:grid;gap:5px}.info-row{display:grid;grid-template-columns:120px 1fr;gap:6px;font-size:.74rem}.info-row .label{color:#66788a;font-weight:600}.info-row .value{color:#243447;font-weight:600}.summary-section{margin-bottom:10px}.summary-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.summary-card{padding:9px 10px;background:linear-gradient(180deg,#fbfdff 0%,#f1f6fc 100%)}.summary-card .label{display:block;color:#66788a;font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em;margin-bottom:4px}.summary-card .value{font-size:.94rem;font-weight:800;color:#0f3460}.summary-card.total{grid-column:1/-1;background:linear-gradient(135deg,#0f3460,#145da0);border-color:transparent}.summary-card.total .label,.summary-card.total .value{color:#fff}.details-section{margin-top:4px}.table-wrap{width:100%;border:1px solid #d8e2ef;border-radius:12px;overflow:hidden}table{border-collapse:separate;border-spacing:0;width:100%;table-layout:fixed;background:#fff}th,td{border-bottom:1px solid #e4ebf3;padding:5px 6px;font-size:.66rem;text-align:left;overflow-wrap:anywhere;word-break:break-word;vertical-align:top;line-height:1.2}thead th{background:#0f3460;color:#fff;font-weight:700}tbody tr:nth-child(even){background:#f9fbfe}.amount,.number{text-align:right;font-variant-numeric:tabular-nums}.expense-cell{display:grid;gap:3px}.expense-cell strong{font-size:.68rem;color:#243447}.route-line,.meta-line{color:#66788a;font-size:.62rem}.justif-links{display:flex;flex-wrap:wrap;gap:4px}.justif-links a{display:inline-flex;align-items:center;padding:2px 5px;border-radius:999px;background:#eaf2ff;color:#145da0;text-decoration:none;font-weight:700;font-size:.6rem}.total-row td{font-weight:800;background:#edf4ff;color:#0f3460;border-bottom:none}.note{margin-top:8px;padding:8px 10px;background:#fffaf0;border-left:5px solid #f59e0b;font-size:.68rem;line-height:1.35}.signature{margin-top:auto;padding-top:20px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;page-break-inside:avoid}.signature>div{min-height:46px;border-top:2px solid #243447;padding-top:6px;text-align:center;font-weight:600;font-size:.7rem}th:nth-child(1),td:nth-child(1){width:10%}th:nth-child(2),td:nth-child(2){width:33%}th:nth-child(3),td:nth-child(3){width:7%}th:nth-child(4),td:nth-child(4){width:10%}th:nth-child(5),td:nth-child(5){width:9%}th:nth-child(6),td:nth-child(6){width:9%}th:nth-child(7),td:nth-child(7){width:9%}th:nth-child(8),td:nth-child(8){width:13%}</style></head><body><div class="page-shell"><div class="page-inner">${controls}<div class="header"><div class="header-brand"><div class="header-logo"><img src="${logoUrl}" alt="Judo Club Cattenom-Rodemack"/></div><div class="header-text"><h1>Judo Club de Cattenom Rodemack</h1><p>Maison des arts martiaux</p><p>57570 Cattenom</p><p>judoclubcattenom@gmail.com</p></div></div><div class="document-badge"><span class="label">Document de remboursement</span><h2>Note de frais</h2><p>Période ${month}/${year}</p></div></div><div class="info-grid"><section class="info-card"><h3>Informations du demandeur</h3><div class="info-list"><div class="info-row"><span class="label">Nom et prénom</span><span class="value">${safeCoachDisplayName}</span></div><div class="info-row"><span class="label">Adresse</span><span class="value">${safeAddress}</span></div><div class="info-row"><span class="label">Poste</span><span class="value">${safeProfileLabel}</span></div><div class="info-row"><span class="label">Date d'édition</span><span class="value">${today}</span></div></div></section><section class="info-card"><h3>Informations véhicule</h3><div class="info-list"><div class="info-row"><span class="label">Véhicule</span><span class="value">${safeVehicle}</span></div><div class="info-row"><span class="label">Puissance fiscale</span><span class="value">${safeFiscalPower} CV</span></div><div class="info-row"><span class="label">Barème appliqué</span><span class="value">${safeMileageScaleDescription}</span></div><div class="info-row"><span class="label">Mois concerné</span><span class="value">${month}/${year}</span></div></div></section></div><section class="summary-section"><h3>Synthèse des remboursements</h3><div class="summary-grid"><div class="summary-card"><span class="label">Kilométrage</span><span class="value">${totalMileageAmount.toFixed(2).replace('.', ',')} €</span></div><div class="summary-card"><span class="label">Péages</span><span class="value">${totalTollAmount.toFixed(2).replace('.', ',')} €</span></div><div class="summary-card"><span class="label">Hôtel</span><span class="value">${totalHotelAmount.toFixed(2).replace('.', ',')} €</span></div><div class="summary-card"><span class="label">Achats</span><span class="value">${totalPurchaseAmount.toFixed(2).replace('.', ',')} €</span></div><div class="summary-card total"><span class="label">Total à rembourser</span><span class="value">${total.toFixed(2).replace('.', ',')} €</span></div></div></section><section class="details-section"><h3>Détail des dépenses</h3><div class="table-wrap"><table><thead><tr><th>Date</th><th>Dépense / trajet</th><th>Km</th><th>Km €</th><th>Péage</th><th>Hôtel</th><th>Achat</th><th>Total</th></tr></thead><tbody>${tableRows.join('')}<tr class="total-row"><td colspan="7" class="amount">TOTAL TTC</td><td class="amount">${total.toFixed(2).replace('.', ',')} €</td></tr></tbody></table></div></section><div class="note"><strong>ℹ️ Note :</strong> Le remboursement kilométrique est calculé selon le barème légal. Les péages, frais d'hôtel et achats sont remboursés sur montant réel. Un justificatif est obligatoire pour chaque péage, hôtel ou achat.</div><div class="signature"><div><strong>${safeSignatureLabel}</strong><br><br><br>${safeCoachDisplayName}</div><div><strong>Signature de l'employeur</strong><br><br><br>Président du Judo Club</div></div></div></div></body></html>`;
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
    const today = new Date().toLocaleDateString('fr-FR');
    const logoUrl = new URL('logo-jcc.png', window.location.href).href;
    const coachDisplayName = getCoachDisplayName(currentCoach) || currentCoach.name;
    const profileLabel = getProfileLabel(currentCoach, { capitalized: true });
    const signatureLabel = isVolunteerProfile(currentCoach) ? 'Signature du bénévole' : 'Signature du salarié';
    const hourlyRate = Number(currentCoach.hourly_rate) || 0;
    const dailyAllowance = Number(currentCoach.daily_allowance) || 0;
    const esc = (v, fb = '') => escapeHtml(v || fb);

    let totalHours = 0, competitionDays = 0, totalCompetitionAllowance = 0, totalTrainingAmount = 0, totalAmount = 0;
    const rows = [];
    Object.keys(timeData).filter((key) => key.startsWith(`${currentCoach.id}-${year}-${month}`)).sort().forEach((key) => {
      const date = key.split('-').slice(-3).join('-');
      const data = timeData[key];
      const hours = Number(data.hours) || 0;
      const competition = !!data.competition;
      if (hours > 0 || competition) {
        const trainingAmount = hours * hourlyRate;
        const competitionAllowance = competition ? dailyAllowance : 0;
        const lineTotal = trainingAmount + competitionAllowance;
        totalHours += hours; totalTrainingAmount += trainingAmount;
        if (competition) competitionDays++;
        totalCompetitionAllowance += competitionAllowance;
        totalAmount += lineTotal;
        rows.push({ date, hours, competition, trainingAmount, competitionAllowance, lineTotal, description: data.description || '' });
      }
    });

    if (!rows.length) { alert("Aucune heure d'entra\u00eenement ni comp\u00e9tition saisie pour ce mois."); return; }

    const tableRows = rows.map((r) => `
      <tr>
        <td>${esc(r.date)}</td>
        <td class="number">${r.hours}</td>
        <td class="amount">${hourlyRate.toFixed(2).replace('.', ',')} €</td>
        <td class="amount">${r.trainingAmount.toFixed(2).replace('.', ',')} €</td>
        <td class="amount">${r.competitionAllowance.toFixed(2).replace('.', ',')} €</td>
        <td class="amount">${r.lineTotal.toFixed(2).replace('.', ',')} €</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Relevé d'heures - ${esc(currentCoach.name)} - ${month}/${year}</title><style>*{box-sizing:border-box}@media print{@page{size:A4 portrait;margin:8mm}*{box-shadow:none!important;text-shadow:none!important;filter:none!important}html,body{width:194mm;margin:0;padding:0;background:white;-webkit-print-color-adjust:exact;print-color-adjust:exact}.no-print{display:none}.page-shell{box-shadow:none;border:none;margin:0;width:194mm;max-width:194mm;min-height:0!important;display:flex;border-radius:0}.page-inner{padding:0;min-height:0!important;display:flex;flex-direction:column}.header,.header-brand{display:flex!important;flex-direction:row!important;align-items:center!important;justify-content:space-between!important;gap:12px!important}.document-badge{text-align:right!important;min-width:180px!important}.info-grid,.summary-grid,.signature{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important}.info-row{grid-template-columns:120px 1fr!important}.summary-card.total{grid-column:1/-1!important}}body{margin:0;padding:10px;background:#eef3f9;color:#243447;font-family:Inter,Arial,sans-serif}.page-shell{width:194mm;max-width:194mm;min-height:245mm;margin:0 auto;background:#fff;border:none;border-radius:0;box-shadow:none;display:flex;overflow:hidden}.page-inner{padding:14px 16px 16px;min-height:245mm;display:flex;flex-direction:column}.print-button{margin:0 0 10px;padding:8px 14px;background:linear-gradient(135deg,#0f3460,#145da0);color:white;border:none;border-radius:999px;cursor:pointer;font-size:.82rem;font-weight:700}.close-button{margin-left:8px;background:linear-gradient(135deg,#c0392b,#922b21)}.header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;border-bottom:2px solid #d8e2ef;padding-bottom:10px;margin-bottom:10px}.header-brand{display:flex;align-items:flex-start;gap:12px}.header-logo{width:160px;height:160px;flex:0 0 auto;display:flex;align-items:flex-start;justify-content:center}.header-logo img{max-width:144px;max-height:144px}.header-text{text-align:center}.header-text h1{margin:0 0 4px;font-size:1.1rem;color:#0f3460}.header-text p{margin:1px 0;color:#526274;font-size:.72rem}.document-badge{text-align:right;min-width:180px}.document-badge .label{display:inline-block;padding:5px 10px;border-radius:999px;background:#eaf2ff;color:#145da0;font-weight:700;font-size:.68rem;letter-spacing:.03em;text-transform:uppercase}.document-badge h2{margin:6px 0 2px;font-size:1rem;color:#0f3460}.document-badge p{margin:0;color:#66788a;font-size:.75rem}.info-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:10px}.info-card,.summary-card,.note{border:1px solid #d8e2ef;border-radius:16px;background:#f9fbfe}.info-card{padding:10px 12px}.info-card h3,.summary-section h3,.details-section h3{margin:0 0 8px;color:#0f3460;font-size:.86rem}.info-list{display:grid;gap:5px}.info-row{display:grid;grid-template-columns:120px 1fr;gap:6px;font-size:.74rem}.info-row .label{color:#66788a;font-weight:600}.info-row .value{color:#243447;font-weight:600}.summary-section{margin-bottom:10px}.summary-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.summary-card{padding:9px 10px;background:linear-gradient(180deg,#fbfdff 0%,#f1f6fc 100%)}.summary-card .label{display:block;color:#66788a;font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em;margin-bottom:4px}.summary-card .value{font-size:.94rem;font-weight:800;color:#0f3460}.summary-card.total{grid-column:1/-1;background:linear-gradient(135deg,#0f3460,#145da0);border-color:transparent}.summary-card.total .label,.summary-card.total .value{color:#fff}.details-section{margin-top:4px}.table-wrap{width:100%;border:1px solid #d8e2ef;border-radius:12px;overflow:hidden}table{border-collapse:separate;border-spacing:0;width:100%;table-layout:fixed;background:#fff}th,td{border-bottom:1px solid #e4ebf3;padding:6px 8px;font-size:.7rem;text-align:left;vertical-align:top;line-height:1.3}thead th{background:#0f3460;color:#fff;font-weight:700}tbody tr:nth-child(even){background:#f9fbfe}.amount,.number{text-align:right;font-variant-numeric:tabular-nums}.total-row td{font-weight:800;background:#edf4ff;color:#0f3460;border-bottom:none}.signature{margin-top:auto;padding-top:20px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;page-break-inside:avoid}.signature>div{min-height:46px;border-top:2px solid #243447;padding-top:6px;text-align:center;font-weight:600;font-size:.7rem}th:nth-child(1),td:nth-child(1){width:16%}th:nth-child(2),td:nth-child(2){width:14%}th:nth-child(3),td:nth-child(3){width:14%}th:nth-child(4),td:nth-child(4){width:18%}th:nth-child(5),td:nth-child(5){width:18%}th:nth-child(6),td:nth-child(6){width:20%}</style></head><body><div class="no-print" style="margin-bottom:10px;text-align:center"><button class="print-button" onclick="window.print()">🖨 Imprimer / Enregistrer en PDF</button><button class="print-button close-button" onclick="window.close()">✖ Fermer</button></div><div class="page-shell"><div class="page-inner"><div class="header"><div class="header-brand"><div class="header-logo"><img src="${logoUrl}" alt="Judo Club Cattenom-Rodemack"/></div><div class="header-text"><h1>Judo Club de Cattenom Rodemack</h1><p>Maison des arts martiaux</p><p>57570 Cattenom</p><p>judoclubcattenom@gmail.com</p></div></div><div class="document-badge"><span class="label">Relevé d'heures mensuel</span><h2>${month}/${year}</h2><p>Édité le ${today}</p></div></div><div class="info-grid"><div class="info-card"><h3>Informations ${esc(profileLabel)}</h3><div class="info-list"><div class="info-row"><span class="label">Nom complet</span><span class="value">${esc(coachDisplayName)}</span></div><div class="info-row"><span class="label">Email</span><span class="value">${esc(currentCoach.email, '-')}</span></div><div class="info-row"><span class="label">Statut</span><span class="value">${esc(profileLabel)}</span></div></div></div><div class="info-card"><h3>Paramètres du mois</h3><div class="info-list"><div class="info-row"><span class="label">Mois / Année</span><span class="value">${month}/${year}</span></div><div class="info-row"><span class="label">Taux horaire</span><span class="value">${hourlyRate.toFixed(2)} €</span></div><div class="info-row"><span class="label">Indemnité compétition</span><span class="value">${dailyAllowance.toFixed(2)} €</span></div></div></div></div><div class="summary-section"><h3>Récapitulatif</h3><div class="summary-grid"><div class="summary-card"><span class="label">Total Heures</span><span class="value">${totalHours}</span></div><div class="summary-card"><span class="label">Jours compétition</span><span class="value">${competitionDays}</span></div><div class="summary-card"><span class="label">Indemnités compétition</span><span class="value">${totalCompetitionAllowance.toFixed(2)} €</span></div><div class="summary-card total"><span class="label">Total à payer</span><span class="value">${totalAmount.toFixed(2)} €</span></div></div></div><div class="details-section"><h3>Détail des heures et compétitions</h3><div class="table-wrap"><table><thead><tr><th>Date</th><th class="number">Durée (h)</th><th class="amount">Taux</th><th class="amount">Montant heures</th><th class="amount">Indemnité compétition</th><th class="amount">Total ligne</th></tr></thead><tbody>${tableRows}<tr class="total-row"><td>Total</td><td class="number">${totalHours}</td><td class="amount">-</td><td class="amount">${totalTrainingAmount.toFixed(2)} €</td><td class="amount">${totalCompetitionAllowance.toFixed(2)} €</td><td class="amount">${totalAmount.toFixed(2)} €</td></tr></tbody></table></div></div><div class="signature"><div>${esc(signatureLabel)}</div><div>Pour le club (Trésorier / Président)</div></div></div></div></body></html>`;

    __showMileagePreviewModal(html, `fiche_presence_${String(currentCoach.name || 'intervenant').replace(/[^a-z0-9_\-]/gi, '_')}_${currentMonth}.html`);
    await logAuditEvent('export.timesheet_html', 'export', buildMonthlyAuditPayload({ coach: currentCoach, entityId: `${currentCoach.id}-${currentMonth}`, metadata: { total_hours: totalHours, competition_days: competitionDays } }));
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
    const timeData = getTimeData();
    const coaches = getCoaches ? getCoaches() : [];
    if (!currentMonth) { alert('Veuillez sélectionner un mois.'); return; }

    const [year, month] = currentMonth.split('-');
    const monthLabel = new Date(Number(year), Number(month) - 1, 1)
      .toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

    const rows = coaches.map((coach) => {
      const keys = Object.keys(timeData).filter((k) => k.startsWith(`${coach.id}-${year}-${month}`));
      const totalHours = keys.reduce((s, k) => s + (timeData[k].hours || 0), 0);
      const totalCompetitions = keys.filter((k) => timeData[k].competition).length;
      const totalKm = keys.reduce((s, k) => s + (Number(timeData[k].km) || 0), 0);
      const mileage = getMonthlyMileageBreakdown(coach, currentMonth);
      const totalMileageAmount = mileage?.total || 0;
      const salary = isVolunteerProfile(coach) ? 0 : totalHours * (coach.hourly_rate || 0);
      return { coach, totalHours, totalCompetitions, totalKm, totalMileageAmount, salary };
    }).filter((r) => r.totalHours > 0 || r.totalKm > 0);

    if (rows.length === 0) { alert(`Aucune donnée saisie pour ${monthLabel}.`); return; }

    const fmt = (n) => Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const totalSalary = rows.reduce((s, r) => s + r.salary, 0);
    const totalMileage = rows.reduce((s, r) => s + r.totalMileageAmount, 0);

    const tableRows = rows.map((r) => `
      <tr>
        <td>${escapeHtml(getCoachDisplayName(r.coach))}</td>
        <td>${escapeHtml(getProfileLabel(r.coach) || (isVolunteerProfile(r.coach) ? 'Bénévole' : 'Entraîneur'))}</td>
        <td style="text-align:center">${r.totalHours}</td>
        <td style="text-align:center">${r.totalCompetitions}</td>
        <td style="text-align:center">${r.totalKm}</td>
        <td style="text-align:right">${fmt(r.totalMileageAmount)} €</td>
        <td style="text-align:right">${isVolunteerProfile(r.coach) ? '—' : fmt(r.salary) + ' €'}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
      <title>Synthèse ${monthLabel}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 24px; font-size: 13px; }
        h2 { color: #1a1a2e; }
        table { border-collapse: collapse; width: 100%; margin-top: 16px; }
        th { background: #1a1a2e; color: #fff; padding: 8px 12px; text-align: left; }
        td { padding: 7px 12px; border-bottom: 1px solid #e0e0e0; }
        tr:nth-child(even) td { background: #f7f7f7; }
        tfoot td { font-weight: bold; border-top: 2px solid #1a1a2e; }
      </style></head><body>
      <h2>📊 Synthèse du mois — ${escapeHtml(monthLabel)}</h2>
      <table>
        <thead><tr>
          <th>Profil</th><th>Type</th><th>Heures</th><th>Compétitions</th><th>Km</th><th>Indemnités km</th><th>Salaire brut</th>
        </tr></thead>
        <tbody>${tableRows}</tbody>
        <tfoot><tr>
          <td colspan="5">Total</td>
          <td style="text-align:right">${fmt(totalMileage)} €</td>
          <td style="text-align:right">${fmt(totalSalary)} €</td>
        </tr></tfoot>
      </table>
    </body></html>`;

    __showMileagePreviewModal(html, `synthese_${currentMonth}.html`);
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
