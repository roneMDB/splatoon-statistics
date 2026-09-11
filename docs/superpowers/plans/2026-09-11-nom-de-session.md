# Nom de session à la récupération — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre de nommer chaque session récupérée (`--name`, ou saisie interactive), avec un type optionnel, et stocker ces deux champs dans le fichier de session.

**Architecture:** Un nouveau module `src/sessionMeta.ts` porte la liste fermée des types, leur validation et le dialogue interactif. Le dialogue reçoit une fonction `ask` injectée, ce qui le rend testable sans TTY ; `src/cli.ts` fournit l'implémentation `node:readline/promises`. `src/store.ts` gagne deux champs facultatifs.

**Tech Stack:** TypeScript, Node ≥ 22 (modules `node:` uniquement), vitest, tsx.

**Spec:** `docs/superpowers/specs/2026-09-11-nom-de-session-design.md`

## Global Constraints

- **Aucune dépendance de runtime.** Le projet n'a que des `devDependencies` ; le dialogue utilise `node:readline/promises`, pas une bibliothèque tierce.
- **Code et tests en français sans accents.** Les commentaires, messages d'erreur, textes de prompt et noms de tests du dépôt sont écrits « fenetre », « deterministe », « Entree ». Le README, lui, est accentué. Respecter cette séparation.
- **Imports avec extension `.ts`** : `import { x } from "./sessionMeta.ts"`, comme partout dans `src/`.
- **Tous les tests tournent hors-ligne et sans interaction.** Aucun test ne doit dépendre d'un TTY.
- **Commentaires JSDoc** sur chaque export, comme dans `src/store.ts` et `src/config.ts`.
- Vérification finale de chaque tâche : `npm test` et `npm run typecheck` passent.

---

### Task 1: Module `sessionMeta` — types, validation et dialogue

**Files:**
- Create: `src/sessionMeta.ts`
- Test: `tests/sessionMeta.test.ts`

**Interfaces:**
- Consumes: rien (module autonome).
- Produces, utilisés par les tâches 2 et 3 :
  - `SESSION_TYPES: readonly ["intra", "scrim", "compet", "autre"]`
  - `type SessionType = "intra" | "scrim" | "compet" | "autre"`
  - `type SessionMeta = { name?: string; type?: SessionType }`
  - `isSessionType(value: string): value is SessionType`
  - `type Ask = (question: string) => Promise<string>`
  - `promptSessionMeta(ask: Ask, current?: SessionMeta): Promise<SessionMeta>`

**Règles du dialogue** (tranchées ici, à implémenter telles quelles) :
1. La question du nom est toujours posée — la fonction n'est appelée que lorsque `--name` manque.
2. Nom vide après `trim` : le dialogue s'arrête, `current` est renvoyé tel quel. Sans nom, un type seul n'a pas d'usage, et cela évite une question de plus à qui voulait juste passer.
3. `current.type` déjà défini (venu de `--type`) : la question du type n'est pas posée.
4. Type saisi invalide : la question est reposée jusqu'à une valeur valide ou vide.
5. Les réponses sont `trim`ées ; le type est aussi passé en minuscules.

- [ ] **Step 1: Write the failing test**

Créer `tests/sessionMeta.test.ts` :

```ts
import { describe, expect, test } from "vitest";
import { isSessionType, promptSessionMeta, SESSION_TYPES } from "../src/sessionMeta.ts";

/** Repond aux questions dans l'ordre, et retient ce qui a ete demande. */
const scriptedAsk = (answers: string[]) => {
  const asked: string[] = [];
  const ask = async (question: string) => {
    asked.push(question);
    const answer = answers.shift();
    if (answer === undefined) {
      throw new Error(`Question inattendue : ${question}`);
    }
    return answer;
  };
  return { ask, asked };
};

describe("isSessionType", () => {
  test("accepte les quatre valeurs de la liste fermee", () => {
    expect(SESSION_TYPES).toEqual(["intra", "scrim", "compet", "autre"]);
    for (const value of SESSION_TYPES) {
      expect(isSessionType(value)).toBe(true);
    }
  });

  test("refuse une valeur hors liste", () => {
    expect(isSessionType("tournoi")).toBe(false);
    expect(isSessionType("")).toBe(false);
  });
});

describe("promptSessionMeta", () => {
  test("retient le nom puis le type saisis", async () => {
    const { ask } = scriptedAsk(["Scrim contre Les Corsaires", "scrim"]);
    expect(await promptSessionMeta(ask)).toEqual({
      name: "Scrim contre Les Corsaires",
      type: "scrim",
    });
  });

  test("nettoie les espaces autour des reponses", async () => {
    const { ask } = scriptedAsk(["  Intra Équipe A vs Équipe N  ", "  INTRA  "]);
    expect(await promptSessionMeta(ask)).toEqual({
      name: "Intra Équipe A vs Équipe N",
      type: "intra",
    });
  });

  test("un nom vide arrete le dialogue sans demander le type", async () => {
    const { ask, asked } = scriptedAsk(["   "]);
    expect(await promptSessionMeta(ask)).toEqual({});
    expect(asked).toHaveLength(1);
  });

  test("une reponse vide au type laisse la session sans type", async () => {
    const { ask } = scriptedAsk(["Match EBTV", ""]);
    expect(await promptSessionMeta(ask)).toEqual({ name: "Match EBTV" });
  });

  test("repose la question tant que le type est invalide", async () => {
    const { ask, asked } = scriptedAsk(["Match EBTV", "tournoi", "compet"]);
    expect(await promptSessionMeta(ask)).toEqual({
      name: "Match EBTV",
      type: "compet",
    });
    expect(asked).toHaveLength(3);
  });

  test("ne demande pas le type quand il est deja connu", async () => {
    const { ask, asked } = scriptedAsk(["Match EBTV"]);
    expect(await promptSessionMeta(ask, { type: "compet" })).toEqual({
      name: "Match EBTV",
      type: "compet",
    });
    expect(asked).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/sessionMeta.test.ts
```

Attendu : ÉCHEC, `Failed to resolve import "../src/sessionMeta.ts"`.

- [ ] **Step 3: Write minimal implementation**

Créer `src/sessionMeta.ts` :

```ts
/** Nom et nature d'une session : le seul moyen de distinguer une intra d'un
 * scrim, stat.ink les rangeant tous deux sous le lobby `private`. */

/** Valeurs acceptees par `--type`, liste fermee. */
export const SESSION_TYPES = ["intra", "scrim", "compet", "autre"] as const;

export type SessionType = (typeof SESSION_TYPES)[number];

/** Metadonnees saisies par l'utilisateur, toutes facultatives. */
export type SessionMeta = {
  name?: string;
  type?: SessionType;
};

/** Fonction de question injectee : rend le dialogue testable sans TTY. */
export type Ask = (question: string) => Promise<string>;

/** Verifie qu'une chaine est un type de session connu. */
export function isSessionType(value: string): value is SessionType {
  return (SESSION_TYPES as readonly string[]).includes(value);
}

const NAME_QUESTION = "Nom de la session : ";
const TYPE_QUESTION = `Type [${SESSION_TYPES.join("/")}, Entree pour aucun] : `;

/**
 * Demande le nom, puis le type s'il n'est pas deja connu. Un nom vide arrete
 * le dialogue : sans nom, un type seul n'a pas d'usage.
 */
export async function promptSessionMeta(
  ask: Ask,
  current: SessionMeta = {},
): Promise<SessionMeta> {
  const name = (await ask(NAME_QUESTION)).trim();
  if (name === "") {
    return { ...current };
  }

  if (current.type !== undefined) {
    return { ...current, name };
  }

  while (true) {
    const answer = (await ask(TYPE_QUESTION)).trim().toLowerCase();
    if (answer === "") {
      return { ...current, name };
    }
    if (isSessionType(answer)) {
      return { ...current, name, type: answer };
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/sessionMeta.test.ts
npm run typecheck
```

Attendu : 8 tests passent, `tsc --noEmit` silencieux.

- [ ] **Step 5: Commit**

```bash
git add src/sessionMeta.ts tests/sessionMeta.test.ts
git commit -m "feat: dialogue de nommage de session, testable sans TTY"
```

---

### Task 2: Champs `name` et `type` dans le fichier de session

**Files:**
- Modify: `src/store.ts` (types `SessionFile` et `BuildSessionFileOptions`, corps de `buildSessionFile`)
- Test: `tests/store.test.ts` (ajouter un bloc de tests)

**Interfaces:**
- Consumes, depuis la tâche 1 : `type SessionType` importé de `./sessionMeta.ts`.
- Produces, utilisés par la tâche 3 : `BuildSessionFileOptions` accepte désormais `name?: string` et `type?: SessionType` ; `SessionFile` expose `name?: string` et `type?: SessionType`, placés juste après `user`.

`buildSessionFileName` et `writeSession` ne changent pas : le nom de fichier reste `<user>_<debut>_<fin>.json`, indépendant du label.

- [ ] **Step 1: Write the failing test**

Ajouter à `tests/store.test.ts`, à la fin du fichier :

```ts
describe("buildSessionFile, nom et type de session", () => {
  const base = {
    user: "Gloup",
    window,
    battles: [] as StatinkBattle[],
    fetchedAt: new Date("2026-08-19T17:34:00Z"),
  };

  test("retient le nom et le type fournis", () => {
    const file = buildSessionFile({
      ...base,
      name: "Scrim contre Les Corsaires",
      type: "scrim",
    });
    expect(file.name).toBe("Scrim contre Les Corsaires");
    expect(file.type).toBe("scrim");
  });

  test("omet les deux champs quand ils ne sont pas fournis", () => {
    const file = buildSessionFile(base);
    expect(Object.keys(file)).not.toContain("name");
    expect(Object.keys(file)).not.toContain("type");
  });

  test("nettoie les espaces autour du nom", () => {
    expect(buildSessionFile({ ...base, name: "  Intra Équipe A  " }).name).toBe(
      "Intra Équipe A",
    );
  });

  test("traite un nom reduit a des espaces comme absent", () => {
    expect(Object.keys(buildSessionFile({ ...base, name: "   " }))).not.toContain(
      "name",
    );
  });

  test("place le nom juste apres le pseudo dans le JSON ecrit", async () => {
    const dir = await tempDir();
    const path = await writeSession(
      buildSessionFile({ ...base, name: "Match EBTV", type: "compet" }),
      dir,
    );
    const written = JSON.parse(await readFile(path, "utf8"));
    expect(Object.keys(written).slice(0, 4)).toEqual([
      "source",
      "user",
      "name",
      "type",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/store.test.ts
```

Attendu : ÉCHEC — `expected undefined to be 'Scrim contre Les Corsaires'`. Vitest efface les types sans les vérifier : c'est bien l'exécution qui échoue ici, et `npm run typecheck` signalerait en plus `Object literal may only specify known properties`.

- [ ] **Step 3: Write minimal implementation**

Dans `src/store.ts`, ajouter l'import en haut du fichier, à côté des autres :

```ts
import type { SessionType } from "./sessionMeta.ts";
```

Dans le type `SessionFile`, insérer juste après `user: string;` :

```ts
  /** Nom libre donne a la session. Absent si non fourni. */
  name?: string;
  /** Nature de la session. Absent si non fourni. */
  type?: SessionType;
```

Dans `BuildSessionFileOptions`, ajouter après `user: string;` :

```ts
  name?: string;
  type?: SessionType;
```

Dans `buildSessionFile`, remplacer le `return` par :

```ts
  const name = options.name?.trim();

  return {
    source: "stat.ink",
    user: options.user,
    // Spread conditionnel : une cle absente plutot qu'une cle a undefined,
    // pour que l'ordre du JSON reste lisible et le champ vraiment omis.
    ...(name ? { name } : {}),
    ...(options.type ? { type: options.type } : {}),
    fetchedAt: options.fetchedAt.toISOString(),
    window: {
      from: new Date(options.window.fromMs).toISOString(),
      to: new Date(options.window.toMs).toISOString(),
    },
    filters,
    battleCount: options.battles.length,
    battles: options.battles,
  };
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test
npm run typecheck
```

Attendu : tous les tests passent, y compris les 5 nouveaux ; `tsc --noEmit` silencieux.

- [ ] **Step 5: Commit**

```bash
git add src/store.ts tests/store.test.ts
git commit -m "feat: stocke le nom et le type dans le fichier de session"
```

---

### Task 3: Options CLI, câblage du dialogue et documentation

**Files:**
- Modify: `src/cli.ts` (options, `USAGE`, type `CliOptions`, ordre des étapes de `main`)
- Modify: `README.md` (tableau des options, exemple de sortie, exemple de JSON, tableau de structure)
- Test: `tests/cli.test.ts` (ajouter un bloc de tests)

**Interfaces:**
- Consumes, depuis la tâche 1 : `isSessionType`, `promptSessionMeta`, `SESSION_TYPES`, types `SessionMeta` et `SessionType`.
- Consumes, depuis la tâche 2 : `buildSessionFile` accepte `name` et `type`.
- Produces : `CliOptions` gagne `name?: string` et `type?: SessionType`.

**Règle de déclenchement du dialogue :** les questions ne sont posées que si `options.name === undefined` **et** `process.stdin.isTTY` est vrai. Fournir `--name` vaut « je donne les métadonnées en ligne de commande » : aucune question, même si `--type` manque. Sans cette règle, un fetch scripté à la main subirait un prompt parasite à chaque exécution.

**Ordre des étapes de `main` :** le dialogue doit tomber entre le bilan et l'écriture. L'ordre actuel écrit le fichier avant d'afficher le bilan ; il faut le réordonner en récupération → bilan → dialogue → assemblage → écriture.

- [ ] **Step 1: Write the failing test**

Ajouter à `tests/cli.test.ts`, à la fin du fichier :

```ts
describe("parseCliArgs, nom et type de session", () => {
  const from = ["--from", "2026-08-18 20:00"];

  test("retient le nom donne par --name", () => {
    const options = parseCliArgs([...from, "--name", "Scrim contre Les Corsaires"]);
    expect(options.name).toBe("Scrim contre Les Corsaires");
  });

  test("ne donne ni nom ni type par defaut", () => {
    const options = parseCliArgs(from);
    expect(options.name).toBeUndefined();
    expect(options.type).toBeUndefined();
  });

  test("accepte un type de la liste fermee", () => {
    expect(parseCliArgs([...from, "--type", "scrim"]).type).toBe("scrim");
  });

  test("refuse un type hors liste en listant les valeurs acceptees", () => {
    expect(() => parseCliArgs([...from, "--type", "tournoi"])).toThrow(/intra/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/cli.test.ts
```

Attendu : ÉCHEC — `Unknown option '--name'` levé par `parseArgs` en mode `strict`.

- [ ] **Step 3: Write minimal implementation**

Dans `src/cli.ts`, ajouter aux imports :

```ts
import { createInterface } from "node:readline/promises";
import {
  isSessionType,
  promptSessionMeta,
  SESSION_TYPES,
  type SessionMeta,
  type SessionType,
} from "./sessionMeta.ts";
```

Ajouter à `CliOptions`, après `user: string;` :

```ts
  name?: string;
  type?: SessionType;
```

Dans `USAGE`, insérer ces deux lignes après le bloc `--user` :

```
  --name <texte>      Nom de la session. Demande a l'ecran s'il est absent.
                      Exemple : "Scrim contre Les Corsaires".
  --type <valeur>     Nature de la session. Valeurs : ${SESSION_TYPES.join(", ")}
```

Dans `parseCliArgs`, ajouter aux `options` de `parseArgs` :

```ts
      name: { type: "string" },
      type: { type: "string" },
```

Juste après la validation de `--lobby`, ajouter :

```ts
  if (values.type !== undefined && !isSessionType(values.type)) {
    throw new Error(
      `Valeur de --type inconnue : "${values.type}". ` +
        `Valeurs acceptees : ${SESSION_TYPES.join(", ")}`,
    );
  }
```

Dans l'objet renvoyé par `parseCliArgs`, ajouter après `user` :

```ts
    name: values.name,
    type: values.type as SessionType | undefined,
```

Dans `main`, remplacer tout le bloc qui va de `const result = await fetchSession({` jusqu'au `console.log(\`\nEcrit dans ${path}\`);` final par :

```ts
  const result = await fetchSession({
    user: options.user,
    window: options.window,
    filters: options.filters,
    maxPages: options.maxPages,
  });

  console.log(
    `\n${result.battles.length} match(s) dans la fenetre ` +
      `(${result.pagesFetched} page(s) lue(s), arret : ${result.stopReason}).`,
  );

  if (result.battles.length === 0) {
    console.warn(
      "\nAucun match trouve. Verifier la fenetre de temps, le fuseau horaire, " +
        "le filtre de lobby, et que les matchs ont bien ete envoyes a stat.ink.",
    );
  } else {
    summarize(result.battles);
  }

  // Nommer apres le bilan : on choisit le nom en voyant ce que la fenetre a
  // ramene. Fournir --name vaut "je donne tout en ligne de commande" et
  // n'ouvre aucun dialogue, meme si --type manque.
  const meta = await resolveSessionMeta(options);
  if (meta.name === undefined) {
    console.warn(
      "\nSession enregistree sans nom. Relancer avec --name pour la nommer.",
    );
  }

  const file = buildSessionFile({
    user: options.user,
    name: meta.name,
    type: meta.type,
    window: options.window,
    filters: options.filters,
    battles: result.battles,
    fetchedAt: new Date(),
  });
  const path = await writeSession(file, options.outDir);

  if (meta.name !== undefined) {
    const type = meta.type === undefined ? "" : ` (${meta.type})`;
    console.log(`\nSession : ${meta.name}${type}`);
  }
  console.log(`Ecrit dans ${path}`);
```

Ajouter cette fonction juste avant `summarize` :

```ts
/**
 * Complete les metadonnees manquantes en interrogeant l'utilisateur. Hors
 * terminal interactif, la session est simplement enregistree sans nom : un
 * defaut de label ne doit pas faire echouer une recuperation scriptee.
 */
async function resolveSessionMeta(options: CliOptions): Promise<SessionMeta> {
  if (options.name !== undefined || process.stdin.isTTY !== true) {
    return { name: options.name, type: options.type };
  }

  console.log("");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await promptSessionMeta((question) => rl.question(question), {
      type: options.type,
    });
  } finally {
    rl.close();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test
npm run typecheck
```

Attendu : tous les tests passent, dont les 4 nouveaux ; `tsc --noEmit` silencieux.

- [ ] **Step 5: Vérifier le dialogue en vrai**

Sur une fenêtre passée, en terminal interactif :

```bash
npm run fetch -- --from "2026-08-04 21:00" --to "2026-08-04 23:59" --lobby private --out /tmp/splat-check
```

Attendu : le bilan des matchs s'affiche, puis `Nom de la session : `, puis
`Type [intra/scrim/compet/autre, Entree pour aucun] : `, puis
`Session : <nom> (<type>)` et `Ecrit dans /tmp/splat-check/...`.

Vérifier ensuite le contenu et le comportement non interactif :

```bash
head -c 200 /tmp/splat-check/*.json
npm run fetch -- --from "2026-08-04 21:00" --to "2026-08-04 23:59" --out /tmp/splat-check < /dev/null
```

Attendu : `name` et `type` présents dans le JSON ; la seconde commande n'ouvre aucun dialogue et affiche l'avertissement « Session enregistree sans nom ».

- [ ] **Step 6: Mettre à jour le README**

Dans le tableau des options, ajouter deux lignes après `--user` :

```markdown
| `--name <texte>` | *demandé à l'écran* | Nom de la session, ex. `Scrim contre Les Corsaires` |
| `--type <valeur>` | aucun | `intra`, `scrim`, `compet` ou `autre` |
```

Dans le bloc d'exemple d'utilisation, ajouter `--name` à la commande :

```bash
npm run fetch -- --from "2026-08-04 21:00" --to "2026-08-04 23:59" --lobby private --name "Scrim contre Les Corsaires"
```

Dans l'exemple de sortie console, ajouter avant la ligne `Ecrit dans` :

```
Session : Scrim contre Les Corsaires (scrim)
```

Dans l'exemple de fichier de session, ajouter après `"user": "Gloup",` :

```json
  "name": "Scrim contre Les Corsaires",
  "type": "scrim",
```

Ajouter sous cet exemple :

> `name` et `type` sont absents du fichier quand ils n'ont pas été fournis. Le
> nom de fichier, lui, ne dépend que du compte et de la fenêtre : relancer la
> même fenêtre avec un nom corrigé réécrit le même fichier.

Ajouter une ligne au tableau « Structure », avant `src/store.ts` :

```markdown
| `src/sessionMeta.ts` | Nom et type de session : liste fermée, validation, dialogue |
```

Enfin, corriger le nombre de tests annoncé dans la section Développement (`81 tests unitaires`) avec le total réel affiché par `npm test`.

- [ ] **Step 7: Commit**

```bash
git add src/cli.ts tests/cli.test.ts README.md
git commit -m "feat: options --name et --type, avec saisie interactive"
```
