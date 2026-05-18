// import.js — v2026.05.18-02
// Convertisseur HelloAsso XLSX → JSON pour l'extension

const CLUB_CONFIG = {
  judo:  { pratique: '1',  type_pratique: 'C', fonction: '4' },
  iaido: { pratique: '13', type_pratique: 'C', fonction: '4' },
};

// Mapping colonnes HelloAsso (insensible à la casse, trim)
const COL = {
  nom:       ['nom adhérent', 'nom'],
  prenom:    ['prénom adhérent', 'prenom adhérent', 'prénom', 'prenom'],
  ddn:       ['date de naissance'],
  sexe:      ['sexe'],
  email:     ['email payeur', 'email'],
  tel:       ['téléphone', 'telephone', 'numéro de téléphone'],
  adresse:   ['adresse postale (numéro + rue)', 'adresse postale', 'adresse'],
  cp:        ['code postal'],
  ville:     ['ville'],
  certificat:['certificat médical (obligatoire à partir de benjamin) ou questionnaire santé sport', 'certificat'],
};

let parsedAdherents = [];

const dropZone   = document.getElementById('drop-zone');
const fileInput  = document.getElementById('file-input');
const fileName   = document.getElementById('file-name');
const preview    = document.getElementById('preview');
const previewList = document.getElementById('preview-list');
const previewCount = document.getElementById('preview-count');
const warnSexe   = document.getElementById('warning-sexe');
const status     = document.getElementById('status');
const btnImport  = document.getElementById('btn-import');
const selClub    = document.getElementById('sel-club');

document.getElementById('btn-back').addEventListener('click', () => {
  window.location.href = 'popup.html';
});

// Drag & drop
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleFile(fileInput.files[0]);
});
selClub.addEventListener('change', () => {
  if (parsedAdherents.length > 0) applyClubConfig();
});

function showStatus(msg, type = 'info') {
  status.textContent = msg;
  status.className = `status ${type}`;
  status.classList.remove('hidden');
}

function findCol(headers, keys) {
  for (const key of keys) {
    const idx = headers.findIndex(h => h.trim().toLowerCase() === key.toLowerCase());
    if (idx >= 0) return idx;
  }
  return -1;
}

function normalizeDate(val) {
  if (!val) return '';
  if (typeof val === 'number') {
    // Excel serial date
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  const s = String(val).trim();
  // YYYY-MM-DD déjà bon
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // DD/MM/YYYY
  const m = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return s.slice(0, 10);
}

function handleFile(file) {
  fileName.textContent = file.name;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = new Uint8Array(e.target.result);
      const wb   = XLSX.read(data, { type: 'array', cellDates: false });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

      if (rows.length < 2) { showStatus('Fichier vide ou invalide.', 'error'); return; }

      const headers = rows[0].map(h => String(h).trim().toLowerCase());

      // Résoudre les index de colonnes
      const idx = {};
      for (const [field, keys] of Object.entries(COL)) {
        idx[field] = findCol(headers, keys);
      }

      if (idx.nom < 0 || idx.prenom < 0) {
        showStatus('Colonnes Nom/Prénom introuvables. Vérifiez le fichier HelloAsso.', 'error');
        return;
      }

      const club = CLUB_CONFIG[selClub.value];

      parsedAdherents = rows.slice(1)
        .filter(r => r[idx.nom] && String(r[idx.nom]).trim())
        .map(r => ({
          nom:           String(r[idx.nom] || '').trim().toUpperCase(),
          prenom:        String(r[idx.prenom] || '').trim(),
          date_naissance: normalizeDate(r[idx.ddn]),
          sexe:          idx.sexe >= 0 ? String(r[idx.sexe] || '').trim().toUpperCase() : '',
          email:         idx.email >= 0 ? String(r[idx.email] || '').trim() : '',
          telephone:     idx.tel >= 0   ? String(r[idx.tel]   || '').trim() : '',
          adresse:       idx.adresse >= 0 ? String(r[idx.adresse] || '').trim() : '',
          code_postal:   idx.cp >= 0    ? String(r[idx.cp]    || '').trim() : '',
          ville:         idx.ville >= 0  ? String(r[idx.ville] || '').trim().toUpperCase() : '',
          certificat:    idx.certificat >= 0 ? String(r[idx.certificat] || '').trim() : '',
          pratique:      club.pratique,
          type_pratique: club.type_pratique,
          fonction:      club.fonction,
        }));

      renderPreview();
    } catch(err) {
      showStatus('Erreur de lecture : ' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

function applyClubConfig() {
  const club = CLUB_CONFIG[selClub.value];
  parsedAdherents = parsedAdherents.map(a => ({
    ...a,
    pratique:      club.pratique,
    type_pratique: club.type_pratique,
    fonction:      club.fonction,
  }));
  renderPreview();
}

function renderPreview() {
  if (parsedAdherents.length === 0) {
    preview.classList.add('hidden');
    btnImport.disabled = true;
    return;
  }

  const missingCount = parsedAdherents.filter(a => !a.sexe).length;
  previewCount.textContent = `${parsedAdherents.length} adhérent(s) détecté(s)`;
  warnSexe.classList.toggle('hidden', missingCount === 0);

  previewList.innerHTML = '';
  parsedAdherents.forEach(a => {
    const div = document.createElement('div');
    div.className = 'preview-item';
    const sexeHtml = a.sexe
      ? `<span class="psexe-ok">${a.sexe}</span>`
      : `<span class="psexe-missing">Sexe ?</span>`;
    div.innerHTML = `
      <div>
        <span class="pname">${a.nom} ${a.prenom}</span>
        <span class="pmeta"> — ${a.date_naissance || '?'}</span>
      </div>
      ${sexeHtml}
    `;
    previewList.appendChild(div);
  });

  preview.classList.remove('hidden');
  btnImport.disabled = false;

  if (missingCount > 0) {
    showStatus(`${missingCount} adhérent(s) sans sexe — ajoutez la colonne "Sexe" dans HelloAsso.`, 'error');
  } else {
    showStatus(`${parsedAdherents.length} adhérent(s) prêts à importer.`, 'success');
  }
}

btnImport.addEventListener('click', () => {
  if (parsedAdherents.length === 0) return;
  chrome.storage.local.set({ adherents: parsedAdherents }, () => {
    showStatus(`✅ ${parsedAdherents.length} adhérent(s) importé(s) avec succès !`, 'success');
    btnImport.disabled = true;
    setTimeout(() => { window.location.href = 'popup.html'; }, 1200);
  });
});
