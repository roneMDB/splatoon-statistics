# Bouton de l'émulateur — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dans l'encart d'alerte de STU, un bouton ouvre l'émulateur Android avec sa fenêtre puis l'éteint proprement ; fermer l'application éteint l'émulateur qu'elle a ouvert.

**Architecture:** Un module pur `src/emulateur.ts` (scripts bash, lecture de l'état, choix du bouton) ; un gestionnaire `src/electron/emulateurHandler.ts` qui lance ces scripts par un lanceur injecté, sur le modèle de `veilleHandler.ts` ; le processus principal calcule le bouton et l'envoie à la fenêtre, qui l'affiche sans rien en déduire.

**Tech Stack:** TypeScript (Node 22, Electron 44), vitest, rendu en JS + JSDoc.

**Spec :** `docs/superpowers/specs/2026-11-16-bouton-emulateur-design.md`

## Global Constraints

- Tout texte visible, commentaire et message de commit en français ; accents dans les textes visibles, commentaires du code sans accents (convention du dépôt).
- Scripts lancés par `commandeSysteme` de `src/veille.ts` (`bash -lc` sous Linux, `wsl.exe [-d distro] -e bash -lc` sous Windows).
- Chaque script commence par `source "$HOME/Android/env.sh"` (sauf la lecture, qui teste d'abord sa présence).
- Verrou du cron : `/tmp/s3s-upload.lock` (pris par `flock` dans `~/repositories/s3s/upload.sh`).
- Journal de l'émulateur : `/tmp/splatoon-statistics-emulateur.log`.
- Suivi : relecture toutes les 2 s, 2 min au plus. Extinction à la fermeture : 30 s au plus.
- Jamais fermer la fenêtre de l'émulateur pour l'éteindre : toujours `adb shell sync` puis `adb shell reboot -p`.
- Électron ne démarre pas dans le bac à sable des outils : `dangerouslyDisableSandbox` pour `npm run app`.

## Fichiers

- Créer `src/emulateur.ts` — scripts, types, `lisLaLecture`, `boutonDEmulateur`.
- Créer `src/electron/emulateurHandler.ts` — `creeLEmulateur`.
- Créer `tests/emulateur.test.ts`, `tests/electron/emulateurHandler.test.ts`.
- Modifier `src/electron/ipcChannels.ts`, `src/electron/preload.cts`, `src/electron/main.ts`, `tests/electron/preload.test.ts`.
- Modifier `src/electron/renderer/index.html`, `elements.js`, `veille.js`, `renderer.css`.
- Modifier `README.md` (section « La veille tourne en boucle sur les jetons »).

---

### Task 1 : le module pur `src/emulateur.ts`

**Files:**
- Create: `src/emulateur.ts`
- Test: `tests/emulateur.test.ts`

**Interfaces:**
- Consumes: `StatutDeVeille` de `src/veille.ts` (`"arretee" | "en-cours" | "arret-demande"`).
- Produces :
  - `FICHIER_JOURNAL_EMULATEUR: string`
  - `SCRIPT_D_ETAT`, `SCRIPT_D_OUVERTURE`, `SCRIPT_D_EXTINCTION: string`
  - `type LectureDEmulateur = "absent" | "verrou" | "allume" | "eteint"`
  - `type OperationDEmulateur = "ouverture" | "extinction"`
  - `type EtatDEmulateur = { lecture?: LectureDEmulateur; operation?: OperationDEmulateur; ouvertParNous: boolean; erreur?: string }`
  - `type BoutonDEmulateur = { visible: false } | { visible: true; libelle: string; actif: boolean; action?: "ouvre" | "eteint"; note?: string }`
  - `lisLaLecture(sortie: string): LectureDEmulateur | undefined`
  - `boutonDEmulateur(etat: EtatDEmulateur, statutDeVeille: StatutDeVeille): BoutonDEmulateur`

- [ ] **Step 1 : écrire les tests**

```ts
// tests/emulateur.test.ts
import { describe, expect, test } from "vitest";
import {
  boutonDEmulateur,
  FICHIER_JOURNAL_EMULATEUR,
  lisLaLecture,
  SCRIPT_D_ETAT,
  SCRIPT_D_EXTINCTION,
  SCRIPT_D_OUVERTURE,
  type EtatDEmulateur,
} from "../src/emulateur.ts";

const etat = (complement: Partial<EtatDEmulateur>): EtatDEmulateur => ({ ouvertParNous: false, ...complement });

describe("lisLaLecture", () => {
  test("garde la derniere ligne non vide : un shell de connexion peut ecrire avant", () => {
    expect(lisLaLecture("bienvenue\nallume\n\n")).toBe("allume");
  });
  test("rend undefined pour toute autre sortie", () => {
    expect(lisLaLecture("")).toBeUndefined();
    expect(lisLaLecture("emulator-5554 device")).toBeUndefined();
  });
});

describe("scripts", () => {
  test("la lecture teste env.sh, puis le verrou du cron, puis adb", () => {
    const env = SCRIPT_D_ETAT.indexOf("env.sh");
    const verrou = SCRIPT_D_ETAT.indexOf("flock -n /tmp/s3s-upload.lock");
    const adb = SCRIPT_D_ETAT.indexOf("adb devices");
    expect(env).toBeGreaterThanOrEqual(0);
    expect(verrou).toBeGreaterThan(env);
    expect(adb).toBeGreaterThan(verrou);
  });
  test("l'ouverture garde le processus en vie et sort l'emulateur du groupe", () => {
    expect(SCRIPT_D_OUVERTURE).toContain("exec setsid -w");
    expect(SCRIPT_D_OUVERTURE).toContain("boot-window.sh");
    expect(SCRIPT_D_OUVERTURE).toContain(FICHIER_JOURNAL_EMULATEUR);
  });
  test("l'extinction synchronise avant d'eteindre Android", () => {
    expect(SCRIPT_D_EXTINCTION.indexOf("adb shell sync")).toBeGreaterThanOrEqual(0);
    expect(SCRIPT_D_EXTINCTION.indexOf("adb shell reboot -p")).toBeGreaterThan(
      SCRIPT_D_EXTINCTION.indexOf("adb shell sync"),
    );
  });
});

describe("boutonDEmulateur", () => {
  test("cache tant que rien n'est lu, ou sans SDK Android", () => {
    expect(boutonDEmulateur(etat({}), "arretee")).toEqual({ visible: false });
    expect(boutonDEmulateur(etat({ lecture: "absent" }), "arretee")).toEqual({ visible: false });
  });
  test("emulateur eteint, veille arretee : ouvrir", () => {
    expect(boutonDEmulateur(etat({ lecture: "eteint" }), "arretee")).toEqual({
      visible: true,
      libelle: "Ouvrir l'émulateur",
      actif: true,
      action: "ouvre",
    });
  });
  test("emulateur allume, veille arretee : eteindre", () => {
    expect(boutonDEmulateur(etat({ lecture: "allume" }), "arretee")).toEqual({
      visible: true,
      libelle: "Éteindre l'émulateur",
      actif: true,
      action: "eteint",
    });
  });
  test("veille en cours ou en arret : grise, avec la raison", () => {
    for (const statut of ["en-cours", "arret-demande"] as const) {
      expect(boutonDEmulateur(etat({ lecture: "eteint" }), statut)).toEqual({
        visible: true,
        libelle: "Ouvrir l'émulateur",
        actif: false,
        note: "Arrêter la veille d'abord.",
      });
    }
  });
  test("verrou du cron tenu : grise, avec la raison", () => {
    expect(boutonDEmulateur(etat({ lecture: "verrou" }), "arretee")).toEqual({
      visible: true,
      libelle: "Ouvrir l'émulateur",
      actif: false,
      note: "Une synchro du cron est en cours.",
    });
  });
  test("operation en cours : grise, quel que soit le reste", () => {
    expect(boutonDEmulateur(etat({ lecture: "eteint", operation: "ouverture" }), "arretee")).toEqual({
      visible: true,
      libelle: "Démarrage…",
      actif: false,
    });
    expect(boutonDEmulateur(etat({ lecture: "allume", operation: "extinction" }), "en-cours")).toEqual({
      visible: true,
      libelle: "Extinction…",
      actif: false,
    });
  });
  test("une erreur passe en note quand rien ne bloque", () => {
    expect(boutonDEmulateur(etat({ lecture: "eteint", erreur: "Échec." }), "arretee")).toEqual({
      visible: true,
      libelle: "Ouvrir l'émulateur",
      actif: true,
      action: "ouvre",
      note: "Échec.",
    });
  });
});
```

- [ ] **Step 2 : vérifier l'échec**

Run: `npx vitest run tests/emulateur.test.ts`
Expected: FAIL, module `../src/emulateur.ts` introuvable.

- [ ] **Step 3 : écrire le module**

```ts
// src/emulateur.ts
/**
 * L'emulateur Android de STU, ouvert avec sa fenetre et eteint depuis
 * l'application quand la session Nintendo est perdue (Nintendo Switch App sur
 * « Sign In »).
 *
 * Module pur : les scripts bash et les decisions, sans rien lancer. Le
 * gestionnaire qui les lance est `src/electron/emulateurHandler.ts`.
 */

import type { StatutDeVeille } from "./veille.ts";

/** Sortie de l'emulateur ouvert par l'application. */
export const FICHIER_JOURNAL_EMULATEUR = "/tmp/splatoon-statistics-emulateur.log";

/** Verrou pris par `~/repositories/s3s/upload.sh` (cron horaire) le temps d'une synchro. */
const VERROU_S3S = "/tmp/s3s-upload.lock";

/** Ce que rend `SCRIPT_D_ETAT`. */
export type LectureDEmulateur = "absent" | "verrou" | "allume" | "eteint";
const LECTURES: ReadonlySet<string> = new Set<LectureDEmulateur>(["absent", "verrou", "allume", "eteint"]);

export type OperationDEmulateur = "ouverture" | "extinction";

export type EtatDEmulateur = {
  /** Derniere lecture ; absente tant que rien n'a ete lu. */
  lecture?: LectureDEmulateur;
  /** Ouverture ou extinction suivie jusqu'a son terme. */
  operation?: OperationDEmulateur;
  /** L'application a lance l'emulateur, et ce processus tourne encore. */
  ouvertParNous: boolean;
  /** Echec de la derniere operation, jusqu'a la suivante. */
  erreur?: string;
};

export type BoutonDEmulateur =
  | { visible: false }
  | { visible: true; libelle: string; actif: boolean; action?: "ouvre" | "eteint"; note?: string };

/**
 * Une ligne : `absent` sans SDK Android, `verrou` si une synchro du cron
 * tourne (son emulateur est alors celui de STU), sinon `allume` ou `eteint`.
 * `adb devices` liste l'emulateur des son lancement (`offline`), avant la fin
 * du demarrage d'Android.
 */
export const SCRIPT_D_ETAT = [
  `[ -r "$HOME/Android/env.sh" ] || { echo absent; exit 0; }`,
  `source "$HOME/Android/env.sh"`,
  `flock -n ${VERROU_S3S} true 2>/dev/null || { echo verrou; exit 0; }`,
  `if adb devices 2>/dev/null | grep -q '^emulator-'; then echo allume; else echo eteint; fi`,
].join("\n");

/**
 * `exec` : le processus lance par l'application devient `setsid -w`, qui
 * attend l'emulateur. Il garde la distribution WSL en vie, et sa fin dit que
 * l'emulateur s'est arrete. `setsid` sort l'emulateur du groupe de
 * l'application : une fermeture brutale ne lui envoie aucun signal.
 */
export const SCRIPT_D_OUVERTURE = `exec setsid -w "$HOME/Android/boot-window.sh" > ${FICHIER_JOURNAL_EMULATEUR} 2>&1 < /dev/null`;

/**
 * Eteint Android, et non la fenetre : fermer la fenetre enregistre un
 * instantane rapide, et STU, qui demarre a froid, retrouverait la Switch App
 * deconnectee. Le code de `reboot -p` est ignore : la connexion adb tombe
 * avec Android.
 */
export const SCRIPT_D_EXTINCTION = [
  `source "$HOME/Android/env.sh"`,
  "adb shell sync || exit 1",
  "adb shell reboot -p",
  "exit 0",
].join("\n");

/** La derniere ligne non vide, si c'est une lecture connue. */
export function lisLaLecture(sortie: string): LectureDEmulateur | undefined {
  const lignes = sortie.split("\n").map((ligne) => ligne.trim()).filter((ligne) => ligne !== "");
  const derniere = lignes.at(-1);
  return derniere !== undefined && LECTURES.has(derniere) ? (derniere as LectureDEmulateur) : undefined;
}

/** Le bouton de l'encart, tel que la fenetre l'affiche. */
export function boutonDEmulateur(etat: EtatDEmulateur, statutDeVeille: StatutDeVeille): BoutonDEmulateur {
  const { lecture, operation, erreur } = etat;
  if (lecture === undefined || lecture === "absent") return { visible: false };
  if (operation === "ouverture") return { visible: true, libelle: "Démarrage…", actif: false };
  if (operation === "extinction") return { visible: true, libelle: "Extinction…", actif: false };

  const action = lecture === "allume" ? "eteint" : "ouvre";
  const libelle = action === "eteint" ? "Éteindre l'émulateur" : "Ouvrir l'émulateur";
  if (statutDeVeille !== "arretee") {
    return { visible: true, libelle, actif: false, note: "Arrêter la veille d'abord." };
  }
  if (lecture === "verrou") {
    return { visible: true, libelle, actif: false, note: "Une synchro du cron est en cours." };
  }
  return { visible: true, libelle, actif: true, action, ...(erreur === undefined ? {} : { note: erreur }) };
}
```

- [ ] **Step 4 : vérifier le succès**

Run: `npx vitest run tests/emulateur.test.ts && npm run typecheck`
Expected: PASS, typecheck sans erreur.

- [ ] **Step 5 : commit**

```bash
git add src/emulateur.ts tests/emulateur.test.ts
git commit -m "feat(emulateur): scripts et bouton de l'emulateur, sans rien lancer"
```

---

### Task 2 : le gestionnaire `src/electron/emulateurHandler.ts`

**Files:**
- Create: `src/electron/emulateurHandler.ts`
- Test: `tests/electron/emulateurHandler.test.ts`

**Interfaces:**
- Consumes : tout ce que produit la Task 1 ; `commandeSysteme`, `ReglageDeVeille`, `StatutDeVeille` de `src/veille.ts` ; `Lanceur`, `ProcessusDeVeille` de `src/electron/veilleHandler.ts`.
- Produces :
  - `type EtatAffiche = EtatDEmulateur & { bouton: BoutonDEmulateur }`
  - `type Emulateur = { etat(): EtatAffiche; rafraichis(): Promise<EtatAffiche>; ouvre(): Promise<EtatAffiche>; eteint(): Promise<EtatAffiche>; eteintSiOuvertParNous(): Promise<void> }`
  - `creeLEmulateur(dependances: { lance: Lanceur; plateforme: NodeJS.Platform; reglage: Pick<ReglageDeVeille, "distribution">; statutDeVeille: () => StatutDeVeille; onChange: (etat: EtatAffiche) => void; attends?: (ms: number) => Promise<void> }): Emulateur`
  - constantes `INTERVALLE_DE_SUIVI_MS = 2000`, `DUREE_DE_SUIVI_MS = 120_000`, `DELAI_A_LA_FERMETURE_MS = 30_000`

- [ ] **Step 1 : écrire les tests**

```ts
// tests/electron/emulateurHandler.test.ts
import { describe, expect, test } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { creeLEmulateur } from "../../src/electron/emulateurHandler.ts";
import type { Lanceur } from "../../src/electron/veilleHandler.ts";
import { SCRIPT_D_ETAT, SCRIPT_D_EXTINCTION, SCRIPT_D_OUVERTURE } from "../../src/emulateur.ts";
import type { StatutDeVeille } from "../../src/veille.ts";

/** Un faux processus : on ecrit sa sortie et on decide de sa fin. */
class FauxProcessus extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  finit(code: number | null) {
    this.stdout.end();
    this.stderr.end();
    setImmediate(() => this.emit("close", code));
  }
}

/**
 * Repond a chaque script : la lecture rend la lecture suivante de la file (la
 * derniere se repete ; `null` = echec du script), l'extinction rend
 * `extinction`, l'ouverture reste en vie jusqu'a ce que le test la finisse.
 */
function fauxLanceur(lectures: (string | null)[], extinction = 0) {
  const lances: { script: string; processus: FauxProcessus }[] = [];
  const lance: Lanceur = (_fichier, args) => {
    const script = args.at(-1)!;
    const processus = new FauxProcessus();
    lances.push({ script, processus });
    if (script === SCRIPT_D_ETAT) {
      const lecture = lectures.length > 1 ? lectures.shift()! : lectures[0]!;
      setImmediate(() => {
        if (lecture === null) return processus.finit(1);
        processus.stdout.write(`${lecture}\n`);
        processus.finit(0);
      });
    } else if (script === SCRIPT_D_EXTINCTION) {
      setImmediate(() => processus.finit(extinction));
    }
    return processus;
  };
  return { lance, lances, scripts: () => lances.map((l) => l.script) };
}

function emulateurDeTest(lectures: (string | null)[], statut: StatutDeVeille = "arretee", extinction = 0) {
  const faux = fauxLanceur(lectures, extinction);
  let statutDeVeille = statut;
  const emulateur = creeLEmulateur({
    lance: faux.lance,
    plateforme: "linux",
    reglage: { distribution: "" },
    statutDeVeille: () => statutDeVeille,
    onChange: () => {},
    attends: () => Promise.resolve(),
  });
  return { emulateur, faux, changeLaVeille: (s: StatutDeVeille) => (statutDeVeille = s) };
}

describe("rafraichis", () => {
  test("emulateur eteint : bouton pour l'ouvrir", async () => {
    const { emulateur } = emulateurDeTest(["eteint"]);
    const etat = await emulateur.rafraichis();
    expect(etat.lecture).toBe("eteint");
    expect(etat.bouton).toMatchObject({ visible: true, action: "ouvre", actif: true });
  });
  test("lecture impossible : bouton cache plutot que faux", async () => {
    const { emulateur } = emulateurDeTest([null]);
    const etat = await emulateur.rafraichis();
    expect(etat.lecture).toBe("absent");
    expect(etat.bouton).toEqual({ visible: false });
  });
});

describe("ouvre", () => {
  test("lance boot-window puis suit jusqu'a l'emulateur allume", async () => {
    const { emulateur, faux } = emulateurDeTest(["eteint", "eteint", "eteint", "allume"]);
    const etat = await emulateur.ouvre();
    expect(faux.scripts()).toContain(SCRIPT_D_OUVERTURE);
    expect(etat).toMatchObject({ lecture: "allume", ouvertParNous: true });
    expect(etat.operation).toBeUndefined();
    expect(etat.bouton).toMatchObject({ action: "eteint", actif: true });
  });
  test("refuse tant que la veille tourne", async () => {
    const { emulateur, faux } = emulateurDeTest(["eteint"], "en-cours");
    await emulateur.ouvre();
    expect(faux.scripts()).not.toContain(SCRIPT_D_OUVERTURE);
  });
  test("refuse quand le cron tient le verrou", async () => {
    const { emulateur, faux } = emulateurDeTest(["verrou"]);
    await emulateur.ouvre();
    expect(faux.scripts()).not.toContain(SCRIPT_D_OUVERTURE);
  });
  test("emulateur mort au demarrage : erreur, plus d'operation", async () => {
    const { emulateur, faux } = emulateurDeTest(["eteint"]);
    const enCours = emulateur.ouvre();
    // Le script d'ouverture part apres la premiere lecture : on l'attend.
    const ouverture = () => faux.lances.find((l) => l.script === SCRIPT_D_OUVERTURE);
    for (let tour = 0; tour < 20 && ouverture() === undefined; tour++) {
      await new Promise((r) => setImmediate(r));
    }
    ouverture()!.processus.finit(1);
    const etat = await enCours;
    expect(etat.operation).toBeUndefined();
    expect(etat.ouvertParNous).toBe(false);
    expect(etat.erreur).toContain("/tmp/splatoon-statistics-emulateur.log");
  });
  test("pas allume en 2 minutes : erreur qui cite le journal", async () => {
    const { emulateur } = emulateurDeTest(["eteint"]);
    const etat = await emulateur.ouvre();
    expect(etat.operation).toBeUndefined();
    expect(etat.erreur).toContain("/tmp/splatoon-statistics-emulateur.log");
  });
});

describe("eteint", () => {
  test("synchronise, eteint, et suit jusqu'a l'emulateur eteint", async () => {
    const { emulateur, faux } = emulateurDeTest(["allume", "allume", "eteint"]);
    const etat = await emulateur.eteint();
    expect(faux.scripts()).toContain(SCRIPT_D_EXTINCTION);
    expect(etat.lecture).toBe("eteint");
    expect(etat.operation).toBeUndefined();
    expect(etat.erreur).toBeUndefined();
  });
  test("sync refuse : erreur, sans suivi", async () => {
    const { emulateur } = emulateurDeTest(["allume"], "arretee", 1);
    const etat = await emulateur.eteint();
    expect(etat.operation).toBeUndefined();
    expect(etat.erreur).toBe("L'extinction n'a pas pu être transmise à l'émulateur.");
  });
});

describe("eteintSiOuvertParNous", () => {
  test("ne touche pas a un emulateur que l'application n'a pas ouvert", async () => {
    const { emulateur, faux } = emulateurDeTest(["allume"]);
    await emulateur.rafraichis();
    await emulateur.eteintSiOuvertParNous();
    expect(faux.scripts()).not.toContain(SCRIPT_D_EXTINCTION);
  });
  test("eteint celui qu'elle a ouvert, meme pendant l'arret de la veille", async () => {
    const { emulateur, faux, changeLaVeille } = emulateurDeTest(["eteint", "allume", "allume", "eteint"]);
    await emulateur.ouvre();
    changeLaVeille("arret-demande");
    await emulateur.eteintSiOuvertParNous();
    expect(faux.scripts()).toContain(SCRIPT_D_EXTINCTION);
  });
});
```

- [ ] **Step 2 : vérifier l'échec**

Run: `npx vitest run tests/electron/emulateurHandler.test.ts`
Expected: FAIL, module `emulateurHandler.ts` introuvable.

- [ ] **Step 3 : écrire le gestionnaire**

```ts
// src/electron/emulateurHandler.ts
/**
 * Ouvre l'emulateur avec sa fenetre et l'eteint proprement, a la demande de
 * la fenetre ou a la fermeture de l'application.
 *
 * N'importe pas `electron` : le lanceur et l'attente sont passes en argument,
 * ce qui permet de tester sans rien lancer. Les scripts et le choix du bouton
 * sont dans `src/emulateur.ts`.
 */

import type { SpawnOptions } from "node:child_process";
import {
  boutonDEmulateur,
  FICHIER_JOURNAL_EMULATEUR,
  lisLaLecture,
  SCRIPT_D_ETAT,
  SCRIPT_D_EXTINCTION,
  SCRIPT_D_OUVERTURE,
  type BoutonDEmulateur,
  type EtatDEmulateur,
  type LectureDEmulateur,
} from "../emulateur.ts";
import { commandeSysteme, type ReglageDeVeille, type StatutDeVeille } from "../veille.ts";
import type { Lanceur, ProcessusDeVeille } from "./veilleHandler.ts";

/** L'etat tel que la fenetre le recoit : le bouton est deja choisi. */
export type EtatAffiche = EtatDEmulateur & { bouton: BoutonDEmulateur };

export type Emulateur = {
  etat: () => EtatAffiche;
  /** Relit l'etat (SDK, verrou du cron, emulateur) et le diffuse. */
  rafraichis: () => Promise<EtatAffiche>;
  /** Sans effet si le bouton ne propose pas d'ouvrir ; rend la main une fois l'emulateur allume. */
  ouvre: () => Promise<EtatAffiche>;
  /** Sans effet si le bouton ne propose pas d'eteindre ; rend la main une fois l'emulateur eteint. */
  eteint: () => Promise<EtatAffiche>;
  /** A la fermeture : eteint l'emulateur ouvert par l'application, 30 s au plus. */
  eteintSiOuvertParNous: () => Promise<void>;
};

export const INTERVALLE_DE_SUIVI_MS = 2000;
export const DUREE_DE_SUIVI_MS = 120_000;
export const DELAI_A_LA_FERMETURE_MS = 30_000;

/** Scripts courts : seule la sortie standard compte. */
const OPTIONS_COURTES: SpawnOptions = { stdio: ["ignore", "pipe", "ignore"], windowsHide: true };
/** L'emulateur ecrit dans son journal, pas dans un tube que personne ne viderait. */
const OPTIONS_D_OUVERTURE: SpawnOptions = { stdio: "ignore", windowsHide: true };

export function creeLEmulateur(dependances: {
  lance: Lanceur;
  plateforme: NodeJS.Platform;
  reglage: Pick<ReglageDeVeille, "distribution">;
  statutDeVeille: () => StatutDeVeille;
  onChange: (etat: EtatAffiche) => void;
  attends?: (ms: number) => Promise<void>;
}): Emulateur {
  const { lance, plateforme, reglage, statutDeVeille, onChange } = dependances;
  const attends = dependances.attends ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  let etat: EtatDEmulateur = { ouvertParNous: false };
  /** Le processus de l'emulateur ouvert par l'application, tant qu'il tourne. */
  let enfant: ProcessusDeVeille | undefined;

  const affiche = (): EtatAffiche => ({ ...etat, bouton: boutonDEmulateur(etat, statutDeVeille()) });
  const change = (suivant: EtatDEmulateur) => {
    etat = suivant;
    onChange(affiche());
  };
  /** Fin d'operation : plus d'operation, et l'erreur s'il y en a une. */
  const termine = (complement: Partial<EtatDEmulateur> = {}) => {
    const { operation: _operation, erreur: _erreur, ...reste } = etat;
    change({ ...reste, ...complement });
  };

  function execute(script: string): Promise<{ code: number | null; sortie: string }> {
    const commande = commandeSysteme(plateforme, script, reglage);
    if (commande === undefined) return Promise.resolve({ code: null, sortie: "" });
    return new Promise((resolve) => {
      const processus = lance(commande.fichier, commande.args, OPTIONS_COURTES);
      let sortie = "";
      processus.stdout?.setEncoding("utf8");
      processus.stdout?.on("data", (morceau: string) => {
        sortie += morceau;
      });
      processus.on("error", () => resolve({ code: null, sortie }));
      processus.on("close", (code) => resolve({ code, sortie }));
    });
  }

  /** Une lecture illisible (`wsl.exe` absent, par exemple) vaut `absent` : le bouton se cache. */
  async function lis(): Promise<LectureDEmulateur> {
    const { code, sortie } = await execute(SCRIPT_D_ETAT);
    return (code === 0 ? lisLaLecture(sortie) : undefined) ?? "absent";
  }

  async function rafraichis(): Promise<EtatAffiche> {
    const lecture = await lis();
    change({ ...etat, lecture });
    return affiche();
  }

  /**
   * Relit l'etat toutes les 2 s jusqu'a `attendue`, 2 min au plus, tant que
   * `continuer` le permet. Rend vrai si `attendue` a ete lue.
   */
  async function suis(attendue: LectureDEmulateur, continuer: () => boolean): Promise<boolean> {
    for (let ecoule = 0; ecoule < DUREE_DE_SUIVI_MS && continuer(); ecoule += INTERVALLE_DE_SUIVI_MS) {
      await attends(INTERVALLE_DE_SUIVI_MS);
      if (!continuer()) return false;
      const lecture = await lis();
      change({ ...etat, lecture });
      if (lecture === attendue) return true;
    }
    return false;
  }

  async function ouvre(): Promise<EtatAffiche> {
    const bouton = (await rafraichis()).bouton;
    if (!bouton.visible || !bouton.actif || bouton.action !== "ouvre") return affiche();
    const commande = commandeSysteme(plateforme, SCRIPT_D_OUVERTURE, reglage);
    if (commande === undefined) return affiche();

    const { erreur: _erreur, ...reste } = etat;
    change({ ...reste, operation: "ouverture", ouvertParNous: true });
    const processus = lance(commande.fichier, commande.args, OPTIONS_D_OUVERTURE);
    enfant = processus;
    let message = `L'émulateur n'a pas démarré : voir ${FICHIER_JOURNAL_EMULATEUR}.`;
    processus.on("error", (erreur) => {
      if (enfant !== processus) return;
      enfant = undefined;
      message = `Lancement impossible : ${erreur.message}`;
      change({ ...etat, ouvertParNous: false });
    });
    processus.on("close", () => {
      if (enfant !== processus) return;
      enfant = undefined;
      change({ ...etat, ouvertParNous: false });
    });

    const allume = await suis("allume", () => enfant === processus);
    termine(allume ? {} : { erreur: message });
    return affiche();
  }

  /** Sans garde : la fermeture eteint meme pendant l'arret de la veille. */
  async function eteindre(): Promise<EtatAffiche> {
    const { erreur: _erreur, ...reste } = etat;
    change({ ...reste, operation: "extinction" });
    const { code } = await execute(SCRIPT_D_EXTINCTION);
    if (code !== 0) {
      termine({ erreur: "L'extinction n'a pas pu être transmise à l'émulateur." });
      return affiche();
    }
    const eteint = await suis("eteint", () => true);
    termine(eteint ? {} : { erreur: "L'émulateur ne s'est pas éteint en 2 minutes." });
    return affiche();
  }

  async function eteint(): Promise<EtatAffiche> {
    const bouton = (await rafraichis()).bouton;
    if (!bouton.visible || !bouton.actif || bouton.action !== "eteint") return affiche();
    return eteindre();
  }

  async function eteintSiOuvertParNous(): Promise<void> {
    if (enfant === undefined) return;
    await Promise.race([eteindre(), attends(DELAI_A_LA_FERMETURE_MS)]);
  }

  return { etat: affiche, rafraichis, ouvre, eteint, eteintSiOuvertParNous };
}
```

Note : dans le test « eteint celui qu'elle a ouvert », `attends` rend la main tout de suite, si bien que `Promise.race` peut finir avant `eteindre()`. Le test vérifie seulement que le script d'extinction a été lancé : `execute(SCRIPT_D_EXTINCTION)` est appelé de façon synchrone au début de `eteindre()`, donc avant la fin de la course.

- [ ] **Step 4 : vérifier le succès**

Run: `npx vitest run tests/electron/emulateurHandler.test.ts && npm run typecheck`
Expected: PASS, typecheck sans erreur.

- [ ] **Step 5 : commit**

```bash
git add src/electron/emulateurHandler.ts tests/electron/emulateurHandler.test.ts
git commit -m "feat(emulateur): ouvrir l'emulateur, le suivre, l'eteindre proprement"
```

---

### Task 3 : câblage IPC, preload et `main.ts`

**Files:**
- Modify: `src/electron/ipcChannels.ts` (bloc `IPC`, près de `veilleCapture` l. 75-76 ; type de l'API près de l. 244-251)
- Modify: `src/electron/preload.cts` (bloc `CANAUX` l. 45-49 ; fonctions l. 104-119)
- Modify: `src/electron/main.ts` (après `creeLaVeille`, l. 538-559 ; `before-quit` l. 620-641)
- Test: `tests/electron/preload.test.ts` (tableau `FONCTIONS`)

**Interfaces:**
- Consumes : `creeLEmulateur`, `EtatAffiche` (Task 2).
- Produces : canaux `emulateurEtat: "emulateur:etat"`, `emulateurOuvre: "emulateur:ouvre"`, `emulateurEteint: "emulateur:eteint"`, `emulateurProgress: "emulateur:progress"` ; API fenêtre `emulateurEtat()`, `emulateurOuvre()`, `emulateurEteint()` → `Promise<EtatAffiche>`, `onEmulateurProgress(listener) => () => void`.

- [ ] **Step 1 : étendre le test du preload**

Dans `FONCTIONS` de `tests/electron/preload.test.ts`, avant `["onFetchProgress", "fetchProgress"]` :

```ts
  ["emulateurEtat", "emulateurEtat"],
  ["emulateurOuvre", "emulateurOuvre"],
  ["emulateurEteint", "emulateurEteint"],
```
et après `["onVeilleProgress", "veilleProgress"]` :
```ts
  ["onEmulateurProgress", "emulateurProgress"],
```

- [ ] **Step 2 : vérifier l'échec**

Run: `npx vitest run tests/electron/preload.test.ts`
Expected: FAIL (`"emulateurEtat"` n'est pas une clé de `IPC`, fonction introuvable dans le preload).

- [ ] **Step 3 : déclarer les canaux**

Dans `IPC` (`ipcChannels.ts`), après `veilleCapture` :

```ts
  /** Etat de l'emulateur Android de STU, relu a la demande, avec le bouton a afficher. */
  emulateurEtat: "emulateur:etat",
  /** Ouvre l'emulateur avec sa fenetre, pour se reconnecter a la Nintendo Switch App. */
  emulateurOuvre: "emulateur:ouvre",
  /** Eteint Android proprement (sync puis reboot -p), sans fermer la fenetre. */
  emulateurEteint: "emulateur:eteint",
  /** Chaque changement d'etat de l'emulateur. */
  emulateurProgress: "emulateur:progress",
```

Dans le type de l'API, après `onVeilleProgress` :

```ts
  emulateurEtat: () => Promise<import("./emulateurHandler.ts").EtatAffiche>;
  /** Rend la main une fois l'emulateur allume, ou l'echec constate. */
  emulateurOuvre: () => Promise<import("./emulateurHandler.ts").EtatAffiche>;
  /** Rend la main une fois l'emulateur eteint, ou l'echec constate. */
  emulateurEteint: () => Promise<import("./emulateurHandler.ts").EtatAffiche>;
  /** Renvoie la fonction de desabonnement. */
  onEmulateurProgress: (
    listener: (etat: import("./emulateurHandler.ts").EtatAffiche) => void,
  ) => () => void;
```

Si `ipcChannels.ts` ne peut pas importer un type de `emulateurHandler.ts` sans tirer de code (il n'importe que des types : `import()` de type suffit), garder cette forme.

- [ ] **Step 4 : le preload**

Dans `CANAUX`, après `veilleCapture: "veille:capture",` :

```ts
  emulateurEtat: "emulateur:etat",
  emulateurOuvre: "emulateur:ouvre",
  emulateurEteint: "emulateur:eteint",
  emulateurProgress: "emulateur:progress",
```

Après la fonction `onVeilleProgress` :

```ts
  emulateurEtat: () => ipcRenderer.invoke(CANAUX.emulateurEtat),

  emulateurOuvre: () => ipcRenderer.invoke(CANAUX.emulateurOuvre),

  emulateurEteint: () => ipcRenderer.invoke(CANAUX.emulateurEteint),

  onEmulateurProgress: (listener: (etat: unknown) => void) => {
    const handler = (_event: unknown, etat: unknown) => listener(etat);
    ipcRenderer.on(CANAUX.emulateurProgress, handler);
    return () => {
      ipcRenderer.removeListener(CANAUX.emulateurProgress, handler);
    };
  },
```

- [ ] **Step 5 : `main.ts`**

Importer en tête : `import { creeLEmulateur } from "./emulateurHandler.ts";` (même forme que l'import de `creeLaVeille`).

Dans l'`onChange` de `creeLaVeille`, à la fin, relire l'émulateur quand le statut de la veille change (le bouton en dépend) :

```ts
    if (etat.statut !== statutAnnonce) {
      statutAnnonce = etat.statut;
      void emulateur.rafraichis();
    }
```
avec, avant `const veille = creeLaVeille(...)` : `let statutAnnonce: StatutDeVeille = "arretee";` (importer le type `StatutDeVeille` de `../veille.ts`).

Après les gestionnaires de la veille (après `ipcMain.handle(IPC.veilleCapture, ...)`) :

```ts
/**
 * L'emulateur de STU, ouvert avec sa fenetre quand la session Nintendo est
 * perdue. Son bouton depend de la veille : on lui passe son statut.
 */
const emulateur = creeLEmulateur({
  lance: spawn,
  plateforme: process.platform,
  reglage: REGLAGES.veille,
  statutDeVeille: () => veille.etat().statut,
  onChange: (etat) => {
    for (const fenetre of BrowserWindow.getAllWindows()) {
      if (!fenetre.webContents.isDestroyed()) fenetre.webContents.send(IPC.emulateurProgress, etat);
    }
  },
});

ipcMain.handle(IPC.emulateurEtat, () => emulateur.rafraichis());

ipcMain.handle(IPC.emulateurOuvre, () => emulateur.ouvre());

ipcMain.handle(IPC.emulateurEteint, () => emulateur.eteint());
```

Dans `before-quit`, après le bloc de la veille et avant `if (!sauvegarde.enAttente()) return;` :

```ts
  // L'emulateur ouvert par l'application s'eteint proprement : fermer sa
  // fenetre ou le tuer perdrait la connexion a la Nintendo Switch App. Une
  // seule tentative, 30 s au plus (voir `eteintSiOuvertParNous`).
  if (emulateur.etat().ouvertParNous && !emulateurEteintAvantDeQuitter) {
    emulateurEteintAvantDeQuitter = true;
    evenement.preventDefault();
    void emulateur.eteintSiOuvertParNous().then(() => app.quit());
    return;
  }
```
avec `let emulateurEteintAvantDeQuitter = false;` à côté de `veilleArreteeAvantDeQuitter`.

- [ ] **Step 6 : vérifier**

Run: `npm test && npm run typecheck && npm run app:build`
Expected: tous les tests passent, typecheck et compilation sans erreur.

- [ ] **Step 7 : commit**

```bash
git add src/electron/ipcChannels.ts src/electron/preload.cts src/electron/main.ts tests/electron/preload.test.ts
git commit -m "feat(emulateur): canaux IPC, et extinction a la fermeture de l'application"
```

---

### Task 4 : le bouton dans l'encart, et le README

**Files:**
- Modify: `src/electron/renderer/index.html:60-71`
- Modify: `src/electron/renderer/elements.js:111-114`
- Modify: `src/electron/renderer/veille.js` (`afficheLAlerte` l. 161, fin du fichier)
- Modify: `src/electron/renderer/renderer.css` (après `.veille__alerte-titre`, l. 362)
- Modify: `README.md:84-98`

**Interfaces:**
- Consumes : API fenêtre de la Task 3 ; `EtatAffiche` (type JSDoc `import("../emulateurHandler.ts").EtatAffiche`).

- [ ] **Step 1 : le HTML de l'encart**

Remplacer, dans `#veille-alerte`, le `<p>Si l'émulateur affiche…</p>` et son `<ol>` par :

```html
            <p>Si l'émulateur affiche « Sign In », la session Nintendo est perdue :</p>
            <ol>
              <li>arrêter la veille ;</li>
              <li>ouvrir l'émulateur, et se reconnecter dans la Nintendo Switch App ;</li>
              <li>l'éteindre par le bouton, sans fermer sa fenêtre (fermer l'application l'éteint aussi) ;</li>
              <li>relancer la veille, en dehors de la minute 0 où passe le cron.</li>
            </ol>
            <div class="veille__emulateur" id="veille-emulateur" hidden>
              <button type="button" class="bouton--discret" id="bouton-emulateur"></button>
              <span class="veille__emulateur-note" id="emulateur-note"></span>
            </div>
            <p id="emulateur-manuel">
              Dans WSL : <code>~/Android/boot-window.sh</code> pour l'ouvrir,
              <code>source ~/Android/env.sh &amp;&amp; adb shell sync &amp;&amp; adb shell reboot -p</code>
              pour l'éteindre.
            </p>
```

- [ ] **Step 2 : `elements.js`**

Après `veilleCapture` :

```js
  veilleEmulateur: /** @type {HTMLElement} */ (document.getElementById("veille-emulateur")),
  boutonEmulateur: /** @type {HTMLButtonElement} */ (document.getElementById("bouton-emulateur")),
  emulateurNote: /** @type {HTMLElement} */ (document.getElementById("emulateur-note")),
  emulateurManuel: /** @type {HTMLElement} */ (document.getElementById("emulateur-manuel")),
```

- [ ] **Step 3 : `veille.js`**

Sous les `@typedef` existants :

```js
/** @typedef {import("../emulateurHandler.ts").EtatAffiche} EtatDEmulateur */
```

Variables, à côté de `captureDemandee` :

```js
/** L'encart etait-il deja visible : on relit l'emulateur a son apparition. */
let alerteVisible = false;
/** Action proposee par le bouton de l'emulateur, `undefined` s'il est grise. */
/** @type {"ouvre" | "eteint" | undefined} */
let actionDEmulateur;
```

Au début de `afficheLAlerte`, juste après `elements.veilleAlerte.hidden = alerte === undefined;` :

```js
  if (alerte !== undefined && !alerteVisible) void api.emulateurEtat().then(afficheLEmulateur).catch(() => {});
  alerteVisible = alerte !== undefined;
```

Nouvelle fonction, après `afficheLAlerte` :

```js
/**
 * Le bouton de l'emulateur, tel que le processus principal l'a choisi. Sans
 * bouton (pas de SDK Android, lecture impossible), les commandes a taper
 * restent affichees.
 * @param {EtatDEmulateur} etat
 */
function afficheLEmulateur(etat) {
  const bouton = etat.bouton;
  elements.veilleEmulateur.hidden = !bouton.visible;
  elements.emulateurManuel.hidden = bouton.visible;
  if (!bouton.visible) {
    actionDEmulateur = undefined;
    return;
  }
  elements.boutonEmulateur.textContent = bouton.libelle;
  elements.boutonEmulateur.disabled = !bouton.actif;
  actionDEmulateur = bouton.actif ? bouton.action : undefined;
  elements.emulateurNote.textContent = bouton.note ?? "";
}
```

En fin de fichier, à côté de l'abonnement à la veille :

```js
elements.boutonEmulateur.addEventListener("click", () => {
  const action = actionDEmulateur;
  if (action === undefined) return;
  // Grise tout de suite : le prochain etat arrive par `onEmulateurProgress`.
  elements.boutonEmulateur.disabled = true;
  const appel = action === "ouvre" ? api.emulateurOuvre() : api.emulateurEteint();
  void appel.then(afficheLEmulateur).catch((erreur) => {
    elements.emulateurNote.textContent = messageDe(erreur);
  });
});

api.onEmulateurProgress(afficheLEmulateur);
```

- [ ] **Step 4 : `renderer.css`**

Après `.veille__alerte-titre { … }` :

```css
.veille__emulateur {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.veille__emulateur-note {
  font-size: 12px;
  opacity: 0.8;
}
```

- [ ] **Step 5 : README**

Dans « La veille tourne en boucle sur les jetons », remplacer les étapes 2 et 4 par :

```markdown
2. **Ouvrir l'émulateur avec sa fenêtre** : bouton « Ouvrir l'émulateur » de
   l'encart orange (STU le lance sans fenêtre). Sans l'application :
   `~/Android/boot-window.sh`.
```
```markdown
4. **Éteindre Android proprement**, sans fermer la fenêtre : bouton « Éteindre
   l'émulateur », ou fermer l'application, qui éteint l'émulateur qu'elle a
   ouvert. Sans l'application :
   `source ~/Android/env.sh && adb shell sync && adb shell reboot -p`.
```
(garder la phrase « Fermer la fenêtre ne suffit pas : … » qui suit.)

- [ ] **Step 6 : vérifier**

Run: `npm test && npm run typecheck && npm run app:build`
Expected: tout passe.

- [ ] **Step 7 : commit**

```bash
git add src/electron/renderer README.md
git commit -m "feat(emulateur): bouton dans l'encart d'alerte de STU"
```

---

### Task 5 : vérification dans l'application réelle

Pas de code, sauf correctif. L'encart n'apparaît qu'avec une alerte de STU : pour le vérifier, forcer l'alerte depuis les outils de développement plutôt que d'attendre une panne.

- [ ] **Step 1 : sous Linux (WSLg)**, lancer `npm run app` hors bac à sable (`dangerouslyDisableSandbox`, voir la mémoire du projet sur Electron). Par CDP ou la console, afficher l'encart (`document.getElementById("veille-alerte").hidden = false`) et appeler `window.api.emulateurEtat()` : attendu `lecture: "eteint"` et un bouton « Ouvrir l'émulateur » actif (veille arrêtée, hors minute 0).
- [ ] **Step 2 :** cliquer « Ouvrir l'émulateur ». Attendu : « Démarrage… », la fenêtre de l'émulateur apparaît, puis « Éteindre l'émulateur ». Vérifier `adb devices`.
- [ ] **Step 3 :** cliquer « Éteindre l'émulateur ». Attendu : « Extinction… », puis « Ouvrir l'émulateur » ; `adb devices` vide ; `/tmp/splatoon-statistics-emulateur.log` sans erreur.
- [ ] **Step 4 :** rouvrir l'émulateur, puis fermer l'application. Attendu : l'émulateur s'éteint (la fenêtre disparaît, `adb devices` vide), l'application quitte en moins de 30 s.
- [ ] **Step 5 : sous Windows**, `npm run app:package && npm run app:deploy`, puis refaire les étapes 1 à 4 dans l'application packagée, vérifiée par CDP (jamais par capture d'écran Windows). Point à surveiller : que la fenêtre de l'émulateur s'ouvre bien par WSLg depuis `wsl.exe -e bash -lc`, et que la distribution reste en vie.
- [ ] **Step 6 :** si un correctif a été nécessaire, commit `fix(emulateur): …`.
