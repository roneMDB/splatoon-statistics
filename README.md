# splatoon-statistics

Récupère les matchs d'une session Splatoon 3 (intra, scrim, compétition) depuis
[stat.ink](https://stat.ink) et les stocke en JSON brut, un fichier par session.

Deux façades sur le même noyau : une **application de bureau** et une **ligne de
commande**. Elles se limitent à récupérer et stocker ; les comptes rendus de match
viendront se loger dans l'application, construits sur ces fichiers.

## Prérequis

Node ≥ 22 (pour `fetch` et `node:util.parseArgs` natifs). Aucune clé d'API : le
journal de matchs stat.ink est public.

La ligne de commande n'a aucune dépendance de runtime et s'exécute directement sur
les sources. L'application de bureau, elle, repose sur Electron (dépendance de
développement) et passe par une compilation, cantonnée à son propre chemin.

```bash
npm install
```

## L'application

```bash
npm run app
```

Une fenêtre s'ouvre : les sessions déjà récupérées à gauche, le formulaire de
nouvelle récupération à droite. **Prévisualiser** interroge stat.ink et affiche
les matchs trouvés sans rien écrire ; **Enregistrer** écrit exactement ce que
l'aperçu montrait, sans second appel réseau.

Cliquer une session ouvre sa fiche : ses matchs, et son nom et son type
modifiables. On peut aussi l'y supprimer, après confirmation.

Les dates se saisissent au sélecteur natif, le lobby et le type se choisissent
dans des listes, et la fenêtre est pré-remplie sur la soirée en cours. La
progression défile page par page pendant la récupération.

Sous WSL2, l'affichage passe par WSLg, sans configuration particulière.

## La ligne de commande

```bash
npm run fetch -- --from "2026-08-04 21:00" --to "2026-08-04 23:59" --lobby private --name "Scrim contre Les Corsaires" --type scrim
```

```
Compte  : @Gloup
Fenetre : 8/4/2026, 9:00:00 PM -> 8/4/2026, 11:59:00 PM
Lobby   : private

13 match(s) dans la fenetre (2 page(s) lue(s), arret : page-deja-vue).
Bilan   : 7V - 6D
  2026-08-04T19:44:28+00:00  private  yagura  yagara  win
  ...

Session : Scrim contre Les Corsaires (scrim)
Ecrit dans data/sessions/Gloup_20260804-2100_20260804-2359.json
```

### Options

| Option | Défaut | Rôle |
|---|---|---|
| `--from <datetime>` | *obligatoire* | Début de la session, en **heure locale** |
| `--to <datetime>` | maintenant | Fin de la session |
| `--user <pseudo>` | `Gloup` | Compte stat.ink interrogé |
| `--name <texte>` | *demandé à l'écran* | Nom de la session, ex. `Scrim contre Les Corsaires` |
| `--type <valeur>` | aucun | `intra`, `scrim`, `compet` ou `autre` |
| `--lobby <valeur>` | aucun filtre | `private` = intras / scrims / compétitions |
| `--out <dossier>` | `data/sessions` | Dossier de sortie |
| `--max-pages <n>` | `20` | Plafond de pages parcourues |
| `--help` | | Aide |

Les dates s'écrivent `YYYY-MM-DD HH:mm` ou `YYYY-MM-DD HH:mm:ss`.

Valeurs de `--lobby` : `private`, `!private`, `regular`, `@bankara`,
`bankara_challenge`, `bankara_open`, `xmatch`, `event`, `@splatfest`,
`splatfest_challenge`, `splatfest_open`.

## Fichier de session produit

```json
{
  "source": "stat.ink",
  "user": "Gloup",
  "name": "Scrim contre Les Corsaires",
  "type": "scrim",
  "fetchedAt": "2026-08-19T17:26:00.000Z",
  "window": { "from": "2026-08-04T19:00:00.000Z", "to": "2026-08-04T21:59:00.000Z" },
  "filters": { "lobby": "private" },
  "battleCount": 13,
  "battles": [ /* objets stat.ink bruts, du plus ancien au plus récent */ ]
}
```

> `name` et `type` sont absents du fichier quand ils n'ont pas été fournis. Le
> nom de fichier, lui, ne dépend que du compte et de la fenêtre : relancer la
> même fenêtre avec un nom corrigé réécrit le même fichier.

Les matchs sont réordonnés chronologiquement mais leur contenu n'est **pas
modifié** : tout champ que stat.ink ajoutera à l'avenir traversera intact.

Chaque match contient les **8 joueurs** — pseudo, splashtag, arme complète (avec
sub et spécial), K/A/D, spéciaux utilisés, encre, déconnexion, et les trois pièces
d'équipement avec toutes leurs capacités. Un seul compte suffit donc pour
reconstituer une session entière.

`data/` est ignoré par git : les données de matchs ne sont pas versionnées.

## Ce qu'il faut savoir sur l'API stat.ink

Trois particularités vérifiées en direct, toutes traitées dans le code :

1. **Un User-Agent de navigateur est obligatoire.** Cloudflare renvoie `403`
   sinon (`src/config.ts`).
2. **`f[term_from]` / `f[term_to]` sont interprétés dans le fuseau du profil
   consulté**, pas en UTC, et le format court `YYYY-MM-DD` est silencieusement
   ignoré. Le code interroge donc une fenêtre élargie de ±24 h puis filtre au
   epoch près en local (`src/window.ts`, `src/fetchSession.ts`).
3. **`page=N` trop grand renvoie la dernière page**, pas une liste vide. La
   pagination s'arrête donc quand une page n'apporte aucun `uuid` nouveau
   (`src/fetchSession.ts`), jamais sur « page vide » seule.

## Développement

```bash
npm test                          # 175 tests unitaires, hors-ligne
STATINK_INTEGRATION=1 npm test    # + 3 tests contre le vrai stat.ink
npm run typecheck
```

`tests/fixtures/battles-page1.json` est un extrait **réel et non modifié** de
`index.json`. `tests/fixture.test.ts` vérifie contre lui les hypothèses du code
sur le payload : si ce test casse, c'est stat.ink qui a changé.

### Structure

| Fichier | Rôle |
|---|---|
| `src/config.ts` | Constantes : origine, User-Agent, valeurs par défaut |
| `src/window.ts` | Fenêtre de session : parsing local, élargissement, filtrage epoch |
| `src/statink/types.ts` | Types du payload brut |
| `src/statink/url.ts` | Construction de l'URL et des filtres `f[...]` |
| `src/statink/client.ts` | HTTP : User-Agent, reprises, messages d'erreur |
| `src/fetchSession.ts` | Pagination, conditions d'arrêt, déduplication, tri |
| `src/sessionMeta.ts` | Nom et type de session : liste fermée, validation, dialogue |
| `src/sessionList.ts` | Inventaire des sessions écrites, résumé et bilan |
| `src/battleRows.ts` | Vue allégée d'un match : ce que la fenêtre affiche |
| `src/store.ts` | Écriture du fichier de session |
| `src/cli.ts` | Arguments, câblage, récapitulatif console |
| `src/electron/main.ts` | Fenêtre et câblage IPC. Aucune logique métier |
| `src/electron/preload.cts` | Pont vers la fenêtre. Autonome : le bac à sable ne résout aucun module local |
| `src/electron/sessionFetchHandler.ts` | Récupération pilotée par le formulaire, sans Electron |
| `src/electron/renderer/` | La fenêtre : HTML, CSS, JavaScript simple, non transpilé |

Le noyau ignore laquelle des deux façades l'appelle. Les modules `src/electron/`
qui portent de la logique n'importent pas `electron` : ils se testent hors-ligne
comme le reste.
