import { describe, expect, test } from "vitest";
import { construisLaPlanche, LARGEUR_PLANCHE } from "../../src/report/planche.ts";
import type { SessionFile } from "../../src/store.ts";
import type { StatinkBattle } from "../../src/statink/types.ts";

/**
 * Une manche complete : deux equipes de deux, un score, des medailles. Deux
 * joueurs par camp suffisent — ce qui se teste ici, c'est la structure du
 * document, pas la capacite de `map` a parcourir quatre entrees.
 *
 * Decalage en secondes, derive de la premiere lettre de l'uuid : "a" ne
 * decale rien (les tests a une seule manche gardent leurs heures d'origine),
 * "b" decale d'une minute, "c" de deux. Sert a rendre les manches d'une meme
 * session distinguables par leur heure, sans toucher aux tests existants.
 */
const decalageDe = (uuid: string) => (uuid.charCodeAt(0) - "a".charCodeAt(0)) * 60;

const DEBUT_BASE_MS = Date.parse("2026-08-04T19:44:28+00:00");
const FIN_BASE_MS = Date.parse("2026-08-04T19:48:40+00:00");

const battle = (uuid: string, resultat: string, options: Partial<StatinkBattle> = {}) => {
  const decalageMs = decalageDe(uuid) * 1000;
  return {
    id: uuid,
    uuid,
    url: "",
    lobby: { key: "private" },
    rule: { key: "yagura" },
    stage: { key: "yagara" },
    result: resultat,
    knockout: false,
    start_at: {
      time: 1_785_000_000,
      iso8601: new Date(DEBUT_BASE_MS + decalageMs).toISOString(),
    },
    end_at: {
      time: 1_785_000_252,
      iso8601: new Date(FIN_BASE_MS + decalageMs).toISOString(),
    },
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
  } as unknown as StatinkBattle;
};

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

/**
 * Luminance relative d'un `#rrggbb`, formule de WCAG 2.1.
 *
 * Recopiee ici et nulle part ailleurs : la planche n'a aucun besoin de ce
 * calcul a l'execution, c'est le test seul qui verifie que les couleurs
 * choisies dans la feuille de style tiennent.
 */
const luminance = (couleur: string): number => {
  const canaux = [1, 3, 5].map((i) => Number.parseInt(couleur.slice(i, i + 2), 16) / 255);
  const [r, v, b] = canaux.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * v! + 0.0722 * b!;
};

/** Rapport de contraste WCAG entre deux couleurs opaques, de 1:1 a 21:1. */
const contraste = (avant: string, arriere: string): number => {
  const [clair, sombre] = [luminance(avant), luminance(arriere)].sort((x, y) => y - x);
  return (clair! + 0.05) / (sombre! + 0.05);
};

/**
 * Compose une couleur semi-transparente sur son fond : un texte a `opacity`
 * ne contraste pas comme sa couleur nominale, et c'est le resultat du melange
 * que l'oeil compare au fond.
 */
const melange = (avant: string, arriere: string, opacite: number): string => {
  const octet = (couleur: string, i: number) => Number.parseInt(couleur.slice(i, i + 2), 16);
  const canal = (i: number) =>
    Math.round(octet(avant, i) * opacite + octet(arriere, i) * (1 - opacite))
      .toString(16)
      .padStart(2, "0");
  return `#${canal(1)}${canal(3)}${canal(5)}`;
};

/**
 * La derniere valeur de `propriete` declaree par le bloc qui ouvre sur
 * `selecteur`. Le selecteur est ancre en debut de ligne : sans cela,
 * `.manche__contexte {` trouverait d'abord `.manche--inconnu .manche__contexte {`,
 * qui se termine par la meme chaine et ne declare pas les memes proprietes.
 */
const declaration = (html: string, selecteur: string, propriete: string): string => {
  const bloc = html.split(`\n${selecteur}`)[1]?.split("}")[0] ?? "";
  const valeurs = [...bloc.matchAll(new RegExp(`${propriete}:\\s*([^;]+);`, "g"))];
  return valeurs.at(-1)?.[1]?.trim() ?? "";
};

/**
 * La couleur qui s'applique reellement a `.manche__<element>` dans un bandeau
 * neutre : la regle `.manche--draw` si elle est la, sinon celle que l'element
 * tient de sa propre classe, moins specifique. Sans cette retombee, retirer la
 * regle ferait echouer le test sur une couleur introuvable au lieu du
 * contraste insuffisant qu'elle est censee mesurer.
 */
const couleurNeutre = (html: string, element: string): string =>
  declaration(html, `.manche--draw .manche__${element},`, "color") ||
  declaration(html, `.manche__${element} {`, "color");

describe("construisLaPlanche", () => {
  test("rend un document HTML complet dont la largeur suit LARGEUR_PLANCHE", () => {
    const html = construisLaPlanche(session([battle("a", "win")]));
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("</html>");
    // Verifie seulement que la constante atteint la feuille de style, pas sa
    // valeur : figer 1600 ici doublerait LARGEUR_PLANCHE sans rien prouver de
    // plus, et casserait ce test des le prochain changement de largeur.
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
    // Le numero (#1, #2, #3) est toujours croissant par construction — il vaut
    // index+1, quel que soit l'ordre des manches en entree. Il ne prouve donc
    // rien seul : ce qui compte, c'est que le numero N porte bien l'heure de
    // LA manche N (a, b ou c ont chacune une heure distincte, voir
    // `decalageDe`). Un renversement de `file.battles` mettrait l'heure de
    // "c" sous #1, et cette assertion s'en apercevrait.
    //
    // On cherche dans le corps, apres la feuille de style : les couleurs de
    // celle-ci (`#171922`, `#222534`, `#39405f`) contiennent aussi des "#1"
    // en apparence, et une assertion sur le HTML entier pourrait s'y tromper.
    const corps = html.split("</style>")[1] ?? "";
    expect(html.match(/class="manche manche--/g)).toHaveLength(3);

    const heureAttendue = (uuid: string) =>
      new Date(DEBUT_BASE_MS + decalageDe(uuid) * 1000).toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      });
    // Le numero est toujours croissant par construction (il vaut index+1) :
    // seul ne prouve rien. Ce qui compte, c'est que le numero N porte l'heure
    // de LA manche N. On ancre donc sur le bandeau entier, du numero jusqu'a
    // l'heure — une sequence que la feuille de style ne peut pas contenir.
    const position = (numero: number, uuid: string, libelle: string) =>
      corps.indexOf(
        `class="manche__numero">${numero}</span>` +
          `<span class="manche__resultat">${libelle}</span>` +
          `<span class="manche__contexte">${heureAttendue(uuid)}`,
      );

    const p1 = position(1, "a", "Victoire");
    const p2 = position(2, "b", "Défaite");
    const p3 = position(3, "c", "Victoire");
    expect(p1).toBeGreaterThanOrEqual(0);
    expect(p2).toBeGreaterThanOrEqual(0);
    expect(p3).toBeGreaterThanOrEqual(0);
    expect(p1).toBeLessThan(p2);
    expect(p2).toBeLessThan(p3);
  });

  test("range les manches dans une grille a deux colonnes", () => {
    const html = construisLaPlanche(session([battle("a", "win"), battle("b", "lose")]));

    // Le conteneur existe et enveloppe les cartes : sans lui, la grille CSS
    // n'a pas de parent sur qui s'appliquer.
    expect(html).toContain('<main class="planche__grille">');
    expect(html).toContain("</main>");

    const grille = html.split('<main class="planche__grille">')[1]?.split("</main>")[0] ?? "";
    expect(grille.match(/class="manche manche--/g)).toHaveLength(2);

    // Deux colonnes, declarees sur le conteneur et non sur le corps.
    expect(html).toMatch(/\.planche__grille\s*\{[^}]*grid-template-columns:\s*1fr 1fr/);
    // Sans `display: grid`, les proprietes ci-dessus sont inertes : le
    // conteneur redevient un bloc ordinaire et les cartes s'empilent en une
    // seule colonne, a 1600 px cette fois.
    expect(html).toMatch(/\.planche__grille\s*\{[^}]*display:\s*grid/);
  });

  test("nomme les huit joueurs, adversaires compris", () => {
    const html = construisLaPlanche(session([battle("a", "win")]));
    expect(html).toContain("☆Gloup☆");
    expect(html).toContain("☆Bloup☆");
    expect(html).toContain("Sauvxge");
    expect(html).toContain("к? Reby");
  });

  test("place toujours Nous avant Eux, meme quand on perd", () => {
    // La regle est ecrite en tete de `mancheEnHtml` : « Nous » passe toujours
    // en premier, meme en defaite. On verifie ici que rien ne l'a laissee
    // s'evaporer - permuter les deux appels a `equipeEnHtml` doit faire
    // echouer ce test.
    const html = construisLaPlanche(session([battle("a", "lose")]));
    const corps = html.split("</style>")[1] ?? "";

    const indexNous = corps.indexOf('class="equipe__titre">Nous —');
    const indexEux = corps.indexOf('class="equipe__titre">Eux —');
    expect(indexNous).toBeGreaterThanOrEqual(0);
    expect(indexEux).toBeGreaterThanOrEqual(0);
    expect(indexNous).toBeLessThan(indexEux);

    const sectionNous = corps.slice(indexNous, indexEux);
    const sectionEux = corps.slice(indexEux);
    expect(sectionNous).toContain("☆Gloup☆");
    expect(sectionNous).toContain("☆Bloup☆");
    expect(sectionEux).toContain("Sauvxge");
    expect(sectionEux).toContain("к? Reby");
  });

  test("marque ma ligne, et elle seule", () => {
    const html = construisLaPlanche(session([battle("a", "win")]));
    expect(html.match(/class="joueur joueur--moi"/g)).toHaveLength(1);
  });

  test("montre les chiffres de chacun et son arme dans les deux langues", () => {
    const html = construisLaPlanche(session([battle("a", "win")]));
    expect(html).toContain("14/9/7/7");
    expect(html).toContain("1463 p.");
    expect(html).toContain("(Splat Roller)");
  });

  test("porte le resultat, le score, la carte et le mode", () => {
    const html = construisLaPlanche(session([battle("a", "win")]));
    expect(html).toContain('class="manche manche--win"');
    expect(html).toContain("Victoire");
    expect(html).toContain("66-49");
    expect(html).toContain("Expédition Risquée");
    expect(html).toContain("Marché Grefin");
  });

  test("donne sa classe a un match nul comme a un resultat absent", () => {
    // Sans ces classes, aucune regle ne distingue le bandeau neutre des
    // bandeaux colores, et le texte du test suivant n'a rien qui le vise.
    const html = construisLaPlanche(
      session([battle("a", "draw"), battle("b", "draw", { result: undefined })]),
    );
    expect(html).toContain('class="manche manche--draw"');
    expect(html).toContain('class="manche manche--inconnu"');
  });

  test("garde le texte lisible sur le bandeau neutre", () => {
    const html = construisLaPlanche(session([battle("a", "draw")]));

    const fond = declaration(html, ".manche__bandeau {", "background");
    expect(fond).toMatch(/^#[0-9a-f]{6}$/);

    // Le texte quasi-noir des bandeaux colores ne tient pas sur ce fond : la
    // retombee, si la regle neutre disparait, est bien un echec de lisibilite.
    expect(contraste(declaration(html, ".manche__numero {", "color"), fond)).toBeLessThan(4.5);

    for (const element of ["numero", "resultat"]) {
      expect(contraste(couleurNeutre(html, element), fond)).toBeGreaterThanOrEqual(4.5);
    }

    // Le contexte porte une opacite : c'est la couleur melangee au fond qui
    // compte, pas la couleur nominale.
    const opacite = Number(declaration(html, ".manche__contexte {", "opacity"));
    expect(opacite).toBeGreaterThan(0);
    const contexte = melange(couleurNeutre(html, "contexte"), fond, opacite);
    expect(contraste(contexte, fond)).toBeGreaterThanOrEqual(4.5);
  });

  test("signale un KO", () => {
    const html = construisLaPlanche(session([battle("a", "win", { knockout: true })]));
    expect(html).toContain("KO");
  });

  test("porte les medailles de la manche", () => {
    const html = construisLaPlanche(session([battle("a", "win")]));
    expect(html).toContain("№ 1 en progression");
  });

  test("ne rend aucun bloc de medailles quand la manche n'en a pas", () => {
    const html = construisLaPlanche(session([battle("a", "win", { medals: [] })]));
    expect(html).not.toContain('<p class="manche__medailles"');
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

  test("porte une CSP qui interdit tout sauf le style en ligne", () => {
    const html = construisLaPlanche(session([battle("a", "win")]));
    expect(html).toContain(
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'">',
    );
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
