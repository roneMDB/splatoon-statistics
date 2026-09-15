# splatoon-statistics

Récupère les matchs d'une session Splatoon 3 (intra, scrim, compétition) depuis
[stat.ink](https://stat.ink) et les stocke en JSON brut, un fichier par session.

Deux façades sur le même noyau : une **application de bureau** et une **ligne de
commande**. À partir des fichiers stockés, l'application rédige aussi les **comptes
rendus de session** à coller dans Discord.

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

Cliquer une session ouvre sa fiche : ses matchs, son nom, son type, l'objectif
qu'on s'était fixé et son ressenti, tous modifiables. On peut aussi l'y supprimer,
après confirmation.

Cliquer une **manche** ouvre son détail : les huit joueurs avec leur arme, leurs
statistiques et leurs trois pièces d'équipement, les médailles, le score et la durée.
On passe d'une manche à l'autre sans revenir en arrière, et un bouton ouvre la page
stat.ink du match.

#### Ouvrir un lien sous WSL

Deux échecs silencieux se cumulent, et aucun ne remonte à l'application :
`shell.openExternal` d'Electron délègue à `xdg-open` et **réussit même quand celui-ci
est absent** ; et `xdg-open` lui-même se lance puis échoue faute de navigateur — le
cas normal sous WSL, où le navigateur vit du côté Windows.

L'application vérifie donc elle-même qu'un navigateur est atteignable. À défaut, elle
**copie l'adresse** et le signale, au lieu de laisser croire à une ouverture.

Pour l'ouverture directe, deux chemins :

```bash
# Pointer vers le navigateur Windows (à mettre dans ~/.zshrc ou ~/.bashrc)
export BROWSER="/mnt/c/Users/<vous>/AppData/Local/Vivaldi/Application/vivaldi.exe"

# Ou installer le pont WSL, qui s'enregistre comme navigateur par défaut
sudo apt install wslu
```

#### Fabriquer une planche sous WSL

Sous WSLg, capturer une planche peut échouer sur `UnknownVizError` : le
processus GPU de Chromium ne survit pas au rendu hors écran, l'échec
s'aggrave d'un lancement à l'autre, et l'application finit par ne plus
démarrer du tout — le preload n'étant plus chargé.

Deux mesures, sur les vraies sessions de l'utilisateur (13 et 21 manches, soit
4 374 et 6 947 px de haut) :

| Configuration | Captures réussies |
|---|---|
| Témoin, aucun drapeau | 0 / 6 |
| `--use-angle=swiftshader` en ligne de commande | 6 / 6, puis 3 / 8 plus tard |
| `appendSwitch("use-angle","swiftshader")` depuis le code | 3 / 6 |
| `app.disableHardwareAcceleration()` | 1 / 6 |
| `--use-angle=swiftshader` plus reprise jusqu'à 5 essais | 7 / 8 |

Deux remèdes en découlent, tous deux dans l'application :

1. **`npm run app` ne lance plus `electron .` directement** mais passe par
   `src/lanceApp.ts`, qui pose `--use-angle=swiftshader` sur la **vraie ligne
   de commande** du processus, sous WSL seulement — Chromium lit ce drapeau
   avant que le code applicatif s'exécute, ce qu'un `appendSwitch` posé de
   l'intérieur (toujours présent dans `src/electron/main.ts`, et qui aide un
   peu à lui seul) ne peut pas garantir.
2. **La fabrication d'une planche réessaie jusqu'à 5 fois**
   (`fabriqueLaPlancheAvecReprise` dans `src/electron/plancheHandler.ts`),
   avec des outils neufs à chaque tentative : la panne résiduelle est
   intermittente, et une reprise la rattrape le plus souvent.

Si les cinq tentatives échouent quand même, l'application le dit clairement
plutôt que de rester bloquée : le rendu graphique de la machine ne répond
plus, c'est un défaut connu de WSLg, et relancer l'application — ou WSL lui-même
si elle ne redémarre plus — rétablit généralement la capture.

Les dates se saisissent au sélecteur natif, le lobby et le type se choisissent
dans des listes, et la fenêtre est pré-remplie sur la soirée en cours. La
progression défile page par page pendant la récupération.

Sous WSL2, l'affichage passe par WSLg, sans configuration particulière.

## Le compte rendu

En bas de la fiche, quatre sections se cochent puis se rédigent d'un clic :

| Section | Ce qu'elle répond |
|---|---|
| Courbe de session | Quand la session a-t-elle basculé ? |
| Bulletin de rôle | Ai-je tenu mon poste, comparé à mes coéquipiers ? |
| Carte des modes | Quel mode nous coûte des manches ? |
| Scouting adverse | À quoi faisait-on face ? |

Deux onglets : **Aperçu** montre le rendu tel que Discord l'affichera, **Markdown**
le texte source. **Copier** met le Markdown dans le presse-papier dans les deux cas.

> Les données chiffrées sortent en **blocs de code**, pas en tableaux Markdown :
> Discord ne rend pas ces derniers et en affiche les barres verticales telles
> quelles. Un bloc de code y est rendu à chasse fixe, donc réellement aligné — en
> contrepartie, il n'accepte ni gras ni emoji, et les colonnes doivent rester
> courtes.

La rédaction est **déterministe** : des règles détectent les faits, remplissent des
gabarits, et n'écrivent une phrase que si le fait est constaté — pas de décrochage
annoncé sans série de défaites. Aucun modèle de langage n'intervient ; deux fois la
même session donnent deux fois le même texte. Les seuils sont réunis dans
`src/report/seuils.ts`.

Seuls l'objectif et le ressenti sont saisis à la main, et ils sont enregistrés dans
le fichier de session.

Les adversaires sont désignés par leur arme, jamais par leur pseudo : en intra, ce
sont des camarades de club qui lisent le même Discord.

```bash
npm run report -- data/sessions/Gloup_20260911-2000_20260911-2301.json
npm run report -- <fichier> --sections role,modes
npm run report -- <fichier> --planche
```

La ligne de commande imprime le même document sur la sortie standard ; elle sert à
travailler une formulation sans relancer l'application.

Avec `--planche`, elle écrit le HTML de la planche dans `data/planches/` au lieu
d'imprimer le compte rendu. Le PNG, lui, ne sort que de l'application : la
capture demande Electron, que la ligne de commande n'a pas.

### D'où vient le français

stat.ink n'en publie aucun, pas même sur ses référentiels : il ne sert que l'anglais
et le japonais. Les tables vivent donc dans le dépôt.

| Quoi | Source | Fichier |
|---|---|---|
| 25 cartes | Localisation officielle du jeu, confirmée par [sendou.ink](https://github.com/sendou-ink/sendou.ink/tree/main/locales/fr-EU) | `src/libelles.fr.ts` |
| 5 modes | Idem, à la casse compétitive de sendou.ink | `src/libelles.fr.ts` |
| 172 armes | sendou.ink, jointes aux clés stat.ink par leur alias numérique | `src/armes.fr.ts` |
| 55 médailles | [Wiki français du jeu](https://fr.splatoonwiki.org/wiki/Médaille) | `src/medailles.fr.ts` |

Les armes portent les deux langues (« Liquidateur (Splattershot) ») : le français est
ce qu'affiche le jeu, l'anglais ce qu'emploient la communauté compétitive et les
outils d'analyse.

La traduction a lieu dans le noyau, avant l'IPC (`src/battleRows.ts`) : la fenêtre
n'importe rien et ne peut donc pas traduire elle-même. Le tableau de matchs, le
compte rendu et le récapitulatif de la ligne de commande parlent ainsi la même langue.

Une clé inconnue retombe sur l'anglais plutôt que de casser l'affichage : une carte
ajoutée par une mise à jour s'affichera en anglais en attendant d'être traduite.

Trois pièges vérifiés, chacun tenu par un test :

- `yagura` (Tower Control) est l'**Expédition Risquée**, `hoko` (Rainmaker) la
  **Mission Bazookarpe**. Les intervertir ne se voit pas à la lecture.
- Les capacités d'équipement ne peuvent pas être jointes par acronyme : *Special
  Power Up* et *Sub Power Up* donnent tous deux `SPU`, *Ink Recovery Up* et *Ink
  Resistance Up* tous deux `IRU`.
- Les médailles sont traduites **en entier**, rang compris : le français ne place
  pas toujours le rang en tête — « № 1 du coup de main », mais « Cible privilégiée
  № 1 ».

### La planche de manches

**Fabriquer la planche** rend une image unique — toutes les manches de la session
empilées, les huit joueurs de chacune avec leur arme, leurs chiffres et les
médailles. C'est ce que la session se postait autrefois en captures d'écran,
une par manche.

Une image plutôt qu'un bloc de texte parce que le détail ne tient pas dans
Discord : un bloc de manche pèse ~700 caractères, treize manches ~9 000, pour
une limite de 2 000 par message.

Le PNG est écrit dans `data/planches/`, et **aussi** mis dans le presse-papier —
quand le système l'accepte. Sous WSL, il ne l'accepte pas toujours : le
presse-papier image ne franchit pas la frontière Windows aussi fiablement que le
texte. L'application relit donc le presse-papier pour vérifier qu'il a bien reçu
l'image, et le dit franchement quand ce n'est pas le cas — comme elle le fait
déjà pour l'ouverture de liens. Le fichier, lui, est toujours écrit : il suffit
de le glisser dans Discord.

Contrairement au compte rendu, la planche **nomme les adversaires**. Elle ne
juge pas : elle reproduit le tableau de fin de manche que les huit joueurs ont
déjà vu à l'écran. La règle de l'arme continue de tenir dans les sections
analytiques, où un chiffre porte un verdict.

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
  2026-08-04T19:44:28+00:00  private  Expédition Risquée  Marché Grefin  Victoire
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
npm test                          # 399 tests unitaires, hors-ligne
STATINK_INTEGRATION=1 npm test    # + 3 tests contre le vrai stat.ink
npm run typecheck
```

`tests/fixtures/battles-page1.json` est un extrait **réel** de `index.json`.
`tests/fixture.test.ts` vérifie contre lui les hypothèses du code sur le payload :
si ce test casse, c'est stat.ink qui a changé.

Seuls les **pseudos y ont été remplacés** — `name`, `number` et `splashtag_title`
des autres joueurs, par des valeurs factices stables d'un match à l'autre. Le
fichier est versionné, et les personnes qui y figuraient, dont des inconnus croisés
en match public, n'ont pas à se retrouver dans un dépôt. Tout le reste est intact :
structure, types et valeurs dont le code dépend.

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
| `src/libelles.fr.ts` | Modes, cartes, résultats et médailles en français |
| `src/armes.fr.ts` | Les 172 armes en français, par clé stat.ink |
| `src/abilites.fr.ts` | Les 26 capacités d'équipement en français |
| `src/medailles.fr.ts` | Les 55 médailles de fin de match en français |
| `src/battleRows.ts` | Vue allégée d'un match : ce que la fenêtre affiche, traduit |
| `src/battleDetail.ts` | Détail d'une manche, à la demande |
| `src/lienExterne.ts` | Ce qu'on accepte d'ouvrir, et si la machine sait le faire |
| `src/wsl.ts` | Détection de WSL, pure et testable |
| `src/report/analyse.ts` | Réduit une session en chiffres. Ne rédige rien |
| `src/report/format.ts` | Mise en forme partagée : tableaux, ratios, désignation des joueurs |
| `src/report/seuils.ts` | Où passe la frontière entre un fait et du bruit |
| `src/report/sections/` | Les quatre rédacteurs, un par section |
| `src/report/index.ts` | Assemble le document Markdown |
| `src/report/planche.ts` | Planche de manches en HTML, pure et testée sans navigateur |
| `src/reportCli.ts` | `npm run report` : le même document sur la sortie standard |
| `src/store.ts` | Écriture du fichier de session |
| `src/cli.ts` | Arguments, câblage, récapitulatif console |
| `src/lanceApp.ts` | Lance Electron en processus fils, avec `--use-angle=swiftshader` sous WSL |
| `src/electron/main.ts` | Fenêtre et câblage IPC. Aucune logique métier |
| `src/electron/preload.cts` | Pont vers la fenêtre. Autonome : le bac à sable ne résout aucun module local |
| `src/electron/sessionFetchHandler.ts` | Récupération pilotée par le formulaire, sans Electron |
| `src/electron/plancheHandler.ts` | Fabrique la planche : capture injectée, testable sans Chromium. Reprise jusqu'à 5 fois |
| `src/electron/planchePhotographe.ts` | Capture Electron réelle : fenêtre hors écran, presse-papier |
| `src/electron/renderer/` | La fenêtre : HTML, CSS, JavaScript simple, non transpilé |
| `src/electron/renderer/markdown.js` | Rendu de l'aperçu. Moitié pure testée, DOM sans `innerHTML` |

Le noyau ignore laquelle des deux façades l'appelle. Les modules `src/electron/`
qui orchestrent — `plancheHandler.ts` compris — n'importent pas `electron` : ils
se testent hors-ligne comme le reste. `planchePhotographe.ts` assume l'exception :
seul fichier à porter à la fois de la logique et l'API d'`electron`
(`app`, `BrowserWindow`...), il ne se teste donc pas en unitaire et se vérifie à
l'œil. `src/lanceApp.ts` importe `electron` lui aussi, mais seulement pour le
chemin du binaire qu'il lance en processus fils : il ne s'exécute jamais dans le
processus Electron, et reste donc à part du reste du noyau sans le rejoindre.
