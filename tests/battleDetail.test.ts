import { describe, expect, test } from "vitest";
import { toBattleDetail } from "../src/battleDetail.ts";
import type { StatinkBattle, StatinkTeamMember } from "../src/statink/types.ts";

const membre = (partiel: Partial<StatinkTeamMember> = {}): StatinkTeamMember =>
  ({
    me: false,
    name: "Quelquun",
    number: "1234",
    splashtag_title: null,
    rank_in_team: 1,
    weapon: { key: "nzap85", name: { en_US: "N-ZAP '85" } },
    kill: 3,
    assist: 13,
    death: 7,
    special: 6,
    inked: 1525,
    disconnected: false,
    gears: {
      headgear: {
        primary_ability: { key: "special_charge_up", name: { en_US: "Special Charge Up" } },
        secondary_abilities: [
          { key: "special_power_up", name: { en_US: "Special Power Up" } },
          null,
        ],
      },
    },
    ...partiel,
  }) as unknown as StatinkTeamMember;

const manche = (partiel: Partial<StatinkBattle> = {}): StatinkBattle =>
  ({
    id: "a",
    uuid: "uuid-1",
    url: "https://stat.ink/@Gloup/spl3/338b0431",
    lobby: { key: "private" },
    rule: { key: "yagura", name: { en_US: "Tower Control" } },
    stage: { key: "zatou", name: { en_US: "MakoMart" } },
    result: "win",
    knockout: false,
    start_at: { time: 1, iso8601: "2026-09-11T19:44:28+00:00" },
    end_at: { time: 2, iso8601: "2026-09-11T19:49:36+00:00" },
    our_team_count: 85,
    their_team_count: 61,
    our_team_percent: null,
    their_team_percent: null,
    medals: ["#1 Popular Target"],
    our_team_members: [membre({ me: true, name: "☆Gloųp☆" })],
    their_team_members: [membre({ name: "Brume" })],
    ...partiel,
  }) as unknown as StatinkBattle;

describe("toBattleDetail — entete", () => {
  test("traduit le mode, la carte et le resultat", () => {
    const detail = toBattleDetail(manche());

    expect(detail.rule).toBe("Expédition Risquée");
    expect(detail.stage).toBe("Supermarché Cétacé");
    expect(detail.resultLabel).toBe("Victoire");
    expect(detail.result).toBe("win");
  });

  test("rend le score et la duree", () => {
    const detail = toBattleDetail(manche());

    expect(detail.score).toEqual({ nous: 85, eux: 61, unite: "pts" });
    expect(detail.dureeSecondes).toBe(308);
  });

  test("lit le score en pourcentage de la guerre de territoire", () => {
    const detail = toBattleDetail(
      manche({
        rule: { key: "nawabari" },
        our_team_count: null,
        their_team_count: null,
        our_team_percent: "47.3",
        their_team_percent: "43.7",
      } as unknown as Partial<StatinkBattle>),
    );

    expect(detail.score).toEqual({ nous: 47.3, eux: 43.7, unite: "%" });
  });

  test("traduit les medailles", () => {
    expect(toBattleDetail(manche()).medailles).toEqual(["Cible privilégiée № 1"]);
  });

  test("signale un KO", () => {
    expect(toBattleDetail(manche({ knockout: true })).ko).toBe(true);
    expect(toBattleDetail(manche()).ko).toBe(false);
  });

  test("reprend le lien stat.ink de la manche", () => {
    expect(toBattleDetail(manche()).url).toBe("https://stat.ink/@Gloup/spl3/338b0431");
  });
});

describe("toBattleDetail — joueurs", () => {
  test("separe les deux equipes", () => {
    const detail = toBattleDetail(manche());

    expect(detail.nous).toHaveLength(1);
    expect(detail.eux).toHaveLength(1);
    expect(detail.nous[0]?.nom).toBe("☆Gloųp☆");
  });

  test("marque le joueur qui est moi", () => {
    const detail = toBattleDetail(manche());

    expect(detail.nous[0]?.moi).toBe(true);
    expect(detail.eux[0]?.moi).toBe(false);
  });

  test("nomme l'arme en francais, l'anglais a cote", () => {
    expect(toBattleDetail(manche()).nous[0]?.arme).toBe("N-ZAP 85 (N-ZAP '85)");
  });

  test("traduit les capacites, la principale en tete", () => {
    expect(toBattleDetail(manche()).nous[0]?.equipement).toEqual([
      { piece: "Tête", capacites: ["Jauge spéciale +", "Arme spéciale +"] },
    ]);
  });

  test("omet une piece d'equipement absente plutot que d'inventer", () => {
    const sansGear = membre({ gears: undefined } as unknown as Partial<StatinkTeamMember>);
    const detail = toBattleDetail(manche({ our_team_members: [sansGear] } as never));

    expect(detail.nous[0]?.equipement).toEqual([]);
  });

  test("signale un joueur deconnecte", () => {
    const deco = membre({ disconnected: true });
    const detail = toBattleDetail(manche({ our_team_members: [deco] } as never));

    expect(detail.nous[0]?.deconnecte).toBe(true);
  });

  test("compte zero pour un joueur dont les statistiques manquent", () => {
    const vide = membre({ kill: null, death: null, assist: null, special: null, inked: null });
    const detail = toBattleDetail(manche({ our_team_members: [vide] } as never));

    expect(detail.nous[0]).toMatchObject({ kill: 0, death: 0, assist: 0, special: 0 });
  });

  test("survit a une manche sans equipe", () => {
    const detail = toBattleDetail(
      manche({ our_team_members: null, their_team_members: null } as never),
    );

    expect(detail.nous).toEqual([]);
    expect(detail.eux).toEqual([]);
  });
});
