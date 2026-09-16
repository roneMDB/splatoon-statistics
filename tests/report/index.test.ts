import { describe, expect, test } from "vitest";
import {
  construisLeCompteRendu,
  estUneSection,
  LIBELLES_SECTIONS,
  SECTIONS,
} from "../../src/report/index.ts";
import type { SessionFile } from "../../src/store.ts";
import type { StatinkBattle } from "../../src/statink/types.ts";

const battle = (resultat: string) =>
  ({
    id: resultat,
    uuid: resultat,
    url: "",
    lobby: { key: "private" },
    rule: { key: "area" },
    stage: { key: "yagara" },
    result: resultat,
    knockout: false,
    start_at: { time: 1_789_000_000, iso8601: "2026-09-11T19:00:00+00:00" },
    end_at: { time: 1_789_000_300, iso8601: "2026-09-11T19:05:00+00:00" },
    our_team_members: [
      { me: true, name: "☆Gloųp☆", kill: 3, assist: 5, death: 4, special: 2, inked: 900 },
    ],
    their_team_members: [],
    medals: [],
  }) as unknown as StatinkBattle;

const session = (extra: Partial<SessionFile> = {}, battles: StatinkBattle[] = []): SessionFile => ({
  source: "stat.ink",
  user: "Gloup",
  fetchedAt: "2026-09-11T21:30:44.274Z",
  window: { from: "2026-09-11T18:00:00.000Z", to: "2026-09-11T21:01:00.000Z" },
  filters: { lobby: "private" },
  battleCount: battles.length,
  battles,
  ...extra,
});

describe("construisLeCompteRendu — entete", () => {
  test("titre le document avec le type, la date et le nom", () => {
    const rendu = construisLeCompteRendu(
      session({ name: "Équipe A vs Équipe O", type: "intra" }),
      { sections: [] },
    );

    expect(rendu).toContain("## Intra du 11/09 — Équipe A vs Équipe O");
  });

  test("se passe du nom et du type quand la session n'en a pas", () => {
    const rendu = construisLeCompteRendu(session(), { sections: [] });

    expect(rendu).toContain("## Session du 11/09");
  });

  test("annonce le bilan", () => {
    const rendu = construisLeCompteRendu(
      session({}, [battle("win"), battle("lose"), battle("lose")]),
      { sections: [] },
    );

    expect(rendu).toContain("**1V - 2D**");
    expect(rendu).toContain("3 manches");
  });
});

describe("construisLeCompteRendu — champs libres", () => {
  test("reprend l'objectif enregistre dans la session", () => {
    const rendu = construisLeCompteRendu(session({ objectif: "Tenir le support" }), {
      sections: [],
    });

    expect(rendu).toContain("**Objectif de la session : Tenir le support**");
  });

  test("laisse l'appelant primer sur ce qui est enregistre", () => {
    // La fenetre genere l'apercu avant d'enregistrer : c'est la saisie en cours
    // qui doit s'afficher, pas la version sur disque.
    const rendu = construisLeCompteRendu(session({ objectif: "ancien" }), {
      sections: [],
      objectif: "nouveau",
    });

    expect(rendu).toContain("nouveau");
    expect(rendu).not.toContain("ancien");
  });

  test("cite le ressenti en bloc de citation, ligne par ligne", () => {
    const rendu = construisLeCompteRendu(session(), {
      sections: [],
      ressenti: "Premiere ligne\nSeconde ligne",
    });

    expect(rendu).toContain("> Premiere ligne\n> Seconde ligne");
  });

  test("n'ecrit aucun bloc pour un champ libre vide", () => {
    const rendu = construisLeCompteRendu(session(), {
      sections: [],
      objectif: "   ",
      ressenti: "",
    });

    expect(rendu).not.toContain("Objectif");
    expect(rendu).not.toContain(">");
  });
});

describe("construisLeCompteRendu — assemblage", () => {
  test("n'inclut que les sections demandees", () => {
    const rendu = construisLeCompteRendu(session({}, [battle("win")]), {
      sections: ["modes"],
    });

    expect(rendu).toContain("Carte des modes");
    expect(rendu).not.toContain("Courbe de session");
  });

  test("respecte l'ordre demande", () => {
    const rendu = construisLeCompteRendu(session({}, [battle("win"), battle("lose")]), {
      sections: ["modes", "courbe"],
    });

    expect(rendu.indexOf("Carte des modes")).toBeLessThan(rendu.indexOf("Courbe de session"));
  });

  test("omet une section qui n'a rien a dire plutot que d'ecrire un titre vide", () => {
    // Sans adversaire dans le payload, le scouting n'a aucun contenu.
    const rendu = construisLeCompteRendu(session({}, [battle("win")]), {
      sections: ["scouting"],
    });

    expect(rendu).not.toContain("En face");
  });

  test("ne laisse ni ligne vide doublee ni ligne vide finale", () => {
    const rendu = construisLeCompteRendu(session({}, [battle("win"), battle("lose")]), {
      sections: [...SECTIONS],
    });

    expect(rendu).not.toContain("\n\n\n");
    expect(rendu.endsWith("\n")).toBe(true);
    expect(rendu.endsWith("\n\n")).toBe(false);
  });

  test("produit deux fois le meme texte pour la meme session", () => {
    const fichier = session({ name: "Intra" }, [battle("win"), battle("lose")]);
    const options = { sections: [...SECTIONS] } as const;

    expect(construisLeCompteRendu(fichier, options)).toBe(
      construisLeCompteRendu(fichier, options),
    );
  });

  test("survit a une session sans aucun match", () => {
    const rendu = construisLeCompteRendu(session(), { sections: [...SECTIONS] });

    expect(rendu).toContain("**0V - 0D**");
  });
});

describe("estUneSection", () => {
  test("reconnait les sections du document", () => {
    for (const section of SECTIONS) expect(estUneSection(section)).toBe(true);
  });

  test("refuse ce qui n'en est pas une", () => {
    expect(estUneSection("inventee")).toBe(false);
  });

  test("donne un intitule a chaque section, pour la fenetre et l'aide", () => {
    for (const section of SECTIONS) expect(LIBELLES_SECTIONS[section]).toBeTruthy();
  });
});

describe("construisLeCompteRendu — emoji", () => {
  /**
   * Un compte rendu qui traverse toutes les sections : chacune n'ecrit ses
   * faits que si les chiffres les declenchent, donc un document trop maigre
   * ne prouverait rien.
   */
  const rendu = () =>
    construisLeCompteRendu(
      session({ objectif: "Tenir le support", type: "intra" }, [
        battle("win"),
        battle("lose"),
        battle("lose"),
        battle("draw"),
      ]),
      { sections: [...SECTIONS] },
    );

  test("n'ouvre aucune phrase par un emoji", () => {
    // Une phrase, c'est une ligne qui porte des lettres : la frise de la
    // courbe (« ✅ ❌ ❌ ➖ ») n'en a aucune et reste donc hors du lot, ses
    // symboles etant la donnee elle-meme et non un ornement.
    const phrases = rendu()
      .split("\n")
      .filter((ligne) => !ligne.startsWith("#") && /\p{Letter}/u.test(ligne));

    for (const phrase of phrases) {
      expect(phrase, `« ${phrase} » s'ouvre par un emoji`).not.toMatch(
        /^\p{Extended_Pictographic}/u,
      );
    }
  });

  test("garde l'emoji des titres de section", () => {
    const titres = rendu()
      .split("\n")
      .filter((ligne) => ligne.startsWith("### "));

    expect(titres.length).toBeGreaterThan(0);
    for (const titre of titres) {
      expect(titre).toMatch(/^### \p{Extended_Pictographic}/u);
    }
  });

  test("garde les symboles de resultat de la frise", () => {
    expect(rendu()).toContain("✅ ❌ ❌ ➖");
  });
});
