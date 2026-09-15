import { describe, expect, test } from "vitest";
import { tableau } from "../../src/report/format.ts";
import type { SessionFile } from "../../src/store.ts";
import { bilanDeSession, jourEtMois, titreDeSession } from "../../src/report/format.ts";
import { analyse } from "./sections/analyseFactice.ts";

describe("tableau", () => {
  test("rend un bloc de code, pas un tableau Markdown", () => {
    // Discord n'affiche pas les tableaux Markdown : il en montre les barres
    // verticales telles quelles. Ce document n'existe que pour y etre colle.
    const rendu = tableau(["A", "B"], [["1", "2"]]);

    expect(rendu[0]).toBe("```");
    expect(rendu[rendu.length - 1]).toBe("```");
    expect(rendu.join("\n")).not.toContain("|");
  });

  test("aligne les colonnes sur la cellule la plus large", () => {
    const rendu = tableau(
      ["Mode", "Bilan"],
      [
        ["Guerre de Territoire", "1V-0D"],
        ["Défense de Zone", "0V-4D"],
      ],
    );

    expect(rendu[1]).toBe("Mode                  Bilan");
    expect(rendu[2]).toBe("Guerre de Territoire  1V-0D");
    expect(rendu[3]).toBe("Défense de Zone       0V-4D");
  });

  test("aligne les nombres a droite et les libelles a gauche", () => {
    const rendu = tableau(
      ["Indicateur", "Total"],
      [
        ["Éliminations", "36"],
        ["Morts", "7"],
      ],
    );

    expect(rendu[2]).toBe("Éliminations     36");
    expect(rendu[3]).toBe("Morts             7");
  });

  test("traite « 41 % », « 2,8 » et « 9/20/25 » comme des nombres", () => {
    const rendu = tableau(
      ["X", "Part", "Moy.", "Ratio"],
      [
        ["a", "41 %", "2,8", "9/20/25"],
        ["b", "5 %", "10,0", "1/2/3"],
      ],
    );

    // Alignes a droite : la colonne la plus courte est decalee.
    expect(rendu[2]).toBe("a  41 %   2,8  9/20/25");
    expect(rendu[3]).toBe("b   5 %  10,0    1/2/3");
  });

  test("bascule une colonne a gauche des qu'une seule cellule est textuelle", () => {
    const rendu = tableau(
      ["X", "Valeur"],
      [
        ["a", "12"],
        ["b", "n/a mesuré"],
      ],
    );

    expect(rendu[2]).toBe("a  12");
  });

  test("ne laisse pas d'espaces en fin de ligne", () => {
    const rendu = tableau(
      ["Mode", "Cartes"],
      [
        ["Défense de Zone", "Marché Grefin, Chaland Flétan"],
        ["Guerre de Territoire", "Pont Esturgeon"],
      ],
    );

    for (const ligne of rendu) expect(ligne).toBe(ligne.trimEnd());
  });

  test("ne rend rien du tout plutot qu'un bloc de code vide", () => {
    expect(tableau(["A", "B"], [])).toEqual([]);
  });
});

const fichierFactice = (from: string): SessionFile =>
  ({
    source: "stat.ink",
    user: "Gloup",
    fetchedAt: "2026-08-04T22:00:00Z",
    window: { from, to: from },
    filters: {},
    battleCount: 0,
    battles: [],
  }) as SessionFile;

describe("jourEtMois", () => {
  test("rend le jour et le mois a la francaise", () => {
    expect(jourEtMois("2026-08-04T19:00:00Z")).toBe("04/08");
  });

  test("ne casse pas sur une date illisible", () => {
    expect(jourEtMois("pas une date")).toBe("date inconnue");
  });
});

describe("titreDeSession", () => {
  test("capitalise le type et ajoute le nom", () => {
    const titre = titreDeSession(
      fichierFactice("2026-08-04T19:00:00Z"),
      analyse({ type: "intra", nom: "Équipe O" }),
    );
    expect(titre).toBe("Intra du 04/08 — Équipe O");
  });

  test("retombe sur « Session » sans type, et se passe du nom", () => {
    const titre = titreDeSession(fichierFactice("2026-08-04T19:00:00Z"), analyse());
    expect(titre).toBe("Session du 04/08");
  });
});

describe("bilanDeSession", () => {
  test("enumere victoires, manches et temps de jeu, sans mise en forme", () => {
    const parts = bilanDeSession(
      analyse({
        bilan: { victoires: 7, defaites: 6, nuls: 0, total: 13 },
        tempsDeJeuMinutes: 95,
      }),
    );
    expect(parts).toEqual(["7V - 6D", "13 manches", "95 min de jeu"]);
  });

  test("n'annonce les nuls que s'il y en a, et tait un temps de jeu nul", () => {
    const parts = bilanDeSession(
      analyse({
        bilan: { victoires: 1, defaites: 0, nuls: 2, total: 3 },
        tempsDeJeuMinutes: 0,
      }),
    );
    expect(parts).toEqual(["1V - 0D", "2 nuls", "3 manches"]);
  });
});
