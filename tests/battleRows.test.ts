import { describe, expect, test } from "vitest";
import { toBattleRows } from "../src/battleRows.ts";
import type { StatinkBattle } from "../src/statink/types.ts";

const complet = {
  uuid: "a",
  lobby: { key: "private" },
  rule: { key: "yagura" },
  stage: { key: "yagara" },
  result: "win",
  start_at: { time: 1_754_336_668, iso8601: "2026-08-04T19:44:28+00:00" },
} as unknown as StatinkBattle;

describe("toBattleRows", () => {
  test("retient les colonnes affichees, aplaties et traduites", () => {
    expect(toBattleRows([complet])).toEqual([
      {
        uuid: "a",
        startedAt: "2026-08-04T19:44:28+00:00",
        lobby: "private",
        rule: "Expédition Risquée",
        stage: "Marché Grefin",
        result: "win",
        resultLabel: "Victoire",
      },
    ]);
  });

  test("garde le resultat brut a cote du libelle : la fenetre s'en sert pour colorer", () => {
    const [row] = toBattleRows([complet]);

    expect(row?.result).toBe("win");
    expect(row?.resultLabel).toBe("Victoire");
  });

  test("laisse le lobby en cle : c'est un filtre, pas un libelle affiche", () => {
    expect(toBattleRows([complet])[0]?.lobby).toBe("private");
  });

  test("retombe sur l'anglais du payload pour une carte inconnue de la table", () => {
    const futur = {
      ...complet,
      stage: { key: "carte_future", name: { en_US: "Future Stage" } },
    } as unknown as StatinkBattle;

    expect(toBattleRows([futur])[0]?.stage).toBe("Future Stage");
  });

  test("preserve l'ordre recu", () => {
    const second = { ...complet, uuid: "b" } as StatinkBattle;
    expect(toBattleRows([complet, second]).map((row) => row.uuid)).toEqual(["a", "b"]);
  });

  test("omet les champs absents plutot que d'inventer une valeur", () => {
    const nu = { uuid: "vide" } as unknown as StatinkBattle;

    const [row] = toBattleRows([nu]);

    expect(row).toEqual({ uuid: "vide", startedAt: "" });
    expect(Object.keys(row ?? {})).not.toContain("rule");
  });

  test("omet les champs null plutot que d'inventer une valeur", () => {
    const avecNull = {
      uuid: "avec-null",
      result: null,
      lobby: null,
      rule: null,
      stage: null,
      start_at: null,
    } as unknown as StatinkBattle;

    const [row] = toBattleRows([avecNull]);

    expect(row).toEqual({ uuid: "avec-null", startedAt: "" });
    expect(Object.keys(row ?? {})).not.toContain("resultLabel");
    // Object.keys ne comprend que les cles reellement presentes, pas undefined
    expect(Object.keys(row ?? {})).not.toContain("result");
    expect(Object.keys(row ?? {})).not.toContain("lobby");
    expect(Object.keys(row ?? {})).not.toContain("rule");
    expect(Object.keys(row ?? {})).not.toContain("stage");
  });

  test("rend une liste vide pour une session sans match", () => {
    expect(toBattleRows([])).toEqual([]);
  });
});
