# Charte Graphique — Judo Club Cattenom Rodemack

> Version 1.0 — Mars 2026  
> Basée sur le logo officiel `logo-jcc.png`

---

## 1. Logo

### Fichier de référence
- **Source** : `public/logo-jcc.png` (repo GitHub)
- **Format** : PNG avec transparence recommandée
- **Usage** : toujours utiliser le fichier original, ne jamais recréer le logo manuellement

### Zones de protection
- Laisser un espace libre autour du logo égal à **1/4 de son diamètre** sur tous les côtés
- Ne pas déformer, étirer, ni appliquer d'effets (ombre portée, filtre, rotation)

### Variantes autorisées
| Variante | Fond | Usage |
|---|---|---|
| Couleur complète | Blanc ou clair | Usage principal |
| Monochrome bleu marine | Blanc | Impression N&B |
| Inversé blanc | Bleu marine ou sombre | Headers sombres |

### Taille minimale
- **Web** : 48 × 48 px
- **Print** : 2 cm de diamètre

---

## 2. Palette de couleurs

### Couleurs primaires

| Nom | Hex | RGB | Usage |
|---|---|---|---|
| **Jaune Club** | `#FFC857` | 255, 200, 87 | Accent, CTA, badges, highlights |
| **Bleu Marine** | `#1E3A7B` | 30, 58, 123 | Titres, headers, navigation, boutons principaux |

### Couleurs secondaires

| Nom | Hex | RGB | Usage |
|---|---|---|---|
| **Bleu Clair** | `#3A5FA0` | 58, 95, 160 | Fonds de section, cartes, bordures |
| **Jaune Doux** | `#FFE299` | 255, 226, 153 | Fonds clairs, alertes info |

### Couleurs neutres

| Nom | Hex | RGB | Usage |
|---|---|---|---|
| **Noir Judo** | `#1A1A1A` | 26, 26, 26 | Corps de texte principal |
| **Gris Tatami** | `#6B7280` | 107, 114, 128 | Texte secondaire, légendes |
| **Gris Clair** | `#F3F4F6` | 243, 244, 246 | Fonds de page, zones neutres |
| **Blanc** | `#FFFFFF` | 255, 255, 255 | Fonds de contenu, texte inversé |

### Couleurs fonctionnelles

| Nom | Hex | Usage |
|---|---|---|
| **Succès** | `#16A34A` | Confirmations, validations |
| **Erreur** | `#DC2626` | Erreurs, alertes critiques |
| **Avertissement** | `#D97706` | Avertissements, en attente |
| **Info** | `#2563EB` | Informations neutres |

---

## 3. Typographie

### Titres — **Oswald**
- Google Fonts : `Oswald` (Bold 700, SemiBold 600)
- Style : condensé, fort, sportif — proche de l'esprit slab serif du logo
- Usage : H1, H2, noms de sections, bannières

```css
font-family: 'Oswald', sans-serif;
font-weight: 700;
letter-spacing: 0.05em;
text-transform: uppercase;
```

### Corps de texte — **Inter**
- Google Fonts : `Inter` (Regular 400, Medium 500, SemiBold 600)
- Style : moderne, lisible sur écran
- Usage : paragraphes, listes, formulaires, navigation

```css
font-family: 'Inter', sans-serif;
font-weight: 400;
line-height: 1.6;
```

### Import Google Fonts
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
```

### Hiérarchie typographique

| Niveau | Police | Taille | Poids | Couleur |
|---|---|---|---|---|
| H1 | Oswald | 2.5rem | 700 | `#1E3A7B` |
| H2 | Oswald | 2rem | 700 | `#1E3A7B` |
| H3 | Oswald | 1.5rem | 600 | `#1E3A7B` |
| Corps | Inter | 1rem | 400 | `#1A1A1A` |
| Secondaire | Inter | 0.875rem | 400 | `#6B7280` |
| Label | Inter | 0.75rem | 600 | `#6B7280` |

---

## 4. Composants UI

### Bouton principal
```css
background-color: #1E3A7B;
color: #FFFFFF;
border-radius: 6px;
padding: 10px 20px;
font-family: 'Inter', sans-serif;
font-weight: 600;
```
**Hover** : `background-color: #3A5FA0`

### Bouton accent (CTA)
```css
background-color: #FFC857;
color: #1A1A1A;
border-radius: 6px;
padding: 10px 20px;
font-family: 'Inter', sans-serif;
font-weight: 600;
```
**Hover** : `background-color: #FFE299`

### Bouton outline
```css
background-color: transparent;
color: #1E3A7B;
border: 2px solid #1E3A7B;
border-radius: 6px;
```

### Cartes / Cards
```css
background: #FFFFFF;
border: 1px solid #E5E7EB;
border-radius: 8px;
box-shadow: 0 1px 3px rgba(0,0,0,0.08);
padding: 16px;
```

### Header / Navigation
```css
background-color: #1E3A7B;
color: #FFFFFF;
/* Accent sur lien actif */
border-bottom: 3px solid #FFC857;
```

### Badges / Tags
```css
/* Badge principal */
background-color: #FFC857;
color: #1A1A1A;
border-radius: 9999px;
padding: 2px 10px;
font-size: 0.75rem;
font-weight: 600;
```

---

## 5. Espacement et grille

- **Unité de base** : 4px
- **Espacements courants** : 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 px
- **Largeur max contenu** : 1200px
- **Gouttières** : 24px (mobile) / 32px (desktop)
- **Border-radius** : 4px (petit) / 6px (moyen) / 8px (cartes) / 9999px (pilules)

---

## 6. Icônes

- **Bibliothèque recommandée** : [Heroicons](https://heroicons.com/) (style outline)
- Taille standard : 20px (inline) / 24px (standalone)
- Couleur : hérite de la couleur du texte parent

---

## 7. Application WordPress

### CSS personnalisé à ajouter dans **Apparence → Personnaliser → CSS additionnel**

```css
/* === JCC Brand Variables === */
:root {
  --jcc-blue: #1E3A7B;
  --jcc-yellow: #FFC857;
  --jcc-blue-light: #3A5FA0;
  --jcc-yellow-light: #FFE299;
  --jcc-black: #1A1A1A;
  --jcc-gray: #6B7280;
}

/* Titres */
h1, h2, h3 {
  font-family: 'Oswald', sans-serif;
  color: var(--jcc-blue);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* Boutons */
.wp-block-button__link,
.button, button[type="submit"] {
  background-color: var(--jcc-blue) !important;
  color: #fff !important;
  border-radius: 6px !important;
}

/* Liens */
a { color: var(--jcc-blue); }
a:hover { color: var(--jcc-blue-light); }
```

### Couleurs du thème à configurer dans **Personnaliser → Couleurs**
- Couleur principale : `#1E3A7B`
- Couleur d'accent : `#FFC857`

---

## 8. Application coach-tracker (app web)

Ajouter dans `public/css/` un fichier `brand.css` :

```css
/* === JCC Brand Tokens === */
:root {
  --color-primary: #1E3A7B;
  --color-primary-hover: #3A5FA0;
  --color-accent: #FFC857;
  --color-accent-hover: #FFE299;
  --color-text: #1A1A1A;
  --color-text-secondary: #6B7280;
  --color-bg: #F3F4F6;
  --color-surface: #FFFFFF;
  --color-border: #E5E7EB;

  --font-heading: 'Oswald', sans-serif;
  --font-body: 'Inter', sans-serif;

  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-pill: 9999px;
}
```

Puis importer dans `public/index.html` :
```html
<link rel="stylesheet" href="/css/brand.css">
```

---

## 9. Ton et voix (communication)

- **Direct et communautaire** : on parle à des bénévoles et des familles, pas à des sponsors
- **Valoriser l'engagement** : coaches, arbitres, bénévoles sont mis en avant
- **Tradition + modernité** : le club existe depuis 1974, mais l'outil est moderne
- **Langue** : français, ton chaleureux mais professionnel

---

*Charte maintenue dans le repo `gaelc08/judo-coach-tracker` — fichier `docs/charte-graphique.md`*
