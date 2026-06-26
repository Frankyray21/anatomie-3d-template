# Atlas anatomique 3D anime

Experience Three.js Machines Roger International pour presenter un atlas BodyParts3D en ouverture animee, puis en couches synchronisees au scroll: os, muscles, tendons, nerfs, vaisseaux et peau translucide.

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

La version de production charge des maillages officiels BodyParts3D / Anatomography depuis `assets/bodyparts3d/`.

Source: BodyParts3D est une base 3D Homo sapiens du Database Center for Life Science. Elle associe des concepts anatomiques FMA a des structures 3D d'un modele corps entier d'homme adulte. Les fichiers de ce projet sont derives des paquets OBJ officiels reduits a 99%.

Les couches incluses sont optimisees pour mobile:

- `bp3d-skin.obj`: peau complete, FMA7163.
- `bp3d-skeleton.obj`: squelette in vivo, FMA23876.
- `bp3d-major-muscles.obj`: sous-ensemble de grands muscles visibles.
- `bp3d-tendons.obj`: tendon, FMA9721.
- `bp3d-nervous-system.obj`: systeme nerveux, FMA7157.
- `bp3d-major-vessels.obj`: arbres arteriels/veineux principaux.

Le dataset complet avec tous les muscles et tous les vaisseaux depasse largement une taille confortable pour mobile. Le chargeur utilise donc une strategie progressive: la peau est chargee a l'ouverture, puis les couches lourdes se chargent au scroll ou a l'activation.

Pour regenerer les fichiers apres avoir telecharge les donnees officielles dans `work/bodyparts3d/`:

```powershell
node outputs\anatomie-3d-template\tools\build-bodyparts3d-web-assets.mjs --selection-only
node outputs\anatomie-3d-template\tools\build-bodyparts3d-web-assets.mjs
```

## Fichiers

- `index.html` : structure de l'application et chargement du module principal.
- `styles.css` : interface responsive.
- `src/app.js` : scene 3D, animation, selection et chargement des modeles.
- `assets/anatomy-manifest.example.json` : exemple d'integration de meshes valides.

## Attribution BodyParts3D

Attribution demandee par la licence:

`BodyParts3D, (c) The Database Center for Life Science licensed under CC Attribution 4.0 International`

Pages officielles:

- https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html
- https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html
