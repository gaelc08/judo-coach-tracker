// Utilitaire d'import des données adhérents
// Supporte : JSON (export API club), CSV (export HelloAsso)

export function parseHelloAssoCSV(csvText) {
  const lines = csvText.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));

  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
    const row = {};
    headers.forEach((h, i) => row[h] = values[i] || '');

    // Mapping HelloAsso → modèle interne
    return {
      nom:            row['Nom'] || row['nom'] || '',
      prenom:         row['Prénom'] || row['prenom'] || '',
      date_naissance: row['Date de naissance'] || row['dateNaissance'] || '',
      email:          row['Email'] || row['email'] || '',
      telephone:      row['Téléphone'] || row['telephone'] || '',
      adresse:        row['Adresse'] || row['adresse'] || '',
      code_postal:    row['Code postal'] || row['codePostal'] || '',
      ville:          row['Ville'] || row['ville'] || '',
      sexe:           row['Sexe'] || row['sexe'] || '',
      discipline:     row['Discipline'] || row['discipline'] || 'Judo',
    };
  }).filter(a => a.nom && a.prenom);
}

export function parseJSON(jsonText) {
  try {
    const data = JSON.parse(jsonText);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
