# splatoon-statistics

Récupère les matchs d'une session Splatoon 3 (intra, scrim, compétition) depuis
[stat.ink](https://stat.ink) et les stocke en JSON brut, un fichier par session.

Cette première itération se limite à **récupérer et stocker**. Le compte rendu et
l'affichage viendront ensuite, construits sur ces fichiers.

## Prérequis

Node ≥ 22 (pour `fetch` et `node:util.parseArgs` natifs). Aucune dépendance de
runtime, aucune clé d'API : le journal de matchs stat.ink est public.

```bash
npm install
```

## Utilisation

```bash
npm run fetch -- --from "2026-08-04 21:00" --to "2026-08-04 23:59" --lobby private --name "Scrim contre Les Corsaires"
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
npm test                          # 98 tests unitaires, hors-ligne
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
| `src/store.ts` | Écriture du fichier de session |
| `src/cli.ts` | Arguments, câblage, récapitulatif console |
