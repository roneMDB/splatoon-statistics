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
