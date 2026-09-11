import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { StatinkBattle } from "../src/statink/types.ts";
import { buildWindow, isWithinWindow } from "../src/window.ts";

/**
 * Extrait reel et non modifie de /@Gloup/spl3/index.json.
 * Ce test garde le contrat que le code suppose du payload de stat.ink : s'il
 * casse, c'est stat.ink qui a change, pas notre logique.
 */
const battles: StatinkBattle[] = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("./fixtures/battles-page1.json", import.meta.url)),
    "utf8",
  ),
);

describe("payload reel de stat.ink", () => {
  test("les matchs arrivent du plus recent au plus ancien", () => {
    const times = battles.map((b) => b.start_at!.time);
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  test("chaque match porte un uuid, utilise comme cle de deduplication", () => {
    const uuids = battles.map((b) => b.uuid);
    expect(uuids.every((uuid) => typeof uuid === "string" && uuid.length > 0)).toBe(true);
    expect(new Set(uuids).size).toBe(uuids.length);
  });

  test("start_at.time est un epoch en secondes coherent avec iso8601", () => {
    for (const battle of battles) {
      expect(battle.start_at!.time * 1000).toBe(Date.parse(battle.start_at!.iso8601));
    }
  });

  test("chaque match contient bien les 8 joueurs", () => {
    for (const battle of battles) {
      expect(battle.our_team_members).toHaveLength(4);
      expect(battle.their_team_members).toHaveLength(4);
    }
  });

  test("exactement un joueur de notre equipe est marque comme etant soi", () => {
    for (const battle of battles) {
      expect(battle.our_team_members!.filter((m) => m.me)).toHaveLength(1);
    }
  });

  test("chaque joueur porte une arme avec son sub et son special", () => {
    for (const battle of battles) {
      for (const member of [...battle.our_team_members!, ...battle.their_team_members!]) {
        expect(member.weapon?.key).toBeTypeOf("string");
        expect(member.weapon?.sub?.key).toBeTypeOf("string");
        expect(member.weapon?.special?.key).toBeTypeOf("string");
      }
    }
  });

  test("le lobby private identifie les matchs de club", () => {
    const privates = battles.filter((b) => b.lobby?.key === "private");
    expect(privates.length).toBeGreaterThan(0);
  });

  test("la fenetre de verification du plan isole les 2 matchs attendus", () => {
    // Les deux matchs ont commence a 13:41:13Z et 13:48:50Z, soit 15:41 et
    // 15:48 heure de Paris : c'est en heure locale que la CLI raisonne.
    const window = buildWindow("2026-08-19 15:30", "2026-08-19 16:00");
    const inWindow = battles.filter((b) => isWithinWindow(b.start_at!.time, window));
    expect(inWindow.map((b) => b.start_at!.iso8601)).toEqual([
      "2026-08-19T13:48:50+00:00",
      "2026-08-19T13:41:13+00:00",
    ]);
  });
});
