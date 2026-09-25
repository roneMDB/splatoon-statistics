import { describe, expect, test } from "vitest";
import { analyseSession } from "../../src/report/analyse.ts";
import { enteteEnHtml, type OptionsEntete } from "../../src/report/entete.ts";
import { SECTIONS } from "../../src/report/index.ts";
import { aucunPicto, type Pictos } from "../../src/report/pictos.ts";
import { construisLaPlanche } from "../../src/report/planche.ts";
import { REGLES } from "../../src/report/regles.ts";
import type { SessionFile } from "../../src/store.ts";
import type { StatinkBattle } from "../../src/statink/types.ts";
import { contraste, declaration } from "./couleurs.ts";

const arme = (key: string, en: string) => ({
  key,
  name: { en_US: en },
  sub: { key: "robotbomb" },
  special: { key: "decoy" },
});

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
    medals: ["#1 Splat Assister", "Turf Inked"],
    our_team_members: [
      { me: true, name: "☆Gloup☆", kill: 5, assist: 4, death: 3, special: 2, inked: 1200,
        weapon: arme("nzap89", "N-ZAP '89") },
      { me: false, name: "Coequipier", kill: 3, assist: 2, death: 4, special: 1, inked: 900,
        weapon: arme("sshooter", "Splattershot") },
    ],
    their_team_members: [
      { me: false, name: "PseudoAdverse", kill: 9, assist: 1, death: 2, special: 3, inked: 800,
        weapon: arme("hydra", "Hydra Splatling") },
    ],
    ...options,
  } as unknown as StatinkBattle;
};

const session = (battles: StatinkBattle[], extra: Partial<SessionFile> = {}): SessionFile =>
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
    ...extra,
  }) as SessionFile;

const tout: OptionsEntete = { sections: [...SECTIONS] };

/** Des pictos factices : une URI reconnaissable par categorie et par cle. */
const pictosFactices: Pictos = (categorie, cle) =>
  categorie === "polices" ? `data:font/woff2;base64,${cle}` : `data:image/png;base64,${categorie}${cle}`;

const rends = (file: SessionFile, options: OptionsEntete = tout, pictos: Pictos = pictosFactices) =>
  enteteEnHtml(file, analyseSession(file), options, pictos);

describe("enteteEnHtml — blocs", () => {
  const fichier = session([battle("win"), battle("lose", { rule: { key: "area" } })]);

  test("dessine un bloc par section cochee, et le score toujours", () => {
    const { html } = rends(fichier);
    expect(html).toContain('class="score"');
    for (const etiquette of ["Courbe de session", "Bulletin", "Modes et stages", "En face"]) {
      expect(html).toContain(`<p class="etiquette">${etiquette}</p>`);
    }
  });

  test("retire le bloc d'une section decochee", () => {
    const { html } = rends(fichier, { sections: ["role"] });
    expect(html).toContain('class="score"');
    expect(html).toContain("Bulletin");
    expect(html).not.toContain("Courbe de session");
    expect(html).not.toContain("Modes et stages");
    expect(html).not.toContain("En face");
  });

  test("met bulletin et modes cote a cote, et l'un seul sur toute la largeur", () => {
    const duo = rends(fichier, { sections: ["role", "modes"] }).html;
    expect(duo).not.toMatch(/class="sticker plein"><div class="sticker__corps"><p class="etiquette">Bulletin/);

    const seul = rends(fichier, { sections: ["role"] }).html;
    expect(seul).toMatch(/class="sticker plein"><div class="sticker__corps"><p class="etiquette">Bulletin/);
  });

  test("porte le titre de la session et le score en V et D", () => {
    const { html } = rends(fichier);
    expect(html).toContain("Intra du 04/08 — Équipe O");
    expect(html).toMatch(/score__v">1<span class="score__lettre">V/);
    expect(html).toMatch(/score__d">1<span class="score__lettre">D/);
    expect(html).toContain("Match privé");
  });

  test("pose une tuile par manche, dans l'ordre, a la couleur de sa regle", () => {
    const { html } = rends(
      session([
        battle("win", { rule: { key: "area" } }),
        battle("lose", { rule: { key: "hoko" }, knockout: true }),
        battle("win", { rule: { key: "regle_inventee" } }),
      ]),
    );

    const tuiles = [...html.matchAll(/<li class="(tuile [^"]*)">/g)].map((m) => m[1]);
    expect(tuiles).toEqual([
      "tuile tuile--regle-area",
      "tuile tuile--regle-hoko tuile--mat",
      // Une regle inconnue ne donne pas sa cle a la classe.
      "tuile tuile--regle-inconnue",
    ]);
    expect([...html.matchAll(/tuile__ko/g)]).toHaveLength(1);
  });

  test("designe les adversaires par leur arme, jamais par leur pseudo", () => {
    const { html } = rends(fichier);
    // « hydra » : l'Exteinteur, sous son nom francais seul.
    expect(html).toContain("Exteinteur");
    expect(html).not.toContain("Hydra Splatling");
    expect(html).not.toContain("PseudoAdverse");
    // Ni les coequipiers : l'en-tete ne montre que mes chiffres.
    expect(html).not.toContain("Coequipier");
  });

  test("n'affiche ni post-it ni bulle sans objectif ni ressenti", () => {
    const { html } = rends(fichier);
    expect(html).not.toContain('class="postit"');
    expect(html).not.toContain('class="bulle"');
  });

  test("prend l'objectif et le ressenti des options avant ceux de la session", () => {
    const { html } = rends(session([battle("win")], { objectif: "ancien" }), {
      ...tout,
      objectif: "Tenir le support",
      ressenti: "Ligne 1\nLigne 2",
    });
    expect(html).toContain("Tenir le support");
    expect(html).not.toContain("ancien");
    expect(html).toContain("<p>Ligne 1</p><p>Ligne 2</p>");
  });

  test("echappe l'objectif et le ressenti, saisis librement", () => {
    const { html } = rends(session([battle("win")]), {
      ...tout,
      objectif: '<script>alert("x")</script>',
      ressenti: "<img src=x onerror=alert(1)>",
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });

  test("est deterministe", () => {
    expect(rends(fichier)).toEqual(rends(fichier));
  });

  test("ne casse pas sur une session vide", () => {
    const { html } = rends(session([]));
    expect(html).toContain('class="score"');
    expect(html).not.toContain("Courbe de session");
  });
});

describe("enteteEnHtml — pictos", () => {
  const fichier = session([battle("win"), battle("win")]);

  test("declare chaque picto une seule fois, en classe, et le reprend par element", () => {
    const { html, style } = rends(fichier);

    // Deux tuiles portent le picto de la meme regle : une seule declaration.
    expect([...style.matchAll(/data:image\/png;base64,reglesyagura/g)]).toHaveLength(1);
    expect([...html.matchAll(/picto--regles-yagura/g)].length).toBeGreaterThan(2);
    // Aucune URI dans le corps : tout passe par la feuille.
    expect(html).not.toContain("data:");
  });

  test("pose l'arme, sa sous-arme et sa speciale, le stage, la medaille et le lobby", () => {
    const { html } = rends(fichier);
    for (const classe of [
      "picto--armes-nzap89",
      "picto--sous-robotbomb",
      "picto--speciales-decoy",
      "picto--stages-masaba",
      "picto--medailles-or",
      "picto--medailles-argent",
      "picto--lobbies-private",
      "picto--armes-hydra",
    ]) {
      expect(html).toContain(classe);
    }
  });

  test("embarque les polices du jeu quand elles sont la", () => {
    const { style } = rends(fichier);
    expect(style).toContain('@font-face { font-family: "Splatoon Titre"; src: url("data:font/woff2;base64,titre")');
    expect(style).toContain('font-family: "Splatoon Texte"');
  });

  test("sans pictos, retombe sur le texte et ne declare aucune URI", () => {
    const { html, style } = rends(fichier, tout, aucunPicto);
    expect(style).not.toContain("data:");
    expect(style).not.toContain("@font-face");
    expect(html).not.toContain('class="picto ');
    // Les libelles restent : le texte porte l'information, le picto l'illustre.
    expect(html).toContain("N-ZAP 89");
    expect(html).toContain("Exteinteur");
  });

  test("une cle stat.ink hostile n'atteint jamais une classe", () => {
    const hostile = session([
      battle("win", {
        stage: { key: 'x" onload="alert(1)' },
        rule: { key: "area\" style=\"" },
      } as unknown as Partial<StatinkBattle>),
    ]);
    const { html, style } = rends(hostile);

    // Le libelle de repli la montre, echappee : c'est du texte.
    expect(html).not.toContain('" onload');
    expect(html).toContain("&quot; onload");
    // Mais aucune classe ne la porte, ni aucune regle de la feuille.
    for (const [, classes] of html.matchAll(/class="([^"]*)"/g)) {
      expect(classes).toMatch(/^[a-z0-9_\- ]+$/);
    }
    expect(style).not.toContain("onload");
    // Le seul attribut style est la largeur de barre, un entier calcule.
    for (const [, valeur] of html.matchAll(/style="([^"]*)"/g)) {
      expect(valeur).toMatch(/^width:\d{1,3}%$/);
    }
  });
});

describe("enteteEnHtml — lisibilite", () => {
  const { style } = rends(session([battle("win")]));
  const doc = `\n${style}`;

  test("garde le texte des stickers lisible sur leur panneau", () => {
    const panneau = declaration(doc, ".sticker__corps {", "background");
    expect(panneau).toMatch(/^#[0-9a-f]{6}$/);

    for (const texte of [
      declaration(doc, ".sticker__corps {", "color"),
      declaration(doc, ".secondaire {", "color"),
      declaration(doc, ".score__v {", "color"),
      declaration(doc, ".score__d {", "color"),
      declaration(doc, ".score__titre {", "color"),
    ]) {
      expect(texte).toMatch(/^#[0-9a-f]{6}$/);
      expect(contraste(texte, panneau)).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("garde l'etiquette, le post-it et la bulle lisibles", () => {
    for (const selecteur of [".etiquette {", ".postit {", ".bulle {"]) {
      const fond = declaration(doc, selecteur, "background");
      const texte = declaration(doc, selecteur, "color");
      expect(contraste(texte, fond)).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("garde le verdict des tuiles lisible sur les quatorze couleurs de regle", () => {
    const sombre = declaration(doc, ".tuile {", "color");
    const clair = declaration(doc, ".tuile--mat {", "color");

    for (const [cle, vive, matte] of REGLES) {
      expect(declaration(doc, `.tuile--regle-${cle} {`, "background")).toBe(vive);
      expect(contraste(sombre, vive)).toBeGreaterThanOrEqual(4.5);
      expect(contraste(clair, matte)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("construisLaPlanche — avec l'en-tete", () => {
  const fichier = session([battle("win"), battle("lose")]);
  const html = construisLaPlanche(fichier, { entete: tout, pictos: pictosFactices });

  test("remplace l'entete simple par l'en-tete dessine, avant la grille", () => {
    expect(html).not.toContain('<header class="planche__entete">');
    expect(html.indexOf('<section class="entete">')).toBeGreaterThan(0);
    expect(html.indexOf('<section class="entete">')).toBeLessThan(html.indexOf('<main class="planche__grille">'));
    // Le titre n'apparait qu'une fois dans le corps.
    const corps = html.slice(html.indexOf("<body>"));
    expect([...corps.matchAll(/Intra du 04\/08/g)]).toHaveLength(1);
  });

  test("autorise les polices embarquees dans la CSP, et rien de plus", () => {
    expect(html).toContain(
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:; font-src data:">',
    );
  });

  test("ne charge toujours aucune ressource externe", () => {
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/https?:/i);
    expect(html).not.toMatch(/<link/i);
    expect(html).not.toMatch(/<img/i);
    expect(html).not.toMatch(/@import/i);

    const references = [...html.matchAll(/url\(\s*["']?([^"')]*)/gi)].map((m) => m[1]!);
    for (const reference of references) {
      expect(reference).toMatch(/^data:(image\/(png|svg\+xml)|font\/woff2);base64,[A-Za-z0-9+/=]+$/);
    }
  });

  test("sans l'option, la planche ne porte aucune trace de l'en-tete", () => {
    const sans = construisLaPlanche(fichier);
    expect(sans).not.toContain('class="entete"');
    expect(sans).not.toContain("font-src");
    expect(sans).toContain('<header class="planche__entete">');
  });
});
