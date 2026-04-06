export async function loadExcelJs() {
  if (!window.__excelJsModulePromise) {
    window.__excelJsModulePromise = import('https://esm.sh/exceljs@4.4.0');
  }

  const module = await window.__excelJsModulePromise;
  return module?.default || module;
}

export async function blobToDataUrl(blob) {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Impossible de lire le logo.'));
    reader.readAsDataURL(blob);
  });
}

export function isStandaloneApp() {
  return window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone === true;
}

export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Fonction pour exporter les dépenses mensuelles
function exportMonthlyExpenses(format) {
  console.log(`Export des dépenses mensuelles au format ${format}...`);
  alert(`Export des dépenses mensuelles au format ${format} en cours...`);

  // Logique d'export à implémenter (appel API, génération de fichier, etc.)
  // Exemple : fetch('/api/export?format=' + format).then(...)
}
