// Content script — injecté sur moncompte.ffjudo.com
// Étape 1 : nom, prenom, sexe, naissance
// Étape 2 : formulaire complet avec Select2 pour CP/adresse

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

// Select2 : saisie du code postal dans le champ de recherche
// puis sélection de l'option correspondant à "CP VILLE"
function setSelect2CP(cpValue, villeValue) {
  return new Promise((resolve) => {
    // Ouvrir le dropdown Select2
    const container = document.querySelector('.cp-selector + .select2-container');
    if (!container) { resolve(false); return; }

    // Déclencher le clic via jQuery/Select2
    if (typeof jQuery !== 'undefined' && jQuery('[name="cp"]').data('select2')) {
      jQuery('[name="cp"]').select2('open');
    } else {
      container.querySelector('.select2-selection')?.click();
    }

    // Attendre que l'input de recherche apparaisse
    setTimeout(() => {
      const searchInput = document.querySelector('.select2-search__field');
      if (!searchInput) { resolve(false); return; }

      // Taper le code postal
      searchInput.value = cpValue;
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));

      // Attendre le chargement des résultats
      setTimeout(() => {
        // Chercher l'option qui contient CP + ville
        const options = document.querySelectorAll('.select2-results__option');
        const target = [...options].find(o =>
          o.textContent.includes(cpValue) &&
          (!villeValue || o.textContent.toUpperCase().includes(villeValue.toUpperCase()))
        );

        if (target) {
          target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          target.click();
          resolve(true);
        } else {
          resolve(false);
        }
      }, 800); // attente chargement options
    }, 300); // attente ouverture dropdown
  });
}

// --- Étape 1 : nom / prenom / sexe / naissance ---

function fillStep1(a) {
  let filled = 0;
  if (setInput('nom', a.nom)) filled++;
  if (setInput('prenom', a.prenom)) filled++;
  if (a.sexe && setSelect('sexe', a.sexe === 'F' ? 'F' : 'M')) filled++;
  // Étape 1 utilise "naissance", étape 2 utilise "date_naissance"
  const ddn = a.date_naissance || '';
  if (setInput('naissance', ddn)) filled++;
  return { success: filled > 0, filled };
}

// --- Étape 2 : formulaire complet ---

async function fillStep2(a) {
  let filled = 0;

  // Champs texte
  if (setInput('nom', a.nom)) filled++;
  if (setInput('prenom', a.prenom)) filled++;
  if (setInput('date_naissance', a.date_naissance)) filled++;
  if (setInput('portable', a.telephone)) filled++;
  if (setInput('mail', a.email)) filled++;
  if (setInput('mail-confirm', a.email)) filled++;
  if (setInput('ville-all', a.ville)) filled++;

  // Sexe
  if (a.sexe && setSelect('sexe', a.sexe === 'F' ? 'F' : 'M')) filled++;

  // Pratique : Judo = 1, Jujitsu = 2, Taïso = 3, Non pratiquant = 4
  const pratique = a.pratique || '1';
  if (setSelect('pratiques_1', pratique)) filled++;

  // Type pratique : L = Loisir, C = Compétition
  const typePratique = a.type_pratique || 'L';
  if (setRadio('type_pratique_1', typePratique)) filled++;

  // Pas de handicap par défaut
  setRadio('handicap', '0');

  // Certificat : QU = Questionnaire, SP = Sportif, SC = Sportif en compétition, NP = Non pratiquant
  if (a.certificat && setSelect('certificat', a.certificat)) filled++;

  // Code postal via Select2
  if (a.code_postal) {
    const cpOk = await setSelect2CP(a.code_postal, a.ville);
    if (cpOk) filled++;
  }

  return { success: filled > 0, filled };
}

// --- Détection de l'étape courante ---

function detectStep() {
  // Étape 1 : présence du champ "naissance" sans "date_naissance"
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
      const result = fillStep1(message.adherent);
      sendResponse({ ...result, step: 1 });
    } else if (step === 2) {
      fillStep2(message.adherent).then(result => {
        sendResponse({ ...result, step: 2 });
      });
      return true; // async
    } else {
      sendResponse({ success: false, step: 0, error: 'Page non reconnue' });
    }
  }
  return true;
});
