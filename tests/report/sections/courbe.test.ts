import { describe, expect, test } from "vitest";
import { sectionCourbe } from "../../../src/report/sections/courbe.ts";
import {
  BAISSE_DE_REGIME_RELATIVE,
  DEFAITE_SERREE_ECART,
  MANCHE_COURTE_SECONDES,
  SERIE_FINALE_MINIMALE,
} from "../../../src/report/seuils.ts";
import { analyse, manche, texte } from "./analyseFactice.ts";

describe("sectionCourbe", () => {
  test("ne rend rien pour une session sans manche", () => {
    expect(sectionCourbe(analyse())).toEqual([]);
  });

  test("dessine la suite des resultats", () => {
    const rendu = texte(
      sectionCourbe(
        analyse({
          manches: [
            manche({ resultat: "win" }),
            manche({ resultat: "lose" }),
            manche({ resultat: "draw" }),
          ],
        }),
      ),
    );

    expect(rendu).toContain("✅ ❌ ➖");
  });
});

describe("sectionCourbe — seuil de decrochage", () => {
  const sessionAvecSerieFinale = (defaites: number) =>
    analyse({
      manches: [
        manche({ resultat: "win" }),
        ...Array.from({ length: defaites }, () => manche({ resultat: "lose", heure: "22:21" })),
      ],
      serieFinaleDefaites: defaites,
    });

  test("signale le decrochage au seuil", () => {
    const rendu = texte(sectionCourbe(sessionAvecSerieFinale(SERIE_FINALE_MINIMALE)));

    expect(rendu).toContain("décroche");
    expect(rendu).toContain(`${SERIE_FINALE_MINIMALE} défaites d'affilée`);
  });

  test("se tait juste sous le seuil", () => {
    const rendu = texte(sectionCourbe(sessionAvecSerieFinale(SERIE_FINALE_MINIMALE - 1)));

    expect(rendu).not.toContain("décroche");
  });
});

describe("sectionCourbe — KO", () => {
  test("compte les KO subis et infliges", () => {
    const rendu = texte(
      sectionCourbe(analyse({ manches: [manche()], koSubis: 3, koInfliges: 0 })),
    );

    expect(rendu).toContain("3 KO subis pour 0 infligé");
  });

  test("ne dit rien des KO quand il n'y en a eu aucun", () => {
    const rendu = texte(sectionCourbe(analyse({ manches: [manche()] })));

    expect(rendu).not.toContain("KO");
  });
});

describe("sectionCourbe — manches ecrasees", () => {
  test("signale une defaite expeditive", () => {
    const rendu = texte(
      sectionCourbe(
        analyse({
          manches: [manche({ resultat: "lose", dureeSecondes: MANCHE_COURTE_SECONDES - 1 })],
        }),
      ),
    );

    expect(rendu).toContain("la mise en place");
  });

  test("ignore une manche courte qui a ete gagnee", () => {
    // Une victoire par KO est courte elle aussi : ce n'est pas le meme fait.
    const rendu = texte(
      sectionCourbe(
        analyse({
          manches: [manche({ resultat: "win", dureeSecondes: 60 })],
        }),
      ),
    );

    expect(rendu).not.toContain("la mise en place");
  });

  test("se tait pour une defaite de duree normale", () => {
    const rendu = texte(
      sectionCourbe(
        analyse({
          manches: [manche({ resultat: "lose", dureeSecondes: MANCHE_COURTE_SECONDES })],
        }),
      ),
    );

    expect(rendu).not.toContain("la mise en place");
  });
});

describe("sectionCourbe — defaites serrees", () => {
  test("signale une defaite dans la marge", () => {
    const rendu = texte(
      sectionCourbe(
        analyse({
          manches: [
            manche({
              resultat: "lose",
              mode: "Expédition risquée",
              score: { nous: 94, eux: 94 + DEFAITE_SERREE_ECART, unite: "pts" },
            }),
          ],
        }),
      ),
    );

    expect(rendu).toContain("défaite serrée");
  });

  test("se tait juste au-dela de la marge", () => {
    const rendu = texte(
      sectionCourbe(
        analyse({
          manches: [
            manche({
              resultat: "lose",
              score: { nous: 94, eux: 94 + DEFAITE_SERREE_ECART + 1, unite: "pts" },
            }),
          ],
        }),
      ),
    );

    expect(rendu).not.toContain("serrée");
  });
});

describe("sectionCourbe — baisse de regime", () => {
  const avecKills = (debut: number, fin: number) =>
    analyse({
      manches: [
        manche({ moi: { kill: debut, assist: 0, death: 0, special: 0, inked: 0 } }),
        manche({ moi: { kill: fin, assist: 0, death: 0, special: 0, inked: 0 } }),
      ],
    });

  test("signale une chute au-dela du seuil", () => {
    const rendu = texte(sectionCourbe(avecKills(10, 10 * (1 - BAISSE_DE_REGIME_RELATIVE))));

    expect(rendu).toContain("éliminations par manche passent");
  });

  test("se tait pour une variation sous le seuil", () => {
    const rendu = texte(sectionCourbe(avecKills(10, 9)));

    expect(rendu).not.toContain("éliminations par manche passent");
  });

  test("se tait quand je ne figure dans aucune manche", () => {
    const rendu = texte(sectionCourbe(analyse({ manches: [manche(), manche()] })));

    expect(rendu).not.toContain("éliminations par manche passent");
  });
});
