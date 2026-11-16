// tests/electron/emulateurHandler.test.ts
import { describe, expect, test } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { creeLEmulateur, DELAI_A_LA_FERMETURE_MS } from "../../src/electron/emulateurHandler.ts";
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

function emulateurDeTest(
  lectures: (string | null)[],
  statut: StatutDeVeille = "arretee",
  extinction = 0,
  attends: (ms: number) => Promise<void> = () => Promise.resolve(),
) {
  const faux = fauxLanceur(lectures, extinction);
  let statutDeVeille = statut;
  const emulateur = creeLEmulateur({
    lance: faux.lance,
    plateforme: "linux",
    reglage: { distribution: "" },
    statutDeVeille: () => statutDeVeille,
    onChange: () => {},
    attends,
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
    // Le delai de 30 s ne s'ecoule jamais : la course ne finit que par l'extinction, sans minuterie.
    const attends = (ms: number) => (ms === DELAI_A_LA_FERMETURE_MS ? new Promise<void>(() => {}) : Promise.resolve());
    const { emulateur, faux, changeLaVeille } = emulateurDeTest(["eteint", "allume", "allume", "eteint"], "arretee", 0, attends);
    await emulateur.ouvre();
    changeLaVeille("arret-demande");
    await emulateur.eteintSiOuvertParNous();
    expect(faux.scripts()).toContain(SCRIPT_D_EXTINCTION);
    expect(emulateur.etat()).toMatchObject({ lecture: "eteint" });
    expect(emulateur.etat().operation).toBeUndefined();
  });
});
