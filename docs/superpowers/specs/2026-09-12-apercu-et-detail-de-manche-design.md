# Aperçu du compte rendu et détail d'une manche — design

## Le problème

Deux manques dans la fiche de session :

1. Le compte rendu ne s'affiche qu'en **Markdown brut**. On ne voit pas ce que le
   message donnera une fois collé dans Discord, alors que c'est sa seule destination.
2. Les matchs récupérés sont **réduits à quatre colonnes** (heure, mode, carte,
   résultat). Tout le reste — les 8 joueurs, leurs armes, leurs statistiques, leur
   équipement, les médailles, le score — est dans le fichier mais inaccessible.

## A. Aperçu du compte rendu

Deux onglets au-dessus de la zone de texte : **Aperçu** (par défaut) et **Markdown**.
Les boutons Générer et Copier restent communs ; Copier copie toujours le Markdown,
quel que soit l'onglet affiché.

### Rendu maison, et pourquoi

Pas de bibliothèque Markdown : la fenêtre applique `default-src 'none'` et ne charge
aucun script distant. Surtout, **c'est nous qui produisons ce Markdown** — le
sous-ensemble à couvrir est donc connu et fermé :

    ## titre    ### titre    **gras**    > citation    ```bloc```    ligne vide

Le module se découpe en deux : une fonction **pure** qui transforme le Markdown en
arbre de nœuds (testable hors navigateur), puis une fonction triviale qui construit
le DOM depuis cet arbre.

Le DOM est construit avec `createElement` et `textContent`, **jamais `innerHTML`** :
les noms de joueurs viennent de stat.ink et le ressenti est saisi librement ; ni l'un
ni l'autre ne doit pouvoir injecter du balisage.

### Style

L'aperçu imite Discord — fond `#313338`, blocs de code `#2b2d31` à chasse fixe
réduite, barre de citation grise, tailles de titre de Discord. Un aperçu qui ne
ressemblerait pas à la destination ne servirait à rien.

## B. Détail d'une manche

Vue dédiée, ouverte en cliquant une ligne du tableau, avec `‹ précédente`,
`suivante ›` et `Retour`.

Contenu : heure, mode, carte, score, durée, KO, médailles, le lien stat.ink, et les
8 joueurs avec arme, k/a/d/spé, encre, déconnexion et les trois pièces d'équipement
avec toutes leurs capacités.

### Circulation des données

Le détail ne traverse le pont IPC que pour la manche demandée. C'est la raison d'être
de `battleRows.ts` — les matchs bruts ne le franchissent jamais — et elle vaut ici
aussi.

- `src/battleDetail.ts` (noyau, sans Electron) aplatit **une** manche en vue
  affichable, déjà traduite.
- Canal `battle:read` : `{ path, uuid }` → le détail. Le chemin passe par
  `readSession`, donc la garde de dossier s'applique sans rien ajouter.
- La fenêtre connaît déjà les `uuid` de toutes les manches : la navigation d'une
  manche à l'autre est locale, elle redemande simplement le détail suivant.

### Ouverture du lien stat.ink

Canal `app:open-external`. **L'URL reçue est validée contre `STATINK_ORIGIN` avant
ouverture**, par une fonction du noyau donc testable : sans ce contrôle, une fenêtre
compromise ferait ouvrir n'importe quelle URL — `file://` comprise — dans le
navigateur de l'utilisateur.

### Capacités d'équipement

Elles sont en anglais dans les données (`special_charge_up`). stat.ink en publie 26,
sendou.ink les donne toutes en français. Nouvelle table `src/abilites.fr.ts`, sur le
modèle d'`armes.fr.ts`, avec le même repli sur l'anglais pour une clé inconnue.

## Hors périmètre

Repli de l'équipement derrière un bouton (à décider après l'avoir vu en vrai) ·
graphiques · filtres sur les manches · édition du compte rendu dans l'aperçu.
