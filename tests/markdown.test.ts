import { describe, expect, test } from "vitest";
import { analyseMarkdown } from "../src/electron/renderer/markdown.js";

/**
 * Seule la moitie pure est testee ici : `analyseMarkdown` transforme le texte en
 * arbre de blocs, sans toucher au DOM. La construction du DOM depuis cet arbre
 * est triviale et n'a pas de logique propre.
 *
 * Le Markdown couvert n'est pas le Markdown en general, mais exactement celui
 * que `src/report/` produit.
 */

describe("analyseMarkdown — titres", () => {
  test("reconnait les deux niveaux de titre", () => {
    expect(analyseMarkdown("## Intra du 11/09\n\n### Courbe de session")).toEqual([
      { type: "titre", niveau: 2, segments: [{ texte: "Intra du 11/09", gras: false }] },
      { type: "titre", niveau: 3, segments: [{ texte: "Courbe de session", gras: false }] },
    ]);
  });

  test("ne prend pas un dièse au fil du texte pour un titre", () => {
    const blocs = analyseMarkdown("Une carte #1 quelque part");

    expect(blocs[0]?.type).toBe("paragraphe");
  });
});

describe("analyseMarkdown — gras", () => {
  test("decoupe une ligne en segments gras et non gras", () => {
    const blocs = analyseMarkdown("Bilan **4V - 9D** ce soir");

    expect(blocs[0]).toEqual({
      type: "paragraphe",
      segments: [
        { texte: "Bilan ", gras: false },
        { texte: "4V - 9D", gras: true },
        { texte: " ce soir", gras: false },
      ],
    });
  });

  test("gere plusieurs passages en gras sur la meme ligne", () => {
    const blocs = analyseMarkdown("**a** et **b**");

    expect(blocs[0]?.segments?.filter((s) => s.gras).map((s) => s.texte)).toEqual(["a", "b"]);
  });

  test("laisse tel quel un double asterisque non ferme", () => {
    const blocs = analyseMarkdown("2 ** 3 = 8");

    expect(blocs[0]?.segments).toEqual([{ texte: "2 ** 3 = 8", gras: false }]);
  });
});

describe("analyseMarkdown — blocs de code", () => {
  test("garde les lignes du bloc telles quelles, espaces compris", () => {
    const blocs = analyseMarkdown("```\nIndicateur    Total\nMorts            78\n```");

    expect(blocs).toEqual([
      { type: "code", lignes: ["Indicateur    Total", "Morts            78"] },
    ]);
  });

  test("n'interprete rien a l'interieur d'un bloc", () => {
    const blocs = analyseMarkdown("```\n## pas un titre\n**pas du gras**\n```");

    expect(blocs[0]).toEqual({
      type: "code",
      lignes: ["## pas un titre", "**pas du gras**"],
    });
  });

  test("ferme un bloc laisse ouvert plutot que de tout avaler en silence", () => {
    const blocs = analyseMarkdown("```\nune ligne");

    expect(blocs).toEqual([{ type: "code", lignes: ["une ligne"] }]);
  });
});

describe("analyseMarkdown — citations", () => {
  test("regroupe les lignes consecutives en une seule citation", () => {
    const blocs = analyseMarkdown("> Premiere ligne\n> Seconde ligne");

    expect(blocs).toEqual([
      {
        type: "citation",
        lignes: [
          [{ texte: "Premiere ligne", gras: false }],
          [{ texte: "Seconde ligne", gras: false }],
        ],
      },
    ]);
  });

  test("interprete le gras a l'interieur d'une citation", () => {
    const blocs = analyseMarkdown("> un **mot** important");

    expect(blocs[0]?.lignes?.[0]).toEqual([
      { texte: "un ", gras: false },
      { texte: "mot", gras: true },
      { texte: " important", gras: false },
    ]);
  });
});

describe("analyseMarkdown — structure", () => {
  test("regroupe les lignes consecutives en un seul paragraphe", () => {
    const blocs = analyseMarkdown("ligne un\nligne deux");

    expect(blocs).toHaveLength(1);
    expect(blocs[0]?.segments?.map((s) => s.texte)).toEqual(["ligne un\nligne deux"]);
  });

  test("une ligne vide separe deux paragraphes", () => {
    expect(analyseMarkdown("un\n\ndeux")).toHaveLength(2);
  });

  test("ignore les lignes vides en trop", () => {
    expect(analyseMarkdown("\n\n\nun\n\n\n\ndeux\n\n")).toHaveLength(2);
  });

  test("rend une liste vide pour un texte vide", () => {
    expect(analyseMarkdown("")).toEqual([]);
    expect(analyseMarkdown("   \n  \n")).toEqual([]);
  });
});

describe("analyseMarkdown — document reel", () => {
  test("analyse un compte rendu complet sans rien perdre", () => {
    const document = [
      "## Intra du 11/09 — Équipe A vs Équipe O",
      "",
      "**4V - 9D** · 13 manches",
      "",
      "🎯 **Objectif de la session : Tenir le support**",
      "",
      "> Je call moins dès qu'on subit.",
      "",
      "### 🎯 Bulletin de rôle",
      "",
      "```",
      "Indicateur    Total",
      "Éliminations     36",
      "```",
      "",
      "🤝 **41 % des assistances**.",
    ].join("\n");

    const blocs = analyseMarkdown(document);

    expect(blocs.map((b) => b.type)).toEqual([
      "titre",
      "paragraphe",
      "paragraphe",
      "citation",
      "titre",
      "code",
      "paragraphe",
    ]);
  });
});
