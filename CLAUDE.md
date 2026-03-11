# Plume — Correcteur & Reformulateur Français
## Notes de projet pour Claude

---

## Stack & Contraintes

- **SPA + PWA** en HTML/CSS/JS vanilla pur — zéro framework, zéro build, zéro npm
- Hébergé sur **GitHub Pages** (repo public)
- Aucune clé API dans le code source — la clé Mistral est stockée uniquement dans `localStorage`

---

## Structure des fichiers

```
/
├── index.html            — Structure HTML, modale API key (2 états), sélecteur de ton
├── style.css             — Liquid Glass + Bento Grid + Dark Mode, responsive
├── app.js                — Toute la logique applicative
├── service-worker.js     — Cache-First pour les assets statiques
├── manifest.json         — Config PWA (nom: "Plume", short_name: "Plume")
├── generate-icons.html   — Utilitaire à ouvrir 1 fois pour générer les PNG d'icônes
└── icons/
    ├── icon-192.png      — À générer via generate-icons.html
    └── icon-512.png      — À générer via generate-icons.html
```

---

## APIs utilisées

| Service | URL | Auth |
|---|---|---|
| LanguageTool | `https://api.languagetool.org/v2/check` | Aucune (publique) |
| Mistral | `https://api.mistral.ai/v1/chat/completions` | Clé utilisateur dans `localStorage` sous `mistral_api_key` |

**Modèle Mistral :** `mistral-small-latest`

---

## Fonctionnalités implémentées

### Mode Corriger (LanguageTool)
- Appel POST avec `language: fr` + texte
- Résultat : texte **déjà corrigé** affiché dans le panneau résultat (première suggestion appliquée automatiquement)
- Mots corrigés surlignés par couleur selon le type d'erreur :
  - Rouge → orthographe (`TYPOS`, `SPELLING`, `MISSPELLING`)
  - Bleu → grammaire (`GRAMMAR`)
  - Orange → ponctuation/typographie (`TYPOGRAPHY`, `PUNCTUATION`)
  - Violet → style/syntaxe (autres)
- Tooltip au survol : mot original barré + correction appliquée + message explicatif
- Légende des couleurs affichée sous le résultat
- Bouton Copier → copie le texte corrigé propre (sans balises)

### Mode Reformuler (Mistral)
- Sélecteur de ton 3 états (pills) : **Standard**, **Professionnel**, **Informel**
- Prompt système adapté au ton choisi, avec instruction obligatoire de mise en forme en paragraphes (`\n\n`)
- Résultat formaté : `\n\n` → paragraphes `<p>`, `\n` → `<br>`
- Bouton Copier → copie le texte brut avec vrais sauts de ligne (prêt pour mail)

### Gestion clé API Mistral
- **Première utilisation** : modale avec champ password + validation en live (appel test à Mistral avant sauvegarde)
  - Clé invalide (401) → message d'erreur rouge dans la modale, on reste dans la modale
  - Clé valide → sauvegarde dans `localStorage` + accès au mode Reformuler
- **Clé déjà enregistrée** : modale affiche l'état "Connecté" (badge vert + clé masquée)
  - Bouton "Changer de clé API" → efface la clé + bascule vers formulaire de saisie
  - Bouton "Fermer" → ferme simplement
- **Bouton "Clé API"** (coin bas-droite, visible uniquement en mode Reformuler) → ouvre la modale dans le bon état automatiquement

### UX globale
- Toggle animé Corriger ↔ Reformuler (spring animation)
- `Ctrl+Entrée` / `Cmd+Entrée` déclenche l'action
- Compteur de caractères sous le textarea
- Bouton Effacer remet tout à zéro
- Loader shimmer pendant les appels API
- Erreurs affichées dans un widget glass rouge avec bouton "Réessayer"
- Responsive mobile : empilement vertical

---

## Design

- **Fond** : `#0a0a0f` → `#12121a` avec blobs de couleur animés (bleu en mode Corriger, violet en mode Reformuler)
- **Liquid Glass** : `backdrop-filter: blur(24px)`, `rgba(255,255,255,0.06)`, bordures `rgba(255,255,255,0.11)`
- **Typographie** : Cormorant (logo/titres) + DM Sans (corps) via Google Fonts
- **Accents** : `#4f8ef7` (bleu, Corriger) / `#8b5cf6` (violet, Reformuler)
- **Border-radius** : 12px (sm) → 32px (xl) selon les éléments

---

## Sécurité

- Clé API **jamais dans le code source** — uniquement `localStorage` côté client
- Les appels API partent **directement du navigateur de l'utilisateur** vers Mistral/LanguageTool (GitHub Pages n'est pas un intermédiaire)
- Chaque visiteur du site entre et utilise **sa propre clé API**
- Aucune donnée transmise à GitHub

---

## Serveur local (dev)

```bash
npx serve . -p 8000
# Le SW nécessite HTTP, pas file://
```

---

## Points d'attention pour la suite

- Les icônes (`icons/icon-192.png`, `icons/icon-512.png`) doivent être générées via `generate-icons.html` — ouvrir dans un navigateur, télécharger, placer dans `/icons/`
- Le `service-worker.js` ne met pas en cache les appels API (LanguageTool, Mistral, Google Fonts)
- Si l'API Mistral retourne 401 pendant une reformulation → efface la clé et rouvre la modale automatiquement
