// Content script — injecté sur moncompte.ffjudo.com
// Étape 1 : nom, prenom, sexe, naissance
// Étape 2 : formulaire complet
// CP et Adresse sont des Select2 : on injecte l'option et on la sélectionne via jQuery.

// --- Helpers ---

function setInput(name, value) {
  const el = document.querySelector(`[name="${name}"]`);
  if (!el || !value) return false;
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

function setSelect(name, value) {
  const el = document.querySelector(`[name="${name}"]`);
  if (!el || !value) return false;
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

function setCheckbox(name, checked) {
  const el = document.querySelector(`input[name="${name}"]`);
  if (!el) return false;
  el.checked = checked;
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

// Helper générique Select2 : injecte une option et la sélectionne.
// La valeur est toujours en MAJUSCULES (format FFJDA).
function setSelect2(selectName, value) {
  if (typeof jQuery === 'undefined') return false;
  const $select = jQuery(`[name="${selectName}"]`);
  if (!$select.length || !$select.data('select2')) return false;

  const label = value.toUpperCase();

  if (!$select.find(`option[value="${label}"]`).length) {
    $select.append(new Option(label, label, true, true));
  }
  $select.val(label).trigger('change');
  return true;
}

// CP : format "57970 BASSE-HAM" → la page remplit CP et Ville automatiquement
function setSelect2CP(codePostal, ville) {
  const label = ville
    ? `${codePostal} ${ville.toUpperCase()}`
    : codePostal;
  return setSelect2('cp', label);
}

// Adresse : format "3 IMPASSE DU MOULIN"
function setSelect2Adresse(adresse) {
  return setSelect2('adresse', adresse);
}

// --- Étape 1 : nom / prenom / sexe / naissance ---

function fillStep1(a) {
  let filled = 0;
  if (setInput('nom', a.nom)) filled++;
  if (setInput('prenom', a.prenom)) filled++;
  if (a.sexe && setSelect('sexe', a.sexe === 'F' ? 'F' : 'M')) filled++;
  if (setInput('naissance', a.date_naissance || '')) filled++;
  return { success: filled > 0, filled };
}

// --- Étape 2 : formulaire complet ---

function fillStep2(a) {
  let filled = 0;

  // Champs texte
  if (setInput('nom', a.nom)) filled++;
  if (setInput('prenom', a.prenom)) filled++;
  if (setInput('date_naissance', a.date_naissance)) filled++;
  if (setInput('portable', a.telephone)) filled++;
  if (setInput('mail', a.email)) filled++;
  if (setInput('mail-confirm', a.email)) filled++;

  // Sexe
  if (a.sexe && setSelect('sexe', a.sexe === 'F' ? 'F' : 'M')) filled++;

  // Code postal Select2 : "57970 BASSE-HAM" → remplit CP + Ville
  if (a.code_postal && setSelect2CP(a.code_postal, a.ville)) filled++;

  // Adresse Select2 : "3 IMPASSE DU MOULIN"
  // Stocker adresse comme un champ unique dans les données adhérent
  if (a.adresse && setSelect2Adresse(a.adresse)) filled++;

  // Pratique : Judo = 1, Jujitsu = 2, Taïso = 3, Non pratiquant = 4
  if (setSelect('pratiques_1', a.pratique || '1')) filled++;

  // Type pratique : L = Loisir, C = Compétition
  if (setRadio('type_pratique_1', a.type_pratique || 'L')) filled++;

  // Pas de handicap par défaut
  setRadio('handicap', '0');

  // Certificat : QU = Questionnaire, SP = Sportif, SC = Sportif en compétition, NP = Non pratiquant
  if (a.certificat) setSelect('certificat', a.certificat);

  return { success: filled > 0, filled };
}

// --- Détection de l'étape courante ---

function detectStep() {
  const hasNaissance = !!document.querySelector('[name="naissance"]');
  const hasDateNaissance = !!document.querySelector('[name="date_naissance"]');
  if (hasNaissance && !hasDateNaissance) return 1;
  if (hasDateNaissance) return 2;
  return 0;
}

// --- Listener messages popup ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'fill_form') {
    const step = detectStep();
    if (step === 1) {
      sendResponse({ ...fillStep1(message.adherent), step: 1 });
    } else if (step === 2) {
      sendResponse({ ...fillStep2(message.adherent), step: 2 });
    } else {
      sendResponse({ success: false, step: 0, error: 'Page non reconnue' });
    }
  }
  return true;
});
