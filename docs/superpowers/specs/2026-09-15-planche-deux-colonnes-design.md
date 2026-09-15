# Planche en deux colonnes, style Encre — design

## Le problème

La planche de manches fonctionne, et son contenu convient. Sa présentation, non :

- **Elle est trop haute.** Une colonne unique de cartes donne 1080 × 4374 px pour treize manches, et 1080 × 6947 pour vingt et une — un rapport de 1:6,4. Discord en fait une vignette étroite et illisible, qu'il faut ouvrir en grand pour voir quoi que ce soit.
- **Elle ne ressemble à rien.** Gris sur gris foncé, bandeaux ternes. Rien n'évoque le jeu dont elle rend compte.

## A. Deux colonnes

`LARGEUR_PLANCHE` passe de **1080 à 1600 px**. Les cartes se rangent dans une grille à deux colonnes (`grid-template-columns: 1fr 1fr`), lues de gauche à droite : manches 1-2, puis 3-4, et ainsi de suite. Un nombre impair de manches laisse la dernière carte seule sur sa ligne ; cela ne gêne pas la lecture et ne mérite pas de traitement particulier.

Mesuré sur les deux vraies sessions du dépôt, en rendant les maquettes :

| | avant | après |
|---|---|---|
| 13 manches | 1080 × 4374 | **1600 × 2269** |
| 21 manches | 1080 × 6947 | **1600 × 3484** |

Le rapport tombe de 1:6,4 à 1:2,2. C'est une vignette Discord qu'on lit d'un coup d'œil.

### Le garde-fou de hauteur ne change pas

`HAUTEUR_MAXIMALE_PLANCHE` reste à 16 000 px. Avec deux colonnes, il faudrait environ **95 manches** pour l'atteindre, contre une cinquantaine auparavant. Il protège désormais contre un cas franchement absurde plutôt que contre un cas improbable — ce n'est pas une raison de le retirer, et c'est une raison de ne pas le retoucher.

## B. Le style Encre

Trois directions ont été rendues en PNG avec les vraies données, puis comparées à l'écran. Les trois tenaient dans la même hauteur à 30 px près : **le gain de place vient de la disposition, pas du style**. Le choix s'est donc fait sur la seule allure, et c'est « Encre » qui a été retenue.

### Ce qui la caractérise

- **Le titre** en Lato Black, italique, capitales, jaune acide `#eaff3d`. Le bilan en dessous, en capitales espacées.
- **Les bandeaux de verdict** en dégradé : vert `#19d719` pour une victoire, rose `#f02d7d` pour une défaite. Ce sont des couleurs saturées, à l'opposé des verts et roses sourds d'avant.
- **Le numéro de manche** en gros italique noir, à gauche du bandeau. C'est lui qui donne le rythme à la grille et permet de retrouver une manche sans compter les cartes.
- **Ma ligne** garde son fond plus clair, et gagne un liseré jaune à gauche (`inset 3px 0 0 #eaff3d`).
- **Le fond** descend à `#0e0f18`, les cartes à `#1a1c2b` : plus de contraste sous les bandeaux vifs.

### Les contraintes qui tiennent toujours

**Aucune police n'est téléchargée.** Lato est présente sur la machine, en graisses Black et Heavy ; la pile retombe sur DejaVu Sans, puis Noto Sans, puis `sans-serif`. Les polices officielles du jeu sont hors d'atteinte — la planche ne charge aucune ressource externe, et cette règle ne se négocie pas pour un effet de style.

**Aucun emoji.** Même raison qu'à l'origine : leur rendu hors écran dépend d'une police d'emoji installée. Victoire et défaite passent par la couleur et par le mot.

**Aucune ressource externe.** Le test qui l'impose reste valable tel quel : pas de `url(`, pas de `@import`, pas de `<link>`, pas de `<img>`. Les taches d'encre, s'il devait y en avoir un jour, se feraient en CSS pur.

## C. Ce qui ne change pas

**Le contenu est intact.** Les mêmes huit joueurs, les mêmes armes dans les deux langues, les mêmes points d'encre, les mêmes `é/a/m/sp`, les mêmes médailles, le même ordre de jeu, la même exception assumée sur les pseudos adverses. L'utilisateur a jugé le contenu bon ; on n'y touche pas.

**`construisLaPlanche` garde sa signature, sa pureté et son déterminisme.** C'est une refonte de feuille de style et de disposition, pas une refonte de module.

## D. Ce que cela touche

`src/report/planche.ts` porte tout le changement : la constante de largeur, la feuille de style, la grille, et le bandeau qui accueille un numéro de manche dans son propre élément.

Du côté des tests, `tests/report/planche.test.ts` se partage en deux :

- **Continuent de valoir sans retouche** : l'échappement, l'absence de ressource externe, le déterminisme, les pseudos des deux camps, les chiffres, le KO, les médailles, la session vide.
- **Demandent un ajustement** : celui qui vérifie `width: 1080px`, puisque la valeur change.

Un test qu'on retouche pour qu'il passe est un test qu'on affaiblit. Ceux de la première liste doivent rester **exactement** tels quels ; si l'un d'eux tombe, c'est la refonte qui a changé un comportement, et c'est elle qu'il faut corriger.

### Le test de l'ordre de jeu, cas particulier

Il s'ancre aujourd'hui sur `class="manche__contexte">#3 · 21:33` — le numéro de manche vit dans le contexte. La refonte l'en sort pour en faire un élément à part, donc **cette ancre disparaît** et le test tombera.

Ce test a une histoire : il a fallu quatre reprises pour qu'il prouve enfin ce qu'il annonce. Il a successivement comparé des codes couleur de la feuille de style, puis des noms de classe présents dans le CSS, avant de porter enfin sur le corps du document après `</style>`. **Il ne doit pas être affaibli à l'occasion de cette refonte.**

La règle qui le gouverne reste la même : *une assertion sur la planche porte sur une sous-chaîne qui ne peut pas exister dans une feuille de style, ou sur une position située après `</style>`.* La nouvelle ancre doit donc viser le contenu réellement rendu — le numéro dans son nouvel élément, ou l'heure propre à chaque manche — et non un nom de classe nu.

**Preuve exigée :** après la refonte, inverser l'ordre des manches dans `construisLaPlanche` doit faire échouer ce test. Tant que cette inversion passe au vert, le test ne vaut rien.

## E. Ce que ça ne fait pas

- Pas de taches d'encre, pas de formes coupées en biais, pas de rotation des cartes. Le style vient de la couleur et de la typographie ; le reste attendra d'être demandé.
- Pas de trois colonnes : à 1600 px, une troisième colonne rendrait les cartes trop étroites pour deux équipes côte à côte.
- Pas de thème clair.
- Pas de retrait d'information pour gagner de la place : la disposition suffit.
