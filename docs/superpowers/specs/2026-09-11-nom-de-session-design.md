# Nommer la session à la récupération

Date : 2026-09-11

## Problème

stat.ink ne distingue pas une intra d'un scrim ou d'une compétition : tous sont
des lobbies `private`, sans nom d'équipe. Deux sessions de nature différente le
même soir ne se différencient aujourd'hui que par leur fenêtre de temps. Le
fichier de session produit ne dit donc pas ce qu'il contient.

Ce design ajoute un label humain à chaque récupération :

- `match EBTV Équipe A vs Splat Diamond Delta`
- `Intra Équipe A vs Équipe N`
- `Scrim contre Les Corsaires`

## Périmètre

Dans le périmètre : saisie du nom et d'un type optionnel, leur stockage dans le
fichier de session, leur affichage dans le récapitulatif console.

Hors périmètre : relire ou modifier un nom après coup, indexer les sessions,
filtrer par type. Ces usages relèvent de l'itération « compte rendu », qui
s'appuiera sur les champs posés ici.

## Options de ligne de commande

Deux options, toutes deux facultatives :

| Option | Rôle |
|---|---|
| `--name <texte>` | Nom libre de la session |
| `--type <valeur>` | Nature de la session |

`--type` accepte une liste fermée : `intra`, `scrim`, `compet`, `autre`. Toute
autre valeur est rejetée dès l'analyse des arguments, avec la liste des valeurs
acceptées — même traitement que `--lobby` aujourd'hui.

Le nom est du texte libre : aucune validation, aucun échappement, hormis un
`trim`. Un nom vide après `trim` équivaut à un nom absent.

## Dialogue interactif

Les questions ne se déclenchent que si **`--name` est absent** et que
`process.stdin.isTTY` est vrai.

Fournir `--name` signifie « je donne les métadonnées en ligne de commande » :
aucune question n'est posée, même si `--type` manque. Sans cette règle, un fetch
scripté à la main subirait un prompt parasite à chaque exécution.

Le dialogue a lieu **après l'affichage du bilan des matchs, avant l'écriture du
fichier** : le nom est choisi en voyant ce que la fenêtre a ramené.

```
13 match(s) dans la fenetre (2 page(s) lue(s), arret : page-deja-vue).
Bilan   : 7V - 6D
  2026-08-04T19:44:28+00:00  private  yagura  yagara  win
  ...

Nom de la session : Scrim contre Les Corsaires
Type [intra/scrim/compet/autre, Entree pour aucun] : scrim

Ecrit dans data/sessions/Gloup_20260804-2100_20260804-2359.json
```

Règles du dialogue :

- Entrée vide au nom : le dialogue s'arrête là, sans demander le type — sans
  nom, un type seul n'a pas d'usage. La session est écrite sans nom, avec un
  avertissement.
- Type invalide : la question est reposée jusqu'à une valeur valide ou vide.
- Entrée vide au type : aucun type.

Hors TTY et sans `--name` (script, pipe, cron), la session est écrite sans nom,
avec un avertissement sur la console. La récupération ne casse jamais pour un
défaut de label.

## Récapitulatif console

Quand un nom est connu, il est rappelé avec le chemin du fichier écrit, y
compris lorsqu'il vient de `--name` et qu'aucune question n'a été posée :

```
Session : Scrim contre Les Corsaires (scrim)
Ecrit dans data/sessions/Gloup_20260804-2100_20260804-2359.json
```

Sans type, la parenthèse disparaît. Sans nom, la ligne `Session` disparaît.

## Fichier de session

Deux champs facultatifs s'ajoutent après `user`, absents du JSON quand ils ne
sont pas fournis. Les fichiers déjà écrits restent valides.

```json
{
  "source": "stat.ink",
  "user": "Gloup",
  "name": "Scrim contre Les Corsaires",
  "type": "scrim",
  "fetchedAt": "2026-09-11T19:26:00.000Z",
  "window": { "from": "...", "to": "..." },
  "filters": { "lobby": "private" },
  "battleCount": 13,
  "battles": []
}
```

Le nom de fichier ne change pas : il reste
`<user>_<début>_<fin>.json`, déterministe et indépendant du label.

Conséquence assumée : relancer la même fenêtre avec un nom corrigé écrase le
fichier précédent. C'est le moyen de corriger une faute de frappe.

## Architecture

Un nouveau module `src/sessionMeta.ts` porte la liste des types, leur
validation et la logique de dialogue. Le dialogue reçoit une fonction
`ask(question) => Promise<string>` injectée ; `src/cli.ts` en fournit
l'implémentation à base de `node:readline/promises`.

Cette injection garde le module testable sans TTY, conformément à la règle du
dépôt : tous les tests unitaires tournent hors-ligne et sans interaction.

| Fichier | Changement |
|---|---|
| `src/sessionMeta.ts` | Nouveau : types acceptés, validation, dialogue |
| `src/cli.ts` | Options `--name` / `--type`, câblage `readline`, affichage |
| `src/store.ts` | Champs `name` et `type` dans `SessionFile` |
| `README.md` | Options, exemple de sortie, exemple de JSON |

Flux : analyse des arguments → récupération → bilan → dialogue (si nécessaire) →
assemblage du fichier → écriture.

## Tests

- `parseCliArgs` : `--name` retenu, `--type` valide retenu, `--type` inconnu
  rejeté avec la liste des valeurs.
- `buildSessionFile` : nom et type présents, absents quand non fournis, `trim`
  du nom, nom réduit à des espaces traité comme absent.
- Dialogue, via le `ask` injecté : nom saisi puis type saisi, nom vide, type
  invalide puis valide, type vide, et aucune question posée quand `--name` est
  fourni.
