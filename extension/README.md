# Extension Chrome — Saisie FFJDA

Extension Chrome (Manifest V3) pour préremplir automatiquement le formulaire de prise de licence sur [moncompte.ffjudo.com](https://moncompte.ffjudo.com) à partir des données adhérents du club.

## Fonctionnement

1. Importer les données adhérents (JSON ou CSV HelloAsso)
2. Ouvrir la page de saisie de licence sur moncompte.ffjudo.com
3. Cliquer sur l'icône de l'extension
4. Sélectionner l'adhérent à saisir
5. Cliquer sur **Préremplir le formulaire FFJDA**
6. Vérifier les champs et soumettre manuellement

## Structure

```
extension/
├── manifest.json          # Config MV3
├── popup/
│   ├── popup.html         # Interface utilisateur
│   ├── popup.css          # Styles
│   └── popup.js           # Logique popup
├── content/
│   └── content.js         # Injection dans la page FFJDA
├── background/
│   └── background.js      # Service worker
├── utils/
│   └── import.js          # Parseur CSV HelloAsso / JSON
└── icons/                 # Icônes à ajouter (16, 48, 128px)
```

## Installation (mode développeur)

1. Ouvrir Chrome → `chrome://extensions`
2. Activer le **Mode développeur** (en haut à droite)
3. Cliquer **Charger l'extension non empaquetée**
4. Sélectionner le dossier `extension/`

## ⚠️ Points à valider

- **Sélecteurs CSS** : les sélecteurs dans `content/content.js` (section `FIELD_MAP`) doivent être affinés une fois la page FFJDA inspectée avec les DevTools. Le DOM exact de `moncompte.ffjudo.com` doit être analysé pour identifier les vrais `name` / `id` des champs.
- **Format HelloAsso CSV** : les noms de colonnes dans `utils/import.js` doivent correspondre à l'export réel HelloAsso du club.
- **Icônes** : ajouter des icônes PNG dans `icons/` (16×16, 48×48, 128×128).

## Prochaines étapes

- [ ] Inspecter le DOM de la page FFJDA et corriger les sélecteurs
- [ ] Ajouter une page d'import CSV/JSON dans la popup
- [ ] Connecter directement à l'API club pour éviter les imports manuels
- [ ] Gérer le statut « licence saisie » en retour dans l'app club
