import { describe, expect, test } from "vitest";
import { analyseSession } from "../../src/report/analyse.ts";
import type { SessionFile } from "../../src/store.ts";
import type { StatinkBattle, StatinkTeamMember } from "../../src/statink/types.ts";

type ProfilJoueur = {
  nom: string;
  moi?: boolean;
  arme?: string;
  kill?: number;
  assist?: number;
  death?: number;
  special?: number;
  inked?: number;
};

function joueur(profil: ProfilJoueur): StatinkTeamMember {
  return {
    me: profil.moi ?? false,
    name: profil.nom,
    number: "0001",
    splashtag_title: null,
    rank_in_team: 1,
    // Cle derivee du nom : deux armes de test restent distinctes, et aucune ne
    // tombe dans la table de traduction, ce qui garde les libelles previsibles.
    weapon: (() => {
      const nom = profil.arme ?? "Arme de test";
      return { key: `test_${nom.toLowerCase().replace(/\W+/g, "_")}`, name: { en_US: nom } };
    })(),
    kill: profil.kill ?? 0,
    assist: profil.assist ?? 0,
    kill_or_assist: (profil.kill ?? 0) + (profil.assist ?? 0),
    death: profil.death ?? 0,
    special: profil.special ?? 0,
    inked: profil.inked ?? 0,
    disconnected: false,
  } as StatinkTeamMember;
}

type ProfilMatch = {
  debut: string;
  minutes?: number;
  mode?: string;
  stage?: string;
  resultat?: "win" | "lose" | "draw";
  ko?: boolean | null;
  scoreNous?: number | null;
  scoreEux?: number | null;
  pourcentNous?: string | null;
  pourcentEux?: string | null;
  medailles?: string[];
  nous?: StatinkTeamMember[];
  eux?: StatinkTeamMember[];
};

let numero = 0;

function match(profil: ProfilMatch): StatinkBattle {
  const debutMs = Date.parse(profil.debut);
  const finMs = debutMs + (profil.minutes ?? 5) * 60_000;
  const instant = (ms: number) => ({ time: ms / 1000, iso8601: new Date(ms).toISOString() });
  numero += 1;

  return {
    id: `id-${numero}`,
    uuid: `uuid-${numero}`,
    url: "",
    lobby: { key: "private" },
    rule: { key: profil.mode ?? "area", name: { en_US: "Splat Zones" } },
    stage: { key: profil.stage ?? "yagara", name: { en_US: "Hagglefish Market" } },
    result: profil.resultat ?? "win",
    knockout: profil.ko ?? false,
    start_at: instant(debutMs),
    end_at: instant(finMs),
    // `in` plutot que `??` : un null explicite doit rester null, c'est le cas
    // que les modes non-objectif produisent.
    our_team_count: "scoreNous" in profil ? profil.scoreNous : 100,
    their_team_count: "scoreEux" in profil ? profil.scoreEux : 50,
    our_team_percent: profil.pourcentNous ?? null,
    their_team_percent: profil.pourcentEux ?? null,
    medals: profil.medailles ?? [],
    our_team_members: profil.nous ?? [joueur({ nom: "Moi", moi: true })],
    their_team_members: profil.eux ?? [joueur({ nom: "Eux" })],
  } as unknown as StatinkBattle;
}

function session(battles: StatinkBattle[], extra: Partial<SessionFile> = {}): SessionFile {
  return {
    source: "stat.ink",
    user: "Gloup",
    fetchedAt: "2026-09-11T21:30:44.274Z",
    window: { from: "2026-09-11T18:00:00.000Z", to: "2026-09-11T21:01:00.000Z" },
    filters: { lobby: "private" },
    battleCount: battles.length,
    battles,
    ...extra,
  };
}

describe("analyseSession — bilan", () => {
  test("compte victoires, defaites et nuls", () => {
    const analyse = analyseSession(
      session([
        match({ debut: "2026-09-11T19:00:00Z", resultat: "win" }),
        match({ debut: "2026-09-11T19:10:00Z", resultat: "lose" }),
        match({ debut: "2026-09-11T19:20:00Z", resultat: "draw" }),
      ]),
    );

    expect(analyse.bilan).toEqual({ victoires: 1, defaites: 1, nuls: 1, total: 3 });
  });

  test("rend une analyse vide plutot que d'echouer sur une session sans match", () => {
    const analyse = analyseSession(session([]));

    expect(analyse.bilan).toEqual({ victoires: 0, defaites: 0, nuls: 0, total: 0 });
    expect(analyse.manches).toEqual([]);
    expect(analyse.moi).toBeUndefined();
  });

  test("reprend le nom, le type et les champs libres de la session", () => {
    const analyse = analyseSession(
      session([], { name: "Équipe A vs Équipe O", type: "intra", objectif: "Support" }),
    );

    expect(analyse.nom).toBe("Équipe A vs Équipe O");
    expect(analyse.type).toBe("intra");
    expect(analyse.objectif).toBe("Support");
  });
});

describe("analyseSession — moi", () => {
  test("repere le joueur par me:true, pas par le pseudo stat.ink", () => {
    // Le compte stat.ink s'appelle « Gloup », le joueur en jeu « ☆Gloųp☆ ».
    const analyse = analyseSession(
      session([
        match({
          debut: "2026-09-11T19:00:00Z",
          nous: [
            joueur({ nom: "Ombre", kill: 9 }),
            joueur({ nom: "☆Gloųp☆", moi: true, kill: 4, assist: 1, death: 2, special: 4 }),
          ],
        }),
      ]),
    );

    expect(analyse.moi?.nom).toBe("☆Gloųp☆");
    expect(analyse.moi?.kill).toBe(4);
    expect(analyse.moi?.assist).toBe(1);
  });

  test("cumule mes totaux sur toutes les manches", () => {
    const analyse = analyseSession(
      session([
        match({
          debut: "2026-09-11T19:00:00Z",
          nous: [joueur({ nom: "Moi", moi: true, kill: 4, assist: 1, death: 2, special: 4 })],
        }),
        match({
          debut: "2026-09-11T19:10:00Z",
          nous: [joueur({ nom: "Moi", moi: true, kill: 3, assist: 5, death: 8, special: 7 })],
        }),
      ]),
    );

    expect(analyse.moi).toMatchObject({ kill: 7, assist: 6, death: 10, special: 11, manches: 2 });
  });

  test("laisse moi indefini quand aucun joueur n'est marque", () => {
    const analyse = analyseSession(
      session([match({ debut: "2026-09-11T19:00:00Z", nous: [joueur({ nom: "Autre" })] })]),
    );

    expect(analyse.moi).toBeUndefined();
  });
});

describe("analyseSession — scores selon le mode", () => {
  test("lit our_team_percent, une chaine, en guerre de territoire", () => {
    const analyse = analyseSession(
      session([
        match({
          debut: "2026-09-11T19:00:00Z",
          mode: "nawabari",
          ko: null,
          scoreNous: null,
          scoreEux: null,
          pourcentNous: "47.3",
          pourcentEux: "43.7",
        }),
      ]),
    );

    expect(analyse.manches[0]?.score).toEqual({ nous: 47.3, eux: 43.7, unite: "%" });
  });

  test("lit our_team_count, un nombre, dans les modes objectif", () => {
    const analyse = analyseSession(
      session([match({ debut: "2026-09-11T19:00:00Z", scoreNous: 79, scoreEux: 95 })]),
    );

    expect(analyse.manches[0]?.score).toEqual({ nous: 79, eux: 95, unite: "pts" });
  });

  test("omet le score quand les deux champs sont absents", () => {
    const analyse = analyseSession(
      session([match({ debut: "2026-09-11T19:00:00Z", scoreNous: null, scoreEux: null })]),
    );

    expect(analyse.manches[0]?.score).toBeUndefined();
  });
});

describe("analyseSession — chronologie", () => {
  test("mesure la duree de chaque manche et le temps de jeu cumule", () => {
    const analyse = analyseSession(
      session([
        match({ debut: "2026-09-11T19:00:00Z", minutes: 5 }),
        match({ debut: "2026-09-11T19:10:00Z", minutes: 3 }),
      ]),
    );

    expect(analyse.manches.map((m) => m.dureeSecondes)).toEqual([300, 180]);
    expect(analyse.tempsDeJeuMinutes).toBe(8);
  });

  test("compte les KO subis et infliges separement", () => {
    const analyse = analyseSession(
      session([
        match({ debut: "2026-09-11T19:00:00Z", resultat: "lose", ko: true }),
        match({ debut: "2026-09-11T19:10:00Z", resultat: "lose", ko: true }),
        match({ debut: "2026-09-11T19:20:00Z", resultat: "win", ko: true }),
        match({ debut: "2026-09-11T19:30:00Z", resultat: "lose", ko: false }),
      ]),
    );

    expect(analyse.koSubis).toBe(2);
    expect(analyse.koInfliges).toBe(1);
  });

  test("mesure la serie de defaites qui termine la session", () => {
    const analyse = analyseSession(
      session([
        match({ debut: "2026-09-11T19:00:00Z", resultat: "win" }),
        match({ debut: "2026-09-11T19:10:00Z", resultat: "lose" }),
        match({ debut: "2026-09-11T19:20:00Z", resultat: "lose" }),
        match({ debut: "2026-09-11T19:30:00Z", resultat: "lose" }),
      ]),
    );

    expect(analyse.serieFinaleDefaites).toBe(3);
  });

  test("ne voit aucune serie finale quand la session se termine sur une victoire", () => {
    const analyse = analyseSession(
      session([
        match({ debut: "2026-09-11T19:00:00Z", resultat: "lose" }),
        match({ debut: "2026-09-11T19:10:00Z", resultat: "win" }),
      ]),
    );

    expect(analyse.serieFinaleDefaites).toBe(0);
  });

  test("mesure la serie de victoires qui ouvre la session", () => {
    const analyse = analyseSession(
      session([
        match({ debut: "2026-09-11T19:00:00Z", resultat: "win" }),
        match({ debut: "2026-09-11T19:10:00Z", resultat: "win" }),
        match({ debut: "2026-09-11T19:20:00Z", resultat: "lose" }),
      ]),
    );

    expect(analyse.serieInitialeVictoires).toBe(2);
  });
});

describe("analyseSession — agregats", () => {
  test("regroupe par mode en retenant les stages rencontres", () => {
    const analyse = analyseSession(
      session([
        match({ debut: "2026-09-11T19:00:00Z", mode: "area", stage: "yagara", resultat: "lose" }),
        match({ debut: "2026-09-11T19:10:00Z", mode: "area", stage: "ohyo", resultat: "lose" }),
        match({ debut: "2026-09-11T19:20:00Z", mode: "hoko", stage: "kombu", resultat: "win" }),
      ]),
    );

    expect(analyse.parMode).toEqual([
      expect.objectContaining({
        libelle: "Défense de Zone",
        manches: 2,
        victoires: 0,
        defaites: 2,
        stages: ["Marché Grefin", "Chaland Flétan"],
      }),
      // « hoko » est le porteur de bazooka, pas la tour : cf. libelles.fr.ts.
      expect.objectContaining({ libelle: "Mission Bazookarpe", victoires: 1, defaites: 0 }),
    ]);
  });

  test("cumule les statistiques de chaque joueur des deux equipes", () => {
    const analyse = analyseSession(
      session([
        match({
          debut: "2026-09-11T19:00:00Z",
          nous: [joueur({ nom: "Moi", moi: true, kill: 2 }), joueur({ nom: "Mate", kill: 5 })],
          eux: [joueur({ nom: "Adverse", kill: 9, arme: "Octobrush" })],
        }),
        match({
          debut: "2026-09-11T19:10:00Z",
          nous: [joueur({ nom: "Moi", moi: true, kill: 3 }), joueur({ nom: "Mate", kill: 4 })],
          eux: [joueur({ nom: "Adverse", kill: 7, arme: "Octobrush" })],
        }),
      ]),
    );

    expect(analyse.equipe.map((j) => [j.nom, j.kill])).toEqual([
      ["Mate", 9],
      ["Moi", 5],
    ]);
    expect(analyse.adverse[0]).toMatchObject({ nom: "Adverse", kill: 16, manches: 2 });
    expect(analyse.adverse[0]?.armes).toEqual([{ nom: "Octobrush", manches: 2 }]);
  });

  test("classe les armes d'un joueur de la plus jouee a la moins jouee", () => {
    const analyse = analyseSession(
      session([
        match({ debut: "2026-09-11T19:00:00Z", eux: [joueur({ nom: "A", arme: "Splattershot" })] }),
        match({ debut: "2026-09-11T19:10:00Z", eux: [joueur({ nom: "A", arme: "E-liter 4K" })] }),
        match({ debut: "2026-09-11T19:20:00Z", eux: [joueur({ nom: "A", arme: "E-liter 4K" })] }),
      ]),
    );

    expect(analyse.adverse[0]?.armes).toEqual([
      { nom: "E-liter 4K", manches: 2 },
      { nom: "Splattershot", manches: 1 },
    ]);
  });

  test("traduit l'arme et garde l'anglais a cote", () => {
    const avecVraieCle = {
      ...joueur({ nom: "Adverse" }),
      weapon: { key: "nzap85", name: { en_US: "N-ZAP '85" } },
    } as unknown as StatinkTeamMember;
    const analyse = analyseSession(
      session([match({ debut: "2026-09-11T19:00:00Z", eux: [avecVraieCle] })]),
    );

    expect(analyse.adverse[0]?.armes[0]).toEqual({
      nom: "N-ZAP 85",
      anglais: "N-ZAP '85",
      manches: 1,
    });
  });

  test("n'ajoute pas de nom anglais quand il est identique au francais", () => {
    const identique = {
      ...joueur({ nom: "Adverse" }),
      weapon: { key: "nautilus47", name: { en_US: "Nautilus 47" } },
    } as unknown as StatinkTeamMember;
    const analyse = analyseSession(
      session([match({ debut: "2026-09-11T19:00:00Z", eux: [identique] })]),
    );

    expect(analyse.adverse[0]?.armes[0]).toEqual({ nom: "Nautilus 47", manches: 1 });
  });

  test("compte les medailles, traduites, de la plus frequente a la moins", () => {
    const analyse = analyseSession(
      session([
        match({ debut: "2026-09-11T19:00:00Z", medailles: ["#1 Splat Assister", "#1 Turf Inker"] }),
        match({ debut: "2026-09-11T19:10:00Z", medailles: ["#1 Splat Assister"] }),
      ]),
    );

    expect(analyse.medailles).toEqual([
      { libelle: "№ 1 du coup de main", nombre: 2 },
      { libelle: "№ 1 en encrage de territoire", nombre: 1 },
    ]);
  });

  test("survit a un match sans medaille et sans equipe adverse", () => {
    const analyse = analyseSession(
      session([
        {
          ...match({ debut: "2026-09-11T19:00:00Z" }),
          medals: undefined,
          their_team_members: null,
        } as unknown as StatinkBattle,
      ]),
    );

    expect(analyse.medailles).toEqual([]);
    expect(analyse.adverse).toEqual([]);
  });
});
