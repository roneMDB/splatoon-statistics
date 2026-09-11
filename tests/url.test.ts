import { describe, expect, test } from "vitest";
import { buildBattleListUrl } from "../src/statink/url.ts";

describe("buildBattleListUrl", () => {
  test("cible index.json du journal Splatoon 3 de l'utilisateur", () => {
    const url = new URL(buildBattleListUrl({ user: "Gloup", page: 1 }));
    expect(url.origin).toBe("https://stat.ink");
    expect(url.pathname).toBe("/@Gloup/spl3/index.json");
  });

  test("n'ajoute aucun parametre de filtre quand aucun n'est fourni", () => {
    const url = new URL(buildBattleListUrl({ user: "Gloup", page: 1 }));
    expect(url.searchParams.get("page")).toBe("1");
    expect([...url.searchParams.keys()]).toEqual(["page"]);
  });

  test("transmet le numero de page", () => {
    const url = new URL(buildBattleListUrl({ user: "Gloup", page: 3 }));
    expect(url.searchParams.get("page")).toBe("3");
  });

  test("encode le filtre de lobby sous la cle f[lobby]", () => {
    const url = new URL(
      buildBattleListUrl({ user: "Gloup", page: 1, filters: { lobby: "private" } }),
    );
    expect(url.searchParams.get("f[lobby]")).toBe("private");
  });

  test("ajoute f[term]=term des qu'une borne temporelle est fournie", () => {
    const url = new URL(
      buildBattleListUrl({
        user: "Gloup",
        page: 1,
        filters: { termFrom: "2026-08-19 20:00:00", termTo: "2026-08-19 23:30:00" },
      }),
    );
    expect(url.searchParams.get("f[term]")).toBe("term");
    expect(url.searchParams.get("f[term_from]")).toBe("2026-08-19 20:00:00");
    expect(url.searchParams.get("f[term_to]")).toBe("2026-08-19 23:30:00");
  });

  test("n'ajoute pas f[term] sans borne temporelle", () => {
    const url = new URL(
      buildBattleListUrl({ user: "Gloup", page: 1, filters: { lobby: "private" } }),
    );
    expect(url.searchParams.has("f[term]")).toBe(false);
  });

  test("echappe les crochets et l'espace dans la query", () => {
    const raw = buildBattleListUrl({
      user: "Gloup",
      page: 1,
      filters: { termFrom: "2026-08-19 20:00:00" },
    });
    expect(raw).toContain("f%5Bterm_from%5D=2026-08-19+20%3A00%3A00");
    expect(raw).not.toContain("f[term_from]=");
  });

  test("echappe un pseudo contenant des caracteres speciaux", () => {
    const url = new URL(buildBattleListUrl({ user: "a b/c", page: 1 }));
    expect(url.pathname).toBe("/@a%20b%2Fc/spl3/index.json");
  });

  test("ignore les filtres a undefined", () => {
    const url = new URL(
      buildBattleListUrl({
        user: "Gloup",
        page: 1,
        filters: { lobby: undefined, rule: "area" },
      }),
    );
    expect(url.searchParams.has("f[lobby]")).toBe(false);
    expect(url.searchParams.get("f[rule]")).toBe("area");
  });

  test("refuse un numero de page invalide", () => {
    expect(() => buildBattleListUrl({ user: "Gloup", page: 0 })).toThrow(/page/i);
  });

  test("refuse un pseudo vide", () => {
    expect(() => buildBattleListUrl({ user: "  ", page: 1 })).toThrow(/pseudo/i);
  });
});
