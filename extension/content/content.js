// Content script — injecté sur moncompte.ffjudo.com
// Étape 1 : nom, prenom, sexe, naissance
// Étape 2 : formulaire complet

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

function setCheckbox(id, checked) {
  const el = document.getElementById(id) || document.querySelector(`input[name="${id}"]`);
  if (!el) return false;
  el.checked = checked;
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

// Select2 : ouvre le dropdown, tape la recherche, attend les résultats, clique l'option.
// Retourne une Promise.
function fillSelect2(selectName, searchText, targetText) {
  return new Promise((resolve) => {
    if (typeof jQuery === 'undefined') { resolve(false); return; }
    const $select = jQuery(`[name="${selectName}"]`);
    if (!$select.length || !$select.data('select2')) { resolve(false); return; }

    // 1. Ouvrir le dropdown
    $select.select2('open');

    setTimeout(() => {
      // 2. Trouver l'input de recherche actif
      const searchInput = document.querySelector('.select2-search__field');
      if (!searchInput) { $select.select2('close'); resolve(false); return; }

      // 3. Taper le texte de recherche caractère par caractère pour déclencher l'AJAX
      searchInput.focus();
      searchInput.value = '';
      for (const char of searchText) {
        searchInput.value += char;
        searchInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: char }));
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        searchInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: char }));
      }

      // 4. Attendre le chargement des options AJAX
      setTimeout(() => {
        const options = document.querySelectorAll('.select2-results__option:not(.select2-results__option--disabled):not(.select2-results__option--loading)');
        const match = targetText
          ? [...options].find(o => o.textContent.toUpperCase().includes(targetText.toUpperCase()))
          : options[0];

        if (match) {
          match.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          match.click();
          resolve(true);
        } else if (options[0]) {
          options[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          options[0].click();
          resolve(true);
        } else {
          $select.select2('close');
          resolve(false);
        }
      }, 1500); // attente chargement résultats AJAX
    }, 500);  // attente ouverture dropdown
  });
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

async function fillStep2(a) {
  let filled = 0;

  // Champs texte simples
  if (setInput('nom', a.nom)) filled++;
  if (setInput('prenom', a.prenom)) filled++;
  if (setInput('date_naissance', a.date_naissance)) filled++;
  if (setInput('portable', a.telephone)) filled++;
  if (setInput('mail', a.email)) filled++;
  if (setInput('mail-confirm', a.email)) filled++;

  // Sexe
  if (a.sexe && setSelect('sexe', a.sexe === 'F' ? 'F' : 'M')) filled++;

  // Code postal Select2 : recherche par CP, cible "CP VILLE"
  if (a.code_postal) {
    const cpTarget = a.ville ? `${a.code_postal} ${a.ville.toUpperCase()}` : a.code_postal;
    const cpOk = await fillSelect2('cp', a.code_postal, cpTarget);
    if (cpOk) filled++;

    // Adresse Select2 : après le CP (attendre que le select adresse soit actif)
    if (a.adresse) {
      await new Promise(r => setTimeout(r, 800));
      const adresseOk = await fillSelect2('adresse', a.adresse, a.adresse);
      if (adresseOk) filled++;
    }
  }

  // Pratique : Judo = 1, Jujitsu = 2, Taïso = 3, Non pratiquant = 4
  if (setSelect('pratiques_1', a.pratique || '1')) filled++;

  // Type pratique : L = Loisir, C = Compétition
  if (setRadio('type_pratique_1', a.type_pratique || 'L')) filled++;

  // Handicap : Non par défaut
  setRadio('handicap', '0');

  // Certificat médical
  if (a.certificat) setSelect('certificat', a.certificat);

  // Questionnaire santé : cocher si certificat = QU
  if (a.certificat === 'QU') {
    if (setCheckbox('chk_questionnaire', true)) filled++;
  }

  // Fonction : 1 = dirigeant/entraîneur, 4 = adhérent simple (Non)
  if (setRadio('fonction', a.fonction || '4')) filled++;

  // Souscription commerciale FFJDA : Non = valeur 1
  setRadio('souscription', '1');

  // Newsletter : Non = valeur 0
  setRadio('newsletter', '0');

  // Assurance : cocher
  if (setCheckbox('assurance', true)) filled++;

  // RGPD : cocher
  setCheckbox('rgpd', true);

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
