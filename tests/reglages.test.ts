import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  chargeLesReglages,
  DESCRIPTION_DES_SEUILS,
  ecartAuxDefauts,
  enregistreLesReglages,
  REGLAGES,
  REGLAGES_PAR_DEFAUT,
  valideLesReglages,
} from "../src/reglages.ts";

describe("valideLesReglages", () => {
  test("un objet vide donne les valeurs par defaut", () => {
    expect(valideLesReglages({})).toEqual(REGLAGES_PAR_DEFAUT);
  });

  test("ne change que ce qui est ecrit, jusque dans les objets imbriques", () => {
    const reglages = valideLesReglages({
      utilisateur: "  Bloup ",
      dossiers: { planches: "ailleurs/planches" },
      seuils: { medaillesCitees: 6 },
    });

    expect(reglages.utilisateur).toBe("Bloup");
    expect(reglages.dossiers).toEqual({ ...REGLAGES_PAR_DEFAUT.dossiers, planches: "ailleurs/planches" });
    expect(reglages.seuils).toEqual({ ...REGLAGES_PAR_DEFAUT.seuils, medaillesCitees: 6 });
  });

  test("ne modifie jamais les valeurs par defaut", () => {
    valideLesReglages({ typesDeSession: ["tournoi"], seuils: { medaillesCitees: 9 } });
    expect(REGLAGES_PAR_DEFAUT.typesDeSession).toContain("intra");
    expect(REGLAGES_PAR_DEFAUT.seuils.medaillesCitees).toBe(4);
  });

  test("remet les sections par defaut dans l'ordre du document", () => {
    expect(valideLesReglages({ sectionsParDefaut: ["scouting", "courbe"] }).sectionsParDefaut).toEqual([
      "courbe",
      "scouting",
    ]);
    expect(valideLesReglages({ sectionsParDefaut: [] }).sectionsParDefaut).toEqual([]);
  });

  test("refuse une clé inconnue en la nommant, a tous les niveaux", () => {
    expect(() => valideLesReglages({ utilisateurs: "Gloup" })).toThrow(/clé inconnue "utilisateurs"/);
    expect(() => valideLesReglages({ dossiers: { session: "x" } })).toThrow(/"dossiers" : clé inconnue "session"/);
    expect(() => valideLesReglages({ seuils: { serieFinale: 3 } })).toThrow(/"seuils" : clé inconnue "serieFinale"/);
  });

  test.each([
    [{ utilisateur: "" }, /"utilisateur" : texte non vide/],
    [{ typesDeSession: [] }, /liste non vide/],
    [{ typesDeSession: ["Open"] }, /"Open" n'est pas un type valide/],
    [{ typesDeSession: ["intra", "intra"] }, /"intra" apparaît deux fois/],
    [{ sectionsParDefaut: ["bilan"] }, /section inconnue "bilan"/],
    [{ enteteParDefaut: "oui" }, /true ou false/],
    [{ dossiers: { pictos: "" } }, /dossiers"\.pictos : texte non vide/],
    [{ seuils: { medaillesCitees: 0 } }, /medaillesCitees : entier au moins égal à 1/],
    [{ seuils: { serieFinaleMinimale: 2.5 } }, /serieFinaleMinimale : entier/],
    [{ seuils: { partDeSessionReguliere: 1.5 } }, /partDeSessionReguliere : nombre entre 0/],
    [[], /un objet JSON est attendu/],
  ])("refuse %j", (brut, message) => {
    expect(() => valideLesReglages(brut)).toThrow(message);
  });
});

describe("chargeLesReglages", () => {
  let dossier: string;
  beforeEach(async () => {
    dossier = await mkdtemp(join(tmpdir(), "reglages-"));
  });
  afterEach(async () => {
    await rm(dossier, { recursive: true, force: true });
  });

  test("un fichier absent donne les valeurs par defaut", () => {
    expect(chargeLesReglages(join(dossier, "absent.json"))).toEqual(REGLAGES_PAR_DEFAUT);
  });

  test("un chemin vide desactive la lecture", () => {
    expect(chargeLesReglages("")).toEqual(REGLAGES_PAR_DEFAUT);
  });

  test("lit et valide le fichier", async () => {
    const chemin = join(dossier, "settings.json");
    await writeFile(chemin, JSON.stringify({ typesDeSession: ["intra", "tournoi"] }));
    expect(chargeLesReglages(chemin).typesDeSession).toEqual(["intra", "tournoi"]);
  });

  test("un JSON casse est une erreur qui nomme le fichier, pas un retour discret aux defauts", async () => {
    const chemin = join(dossier, "settings.json");
    await writeFile(chemin, "{ utilisateur: Gloup }");
    expect(() => chargeLesReglages(chemin)).toThrow(/settings\.json : JSON invalide/);
  });
});

test("les tests tournent sur les reglages par defaut, quel que soit le settings.json local", () => {
  expect(REGLAGES).toEqual(REGLAGES_PAR_DEFAUT);
});

test("le fichier d'exemple est valide et montre toutes les valeurs par defaut", () => {
  const exemple = JSON.parse(readFileSync("settings.exemple.json", "utf8"));
  expect(valideLesReglages(exemple)).toEqual(REGLAGES_PAR_DEFAUT);
  expect(exemple).toEqual(REGLAGES_PAR_DEFAUT);
});

describe("ecartAuxDefauts", () => {
  test("des reglages par defaut ne donnent rien a ecrire", () => {
    expect(ecartAuxDefauts(structuredClone(REGLAGES_PAR_DEFAUT))).toEqual({});
  });

  test("ne garde que ce qui differe, y compris dans les objets imbriques", () => {
    const reglages = valideLesReglages({
      utilisateur: "Bloup",
      enteteParDefaut: true,
      dossiers: { pictos: "ailleurs" },
      seuils: { medaillesCitees: 6, serieFinaleMinimale: 3 },
    });
    expect(ecartAuxDefauts(reglages)).toEqual({
      utilisateur: "Bloup",
      enteteParDefaut: true,
      dossiers: { pictos: "ailleurs" },
      seuils: { medaillesCitees: 6 },
    });
  });
});

describe("enregistreLesReglages", () => {
  let dossier: string;
  beforeEach(async () => {
    dossier = await mkdtemp(join(tmpdir(), "reglages-"));
  });
  afterEach(async () => {
    await rm(dossier, { recursive: true, force: true });
  });

  test("ecrit l'ecart aux defauts, relisible tel quel", async () => {
    const chemin = join(dossier, "settings.json");
    const complets = await enregistreLesReglages(
      { ...REGLAGES_PAR_DEFAUT, typesDeSession: ["intra", "tournoi"] },
      chemin,
    );

    expect(JSON.parse(await readFile(chemin, "utf8"))).toEqual({ typesDeSession: ["intra", "tournoi"] });
    expect(chargeLesReglages(chemin)).toEqual(complets);
  });

  test("n'ecrit rien quand la validation echoue", async () => {
    const chemin = join(dossier, "settings.json");
    await writeFile(chemin, '{ "utilisateur": "Avant" }');
    await expect(enregistreLesReglages({ seuils: { medaillesCitees: 0 } }, chemin)).rejects.toThrow(
      /medaillesCitees/,
    );
    expect(await readFile(chemin, "utf8")).toBe('{ "utilisateur": "Avant" }');
  });

  test("refuse d'ecrire quand la lecture est desactivee", async () => {
    await expect(enregistreLesReglages({}, "")).rejects.toThrow(/désactivée/);
  });
});

test("chaque seuil a sa description a l'ecran", () => {
  expect(Object.keys(DESCRIPTION_DES_SEUILS).sort()).toEqual(Object.keys(REGLAGES_PAR_DEFAUT.seuils).sort());
  for (const description of Object.values(DESCRIPTION_DES_SEUILS)) {
    expect(description.libelle.length).toBeGreaterThan(0);
    expect(description.explication.length).toBeGreaterThan(40);
  }
});
