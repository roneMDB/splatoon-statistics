import { describe, expect, test } from "vitest";
import { construisLaPlanche, LARGEUR_PLANCHE } from "../../src/report/planche.ts";
import type { SessionFile } from "../../src/store.ts";
import type { StatinkBattle } from "../../src/statink/types.ts";
import { contraste, declaration, melange, voileDe } from "./couleurs.ts";

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
        weapon: { key: "splatroller", name: { en_US: "Splat Roller" }, special: { key: "greatbarrier" } } },
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

    const indexNous = corps.indexOf('class="equipe__titre">Nous<');
    const indexEux = corps.indexOf('class="equipe__titre">Eux<');
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
    // Sans pictos, l'abreviation tient la place de chacun : é 14 +9, m 7, sp 7.
    const debut = html.indexOf('class="joueur__chiffres"', html.indexOf("☆Gloup☆</span>"));
    const chiffres = html.slice(debut, html.indexOf('<span class="joueur__arme"', debut));
    const mots = chiffres.replace(/^[^>]*>/, "").replace(/<[^>]*>/g, " ").split(/\s+/).filter(Boolean);
    expect(mots).toEqual(["é", "14", "+9", "m", "7", "sp", "7", "1463", "p."]);
    expect(html).toContain("(Splat Roller)");
  });

  test("sans pictos, une legende traduit les abreviations des chiffres", () => {
    const html = construisLaPlanche(session([battle("a", "win")]));
    const legende = html.slice(html.indexOf('class="planche__legende"'), html.indexOf("</p>", html.indexOf('class="planche__legende"')));
    expect(legende).toContain("éliminations, + assistances");
    expect(legende).toContain("morts");
    expect(legende).toContain("spéciales déclenchées");
    expect(legende).toContain("points d&#39;encrage");
    // Une fois pour toute la planche, avant les cartes.
    expect(html.match(/class="planche__legende"/g)).toHaveLength(1);
    expect(html.indexOf('class="planche__legende"')).toBeLessThan(html.indexOf('class="planche__grille"'));
  });

  test("avec les pictos du jeu, chaque chiffre porte le sien, et la speciale est celle du joueur", () => {
    const pictos = (categorie: string, cle: string) => `data:image/png;base64,${categorie}-${cle}`;
    const html = construisLaPlanche(session([battle("a", "win")]), { pictos });

    const ligne = html.slice(html.indexOf("☆Gloup☆</span>"), html.indexOf("(Splat Roller)"));
    expect(ligne).toContain("picto--stats-elimination");
    expect(ligne).toContain("picto--stats-mort");
    expect(ligne).toContain("picto--speciales-greatbarrier");
    expect(ligne).not.toContain("picto-repli");

    // Un joueur dont stat.ink ne donne pas la speciale garde l'abreviation.
    const autre = html.slice(html.indexOf("☆Bloup☆</span>"), html.indexOf("(Splattershot)"));
    expect(autre).toContain('<span class="picto-repli picto-repli--xs">sp</span>');

    // Chaque picto n'est declare qu'une fois dans la feuille, meme repris.
    expect(html.match(/\.picto--stats-elimination \{/g)).toHaveLength(1);
    // La legende montre ma speciale.
    const legende = html.slice(html.indexOf('class="planche__legende"'));
    expect(legende.slice(0, legende.indexOf("</p>"))).toContain("picto--speciales-greatbarrier");
  });

  test("porte le resultat, le score, la carte et le mode", () => {
    const html = construisLaPlanche(session([battle("a", "win")]));
    expect(html).toMatch(/class="manche manche--win[ "]/);
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
    expect(html).toMatch(/class="manche manche--draw[ "]/);
    expect(html).toMatch(/class="manche manche--inconnu[ "]/);
  });

  test("colore la carte selon la regle de la manche", () => {
    const html = construisLaPlanche(
      session([battle("a", "win"), battle("b", "lose", { rule: { key: "asari" } } as never)]),
    );

    // Le modificateur de resultat reste en tete : deux tests comptent les
    // cartes avec `class="manche manche--`.
    expect(html).toContain('class="manche manche--win manche--regle-yagura"');
    expect(html).toContain('class="manche manche--lose manche--regle-asari manche--mat"');
  });

  test("retombe sur la regle inconnue quand stat.ink ne la donne pas", () => {
    const html = construisLaPlanche(session([battle("a", "win", { rule: null } as never)]));

    expect(html).toContain("manche--regle-inconnue");
  });

  test("marque comme mat tout ce qui n'est pas une victoire", () => {
    const html = construisLaPlanche(
      session([
        battle("a", "win"),
        battle("b", "lose"),
        battle("c", "draw"),
        battle("d", "win", { result: undefined }),
      ]),
    );

    // Apres `</style>` : la feuille declare huit fois `manche--mat` dans ses
    // selecteurs, et les compter reviendrait a mesurer la table de couleurs.
    const corps = html.slice(html.indexOf("</style>"));
    expect([...corps.matchAll(/manche--mat/g)]).toHaveLength(3);
  });

  /**
   * Le test de lisibilite, dans sa forme forte.
   *
   * Il remplace celui qui ne mesurait qu'un seul fond, le bandeau neutre. Une
   * carte empile desormais trois couches sous son texte — la couleur de regle,
   * le voile du panneau, la texture — et chacune deplace le fond. Ce qui se
   * mesure, c'est donc la pile complete, pour chaque regle et chaque etat.
   *
   * Les couleurs ne sont pas recopiees ici : le test les lit dans la feuille
   * rendue. Une couleur ajoutee a la table est donc verifiee sans que le test
   * soit touche, et une couleur affaiblie le fait echouer.
   */
  const pilesDeCouleur = (html: string) => {
    const voile = voileDe(declaration(html, ".manche__equipes::before {", "background"));
    const moi = declaration(html, ".joueur--moi {", "background");
    const texture = (selecteur: string) => ({
      teinte: declaration(html, selecteur, "background"),
      alpha: Number(declaration(html, selecteur, "opacity")),
    });

    const etats = [
      {
        suffixe: " {",
        texte: declaration(html, ".manche__bandeau {", "color"),
        scotch: texture(".manche::after {"),
      },
      {
        suffixe: ".manche--mat {",
        texte: declaration(html, ".manche--mat .manche__bandeau {", "color"),
        scotch: texture(".manche--mat::after {"),
      },
    ];

    const cles = [...html.matchAll(/^\.manche--regle-([a-z]+) \{/gm)].map((m) => m[1]!);

    return cles.flatMap((cle) =>
      etats.map(({ suffixe, texte, scotch }) => {
        const regle = declaration(html, `.manche--regle-${cle}${suffixe}`, "background");
        // La texture est au-dessus du voile, sous le texte : elle s'applique
        // donc en dernier, sur chacune des trois assises.
        const scotche = (fond: string) => melange(scotch.teinte, fond, scotch.alpha);
        return {
          cle,
          texte,
          bandeau: scotche(regle),
          panneau: scotche(melange(voile.teinte, regle, voile.alpha)),
          maLigne: scotche(moi),
        };
      }),
    );
  };

  test("garde le texte du bandeau lisible sur les quatorze piles de regle", () => {
    const html = construisLaPlanche(session([battle("a", "win")]));
    const piles = pilesDeCouleur(html);

    // Sept regles, deux intensites. Sans ce compte, une table amputee
    // passerait le test en ne mesurant rien.
    expect(piles).toHaveLength(14);

    const opacite = Number(declaration(html, ".manche__contexte {", "opacity") || "1");
    expect(opacite).toBeGreaterThan(0);

    for (const { bandeau, texte } of piles) {
      expect(bandeau).toMatch(/^#[0-9a-f]{6}$/);
      expect(texte).toMatch(/^#[0-9a-f]{6}$/);
      expect(contraste(texte, bandeau)).toBeGreaterThanOrEqual(4.5);
      // Le contexte porte une opacite : c'est la couleur melangee au fond qui
      // compte, pas la couleur nominale.
      expect(contraste(melange(texte, bandeau, opacite), bandeau)).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("garde le corps de la manche lisible sous le voile et la texture", () => {
    const html = construisLaPlanche(session([battle("a", "win")]));

    // Les medailles vivent sous le meme voile : posees sur la couleur de
    // regle a nu, leur jaune tomberait a 1,6:1 sur le turquoise.
    expect(declaration(html, ".manche__medailles::before {", "background")).toBe(
      declaration(html, ".manche__equipes::before {", "background"),
    );

    const textes = [
      declaration(html, ".manche__equipes {", "color"),
      declaration(html, ".equipe__titre {", "color"),
      declaration(html, ".joueur__chiffres {", "color"),
      declaration(html, ".joueur__arme {", "color"),
      declaration(html, ".manche__medailles {", "color"),
    ];

    for (const { panneau, maLigne } of pilesDeCouleur(html)) {
      for (const assise of [panneau, maLigne]) {
        expect(assise).toMatch(/^#[0-9a-f]{6}$/);
        for (const texte of textes) {
          expect(texte).toMatch(/^#[0-9a-f]{6}$/);
          expect(contraste(texte, assise)).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  test("pose la texture de scotch une seule fois, en pseudo-element", () => {
    const html = construisLaPlanche(session([battle("a", "win"), battle("b", "lose")]));

    // Le motif pese 36 ko : il est declare une fois dans la feuille et repris
    // par selecteur, jamais recopie dans le corps du document.
    expect([...html.matchAll(/data:image\/png;base64,/g)]).toHaveLength(1);
    expect(html.slice(html.indexOf("</style>"))).not.toContain("data:image");

    // Les cartes et le fond de page le portent en pseudo-element : aucune
    // balise a poser, donc rien a oublier sur une carte.
    expect(declaration(html, ".manche::after {", "opacity")).toMatch(/^[\d.]+$/);
    expect(declaration(html, "body::before {", "opacity")).toMatch(/^[\d.]+$/);
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
    expect(html).not.toMatch(/@import/i);

    /*
     * La regle a change de forme, pas de fond. Elle interdisait tout `url(`
     * parce que jusqu'ici tout `url(` designait un fichier a aller chercher.
     * La texture est embarquee en `data:` : rien n'est charge, le document
     * reste autonome et rend la meme chose hors ligne. Ce qui reste interdit,
     * c'est tout le reste — un chemin relatif, une URL, un `url(#fragment)`.
     */
    const references = [...html.matchAll(/url\(\s*["']?([^"')]*)/gi)].map((m) => m[1]!);
    expect(references.length).toBeGreaterThan(0);
    for (const reference of references) {
      expect(reference).toMatch(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/);
    }
  });

  test("porte une CSP qui interdit tout sauf le style en ligne", () => {
    const html = construisLaPlanche(session([battle("a", "win")]));
    expect(html).toContain(
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:">',
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
