# Planche « Encre II » — la carte prend la couleur de sa règle

## Le problème

La planche en deux colonnes fonctionne, et son contenu convient. Il lui manque
une chose : rien, dans une carte, ne dit ce qu'on jouait. Treize cartes gris-bleu
coiffées d'un bandeau vert ou rose, c'est une grille de tableaux, pas une planche
de manches Splatoon.

Le document du 15/09, section E, écartait explicitement les taches d'encre, les
formes en biais et la rotation des cartes — « le reste attendra d'être demandé ».
C'est demandé.

## A. D'où vient le procédé

[splashcat.ink](https://splashcat.ink/) rend le même objet et le fait bien. Son
vocabulaire, lu dans son code source (`splashcat-ink/splashcat`, Django +
Tailwind) : la carte entière prend une couleur, un panneau noir semi-opaque porte
le contenu, tout le texte reçoit une ombre portée d'un pixel, et les défaites sont
assombries.

Ses polices sont celles du jeu : hors d'atteinte, et elles le resteront. Son
masque de carte et ses icônes de règle sont des SVG qu'on peut refaire en CSS. Sa
texture, elle, est embarquée telle quelle — voir la section F, qui explique
pourquoi la règle « aucune ressource externe » y survit.

Sur la licence : splashcat est sous AGPL-3.0. On reprend un vocabulaire de design
et quelques valeurs de couleur ; aucun fichier ni aucune règle CSS n'est copié.

## B. La couleur encode la règle, pas le lobby

splashcat colore ses cartes par **lobby**. Sur les données de ce dépôt, ça ne
donnerait rien. Compté sur les deux sessions réelles :

| Session | Lobbys | Règles |
|---|---|---|
| 11/09, 13 manches | `private` ×13 | Territoire 1, Zone 4, Tour 3, Bazookarpe 3, Palourdes 2 |
| 13/09, 21 manches | `bankara_open` ×21 | Bazookarpe 10, Palourdes 11 |

Le lobby est **constant d'un bout à l'autre d'une session** — une planche
monochrome. C'est une conséquence directe du cas d'usage principal, l'intra, que
stat.ink range sous `private` (voir l'en-tête de `src/sessionMeta.ts`). La règle,
elle, tourne à chaque manche.

On reprend donc le procédé en changeant la donnée encodée.

## C. Deux intensités, pour le verdict

Deux systèmes de couleur superposés — règle sur la carte, verdict sur le bandeau —
se battraient. Le verdict passe à l'intensité : **victoire = la couleur vive de la
règle, tout le reste = sa version matte**, la vive composée à 35 % sur le fond de
page.

Ce n'est délibérément pas `filter: brightness()`. Un filtre produit une couleur que
la feuille de style ne nomme jamais, donc que le test de contraste ne peut ni lire
ni vérifier — or c'est exactement ce que ce test existe pour empêcher.

Règle qui en découle, sans exception : **vive → texte sombre, matte → texte clair.**
Une seule paire de règles CSS remplace la liste d'exceptions par état qu'il fallait
auparavant.

| Règle | clé | vive | contraste | matte | contraste |
|---|---|---|---|---|---|
| Guerre de Territoire | `nawabari` | `#19d719` | 9,79 | `#125518` | 8,12 |
| Défense de Zone | `area` | `#f54910` | 5,31 | `#5f2315` | 10,92 |
| Expédition Risquée | `yagura` | `#b05df5` | 5,21 | `#472a65` | 10,62 |
| Mission Bazookarpe | `hoko` | `#0fdb9b` | 10,57 | `#0e5646` | 7,78 |
| Pluie de Palourdes | `asari` | `#f02d7d` | 4,89 | `#5d1a3b` | 11,32 |
| Territoire tricolore | `tricolor` | `#ff9750` | 8,90 | `#623f2c` | 8,37 |
| règle absente | `inconnue` | `#9aa0bb` | 7,38 | `#3f4251` | 9,00 |

Les vives viennent de la palette de splashcat, à un écart près : son violet
`#a64cf2` tombe à 4,49:1, un centième sous le seuil.

## D. Les trois couches d'une carte

Sous le texte d'une carte, trois choses s'empilent, et chacune déplace le fond :

1. **La couleur de règle**, à nu sur le bandeau.
2. **Le voile**, `rgba(14, 15, 24, 0.78)`, sur le corps et les médailles seulement
   — le fond de page plutôt que du noir pur, pour rester dans la palette.
3. **La texture**, par-dessus le voile et non dessous, à 24 % sur les vives et
   32 % sur les mates.

Ce troisième point est le seul qui ne va pas de soi, et il a coûté deux essais.
Posée **sous** le voile, la texture ne se voit que dans le bandeau : à 78 %, il n'en
passe rien dans le corps. Or c'est le corps qui occupe les trois quarts de la carte.
Elle remonte donc au-dessus du voile, sous le texte.

Remontée mais **discrète** — 12 % —, elle ne se voyait toujours qu'à la loupe : sur
un fond sombre, 12 % de blanc déplace la couleur d'une trentaine de valeurs, ce que
l'œil ne lit pas à travers huit lignes de texte. D'où 24 %, et ce que ça coûte
ci-dessous.

Une seule couche couvre bandeau et corps, et c'est possible parce que les deux
vont dans le même sens : sur une carte vive, éclaircir aide le texte sombre du
bandeau *et* n'a qu'un coût mesuré sur le texte clair du corps ; sur une mate,
assombrir aide les deux.

D'où des `z-index` écrits, parce que l'ordre importe et qu'aucun ne se devine :
voile à 0, texture à 1, texte à 2. Deux pièges :

- `.manche` porte un `clip-path`, donc établit le contexte d'empilement. Ces trois
  valeurs se comparent entre elles et nulle part ailleurs.
- `.manche__equipes` n'a **volontairement pas** de `z-index`. Il en établirait un
  second et enfermerait ses lignes de joueurs sous la texture. Le voile vit donc
  sur son pseudo-élément, pas sur lui.

### Ce que ça coûte en contraste

Le voile descend de 82 à 78 %, et la texture éclaircit encore le corps sur les
cartes vives. Mesuré sur les quatorze piles, fond de ligne « moi » compris :

| texte | rôle | pire contraste |
|---|---|---|
| — | bandeau | 6,33 |
| `#f2f3fa` | pseudos | 5,32 |
| `#e6e8f4` | **chiffres, arme, titre d'équipe** | 4,83 |
| `#eaff3d` | médailles | 5,29 |

**La hiérarchie de couleur du corps a disparu, et c'est le prix.** Trois teintes se
sont succédé à cette place : `#7d84a8` à l'origine, qui plafonnait déjà à 3,70 sous
le voile à 82 % ; `#9aa0bb`, qui tenait tant que la texture restait sous le voile ;
`#c2c7df`, qui tenait à 24 % de texture près. À l'opacité qu'il fallait pour que la
texture se voie, seul `#e6e8f4` passe — presque la couleur des pseudos. Chiffres,
arme et titre d'équipe ne se distinguent donc plus que par la taille et la graisse,
comme le fait déjà `.manche__contexte` sur le bandeau.

**`.joueur--moi` fonce**, de `#2e3352` à `#232741` : c'est la surface la plus claire
du corps, donc celle que la texture met le plus en difficulté.

**`.manche__contexte` perd son `opacity: 0.82`.** À cette valeur il tombait à 4,15
sur la plus sombre des vives.

## E. Ce que la carte gagne en plus

**L'ombre portée** sur le texte clair — le procédé qui donne à splashcat sa
lisibilité. Elle ne compte pas comme du contraste WCAG ; la table tient sans elle.

**Les vraies couleurs d'encre des équipes.** `our_team_color` et
`their_team_color` sont dans le payload depuis le début et n'étaient exploités
nulle part. Un liseré de 4 px sous les titres « Nous » et « Eux », à la couleur de
l'encre de cette manche-là. Aucun texte ne se pose dessus, donc rien à vérifier
côté contraste.

Ces valeurs partent dans un attribut `style`, et `echappe` n'y suffirait pas : il
laisse passer le point-virgule et les deux-points, donc de quoi ajouter des
déclarations. `couleurSure` les **refuse** si elles ne sont pas exactement six ou
huit chiffres hexadécimaux, plutôt que de les nettoyer.

## F. La texture et la silhouette

Ce qui distingue une carte splashcat d'un tableau ne tient pas qu'à sa couleur.

**La texture, la vraie.** (Sur son empilement et son coût en contraste, voir la
section D.) `tapes-transparent.png` est un semis de bouts de scotch
déchiré et de petites étiquettes. Une première version l'avait refaite en vingt
polygones SVG ; à côté de l'originale, ça ne tenait pas. C'est donc l'asset de
splashcat qui est embarqué — `src/report/texture.ts`.

Ce qui est stocké n'est pas l'image. L'original n'a qu'**une seule couleur**, du
noir, avec un canal alpha qui monte à 32,5 %. On ne garde que ce canal alpha,
ramené à 800 px de large, normalisé sur toute la plage et postérisé en dix
niveaux : **27 ko au lieu de 365**. Il sert de `mask-image`, pas de
`background-image`, ce qui change tout — la planche choisit la couleur des formes.

C'est nécessaire, pas coquet. La texture doit être **claire sur les couleurs vives
et sombre sur les mates** : dans les deux cas elle éloigne le fond du texte. Une
image de fond aurait imposé le noir de l'original, et le noir sur une couleur vive
fait l'inverse — à 6 % seulement, le rose des Palourdes tombe déjà à 4,39:1.

La normalisation a une seconde vertu : le masque atteint 1,0, donc **l'opacité
déclarée dans la feuille est l'opacité maximale réelle du motif**. Le test de
contraste peut la lire et en tenir compte, ce qu'il ne pourrait pas faire d'une
image au contenu inconnu.

### La règle « aucune ressource externe » tient toujours

Elle change de forme, pas de fond. Elle interdisait tout `url(` parce que jusqu'ici
tout `url(` désignait un fichier à aller chercher. Une URI `data:` ne sort pas du
document : rien n'est chargé, le rendu est identique hors ligne, la fonction reste
déterministe. C'est exactement ce que la règle protège.

Le test l'autorise donc **nommément** et refuse tout le reste — un chemin relatif,
une URL, un `url(#fragment)` :

```ts
const references = [...html.matchAll(/url\(\s*["']?([^"')]*)/gi)].map((m) => m[1]!);
expect(references.length).toBeGreaterThan(0);
for (const reference of references) {
  expect(reference).toMatch(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/);
}
```

La CSP suit : `img-src data:` s'ajoute à `default-src 'none'; style-src
'unsafe-inline'`, et rien d'autre.

**Sur la provenance.** L'asset appartient à splashcat (dépôt AGPL-3.0), et le
graphisme lui-même vient du jeu. C'est un outil personnel dont la sortie circule
dans un club ; le point est noté ici pour qu'il ne se perde pas.

**La silhouette.** Coins biseautés plutôt qu'arrondis, plus proches de l'angulaire
du jeu, et une encoche au milieu du bord haut. Celle de splashcat est un trou en
forme de calmar, découpé au masque SVG ; `clip-path: polygon()` ne sait pas percer
un trou, donc l'encoche mord le bord. Le centre du bandeau est vide de toute façon.

**La rotation et l'ombre.** Un demi-degré en alternance, et une ombre portée qui
épouse la découpe. L'ombre vit sur une enveloppe et non sur la carte : un `filter`
posé sur un élément découpé verrait son ombre rognée par la découpe.

Trois effets de bord à ne pas rater :

- **Le bas de la page gagne 14 px de marge.** Une rotation ne compte pas dans
  `scrollHeight` ; sans cette marge, le coin bas de la dernière carte sortirait de
  la capture.
- **Pas de doublon `-webkit-mask-*`.** Il ferait peser le motif 36 ko de plus pour
  rien : Chromium accepte la forme sans préfixe depuis sa version 120, et c'est
  Chromium qui rend la planche.
- **La feuille de style ne peut contenir aucune apostrophe inverse.** C'est un
  littéral gabarit : un commentaire CSS qui cite du code en casse le parsing.

## G. Le test de lisibilité, dans sa forme forte

L'ancien test ne mesurait qu'un seul fond, le bandeau neutre. Il est remplacé par
deux tests qui couvrent les **quatorze piles** — sept règles, deux intensités — en
composant pour chacune ses trois assises réelles (bandeau, panneau voilé, ligne
« moi »), et quatre couleurs de texte. Ils lisent les couleurs dans la feuille
rendue plutôt que de les recopier : une couleur ajoutée à la table est
vérifiée sans que le test soit touché, et une couleur affaiblie le fait échouer.

Trois mutations le prouvent :

| Mutation | Test qui tombe | Valeur mesurée |
|---|---|---|
| `yagura` ramené au `#a64cf2` de splashcat | bandeau, quatorze piles | 4,49 < 4,5 |
| texte secondaire remis à `#c9cee6` | corps de la manche | 3,89 < 4,5 |
| ordre des manches inversé | ordre de jeu | — |
| texture servie depuis le CDN de splashcat | aucune ressource externe | — |

La troisième est la preuve exigée par le document du 15/09, section D.

## H. Ce que ça ne fait pas

- Pas d'étiquettes à encoches, pas de taches d'encre. Le reste du vocabulaire de
  splashcat attend d'être demandé.
- Pas d'icônes de règle ni d'armes : ce sont des images.
- Pas de coloration par lobby (section B), pas de thème clair, pas de troisième
  colonne, pas de changement de contenu.
- `construisLaPlanche` garde sa signature, sa pureté et son déterminisme.

## I. Mesuré sur le rendu

| | avant | après |
|---|---|---|
| 13 manches | 1600 × 2269 | 1600 × 2438 |
| 21 manches | 1600 × 3484 | 1600 × 3745 |

Les 169 et 261 px de plus se répartissent entre les liserés d'encre (deux par
manche), le bandeau un peu plus haut pour loger l'encoche, l'écart de grille porté
de 14 à 20 px pour que les cartes pivotées ne se touchent pas, et la marge basse.
Le rapport reste à 1:1,5 et 1:2,3.
