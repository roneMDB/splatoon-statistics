import { describe, expect, test } from "vitest";
import { tableau } from "../../src/report/format.ts";

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
