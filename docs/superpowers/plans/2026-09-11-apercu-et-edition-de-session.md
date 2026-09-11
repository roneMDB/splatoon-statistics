# Aperçu avant récupération et édition des sessions — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre de voir les matchs d'une fenêtre de temps avant de les écrire, puis de consulter, renommer, retyper ou supprimer une session déjà écrite.

**Architecture:** `handleFetchSession` se scinde en `previewSession` (interroge stat.ink, n'écrit rien) et `saveSession` (écrit l'aperçu retenu). Les matchs bruts ne traversent jamais le pont IPC : le processus principal retient l'aperçu sous un identifiant et n'envoie à la fenêtre qu'une vue allégée. Trois fonctions de lecture/écriture s'ajoutent à `sessionList.ts`, toutes protégées par une garde de chemin.

**Tech Stack:** TypeScript, Node ≥ 22, Electron 44, vitest, tsx.

**Spec:** `docs/superpowers/specs/2026-09-11-apercu-et-edition-de-session-design.md`

## Global Constraints

- **Aucune dépendance de runtime nouvelle.** Modules `node:` et code local uniquement.
- **Code, commentaires, messages et noms de tests en français sans accents** — le dépôt écrit « fenetre », « deterministe », « apercu ». Le README et les textes affichés dans la fenêtre (HTML, messages du rendu) **sont accentués**.
- **Imports avec extension explicite `.ts`.**
- **Tous les tests tournent hors-ligne et sans TTY ni fenêtre.**
- **Commentaire JSDoc sur chaque export**, disant *pourquoi* et non ce que le code fait déjà lire.
- **Les matchs sont stockés bruts.** Aucune transformation ne doit atteindre le tableau `battles` écrit sur disque.
- **`src/electron/main.ts` et `src/electron/preload.cts` sont les seuls fichiers à importer `electron`.** Toute logique vit ailleurs, testable hors-ligne.
- **Le preload ne peut rien importer d'autre qu'`electron`** : le bac à sable fournit un chargeur incapable de résoudre un module local. Il redéclare les noms de canaux ; `tests/electron/preload.test.ts` interdit qu'ils divergent.
- Vérification de chaque tâche : `npm test`, `npm run typecheck` et `npm run app:build` passent.

---

### Task 1: `battleRows` — la vue allégée d'un match

**Files:**
- Create: `src/battleRows.ts`
- Test: `tests/battleRows.test.ts`

**Interfaces:**
- Consumes: `StatinkBattle` de `src/statink/types.ts`.
- Produces, utilisés par les tâches 2, 3 et 5 :
  - `type BattleRow = { uuid: string; startedAt: string; lobby?: string; rule?: string; stage?: string; result?: string }`
  - `toBattleRows(battles: StatinkBattle[]): BattleRow[]`

C'est ce que la fenêtre affiche d'un match, et rien de plus : les mêmes colonnes que le récapitulatif de la ligne de commande (`summarize` dans `src/cli.ts`). Les champs absents sont **omis**, pas remplis d'un `"?"` : c'est au rendu de décider comment présenter un trou.

- [ ] **Step 1: Write the failing test**

Créer `tests/battleRows.test.ts` :

```ts
import { describe, expect, test } from "vitest";
import { toBattleRows } from "../src/battleRows.ts";
import type { StatinkBattle } from "../src/statink/types.ts";

const complet = {
  uuid: "a",
  lobby: { key: "private" },
  rule: { key: "yagura" },
  stage: { key: "yagara" },
  result: "win",
  start_at: { time: 1_754_336_668, iso8601: "2026-08-04T19:44:28+00:00" },
} as unknown as StatinkBattle;

describe("toBattleRows", () => {
  test("retient les colonnes affichees, aplaties", () => {
    expect(toBattleRows([complet])).toEqual([
      {
        uuid: "a",
        startedAt: "2026-08-04T19:44:28+00:00",
        lobby: "private",
        rule: "yagura",
        stage: "yagara",
        result: "win",
      },
    ]);
  });

  test("preserve l'ordre recu", () => {
    const second = { ...complet, uuid: "b" } as StatinkBattle;
    expect(toBattleRows([complet, second]).map((row) => row.uuid)).toEqual(["a", "b"]);
  });

  test("omet les champs absents plutot que d'inventer une valeur", () => {
    const nu = { uuid: "vide" } as unknown as StatinkBattle;

    const [row] = toBattleRows([nu]);

    expect(row).toEqual({ uuid: "vide", startedAt: "" });
    expect(Object.keys(row ?? {})).not.toContain("rule");
  });

  test("rend une liste vide pour une session sans match", () => {
    expect(toBattleRows([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/battleRows.test.ts --reporter=basic
```

Attendu : ÉCHEC, `Failed to load url ../src/battleRows.ts`.

- [ ] **Step 3: Write minimal implementation**

Créer `src/battleRows.ts` :

```ts
/**
 * Vue allegee d'un match : ce que la fenetre affiche, et rien de plus.
 *
 * Elle existe pour que les matchs bruts n'aient pas a traverser le pont IPC,
 * ou ils pourraient etre alteres et ou leur poids se paierait deux fois.
 */

import type { StatinkBattle } from "./statink/types.ts";

/** Une ligne du tableau de matchs. Les champs absents sont omis. */
export type BattleRow = {
  uuid: string;
  /** ISO 8601 tel que stat.ink le donne, ou chaine vide si le match n'en a pas. */
  startedAt: string;
  lobby?: string;
  rule?: string;
  stage?: string;
  result?: string;
};

/** Aplatit des matchs bruts en lignes affichables, dans l'ordre recu. */
export function toBattleRows(battles: StatinkBattle[]): BattleRow[] {
  return battles.map((battle) => ({
    uuid: battle.uuid,
    startedAt: battle.start_at?.iso8601 ?? "",
    ...(battle.lobby?.key !== undefined ? { lobby: battle.lobby.key } : {}),
    ...(battle.rule?.key !== undefined ? { rule: battle.rule.key } : {}),
    ...(battle.stage?.key !== undefined ? { stage: battle.stage.key } : {}),
    ...(battle.result !== undefined ? { result: battle.result } : {}),
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/battleRows.test.ts --reporter=basic
npm run typecheck
```

Attendu : 4 tests passent, `tsc --noEmit` silencieux.

- [ ] **Step 5: Commit**

```bash
git add src/battleRows.ts tests/battleRows.test.ts
git commit -m "feat: vue allegee d'un match pour l'affichage"
```

---

### Task 2: Scinder la récupération de l'écriture

**Files:**
- Modify: `src/electron/sessionFetchHandler.ts` (remplace `handleFetchSession`)
- Modify: `tests/electron/sessionFetchHandler.test.ts` (réécrit autour des deux fonctions)

**Interfaces:**
- Consumes : `toBattleRows` et `BattleRow` de la tâche 1 ; `fetchSession`, `buildSessionFile`, `writeSession`, `buildWindow`, `summarizeSessionFile`, `tallyResults`, `isSessionType`, `isKnownLobby`.
- Produces, utilisés par les tâches 4 et 5 :
  - `type SessionPreview = { previewId: string; user: string; name?: string; type?: SessionType; window: { from: string; to: string }; battleCount: number; results: SessionResults; rows: BattleRow[]; pagesFetched: number; stopReason: StopReason }`
  - `previewSession(input: FetchSessionFormInput, deps?: SessionFetchHandlerDeps): Promise<SessionPreview>`
  - `saveSession(previewId: string, deps?: SessionFetchHandlerDeps): Promise<SessionSummary>`

`handleFetchSession` et le type `FetchSessionOutcome` disparaissent : plus personne ne les appelle une fois la tâche 5 faite, et les garder serait un troisième chemin d'écriture à maintenir.

**Trois points à ne pas manquer :**

1. **`fetchedAt` est capturé à la prévisualisation**, pas à l'enregistrement. Le champ est documenté « Instant de la recuperation » : c'est l'appel réseau qui le date, pas le clic qui suit. Même raison qu'en ligne de commande, où il est capturé juste après `fetchSession` et non après le dialogue de nommage.
2. **L'enregistrement consomme l'aperçu.** L'identifiant n'est plus valable ensuite : un double-clic ne doit pas écrire deux fois.
3. **Un seul aperçu est retenu à la fois.** Prévisualiser à nouveau remplace le précédent.

- [ ] **Step 1: Write the failing test**

Remplacer entièrement le contenu de `tests/electron/sessionFetchHandler.test.ts` par :

```ts
import { afterEach, describe, expect, test } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  previewSession,
  saveSession,
} from "../../src/electron/sessionFetchHandler.ts";
import { listSessions } from "../../src/sessionList.ts";
import type { StatinkBattle } from "../../src/statink/types.ts";

/** Match minimal : seuls uuid, start_at et result comptent ici. */
function battle(uuid: string, iso: string, result = "win"): StatinkBattle {
  const ms = Date.parse(iso);
  return {
    id: uuid,
    uuid,
    url: `https://stat.ink/@Gloup/spl3/${uuid}`,
    lobby: { key: "private" },
    rule: { key: "yagura" },
    stage: { key: "yagara" },
    result,
    start_at: { time: ms / 1000, iso8601: iso },
    // Champ inconnu du code : il doit survivre jusqu'au fichier ecrit.
    champ_inconnu: { profond: 42 },
  } as unknown as StatinkBattle;
}

function stubPages(pages: StatinkBattle[][]) {
  const fetchPage = async (request: { page: number; filters?: unknown }) =>
    pages[Math.min(request.page - 1, pages.length - 1)] ?? [];
  return { fetchPage };
}

const dirs: string[] = [];
const tempDir = async () => {
  const dir = await mkdtemp(join(tmpdir(), "splat-apercu-"));
  dirs.push(dir);
  return dir;
};
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const fenetre = { from: "2026-08-19 20:00", to: "2026-08-19 23:00" };

describe("previewSession", () => {
  test("rend le bilan et les lignes sans rien ecrire", async () => {
    const outDir = await tempDir();
    const { fetchPage } = stubPages([
      [
        battle("b", "2026-08-19T20:30:00Z", "lose"),
        battle("a", "2026-08-19T19:00:00Z", "win"),
      ],
    ]);

    const apercu = await previewSession(
      { user: "Gloup", name: "Scrim contre Les Corsaires", type: "scrim", ...fenetre },
      { fetchPage, outDir },
    );

    expect(apercu.battleCount).toBe(2);
    expect(apercu.results).toEqual({ win: 1, lose: 1, draw: 0 });
    expect(apercu.rows).toHaveLength(2);
    expect(apercu.rows[0]).toMatchObject({ rule: "yagura", stage: "yagara" });
    expect(apercu.name).toBe("Scrim contre Les Corsaires");
    expect(apercu.previewId).not.toBe("");
    await expect(listSessions(outDir)).resolves.toEqual({ sessions: [], errors: [] });
  });

  test("donne un identifiant different a chaque apercu", async () => {
    const outDir = await tempDir();
    const { fetchPage } = stubPages([[]]);

    const premier = await previewSession({ user: "Gloup", ...fenetre }, { fetchPage, outDir });
    const second = await previewSession({ user: "Gloup", ...fenetre }, { fetchPage, outDir });

    expect(second.previewId).not.toBe(premier.previewId);
  });

  test("annonce la progression page par page", async () => {
    const outDir = await tempDir();
    const { fetchPage } = stubPages([
      [battle("a", "2026-08-19T20:30:00Z")],
      [battle("b", "2026-08-18T10:00:00Z")],
    ]);
    const progression: unknown[] = [];

    await previewSession(
      { user: "Gloup", ...fenetre },
      { fetchPage, outDir, onProgress: (etape) => progression.push(etape) },
    );

    expect(progression[0]).toMatchObject({ page: 1 });
  });

  test("traite un nom vide comme un nom absent", async () => {
    const outDir = await tempDir();
    const { fetchPage } = stubPages([[]]);

    const apercu = await previewSession(
      { user: "Gloup", name: "   ", ...fenetre },
      { fetchPage, outDir },
    );

    expect(apercu.name).toBeUndefined();
  });

  test("refuse un type hors liste avec le message de la ligne de commande", async () => {
    const outDir = await tempDir();
    const { fetchPage } = stubPages([[]]);

    await expect(
      previewSession({ user: "Gloup", type: "tournoi", ...fenetre }, { fetchPage, outDir }),
    ).rejects.toThrow(/--type inconnue.*intra/s);
  });

  test("refuse un lobby hors liste avec le message de la ligne de commande", async () => {
    const outDir = await tempDir();
    const { fetchPage } = stubPages([[]]);

    await expect(
      previewSession({ user: "Gloup", lobby: "salon-prive", ...fenetre }, { fetchPage, outDir }),
    ).rejects.toThrow(/--lobby inconnue.*private/s);
  });

  test("refuse une date illisible", async () => {
    const outDir = await tempDir();
    const { fetchPage } = stubPages([[]]);

    await expect(
      previewSession({ user: "Gloup", from: "hier soir" }, { fetchPage, outDir }),
    ).rejects.toThrow(/illisible/);
  });

  test("refuse un compte vide plutot que d'interroger stat.ink", async () => {
    const outDir = await tempDir();
    let appele = false;
    const fetchPage = async () => {
      appele = true;
      return [];
    };

    await expect(
      previewSession({ user: "   ", ...fenetre }, { fetchPage, outDir }),
    ).rejects.toThrow(/pseudo/i);
    expect(appele).toBe(false);
  });

  test("laisse remonter une erreur reseau", async () => {
    const outDir = await tempDir();
    const fetchPage = async () => {
      throw new Error("stat.ink a repondu 403.");
    };

    await expect(
      previewSession({ user: "Gloup", ...fenetre }, { fetchPage, outDir }),
    ).rejects.toThrow("stat.ink a repondu 403.");
  });
});

describe("saveSession", () => {
  test("ecrit les matchs bruts de l'apercu, sans nouvel appel reseau", async () => {
    const outDir = await tempDir();
    let appels = 0;
    const fetchPage = async (request: { page: number }) => {
      appels += 1;
      return request.page === 1 ? [battle("a", "2026-08-19T20:30:00Z")] : [];
    };

    const apercu = await previewSession(
      { user: "Gloup", name: "Intra Équipe A vs Équipe N", type: "intra", ...fenetre },
      { fetchPage, outDir, now: () => new Date("2026-08-19T21:34:00Z") },
    );
    const appelsApresApercu = appels;
    const resume = await saveSession(apercu.previewId, { outDir });

    expect(appels).toBe(appelsApresApercu);
    expect(resume.name).toBe("Intra Équipe A vs Équipe N");
    expect(resume.type).toBe("intra");
    expect(resume.battleCount).toBe(1);

    const ecrit = JSON.parse(await readFile(resume.path, "utf8"));
    // Le champ inconnu prouve que le match n'a pas ete aplati en cours de route.
    expect(ecrit.battles[0].champ_inconnu).toEqual({ profond: 42 });
  });

  test("date le fichier de l'instant de la recuperation, pas de l'enregistrement", async () => {
    const outDir = await tempDir();
    const { fetchPage } = stubPages([[]]);

    const apercu = await previewSession(
      { user: "Gloup", ...fenetre },
      { fetchPage, outDir, now: () => new Date("2026-08-19T21:34:00Z") },
    );
    const resume = await saveSession(apercu.previewId, {
      outDir,
      now: () => new Date("2026-08-19T23:59:00Z"),
    });

    expect(resume.fetchedAt).toBe("2026-08-19T21:34:00.000Z");
  });

  test("ecrit quand meme une session sans aucun match", async () => {
    const outDir = await tempDir();
    const { fetchPage } = stubPages([[]]);

    const apercu = await previewSession(
      { user: "Gloup", name: "soiree annulee", ...fenetre },
      { fetchPage, outDir },
    );
    const resume = await saveSession(apercu.previewId, { outDir });

    expect(resume.battleCount).toBe(0);
    await expect(readFile(resume.path, "utf8")).resolves.toContain("soiree annulee");
  });

  test("consomme l'apercu : un second enregistrement echoue", async () => {
    const outDir = await tempDir();
    const { fetchPage } = stubPages([[]]);

    const apercu = await previewSession({ user: "Gloup", ...fenetre }, { fetchPage, outDir });
    await saveSession(apercu.previewId, { outDir });

    await expect(saveSession(apercu.previewId, { outDir })).rejects.toThrow(
      /previsualisation/i,
    );
  });

  test("refuse un identifiant inconnu en invitant a previsualiser", async () => {
    const outDir = await tempDir();

    await expect(saveSession("inconnu", { outDir })).rejects.toThrow(/previsualisation/i);
  });

  test("un nouvel apercu remplace le precedent", async () => {
    const outDir = await tempDir();
    const { fetchPage } = stubPages([[]]);

    const premier = await previewSession({ user: "Gloup", ...fenetre }, { fetchPage, outDir });
    await previewSession({ user: "Gloup", ...fenetre }, { fetchPage, outDir });

    await expect(saveSession(premier.previewId, { outDir })).rejects.toThrow(
      /previsualisation/i,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/electron/sessionFetchHandler.test.ts --reporter=basic
```

Attendu : ÉCHEC, `previewSession is not a function` (ou une erreur d'import équivalente).

- [ ] **Step 3: Write minimal implementation**

Dans `src/electron/sessionFetchHandler.ts`, remplacer l'import de tête, le type `FetchSessionOutcome` et la fonction `handleFetchSession` par ce qui suit. Les trois fonctions privées `parseType`, `parseLobby` et `parseMaxPages` en bas du fichier **ne changent pas**.

Imports à ajouter :

```ts
import { randomUUID } from "node:crypto";
import { toBattleRows, type BattleRow } from "../battleRows.ts";
import {
  summarizeSessionFile,
  tallyResults,
  type SessionResults,
  type SessionSummary,
} from "../sessionList.ts";
import type { StatinkBattle } from "../statink/types.ts";
import type { BattleFilters } from "../statink/url.ts";
import type { SessionWindow } from "../window.ts";
```

Corps :

```ts
/** Ce que la fenetre recoit d'un apercu : jamais les matchs bruts. */
export type SessionPreview = {
  /** A rendre a `saveSession` pour ecrire cet apercu-la. */
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

/** Apercu retenu cote processus principal, matchs bruts compris. */
type ApercuRetenu = {
  user: string;
  name?: string;
  type?: SessionType;
  window: SessionWindow;
  filters: BattleFilters;
  battles: StatinkBattle[];
  /** Date de l'appel reseau, pas de l'enregistrement. */
  fetchedAt: Date;
};

/**
 * Un seul apercu a la fois : il n'y a qu'une fenetre et qu'un formulaire.
 * Previsualiser a nouveau remplace le precedent, et enregistrer le consomme.
 */
let apercuRetenu: { id: string; contenu: ApercuRetenu } | undefined;

const APERCU_PERDU =
  "L'apercu n'est plus disponible. Relancez la previsualisation.";

/**
 * Valide la saisie et interroge stat.ink, sans rien ecrire.
 *
 * Les matchs bruts restent ici : la fenetre n'en voit qu'une vue allegee, ce
 * qui evite de les faire transiter deux fois et d'exposer leur contenu a une
 * alteration en chemin.
 */
export async function previewSession(
  input: FetchSessionFormInput,
  deps: SessionFetchHandlerDeps = {},
): Promise<SessionPreview> {
  const user = input.user.trim();
  if (user === "") {
    throw new Error("Le pseudo stat.ink est vide.");
  }

  const type = parseType(input.type);
  const lobby = parseLobby(input.lobby);
  const maxPages = parseMaxPages(input.maxPages);
  const name = input.name?.trim() || undefined;

  // Leve avant tout appel reseau si la fenetre est illisible ou a l'envers.
  const window = buildWindow(input.from, input.to);
  const filters: BattleFilters = { lobby };

  const result = await fetchSession(
    { user, window, filters, maxPages },
    { fetchPage: deps.fetchPage, onPage: deps.onProgress },
  );
  const fetchedAt = deps.now?.() ?? new Date();

  const id = randomUUID();
  apercuRetenu = {
    id,
    contenu: { user, name, type, window, filters, battles: result.battles, fetchedAt },
  };

  return {
    previewId: id,
    user,
    ...(name !== undefined ? { name } : {}),
    ...(type !== undefined ? { type } : {}),
    window: {
      from: new Date(window.fromMs).toISOString(),
      to: new Date(window.toMs).toISOString(),
    },
    battleCount: result.battles.length,
    results: tallyResults(result.battles),
    rows: toBattleRows(result.battles),
    pagesFetched: result.pagesFetched,
    stopReason: result.stopReason,
  };
}

/**
 * Ecrit l'apercu retenu, puis l'oublie : un double-clic ne doit pas ecrire
 * deux fois la meme recuperation.
 */
export async function saveSession(
  previewId: string,
  deps: SessionFetchHandlerDeps = {},
): Promise<SessionSummary> {
  if (apercuRetenu === undefined || apercuRetenu.id !== previewId) {
    throw new Error(APERCU_PERDU);
  }
  const { contenu } = apercuRetenu;
  apercuRetenu = undefined;

  const file = buildSessionFile({
    user: contenu.user,
    name: contenu.name,
    type: contenu.type,
    window: contenu.window,
    filters: contenu.filters,
    battles: contenu.battles,
    fetchedAt: contenu.fetchedAt,
  });
  const path = await writeSession(file, deps.outDir ?? DEFAULT_OUT_DIR);

  return summarizeSessionFile(file, path);
}
```

Supprimer l'ancien `export type FetchSessionOutcome` et l'ancienne fonction `handleFetchSession`, ainsi que les imports devenus inutiles.

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/electron/sessionFetchHandler.test.ts --reporter=basic
npm run typecheck
```

Attendu : 15 tests passent, `tsc --noEmit` silencieux, `npm run app:build` sans erreur — à condition d'avoir fait l'étape 3 bis ci-dessous.

- [ ] **Step 3 bis: Retirer le canal devenu orphelin**

`src/electron/main.ts` enregistre encore `IPC.fetchSession`, qui appelait
`handleFetchSession`. Le laisser ferait échouer la compilation. Supprimer le bloc
entier :

```ts
ipcMain.handle(
  IPC.fetchSession,
  async (event, input: FetchSessionFormInput) =>
    handleFetchSession(input, {
      // La progression ne part qu'a la fenetre qui a demande la recuperation.
      onProgress: (progress) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send(IPC.fetchProgress, progress);
        }
      },
    }),
);
```

ainsi que l'import de `handleFetchSession` et, s'il n'est plus utilisé,
celui de `FetchSessionFormInput`. Ne pas supprimer `IPC.fetchSession` de
`ipcChannels.ts` : la tâche 4 s'en charge en même temps qu'elle ajoute les
nouveaux canaux.

L'application n'a donc plus de canal de récupération entre cette tâche et la
tâche 4. C'est sans conséquence : la fenêtre n'est recâblée qu'à la tâche 5.

- [ ] **Step 5: Commit**

```bash
git add src/electron/sessionFetchHandler.ts src/electron/main.ts tests/electron/sessionFetchHandler.test.ts
git commit -m "feat: scinde la recuperation de l'ecriture"
```

---

### Task 3: Lire, modifier et supprimer une session écrite

**Files:**
- Modify: `src/store.ts` (exporter la reconstruction de fenêtre, aujourd'hui privée)
- Modify: `src/sessionList.ts` (trois fonctions et la garde de chemin)
- Test: `tests/sessionList.test.ts` (ajouter des blocs)

**Interfaces:**
- Consumes : `SessionFile`, `buildSessionFile`, `writeSession` de `src/store.ts` ; `summarizeSessionFile` déjà dans `sessionList.ts`.
- Produces, utilisés par la tâche 4 :
  - `readSession(path: string, outDir?: string): Promise<SessionFile>`
  - `updateSessionMeta(path: string, meta: { name?: string; type?: SessionType }, outDir?: string): Promise<SessionSummary>`
  - `deleteSession(path: string, outDir?: string): Promise<void>`
  - `sessionWindowOf(file: SessionFile): SessionWindow` exporté depuis `src/store.ts`

**Pourquoi la garde :** la fenêtre envoie un chemin. Sans contrôle, un rendu compromis ferait lire ou supprimer n'importe quel fichier accessible à l'utilisateur. Chaque fonction vérifie que le chemin résolu est sous le dossier des sessions et se termine par `.json`.

**Pourquoi passer par `buildSessionFile` pour modifier :** reconstruire le fichier plutôt que retoucher l'objet relu garantit le même format et le même ordre de clés qu'à l'écriture initiale. `fetchedAt` est repris du fichier — c'est l'instant de la récupération, pas celui de la retouche.

- [ ] **Step 1: Write the failing test**

Ajouter à la fin de `tests/sessionList.test.ts` :

```ts
describe("garde de chemin", () => {
  test("refuse un chemin hors du dossier des sessions", async () => {
    const dir = await tempDir();

    await expect(readSession("/etc/passwd.json", dir)).rejects.toThrow(/refuse/i);
    await expect(deleteSession("/etc/passwd.json", dir)).rejects.toThrow(/refuse/i);
  });

  test("refuse une evasion par ..", async () => {
    const dir = await tempDir();
    const evasion = join(dir, "..", "ailleurs.json");

    await expect(readSession(evasion, dir)).rejects.toThrow(/refuse/i);
  });

  test("refuse un fichier qui n'est pas un .json", async () => {
    const dir = await tempDir();

    await expect(readSession(join(dir, "notes.txt"), dir)).rejects.toThrow(/refuse/i);
  });
});

describe("readSession", () => {
  test("rend la session complete, matchs compris", async () => {
    const dir = await tempDir();
    const path = await ecrisSession(dir, {
      name: "Scrim contre Les Corsaires",
      from: "2026-08-19 20:00",
      to: "2026-08-19 22:00",
      battles: [battle("a", "win"), battle("b", "lose")],
    });

    const file = await readSession(path, dir);

    expect(file.name).toBe("Scrim contre Les Corsaires");
    expect(file.battles).toHaveLength(2);
  });

  test("echoue clairement sur un fichier absent", async () => {
    const dir = await tempDir();

    await expect(readSession(join(dir, "jamais-ecrit.json"), dir)).rejects.toThrow();
  });
});

describe("updateSessionMeta", () => {
  test("change le nom et le type sans toucher au reste", async () => {
    const dir = await tempDir();
    const path = await ecrisSession(dir, {
      name: "faute de frappe",
      type: "intra",
      from: "2026-08-19 20:00",
      to: "2026-08-19 22:00",
      battles: [battle("a", "win")],
    });

    const resume = await updateSessionMeta(
      path,
      { name: "Intra Équipe A vs Équipe N", type: "scrim" },
      dir,
    );

    expect(resume.name).toBe("Intra Équipe A vs Équipe N");
    expect(resume.type).toBe("scrim");
    expect(resume.path).toBe(path);

    const relu = await readSession(path, dir);
    expect(relu.battles).toHaveLength(1);
    expect(relu.window.from).toBe("2026-08-19T18:00:00.000Z");
  });

  test("preserve fetchedAt : c'est la recuperation qui date le fichier", async () => {
    const dir = await tempDir();
    const path = await ecrisSession(dir, {
      name: "avant",
      from: "2026-08-19 20:00",
      to: "2026-08-19 22:00",
    });
    const avant = (await readSession(path, dir)).fetchedAt;

    await updateSessionMeta(path, { name: "apres" }, dir);

    expect((await readSession(path, dir)).fetchedAt).toBe(avant);
  });

  test("traite un nom vide comme une suppression du nom", async () => {
    const dir = await tempDir();
    const path = await ecrisSession(dir, {
      name: "a effacer",
      from: "2026-08-19 20:00",
      to: "2026-08-19 22:00",
    });

    const resume = await updateSessionMeta(path, { name: "   " }, dir);

    expect(resume.name).toBeUndefined();
    expect(Object.keys(await readSession(path, dir))).not.toContain("name");
  });

  test("n'ecrit pas un second fichier : le nom ne depend pas du label", async () => {
    const dir = await tempDir();
    const path = await ecrisSession(dir, {
      name: "premier nom",
      from: "2026-08-19 20:00",
      to: "2026-08-19 22:00",
    });

    await updateSessionMeta(path, { name: "tout autre nom" }, dir);

    const { sessions } = await listSessions(dir);
    expect(sessions).toHaveLength(1);
  });
});

describe("deleteSession", () => {
  test("retire la session de l'inventaire", async () => {
    const dir = await tempDir();
    const path = await ecrisSession(dir, {
      name: "a jeter",
      from: "2026-08-19 20:00",
      to: "2026-08-19 22:00",
    });
    await ecrisSession(dir, { name: "a garder", from: "2026-08-20 20:00", to: "2026-08-20 22:00" });

    await deleteSession(path, dir);

    const { sessions } = await listSessions(dir);
    expect(sessions.map((session) => session.name)).toEqual(["a garder"]);
  });

  test("echoue sur un fichier absent plutot que de faire semblant", async () => {
    const dir = await tempDir();

    await expect(deleteSession(join(dir, "jamais-ecrit.json"), dir)).rejects.toThrow();
  });
});
```

Compléter l'import en tête du fichier :

```ts
import {
  deleteSession,
  listSessions,
  readSession,
  summarizeSessionFile,
  tallyResults,
  updateSessionMeta,
} from "../src/sessionList.ts";
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/sessionList.test.ts --reporter=basic
```

Attendu : ÉCHEC, `readSession is not a function` ou équivalent.

- [ ] **Step 3: Write minimal implementation**

Dans `src/store.ts`, remplacer la fonction privée `windowOf` par un export, et adapter son unique appelant :

```ts
/**
 * Reconstitue les bornes d'une session depuis son fichier. Exporte parce que
 * modifier une session passe par `buildSessionFile`, qui en a besoin.
 */
export function sessionWindowOf(file: SessionFile): SessionWindow {
  const fromMs = Date.parse(file.window.from);
  const toMs = Date.parse(file.window.to);
  return { fromMs, toMs, paddedFromMs: fromMs, paddedToMs: toMs };
}
```

Dans `writeSession`, remplacer `windowOf(file)` par `sessionWindowOf(file)`.

Dans `src/sessionList.ts`, ajouter aux imports :

```ts
import { rm } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { buildSessionFile, sessionWindowOf, writeSession } from "./store.ts";
import type { BattleFilters } from "./statink/url.ts";
```

Puis, à la fin du fichier :

```ts
/**
 * Refuse tout chemin qui sort du dossier des sessions.
 *
 * La fenetre envoie ce chemin : sans ce controle, un rendu compromis ferait
 * lire ou supprimer n'importe quel fichier accessible a l'utilisateur.
 */
function cheminDeSession(path: string, outDir: string): string {
  const resolu = resolve(path);
  const racine = resolve(outDir);
  if (!resolu.startsWith(racine + sep) || !resolu.endsWith(".json")) {
    throw new Error(`Chemin de session refuse : ${path}`);
  }
  return resolu;
}

/** Lit une session complete, matchs compris. */
export async function readSession(
  path: string,
  outDir: string = DEFAULT_OUT_DIR,
): Promise<SessionFile> {
  const resolu = cheminDeSession(path, outDir);
  return parseSessionFile(await readFile(resolu, "utf8"));
}

/**
 * Change le nom et le type d'une session ecrite.
 *
 * Le fichier est reconstruit par `buildSessionFile` plutot que retouche : le
 * format et l'ordre des cles restent identiques a l'ecriture initiale.
 * `fetchedAt` est repris tel quel, c'est la recuperation qui date le fichier.
 * Le nom de fichier ne depend que du compte et de la fenetre : il ne bouge pas.
 */
export async function updateSessionMeta(
  path: string,
  meta: { name?: string; type?: SessionType },
  outDir: string = DEFAULT_OUT_DIR,
): Promise<SessionSummary> {
  const resolu = cheminDeSession(path, outDir);
  const file = parseSessionFile(await readFile(resolu, "utf8"));

  const reconstruit = buildSessionFile({
    user: file.user,
    name: meta.name,
    type: meta.type,
    window: sessionWindowOf(file),
    // Le fichier stocke les filtres a plat ; ils repartent tels quels.
    filters: file.filters as BattleFilters,
    battles: file.battles,
    fetchedAt: new Date(file.fetchedAt),
  });

  const ecrit = await writeSession(reconstruit, outDir);
  return summarizeSessionFile(reconstruit, ecrit);
}

/** Supprime definitivement une session. */
export async function deleteSession(
  path: string,
  outDir: string = DEFAULT_OUT_DIR,
): Promise<void> {
  await rm(cheminDeSession(path, outDir));
}
```

Modifier aussi la fonction utilitaire `ecrisSession` des tests pour qu'elle **renvoie** le chemin — elle renvoie déjà le résultat de `writeSession`, donc rien à faire si c'est le cas ; sinon ajouter le `return`.

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/sessionList.test.ts --reporter=basic
npm run typecheck
```

Attendu : les 11 tests d'origine plus 11 nouveaux passent.

- [ ] **Step 5: Commit**

```bash
git add src/store.ts src/sessionList.ts tests/sessionList.test.ts
git commit -m "feat: lire, modifier et supprimer une session ecrite"
```

---

### Task 4: Canaux IPC et câblage

**Files:**
- Modify: `src/electron/ipcChannels.ts`
- Modify: `src/electron/preload.cts`
- Modify: `src/electron/main.ts`
- Test: `tests/electron/preload.test.ts` (le test existant couvre automatiquement les nouveaux canaux)

**Interfaces:**
- Consumes : `previewSession`, `saveSession` (tâche 2) ; `readSession`, `updateSessionMeta`, `deleteSession` (tâche 3) ; `toBattleRows` (tâche 1).
- Produces, utilisés par la tâche 5 — les méthodes de `window.splatoonApi` :
  - `previewSession(input) => Promise<SessionPreview>`
  - `saveSession(previewId) => Promise<SessionSummary>`
  - `readSession(path) => Promise<{ summary: SessionSummary; rows: BattleRow[] }>`
  - `updateSession({ path, name, type }) => Promise<SessionSummary>`
  - `deleteSession(path) => Promise<void>`
  - `listSessions()`, `choices()`, `onFetchProgress(listener)` — inchangées

- [ ] **Step 1: Mettre à jour les canaux**

Dans `src/electron/ipcChannels.ts`, remplacer la ligne `fetchSession: "session:fetch",` par :

```ts
  /** Interroge stat.ink sans rien ecrire, et retient l'apercu. */
  previewSession: "session:preview",
  /** Ecrit l'apercu retenu. */
  saveSession: "session:save",
  /** Relit une session ecrite, matchs compris. */
  readSession: "session:read",
  /** Change le nom et le type d'une session ecrite. */
  updateSession: "session:update",
  /** Supprime definitivement une session. */
  deleteSession: "session:delete",
```

Remplacer aussi, dans le type `SplatoonApi`, la ligne `fetchSession` par :

```ts
  previewSession: (
    input: FetchSessionFormInput,
  ) => Promise<import("./sessionFetchHandler.ts").SessionPreview>;
  saveSession: (
    previewId: string,
  ) => Promise<import("../sessionList.ts").SessionSummary>;
  readSession: (path: string) => Promise<{
    summary: import("../sessionList.ts").SessionSummary;
    rows: import("../battleRows.ts").BattleRow[];
  }>;
  updateSession: (input: {
    path: string;
    name?: string;
    type?: string;
  }) => Promise<import("../sessionList.ts").SessionSummary>;
  deleteSession: (path: string) => Promise<void>;
```

- [ ] **Step 2: Run the preload guard test to verify it fails**

```bash
npx vitest run tests/electron/preload.test.ts --reporter=basic
```

Attendu : ÉCHEC — le preload ne contient pas encore `"session:preview"`, `"session:save"`, `"session:read"`, `"session:update"` ni `"session:delete"`.

- [ ] **Step 3: Mettre le preload à jour**

Dans `src/electron/preload.cts`, remplacer la constante `CANAUX` et l'entrée `fetchSession` du pont :

```ts
const CANAUX = {
  listSessions: "sessions:list",
  previewSession: "session:preview",
  saveSession: "session:save",
  readSession: "session:read",
  updateSession: "session:update",
  deleteSession: "session:delete",
  fetchProgress: "session:fetch-progress",
  choices: "app:choices",
} as const;
```

Dans l'objet exposé, remplacer `fetchSession` par :

```ts
  previewSession: (input: unknown) =>
    ipcRenderer.invoke(CANAUX.previewSession, input),

  saveSession: (previewId: string) =>
    ipcRenderer.invoke(CANAUX.saveSession, previewId),

  readSession: (path: string) => ipcRenderer.invoke(CANAUX.readSession, path),

  updateSession: (input: unknown) =>
    ipcRenderer.invoke(CANAUX.updateSession, input),

  deleteSession: (path: string) =>
    ipcRenderer.invoke(CANAUX.deleteSession, path),
```

Mettre aussi à jour la liste des fonctions attendues dans `tests/electron/preload.test.ts` :

```ts
    for (const fonction of [
      "listSessions",
      "previewSession",
      "saveSession",
      "readSession",
      "updateSession",
      "deleteSession",
      "choices",
      "onFetchProgress",
    ]) {
```

- [ ] **Step 4: Câbler le processus principal**

Dans `src/electron/main.ts`, remplacer l'import `handleFetchSession` par :

```ts
import { previewSession, saveSession } from "./sessionFetchHandler.ts";
import {
  deleteSession,
  listSessions,
  readSession,
  updateSessionMeta,
} from "../sessionList.ts";
import { toBattleRows } from "../battleRows.ts";
import { summarizeSessionFile } from "../sessionList.ts";
```

(Fusionner les imports venant du même module plutôt que de les répéter.)

Ajouter les gestionnaires, à l'emplacement du bloc `IPC.fetchSession` supprimé à la tâche 2 :

```ts
ipcMain.handle(
  IPC.previewSession,
  async (event, input: FetchSessionFormInput) =>
    previewSession(input, {
      // La progression ne part qu'a la fenetre qui a demande l'apercu.
      onProgress: (progress) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send(IPC.fetchProgress, progress);
        }
      },
    }),
);

ipcMain.handle(IPC.saveSession, (_event, previewId: string) =>
  saveSession(previewId),
);

ipcMain.handle(IPC.readSession, async (_event, path: string) => {
  const file = await readSession(path);
  return { summary: summarizeSessionFile(file, path), rows: toBattleRows(file.battles) };
});

ipcMain.handle(
  IPC.updateSession,
  (_event, input: { path: string; name?: string; type?: string }) =>
    updateSessionMeta(input.path, {
      name: input.name,
      type: input.type === undefined || input.type === "" ? undefined : parseTypeRecu(input.type),
    }),
);

ipcMain.handle(IPC.deleteSession, (_event, path: string) => deleteSession(path));
```

Ajouter en bas de `main.ts` la validation du type reçu, pour que la fenêtre ne puisse pas écrire n'importe quoi dans le champ :

```ts
/** Le type vient de la fenetre : il est valide avant d'atteindre le fichier. */
function parseTypeRecu(value: string): SessionType {
  if (!isSessionType(value)) {
    throw new Error(
      `Valeur de type inconnue : "${value}". ` +
        `Valeurs acceptees : ${SESSION_TYPES.join(", ")}`,
    );
  }
  return value;
}
```

et compléter l'import correspondant :

```ts
import { isSessionType, SESSION_TYPES, type SessionType } from "../sessionMeta.ts";
```

- [ ] **Step 5: Vérifier**

```bash
npm test
npm run typecheck
npm run app:build
```

Attendu : tous les tests passent, `tsc --noEmit` silencieux, compilation Electron sans erreur. La fenêtre ne fonctionne pas encore — elle appelle toujours `api.fetchSession`, recâblée à la tâche 5.

- [ ] **Step 6: Commit**

```bash
git add src/electron/ipcChannels.ts src/electron/preload.cts src/electron/main.ts tests/electron/preload.test.ts
git commit -m "feat: canaux d'apercu, de lecture, de modification et de suppression"
```

---

### Task 5: La fenêtre — aperçu, fiche de session, et README

**Files:**
- Modify: `src/electron/renderer/index.html`
- Modify: `src/electron/renderer/renderer.css`
- Modify: `src/electron/renderer/renderer.js`
- Modify: `README.md`

**Interfaces:**
- Consumes : les huit méthodes de `window.splatoonApi` listées à la tâche 4.

**Trois vues, une seule visible à la fois**, dans la colonne de droite :

| Vue | Quand | Contenu |
|---|---|---|
| `formulaire` | au démarrage, et après Annuler ou Retour | les champs actuels, bouton **Prévisualiser** |
| `apercu` | après une prévisualisation réussie | bilan, tableau des matchs, boutons **Enregistrer** et **Annuler** |
| `fiche` | après un clic sur une session de la liste | nom et type modifiables, fenêtre et bilan en lecture seule, tableau des matchs, boutons **Enregistrer**, **Supprimer**, **Retour** |

- [ ] **Step 1: Structure HTML**

Dans `index.html`, englober le formulaire existant dans `<div id="vue-formulaire">`, puis ajouter deux sections sœurs :

```html
<div id="vue-apercu" hidden>
  <p class="resume" id="apercu-resume"></p>
  <div class="matchs" id="apercu-matchs"></div>
  <div class="actions">
    <button type="button" id="bouton-enregistrer">Enregistrer la session</button>
    <button type="button" class="bouton--discret" id="bouton-annuler">Annuler</button>
  </div>
</div>

<div id="vue-fiche" hidden>
  <div class="champ">
    <label for="fiche-nom">Nom de la session</label>
    <input type="text" id="fiche-nom" autocomplete="off" />
  </div>
  <div class="champ">
    <label for="fiche-type">Type</label>
    <select id="fiche-type"></select>
  </div>
  <p class="resume" id="fiche-resume"></p>
  <div class="matchs" id="fiche-matchs"></div>
  <div class="actions">
    <button type="button" id="bouton-fiche-enregistrer">Enregistrer</button>
    <button type="button" class="bouton--danger" id="bouton-supprimer">Supprimer</button>
    <button type="button" class="bouton--discret" id="bouton-retour">Retour</button>
  </div>
</div>
```

Renommer le bouton du formulaire : `id="bouton-recuperer"` devient `id="bouton-previsualiser"`, libellé **Prévisualiser**.

Dans la liste de gauche, chaque session devient cliquable : la tâche 3 du rendu (ci-dessous) pose un `role="button"` et un `tabindex="0"` sur chaque `<li>`.

- [ ] **Step 2: Style**

Ajouter à `renderer.css` :

```css
.actions {
  display: flex;
  gap: 10px;
  margin-top: 18px;
  flex-wrap: wrap;
}

.bouton--discret {
  background: var(--fond-champ);
  color: var(--texte);
  border: 1px solid var(--trait);
}

.bouton--danger {
  background: var(--erreur);
  color: #2a1015;
}

.resume {
  color: var(--texte-doux);
  margin: 16px 0 8px;
  font-variant-numeric: tabular-nums;
}

.matchs {
  border: 1px solid var(--trait);
  border-radius: 8px;
  overflow: hidden;
  max-height: 46vh;
  overflow-y: auto;
}

.match {
  display: grid;
  grid-template-columns: 5.5em 7em 1fr 5.5em;
  gap: 10px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--trait);
  font-variant-numeric: tabular-nums;
}

.match:last-child {
  border-bottom: none;
}

.match--win > :last-child {
  color: var(--victoire);
}

.match--lose > :last-child {
  color: var(--defaite);
}

.session[aria-selected="true"] {
  border-color: var(--accent);
}

.session {
  cursor: pointer;
}
```

- [ ] **Step 3: Comportement**

Dans `renderer.js`, ajouter les références aux nouveaux éléments dans l'objet `elements`, puis ces fonctions. Le reste du fichier (pré-remplissage, `chargeLesChoix`, `rafraichisLaListe`, `bandeau`) ne change pas, sauf les deux points signalés.

```js
/** Une seule vue visible a la fois dans la colonne de droite. */
function montreLaVue(nom) {
  elements.vueFormulaire.hidden = nom !== "formulaire";
  elements.vueApercu.hidden = nom !== "apercu";
  elements.vueFiche.hidden = nom !== "fiche";
}

/** Tableau des matchs, partage par l'apercu et la fiche. */
function construisLesMatchs(rows) {
  return rows.map((row) => {
    const ligne = document.createElement("div");
    ligne.className = `match match--${row.result ?? "inconnu"}`;
    const heure = row.startedAt
      ? new Date(row.startedAt).toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";
    for (const valeur of [heure, row.rule ?? "—", row.stage ?? "—", row.result ?? "—"]) {
      const cellule = document.createElement("span");
      cellule.textContent = valeur;
      ligne.append(cellule);
    }
    return ligne;
  });
}

function ecrisLeResume(element, donnees) {
  element.textContent =
    `${donnees.battleCount} match(s) — ${donnees.results.win}V - ${donnees.results.lose}D`;
}
```

**Prévisualiser** — le gestionnaire `submit` existant garde son verrouillage, son abonnement à la progression et sa gestion d'erreur ; seul le bloc central change :

```js
let apercuCourant;
let ficheCourante;

// Dans le gestionnaire submit, a la place de l'appel a api.fetchSession :
    const resultat = await api.previewSession(saisie);
    bandeau(elements.progression, "");
    apercuCourant = resultat;

    ecrisLeResume(elements.apercuResume, resultat);
    elements.apercuMatchs.replaceChildren(...construisLesMatchs(resultat.rows));
    montreLaVue("apercu");

    if (resultat.battleCount === 0) {
      // Enregistrable quand meme : une soiree sans match est une information.
      bandeau(
        elements.avertissement,
        "Aucun match trouvé. Vérifiez la fenêtre de temps, le fuseau horaire, " +
          "le filtre de lobby, et que les matchs ont bien été envoyés à stat.ink.",
      );
    }
```

**Enregistrer** (`bouton-enregistrer`) :

```js
elements.boutonEnregistrer.addEventListener("click", async () => {
  if (apercuCourant === undefined) return;
  cacheLesBandeaux();
  try {
    const resume = await api.saveSession(apercuCourant.previewId);
    apercuCourant = undefined;
    elements.nom.value = "";
    bandeau(
      elements.succes,
      `${resume.battleCount} match(s) enregistré(s). Écrit dans ${resume.path}`,
    );
    await rafraichisLaListe();
    montreLaVue("formulaire");
  } catch (erreur) {
    bandeau(elements.erreur, String(erreur?.message ?? erreur));
  }
});
```

**Annuler** (`bouton-annuler`) :

```js
elements.boutonAnnuler.addEventListener("click", () => {
  apercuCourant = undefined;
  cacheLesBandeaux();
  montreLaVue("formulaire");
});
```

**Clic sur une session** — dans `construisLaLigne`, poser `role="button"`, `tabindex="0"` et un écouteur `click` (plus `keydown` sur Entrée et Espace) qui appelle :

```js
async function ouvreLaFiche(session) {
  cacheLesBandeaux();
  const { summary, rows } = await api.readSession(session.path);
  ficheCourante = summary;
  elements.ficheNom.value = summary.name ?? "";
  elements.ficheType.value = summary.type ?? "";
  elements.ficheResume.textContent =
    `${formateLaDate(summary.window.from)} → ${formateLaDate(summary.window.to)}\n` +
    `${summary.battleCount} match(s) — ${summary.results.win}V - ${summary.results.lose}D`;
  elements.ficheMatchs.replaceChildren(...construisLesMatchs(rows));
  montreLaVue("fiche");
}
```

**Les trois actions de la fiche** :

```js
elements.boutonFicheEnregistrer.addEventListener("click", async () => {
  if (ficheCourante === undefined) return;
  cacheLesBandeaux();
  try {
    await api.updateSession({
      path: ficheCourante.path,
      name: elements.ficheNom.value.trim() || undefined,
      type: elements.ficheType.value || undefined,
    });
    await rafraichisLaListe();
    bandeau(elements.succes, "Session modifiée.");
  } catch (erreur) {
    bandeau(elements.erreur, String(erreur?.message ?? erreur));
  }
});

elements.boutonSupprimer.addEventListener("click", async () => {
  if (ficheCourante === undefined) return;
  const nom = ficheCourante.name ?? "cette session sans nom";
  if (!window.confirm(`Supprimer définitivement « ${nom} » ? Cette action est irréversible.`)) {
    return;
  }
  cacheLesBandeaux();
  try {
    await api.deleteSession(ficheCourante.path);
    ficheCourante = undefined;
    await rafraichisLaListe();
    montreLaVue("formulaire");
  } catch (erreur) {
    bandeau(elements.erreur, String(erreur?.message ?? erreur));
  }
});

elements.boutonRetour.addEventListener("click", () => {
  ficheCourante = undefined;
  montreLaVue("formulaire");
});
```

Le menu `fiche-type` se remplit dans `chargeLesChoix`, avec les mêmes options que `champ-type`.

Toute erreur renvoyée par le pont s'affiche dans le bandeau d'erreur, tel quel : ces messages viennent du noyau et sont déjà rédigés.

- [ ] **Step 4: Vérifier hors-ligne**

```bash
npm test
npm run typecheck
npm run app:build
```

Attendu : tous verts.

- [ ] **Step 5: Vérifier dans la fenêtre**

```bash
npm run app
```

À contrôler, dans l'ordre :

1. **Prévisualiser** une soirée passée : le tableau des matchs s'affiche, rien n'est écrit — la liste de gauche ne bouge pas.
2. **Annuler** : retour au formulaire, valeurs conservées, toujours rien d'écrit.
3. **Prévisualiser** puis **Enregistrer** : la session apparaît dans la liste, avec le bilan annoncé par l'aperçu.
4. **Cliquer** la session : sa fiche s'ouvre avec ses matchs.
5. Changer le nom et le type, **Enregistrer** : la liste se met à jour, et **aucun second fichier** n'apparaît dans `data/sessions/`.
6. **Supprimer** : la confirmation s'affiche ; après acceptation, la session disparaît de la liste et son fichier du dossier.
7. Vérifier enfin que `npm run fetch -- --help` fonctionne toujours.

- [ ] **Step 6: README**

Dans la section « L'application », remplacer la description du flux par :

> Une fenêtre s'ouvre : les sessions déjà récupérées à gauche, le formulaire de
> nouvelle récupération à droite. **Prévisualiser** interroge stat.ink et affiche
> les matchs trouvés sans rien écrire ; **Enregistrer** écrit exactement ce que
> l'aperçu montrait, sans second appel réseau.
>
> Cliquer une session ouvre sa fiche : ses matchs, et son nom et son type
> modifiables. On peut aussi l'y supprimer, après confirmation.

Ajouter au tableau « Structure », avant `src/store.ts` :

```markdown
| `src/battleRows.ts` | Vue allégée d'un match : ce que la fenêtre affiche |
```

Mettre à jour le nombre de tests annoncé dans la section Développement avec le total réel de `npm test`.

- [ ] **Step 7: Commit**

```bash
git add src/electron/renderer README.md
git commit -m "feat: apercu avant ecriture et fiche de session editable"
```
