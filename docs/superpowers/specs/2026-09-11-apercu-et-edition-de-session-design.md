# Aperçu avant récupération, et édition des sessions

Date : 2026-09-11

## Problème

L'application récupère et écrit d'un seul geste. Deux manques en découlent :

1. **On écrit à l'aveugle.** Rien ne permet de voir ce qu'une fenêtre de temps
   contient avant que le fichier n'existe. Une borne mal choisie se découvre
   après coup, quand le fichier est déjà là.
2. **Une session écrite est figée.** Un nom mal orthographié ou un type oublié
   ne se corrigent qu'en relançant la même fenêtre. Et rien ne permet de
   supprimer une session récupérée par erreur.

## Périmètre

Dans le périmètre : prévisualiser les matchs d'une fenêtre sans rien écrire ;
consulter une session existante ; en modifier le nom et le type ; la supprimer.

Hors périmètre : modifier la fenêtre de temps ou le compte d'une session déjà
écrite (ce serait une autre session), et les comptes rendus de match, qui
viendront se loger dans la fiche ouverte ici.

## Le flux de récupération

Deux boutons remplacent le bouton unique :

- **Prévisualiser** interroge stat.ink et affiche les matchs trouvés, avec le
  bilan. Rien n'est écrit.
- **Enregistrer** écrit exactement ce que l'aperçu montrait. Aucun second appel
  réseau : un match envoyé à stat.ink entre les deux clics ne peut donc pas
  faire diverger le fichier de ce qui était annoncé.

**Annuler** abandonne l'aperçu et rend le formulaire.

Un aperçu sans aucun match s'affiche quand même, avec l'avertissement déjà en
place. Il reste enregistrable : une soirée sans match est une information.

## Où vivent les matchs entre les deux clics

Le processus principal garde l'aperçu en mémoire sous un identifiant et
n'envoie à la fenêtre qu'une **vue allégée** : heure, lobby, mode, stage,
résultat — ce que la ligne de commande affiche déjà dans son récapitulatif.
« Enregistrer » ne transmet que l'identifiant.

Deux raisons. Faire transiter les centaines de Ko d'une session par le pont IPC
puis les renvoyer pour écriture serait coûteux ; surtout, les matchs doivent
être écrits **bruts**, et un aller-retour par le rendu est une occasion de les
altérer. Ils ne quittent donc jamais le processus principal.

Un seul aperçu est retenu à la fois : il n'y a qu'une fenêtre et qu'un
formulaire. L'enregistrement le consomme — l'identifiant n'est plus valable
ensuite, ce qui interdit d'écrire deux fois la même récupération par un
double-clic. Enregistrer un aperçu expiré — application redémarrée, ou autre
prévisualisation entre-temps — échoue avec un message qui invite à relancer la
prévisualisation, jamais avec une écriture silencieusement fausse.

## La fiche d'une session

Cliquer une session dans la liste remplace le formulaire par sa fiche :

- le nom et le type, modifiables ;
- la fenêtre de temps, le compte et le bilan, en lecture seule ;
- ses matchs, dans la même présentation que l'aperçu ;
- **Enregistrer**, **Supprimer**, et un retour vers le formulaire.

La suppression demande confirmation. Ces fichiers pèsent plusieurs centaines de
Ko et l'opération est irréversible.

La modification reconstruit le fichier par `buildSessionFile`, à partir du
contenu relu : le format reste identique au caractère près, et l'ordre des clés
avec lui. `fetchedAt` est préservé — c'est l'instant de la récupération, pas
celui de la retouche. Le nom du fichier ne change pas : il ne dépend que du
compte et de la fenêtre.

## Garde sur les chemins

La fenêtre envoie un chemin de fichier pour lire, modifier ou supprimer une
session. Sans contrôle, un rendu compromis ferait lire ou supprimer n'importe
quel fichier accessible à l'utilisateur.

Les trois canaux concernés vérifient donc que le chemin, une fois résolu, est
bien contenu dans le dossier des sessions et se termine par `.json`. Un chemin
qui échoue à ce contrôle est refusé avant toute lecture ou suppression.

## Architecture

`handleFetchSession` récupérait et écrivait d'un bloc. Il se scinde :

```ts
// src/electron/sessionFetchHandler.ts
export type SessionPreview = {
  previewId: string;
  user: string;
  name?: string;
  type?: SessionType;
  window: { from: string; to: string };
  battleCount: number;
  results: SessionResults;
  rows: BattleRow[];
  pagesFetched: number;
  stopReason: StopReason;
};

export async function previewSession(
  input: FetchSessionFormInput,
  deps?: SessionFetchHandlerDeps,
): Promise<SessionPreview>;

export async function saveSession(
  previewId: string,
  deps?: SessionFetchHandlerDeps,
): Promise<SessionSummary>;
```

`previewSession` valide la saisie, interroge stat.ink, retient les matchs bruts
et rend la vue allégée. `saveSession` écrit l'aperçu retenu.

Un module neuf porte la vue allégée :

```ts
// src/battleRows.ts
export type BattleRow = {
  uuid: string;
  startedAt: string;
  lobby?: string;
  rule?: string;
  stage?: string;
  result?: string;
};

export function toBattleRows(battles: StatinkBattle[]): BattleRow[];
```

Il sert à l'aperçu, à la fiche de session, et défrichera les comptes rendus.

Trois fonctions s'ajoutent à `src/sessionList.ts`, qui devient le module de
lecture et d'écriture des sessions déjà sur disque :

```ts
export async function readSession(path: string, outDir?: string): Promise<SessionFile>;
export async function updateSessionMeta(
  path: string,
  meta: { name?: string; type?: SessionType },
  outDir?: string,
): Promise<SessionSummary>;
export async function deleteSession(path: string, outDir?: string): Promise<void>;
```

Chacune applique la garde de chemin décrite plus haut.

### Canaux IPC

Aux quatre canaux existants s'en ajoutent cinq, et un disparaît :

| Canal | Charge utile |
|---|---|
| `session:preview` | `FetchSessionFormInput` → `SessionPreview` |
| `session:save` | `previewId` → `SessionSummary` |
| `session:read` | `path` → `{ summary: SessionSummary; rows: BattleRow[] }` |
| `session:update` | `{ path, name?, type? }` → `SessionSummary` |
| `session:delete` | `path` → `void` |

`session:fetch` disparaît : la fenêtre passe désormais par `preview` puis
`save`. Le preload redéclare ces noms, comme les autres — le bac à sable
d'Electron ne résout aucun module local — et le test qui interdit la divergence
les couvre automatiquement.

## Tests

Tout hors-ligne, par injection de dépendances, sans fenêtre :

- `toBattleRows` : champs retenus, match incomplet toléré, ordre préservé.
- `previewSession` : n'écrit rien, rend le bilan et les lignes attendues,
  refuse un type, un lobby, une date ou un compte invalides avec les messages de
  la ligne de commande.
- `saveSession` : écrit les matchs **bruts**, identiques à ceux que
  `previewSession` a reçus ; refuse un identifiant inconnu avec un message
  explicite ; n'appelle pas le réseau.
- `readSession`, `updateSessionMeta`, `deleteSession` : cas nominal, fichier
  absent, et chemin hors du dossier des sessions refusé — y compris une
  tentative d'évasion par `../`.
- `updateSessionMeta` : `fetchedAt` préservé, matchs préservés, nom de fichier
  inchangé, nom vide traité comme absent.

Non testés automatiquement, comme aujourd'hui : `main.ts`, `preload.cts` et le
rendu, vérifiés à la main.
