# Planche de manches — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fabriquer, depuis une session enregistrée, une image PNG unique qui empile toutes ses manches — les huit joueurs, leurs armes, leurs chiffres, les médailles — à coller dans Discord en un seul message.

**Architecture:** Le noyau (`src/report/planche.ts`) rend un document HTML autonome, pur et déterministe, testé par assertion de chaîne sans navigateur. Electron ne fait que le photographier : une fenêtre hors écran le charge, on mesure sa hauteur, on capture, on écrit le PNG et on tente le presse-papier en vérifiant qu'il a bien reçu l'image. Le noyau n'importe rien d'Electron ; la fenêtre n'importe rien du noyau.

**Tech Stack:** TypeScript (modules ESM, extensions `.ts` aux imports), Node ≥ 22, Electron 44 (`BrowserWindow`, `clipboard`, `nativeImage`), Vitest. **Aucune dépendance de runtime nouvelle.**

**Spec :** `docs/superpowers/specs/2026-09-15-planche-de-manches-design.md`

## Global Constraints

- **Aucune dépendance nouvelle**, ni de runtime ni de développement. La CLI n'a aucune dépendance de runtime et ne doit pas en acquérir.
- **Imports avec extension `.ts`** (`import { x } from "./y.ts"`), jamais sans.
- **Commentaires et identifiants du code en français sans accent** (ASCII) ; les chaînes destinées à l'utilisateur portent leurs accents. C'est la convention en place dans tout le dépôt.
- **Le noyau (`src/`, hors `src/electron/`) n'importe jamais `electron`.**
- **La planche ne charge aucune ressource externe** : ni police, ni image, ni script, ni feuille de style liée. Tout est en ligne.
- **Aucun emoji dans la planche** (rendu hors écran incertain). Le compte rendu Markdown garde les siens.
- **Tout ce qui vient de stat.ink est échappé avant d'entrer dans le HTML** — les pseudos en particulier.
- **`construisLaPlanche` est déterministe** : aucune date de génération, aucun identifiant aléatoire.
- Chaque commit se termine par `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- `npm test` et `npm run typecheck` doivent passer à la fin de chaque tâche.

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `src/report/format.ts` | *(modifié)* accueille `jourEtMois`, `titreDeSession`, `bilanDeSession` — le titre et le bilan que le compte rendu et la planche partagent |
| `src/report/index.ts` | *(modifié)* son `entete()` consomme les fonctions partagées au lieu de les porter |
| `src/report/planche.ts` | **nouveau** — `construisLaPlanche(file)` rend le document HTML. Pur, testé, sans Electron |
| `src/config.ts` | *(modifié)* `DEFAULT_PLANCHE_DIR` |
| `src/electron/plancheHandler.ts` | **nouveau** — orchestration : lit, rend, mesure, garde-fou de hauteur, écrit le PNG, tente le presse-papier. Ses dépendances au monde extérieur sont **injectées**, donc testables |
| `src/electron/planchePhotographe.ts` | **nouveau** — l'implémentation Electron de ces dépendances (`BrowserWindow`, `clipboard`). Seul fichier qui ne se teste pas en unitaire |
| `src/electron/ipcChannels.ts` | *(modifié)* canal `planche:build`, ses types d'entrée et de sortie |
| `src/electron/main.ts` | *(modifié)* branchement du gestionnaire |
| `src/electron/preload.cts` | *(modifié)* exposition au pont |
| `src/electron/renderer/index.html` | *(modifié)* le bouton et sa zone de résultat |
| `src/electron/renderer/renderer.js` | *(modifié)* appel, verrouillage, affichage |
| `src/electron/renderer/renderer.css` | *(modifié)* style de la zone de résultat |
| `src/reportCli.ts` | *(modifié)* option `--planche` |
| `README.md` | *(modifié)* la planche, et le piège du presse-papier sous WSL |

### Deux gardes déjà en place qu'il ne faut pas casser

- `tests/electron/preload.test.ts` **exige** que les canaux de `IPC`, ceux redéclarés dans `preload.cts` et ceux câblés dans `main.ts` soient exactement les mêmes trois listes. Ajouter un canal sans mettre les trois à jour fait échouer ce test.
- `tests/electron/renderer.test.ts` **exige** que tout identifiant cherché par `renderer.js` existe dans `index.html`. Ajouter un bouton oblige à toucher les deux.

---

### Task 1: Le titre et le bilan, partagés

La planche doit porter exactement le même titre et le même bilan que le compte rendu, puisque les deux sont postés l'un sous l'autre. Ces deux morceaux sont aujourd'hui enfermés dans une fonction privée de `src/report/index.ts`. On les sort vers `format.ts`, le module de mise en forme partagée, avant de les consommer depuis deux endroits.

**Files:**
- Modify: `src/report/format.ts` (ajout en fin de fichier)
- Modify: `src/report/index.ts` (`jourEtMois` supprimé, `entete` réécrit)
- Test: `tests/report/format.test.ts` (ajout)

**Interfaces:**
- Consumes: `AnalyseSession` (`src/report/analyse.ts`), `SessionFile` (`src/store.ts`), `pluriel` (déjà dans `format.ts`), et pour les tests la fabrique `analyse()` de `tests/report/sections/analyseFactice.ts`
- Produces:
  - `jourEtMois(iso: string): string`
  - `titreDeSession(file: SessionFile, analyse: AnalyseSession): string`
  - `bilanDeSession(analyse: AnalyseSession): string[]`

- [ ] **Step 1: Écrire les tests qui échouent**

Dans `tests/report/format.test.ts`, ajouter ces imports **en tête du fichier**, sous l'import existant de `tableau` :

```typescript
import type { SessionFile } from "../../src/store.ts";
import { bilanDeSession, jourEtMois, titreDeSession } from "../../src/report/format.ts";
import { analyse } from "./sections/analyseFactice.ts";
```

`analyse()` est la fabrique d'`AnalyseSession` déjà utilisée par les tests de sections (`tests/report/sections/analyseFactice.ts`) : on la réutilise plutôt que d'en écrire une seconde. Attention à son défaut `tempsDeJeuMinutes: 50`, qu'il faut annuler pour tester l'absence de temps de jeu.

Puis ajouter la fabrique de fichier et les cas **à la fin du fichier** :

```typescript
const fichierFactice = (from: string): SessionFile =>
  ({
    source: "stat.ink",
    user: "Gloup",
    fetchedAt: "2026-08-04T22:00:00Z",
    window: { from, to: from },
    filters: {},
    battleCount: 0,
    battles: [],
  }) as SessionFile;

describe("jourEtMois", () => {
  test("rend le jour et le mois a la francaise", () => {
    expect(jourEtMois("2026-08-04T19:00:00Z")).toBe("04/08");
  });

  test("ne casse pas sur une date illisible", () => {
    expect(jourEtMois("pas une date")).toBe("date inconnue");
  });
});

describe("titreDeSession", () => {
  test("capitalise le type et ajoute le nom", () => {
    const titre = titreDeSession(
      fichierFactice("2026-08-04T19:00:00Z"),
      analyse({ type: "intra", nom: "Équipe O" }),
    );
    expect(titre).toBe("Intra du 04/08 — Équipe O");
  });

  test("retombe sur « Session » sans type, et se passe du nom", () => {
    const titre = titreDeSession(fichierFactice("2026-08-04T19:00:00Z"), analyse());
    expect(titre).toBe("Session du 04/08");
  });
});

describe("bilanDeSession", () => {
  test("enumere victoires, manches et temps de jeu, sans mise en forme", () => {
    const parts = bilanDeSession(
      analyse({
        bilan: { victoires: 7, defaites: 6, nuls: 0, total: 13 },
        tempsDeJeuMinutes: 95,
      }),
    );
    expect(parts).toEqual(["7V - 6D", "13 manches", "95 min de jeu"]);
  });

  test("n'annonce les nuls que s'il y en a, et tait un temps de jeu nul", () => {
    const parts = bilanDeSession(
      analyse({
        bilan: { victoires: 1, defaites: 0, nuls: 2, total: 3 },
        tempsDeJeuMinutes: 0,
      }),
    );
    expect(parts).toEqual(["1V - 0D", "2 nuls", "3 manches"]);
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run tests/report/format.test.ts`
Expected: FAIL — `bilanDeSession is not a function` (ou une erreur d'import TypeScript sur les trois noms inexistants).

- [ ] **Step 3: Écrire les trois fonctions dans `format.ts`**

Ajouter les imports en tête de `src/report/format.ts` (à côté de l'import existant de `StatsJoueur`) :

```typescript
import type { AnalyseSession, StatsJoueur } from "./analyse.ts";
import type { SessionFile } from "../store.ts";
```

*(l'import existant `import type { StatsJoueur } from "./analyse.ts";` est remplacé par la première ligne ci-dessus)*

Puis ajouter à la fin du fichier :

```typescript
/** `2026-09-11T18:00:00Z` -> `11/09`. */
export function jourEtMois(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "date inconnue";
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

/**
 * Titre d'une session : « Intra du 04/08 — Équipe O ».
 *
 * Partage par le compte rendu et la planche. Les deux documents sont postes
 * l'un sous l'autre sur Discord : ils doivent porter le meme nom, et ce nom ne
 * doit se decider qu'a un seul endroit.
 */
export function titreDeSession(file: SessionFile, analyse: AnalyseSession): string {
  const quoi =
    analyse.type !== undefined
      ? analyse.type[0]?.toUpperCase() + analyse.type.slice(1)
      : "Session";
  return analyse.nom !== undefined
    ? `${quoi} du ${jourEtMois(file.window.from)} — ${analyse.nom}`
    : `${quoi} du ${jourEtMois(file.window.from)}`;
}

/**
 * Bilan d'une session, en morceaux : « 7V - 6D », « 13 manches », « 95 min de jeu ».
 *
 * Rendu sans aucune mise en forme, parce que ses deux consommateurs n'en
 * veulent pas la meme : le compte rendu met le premier morceau en gras
 * Markdown, la planche les prend tels quels.
 */
export function bilanDeSession(analyse: AnalyseSession): string[] {
  const { victoires, defaites, nuls, total } = analyse.bilan;
  const parts = [`${victoires}V - ${defaites}D`];
  if (nuls > 0) parts.push(`${nuls} ${pluriel(nuls, "nul")}`);
  parts.push(`${total} ${pluriel(total, "manche")}`);
  if (analyse.tempsDeJeuMinutes > 0) parts.push(`${analyse.tempsDeJeuMinutes} min de jeu`);
  return parts;
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run tests/report/format.test.ts`
Expected: PASS

- [ ] **Step 5: Faire consommer ces fonctions par `index.ts`**

Dans `src/report/index.ts`, **supprimer** la fonction privée `jourEtMois` (le bloc de commentaire `/** \`2026-09-11T18:00:00Z\` -> \`11/09\`. */` et la fonction qui suit), puis remplacer la fonction `entete` par :

```typescript
/** Titre et bilan, toujours presents : c'est ce qui identifie le post. */
function entete(file: SessionFile, analyse: AnalyseSession): string[] {
  const [premier, ...reste] = bilanDeSession(analyse);
  const bilan = [`**${premier}**`, ...reste].join(" · ");

  return [`## ${titreDeSession(file, analyse)}`, "", bilan, ""];
}
```

Et changer l'import de `format.ts` — `pluriel` n'y est plus utilisé par `entete`, mais vérifier qu'aucun autre appel ne subsiste dans le fichier avant de le retirer :

```typescript
import { bilanDeSession, titreDeSession } from "./format.ts";
```

- [ ] **Step 6: Lancer toute la suite et le typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS — en particulier `tests/report/index.test.ts`, dont les assertions sur l'entête du compte rendu doivent rester vertes sans modification. **Si l'une d'elles change de texte, c'est que l'extraction a modifié un comportement : corriger l'extraction, pas le test.**

- [ ] **Step 7: Commit**

```bash
git add src/report/format.ts src/report/index.ts tests/report/format.test.ts
git commit -m "refactor(report): partage le titre et le bilan de session

La planche va porter le meme entete que le compte rendu. Les deux
documents sont postes l'un sous l'autre : leur nom ne doit se decider
qu'a un seul endroit.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Le document HTML de la planche

Le cœur : une fonction pure qui transforme un fichier de session en un document HTML autonome. C'est elle qui décide de tout ce qui se verra sur l'image.

**Files:**
- Create: `src/report/planche.ts`
- Create: `tests/report/planche.test.ts`

**Interfaces:**
- Consumes: `toBattleDetail`, `BattleDetail`, `JoueurDeManche` (`src/battleDetail.ts`) ; `analyseSession` (`src/report/analyse.ts`) ; `titreDeSession`, `bilanDeSession` (Task 1) ; `SessionFile` (`src/store.ts`)
- Produces:
  - `construisLaPlanche(file: SessionFile): string` — un document HTML complet
  - `LARGEUR_PLANCHE: 1080` — la largeur de rendu, que la capture réutilise

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `tests/report/planche.test.ts` :

```typescript
import { describe, expect, test } from "vitest";
import { construisLaPlanche, LARGEUR_PLANCHE } from "../../src/report/planche.ts";
import type { SessionFile } from "../../src/store.ts";
import type { StatinkBattle } from "../../src/statink/types.ts";

/**
 * Une manche complete : deux equipes de deux, un score, des medailles. Deux
 * joueurs par camp suffisent — ce qui se teste ici, c'est la structure du
 * document, pas la capacite de `map` a parcourir quatre entrees.
 */
const battle = (uuid: string, resultat: string, options: Partial<StatinkBattle> = {}) =>
  ({
    id: uuid,
    uuid,
    url: "",
    lobby: { key: "private" },
    rule: { key: "yagura" },
    stage: { key: "yagara" },
    result: resultat,
    knockout: false,
    start_at: { time: 1_785_000_000, iso8601: "2026-08-04T19:44:28+00:00" },
    end_at: { time: 1_785_000_252, iso8601: "2026-08-04T19:48:40+00:00" },
    our_team_percent: 66,
    their_team_percent: 49,
    medals: ["#1 Score Booster"],
    our_team_members: [
      { me: true, name: "☆Gloup☆", kill: 14, assist: 9, death: 7, special: 7, inked: 1463,
        weapon: { key: "splatroller", name: { en_US: "Splat Roller" } } },
      { me: false, name: "☆Bloup☆", kill: 16, assist: 5, death: 10, special: 3, inked: 742,
        weapon: { key: "sshooter", name: { en_US: "Splattershot" } } },
    ],
    their_team_members: [
      { me: false, name: "Sauvxge", kill: 13, assist: 1, death: 10, special: 2, inked: 927,
        weapon: { key: "hydra", name: { en_US: "Hydra Splatling" } } },
      { me: false, name: "к? Reby", kill: 3, assist: 1, death: 3, special: 6, inked: 1415,
        weapon: { key: "inkbrush", name: { en_US: "Inkbrush" } } },
    ],
    ...options,
  }) as unknown as StatinkBattle;

const session = (battles: StatinkBattle[]): SessionFile =>
  ({
    source: "stat.ink",
    user: "Gloup",
    name: "Équipe O",
    type: "intra",
    fetchedAt: "2026-08-04T22:00:00Z",
    window: { from: "2026-08-04T19:00:00Z", to: "2026-08-04T21:59:00Z" },
    filters: {},
    battleCount: battles.length,
    battles,
  }) as SessionFile;

describe("construisLaPlanche", () => {
  test("rend un document HTML complet", () => {
    const html = construisLaPlanche(session([battle("a", "win")]));
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("</html>");
    expect(html).toContain(`width: ${LARGEUR_PLANCHE}px`);
  });

  test("porte le titre et le bilan de la session", () => {
    const html = construisLaPlanche(session([battle("a", "win"), battle("b", "lose")]));
    expect(html).toContain("Intra du 04/08 — Équipe O");
    expect(html).toContain("1V - 1D");
    expect(html).toContain("2 manches");
  });

  test("rend une carte par manche, dans l'ordre de jeu", () => {
    const html = construisLaPlanche(
      session([battle("a", "win"), battle("b", "lose"), battle("c", "win")]),
    );
    expect(html.match(/class="manche manche--/g)).toHaveLength(3);
    expect(html.indexOf("#1")).toBeLessThan(html.indexOf("#2"));
    expect(html.indexOf("#2")).toBeLessThan(html.indexOf("#3"));
  });

  test("nomme les huit joueurs, adversaires compris", () => {
    const html = construisLaPlanche(session([battle("a", "win")]));
    expect(html).toContain("☆Gloup☆");
    expect(html).toContain("☆Bloup☆");
    expect(html).toContain("Sauvxge");
    expect(html).toContain("к? Reby");
  });

  test("marque ma ligne, et elle seule", () => {
    const html = construisLaPlanche(session([battle("a", "win")]));
    expect(html.match(/joueur--moi/g)).toHaveLength(1);
  });

  test("montre les chiffres de chacun et son arme dans les deux langues", () => {
    const html = construisLaPlanche(session([battle("a", "win")]));
    expect(html).toContain("14/9/7/7");
    expect(html).toContain("1463 p.");
    expect(html).toContain("(Splat Roller)");
  });

  test("porte le resultat, le score, la carte et le mode", () => {
    const html = construisLaPlanche(session([battle("a", "win")]));
    expect(html).toContain("manche--win");
    expect(html).toContain("Victoire");
    expect(html).toContain("66-49");
    expect(html).toContain("Expédition Risquée");
    expect(html).toContain("Marché Grefin");
  });

  test("signale un KO", () => {
    const html = construisLaPlanche(session([battle("a", "win", { knockout: true })]));
    expect(html).toContain("KO");
  });

  test("porte les medailles de la manche", () => {
    const html = construisLaPlanche(session([battle("a", "win")]));
    expect(html).toContain("№ 1 en progression");
  });

  test("echappe ce qui vient de stat.ink", () => {
    const hostile = battle("a", "win", {
      our_team_members: [
        { me: true, name: '<script>alert("x")</script>', kill: 0, assist: 0, death: 0,
          special: 0, inked: 0, weapon: { key: "sshooter", name: { en_US: "Splattershot" } } },
      ],
    } as unknown as Partial<StatinkBattle>);

    const html = construisLaPlanche(session([hostile]));
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  test("ne charge aucune ressource externe", () => {
    const html = construisLaPlanche(session([battle("a", "win")]));
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/https?:/i);
    expect(html).not.toMatch(/<link/i);
    expect(html).not.toMatch(/<img/i);
    expect(html).not.toMatch(/@import|url\(/i);
  });

  test("est deterministe : deux appels rendent la meme chaine", () => {
    const fichier = session([battle("a", "win"), battle("b", "lose")]);
    expect(construisLaPlanche(fichier)).toBe(construisLaPlanche(fichier));
  });

  test("ne casse pas sur une session vide", () => {
    const html = construisLaPlanche(session([]));
    expect(html).toContain("</html>");
    expect(html).not.toContain('class="manche manche--');
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run tests/report/planche.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/report/planche.ts"`

- [ ] **Step 3: Écrire `src/report/planche.ts`**

```typescript
/**
 * Planche de manches : toutes les manches d'une session, empilees en un seul
 * document destine a etre photographie.
 *
 * Pourquoi une image plutot que du Markdown : un bloc de manche pese environ
 * 700 caracteres, et treize manches en font 9000 — cinq a six messages
 * Discord, dont la limite est de 2000. L'image n'a pas cette limite, et c'est
 * de toute facon le format d'origine : la session se postait en captures
 * d'ecran prises dans le jeu.
 *
 * Ce module ne photographie rien. Il rend une chaine, comme
 * `construisLeCompteRendu` rend du Markdown, et pour la meme raison : une
 * fonction pure se teste par assertion, sans navigateur. La capture vit dans
 * `src/electron/`.
 *
 * Deux regles tiennent tout le fichier :
 *
 * 1. **Aucune ressource externe.** Pas de police telechargee, pas d'image
 *    liee, pas de script. La fenetre hors ecran n'a pas de reseau garanti, et
 *    une planche doit rendre la meme chose hors ligne. Un test l'interdit.
 * 2. **Tout ce qui vient de stat.ink passe par `echappe`.** Les pseudos sont
 *    saisis par des joueurs ; sans cela, une simple esperluette casserait le
 *    document.
 *
 * Sur les pseudos des adversaires : `format.ts` pose la regle inverse pour le
 * compte rendu — un adversaire y est designe par son arme, jamais par son
 * pseudo. La planche fait exception, deliberement. Elle ne juge pas : elle
 * reproduit le tableau de fin de manche que les huit joueurs ont deja vu a
 * l'ecran. Voir la section B du document de conception.
 */

import { toBattleDetail } from "../battleDetail.ts";
import type { BattleDetail, JoueurDeManche } from "../battleDetail.ts";
import type { SessionFile } from "../store.ts";
import { analyseSession } from "./analyse.ts";
import { bilanDeSession, titreDeSession } from "./format.ts";

/**
 * Largeur de rendu, en pixels CSS. La capture ouvre sa fenetre a cette
 * largeur : la changer ici la change partout.
 */
export const LARGEUR_PLANCHE = 1080;

/**
 * Echappe ce qui part dans le document.
 *
 * Seul endroit du fichier ou du texte exterieur touche le HTML : tout ce qui
 * vient de stat.ink - pseudo, arme, carte, medaille - passe par ici.
 */
function echappe(texte: string): string {
  return texte
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Feuille de style, en ligne.
 *
 * Pile de polices choisie pour couvrir le cyrillique, le grec et les symboles
 * que les pseudos Splatoon contiennent regulierement (`к? Reby`, `Ayσmαl`,
 * `☆Gloup☆`) : sans cela, ce sont des tofus. Aucune n'est telechargee.
 *
 * Aucun emoji : leur rendu hors ecran depend d'une police d'emoji installee,
 * ce qui n'est pas acquis. Victoire et defaite passent par la couleur du
 * bandeau et par le mot.
 */
const STYLE = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  width: ${LARGEUR_PLANCHE}px;
  padding: 28px;
  background: #171922;
  color: #eceef5;
  font-family: "DejaVu Sans", "Noto Sans", "Liberation Sans", Arial, sans-serif;
  font-size: 15px;
  line-height: 1.35;
}
.planche__entete { margin-bottom: 20px; }
.planche__entete h1 { font-size: 26px; letter-spacing: -0.01em; }
.planche__entete p { margin-top: 4px; color: #9aa0bb; font-size: 15px; }
.manche {
  margin-bottom: 14px;
  border-radius: 10px;
  overflow: hidden;
  background: #222534;
}
.manche__bandeau {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 16px;
  padding: 9px 16px;
  background: #4a4d63;
}
.manche--win .manche__bandeau { background: #2c7a44; }
.manche--lose .manche__bandeau { background: #9c3566; }
.manche__resultat {
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  white-space: nowrap;
}
.manche__contexte { font-size: 13px; color: #f0f1f7; text-align: right; }
.manche__equipes { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: #171922; }
.equipe { padding: 12px 14px; background: #222534; }
.equipe__titre {
  margin-bottom: 8px;
  color: #9aa0bb;
  font-size: 11px;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}
.joueur {
  display: grid;
  grid-template-columns: 1fr auto;
  padding: 5px 8px;
  border-radius: 6px;
}
.joueur + .joueur { margin-top: 2px; }
.joueur--moi { background: #39405f; }
.joueur__nom { font-weight: 600; }
.joueur__chiffres { color: #cfd3e6; font-variant-numeric: tabular-nums; white-space: nowrap; }
.joueur__arme { grid-column: 1 / -1; color: #8f95b0; font-size: 12px; }
.manche__medailles {
  padding: 9px 16px;
  border-top: 1px solid #171922;
  color: #d8c78c;
  font-size: 12px;
}
`.trim();

/** `252` -> `4:12`. */
function duree(secondes: number | undefined): string | undefined {
  if (secondes === undefined) return undefined;
  return `${Math.floor(secondes / 60)}:${String(secondes % 60).padStart(2, "0")}`;
}

/** `22:01`, heure locale — la meme lecture que l'analyse et la fiche de manche. */
function heureDe(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  return new Date(ms).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function scoreDe(detail: BattleDetail): string | undefined {
  if (detail.score === undefined) return undefined;
  const unite = detail.score.unite === "%" ? " %" : "";
  return `${detail.score.nous}-${detail.score.eux}${unite}`;
}

/**
 * Une ligne de joueur : pseudo et chiffres sur la premiere ligne, arme sur la
 * seconde. Les chiffres sont a chasse tabulaire pour que les colonnes
 * s'alignent d'une ligne a l'autre sans tableau.
 */
function joueurEnHtml(joueur: JoueurDeManche): string {
  const chiffres = [`${joueur.inked} p.`, `${joueur.kill}/${joueur.assist}/${joueur.death}/${joueur.special}`];
  if (joueur.deconnecte) chiffres.push("déconnecté");

  return (
    `<div class="${joueur.moi ? "joueur joueur--moi" : "joueur"}">` +
    `<span class="joueur__nom">${echappe(joueur.nom)}</span>` +
    `<span class="joueur__chiffres">${echappe(chiffres.join(" · "))}</span>` +
    `<span class="joueur__arme">${echappe(joueur.arme)}</span>` +
    `</div>`
  );
}

/**
 * Une equipe. Le rappel « é/a/m/sp » est dans le titre plutot que sur chaque
 * ligne : sans lui, quatre nombres colles ne veulent rien dire ; sur chaque
 * ligne, il noierait les chiffres.
 */
function equipeEnHtml(titre: string, joueurs: JoueurDeManche[]): string {
  return (
    `<div class="equipe">` +
    `<p class="equipe__titre">${echappe(titre)} — é/a/m/sp</p>` +
    joueurs.map(joueurEnHtml).join("") +
    `</div>`
  );
}

/**
 * Une carte de manche.
 *
 * « Nous » passe toujours en premier, meme quand on perd : le jeu place
 * l'equipe victorieuse en haut, mais ici la constance de lecture d'une carte a
 * l'autre vaut mieux que la mimique.
 */
function mancheEnHtml(detail: BattleDetail, numero: number): string {
  const contexte = [
    `#${numero}`,
    heureDe(detail.startedAt),
    detail.rule,
    detail.stage,
    scoreDe(detail),
    detail.ko ? "KO" : undefined,
    duree(detail.dureeSecondes),
  ].filter((part): part is string => part !== undefined);

  const medailles =
    detail.medailles.length === 0
      ? ""
      : `<p class="manche__medailles">${echappe(detail.medailles.join(" · "))}</p>`;

  return (
    `<article class="manche manche--${echappe(detail.result ?? "inconnu")}">` +
    `<div class="manche__bandeau">` +
    `<span class="manche__resultat">${echappe(detail.resultLabel ?? "—")}</span>` +
    `<span class="manche__contexte">${echappe(contexte.join(" · "))}</span>` +
    `</div>` +
    `<div class="manche__equipes">` +
    equipeEnHtml("Nous", detail.nous) +
    equipeEnHtml("Eux", detail.eux) +
    `</div>` +
    medailles +
    `</article>`
  );
}

/**
 * Rend la planche d'une session.
 *
 * Deterministe : aucune date de generation, aucun identifiant aleatoire. Deux
 * appels sur le meme fichier rendent deux fois la meme chaine - c'est ce qui
 * rend ce module testable par assertion.
 *
 * `battles` est stocke du plus ancien au plus recent (voir `store.ts`) : le
 * numero de manche est donc son rang, sans tri prealable.
 */
export function construisLaPlanche(file: SessionFile): string {
  const analyse = analyseSession(file);
  const titre = titreDeSession(file, analyse);

  const manches = file.battles
    .map((battle, index) => mancheEnHtml(toBattleDetail(battle), index + 1))
    .join("\n");

  return [
    "<!doctype html>",
    '<html lang="fr">',
    "<head>",
    '<meta charset="utf-8">',
    `<title>${echappe(titre)}</title>`,
    `<style>\n${STYLE}\n</style>`,
    "</head>",
    "<body>",
    '<header class="planche__entete">',
    `<h1>${echappe(titre)}</h1>`,
    `<p>${echappe(bilanDeSession(analyse).join(" · "))}</p>`,
    "</header>",
    manches,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run tests/report/planche.test.ts`
Expected: PASS — les 12 tests.

Si le test « ne charge aucune ressource externe » échoue sur `url(`, c'est qu'une règle CSS a été ajoutée avec une image de fond : la retirer, pas assouplir le test.

- [ ] **Step 5: Regarder la planche pour de vrai**

Le rendu visuel ne se teste pas par assertion. Produire un échantillon et l'ouvrir :

```bash
npx tsx -e '
import { construisLaPlanche } from "./src/report/planche.ts";
import { readFileSync, writeFileSync } from "node:fs";
import { readdirSync } from "node:fs";
const fichiers = readdirSync("data/sessions").filter((n) => n.endsWith(".json"));
if (fichiers.length === 0) throw new Error("Aucune session dans data/sessions pour l'echantillon.");
const file = JSON.parse(readFileSync(`data/sessions/${fichiers[0]}`, "utf8"));
writeFileSync("/tmp/planche.html", construisLaPlanche(file));
console.log("/tmp/planche.html");
'
```

Ouvrir `/tmp/planche.html` dans un navigateur et vérifier à l'œil :
- aucun **tofu** (carré vide) dans les pseudos — c'est le risque principal de la pile de polices ;
- la ligne « moi » est bien celle surlignée ;
- les colonnes de chiffres s'alignent verticalement ;
- rien ne déborde à droite.

S'il n'y a aucune session enregistrée, sauter cette étape et la refaire après la Task 4.

- [ ] **Step 6: Lancer toute la suite et le typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/report/planche.ts tests/report/planche.test.ts
git commit -m "feat(report): rend la planche de manches en HTML

Toutes les manches d'une session dans un seul document, destine a etre
photographie puis colle dans Discord. Fonction pure et deterministe : la
capture, elle, vit du cote Electron.

Aucune ressource externe et tout le texte de stat.ink echappe, deux
regles tenues par des tests.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: La fabrication, sans Electron

L'orchestration : lire la session, rendre le HTML, mesurer, refuser si c'est trop haut, capturer, écrire le PNG, tenter le presse-papier. Tout ce qui touche au monde extérieur est **injecté**, ce qui rend cette logique testable sans Chromium.

**Files:**
- Modify: `src/config.ts`
- Create: `src/electron/plancheHandler.ts`
- Create: `tests/electron/plancheHandler.test.ts`

**Interfaces:**
- Consumes: `construisLaPlanche`, `LARGEUR_PLANCHE` (Task 2) ; `SessionFile` (`src/store.ts`)
- Produces:
  - `DEFAULT_PLANCHE_DIR: "data/planches"` (`src/config.ts`)
  - `HAUTEUR_MAXIMALE_PLANCHE: 16_000`
  - `type ResultatPlanche = { chemin: string; largeur: number; hauteur: number; octets: number; pressePapier: "copie" | "indisponible" }`
  - `type OutilsDePlanche = { lisLaSession; mesure; capture; ferme; copie }` (signatures exactes dans le code du Step 3)
  - `nomDePlanche(cheminDeSession: string): string`
  - `fabriqueLaPlanche(path: string, outils: OutilsDePlanche, plancheDir?: string): Promise<ResultatPlanche>`

- [ ] **Step 1: Ajouter la constante de dossier**

Dans `src/config.ts`, juste après `DEFAULT_OUT_DIR` :

```typescript
/**
 * Dossier ou sont ecrites les planches de manches.
 *
 * A cote des sessions et non dedans : `listSessions` ne lit que des `.json` du
 * dossier des sessions, et un PNG voisin n'a rien a y faire.
 */
export const DEFAULT_PLANCHE_DIR = "data/planches";
```

- [ ] **Step 2: Écrire les tests qui échouent**

Créer `tests/electron/plancheHandler.test.ts` :

```typescript
import { describe, expect, test } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  fabriqueLaPlanche,
  HAUTEUR_MAXIMALE_PLANCHE,
  nomDePlanche,
  type OutilsDePlanche,
} from "../../src/electron/plancheHandler.ts";
import type { SessionFile } from "../../src/store.ts";

const sessionVide = (): SessionFile =>
  ({
    source: "stat.ink",
    user: "Gloup",
    fetchedAt: "2026-08-04T22:00:00Z",
    window: { from: "2026-08-04T19:00:00Z", to: "2026-08-04T21:59:00Z" },
    filters: {},
    battleCount: 0,
    battles: [],
  }) as SessionFile;

const PNG_FACTICE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

/** Doublure du monde exterieur. `journal` retient ce qui a ete appele. */
function outils(
  reglages: { hauteur?: number; copieReussie?: boolean } = {},
): OutilsDePlanche & { journal: string[] } {
  const journal: string[] = [];
  return {
    journal,
    lisLaSession: async (path) => {
      journal.push(`lis:${path}`);
      return sessionVide();
    },
    mesure: async (html, largeur) => {
      journal.push(`mesure:${largeur}:${html.length > 0}`);
      return reglages.hauteur ?? 2400;
    },
    capture: async (hauteur) => {
      journal.push(`capture:${hauteur}`);
      return PNG_FACTICE;
    },
    ferme: async () => {
      journal.push("ferme");
    },
    copie: () => {
      journal.push("copie");
      return reglages.copieReussie ?? true;
    },
  };
}

describe("nomDePlanche", () => {
  test("reprend le nom de la session, extension changee", () => {
    expect(nomDePlanche("data/sessions/Gloup_20260804-2100_20260804-2359.json")).toBe(
      "Gloup_20260804-2100_20260804-2359.png",
    );
  });
});

describe("fabriqueLaPlanche", () => {
  test("ecrit le PNG et rend ses dimensions", async () => {
    const dossier = await mkdtemp(join(tmpdir(), "planches-"));
    try {
      const resultat = await fabriqueLaPlanche(
        "data/sessions/Gloup_20260804-2100_20260804-2359.json",
        outils({ hauteur: 3120 }),
        dossier,
      );

      expect(resultat.chemin).toBe(
        join(dossier, "Gloup_20260804-2100_20260804-2359.png"),
      );
      expect(resultat.hauteur).toBe(3120);
      expect(resultat.largeur).toBe(1080);
      expect(resultat.octets).toBe(PNG_FACTICE.byteLength);
      expect(new Uint8Array(await readFile(resultat.chemin))).toEqual(PNG_FACTICE);
    } finally {
      await rm(dossier, { recursive: true, force: true });
    }
  });

  test("annonce le presse-papier seulement quand il a recu l'image", async () => {
    const dossier = await mkdtemp(join(tmpdir(), "planches-"));
    try {
      const reussi = await fabriqueLaPlanche("a/b.json", outils({ copieReussie: true }), dossier);
      expect(reussi.pressePapier).toBe("copie");

      const rate = await fabriqueLaPlanche("a/b.json", outils({ copieReussie: false }), dossier);
      expect(rate.pressePapier).toBe("indisponible");
    } finally {
      await rm(dossier, { recursive: true, force: true });
    }
  });

  test("refuse une planche plus haute que ce que Chromium sait capturer", async () => {
    const doublure = outils({ hauteur: HAUTEUR_MAXIMALE_PLANCHE + 1 });

    await expect(fabriqueLaPlanche("a/b.json", doublure)).rejects.toThrow(
      /trop haute/i,
    );
    // Rien n'a ete capture : une image noire vaut moins qu'un refus.
    expect(doublure.journal).not.toContain(`capture:${HAUTEUR_MAXIMALE_PLANCHE + 1}`);
  });

  test("ferme la fenetre meme quand la mesure echoue", async () => {
    const doublure = outils();
    doublure.mesure = async () => {
      throw new Error("Chromium n'a pas repondu.");
    };

    await expect(fabriqueLaPlanche("a/b.json", doublure)).rejects.toThrow(
      "Chromium n'a pas repondu.",
    );
    expect(doublure.journal).toContain("ferme");
  });

  test("ferme la fenetre avant d'ecrire, une fois la capture faite", async () => {
    const dossier = await mkdtemp(join(tmpdir(), "planches-"));
    try {
      const doublure = outils();
      await fabriqueLaPlanche("a/b.json", doublure, dossier);
      expect(doublure.journal).toEqual([
        "lis:a/b.json",
        "mesure:1080:true",
        "capture:2400",
        "ferme",
        "copie",
      ]);
    } finally {
      await rm(dossier, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 3: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run tests/electron/plancheHandler.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/electron/plancheHandler.ts"`

- [ ] **Step 4: Écrire `src/electron/plancheHandler.ts`**

```typescript
/**
 * Fabrication d'une planche : du fichier de session au PNG sur disque.
 *
 * Ce module n'importe pas `electron`. Tout ce qui exige un vrai Chromium ou un
 * vrai systeme - charger un document, le mesurer, le capturer, ecrire dans le
 * presse-papier - lui est **injecte** sous la forme d'`OutilsDePlanche`. C'est
 * ce qui permet de tester ici le garde-fou de hauteur, l'ordre des operations
 * et le nommage du fichier, sans lancer d'application.
 *
 * `src/electron/planchePhotographe.ts` fournit l'implementation reelle de ces
 * outils.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { DEFAULT_PLANCHE_DIR } from "../config.ts";
import { construisLaPlanche, LARGEUR_PLANCHE } from "../report/planche.ts";
import type { SessionFile } from "../store.ts";

/**
 * Au-dela, Chromium rend une image **noire, sans erreur**. A ~320 px la carte,
 * cela fait une cinquantaine de manches : hors d'atteinte pour une soiree, mais
 * un refus explicite vaut mieux qu'un PNG noir de 400 Ko.
 */
export const HAUTEUR_MAXIMALE_PLANCHE = 16_000;

/** Ce que la fabrication rend a la fenetre. */
export type ResultatPlanche = {
  /** Chemin du PNG ecrit. Toujours renseigne : le fichier est le chemin fiable. */
  chemin: string;
  largeur: number;
  hauteur: number;
  octets: number;
  /**
   * `copie` seulement quand le presse-papier a **reellement** recu l'image,
   * verification faite. Voir `planchePhotographe.ts`.
   */
  pressePapier: "copie" | "indisponible";
};

/** Le monde exterieur, injecte. */
export type OutilsDePlanche = {
  /** Relit la session. Refuse tout chemin hors du dossier des sessions. */
  lisLaSession: (path: string) => Promise<SessionFile>;
  /** Charge le document a cette largeur et rend la hauteur de son contenu, en pixels. */
  mesure: (html: string, largeur: number) => Promise<number>;
  /** Capture le document deja charge, a la hauteur indiquee. */
  capture: (hauteur: number) => Promise<Uint8Array>;
  /** Libere la fenetre hors ecran et ses fichiers temporaires. Appelee quoi qu'il arrive. */
  ferme: () => Promise<void>;
  /** Tente le presse-papier et dit s'il a reellement recu l'image. */
  copie: (png: Uint8Array, largeur: number, hauteur: number) => boolean;
};

/** `…/Gloup_20260804-2100_20260804-2359.json` -> `Gloup_20260804-2100_20260804-2359.png`. */
export function nomDePlanche(cheminDeSession: string): string {
  return `${basename(cheminDeSession, ".json")}.png`;
}

/**
 * Fabrique la planche d'une session et l'ecrit sur disque.
 *
 * L'ordre importe : on mesure avant de capturer pour pouvoir refuser une
 * planche trop haute, et on ferme la fenetre avant d'ecrire - une fenetre
 * ouverte pendant une ecriture disque ne sert a rien, et le `finally` garantit
 * qu'elle se ferme meme si la mesure ou la capture echoue.
 *
 * Le PNG est toujours ecrit, meme quand le presse-papier a fonctionne : c'est
 * le chemin fiable, le presse-papier n'est que le raccourci.
 */
export async function fabriqueLaPlanche(
  path: string,
  outils: OutilsDePlanche,
  plancheDir: string = DEFAULT_PLANCHE_DIR,
): Promise<ResultatPlanche> {
  const file = await outils.lisLaSession(path);
  const html = construisLaPlanche(file);

  let hauteur: number;
  let png: Uint8Array;
  try {
    hauteur = await outils.mesure(html, LARGEUR_PLANCHE);
    if (hauteur > HAUTEUR_MAXIMALE_PLANCHE) {
      throw new Error(
        `Planche trop haute pour être capturée : ${hauteur} px, pour ` +
          `${HAUTEUR_MAXIMALE_PLANCHE} px au maximum. Au-delà, la capture ` +
          `rendrait une image noire sans le dire.`,
      );
    }
    png = await outils.capture(hauteur);
  } finally {
    await outils.ferme();
  }

  await mkdir(plancheDir, { recursive: true });
  const chemin = join(plancheDir, nomDePlanche(path));
  await writeFile(chemin, png);

  return {
    chemin,
    largeur: LARGEUR_PLANCHE,
    hauteur,
    octets: png.byteLength,
    pressePapier: outils.copie(png, LARGEUR_PLANCHE, hauteur) ? "copie" : "indisponible",
  };
}
```

- [ ] **Step 5: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run tests/electron/plancheHandler.test.ts`
Expected: PASS — les 6 tests.

- [ ] **Step 6: Lancer toute la suite et le typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/config.ts src/electron/plancheHandler.ts tests/electron/plancheHandler.test.ts
git commit -m "feat(planche): orchestre la fabrication, garde-fou compris

Lit, rend, mesure, capture, ecrit, tente le presse-papier. Ce qui exige
un vrai Chromium est injecte, donc le garde-fou de hauteur et l'ordre
des operations se testent sans lancer l'application.

Refuse au-dela de 16000 px : Chromium y rend une image noire sans
erreur, et un refus explicite vaut mieux qu'un PNG noir.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Le photographe Electron et le câblage IPC

L'implémentation réelle des outils, et le canal qui relie la fenêtre au processus principal.

**Files:**
- Create: `src/electron/planchePhotographe.ts`
- Modify: `src/electron/ipcChannels.ts`
- Modify: `src/electron/main.ts`
- Modify: `src/electron/preload.cts`

**Interfaces:**
- Consumes: `OutilsDePlanche`, `ResultatPlanche`, `fabriqueLaPlanche` (Task 3) ; `readSession` (`src/sessionList.ts`)
- Produces:
  - `outilsDePlanche(): OutilsDePlanche` (`planchePhotographe.ts`)
  - `IPC.buildPlanche = "planche:build"`
  - `type BuildPlancheInput = { path: string }`
  - `SplatoonApi.buildPlanche: (input: BuildPlancheInput) => Promise<ResultatPlanche>`

- [ ] **Step 1: Écrire le photographe**

Créer `src/electron/planchePhotographe.ts` :

```typescript
/**
 * L'implementation Electron des outils de planche : une fenetre hors ecran qui
 * charge le document, le mesure, le capture, puis disparait.
 *
 * Seul fichier du chantier qui ne se teste pas en unitaire - il lui faut un
 * vrai Chromium. La logique qu'il sert, elle, est testee dans
 * `plancheHandler.ts`, ou elle est isolee derriere `OutilsDePlanche`.
 *
 * Trois choix a expliquer :
 *
 * 1. **Fichier temporaire plutot que `data:` URL.** La longueur d'une `data:`
 *    URL est plafonnee par Chromium ; une planche de quarante manches n'a pas a
 *    decouvrir cette limite a l'execution.
 * 2. **`offscreen: true`.** Une fenetre simplement `show: false` ne peint pas
 *    forcement, et `capturePage` rendrait alors du vide. Le rendu hors ecran
 *    est le chemin prevu pour capturer sans afficher.
 * 3. **On verifie le presse-papier.** Sous WSLg, `clipboard.writeImage`
 *    reussit sans que l'image franchisse la frontiere Windows - le meme piege
 *    que `xdg-open` dans `lienExterne.ts`. On relit donc le presse-papier et on
 *    compare les dimensions, plutot que d'annoncer une copie qu'on n'a pas
 *    constatee.
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrowserWindow, clipboard, nativeImage } from "electron";
import { readSession } from "../sessionList.ts";
import type { OutilsDePlanche } from "./plancheHandler.ts";

/**
 * Laisse passer deux rafraichissements avant de capturer.
 *
 * Redimensionner la fenetre ne repeint pas instantanement : capturer dans la
 * foulee attrape l'ancienne taille. Deux `requestAnimationFrame` valent mieux
 * qu'une attente en millisecondes, qui serait soit trop courte soit gaspillee.
 */
const ATTENDS_DEUX_IMAGES =
  "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))";

export function outilsDePlanche(): OutilsDePlanche {
  let fenetre: BrowserWindow | undefined;
  let dossier: string | undefined;
  let largeurRendue = 0;

  return {
    lisLaSession: (path) => readSession(path),

    async mesure(html, largeur) {
      dossier = await mkdtemp(join(tmpdir(), "planche-"));
      const fichier = join(dossier, "planche.html");
      await writeFile(fichier, html, "utf8");

      largeurRendue = largeur;
      fenetre = new BrowserWindow({
        show: false,
        width: largeur,
        height: 900,
        webPreferences: {
          offscreen: true,
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
        },
      });
      fenetre.setContentSize(largeur, 900);
      await fenetre.loadFile(fichier);

      const hauteur = (await fenetre.webContents.executeJavaScript(
        "document.documentElement.scrollHeight",
      )) as number;
      return Math.ceil(hauteur);
    },

    async capture(hauteur) {
      if (fenetre === undefined) {
        throw new Error("Aucune fenêtre à capturer : la mesure n'a pas eu lieu.");
      }
      fenetre.setContentSize(largeurRendue, hauteur);
      await fenetre.webContents.executeJavaScript(ATTENDS_DEUX_IMAGES);
      const image = await fenetre.webContents.capturePage();
      return image.toPNG();
    },

    async ferme() {
      fenetre?.destroy();
      fenetre = undefined;
      if (dossier !== undefined) await rm(dossier, { recursive: true, force: true });
      dossier = undefined;
    },

    copie(png, largeur, hauteur) {
      const image = nativeImage.createFromBuffer(Buffer.from(png));
      clipboard.writeImage(image);

      // On compare les dimensions plutot que de se contenter d'`isEmpty` : une
      // image deja presente dans le presse-papier ferait passer un echec pour
      // une reussite.
      const relu = clipboard.readImage();
      if (relu.isEmpty()) return false;
      const taille = relu.getSize();
      return taille.width === largeur && taille.height === hauteur;
    },
  };
}
```

- [ ] **Step 2: Déclarer le canal**

Dans `src/electron/ipcChannels.ts`, ajouter dans l'objet `IPC`, juste après `buildReport` :

```typescript
  /** Fabrique la planche de manches d'une session et l'ecrit en PNG. */
  buildPlanche: "planche:build",
```

Ajouter le type d'entrée, à côté de `BuildReportInput` :

```typescript
/** Ce que la fenetre envoie pour obtenir une planche. */
export type BuildPlancheInput = {
  path: string;
};
```

Et la méthode dans `SplatoonApi`, après `buildReport` :

```typescript
  /**
   * Fabrique la planche de la session et rend ou elle a ete ecrite.
   * `pressePapier` vaut `"indisponible"` quand le systeme n'a pas accepte
   * l'image - le cas sous WSLg : le fichier, lui, est toujours ecrit.
   */
  buildPlanche: (
    input: BuildPlancheInput,
  ) => Promise<import("./plancheHandler.ts").ResultatPlanche>;
```

- [ ] **Step 3: Brancher le gestionnaire**

Dans `src/electron/main.ts`, ajouter les imports :

```typescript
import { fabriqueLaPlanche } from "./plancheHandler.ts";
import { outilsDePlanche } from "./planchePhotographe.ts";
import type { BuildPlancheInput } from "./ipcChannels.ts";
```

*(`BuildPlancheInput` s'ajoute à l'import de type existant depuis `./ipcChannels.ts` s'il y en a un.)*

Puis, juste après le gestionnaire `IPC.buildReport` :

```typescript
ipcMain.handle(IPC.buildPlanche, (_event, input: BuildPlancheInput) =>
  // `readSession`, appele par les outils, refuse tout chemin hors du dossier
  // des sessions : la garde est la meme que pour `readBattle`.
  fabriqueLaPlanche(input.path, outilsDePlanche()),
);
```

- [ ] **Step 4: Exposer au pont**

Dans `src/electron/preload.cts`, ajouter au bloc `CANAUX`, après `buildReport` :

```typescript
  buildPlanche: "planche:build",
```

Et la méthode exposée, après `buildReport` :

```typescript
  buildPlanche: (input: unknown) =>
    ipcRenderer.invoke(CANAUX.buildPlanche, input),
```

- [ ] **Step 5: Lancer les tests de câblage**

Run: `npx vitest run tests/electron/preload.test.ts`
Expected: PASS

Ce test compare les trois listes de canaux — `IPC`, le preload, et ce que `main.ts` câble. S'il échoue en signalant `planche:build`, c'est qu'une des trois déclarations manque.

- [ ] **Step 6: Lancer toute la suite et le typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/electron/planchePhotographe.ts src/electron/ipcChannels.ts src/electron/main.ts src/electron/preload.cts
git commit -m "feat(electron): photographie la planche dans une fenetre hors ecran

Rendu hors ecran plutot qu'une fenetre simplement cachee, qui ne peint
pas forcement. Fichier temporaire plutot qu'une data: URL, dont la
longueur est plafonnee.

Le presse-papier est verifie en relisant l'image et en comparant ses
dimensions : sous WSLg, writeImage reussit sans que l'image franchisse
la frontiere Windows. Meme piege que xdg-open.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Le bouton dans la fenêtre

**Files:**
- Modify: `src/electron/renderer/index.html`
- Modify: `src/electron/renderer/renderer.js`
- Modify: `src/electron/renderer/renderer.css`
- Modify: `README.md`

**Interfaces:**
- Consumes: `api.buildPlanche` (Task 4), qui rend `ResultatPlanche`
- Produces: rien pour d'autres tâches — c'est la façade.

- [ ] **Step 1: Ajouter le bouton et sa zone de résultat**

Dans `src/electron/renderer/index.html`, dans la section `compte-rendu`, remplacer le bloc `<div class="actions">` par :

```html
            <div class="actions">
              <button type="button" id="bouton-generer">Générer</button>
              <button type="button" class="bouton--discret" id="bouton-copier" disabled>
                Copier
              </button>
              <button type="button" class="bouton--discret" id="bouton-planche">
                Fabriquer la planche
              </button>
            </div>
            <p class="planche__resultat" id="planche-resultat" hidden></p>
```

- [ ] **Step 2: Styler la zone de résultat**

Ajouter à la fin de `src/electron/renderer/renderer.css` :

```css
/* --- Planche de manches --- */

/* Le resultat tient sur deux lignes : le fichier, puis le presse-papier.
   `pre-line` evite d'avoir a construire deux elements pour un message. */
.planche__resultat {
  margin-top: 0.6rem;
  white-space: pre-line;
  font-size: 0.85rem;
  line-height: 1.5;
  color: var(--texte-doux);
}
```

- [ ] **Step 3: Câbler le bouton**

Dans `src/electron/renderer/renderer.js`, ajouter aux deux entrées de l'objet `elements` (près de `boutonCopier`) :

```javascript
  boutonPlanche: document.getElementById("bouton-planche"),
  plancheResultat: document.getElementById("planche-resultat"),
```

Dans `cacheLeCompteRendu()`, ajouter avant la dernière ligne :

```javascript
  // La planche affichee appartient a la session precedente, comme le compte
  // rendu : on la vide en meme temps.
  elements.plancheResultat.hidden = true;
  elements.plancheResultat.textContent = "";
```

Puis ajouter, après le gestionnaire de `boutonCopier` :

```javascript
elements.boutonPlanche.addEventListener("click", async () => {
  if (ficheCourante === undefined) return;
  cacheLesBandeaux();

  elements.boutonPlanche.disabled = true;
  elements.plancheResultat.hidden = true;
  try {
    const planche = await api.buildPlanche({ path: ficheCourante.path });
    const ko = Math.round(planche.octets / 1024);
    elements.plancheResultat.textContent =
      `${planche.chemin} · ${planche.largeur} × ${planche.hauteur} px · ${ko} Ko\n` +
      (planche.pressePapier === "copie"
        ? "Aussi dans le presse-papier — prête à coller dans Discord."
        : "Presse-papier indisponible : glissez le fichier dans Discord.");
    elements.plancheResultat.hidden = false;
  } catch (erreur) {
    bandeau(elements.erreur, String(erreur?.message ?? erreur));
  } finally {
    elements.boutonPlanche.disabled = false;
  }
});
```

- [ ] **Step 4: Lancer le test qui relie le script au document**

Run: `npx vitest run tests/electron/renderer.test.ts`
Expected: PASS

Ce test vérifie que tout identifiant cherché par `renderer.js` existe dans `index.html`. S'il échoue sur `bouton-planche` ou `planche-resultat`, c'est que l'un des deux fichiers n'a pas été modifié.

- [ ] **Step 5: Lancer l'application et fabriquer une vraie planche**

```bash
npm run app
```

Ouvrir une session, cliquer **Fabriquer la planche**, puis vérifier :
- le chemin annoncé existe et le PNG s'ouvre ;
- l'image n'est **pas noire** et n'est pas tronquée en bas — c'est le point où le rendu hors écran se confirme ou se dément ;
- aucun tofu dans les pseudos ;
- l'état du presse-papier annoncé correspond à la réalité : tenter un Ctrl+V dans Discord.

> Si l'image est vide ou noire, le rendu hors écran n'a pas peint. Essayer, dans cet ordre : retirer `offscreen: true` en gardant `show: false` ; puis, à défaut, afficher la fenêtre hors du viseur (`x: -10000`). Noter dans le commentaire du fichier ce qui a réellement marché sur cette machine.

- [ ] **Step 6: Documenter dans le README**

Dans `README.md`, ajouter une sous-section à la fin de la partie **Le compte rendu** :

```markdown
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
```

- [ ] **Step 7: Lancer toute la suite et le typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/electron/renderer/index.html src/electron/renderer/renderer.js src/electron/renderer/renderer.css README.md
git commit -m "feat(fenetre): bouton de fabrication de la planche

Annonce le chemin du PNG, ses dimensions et l'etat reel du presse-papier
plutot que de supposer une copie reussie. Se verrouille pendant la
capture, et se vide au changement de session comme le compte rendu.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: L'option `--planche` de la ligne de commande

La CLI n'a pas Electron et n'en acquerra pas. Elle écrit le HTML, qu'on ouvre dans un navigateur pour voir exactement ce que la capture photographiera — le même rôle qu'elle joue déjà pour travailler une formulation du compte rendu.

**Files:**
- Modify: `src/reportCli.ts`
- Modify: `tests/reportCli.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `construisLaPlanche` (Task 2), `DEFAULT_PLANCHE_DIR` (Task 3)
- Produces: `ReportCliOptions.planche: boolean` ; `ecrisLaPlanche(options: ReportCliOptions): Promise<string>`

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à `tests/reportCli.test.ts` (en complétant les imports en tête du fichier depuis `../src/reportCli.ts`) :

```typescript
describe("parseReportArgs --planche", () => {
  test("est faux par defaut", () => {
    expect(parseReportArgs(["data/sessions/s.json"]).planche).toBe(false);
  });

  test("passe a vrai quand l'option est donnee", () => {
    expect(parseReportArgs(["data/sessions/s.json", "--planche"]).planche).toBe(true);
  });

  test("se combine avec --out", () => {
    const options = parseReportArgs(["s.json", "--planche", "--out", "ailleurs"]);
    expect(options.planche).toBe(true);
    expect(options.outDir).toBe("ailleurs");
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run tests/reportCli.test.ts`
Expected: FAIL — `expected undefined to be false`

- [ ] **Step 3: Ajouter l'option**

Dans `src/reportCli.ts` :

Ajouter les imports :

```typescript
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { DEFAULT_OUT_DIR, DEFAULT_PLANCHE_DIR } from "./config.ts";
import { construisLaPlanche } from "./report/planche.ts";
```

*(l'import existant de `DEFAULT_OUT_DIR` est remplacé par celui ci-dessus ; `readFile` reste importé depuis `node:fs/promises`, donc la ligne devient `import { mkdir, readFile, writeFile } from "node:fs/promises";`)*

Ajouter à `USAGE`, entre `--ressenti` et `--out` :

```
  --planche           Ecrit la planche de manches en HTML au lieu d'imprimer
                      le compte rendu. Dans ${DEFAULT_PLANCHE_DIR}.
```

Ajouter le champ au type :

```typescript
export type ReportCliOptions = {
  path: string;
  sections: SectionCompteRendu[];
  objectif?: string;
  ressenti?: string;
  outDir: string;
  /** Ecrit la planche en HTML au lieu d'imprimer le compte rendu. */
  planche: boolean;
};
```

Ajouter l'option à `parseArgs` :

```typescript
      planche: { type: "boolean" },
```

Et au retour de `parseReportArgs` :

```typescript
    outDir: values.out ?? DEFAULT_OUT_DIR,
    planche: values.planche === true,
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run tests/reportCli.test.ts`
Expected: PASS

- [ ] **Step 5: Partager la lecture de session, puis écrire la planche**

`rendCompteRendu` porte aujourd'hui la lecture tolérante de la session (hors dossier, on lit quand même). La planche en a besoin à l'identique : on l'extrait plutôt que de la recopier.

Dans `src/reportCli.ts`, remplacer `rendCompteRendu` par :

```typescript
/**
 * Lit la session designee par la ligne de commande.
 *
 * Passe par `readSession`, qui refuse tout chemin hors du dossier des sessions,
 * sauf si l'appelant designe explicitement un autre dossier avec `--out` : en
 * ligne de commande, c'est l'utilisateur lui-meme qui choisit ou il lit. La
 * garde protege la fenetre, pas quelqu'un qui tape un chemin dans son terminal.
 */
async function lisLaSession(options: ReportCliOptions): Promise<SessionFile> {
  return readSession(options.path, options.outDir).catch(async (erreur: unknown) => {
    if (erreur instanceof Error && erreur.message.startsWith("Chemin de session refuse")) {
      return JSON.parse(await readFile(options.path, "utf8")) as SessionFile;
    }
    throw erreur;
  });
}

/** Lit la session et rend son compte rendu. */
export async function rendCompteRendu(options: ReportCliOptions): Promise<string> {
  const file = await lisLaSession(options);

  return construisLeCompteRendu(file, {
    sections: options.sections,
    ...(options.objectif !== undefined ? { objectif: options.objectif } : {}),
    ...(options.ressenti !== undefined ? { ressenti: options.ressenti } : {}),
  });
}

/**
 * Ecrit la planche en HTML et rend son chemin.
 *
 * Le HTML, pas le PNG : la capture demande Electron, que la ligne de commande
 * n'a pas et ne doit pas acquerir. Ouvert dans un navigateur, le fichier montre
 * exactement ce que l'application photographiera - de quoi travailler le
 * gabarit sans relancer l'application.
 */
export async function ecrisLaPlanche(options: ReportCliOptions): Promise<string> {
  const file = await lisLaSession(options);
  await mkdir(DEFAULT_PLANCHE_DIR, { recursive: true });

  const chemin = join(DEFAULT_PLANCHE_DIR, `${basename(options.path, ".json")}.html`);
  await writeFile(chemin, construisLaPlanche(file), "utf8");
  return chemin;
}
```

Puis remplacer `main` par :

```typescript
export async function main(argv: string[]): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(USAGE);
    return;
  }

  const options = parseReportArgs(argv);

  if (options.planche) {
    console.log(`Planche écrite dans ${await ecrisLaPlanche(options)}`);
    return;
  }

  process.stdout.write(await rendCompteRendu(options));
}
```

- [ ] **Step 6: Vérifier sur une vraie session**

```bash
ls data/sessions/*.json | head -1
npm run report -- "$(ls data/sessions/*.json | head -1)" --planche
```

Expected: `Planche écrite dans data/planches/<nom>.html`

Ouvrir le fichier dans un navigateur : c'est la même planche que celle photographiée par l'application.

S'il n'y a aucune session enregistrée, sauter cette étape et le noter dans le message de fin de tâche.

- [ ] **Step 7: Documenter l'option**

Dans `README.md`, dans le bloc de code de la partie **Le compte rendu** qui montre les appels à `npm run report`, ajouter une ligne :

```bash
npm run report -- <fichier> --planche
```

Et juste après ce bloc, compléter le paragraphe existant sur la ligne de commande avec :

```markdown
Avec `--planche`, elle écrit le HTML de la planche dans `data/planches/` au lieu
d'imprimer le compte rendu. Le PNG, lui, ne sort que de l'application : la
capture demande Electron, que la ligne de commande n'a pas.
```

- [ ] **Step 8: Lancer toute la suite et le typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/reportCli.ts tests/reportCli.test.ts README.md
git commit -m "feat(cli): option --planche, en HTML

Ecrit le gabarit de la planche sans passer par Electron : ouvert dans un
navigateur, il montre ce que l'application photographiera. Meme role que
la CLI joue deja pour travailler une formulation du compte rendu.

La lecture tolerante de session est extraite, pour que la planche et le
compte rendu la partagent au lieu de la dupliquer.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Vérification finale

Une fois les six tâches faites :

- [ ] `npm test` — tout vert
- [ ] `npm run typecheck` — aucune erreur
- [ ] `npm run app` — le bouton fabrique une planche lisible, non noire, non tronquée
- [ ] Le PNG collé dans Discord s'affiche correctement
- [ ] `git log --oneline` montre les six commits, dans l'ordre
