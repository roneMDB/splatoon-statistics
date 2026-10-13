import { describe, expect, test } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { creeLaVeille, type Lanceur } from "../../src/electron/veilleHandler.ts";
import type { EtatDeVeille } from "../../src/veille.ts";

/** Un faux processus : on ecrit sa sortie et on decide de sa fin. */
class FauxProcessus extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  ecris(texte: string) {
    this.stdout.write(texte);
  }
  finit(code: number | null) {
    this.stdout.end();
    this.stderr.end();
    // `close` arrive apres la fin des flux, comme pour un vrai processus.
    setImmediate(() => this.emit("close", code));
  }
}

/** Le lanceur garde chaque processus cree ; l'arret rend `codeDArret` aussitot. */
function fauxLanceur(codeDArret: number | null = 0) {
  const lances: { fichier: string; args: string[]; processus: FauxProcessus }[] = [];
  const lance: Lanceur = (fichier, args) => {
    const processus = new FauxProcessus();
    lances.push({ fichier, args, processus });
    if (args.at(-1)?.includes("kill -INT")) setImmediate(() => processus.emit("close", codeDArret));
    return processus;
  };
  return { lance, lances };
}

const attends = () => new Promise((resolve) => setImmediate(resolve));
const reglage = { commande: "s3s-sync -r -M 60", distribution: "" };

function veilleDeTest(codeDArret: number | null = 0, plateforme: NodeJS.Platform = "linux") {
  const { lance, lances } = fauxLanceur(codeDArret);
  const etats: EtatDeVeille[] = [];
  const veille = creeLaVeille({ lance, plateforme, reglage, onChange: (etat) => etats.push(etat) });
  return { veille, lances, etats };
}

describe("creeLaVeille", () => {
  test("lance la commande des reglages, et suit sa sortie", async () => {
    const { veille, lances } = veilleDeTest();
    expect(veille.demarre()).toMatchObject({ statut: "en-cours", phase: "demarrage" });
    expect(lances).toHaveLength(1);
    expect(lances[0]?.fichier).toBe("bash");
    expect(lances[0]?.args.at(-1)).toContain("s3s-sync -r -M 60");

    lances[0]!.processus.ecris("Waiting for new battles... (checking every 1 minute)\nPress Ctrl+C to exit. 4");
    lances[0]!.processus.ecris("2 \rNew battle result detected at 9:41:12 PM! (Museum, Victory)\n");
    lances[0]!.processus.ecris("Battle uploaded to https://stat.ink/@Gloup/spl3/a\n");
    await attends();

    expect(veille.etat().parties).toMatchObject([{ stage: "Museum", statut: "envoyee" }]);
    expect(veille.etat().journal).not.toContain("Press Ctrl+C to exit. 42");
  });

  test("ne lance pas une seconde veille par-dessus la premiere", () => {
    const { veille, lances } = veilleDeTest();
    veille.demarre();
    veille.demarre();
    expect(lances).toHaveLength(1);
  });

  test("l'arret envoie Ctrl+C, puis attend la fin reelle de la veille", async () => {
    const { veille, lances } = veilleDeTest();
    veille.demarre();
    const etat = await veille.arrete();

    expect(lances[1]?.args.at(-1)).toContain("kill -INT");
    // La verification finale tourne encore : la veille n'est pas finie.
    expect(etat.statut).toBe("arret-demande");

    lances[0]!.processus.ecris("Fin propre.\n");
    lances[0]!.processus.finit(0);
    await attends();
    await attends();
    expect(veille.etat()).toMatchObject({ statut: "arretee", codeDeSortie: 0 });
    expect(veille.etat().phase).toBeUndefined();
    expect(veille.etat().journal.at(-1)).toBe("Fin propre.");
  });

  test("un arret qui n'aboutit pas laisse la veille en cours, et le dit", async () => {
    const { veille } = veilleDeTest(1);
    veille.demarre();
    expect(await veille.arrete()).toMatchObject({
      statut: "en-cours",
      erreur: "L'arrêt n'a pas pu être transmis à la veille.",
    });
  });

  test("une veille relancee repart d'une liste vide", async () => {
    const { veille, lances } = veilleDeTest();
    veille.demarre();
    lances[0]!.processus.ecris("Battle uploaded to https://stat.ink/@Gloup/spl3/a\n");
    lances[0]!.processus.finit(0);
    await attends();
    await attends();
    expect(veille.etat().parties).toHaveLength(1);

    expect(veille.demarre().parties).toEqual([]);
  });

  test("un lancement impossible est rapporte, sans rester « en cours »", async () => {
    const { veille, lances } = veilleDeTest();
    veille.demarre();
    lances[0]!.processus.emit("error", new Error("spawn wsl.exe ENOENT"));
    expect(veille.etat()).toMatchObject({ statut: "arretee", erreur: "Lancement impossible : spawn wsl.exe ENOENT" });
  });

  test("sous Windows, passe par wsl.exe", () => {
    const { veille, lances } = veilleDeTest(0, "win32");
    veille.demarre();
    expect(lances[0]?.fichier).toBe("wsl.exe");
  });

  test("ailleurs, se dit indisponible et ne lance rien", () => {
    const { veille, lances } = veilleDeTest(0, "darwin");
    expect(veille.etat().indisponible).toBe(true);
    veille.demarre();
    expect(lances).toHaveLength(0);
  });
});
