import { describe, expect, test } from "vitest";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import {
  cheminDePlanche,
  fabriqueLaPlanche,
  fabriqueLaPlancheAvecReprise,
  HAUTEUR_MAXIMALE_PLANCHE,
  nomDePlanche,
  TENTATIVES_MAXIMALES_PLANCHE,
  type OutilsDePlanche,
} from "../../src/electron/plancheHandler.ts";
import type { SessionFile } from "../../src/store.ts";
import { LARGEUR_PLANCHE } from "../../src/report/planche.ts";

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

/**
 * Doublure du monde exterieur. `journal` retient ce qui a ete appele. Par
 * defaut, `capture` rend exactement les dimensions demandees (largeur
 * constante de la planche, hauteur mesuree) : aucune troncature a signaler,
 * sauf reglage explicite.
 */
function outils(
  reglages: {
    hauteur?: number;
    echelle?: number;
    copieReussie?: boolean;
    captureLargeur?: number;
    captureHauteur?: number;
  } = {},
): OutilsDePlanche & { journal: string[] } {
  const journal: string[] = [];
  const hauteur = reglages.hauteur ?? 2400;
  return {
    journal,
    lisLaSession: async (path) => {
      journal.push(`lis:${path}`);
      return sessionVide();
    },
    mesure: async (html, largeur) => {
      journal.push(`mesure:${largeur}:${html.length > 0}`);
      return { hauteur, echelle: reglages.echelle ?? 1 };
    },
    capture: async (hauteurDemandee) => {
      journal.push(`capture:${hauteurDemandee}`);
      return {
        png: PNG_FACTICE,
        largeur: reglages.captureLargeur ?? LARGEUR_PLANCHE,
        hauteur: reglages.captureHauteur ?? hauteurDemandee,
      };
    },
    ferme: async () => {
      journal.push("ferme");
    },
    copie: async () => {
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
      expect(resultat.largeur).toBe(LARGEUR_PLANCHE);
      expect(resultat.octets).toBe(PNG_FACTICE.byteLength);
      expect(new Uint8Array(await readFile(resultat.chemin))).toEqual(PNG_FACTICE);
    } finally {
      await rm(dossier, { recursive: true, force: true });
    }
  });

  test("rend un chemin absolu, meme quand plancheDir est relatif", async () => {
    // DEFAULT_PLANCHE_DIR ("data/planches") est relatif au cwd du processus :
    // un chemin relatif ne peut ni se coller dans un explorateur, ni se
    // retrouver sans savoir d'ou l'application a ete lancee.
    const dossierAbsolu = await mkdtemp(join(tmpdir(), "planches-"));
    const dossierRelatif = relative(process.cwd(), dossierAbsolu);
    try {
      const resultat = await fabriqueLaPlanche("a/b.json", outils(), dossierRelatif);
      expect(isAbsolute(resultat.chemin)).toBe(true);
      expect(resultat.chemin).toBe(resolve(dossierRelatif, "b.png"));
    } finally {
      await rm(dossierAbsolu, { recursive: true, force: true });
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

  test("le rejet de copie ne fait pas echouer la fabrication : indisponible, PNG ecrit quand meme", async () => {
    const dossier = await mkdtemp(join(tmpdir(), "planches-"));
    try {
      const doublure = outils();
      doublure.copie = async () => {
        doublure.journal.push("copie-tentee");
        throw new Error("presse-papier hors service");
      };

      const resultat = await fabriqueLaPlanche("a/b.json", doublure, dossier);

      expect(resultat.pressePapier).toBe("indisponible");
      expect(doublure.journal).toContain("copie-tentee");
      expect(new Uint8Array(await readFile(resultat.chemin))).toEqual(PNG_FACTICE);
    } finally {
      await rm(dossier, { recursive: true, force: true });
    }
  });

  test("refuse une planche plus haute que ce que Chromium sait capturer", async () => {
    const dossier = await mkdtemp(join(tmpdir(), "planches-"));
    try {
      const doublure = outils({ hauteur: HAUTEUR_MAXIMALE_PLANCHE + 1 });

      await expect(
        fabriqueLaPlanche("a/b.json", doublure, dossier),
      ).rejects.toThrow(/trop haute/i);
      // Rien n'a ete capture : une image noire vaut moins qu'un refus.
      expect(doublure.journal).not.toContain(`capture:${HAUTEUR_MAXIMALE_PLANCHE + 1}`);
    } finally {
      await rm(dossier, { recursive: true, force: true });
    }
  });

  test("le garde-fou de hauteur porte sur le bitmap reel, pas sur la seule hauteur CSS", async () => {
    // Une hauteur CSS bien en-dessous de la limite, mais qui, une fois
    // l'echelle de l'ecran appliquee, la depasse largement : un ecran HiDPI
    // (echelle 2) ou `--force-device-scale-factor` doit etre refuse comme un
    // ecran standard qui produirait le meme bitmap.
    const dossier = await mkdtemp(join(tmpdir(), "planches-"));
    try {
      const doublure = outils({ hauteur: 10_000, echelle: 2 });

      await expect(
        fabriqueLaPlanche("a/b.json", doublure, dossier),
      ).rejects.toThrow(/trop haute/i);
      expect(doublure.journal).not.toContain("capture:10000");
    } finally {
      await rm(dossier, { recursive: true, force: true });
    }
  });

  test("n'applique pas le garde-fou a la seule hauteur CSS quand l'echelle vaut 1", async () => {
    const dossier = await mkdtemp(join(tmpdir(), "planches-"));
    try {
      const doublure = outils({ hauteur: 10_000, echelle: 1 });
      const resultat = await fabriqueLaPlanche("a/b.json", doublure, dossier);
      expect(resultat.hauteur).toBe(10_000);
    } finally {
      await rm(dossier, { recursive: true, force: true });
    }
  });

  test("ferme la fenetre meme quand la mesure echoue", async () => {
    const dossier = await mkdtemp(join(tmpdir(), "planches-"));
    try {
      const doublure = outils();
      doublure.mesure = async () => {
        throw new Error("Chromium n'a pas repondu.");
      };

      await expect(
        fabriqueLaPlanche("a/b.json", doublure, dossier),
      ).rejects.toThrow("Chromium n'a pas repondu.");
      expect(doublure.journal).toContain("ferme");
    } finally {
      await rm(dossier, { recursive: true, force: true });
    }
  });

  test("un echec de fermeture ne masque pas l'exception en cours", async () => {
    const dossier = await mkdtemp(join(tmpdir(), "planches-"));
    try {
      const doublure = outils();
      doublure.mesure = async () => {
        throw new Error("Chromium n'a pas repondu.");
      };
      doublure.ferme = async () => {
        throw new Error("rm a echoue");
      };

      await expect(
        fabriqueLaPlanche("a/b.json", doublure, dossier),
      ).rejects.toThrow("Chromium n'a pas repondu.");
    } finally {
      await rm(dossier, { recursive: true, force: true });
    }
  });

  test("appelle les outils injectes dans l'ordre : lis, mesure, capture, ferme, copie", async () => {
    const dossier = await mkdtemp(join(tmpdir(), "planches-"));
    try {
      const doublure = outils();
      await fabriqueLaPlanche("a/b.json", doublure, dossier);
      expect(doublure.journal).toEqual([
        "lis:a/b.json",
        `mesure:${LARGEUR_PLANCHE}:true`,
        "capture:2400",
        "ferme",
        "copie",
      ]);
    } finally {
      await rm(dossier, { recursive: true, force: true });
    }
  });

  describe("dimensions reellement capturees", () => {
    test("ne signale rien quand la capture correspond a ce qui etait demande", async () => {
      const dossier = await mkdtemp(join(tmpdir(), "planches-"));
      try {
        const resultat = await fabriqueLaPlanche("a/b.json", outils({ hauteur: 3120 }), dossier);
        expect(resultat.avertissement).toBeUndefined();
      } finally {
        await rm(dossier, { recursive: true, force: true });
      }
    });

    test("avertit quand la capture ne correspond pas a ce qui etait demande", async () => {
      const dossier = await mkdtemp(join(tmpdir(), "planches-"));
      try {
        // La fenetre hors ecran a ete bornee : elle rend un bitmap plus bas
        // que la hauteur mesuree. Le PNG est ecrit quand meme (chemin
        // fiable), mais l'avertissement doit le dire.
        const resultat = await fabriqueLaPlanche(
          "a/b.json",
          outils({ hauteur: 3120, captureHauteur: 2000 }),
          dossier,
        );
        expect(resultat.hauteur).toBe(2000);
        expect(resultat.avertissement).toBeDefined();
        expect(resultat.avertissement).toMatch(/2000/);
        expect(resultat.avertissement).toMatch(/3120/);
      } finally {
        await rm(dossier, { recursive: true, force: true });
      }
    });

    test("avertit quand la largeur capturee ne correspond pas a ce qui etait demande", async () => {
      const dossier = await mkdtemp(join(tmpdir(), "planches-"));
      try {
        // Meme principe que ci-dessus, mais sur la largeur : la fenetre hors
        // ecran a rendu un bitmap moins large que LARGEUR_PLANCHE. Le PNG est
        // ecrit quand meme, mais l'avertissement doit le dire.
        const resultat = await fabriqueLaPlanche(
          "a/b.json",
          outils({ hauteur: 3120, captureLargeur: 1400 }),
          dossier,
        );
        expect(resultat.largeur).toBe(1400);
        expect(resultat.avertissement).toBeDefined();
        expect(resultat.avertissement).toMatch(/1400/);
        expect(resultat.avertissement).toMatch(String(LARGEUR_PLANCHE));
      } finally {
        await rm(dossier, { recursive: true, force: true });
      }
    });
  });
});

describe("fabriqueLaPlancheAvecReprise", () => {
  test("une tentative en echec puis une reussite rend le resultat, et la fabrique a ete appelee deux fois", async () => {
    const dossier = await mkdtemp(join(tmpdir(), "planches-"));
    try {
      let appels = 0;
      const fabrique = (): OutilsDePlanche => {
        appels += 1;
        if (appels === 1) {
          const doublure = outils();
          doublure.mesure = async () => {
            throw new Error("Chromium n'a pas repondu.");
          };
          return doublure;
        }
        return outils({ hauteur: 3120 });
      };

      const resultat = await fabriqueLaPlancheAvecReprise("a/b.json", fabrique, dossier);

      expect(resultat.hauteur).toBe(3120);
      expect(appels).toBe(2);
    } finally {
      await rm(dossier, { recursive: true, force: true });
    }
  });

  test("cinq echecs levent une erreur dont le message parle du rendu graphique", async () => {
    const dossier = await mkdtemp(join(tmpdir(), "planches-"));
    try {
      let appels = 0;
      const fabrique = (): OutilsDePlanche => {
        appels += 1;
        const doublure = outils();
        doublure.mesure = async () => {
          throw new Error("Chromium n'a pas repondu.");
        };
        return doublure;
      };

      await expect(fabriqueLaPlancheAvecReprise("a/b.json", fabrique, dossier)).rejects.toThrow(
        /rendu graphique/i,
      );
      expect(appels).toBe(TENTATIVES_MAXIMALES_PLANCHE);
    } finally {
      await rm(dossier, { recursive: true, force: true });
    }
  });

  test("un succes immediat n'appelle la fabrique qu'une fois", async () => {
    const dossier = await mkdtemp(join(tmpdir(), "planches-"));
    try {
      let appels = 0;
      const fabrique = (): OutilsDePlanche => {
        appels += 1;
        return outils();
      };

      await fabriqueLaPlancheAvecReprise("a/b.json", fabrique, dossier);

      expect(appels).toBe(1);
    } finally {
      await rm(dossier, { recursive: true, force: true });
    }
  });
});

describe("cheminDePlanche", () => {
  const tempDir = () => mkdtemp(join(tmpdir(), "planches-garde-"));

  test("accepte un .png ecrit dans le dossier des planches", async () => {
    const dir = await tempDir();
    try {
      const path = join(dir, "Gloup_x.png");
      await writeFile(path, "png", "utf8");

      await expect(cheminDePlanche(path, dir)).resolves.toBe(resolve(path));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("refuse un chemin hors du dossier des planches", async () => {
    const dir = await tempDir();
    try {
      await expect(cheminDePlanche("/etc/passwd.png", dir)).rejects.toThrow(/refuse/i);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("refuse une evasion par ..", async () => {
    const dir = await tempDir();
    try {
      const evasion = join(dir, "..", "ailleurs.png");
      await expect(cheminDePlanche(evasion, dir)).rejects.toThrow(/refuse/i);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("refuse un fichier qui n'est pas un .png", async () => {
    const dir = await tempDir();
    try {
      const path = join(dir, "notes.txt");
      await writeFile(path, "rien a voir", "utf8");
      await expect(cheminDePlanche(path, dir)).rejects.toThrow(/refuse/i);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("refuse un lien symbolique qui pointe hors du dossier des planches", async () => {
    const dir = await tempDir();
    const ailleurs = await tempDir();
    try {
      const cible = join(ailleurs, "secret.png");
      await writeFile(cible, "png", "utf8");
      const lien = join(dir, "planche.png");
      await symlink(cible, lien);

      await expect(cheminDePlanche(lien, dir)).rejects.toThrow(/refuse/i);
    } finally {
      await rm(dir, { recursive: true, force: true });
      await rm(ailleurs, { recursive: true, force: true });
    }
  });

  test("un dossier voisin dont le nom est prefixe par celui des planches n'est pas pris pour un sous-dossier", async () => {
    const parent = await tempDir();
    try {
      const dir = join(parent, "planches");
      const voisin = join(parent, "planches-evil");
      await mkdir(voisin);
      const cible = join(voisin, "fichier.png");
      await writeFile(cible, "png", "utf8");

      await expect(cheminDePlanche(cible, dir)).rejects.toThrow(/refuse/i);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  test("refuse un chemin contenant un octet NUL avec le meme message que les autres refus", async () => {
    const dir = await tempDir();
    try {
      const avecNul = join(dir, `planche${String.fromCharCode(0)}.png`);
      await expect(cheminDePlanche(avecNul, dir)).rejects.toThrow(/refuse/i);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("n'echoue pas quand le dossier des planches n'existe pas encore", async () => {
    const parent = await tempDir();
    try {
      const dir = join(parent, "jamais-cree");
      await expect(cheminDePlanche(join(dir, "planche.png"), dir)).rejects.toThrow();
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
});
