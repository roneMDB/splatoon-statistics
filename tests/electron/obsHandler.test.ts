import { describe, expect, test } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { SpawnOptions } from "node:child_process";
import { demarreObsSiBesoin, messageObs, type LanceurObs } from "../../src/electron/obsHandler.ts";
import { commandesObs } from "../../src/obs.ts";

class FauxProcessus extends EventEmitter {
  stdout = new PassThrough();
  detache = false;
  unref() {
    this.detache = true;
  }
}

/**
 * `tasklist` ecrit `liste` et rend `code` ; OBS demarre, ou echoue avec
 * `erreurDeLancement`.
 */
function fauxLanceur(liste: string, code: number | null = 0, erreurDeLancement?: string) {
  const lances: { fichier: string; args: string[]; options: SpawnOptions; processus: FauxProcessus }[] = [];
  const lance: LanceurObs = (fichier, args, options) => {
    const processus = new FauxProcessus();
    lances.push({ fichier, args, options, processus });
    setImmediate(() => {
      if (fichier.endsWith("tasklist.exe")) {
        processus.stdout.end(liste);
        processus.emit("close", code);
      } else if (erreurDeLancement !== undefined) {
        processus.emit("error", new Error(erreurDeLancement));
      } else {
        processus.emit("spawn");
      }
    });
    return processus;
  };
  return { lance, lances };
}

const commandes = commandesObs("win32", false);
const AUCUNE = "INFO: No tasks are running which match the specified criteria.\r\n";

describe("demarreObsSiBesoin", () => {
  test("OBS deja lance : rien d'autre que la lecture", async () => {
    const { lance, lances } = fauxLanceur(`"obs64.exe","3888","Console","1","208 472 Ko"\r\n`);
    expect(await demarreObsSiBesoin({ lance, commandes, existe: () => true })).toEqual({ etat: "deja-lance" });
    expect(lances).toHaveLength(1);
  });

  test("OBS absent : lance depuis son dossier, detache, avec les deux options", async () => {
    const { lance, lances } = fauxLanceur(AUCUNE);
    expect(await demarreObsSiBesoin({ lance, commandes, existe: () => true })).toEqual({ etat: "lance" });
    const obs = lances[1]!;
    expect(obs.fichier).toBe("C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe");
    expect(obs.args).toEqual(["--disable-shutdown-check", "--minimize-to-tray"]);
    expect(obs.options).toMatchObject({ cwd: "C:\\Program Files\\obs-studio\\bin\\64bit", detached: true });
    expect(obs.processus.detache).toBe(true);
  });

  test("lecture impossible : ne lance rien, plutot que risquer un second OBS", async () => {
    const { lance, lances } = fauxLanceur("", 1);
    expect(await demarreObsSiBesoin({ lance, commandes, existe: () => true })).toMatchObject({ etat: "echec" });
    expect(lances).toHaveLength(1);
  });

  test("OBS pas installe a l'endroit attendu : le dit, sans rien lancer", async () => {
    const { lance, lances } = fauxLanceur(AUCUNE);
    const resultat = await demarreObsSiBesoin({ lance, commandes, existe: () => false });
    expect(resultat).toEqual({ etat: "introuvable", chemin: commandes!.lancement.fichier });
    expect(lances).toHaveLength(1);
  });

  test("un lancement refuse est rapporte", async () => {
    const { lance } = fauxLanceur(AUCUNE, 0, "spawn EACCES");
    const resultat = await demarreObsSiBesoin({ lance, commandes, existe: () => true });
    expect(resultat).toEqual({ etat: "echec", message: "spawn EACCES" });
    expect(messageObs(resultat)).toBe("OBS non lancé : spawn EACCES");
  });

  test("plateforme sans OBS : ne lance rien, ne dit rien", async () => {
    const { lance, lances } = fauxLanceur(AUCUNE);
    const resultat = await demarreObsSiBesoin({ lance, commandes: undefined, existe: () => true });
    expect(resultat).toEqual({ etat: "non-gere" });
    expect(messageObs(resultat)).toBeUndefined();
    expect(lances).toHaveLength(0);
  });
});
