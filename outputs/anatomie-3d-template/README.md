# Anatomie MRI — atlas 3D

Application WebGL avec atlas local BodyParts3D, couches sélectionnables et référence Écorché/Sketchfab sur demande. La vue démarre immobile, cadrée sur le corps entier. Les commandes et réglages occupent leurs propres zones, sans couvrir le modèle.

## Interface et animation

- Téléphone : modèle central, commandes tactiles de 44 px, panneau « Couches et réglages » replié. Tablette/ordinateur : panneau latéral quand la largeur le permet.
- Glisser pour tourner, pincer/molette pour zoomer. Clavier : flèches, +/−, Home pour recentrer.
- Rotation et parcours sont explicitement activés par l’utilisateur. Un geste, un réglage ou « Recentrer » suspend l’animation. Le redimensionnement conserve l’orientation et adapte le cadrage.
- Parcours : Corps, Os, Muscles, Réseaux. Chaque étape attend ses couches avant de commencer sa durée d’affichage.
- Un seul moteur visible ; aucun dessin 2D présenté comme atlas scientifique. L’iframe externe n’existe qu’en mode Écorché et est retirée en revenant à l’atlas.
- Le rendu local s’arrête quand l’onglet est masqué. Une vue immobile n’est pas redessinée en continu ; les commandes manuelles ne sont plus écrasées à chaque frame.
- Erreur WebGL/chargement visible et réessayable. Les couches échouées peuvent être relancées.

## Lancer

Option simple: double-cliquez `ouvrir-atlas.bat`.

Option terminal, depuis ce dossier:

```powershell
node server.mjs
```

Puis ouvrez:

```text
http://localhost:4173/
```

Le template sert Three.js depuis le dossier local `vendor/`, afin que la page ne depende pas d'un CDN externe au chargement.

## Deploiement

La page publique GitHub Pages sert la version de production depuis la branche `gh-pages`.

```text
https://frankyray21.github.io/anatomie-3d-template/
```

## Fidelite scientifique

La version de production combine deux sources:

- Référence facultative : `Ecorche - Anatomy study` par Beatriz Gomez Santamaria, licence CC Attribution, affichée via Sketchfab WebGL seulement sur demande.
- Atlas scientifique: maillages officiels BodyParts3D / Anatomography depuis `assets/bodyparts3d/`.

Source: BodyParts3D est une base 3D Homo sapiens du Database Center for Life Science. Elle associe des concepts anatomiques FMA a des structures 3D d'un modele corps entier d'homme adulte. Les fichiers de ce projet sont derives des paquets OBJ officiels reduits a 99%.

Les couches incluses sont optimisees pour mobile:

- `bp3d-skin.obj`: peau complete, FMA7163.
- `bp3d-skeleton.obj`: squelette in vivo, FMA23876.
- `bp3d-major-muscles.obj`: sous-ensemble de grands muscles visibles.
- `bp3d-tendons.obj`: tendon, FMA9721.
- `bp3d-nervous-system.obj`: systeme nerveux, FMA7157.
- `bp3d-major-vessels.obj`: arbres arteriels/veineux principaux.

Les fichiers intégrés sont partiels : notamment le squelette et le système nerveux ne couvrent pas tout le corps. Ces limites sont conservées et signalées ; la conversion ne fabrique aucune structure absente. L’écartement est un outil de lecture, pas une position anatomique réelle. Usage pédagogique, pas diagnostique.

La production utilise désormais six GLB indexés, un maillage par couche, sans décimation : **153 958 367 → 50 327 836 octets (−67,31 %)**. Les 1 984 876 triangles, positions et normales FLOAT32 sont conservés. Les OBJ originaux restent disponibles pour la traçabilité. La peau (4,9 Mo) s’affiche d’abord, puis les os demandés (18,4 Mo) ; les autres couches ne sont chargées qu’à leur activation. Ces tailles ne sont pas une mesure de débit ou de FPS sur téléphone.

Reproduire les GLB à partir des OBJ existants, depuis ce dossier :

```powershell
node --expose-gc tools/convert-bodyparts3d.mjs --source assets/bodyparts3d --output assets/bodyparts3d
npm run build
```

Le rapport `assets/bodyparts3d/CONVERSION-REPORT.json` fournit les tailles, triangles, bornes et SHA256. La conversion vérifie chaque coordonnée et normale bit pour bit. Les tests comprennent le décodage des six GLB avec le chargeur réel, le cadrage, le cycle d’animation et les reprises sur erreur. Les tests de comportement utilisent un DOM et une sortie GPU simulés ; aucune mesure de performance ni QA visuelle navigateur n’est revendiquée.

Pour regenerer les fichiers apres avoir telecharge les donnees officielles dans `work/bodyparts3d/`:

```powershell
node outputs\anatomie-3d-template\tools\build-bodyparts3d-web-assets.mjs --selection-only
node outputs\anatomie-3d-template\tools\build-bodyparts3d-web-assets.mjs
```

## Fichiers

- `index.html` : structure de l'application et chargement du module principal.
- `styles.css` : interface responsive.
- `src/app.js` : scene 3D, animation, selection et chargement des modeles.
- `src/boot.js` : panneau adaptatif et message d’erreur de démarrage.
- `src/viewer-state.mjs` : calculs de cadrage, temps d’animation, étapes et visibilité.
- `tests/` : tests sans installation de dépendances (Node 22 ou ultérieur).
- `assets/anatomy-manifest.example.json` : exemple d'integration de meshes valides.

## Attribution BodyParts3D

Attribution demandee par la licence:

`BodyParts3D, (c) The Database Center for Life Science licensed under CC Attribution 4.0 International`

Pages officielles:

- https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html
- https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html

## Attribution Sketchfab

Mode d'ouverture realiste:

`Ecorche - Anatomy study` by Beatriz Gomez Santamaria, licensed under CC Attribution.

Page source:

- https://sketchfab.com/3d-models/ecorche-anatomy-study-e402d3d541eb4b199c57d5410f5d3c57
