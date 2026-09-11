import { describe, expect, test } from "vitest";
import { fetchSession } from "../src/fetchSession.ts";
import { buildWindow } from "../src/window.ts";
import type { StatinkBattle } from "../src/statink/types.ts";

/** Match minimal : seuls uuid et start_at comptent pour la pagination. */
function battle(uuid: string, iso: string): StatinkBattle {
  const ms = Date.parse(iso);
  return {
    id: uuid,
    uuid,
    url: `https://stat.ink/@Gloup/spl3/${uuid}`,
    lobby: { key: "private" },
    rule: { key: "area" },
    stage: { key: "yagara" },
    result: "win",
    knockout: false,
    start_at: { time: ms / 1000, iso8601: iso },
    end_at: { time: ms / 1000 + 300, iso8601: iso },
    our_team_members: [],
    their_team_members: [],
  };
}

/** Sert des pages predefinies et enregistre les URL demandees. */
function stubPages(pages: StatinkBattle[][]) {
  const urls: string[] = [];
  const fetchPage = async (request: { user: string; page: number; filters?: unknown }) => {
    urls.push(JSON.stringify(request));
    // Comme le vrai stat.ink, une page hors borne renvoie la derniere page.
    return pages[Math.min(request.page - 1, pages.length - 1)] ?? [];
  };
  return { urls, fetchPage };
}

// Fenetre : 19 aout 2026, 16:00 -> 18:00 heure de Paris = 14:00 -> 16:00 UTC.
const window = buildWindow("2026-08-19 16:00", "2026-08-19 18:00");

describe("fetchSession", () => {
  test("ne garde que les matchs de la fenetre demandee", async () => {
    const { fetchPage } = stubPages([
      [
        battle("apres", "2026-08-19T17:00:00Z"),
        battle("dedans-2", "2026-08-19T15:30:00Z"),
        battle("dedans-1", "2026-08-19T14:10:00Z"),
        battle("avant", "2026-08-19T13:00:00Z"),
      ],
    ]);
    const result = await fetchSession({ user: "Gloup", window }, { fetchPage });
    expect(result.battles.map((b) => b.uuid)).toEqual(["dedans-1", "dedans-2"]);
  });

  test("classe les matchs du plus ancien au plus recent", async () => {
    const { fetchPage } = stubPages([
      [
        battle("c", "2026-08-19T15:50:00Z"),
        battle("b", "2026-08-19T15:20:00Z"),
        battle("a", "2026-08-19T14:30:00Z"),
      ],
    ]);
    const result = await fetchSession({ user: "Gloup", window }, { fetchPage });
    expect(result.battles.map((b) => b.uuid)).toEqual(["a", "b", "c"]);
  });

  test("transmet la fenetre elargie a stat.ink, pas la fenetre exacte", async () => {
    const { urls, fetchPage } = stubPages([[]]);
    await fetchSession({ user: "Gloup", window }, { fetchPage });
    const request = JSON.parse(urls[0]!);
    // 24h avant 16:00 le 19 aout => 16:00:00 le 18 aout, heure de Paris.
    expect(request.filters.termFrom).toBe("2026-08-18 16:00:00");
    expect(request.filters.termTo).toBe("2026-08-20 18:00:00");
  });

  test("transmet les filtres de l'utilisateur", async () => {
    const { urls, fetchPage } = stubPages([[]]);
    await fetchSession(
      { user: "Gloup", window, filters: { lobby: "private" } },
      { fetchPage },
    );
    expect(JSON.parse(urls[0]!).filters.lobby).toBe("private");
  });

  test("continue la pagination tant que la page reste dans la fenetre elargie", async () => {
    const { fetchPage } = stubPages([
      [battle("p1", "2026-08-19T15:00:00Z")],
      [battle("p2", "2026-08-19T14:30:00Z")],
      [battle("p3", "2026-08-10T00:00:00Z")], // bien avant : on s'arrete apres
    ]);
    const result = await fetchSession({ user: "Gloup", window }, { fetchPage });
    expect(result.pagesFetched).toBe(3);
    expect(result.battles.map((b) => b.uuid)).toEqual(["p2", "p1"]);
  });

  test("s'arrete des que la page depasse la borne basse elargie", async () => {
    const { fetchPage } = stubPages([
      [battle("vieux", "2026-08-01T00:00:00Z")],
      [battle("jamais-lu", "2026-07-01T00:00:00Z")],
    ]);
    const result = await fetchSession({ user: "Gloup", window }, { fetchPage });
    expect(result.pagesFetched).toBe(1);
    expect(result.stopReason).toBe("hors-fenetre");
  });

  test("s'arrete quand une page n'apporte aucun uuid nouveau", async () => {
    // Le cas reel du clamp : page=999 renvoie la derniere page, pas du vide.
    const { fetchPage } = stubPages([[battle("seul", "2026-08-19T15:00:00Z")]]);
    const result = await fetchSession({ user: "Gloup", window }, { fetchPage });
    expect(result.pagesFetched).toBe(2);
    expect(result.stopReason).toBe("page-deja-vue");
  });

  test("s'arrete sur une page vide", async () => {
    const { fetchPage } = stubPages([[battle("a", "2026-08-19T15:00:00Z")], []]);
    const result = await fetchSession({ user: "Gloup", window }, { fetchPage });
    expect(result.pagesFetched).toBe(2);
    expect(result.stopReason).toBe("page-vide");
  });

  test("respecte le plafond de pages", async () => {
    // Chaque page apporte un uuid nouveau encore dans la fenetre : sans
    // plafond, la boucle ne s'arreterait jamais.
    let n = 0;
    const fetchPage = async () => {
      n += 1;
      return [battle(`b${n}`, "2026-08-19T15:00:00Z")];
    };
    const result = await fetchSession(
      { user: "Gloup", window, maxPages: 3 },
      { fetchPage },
    );
    expect(result.pagesFetched).toBe(3);
    expect(result.stopReason).toBe("plafond-pages");
  });

  test("dedoublonne les matchs vus sur plusieurs pages", async () => {
    const { fetchPage } = stubPages([
      [battle("double", "2026-08-19T15:00:00Z"), battle("neuf", "2026-08-19T14:30:00Z")],
      [battle("double", "2026-08-19T15:00:00Z"), battle("autre", "2026-08-19T14:20:00Z")],
    ]);
    const result = await fetchSession({ user: "Gloup", window }, { fetchPage });
    expect(result.battles.map((b) => b.uuid)).toEqual(["autre", "neuf", "double"]);
  });

  test("ignore un match sans horodatage de debut", async () => {
    const orphan = { ...battle("sans-date", "2026-08-19T15:00:00Z"), start_at: null };
    const { fetchPage } = stubPages([[orphan, battle("ok", "2026-08-19T15:00:00Z")]]);
    const result = await fetchSession({ user: "Gloup", window }, { fetchPage });
    expect(result.battles.map((b) => b.uuid)).toEqual(["ok"]);
  });

  test("renvoie une session vide sans echouer quand rien ne correspond", async () => {
    const { fetchPage } = stubPages([[battle("ailleurs", "2026-08-19T22:00:00Z")]]);
    const result = await fetchSession({ user: "Gloup", window }, { fetchPage });
    expect(result.battles).toEqual([]);
  });
});
