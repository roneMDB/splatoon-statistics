import { describe, expect, test } from "vitest";
import { analyseSession } from "../../src/report/analyse.ts";
import type { Pictos } from "../../src/report/pictos.ts";
import { construisLesPages, LARGEUR_PLANCHE } from "../../src/report/planche.ts";
import { COULEUR_CAMP_A, COULEUR_CAMP_B, tableauDeMatchEnHtml } from "../../src/report/tableauDeMatch.ts";
import type { SessionFile } from "../../src/store.ts";
import type { StatinkBattle } from "../../src/statink/types.ts";
import { contraste } from "./couleurs.ts";

const arme = (key: string, en: string) => ({ key, name: { en_US: en } });

let minute = 0;
const battle = (resultat: string, options: Partial<StatinkBattle> = {}): StatinkBattle => {
  const debut = Date.parse("2026-08-04T19:00:00Z") + minute * 60_000;
  minute += 6;
  return {
    id: `id-${minute}`,
    uuid: `uuid-${minute}`,
    url: "",
    lobby: { key: "private" },
    rule: { key: "yagura" },
    stage: { key: "masaba" },
    result: resultat,
    knockout: false,
    start_at: { time: debut / 1000, iso8601: new Date(debut).toISOString() },
    end_at: { time: debut / 1000 + 300, iso8601: new Date(debut + 300_000).toISOString() },
    our_team_count: 100,
    their_team_count: 40,
    medals: ["#1 Splat Assister"],
    our_team_members: [
      { me: true, name: "☆Gloup☆", kill: 5, assist: 4, death: 3, special: 2, inked: 1200, weapon: arme("nzap89", "N-ZAP '89") },
      { me: false, name: "Coequipier", kill: 3, assist: 2, death: 4, special: 1, inked: 900, weapon: arme("sshooter", "Splattershot") },
    ],
    their_team_members: [
      { me: false, name: "PseudoAdverse", kill: 9, assist: 1, death: 2, special: 3, inked: 800, weapon: arme("hydra", "Hydra Splatling") },
    ],
    ...options,
  } as unknown as StatinkBattle;
};

const session = (battles: StatinkBattle[], extra: Partial<SessionFile> = {}): SessionFile =>
  ({
    source: "stat.ink",
    user: "Gloup",
    name: "Équipe O",
    type: "scrim",
    nomEquipe: "Gloup Squad",
    nomEquipeAdverse: "Les Calamars",
    objectif: "Tenir la zone",
    ressenti: "Bonne session",
    fetchedAt: "2026-08-04T22:00:00Z",
    window: { from: "2026-08-04T19:00:00Z", to: "2026-08-04T21:59:00Z" },
    filters: {},
    battleCount: battles.length,
    battles,
    ...extra,
  }) as SessionFile;

const pictosFactices: Pictos = (categorie, cle) =>
  categorie === "polices" ? `data:font/woff2;base64,${cle}` : `data:image/png;base64,${categorie}${cle}`;

const rends = (file: SessionFile) => tableauDeMatchEnHtml(file, analyseSession(file), pictosFactices).html;

describe("construisLesPages — tableau de match", () => {
  test.each(["intra", "scrim", "compet"])("en %s, une page large suit la synthese et precede les manches", (type) => {
    const pages = construisLesPages(session([battle("win"), battle("lose")], { type }), {
      entete: { sections: [] },
    });

    expect(pages.map((page) => page.nom)).toEqual(["00-synthese", "00-tableau-match", "01-manches-1-2"]);
    expect(pages[1]!.largeur).toBe(LARGEUR_PLANCHE);
    expect(pages[1]!.html).toContain("font-src data:");
    expect(pages[1]!.html).not.toContain('class="manche manche--');
  });

  test("est la, meme sans l'en-tete", () => {
    const pages = construisLesPages(session([battle("win")]));
    expect(pages.map((page) => page.nom)).toEqual(["00-tableau-match", "01-manches-1-1"]);
  });

  test.each([["open"], ["autre"], [undefined]])("absent pour le type %s", (type) => {
    const pages = construisLesPages(session([battle("win")], { type }));
    expect(pages.map((page) => page.nom)).not.toContain("00-tableau-match");
  });

  test("absent d'une session vide", () => {
    expect(construisLesPages(session([])).map((page) => page.nom)).not.toContain("00-tableau-match");
  });

  test("ne charge aucune ressource externe", () => {
    const [page] = construisLesPages(session([battle("win")]), { pictos: pictosFactices });
    expect(page!.html).not.toMatch(/<script|<link|<img|@import|https?:/i);
  });
});

describe("tableauDeMatchEnHtml", () => {
  const fichier = session([
    battle("win", { rule: { key: "area" }, knockout: true }),
    battle("lose", { rule: { key: "hoko" } }),
    battle("win"),
  ]);

  test("oppose les deux equipes par leur nom, score en manches", () => {
    const html = rends(fichier);
    expect(html).toContain('duel-score__nom duel-score__nom--a camp-a">Gloup Squad<');
    expect(html).toContain('duel-score__nom camp-b">Les Calamars<');
    expect(html).toContain('<span class="camp-a">2</span><span class="score__tiret">–</span><span class="camp-b">1</span>');
    expect(html).toContain("Victoire Gloup Squad");
  });

  test("donne la victoire a l'autre camp quand il gagne", () => {
    const html = rends(session([battle("lose"), battle("lose"), battle("win")]));
    expect(html).toContain('duel-score__verdict--b">Victoire Les Calamars<');
  });

  test("ne parle de personne en particulier : ni moi, ni objectif, ni ressenti, ni medailles", () => {
    const html = rends(fichier);
    expect(html).toContain("☆Gloup☆");
    expect(html).not.toMatch(/\bmoi\b/i);
    expect(html).not.toContain("--moi");
    expect(html).not.toContain("Tenir la zone");
    expect(html).not.toContain("Bonne session");
    expect(html).not.toContain("Assister");
    expect(html).not.toMatch(/Victoire<|Défaite</);
  });

  test("sans nom saisi, des generiques qui ne disent pas « nous »", () => {
    const html = rends(session([battle("win")], { nomEquipe: undefined, nomEquipeAdverse: undefined }));
    expect(html).toContain("Équipe A");
    expect(html).toContain("Équipe B");
    expect(html).not.toMatch(/>Nous<|>Eux</);
  });

  test("allume, manche par manche, la case du gagnant a la couleur de la regle", () => {
    const html = rends(fichier);
    const cases = [...html.matchAll(/<span class="(duel__case[^"]*)">/g)].map((m) => m[1]);
    // Ligne du camp A, puis ligne du camp B.
    expect(cases).toEqual([
      "duel__case duel__case--gagnee duel__case--regle-area",
      "duel__case",
      "duel__case duel__case--gagnee duel__case--regle-yagura",
      "duel__case",
      "duel__case duel__case--gagnee duel__case--regle-hoko",
      "duel__case",
    ]);
    expect(html.match(/duel__ko/g)).toHaveLength(1);
  });

  test("detaille chaque camp, avec son arme, et nomme les joueurs de passage", () => {
    const html = rends(
      session([
        battle("win"),
        battle("win"),
        battle("win", {
          their_team_members: [
            { me: false, name: "PseudoAdverse", kill: 9, assist: 1, death: 2, special: 3, inked: 800, weapon: arme("hydra", "Hydra Splatling") },
            { me: false, name: "Remplacant", kill: 1, assist: 0, death: 5, special: 0, inked: 100, weapon: arme("hydra", "Hydra Splatling") },
          ],
        } as Partial<StatinkBattle>),
      ]),
    );
    expect(html).toContain('<p class="etiquette etiquette--camp-a">Gloup Squad</p>');
    expect(html).toContain('<p class="etiquette etiquette--camp-b">Les Calamars</p>');
    expect(html).toContain('class="membre__nom">PseudoAdverse<');
    expect(html).toContain("picto--armes-hydra");
    expect(html).not.toContain('class="membre__nom">Remplacant<');
    expect(html).toContain("De passage : Remplacant");
  });

  test("decerne les mentions tous camps confondus", () => {
    const html = rends(fichier);
    expect(html).toMatch(/Éliminations<\/span><span class="mention__valeur">27<\/span><span class="mention__qui camp-b">PseudoAdverse/);
  });

  test("nomme tous les ex aequo d'une mention", () => {
    const html = rends(
      session([
        battle("win", {
          our_team_members: [
            { me: true, name: "Un", kill: 5, assist: 0, death: 1, special: 1, inked: 1, weapon: arme("nzap89", "N-ZAP '89") },
          ],
          their_team_members: [
            { me: false, name: "Deux", kill: 5, assist: 0, death: 2, special: 0, inked: 0, weapon: arme("hydra", "Hydra Splatling") },
          ],
        } as Partial<StatinkBattle>),
      ]),
    );
    expect(html).toMatch(/Éliminations<\/span><span class="mention__valeur">5<\/span><span class="mention__qui camp-a">Un .*?<span class="mention__qui camp-b">Deux/);
  });

  test("echappe noms d'equipe et pseudos", () => {
    const html = rends(session([battle("win")], { nomEquipe: "<b>A</b>" }));
    expect(html).not.toContain("<b>A</b>");
    expect(html).toContain("&lt;b&gt;A&lt;/b&gt;");
  });

  test("les couleurs des camps se lisent sur le panneau et sur le fond", () => {
    for (const couleur of [COULEUR_CAMP_A, COULEUR_CAMP_B]) {
      expect(contraste(couleur, "#1d2036")).toBeGreaterThanOrEqual(4.5);
      expect(contraste(couleur, "#0e0f18")).toBeGreaterThanOrEqual(4.5);
      // Le texte sombre de l'etiquette, sur la couleur du camp.
      expect(contraste("#0e0f18", couleur)).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("est deterministe", () => {
    expect(rends(fichier)).toEqual(rends(fichier));
  });
});
