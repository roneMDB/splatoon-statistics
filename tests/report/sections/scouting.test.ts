import { describe, expect, test } from "vitest";
import { sectionScouting } from "../../../src/report/sections/scouting.ts";
import { analyse, joueur, manche, texte } from "./analyseFactice.ts";

const octobrush = joueur({
  nom: "Marée",
  kill: 114,
  death: 77,
  manches: 13,
  armes: [{ nom: "Cometz Octobrush", manches: 13 }],
});

const versatile = joueur({
  nom: "Écume",
  kill: 55,
  death: 60,
  manches: 13,
  armes: [
    { nom: "Neo Splash-o-matic", manches: 3 },
    { nom: "Snipewriter 5H", manches: 2 },
    { nom: "Custom E-liter 4K", manches: 2 },
  ],
});

const treizeManches = Array.from({ length: 13 }, () => manche());

describe("sectionScouting", () => {
  test("ne rend rien sans equipe adverse", () => {
    expect(sectionScouting(analyse({ manches: [manche()] }))).toEqual([]);
  });

  test("ne nomme jamais un adversaire par son pseudo", () => {
    const rendu = texte(
      sectionScouting(analyse({ manches: treizeManches, adverse: [octobrush, versatile] })),
    );

    expect(rendu).not.toContain("Marée");
    expect(rendu).not.toContain("Écume");
    expect(rendu).toContain("Cometz Octobrush");
  });

  test("designe le plus dangereux comme menace principale", () => {
    const rendu = texte(
      sectionScouting(analyse({ manches: treizeManches, adverse: [octobrush, versatile] })),
    );

    expect(rendu).toContain("Menace principale : Cometz Octobrush");
  });

  test("numerote deux adversaires que la meme arme rendrait indistinguables", () => {
    const jumeau = joueur({
      nom: "autre",
      kill: 10,
      manches: 13,
      armes: [{ nom: "Cometz Octobrush", manches: 13 }],
    });
    const rendu = texte(
      sectionScouting(analyse({ manches: treizeManches, adverse: [octobrush, jumeau] })),
    );

    expect(rendu).toContain("Cometz Octobrush (1)");
    expect(rendu).toContain("Cometz Octobrush (2)");
  });

  test("signale le joueur qui n'a jamais change d'arme", () => {
    const rendu = texte(sectionScouting(analyse({ manches: treizeManches, adverse: [octobrush] })));

    expect(rendu).toContain("une seule arme sur toute la session");
  });

  test("ne signale pas de mono-arme quand le joueur n'a pas fait toute la session", () => {
    const remplacant = joueur({
      nom: "remplacant",
      manches: 2,
      armes: [{ nom: "Splattershot", manches: 2 }],
    });
    const rendu = texte(
      sectionScouting(analyse({ manches: treizeManches, adverse: [remplacant] })),
    );

    expect(rendu).not.toContain("une seule arme sur toute la session");
  });

  test("ne parle pas de mono-arme sur une session d'une seule manche", () => {
    const rendu = texte(sectionScouting(analyse({ manches: [manche()], adverse: [joueur({ nom: "a" })] })));

    expect(rendu).not.toContain("une seule arme");
  });

  test("ne tabule pas les joueurs de passage", () => {
    const passant = joueur({
      nom: "passant",
      kill: 4,
      manches: 2,
      armes: [{ nom: "Splat Roller", manches: 2 }],
    });
    const rendu = texte(
      sectionScouting(analyse({ manches: treizeManches, adverse: [octobrush, passant] })),
    );

    expect(rendu).toContain("1 autre joueur est passé en face");
    expect(rendu).toContain("Cometz Octobrush");
    expect(rendu).not.toContain("Splat Roller");
  });

  test("ne rend rien quand personne d'en face n'a fait la session", () => {
    const passant = joueur({ nom: "passant", manches: 1 });

    expect(sectionScouting(analyse({ manches: treizeManches, adverse: [passant] }))).toEqual([]);
  });

  test("signale celui qui a tourne sur plus de deux armes", () => {
    const rendu = texte(sectionScouting(analyse({ manches: treizeManches, adverse: [versatile] })));

    expect(rendu).toContain("a tourné sur 3 armes");
  });

  test("se tait sur la versatilite en deca de trois armes", () => {
    const deuxArmes = joueur({
      nom: "Silex",
      armes: [
        { nom: "Splattershot Jr.", manches: 7 },
        { nom: ".52 Gal", manches: 6 },
      ],
    });
    const rendu = texte(sectionScouting(analyse({ manches: treizeManches, adverse: [deuxArmes] })));

    expect(rendu).not.toContain("a tourné sur");
  });
});
