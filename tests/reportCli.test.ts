import { afterEach, describe, expect, test } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ecrisLaPlanche, parseReportArgs, rendCompteRendu } from "../src/reportCli.ts";
import { SECTIONS } from "../src/report/index.ts";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function sessionSurDisque(): Promise<{ dir: string; path: string }> {
  const dir = await mkdtemp(join(tmpdir(), "splat-report-"));
  dirs.push(dir);
  const path = join(dir, "Gloup_20260911-2000_20260911-2301.json");
  await writeFile(
    path,
    JSON.stringify({
      source: "stat.ink",
      user: "Gloup",
      name: "Équipe A vs Équipe O",
      type: "intra",
      objectif: "Tenir le support",
      fetchedAt: "2026-09-11T21:30:44.274Z",
      window: { from: "2026-09-11T18:00:00.000Z", to: "2026-09-11T21:01:00.000Z" },
      filters: { lobby: "private" },
      battleCount: 1,
      battles: [
        {
          id: "a",
          uuid: "a",
          url: "",
          lobby: { key: "private" },
          rule: { key: "area" },
          stage: { key: "yagara" },
          result: "lose",
          knockout: true,
          start_at: { time: 1_789_000_000, iso8601: "2026-09-11T19:00:00+00:00" },
          end_at: { time: 1_789_000_090, iso8601: "2026-09-11T19:01:30+00:00" },
          our_team_members: [{ me: true, name: "☆Gloųp☆", kill: 1, assist: 2, death: 3, special: 1 }],
          their_team_members: [],
          medals: [],
        },
      ],
    }),
    "utf8",
  );
  return { dir, path };
}

describe("parseReportArgs", () => {
  test("prend le fichier en argument positionnel et toutes les sections par defaut", () => {
    const options = parseReportArgs(["data/sessions/x.json"]);

    expect(options.path).toBe("data/sessions/x.json");
    expect(options.sections).toEqual([...SECTIONS]);
  });

  test("refuse un appel sans fichier", () => {
    expect(() => parseReportArgs([])).toThrow(/fichier de session/);
  });

  test("retient les sections demandees, dans l'ordre demande", () => {
    expect(parseReportArgs(["x.json", "--sections", "modes,courbe"]).sections).toEqual([
      "modes",
      "courbe",
    ]);
  });

  test("tolere les espaces autour des noms de section", () => {
    expect(parseReportArgs(["x.json", "--sections", " role , modes "]).sections).toEqual([
      "role",
      "modes",
    ]);
  });

  test("refuse une section inconnue en nommant celles qui existent", () => {
    expect(() => parseReportArgs(["x.json", "--sections", "inventee"])).toThrow(
      /Section inconnue.*courbe/s,
    );
  });

  test("porte les champs libres passes en option", () => {
    const options = parseReportArgs(["x.json", "--objectif", "Support", "--ressenti", "Dur"]);

    expect(options.objectif).toBe("Support");
    expect(options.ressenti).toBe("Dur");
  });
});

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

describe("rendCompteRendu", () => {
  test("rend le compte rendu d'une session ecrite", async () => {
    const { dir, path } = await sessionSurDisque();

    const rendu = await rendCompteRendu(parseReportArgs([path, "--out", dir]));

    expect(rendu).toContain("## Intra du 11/09 — Équipe A vs Équipe O");
    expect(rendu).toContain("Objectif de la session : Tenir le support");
    expect(rendu).toContain("1 KO subi pour 0 infligé");
  });

  test("lit un fichier hors du dossier des sessions, que la CLI a le droit de designer", async () => {
    // La garde de chemin protege la fenetre d'un rendu compromis ; en terminal,
    // c'est l'utilisateur lui-meme qui tape le chemin.
    const { path } = await sessionSurDisque();

    const rendu = await rendCompteRendu(parseReportArgs([path, "--out", "data/sessions"]));

    expect(rendu).toContain("## Intra du 11/09");
  });

  test("laisse l'option primer sur l'objectif enregistre", async () => {
    const { dir, path } = await sessionSurDisque();

    const rendu = await rendCompteRendu(
      parseReportArgs([path, "--out", dir, "--objectif", "Autre chose"]),
    );

    expect(rendu).toContain("Autre chose");
    expect(rendu).not.toContain("Tenir le support");
  });

  test("signale un fichier introuvable plutot que de rendre un document vide", async () => {
    await expect(
      rendCompteRendu(parseReportArgs(["/introuvable/session.json"])),
    ).rejects.toThrow();
  });
});

describe("parseReportArgs --entete", () => {
  test("est desactive par defaut", () => {
    expect(parseReportArgs(["s.json", "--planche"]).entete).toBe(false);
  });

  test("s'active avec --entete et garde les sections demandees", () => {
    const options = parseReportArgs(["s.json", "--planche", "--entete", "--sections", "role"]);
    expect(options.entete).toBe(true);
    expect(options.sections).toEqual(["role"]);
  });
});

describe("ecrisLaPlanche", () => {
  // Aucun test ne doit ecrire dans le vrai data/planches/ : on fournit
  // toujours un dossier de planches temporaire, distinct du dossier de
  // sessions temporaire.
  test("ecrit la planche en HTML dans le dossier fourni, sous le nom de la session", async () => {
    const { dir, path } = await sessionSurDisque();
    const dossierPlanches = await mkdtemp(join(tmpdir(), "splat-planches-"));
    dirs.push(dossierPlanches);

    const chemin = await ecrisLaPlanche(parseReportArgs([path, "--out", dir]), dossierPlanches);

    expect(chemin).toBe(join(dossierPlanches, "Gloup_20260911-2000_20260911-2301.html"));
    const contenu = await readFile(chemin, "utf8");
    expect(contenu.startsWith("<!doctype html>")).toBe(true);
    expect(contenu).toContain("Équipe A vs Équipe O");
    expect(contenu).not.toContain('<section class="entete">');
  });

  test("avec --entete, pose l'en-tete dessine et lit les pictos du dossier fourni", async () => {
    const { dir, path } = await sessionSurDisque();
    const dossierPlanches = await mkdtemp(join(tmpdir(), "splat-planches-"));
    const dossierPictos = await mkdtemp(join(tmpdir(), "splat-pictos-"));
    dirs.push(dossierPlanches, dossierPictos);
    await mkdir(join(dossierPictos, "polices"), { recursive: true });
    await writeFile(join(dossierPictos, "polices", "titre.woff2"), "woff");

    const chemin = await ecrisLaPlanche(
      parseReportArgs([path, "--out", dir, "--planche", "--entete", "--objectif", "Tenir le support"]),
      dossierPlanches,
      dossierPictos,
    );

    const contenu = await readFile(chemin, "utf8");
    expect(contenu).toContain('<section class="entete">');
    expect(contenu).toContain("Tenir le support");
    expect(contenu).toContain(`data:font/woff2;base64,${Buffer.from("woff").toString("base64")}`);
  });
});
