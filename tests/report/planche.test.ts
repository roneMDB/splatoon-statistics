import { describe, expect, test } from "vitest";
import { construisLaPlanche, LARGEUR_PLANCHE } from "../../src/report/planche.ts";
import type { SessionFile } from "../../src/store.ts";
import type { StatinkBattle } from "../../src/statink/types.ts";

/**
 * Une manche complete : deux equipes de deux, un score, des medailles. Deux
 * joueurs par camp suffisent — ce qui se teste ici, c'est la structure du
 * document, pas la capacite de `map` a parcourir quatre entrees.
 */
const battle = (uuid: string, resultat: string, options: Partial<StatinkBattle> = {}) =>
  ({
    id: uuid,
    uuid,
    url: "",
    lobby: { key: "private" },
    rule: { key: "yagura" },
    stage: { key: "yagara" },
    result: resultat,
    knockout: false,
    start_at: { time: 1_785_000_000, iso8601: "2026-08-04T19:44:28+00:00" },
    end_at: { time: 1_785_000_252, iso8601: "2026-08-04T19:48:40+00:00" },
    our_team_percent: 66,
    their_team_percent: 49,
    medals: ["#1 Score Booster"],
    our_team_members: [
      { me: true, name: "☆Gloup☆", kill: 14, assist: 9, death: 7, special: 7, inked: 1463,
        weapon: { key: "splatroller", name: { en_US: "Splat Roller" } } },
      { me: false, name: "☆Bloup☆", kill: 16, assist: 5, death: 10, special: 3, inked: 742,
        weapon: { key: "sshooter", name: { en_US: "Splattershot" } } },
    ],
    their_team_members: [
      { me: false, name: "Sauvxge", kill: 13, assist: 1, death: 10, special: 2, inked: 927,
        weapon: { key: "hydra", name: { en_US: "Hydra Splatling" } } },
      { me: false, name: "к? Reby", kill: 3, assist: 1, death: 3, special: 6, inked: 1415,
        weapon: { key: "inkbrush", name: { en_US: "Inkbrush" } } },
    ],
    ...options,
  }) as unknown as StatinkBattle;

const session = (battles: StatinkBattle[]): SessionFile =>
  ({
    source: "stat.ink",
    user: "Gloup",
    name: "Équipe O",
    type: "intra",
    fetchedAt: "2026-08-04T22:00:00Z",
    window: { from: "2026-08-04T19:00:00Z", to: "2026-08-04T21:59:00Z" },
    filters: {},
    battleCount: battles.length,
    battles,
  }) as SessionFile;

describe("construisLaPlanche", () => {
  test("rend un document HTML complet", () => {
    const html = construisLaPlanche(session([battle("a", "win")]));
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("</html>");
    expect(html).toContain(`width: ${LARGEUR_PLANCHE}px`);
  });

  test("porte le titre et le bilan de la session", () => {
    const html = construisLaPlanche(session([battle("a", "win"), battle("b", "lose")]));
    expect(html).toContain("Intra du 04/08 — Équipe O");
    expect(html).toContain("1V - 1D");
    expect(html).toContain("2 manches");
  });

  test("rend une carte par manche, dans l'ordre de jeu", () => {
    const html = construisLaPlanche(
      session([battle("a", "win"), battle("b", "lose"), battle("c", "win")]),
    );
    expect(html.match(/class="manche manche--/g)).toHaveLength(3);
    expect(html.indexOf("#1")).toBeLessThan(html.indexOf("#2"));
    expect(html.indexOf("#2")).toBeLessThan(html.indexOf("#3"));
  });

  test("nomme les huit joueurs, adversaires compris", () => {
    const html = construisLaPlanche(session([battle("a", "win")]));
    expect(html).toContain("☆Gloup☆");
    expect(html).toContain("☆Bloup☆");
    expect(html).toContain("Sauvxge");
    expect(html).toContain("к? Reby");
  });

  test("marque ma ligne, et elle seule", () => {
    const html = construisLaPlanche(session([battle("a", "win")]));
    expect(html.match(/joueur--moi/g)).toHaveLength(1);
  });

  test("montre les chiffres de chacun et son arme dans les deux langues", () => {
    const html = construisLaPlanche(session([battle("a", "win")]));
    expect(html).toContain("14/9/7/7");
    expect(html).toContain("1463 p.");
    expect(html).toContain("(Splat Roller)");
  });

  test("porte le resultat, le score, la carte et le mode", () => {
    const html = construisLaPlanche(session([battle("a", "win")]));
    expect(html).toContain("manche--win");
    expect(html).toContain("Victoire");
    expect(html).toContain("66-49");
    expect(html).toContain("Expédition Risquée");
    expect(html).toContain("Marché Grefin");
  });

  test("signale un KO", () => {
    const html = construisLaPlanche(session([battle("a", "win", { knockout: true })]));
    expect(html).toContain("KO");
  });

  test("porte les medailles de la manche", () => {
    const html = construisLaPlanche(session([battle("a", "win")]));
    expect(html).toContain("№ 1 en progression");
  });

  test("echappe ce qui vient de stat.ink", () => {
    const hostile = battle("a", "win", {
      our_team_members: [
        { me: true, name: '<script>alert("x")</script>', kill: 0, assist: 0, death: 0,
          special: 0, inked: 0, weapon: { key: "sshooter", name: { en_US: "Splattershot" } } },
      ],
    } as unknown as Partial<StatinkBattle>);

    const html = construisLaPlanche(session([hostile]));
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  test("ne charge aucune ressource externe", () => {
    const html = construisLaPlanche(session([battle("a", "win")]));
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/https?:/i);
    expect(html).not.toMatch(/<link/i);
    expect(html).not.toMatch(/<img/i);
    expect(html).not.toMatch(/@import|url\(/i);
  });

  test("est deterministe : deux appels rendent la meme chaine", () => {
    const fichier = session([battle("a", "win"), battle("b", "lose")]);
    expect(construisLaPlanche(fichier)).toBe(construisLaPlanche(fichier));
  });

  test("ne casse pas sur une session vide", () => {
    const html = construisLaPlanche(session([]));
    expect(html).toContain("</html>");
    expect(html).not.toContain('class="manche manche--');
  });
});
