import { afterEach, describe, expect, test } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleFetchSession } from "../../src/electron/sessionFetchHandler.ts";
import type { StatinkBattle } from "../../src/statink/types.ts";

/** Match minimal : seuls uuid, start_at et result comptent ici. */
function battle(uuid: string, iso: string, result = "win"): StatinkBattle {
  const ms = Date.parse(iso);
  return {
    id: uuid,
    uuid,
    url: `https://stat.ink/@Gloup/spl3/${uuid}`,
    lobby: { key: "private" },
    result,
    start_at: { time: ms / 1000, iso8601: iso },
  } as unknown as StatinkBattle;
}

/** Sert des pages predefinies, comme le stub de fetchSession.test.ts. */
function stubPages(pages: StatinkBattle[][]) {
  const requests: { user: string; page: number }[] = [];
  const fetchPage = async (request: { user: string; page: number }) => {
    requests.push({ user: request.user, page: request.page });
    return pages[Math.min(request.page - 1, pages.length - 1)] ?? [];
  };
  return { requests, fetchPage };
}

const dirs: string[] = [];
const tempDir = async () => {
  const dir = await mkdtemp(join(tmpdir(), "splat-handler-"));
  dirs.push(dir);
  return dir;
};
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

// Fenetre : 19 aout 2026, 20:00 -> 23:00 heure de Paris.
const fenetre = { from: "2026-08-19 20:00", to: "2026-08-19 23:00" };

describe("handleFetchSession", () => {
  test("ecrit la session et en rend le resume", async () => {
    const outDir = await tempDir();
    const { fetchPage } = stubPages([
      [
        battle("b", "2026-08-19T20:30:00Z", "lose"),
        battle("a", "2026-08-19T19:00:00Z", "win"),
      ],
    ]);

    const resume = await handleFetchSession(
      {
        user: "Gloup",
        name: "Scrim contre Les Corsaires",
        type: "scrim",
        lobby: "private",
        ...fenetre,
      },
      { fetchPage, outDir, now: () => new Date("2026-08-19T21:34:00Z") },
    );

    expect(resume.name).toBe("Scrim contre Les Corsaires");
    expect(resume.type).toBe("scrim");
    expect(resume.battleCount).toBe(2);
    expect(resume.results).toEqual({ win: 1, lose: 1, draw: 0 });
    expect(resume.fetchedAt).toBe("2026-08-19T21:34:00.000Z");
    expect(resume.pagesFetched).toBeGreaterThanOrEqual(1);
    expect(resume.stopReason).toBeTruthy();

    const ecrit = JSON.parse(await readFile(resume.path, "utf8"));
    expect(ecrit.name).toBe("Scrim contre Les Corsaires");
    expect(ecrit.battles).toHaveLength(2);
  });

  test("transmet le filtre de lobby a stat.ink", async () => {
    const outDir = await tempDir();
    const filtres: unknown[] = [];
    const fetchPage = async (request: { filters?: unknown }) => {
      filtres.push(request.filters);
      return [];
    };

    await handleFetchSession(
      { user: "Gloup", lobby: "private", ...fenetre },
      { fetchPage, outDir },
    );

    expect(filtres[0]).toMatchObject({ lobby: "private" });
  });

  test("annonce la progression page par page", async () => {
    const outDir = await tempDir();
    const { fetchPage } = stubPages([
      [battle("a", "2026-08-19T20:30:00Z")],
      [battle("b", "2026-08-18T10:00:00Z")],
    ]);
    const progression: unknown[] = [];

    await handleFetchSession(
      { user: "Gloup", ...fenetre },
      { fetchPage, outDir, onProgress: (etape) => progression.push(etape) },
    );

    expect(progression.length).toBeGreaterThanOrEqual(1);
    expect(progression[0]).toMatchObject({ page: 1 });
  });

  test("ecrit quand meme une session sans aucun match", async () => {
    const outDir = await tempDir();
    const { fetchPage } = stubPages([[]]);

    const resume = await handleFetchSession(
      { user: "Gloup", name: "soiree annulee", ...fenetre },
      { fetchPage, outDir },
    );

    expect(resume.battleCount).toBe(0);
    expect(resume.results).toEqual({ win: 0, lose: 0, draw: 0 });
    await expect(readFile(resume.path, "utf8")).resolves.toContain("soiree annulee");
  });

  test("traite un nom vide comme un nom absent, comme la ligne de commande", async () => {
    const outDir = await tempDir();
    const { fetchPage } = stubPages([[]]);

    const resume = await handleFetchSession(
      { user: "Gloup", name: "   ", ...fenetre },
      { fetchPage, outDir },
    );

    expect(resume.name).toBeUndefined();
  });

  test("refuse un type hors liste avec le message de la ligne de commande", async () => {
    const outDir = await tempDir();
    const { fetchPage } = stubPages([[]]);

    await expect(
      handleFetchSession(
        { user: "Gloup", type: "tournoi", ...fenetre },
        { fetchPage, outDir },
      ),
    ).rejects.toThrow(/--type inconnue.*intra/s);
  });

  test("refuse un lobby hors liste avec le message de la ligne de commande", async () => {
    const outDir = await tempDir();
    const { fetchPage } = stubPages([[]]);

    await expect(
      handleFetchSession(
        { user: "Gloup", lobby: "salon-prive", ...fenetre },
        { fetchPage, outDir },
      ),
    ).rejects.toThrow(/--lobby inconnue.*private/s);
  });

  test("refuse une date illisible avec le message du noyau", async () => {
    const outDir = await tempDir();
    const { fetchPage } = stubPages([[]]);

    await expect(
      handleFetchSession(
        { user: "Gloup", from: "hier soir", to: "2026-08-19 23:00" },
        { fetchPage, outDir },
      ),
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
      handleFetchSession({ user: "   ", ...fenetre }, { fetchPage, outDir }),
    ).rejects.toThrow(/pseudo/i);
    expect(appele).toBe(false);
  });

  test("laisse remonter une erreur reseau sans ecrire de fichier", async () => {
    const outDir = await tempDir();
    const fetchPage = async () => {
      throw new Error("stat.ink a repondu 403.");
    };

    await expect(
      handleFetchSession({ user: "Gloup", ...fenetre }, { fetchPage, outDir }),
    ).rejects.toThrow("stat.ink a repondu 403.");

    const { listSessions } = await import("../../src/sessionList.ts");
    await expect(listSessions(outDir)).resolves.toEqual({ sessions: [], errors: [] });
  });
});
