import { describe, expect, test } from "vitest";
import { sectionModes } from "../../../src/report/sections/modes.ts";
import {
  MEILLEUR_MODE_MANCHES,
  MODE_EN_ECHEC_STAGES,
} from "../../../src/report/seuils.ts";
import type { AgregatMode } from "../../../src/report/analyse.ts";
import { analyse, texte } from "./analyseFactice.ts";

const mode = (partiel: Partial<AgregatMode> & { libelle: string }): AgregatMode => ({
  manches: 1,
  victoires: 0,
  defaites: 0,
  kill: 0,
  assist: 0,
  death: 0,
  special: 0,
  stages: ["Marché Grefin"],
  ...partiel,
});

describe("sectionModes", () => {
  test("ne rend rien pour une session sans mode", () => {
    expect(sectionModes(analyse())).toEqual([]);
  });

  test("classe les modes du meilleur bilan au pire", () => {
    const rendu = sectionModes(
      analyse({
        parMode: [
          mode({ libelle: "Défense de zone", manches: 4, defaites: 4 }),
          mode({ libelle: "Expédition risquée", manches: 3, victoires: 2, defaites: 1 }),
        ],
      }),
    );

    const zone = rendu.findIndex((ligne) => ligne.includes("Défense de zone"));
    const risquee = rendu.findIndex((ligne) => ligne.includes("Expédition risquée"));
    expect(risquee).toBeLessThan(zone);
  });
});

describe("sectionModes — mode en echec", () => {
  test("conclut que c'est le mode quand plusieurs cartes sont perdues", () => {
    const rendu = texte(
      sectionModes(
        analyse({
          parMode: [
            mode({
              libelle: "Défense de zone",
              manches: 4,
              defaites: 4,
              stages: ["Marché Grefin", "Chaland Flétan"],
            }),
          ],
        }),
      ),
    );

    expect(rendu).toContain("Ce n'est donc pas la carte, c'est le mode");
  });

  test("s'abstient de conclure sur une seule carte", () => {
    // Deux defaites sur la meme carte peuvent tenir a la carte : on ne tranche pas.
    const rendu = texte(
      sectionModes(
        analyse({
          parMode: [
            mode({ libelle: "Défense de zone", manches: 4, defaites: 4, stages: ["Marché Grefin"] }),
          ],
        }),
      ),
    );

    expect(rendu).not.toContain("c'est le mode");
    expect(MODE_EN_ECHEC_STAGES).toBe(2);
  });

  test("s'abstient sur une seule manche perdue", () => {
    const rendu = texte(
      sectionModes(
        analyse({
          parMode: [
            mode({
              libelle: "Défense de zone",
              manches: 1,
              defaites: 1,
              stages: ["Marché Grefin", "Chaland Flétan"],
            }),
          ],
        }),
      ),
    );

    expect(rendu).not.toContain("c'est le mode");
  });
});

describe("sectionModes — point fort", () => {
  test("ne sacre pas un mode joue une seule fois", () => {
    const rendu = texte(
      sectionModes(
        analyse({
          parMode: [
            mode({ libelle: "Guerre de territoire", manches: 1, victoires: 1 }),
            mode({ libelle: "Expédition risquée", manches: 3, victoires: 2, defaites: 1 }),
          ],
        }),
      ),
    );

    expect(rendu).toContain("**Expédition risquée** est le mode qui nous a tenus");
    expect(rendu).not.toContain("**Guerre de territoire** est le mode");
    expect(MEILLEUR_MODE_MANCHES).toBe(2);
  });

  test("ne designe aucun point fort quand aucun mode n'est positif", () => {
    const rendu = texte(
      sectionModes(
        analyse({ parMode: [mode({ libelle: "Défense de zone", manches: 4, defaites: 4 })] }),
      ),
    );

    expect(rendu).not.toContain("nous a tenus");
  });
});
