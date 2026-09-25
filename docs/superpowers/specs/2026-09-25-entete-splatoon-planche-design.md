# En-tête « Splatoon » sur la planche

## But

Poser le compte rendu de la session en haut de la planche PNG, en option, **dessiné à la manière du jeu** et non rendu depuis le Markdown. Le Markdown raconte et reste pour Discord. L'en-tête montre : un score en gros, des tuiles, des stickers, et les pictos officiels.

## Décisions

- **Partir des données, pas du texte.** `enteteEnHtml` (`src/report/entete.ts`) lit `analyseSession`. Aucune phrase du compte rendu n'y est reprise.
- **Mêmes réglages que « Générer ».** Les sections cochées choisissent les blocs, et l'objectif et le ressenti saisis dans la fiche l'emportent sur ceux enregistrés. Le score est toujours présent. L'objectif et le ressenti n'apparaissent que s'ils sont renseignés.
- **Blocs, dans un ordre fixe.**
  1. Score : le picto du lobby, le titre, V-D en gros, les manches, le temps de jeu, les nuls et les KO.
  2. Objectif en post-it, ressenti en bulle.
  3. Courbe : une tuile par manche, avec le picto de la règle, en couleur vive si la manche est gagnée et mate sinon.
  4. Bulletin : mes chiffres, mes armes avec leur sous-arme et leur spéciale, mes médailles en or ou en argent.
  5. Modes et stages : une barre de victoires par mode, les vignettes des stages.
  6. En face : les adversaires réguliers, désignés par leur arme sous son **nom français seul**, jamais par leur pseudo.
- **L'en-tête remplace le `header` de la planche**, pour ne pas afficher le titre deux fois.
- **Désactivé par défaut.** Sans l'option, la planche est identique à l'octet près à celle d'avant. C'est vérifié contre `HEAD` sur les deux sessions réelles.

## Pictos et polices (© Nintendo)

Ils sont récupérés une fois pour toutes par `npm run pictos` (`scripts/recuperePictos.ts`) dans `assets/splatoon/`. Ce dossier est ignoré par git : ces fichiers appartiennent à Nintendo et le dépôt est public, chacun le remplit donc sur sa machine. Chaque fichier porte le nom de sa clé stat.ink. La provenance est détaillée dans `assets/splatoon/SOURCE.md`.

| Élément | Source | Lien avec stat.ink |
|---|---|---|
| Règles et lobbies (SVG) | splatoon3.ink (dépôt MIT) | clé, via une table (`nawabari` → `regular`, `xmatch` → `x`) |
| Guerre tricolore | Inkipedia | `tricolor` |
| Armes | Leanny/splat3, `weapon_flat` | alias numérique, puis `WeaponInfoMain.Id`, puis `__RowId` |
| Sous-armes et spéciales | Leanny/splat3, `subspe` | par l'arme principale (`SubWeapon`, `SpecialWeapon`) |
| Stages | Leanny/splat3, `stage` | alias numérique, puis `VersusSceneInfo.Id`, puis `__RowId` sans son numéro de version |
| Médailles | Leanny/splat3, `medal` | « #1 … » reçoit l'or, les autres l'argent |
| Polices Splatoon 1 et 2 | splatoon3.ink | — ; elles couvrent tous les accents français (table `cmap` vérifiée) |

La récupération du 25/09 a donné 248 fichiers (5,7 Mo). Un seul stage n'a pas de picto : la Grande Arène (`grand_arena`), un stage d'événement.

## Garanties conservées

- **Aucune ressource externe.** Pictos et polices sont intégrés en `data:`. La CSP ajoute `font-src data:`, et seulement quand l'en-tête est actif.
- **Chaque picto est déclaré une seule fois**, en classe CSS dans la feuille, et repris par autant d'éléments qu'il faut. Le corps du document ne contient aucune URI.
- **Les clés stat.ink sont filtrées.** Une clé n'atteint une classe ou un nom de fichier que si elle passe `cleSure` (`[a-z0-9_]`) ou `regleConnue`. Tout le texte passe par `echappe`.
- **Un picto manquant n'empêche rien** : le libellé reste, et une règle inconnue prend la couleur « inconnue ».
- **Contrastes mesurés par les tests** (`tests/report/entete.test.ts`), tous d'au moins 4,5:1 : texte du panneau, score, étiquette, post-it, bulle, et tuiles sur les quatorze couleurs de règle.

## Capture

`planchePhotographe.ts` mesure la hauteur **après** `document.fonts.ready`. Une mesure prise avant l'application des polices du jeu donnerait la hauteur du texte en police de repli. Sur la session du 11/09, on obtient 1600 × 3777 px, capturés sans écart entre la hauteur mesurée et la hauteur capturée.

## Points d'entrée

- **Application** : la case « Poser le compte rendu en tête de la planche », sous les boutons, puis `BuildPlancheInput.entete`. Les sections sont validées par `sectionsValidees`, partagée avec `buildReport`.
- **Ligne de commande** : `npm run report -- <session> --planche --entete [--sections …] [--objectif …] [--ressenti …]`.
