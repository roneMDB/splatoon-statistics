import { describe, expect, test } from "vitest";
import { fetchBattlePage } from "../src/statink/client.ts";
import { DEFAULT_USER } from "../src/config.ts";

/**
 * Appelle reellement stat.ink. Ignore par defaut pour que la suite reste
 * hors-ligne et rapide ; activer avec STATINK_INTEGRATION=1.
 */
const enabled = process.env["STATINK_INTEGRATION"] === "1";

describe.skipIf(!enabled)("stat.ink en vrai", () => {
  test("renvoie des matchs au format attendu", async () => {
    const battles = await fetchBattlePage({ user: DEFAULT_USER, page: 1 });

    expect(battles.length).toBeGreaterThan(0);
    const battle = battles[0]!;
    expect(battle.uuid).toBeTypeOf("string");
    expect(battle.start_at?.time).toBeTypeOf("number");
    // L'epoch est bien en secondes : en millisecondes on serait en l'an 56000.
    expect(battle.start_at!.time * 1000).toBe(Date.parse(battle.start_at!.iso8601));
    expect(battle.our_team_members).toHaveLength(4);
    expect(battle.their_team_members).toHaveLength(4);
  }, 30_000);

  test("le filtre f[lobby]=private ne renvoie que des matchs prives", async () => {
    const battles = await fetchBattlePage({
      user: DEFAULT_USER,
      page: 1,
      filters: { lobby: "private" },
    });

    expect(battles.length).toBeGreaterThan(0);
    expect(battles.every((b) => b.lobby?.key === "private")).toBe(true);
  }, 30_000);

  test("un compte inexistant est signale clairement", async () => {
    await expect(
      fetchBattlePage({ user: "compte-qui-nexiste-vraiment-pas-12345", page: 1 }),
    ).rejects.toThrow(/public|inconnu/i);
  }, 30_000);
});
