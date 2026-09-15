# Planche de manches — design

## Le problème

Avant cet outil, une session se postait sur Discord sous forme de **captures
d'écran** : une par manche, prises dans le jeu, montrant le tableau de fin de
partie — les huit joueurs, leur arme, leurs points d'encre, leurs éliminations,
assistances, morts et spéciales, puis les médailles.

Le compte rendu actuel ne reprend rien de cela. Il analyse et commente la session
(courbe, rôle, modes, scouting), mais **le détail manche par manche a disparu**.
Or ce détail est déjà dans le fichier de session : `toBattleDetail()` le rend
pour la fiche de manche, huit joueurs compris, déjà traduit.

Le rendre en Markdown ne marche pas. Un bloc de manche pèse environ 700
caractères ; treize manches font ~9 000 caractères, soit cinq à six messages
Discord, dont la limite est de 2 000. Le découpage manuel à chaque publication
annulerait le bénéfice.

D'où la **planche** : une image unique, verticale, qui empile toutes les manches
de la session. Un clic, un collage, un message. C'est le format d'origine —
l'image — débarrassé de son coût : treize captures manuelles.

## A. Le partage des rôles

Le même partage que partout ailleurs dans le dépôt : le noyau produit, la façade
présente.

**`src/report/planche.ts`** (nouveau, pur, testé) :

```
construisLaPlanche(file: SessionFile): string
```

Rend **un document HTML autonome** — CSS en ligne, aucune ressource externe,
aucune police téléchargée, aucune image liée. Il s'appuie sur l'existant :
`toBattleDetail()` pour chaque manche et `analyseSession()` pour l'entête.

La fonction est **déterministe**, comme `construisLeCompteRendu` : aucune date de
génération, aucun identifiant aléatoire. Deux appels sur le même fichier rendent
deux fois la même chaîne. C'est ce qui la rend testable par assertion de chaîne,
sans navigateur.

**`src/electron/plancheHandler.ts`** (nouveau) : reçoit ce HTML et le
photographie. C'est le seul endroit qui connaît Electron.

Le noyau n'importe rien d'Electron ; la fenêtre n'importe rien du noyau. La
planche ne change pas cette frontière, elle la suit.

## B. Ce que montre une carte de manche

Une carte par manche, dans l'ordre de jeu.

    ┌────────────────────────────────────────────────────────────┐
    │ VICTOIRE        #3 · 22:01 · Mission Bazookarpe            │
    │                 Scaffold Hôtel · 66-49 · 4:12              │
    ├─────────────────────────────┬──────────────────────────────┤
    │ NOUS                        │ EUX                          │
    │ Bloup   Liquidateur         │ Sauvxge  Hydravion           │
    │         742 p.   16/5/10/3  │          927 p.   13/1/10/2  │
    │ ▸ Gloup Fan de Raimi        │ к? Reby  Pinceau             │
    │         1463 p.  14/9/7/7   │          1415 p.   3/1/3/6   │
    │ ...                         │ ...                          │
    ├─────────────────────────────┴──────────────────────────────┤
    │ № 1 en progression · Pro du record de progression          │
    └────────────────────────────────────────────────────────────┘

Par joueur : pseudo, arme en français puis anglais, points d'encre, `é/a/m/sp`.
La ligne « moi » est surlignée — l'équivalent de la flèche jaune que le jeu place
sur sa propre ligne. Un joueur déconnecté est marqué comme tel.

### Les pseudos des adversaires, contre la règle du compte rendu

`src/report/format.ts` pose une règle explicite : **un adversaire est désigné par
son arme, jamais par son pseudo**, parce qu'en intra ce sont des camarades de
club qui lisent le même Discord, et qu'un pseudo accolé à un compte de morts n'a
rien à y faire.

**La planche fait exception, délibérément.** Elle ne juge pas : elle reproduit le
tableau de fin de manche que les huit joueurs ont déjà vu à l'écran, et que la
session postait autrefois en capture. Rien n'y est révélé que le jeu n'ait déjà
affiché à tout le monde. La règle de l'arme continue de tenir là où elle a été
posée — dans les sections analytiques, où un chiffre porte un verdict.

Cette exception est un choix, pas un oubli : quiconque la trouvera plus tard doit
trouver ce paragraphe avec elle.

### Deux écarts assumés avec la capture d'origine

- **NOUS passe toujours en premier**, même quand on perd. Le jeu place l'équipe
  victorieuse en haut ; ici c'est notre rapport, et la constance de lecture d'une
  carte à l'autre vaut mieux que la mimique.
- **L'ordre des joueurs est celui de stat.ink**, non retrié. C'est l'ordre du jeu.

### L'entête de planche

Le même titre et le même bilan que le compte rendu :

    Intra du 04/08 — Équipe O
    7V - 6D · 13 manches · 95 min de jeu

La planche est souvent postée seule, sous le compte rendu. Elle doit tenir debout
sans lui.

## C. La photographie

Le handler reçoit `{ path }`, relit la session, appelle `construisLaPlanche`,
puis :

1. Écrit le HTML dans un fichier temporaire (`app.getPath("temp")`). Pas de
   `data:` URL : sa longueur est plafonnée par Chromium, et une planche de
   quarante manches n'a pas à découvrir cette limite.
2. Ouvre une `BrowserWindow` `show: false`, largeur de contenu 1080 px.
3. `loadFile`, attend `did-finish-load`.
4. Mesure `document.documentElement.scrollHeight`, redimensionne la fenêtre à
   cette hauteur.
5. `capturePage()` → `NativeImage`.
6. Écrit le PNG, ferme la fenêtre, supprime le fichier temporaire.

### Le presse-papier, et pourquoi on le vérifie

Le PNG est écrit dans `data/planches/`, sous une nouvelle constante
`DEFAULT_PLANCHE_DIR` posée dans `config.ts` à côté de `DEFAULT_OUT_DIR`. Le nom
de fichier reprend celui de la session, extension changée.

Puis on tente `clipboard.writeImage()` — **et on vérifie le résultat** par
`clipboard.readImage().isEmpty()`, au lieu de supposer que l'appel a fait ce
qu'il annonce.

C'est la leçon déjà tirée de `xdg-open` et consignée dans `lienExterne.ts` :
sous WSLg, un appel système peut réussir sans rien faire. Le presse-papier
**image** ne franchit pas la frontière Windows aussi fiablement que le texte, et
Discord tourne côté Windows. Annoncer « copié » sans l'avoir constaté ferait
perdre un collage silencieux.

Le handler rend donc :

```
{ chemin, largeur, hauteur, octets, pressePapier: "copié" | "indisponible" }
```

Le fichier, lui, est toujours écrit. C'est le chemin fiable ; le presse-papier
est le raccourci.

### Garde-fou de hauteur

Chromium ne capture pas au-delà d'environ 16 000 px. À ~320 px la carte, cela
fait une cinquantaine de manches — hors d'atteinte pour des sessions de cinq à
quinze matchs. Mais au-delà, la capture rendrait une image noire **sans erreur**.

Le handler calcule donc la hauteur avant de capturer et, au-dessus du seuil,
**refuse en le disant**. Un refus explicite vaut mieux qu'un PNG noir de 400 Ko.
On ne découpe pas en plusieurs planches : le cas ne s'est jamais présenté, et le
jour où il se présentera on saura pourquoi.

## D. La fenêtre

Un bouton **« Fabriquer la planche »** dans le panneau compte rendu de la fiche
de session, à côté de « Copier ».

Il se verrouille pendant la fabrication, comme les autres boutons d'action — la
capture prend plusieurs centaines de millisecondes et rien n'empêcherait deux
clics d'ouvrir deux fenêtres hors écran.

Le résultat s'affiche sous le bouton : le chemin du fichier, ses dimensions, et
l'état du presse-papier. Quand celui-ci est indisponible, le message le dit et
invite à glisser le fichier plutôt qu'à coller.

Nouveau canal IPC `planche:build`, déclaré dans `ipcChannels.ts` et exposé par le
preload comme les autres. Il valide son `path` avec la même garde que
`readBattle` et `updateSession` — la garde de chemin fermée en TOCTOU sur
`updateSessionMeta`.

## E. La ligne de commande

```bash
npm run report -- data/sessions/<fichier>.json --planche
```

Écrit **`data/planches/<nom-de-session>.html`**, pas le PNG : la CLI n'a pas
Electron, et ne doit pas l'acquérir pour ça. Le fichier s'ouvre dans un
navigateur, où l'on voit exactement ce que la capture photographiera. Elle sert ici ce qu'elle sert déjà pour le compte rendu —
travailler le gabarit sans relancer l'application.

## F. Polices, et l'absence d'emoji

Les pseudos Splatoon sont pleins de caractères que la police par défaut ne
couvre pas forcément : `к? Reby`, `Ayσmαl`, `☆Gloup☆`. La planche déclare une
pile de polices système couvrant cyrillique, grec et symboles, avec `sans-serif`
en dernier recours. **À vérifier à l'œil au premier rendu**, sous WSL : un tofu
dans un pseudo se voit tout de suite et ne se teste pas par assertion.

Aucune police n'est téléchargée. La fenêtre hors écran n'a pas de réseau garanti,
et une planche doit rendre la même chose hors ligne.

**Aucun emoji dans la planche.** Leur rendu hors écran dépend d'une police
d'emoji installée sur la machine, ce qui n'est pas acquis. Victoire et défaite
passent par la couleur du bandeau et par le mot — le compte rendu Markdown, lui,
garde ses emoji, parce que c'est Discord qui les rend.

## G. Tests

**`tests/report/planche.test.ts`**, sur la fixture existante :

- les treize manches sont présentes, dans l'ordre de jeu ;
- les pseudos des deux camps apparaissent ;
- la ligne « moi » porte sa marque ;
- le score et le KO sont ceux de la manche ;
- le HTML ne contient **aucune URL externe** — ni police, ni image, ni script ;
- deux appels rendent la même chaîne.

**`tests/electron/plancheHandler.test.ts`** : la garde de chemin, et le garde-fou
de hauteur qui refuse au-delà du seuil.

La capture elle-même exige un vrai Chromium et n'est pas testée automatiquement.
Elle se vérifie à l'œil, une fois : c'est une image, et son seul juge utile est
un regard.

## H. Ce que ça ne fait pas

- Pas de sélection de manches : la planche prend toute la session.
- Pas d'image par manche : une planche, un collage.
- Pas de thème clair.
- Pas de découpage automatique au-delà du garde-fou de hauteur.
- **Le compte rendu Markdown ne change pas d'une ligne.** La section Courbe
  montre déjà la suite ✅❌✅ et les horaires ; une chronologie textuelle ferait
  doublon à côté d'elle, et le détail est désormais dans la planche.

## Fichiers touchés

| Fichier | Nature |
|---|---|
| `src/report/planche.ts` | nouveau — le gabarit HTML, pur et testé |
| `src/electron/plancheHandler.ts` | nouveau — capture, écriture PNG, presse-papier |
| `src/config.ts` | `DEFAULT_PLANCHE_DIR` |
| `src/electron/ipcChannels.ts` | canal `planche:build`, types d'entrée et de sortie |
| `src/electron/main.ts` | branchement du handler |
| `src/electron/preload.cts` | exposition au pont |
| `src/electron/renderer/index.html` | le bouton et sa zone de résultat |
| `src/electron/renderer/renderer.js` | appel, verrouillage, affichage du résultat |
| `src/electron/renderer/renderer.css` | style du bouton et du résultat |
| `src/reportCli.ts` | option `--planche` |
| `tests/report/planche.test.ts` | nouveau |
| `tests/electron/plancheHandler.test.ts` | nouveau |
| `README.md` | la planche, et le piège du presse-papier sous WSL |
