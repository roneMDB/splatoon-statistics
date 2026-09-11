import { createInterface } from "node:readline/promises";
import { Readable, Writable } from "node:stream";
import { describe, expect, test } from "vitest";
import {
  createReadlineAsk,
  parseCliArgs,
  resolveSessionMeta,
  resolveSessionMetaOrFallback,
  type CliOptions,
} from "../src/cli.ts";
import type { SessionWindow } from "../src/window.ts";

/** Flux de sortie muet : les tests ne doivent rien afficher a l'ecran. */
function sortieMuette(): Writable {
  return new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
}

/** Attend une promesse, ou echoue au bout de `ms` plutot que de rester bloque. */
function avecDelaiMax<T>(promesse: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promesse,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`delai depasse (${ms} ms)`)), ms);
    }),
  ]);
}

/** Options minimales valides, pour ne pas repeter tous les champs dans chaque test. */
function baseOptions(overrides: Partial<CliOptions> = {}): CliOptions {
  const window: SessionWindow = {
    fromMs: Date.UTC(2026, 7, 18, 18, 0, 0),
    toMs: Date.UTC(2026, 7, 18, 21, 30, 0),
    paddedFromMs: Date.UTC(2026, 7, 17, 18, 0, 0),
    paddedToMs: Date.UTC(2026, 7, 19, 21, 30, 0),
  };
  return {
    user: "Gloup",
    window,
    filters: {},
    outDir: "data/sessions",
    maxPages: 10,
    ...overrides,
  };
}

describe("parseCliArgs", () => {
  test("lit la fenetre depuis --from et --to", () => {
    const options = parseCliArgs([
      "--from",
      "2026-08-18 20:00",
      "--to",
      "2026-08-18 23:30",
    ]);
    expect(options.window.fromMs).toBe(Date.UTC(2026, 7, 18, 18, 0, 0));
    expect(options.window.toMs).toBe(Date.UTC(2026, 7, 18, 21, 30, 0));
  });

  test("utilise Gloup comme compte par defaut", () => {
    expect(parseCliArgs(["--from", "2026-08-18 20:00"]).user).toBe("Gloup");
  });

  test("accepte un autre compte via --user", () => {
    const options = parseCliArgs(["--from", "2026-08-18 20:00", "--user", "Autre"]);
    expect(options.user).toBe("Autre");
  });

  test("transmet --lobby comme filtre serveur", () => {
    const options = parseCliArgs([
      "--from",
      "2026-08-18 20:00",
      "--lobby",
      "private",
    ]);
    expect(options.filters.lobby).toBe("private");
  });

  test("ne pose aucun filtre de lobby par defaut", () => {
    expect(parseCliArgs(["--from", "2026-08-18 20:00"]).filters.lobby).toBeUndefined();
  });

  test("utilise data/sessions comme dossier de sortie par defaut", () => {
    expect(parseCliArgs(["--from", "2026-08-18 20:00"]).outDir).toBe("data/sessions");
  });

  test("accepte un dossier de sortie via --out", () => {
    const options = parseCliArgs(["--from", "2026-08-18 20:00", "--out", "/tmp/x"]);
    expect(options.outDir).toBe("/tmp/x");
  });

  test("accepte un plafond de pages via --max-pages", () => {
    const options = parseCliArgs(["--from", "2026-08-18 20:00", "--max-pages", "5"]);
    expect(options.maxPages).toBe(5);
  });

  test("exige --from", () => {
    expect(() => parseCliArgs([])).toThrow(/--from/);
  });

  test("refuse un --max-pages non numerique", () => {
    expect(() =>
      parseCliArgs(["--from", "2026-08-18 20:00", "--max-pages", "beaucoup"]),
    ).toThrow(/--max-pages/);
  });

  test("refuse une valeur de lobby inconnue", () => {
    expect(() =>
      parseCliArgs(["--from", "2026-08-18 20:00", "--lobby", "salon"]),
    ).toThrow(/lobby/i);
  });

  test("propage l'erreur de format d'une date invalide", () => {
    expect(() => parseCliArgs(["--from", "hier soir"])).toThrow(/YYYY-MM-DD HH:mm/);
  });

  test("refuse une option inconnue", () => {
    expect(() => parseCliArgs(["--from", "2026-08-18 20:00", "--zoom"])).toThrow();
  });
});

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

describe("resolveSessionMeta", () => {
  test("--name fourni : aucun dialogue, le nom est repris tel quel", async () => {
    const ask = () => {
      throw new Error("le dialogue ne doit pas s'ouvrir");
    };
    const options = baseOptions({ name: "Scrim contre Les Corsaires" });
    const meta = await resolveSessionMeta(options, { isInteractive: true, ask });
    expect(meta).toEqual({ name: "Scrim contre Les Corsaires", type: undefined });
  });

  test("--name avec --type : les deux sont repris, toujours sans dialogue", async () => {
    const ask = () => {
      throw new Error("le dialogue ne doit pas s'ouvrir");
    };
    const options = baseOptions({ name: "Scrim contre Les Corsaires", type: "scrim" });
    const meta = await resolveSessionMeta(options, { isInteractive: true, ask });
    expect(meta).toEqual({ name: "Scrim contre Les Corsaires", type: "scrim" });
  });

  test("pas de --name et entree non interactive : aucun dialogue, aucun nom", async () => {
    const ask = () => {
      throw new Error("le dialogue ne doit pas s'ouvrir");
    };
    const options = baseOptions();
    const meta = await resolveSessionMeta(options, { isInteractive: false, ask });
    expect(meta).toEqual({ name: undefined, type: undefined });
  });

  test("le type venu de --type est transmis au dialogue, sans etre redemande", async () => {
    const questions: string[] = [];
    const ask = async (question: string) => {
      questions.push(question);
      return "Scrim contre Les Corsaires";
    };
    const options = baseOptions({ type: "scrim" });
    const meta = await resolveSessionMeta(options, { isInteractive: true, ask });
    expect(meta).toEqual({ name: "Scrim contre Les Corsaires", type: "scrim" });
    // Une seule question posee : le type connu ne doit pas etre redemande.
    expect(questions).toHaveLength(1);
  });

  test("--name vide ou reduit a des espaces compte comme absent, sans dialogue hors TTY", async () => {
    const ask = () => {
      throw new Error("le dialogue ne doit pas s'ouvrir");
    };
    const vide = await resolveSessionMeta(baseOptions({ name: "" }), {
      isInteractive: false,
      ask,
    });
    const espaces = await resolveSessionMeta(baseOptions({ name: "   " }), {
      isInteractive: false,
      ask,
    });
    expect(vide).toEqual({ name: undefined, type: undefined });
    expect(espaces).toEqual({ name: undefined, type: undefined });
  });

  test("--name vide ouvre le dialogue quand l'entree est interactive", async () => {
    const reponses = ["Nom saisi au dialogue", ""];
    const ask = async () => reponses.shift() ?? "";
    const options = baseOptions({ name: "" });
    const meta = await resolveSessionMeta(options, { isInteractive: true, ask });
    expect(meta.name).toBe("Nom saisi au dialogue");
  });
});

describe("resolveSessionMetaOrFallback", () => {
  test("un ask qui leve retombe sur les options de ligne de commande, sans exception", async () => {
    const ask = () => {
      throw new Error("stdin indisponible");
    };
    const options = baseOptions({ name: "", type: "scrim" });
    const meta = await resolveSessionMetaOrFallback(options, { isInteractive: true, ask });
    expect(meta).toEqual({ name: undefined, type: "scrim" });
  });

  test("--name reduit a des espaces retombe sur undefined apres un dialogue en echec", async () => {
    const ask = () => {
      throw new Error("erreur readline");
    };
    const options = baseOptions({ name: "   " });
    const meta = await resolveSessionMetaOrFallback(options, { isInteractive: true, ask });
    expect(meta).toEqual({ name: undefined, type: undefined });
  });

  test("sans erreur, le comportement est celui de resolveSessionMeta", async () => {
    const reponses = ["Nom saisi au dialogue", ""];
    const ask = async () => reponses.shift() ?? "";
    const options = baseOptions({ name: "" });
    const meta = await resolveSessionMetaOrFallback(options, { isInteractive: true, ask });
    expect(meta.name).toBe("Nom saisi au dialogue");
  });
});

describe("createReadlineAsk", () => {
  test("une entree deja terminee (Ctrl+D) donne une reponse vide au lieu de rester bloquee", async () => {
    const rl = createInterface({ input: Readable.from([]), output: sortieMuette() });
    const ask = createReadlineAsk(rl);
    try {
      const reponse = await avecDelaiMax(ask("Question : "), 500);
      expect(reponse).toBe("");
    } finally {
      rl.close();
    }
  });
});
