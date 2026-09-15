import { describe, expect, test } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  fabriqueLaPlanche,
  HAUTEUR_MAXIMALE_PLANCHE,
  nomDePlanche,
  type OutilsDePlanche,
} from "../../src/electron/plancheHandler.ts";
import type { SessionFile } from "../../src/store.ts";

const sessionVide = (): SessionFile =>
  ({
    source: "stat.ink",
    user: "Gloup",
    fetchedAt: "2026-08-04T22:00:00Z",
    window: { from: "2026-08-04T19:00:00Z", to: "2026-08-04T21:59:00Z" },
    filters: {},
    battleCount: 0,
    battles: [],
  }) as SessionFile;

const PNG_FACTICE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

/** Doublure du monde exterieur. `journal` retient ce qui a ete appele. */
function outils(
  reglages: { hauteur?: number; copieReussie?: boolean } = {},
): OutilsDePlanche & { journal: string[] } {
  const journal: string[] = [];
  return {
    journal,
    lisLaSession: async (path) => {
      journal.push(`lis:${path}`);
      return sessionVide();
    },
    mesure: async (html, largeur) => {
      journal.push(`mesure:${largeur}:${html.length > 0}`);
      return reglages.hauteur ?? 2400;
    },
    capture: async (hauteur) => {
      journal.push(`capture:${hauteur}`);
      return PNG_FACTICE;
    },
    ferme: async () => {
      journal.push("ferme");
    },
    copie: () => {
      journal.push("copie");
      return reglages.copieReussie ?? true;
    },
  };
}

describe("nomDePlanche", () => {
  test("reprend le nom de la session, extension changee", () => {
    expect(nomDePlanche("data/sessions/Gloup_20260804-2100_20260804-2359.json")).toBe(
      "Gloup_20260804-2100_20260804-2359.png",
    );
  });
});

describe("fabriqueLaPlanche", () => {
  test("ecrit le PNG et rend ses dimensions", async () => {
    const dossier = await mkdtemp(join(tmpdir(), "planches-"));
    try {
      const resultat = await fabriqueLaPlanche(
        "data/sessions/Gloup_20260804-2100_20260804-2359.json",
        outils({ hauteur: 3120 }),
        dossier,
      );

      expect(resultat.chemin).toBe(
        join(dossier, "Gloup_20260804-2100_20260804-2359.png"),
      );
      expect(resultat.hauteur).toBe(3120);
      expect(resultat.largeur).toBe(1080);
      expect(resultat.octets).toBe(PNG_FACTICE.byteLength);
      expect(new Uint8Array(await readFile(resultat.chemin))).toEqual(PNG_FACTICE);
    } finally {
      await rm(dossier, { recursive: true, force: true });
    }
  });

  test("annonce le presse-papier seulement quand il a recu l'image", async () => {
    const dossier = await mkdtemp(join(tmpdir(), "planches-"));
    try {
      const reussi = await fabriqueLaPlanche("a/b.json", outils({ copieReussie: true }), dossier);
      expect(reussi.pressePapier).toBe("copie");

      const rate = await fabriqueLaPlanche("a/b.json", outils({ copieReussie: false }), dossier);
      expect(rate.pressePapier).toBe("indisponible");
    } finally {
      await rm(dossier, { recursive: true, force: true });
    }
  });

  test("refuse une planche plus haute que ce que Chromium sait capturer", async () => {
    const doublure = outils({ hauteur: HAUTEUR_MAXIMALE_PLANCHE + 1 });

    await expect(fabriqueLaPlanche("a/b.json", doublure)).rejects.toThrow(
      /trop haute/i,
    );
    // Rien n'a ete capture : une image noire vaut moins qu'un refus.
    expect(doublure.journal).not.toContain(`capture:${HAUTEUR_MAXIMALE_PLANCHE + 1}`);
  });

  test("ferme la fenetre meme quand la mesure echoue", async () => {
    const doublure = outils();
    doublure.mesure = async () => {
      throw new Error("Chromium n'a pas repondu.");
    };

    await expect(fabriqueLaPlanche("a/b.json", doublure)).rejects.toThrow(
      "Chromium n'a pas repondu.",
    );
    expect(doublure.journal).toContain("ferme");
  });

  test("ferme la fenetre avant d'ecrire, une fois la capture faite", async () => {
    const dossier = await mkdtemp(join(tmpdir(), "planches-"));
    try {
      const doublure = outils();
      await fabriqueLaPlanche("a/b.json", doublure, dossier);
      expect(doublure.journal).toEqual([
        "lis:a/b.json",
        "mesure:1080:true",
        "capture:2400",
        "ferme",
        "copie",
      ]);
    } finally {
      await rm(dossier, { recursive: true, force: true });
    }
  });
});
