import { describe, expect, test } from "vitest";
import { sectionRole } from "../../../src/report/sections/role.ts";
import { analyse, joueur, manche, texte } from "./analyseFactice.ts";

const moi = joueur({ nom: "☆Gloųp☆", moi: true, kill: 36, assist: 73, death: 78, special: 67, manches: 13 });
const Ombre = joueur({ nom: "Ombre", kill: 147, assist: 27, death: 112, special: 42, manches: 13 });
const bloup = joueur({ nom: "Ressac", kill: 90, assist: 35, death: 88, special: 43, manches: 13 });
const oxy = joueur({ nom: "Récif", kill: 54, assist: 43, death: 65, special: 84, manches: 13 });

const session = analyse({ manches: [manche()], moi, equipe: [Ombre, bloup, oxy, moi] });

describe("sectionRole", () => {
  test("ne rend rien quand aucun joueur n'est identifie", () => {
    expect(sectionRole(analyse({ manches: [manche()] }))).toEqual([]);
  });

  test("rapporte chaque indicateur a la part de l'equipe", () => {
    const rendu = texte(sectionRole(session));

    // 73 assistances sur 178 pour l'equipe, 36 eliminations sur 327.
    expect(rendu).toContain("Assistances      73   5,6  41 %");
    expect(rendu).toContain("Éliminations     36   2,8  11 %");
  });

  test("calcule le repere de contribution egale au lieu de le supposer a 25 %", () => {
    // Quatre joueurs a treize manches chacun : ma part neutre vaut bien 25 %.
    expect(texte(sectionRole(session))).toContain("part attendue de 25 %");
  });

  test("deplace ce repere quand la composition a tourne", () => {
    const remplacant = joueur({ nom: "remplaçant", manches: 3, kill: 5, assist: 5 });
    const rendu = texte(
      sectionRole(
        analyse({ manches: [manche()], moi, equipe: [Ombre, bloup, oxy, moi, remplacant] }),
      ),
    );

    // 13 manches sur 55 jouees par l'equipe : 24 %, plus 25 %.
    expect(rendu).toContain("part attendue de 24 %");
  });

  test("annonce l'ecart a la part attendue avant les chiffres qu'il explique", () => {
    // 73 assistances sur 178 et 36 eliminations sur 327, pour une part
    // attendue de 25 % : le repere doit suivre les deux chiffres, sinon ils
    // ne veulent rien dire.
    expect(texte(sectionRole(session))).toContain(
      "**41 % des assistances de l'équipe, 11 % de ses éliminations** — pour une part attendue de 25 %.",
    );
  });

  test("situe mon rendement dans l'equipe", () => {
    expect(texte(sectionRole(session))).toContain("**1,40** — 4ᵉ des 4 joueurs");
  });

  test("ne me classe que parmi ceux qui ont fait la session", () => {
    // Trois remplacants d'une manche ne doivent pas me faire « 4e sur 7 ».
    const treizeManches = Array.from({ length: 13 }, () => manche());
    const passants = [1, 2, 3].map((n) =>
      joueur({ nom: `passant ${n}`, manches: 1, kill: 99, death: 1 }),
    );
    const rendu = texte(
      sectionRole(
        analyse({
          manches: treizeManches,
          moi,
          equipe: [Ombre, bloup, oxy, moi, ...passants],
        }),
      ),
    );

    expect(rendu).toContain("4ᵉ des 4 joueurs présents sur toute la session");
  });

  test("dit combien de coequipiers meurent davantage, contre le ressenti", () => {
    const rendu = texte(sectionRole(session));

    expect(rendu).toContain("Je meurs 78 fois — 2 coéquipiers meurent davantage");
  });

  test("se tait sur les morts quand je suis bien celui qui meurt le plus", () => {
    const plusMort = joueur({ nom: "moi", moi: true, kill: 1, death: 99 });
    const rendu = texte(
      sectionRole(analyse({ manches: [manche()], moi: plusMort, equipe: [plusMort, Ombre] })),
    );

    expect(rendu).not.toContain("meurent davantage");
  });

  test("cite les medailles les plus frequentes", () => {
    const rendu = texte(
      sectionRole(
        analyse({
          manches: [manche()],
          moi,
          equipe: [moi],
          medailles: [{ libelle: "№ 1 du coup de main", nombre: 5 }],
        }),
      ),
    );

    expect(rendu).toContain("№ 1 du coup de main ×5");
  });

  test("ne cite aucune medaille quand il n'y en a pas", () => {
    expect(texte(sectionRole(session))).not.toContain("Médailles");
  });

  test("ne divise pas par zero pour un joueur qui n'est jamais mort", () => {
    const invincible = joueur({ nom: "moi", moi: true, kill: 5, assist: 2, death: 0 });
    const rendu = texte(
      sectionRole(analyse({ manches: [manche()], moi: invincible, equipe: [invincible] })),
    );

    expect(rendu).toContain("—");
    expect(rendu).not.toContain("NaN");
    expect(rendu).not.toContain("Infinity");
  });
});
