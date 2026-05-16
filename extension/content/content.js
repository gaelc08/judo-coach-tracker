// Content script — injecté sur moncompte.ffjudo.com
// Écoute les messages de la popup et remplit les champs du formulaire FFJDA

function setFieldValue(selector, value) {
  const el = document.querySelector(selector);
  if (!el || !value) return false;

  // Déclenche les events React/Vue si présents
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  )?.set;
  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(el, value);
  } else {
    el.value = value;
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

function setSelectValue(selector, value) {
  const el = document.querySelector(selector);
  if (!el || !value) return false;
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

// Cartographie des champs FFJDA — à affiner une fois la page inspectée
// Les sélecteurs sont des estimations à valider en inspectant le DOM réel
const FIELD_MAP = {
  nom:            '[name="nom"], [id*="nom"], [placeholder*="Nom"]',
  prenom:         '[name="prenom"], [id*="prenom"], [placeholder*="Prénom"]',
  date_naissance: '[name="dateNaissance"], [id*="dateNaissance"], [type="date"]',
  email:          '[name="email"], [type="email"]',
  telephone:      '[name="telephone"], [name="tel"], [type="tel"]',
  adresse:        '[name="adresse"], [id*="adresse"]',
  code_postal:    '[name="codePostal"], [name="cp"], [id*="codePostal"]',
  ville:          '[name="ville"], [id*="ville"]',
};

function fillForm(adherent) {
  let filled = 0;
  let total = 0;

  for (const [key, selector] of Object.entries(FIELD_MAP)) {
    if (adherent[key]) {
      total++;
      const ok = setFieldValue(selector, adherent[key]);
      if (ok) filled++;
    }
  }

  // Sexe (souvent un select ou radio)
  if (adherent.sexe) {
    total++;
    const ok = setSelectValue('[name="sexe"], [id*="sexe"]', adherent.sexe);
    if (ok) filled++;
  }

  return { success: filled > 0, filled, total };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'fill_form') {
    const result = fillForm(message.adherent);
    sendResponse(result);
  }
  return true; // async response
});
