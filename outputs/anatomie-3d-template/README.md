# Atlas anatomique 3D anime

Experience Three.js Machines Roger International pour presenter le corps humain en ouverture animee, puis en couches synchronisees au scroll: os, muscles, tendons, nerfs, vaisseaux et peau translucide.

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

La scene incluse est une demonstration procedurale: elle sert a valider l'animation, l'ergonomie, la dissection par couches et l'integration web. Pour une version scientifiquement fidele, utilisez des maillages anatomiques valides.

Source conseillee: BodyParts3D / Anatomography. Le projet fournit des donnees polygonales OBJ et des tables d'identifiants anatomiques, sous licence Creative Commons Attribution 4.0.

Workflow recommande:

1. Telecharger les OBJ BodyParts3D.
2. Isoler les structures necessaires dans Blender ou MeshLab.
3. Decimer raisonnablement les meshes pour le web.
4. Exporter en `.glb`.
5. Copier les fichiers dans `assets/bodyparts3d/`.
6. Renommer `assets/anatomy-manifest.example.json` en `assets/anatomy-manifest.json`.
7. Declarer chaque structure dans le manifeste.

Le code charge automatiquement `assets/anatomy-manifest.json` s'il existe. Si `replaceDemo` vaut `true`, la maquette procedurale est masquee et seules les donnees importees sont affichees.

## Fichiers

- `index.html` : structure de l'application et import map Three.js.
- `styles.css` : interface responsive.
- `src/app.js` : scene 3D, animation, selection et chargement des modeles.
- `assets/anatomy-manifest.example.json` : exemple d'integration de meshes valides.

## Attribution BodyParts3D

Si vous utilisez BodyParts3D, gardez l'attribution demandee par la licence:

`BodyParts3D, (c) The Database Center for Life Science licensed under CC Attribution 4.0 International`
