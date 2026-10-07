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

  test("traduit les abreviations du tableau juste sous lui", () => {
    const lignes = sectionScouting(analyse({ manches: treizeManches, adverse: [octobrush] }));
    const legende = lignes.findIndex((ligne) => ligne.startsWith("Élim. : éliminations"));
    expect(legende).toBeGreaterThan(0);
    expect(lignes[legende - 2]).toBe("```");
    expect(lignes[legende]).toContain("(K+A)/D : éliminations et assistances par mort");
  });

  test("tabule les assistances et les compte dans le ratio", () => {
    const appui = joueur({ nom: "Appui", kill: 10, assist: 6, death: 8, manches: 13 });
    const lignes = sectionScouting(analyse({ manches: treizeManches, adverse: [appui] }));

    const entete = lignes.find((l) => l.startsWith("Joueur")) ?? "";
    expect(entete).toContain("Assist.");
    expect(entete).toContain("(K+A)/D");
    const ligne = lignes.find((l) => l.startsWith("Appui")) ?? "";
    expect(ligne.split(/\s{2,}/)).toEqual(["Appui", "N-ZAP '85", "10", "6", "8", "0", "2,00", "1"]);
  });

  test("nomme les adversaires par leur pseudo, leur arme a cote", () => {
    const lignes = sectionScouting(
      analyse({ manches: treizeManches, adverse: [octobrush, versatile] }),
    );
    const rendu = texte(lignes);

    expect(rendu).toContain("Marée");
    expect(rendu).toContain("Écume");
    const ligneMaree = lignes.find((ligne) => ligne.startsWith("Marée"));
    expect(ligneMaree).toContain("Cometz Octobrush");
  });

  test("designe le plus dangereux comme menace principale", () => {
    const rendu = texte(
      sectionScouting(analyse({ manches: treizeManches, adverse: [octobrush, versatile] })),
    );

    expect(rendu).toContain(
      "Menace principale : Marée** · Cometz Octobrush · 114 éliminations, 0 assistance pour 77 morts.",
    );
  });

  test("designe la menace en comptant les assistances", () => {
    const tueur = joueur({ nom: "Tueur", kill: 30, assist: 2, death: 20, manches: 13 });
    const appui = joueur({ nom: "Appui", kill: 25, assist: 15, death: 20, manches: 13 });
    // L'analyse classe par eliminations seules : Tueur arrive en tete.
    const rendu = texte(
      sectionScouting(analyse({ manches: treizeManches, adverse: [tueur, appui] })),
    );

    expect(rendu).toContain("Menace principale : Appui** · N-ZAP '85 · 25 éliminations, 15 assistances pour 20 morts.");
  });

  test("numerote deux adversaires sans pseudo, qui seraient indistinguables", () => {
    const sansNom = (kill: number) =>
      joueur({ nom: "(sans nom)", kill, manches: 13, armes: [{ nom: "Cometz Octobrush", manches: 13 }] });
    const rendu = texte(
      sectionScouting(analyse({ manches: treizeManches, adverse: [sansNom(20), sansNom(10)] })),
    );

    expect(rendu).toContain("(sans nom) (1)");
    expect(rendu).toContain("(sans nom) (2)");
  });

  test("coiffe la section du nom de l'equipe adverse quand il est saisi", () => {
    const sans = sectionScouting(analyse({ manches: treizeManches, adverse: [octobrush] }));
    const avec = sectionScouting(
      analyse({ manches: treizeManches, adverse: [octobrush], nomEquipeAdverse: "Les Calamars" }),
    );

    expect(sans[0]).toBe("### ⚔️ En face");
    expect(avec[0]).toBe("### ⚔️ En face : Les Calamars");
  });

  test("signale le joueur qui n'a jamais change d'arme", () => {
    const rendu = texte(sectionScouting(analyse({ manches: treizeManches, adverse: [octobrush] })));

    expect(rendu).toContain("Une seule arme sur toute la session");
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

    expect(rendu).not.toContain("Une seule arme sur toute la session");
  });

  test("ne parle pas de mono-arme sur une session d'une seule manche", () => {
    const rendu = texte(sectionScouting(analyse({ manches: [manche()], adverse: [joueur({ nom: "a" })] })));

    expect(rendu).not.toContain("Une seule arme");
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

  test("ouvre sur le bilan des deux camps, joueurs de passage compris", () => {
    const passage = joueur({ nom: "Passage", kill: 1, assist: 2, death: 3, special: 4, manches: 1 });
    const moi = joueur({ nom: "Gloup", moi: true, kill: 20, assist: 10, death: 15, special: 5, manches: 13 });
    const lignes = sectionScouting(
      analyse({
        manches: treizeManches,
        nomEquipe: "Gloup Squad",
        equipe: [moi],
        adverse: [octobrush, passage],
      }),
    );

    expect(lignes[3]?.split(/\s{2,}/)).toEqual(["Équipe", "Élim.", "Assist.", "Morts", "Spé", "(K+A)/D"]);
    expect(lignes[4]?.split(/\s{2,}/)).toEqual(["Gloup Squad", "20", "10", "15", "5", "2,00"]);
    // 114 + 1 elim., 0 + 2 assist., 77 + 3 morts : le joueur de passage compte.
    expect(lignes[5]?.split(/\s{2,}/)).toEqual(["En face", "115", "2", "80", "4", "1,46"]);
    // Mais il n'a pas de ligne dans le tableau par joueur.
    expect(lignes.some((ligne) => ligne.startsWith("Passage"))).toBe(false);
  });
});
