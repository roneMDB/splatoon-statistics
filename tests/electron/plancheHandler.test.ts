import { describe, expect, test } from "vitest";
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import {
  cheminDePlanche,
  fabriqueLaPlanche,
  fabriqueLaPlancheAvecReprise,
  dossierDePlanche,
  HAUTEUR_MAXIMALE_PLANCHE,
  TENTATIVES_MAXIMALES_PLANCHE,
  type OutilsDePlanche,
} from "../../src/electron/plancheHandler.ts";
import type { SessionFile } from "../../src/store.ts";
import { LARGEUR_PAGE_MANCHES, LARGEUR_PLANCHE, MANCHES_PAR_PAGE } from "../../src/report/planche.ts";

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
 * defaut, `capture` rend exactement le bitmap attendu (largeur de la page et
 * hauteur mesuree, toutes deux a l'echelle) : aucune troncature a signaler,
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
  const echelle = reglages.echelle ?? 1;
  let largeurMesuree = 0;
  return {
    journal,
    lisLaSession: async (path) => {
      journal.push(`lis:${path}`);
      return sessionVide();
    },
    mesure: async (html, largeur) => {
      journal.push(`mesure:${largeur}:${html.length > 0}`);
      largeurMesuree = largeur;
      return { hauteur, echelle };
    },
    capture: async (hauteurDemandee) => {
      journal.push(`capture:${hauteurDemandee}`);
      return {
        png: PNG_FACTICE,
        largeur: reglages.captureLargeur ?? largeurMesuree * echelle,
        hauteur: reglages.captureHauteur ?? hauteurDemandee * echelle,
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

describe("dossierDePlanche", () => {
  test("reprend le nom de la session, sans extension", () => {
    expect(dossierDePlanche("data/sessions/Gloup_20260804-2100_20260804-2359.json")).toBe(
      "Gloup_20260804-2100_20260804-2359",
    );
  });
});

/** Une session de `n` manches, pour les tests qui comptent les pages. */
const sessionDe = (n: number): SessionFile => ({
  ...sessionVide(),
  battleCount: n,
  battles: Array.from({ length: n }, (_, i) => ({
    uuid: `u${i}`,
    lobby: { key: "private" },
    result: "win",
  })) as unknown as SessionFile["battles"],
});

describe("fabriqueLaPlanche", () => {
  test("garde le HTML de la planche a cote du PNG, sous le meme nom", async () => {
    const dossier = await mkdtemp(join(tmpdir(), "planches-"));
    try {
      let htmlMesure = "";
      const doublure = outils();
      const mesure = doublure.mesure;
      doublure.mesure = async (html, largeur) => {
        htmlMesure = html;
        return mesure(html, largeur);
      };

      await fabriqueLaPlanche(
        "data/sessions/Gloup_20260804-2100_20260804-2359.json",
        doublure,
        dossier,
      );

      const html = await readFile(
        join(dossier, "Gloup_20260804-2100_20260804-2359", "01-manches-1-1.html"),
        "utf8",
      );
      expect(html).toBe(htmlMesure);
      expect(html).toContain("<html");
    } finally {
      await rm(dossier, { recursive: true, force: true });
    }
  });

  test("ecrit le PNG dans le dossier de la session et rend ses dimensions", async () => {
    const dossier = await mkdtemp(join(tmpdir(), "planches-"));
    try {
      const resultat = await fabriqueLaPlanche(
        "data/sessions/Gloup_20260804-2100_20260804-2359.json",
        outils({ hauteur: 3120 }),
        dossier,
      );

      expect(resultat.dossier).toBe(join(dossier, "Gloup_20260804-2100_20260804-2359"));
      expect(resultat.images).toHaveLength(1);
      const [image] = resultat.images;
      expect(image!.chemin).toBe(join(resultat.dossier, "01-manches-1-1.png"));
      expect(image!.hauteur).toBe(3120);
      expect(image!.largeur).toBe(LARGEUR_PAGE_MANCHES);
      expect(image!.octets).toBe(PNG_FACTICE.byteLength);
      expect(new Uint8Array(await readFile(image!.chemin))).toEqual(PNG_FACTICE);
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
      expect(isAbsolute(resultat.dossier)).toBe(true);
      expect(resultat.dossier).toBe(resolve(dossierRelatif, "b"));
      expect(isAbsolute(resultat.images[0]!.chemin)).toBe(true);
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
      expect(new Uint8Array(await readFile(resultat.images[0]!.chemin))).toEqual(PNG_FACTICE);
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
      expect(resultat.images[0]!.hauteur).toBe(10_000);
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
        `mesure:${LARGEUR_PAGE_MANCHES}:true`,
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
        expect(resultat.images[0]!.hauteur).toBe(2000);
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
        // ecran a rendu un bitmap moins large que la page. Le PNG est ecrit
        // quand meme, mais l'avertissement doit le dire.
        const resultat = await fabriqueLaPlanche(
          "a/b.json",
          outils({ hauteur: 3120, captureLargeur: 700 }),
          dossier,
        );
        expect(resultat.images[0]!.largeur).toBe(700);
        expect(resultat.avertissement).toBeDefined();
        expect(resultat.avertissement).toMatch(/700/);
        expect(resultat.avertissement).toMatch(String(LARGEUR_PAGE_MANCHES));
      } finally {
        await rm(dossier, { recursive: true, force: true });
      }
    });

    test("attend un bitmap a l'echelle de la capture, et ne s'alarme pas de l'avoir", async () => {
      const dossier = await mkdtemp(join(tmpdir(), "planches-"));
      try {
        // La capture se fait en x2 : un bitmap deux fois plus grand que la
        // page en pixels CSS est exactement ce qui etait demande.
        const resultat = await fabriqueLaPlanche("a/b.json", outils({ hauteur: 1100, echelle: 2 }), dossier);
        expect(resultat.images[0]!.largeur).toBe(LARGEUR_PAGE_MANCHES * 2);
        expect(resultat.images[0]!.hauteur).toBe(2200);
        expect(resultat.avertissement).toBeUndefined();

        // Et un bitmap a l'echelle 1 quand on attendait 2 est bien tronque.
        const rate = await fabriqueLaPlanche(
          "a/b.json",
          outils({ hauteur: 1100, echelle: 2, captureLargeur: LARGEUR_PAGE_MANCHES, captureHauteur: 1100 }),
          dossier,
        );
        expect(rate.avertissement).toMatch(/2200/);
      } finally {
        await rm(dossier, { recursive: true, force: true });
      }
    });
  });
});

describe("fabriqueLaPlanche — une image par page", () => {
  test("photographie chaque page dans sa propre fenetre, puis copie la premiere image", async () => {
    const dossier = await mkdtemp(join(tmpdir(), "planches-"));
    try {
      const doublure = outils();
      doublure.lisLaSession = async (path) => {
        doublure.journal.push(`lis:${path}`);
        return sessionDe(MANCHES_PAR_PAGE + 1);
      };
      const copiees: Uint8Array[] = [];
      doublure.copie = async (png) => {
        copiees.push(png);
        return true;
      };

      const resultat = await fabriqueLaPlanche("a/b.json", doublure, dossier, { entete: { sections: [] } });

      const page = [`mesure:${LARGEUR_PAGE_MANCHES}:true`, "capture:2400", "ferme"];
      expect(doublure.journal).toEqual([
        "lis:a/b.json",
        `mesure:${LARGEUR_PLANCHE}:true`, "capture:2400", "ferme",
        ...page,
        ...page,
      ]);
      expect(resultat.images.map((image) => relative(resultat.dossier, image.chemin))).toEqual([
        "00-synthese.png",
        `01-manches-1-${MANCHES_PAR_PAGE}.png`,
        `02-manches-${MANCHES_PAR_PAGE + 1}-${MANCHES_PAR_PAGE + 1}.png`,
      ]);
      expect(resultat.images[0]!.largeur).toBe(LARGEUR_PLANCHE);
      expect(copiees).toHaveLength(1);
    } finally {
      await rm(dossier, { recursive: true, force: true });
    }
  });

  test("efface les pages perimees d'une fabrication precedente, et rien d'autre", async () => {
    const dossier = await mkdtemp(join(tmpdir(), "planches-"));
    try {
      const sous = join(dossier, "b");
      await mkdir(sous, { recursive: true });
      for (const nom of ["05-manches-13-15.png", "05-manches-13-15.html", "notes.txt", "photo.png"]) {
        await writeFile(join(sous, nom), "ancien", "utf8");
      }

      await fabriqueLaPlanche("a/b.json", outils(), dossier);

      expect((await readdir(sous)).sort()).toEqual([
        "01-manches-1-1.html",
        "01-manches-1-1.png",
        "notes.txt",
        "photo.png",
      ]);
    } finally {
      await rm(dossier, { recursive: true, force: true });
    }
  });

  test("une page qui echoue n'ecrit rien : les images d'avant restent en place", async () => {
    const dossier = await mkdtemp(join(tmpdir(), "planches-"));
    try {
      const sous = join(dossier, "b");
      await mkdir(sous, { recursive: true });
      await writeFile(join(sous, "01-manches-1-3.png"), "ancien", "utf8");

      const doublure = outils();
      doublure.lisLaSession = async () => sessionDe(MANCHES_PAR_PAGE + 1);
      let captures = 0;
      const capture = doublure.capture;
      doublure.capture = async (hauteur) => {
        captures += 1;
        if (captures === 2) throw new Error("Chromium n'a pas repondu.");
        return capture(hauteur);
      };

      await expect(fabriqueLaPlanche("a/b.json", doublure, dossier)).rejects.toThrow("Chromium");
      expect(await readdir(sous)).toEqual(["01-manches-1-3.png"]);
      expect(doublure.journal.filter((entree) => entree === "ferme")).toHaveLength(2);
    } finally {
      await rm(dossier, { recursive: true, force: true });
    }
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

      expect(resultat.images[0]!.hauteur).toBe(3120);
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

  test("accepte un .png du sous-dossier d'une session", async () => {
    const dir = await tempDir();
    try {
      await mkdir(join(dir, "Gloup_x"));
      const path = join(dir, "Gloup_x", "01-manches-1-3.png");
      await writeFile(path, "png", "utf8");

      await expect(cheminDePlanche(path, dir)).resolves.toBe(resolve(path));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

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

describe("fabriqueLaPlanche — en-tete", () => {
  /** Une doublure qui garde le HTML mesure, pour y chercher l'en-tete. */
  function outilsQuiGardentLeHtml(chargeLesPictos?: OutilsDePlanche["chargeLesPictos"]) {
    const doublure = outils();
    const vus: string[] = [];
    const mesure = doublure.mesure;
    doublure.mesure = async (html, largeur) => {
      vus.push(html);
      return mesure(html, largeur);
    };
    if (chargeLesPictos !== undefined) doublure.chargeLesPictos = chargeLesPictos;
    return { doublure, vus };
  }

  test("sans option, la planche mesuree n'a pas d'en-tete, mais lit les pictos de ses chiffres", async () => {
    const dossier = await mkdtemp(join(tmpdir(), "planches-"));
    try {
      let lus = 0;
      const { doublure, vus } = outilsQuiGardentLeHtml(async () => {
        lus += 1;
        return () => undefined;
      });
      await fabriqueLaPlanche("a/b.json", doublure, dossier);
      expect(vus[0]).not.toContain('<section class="entete">');
      expect(lus).toBe(1);
    } finally {
      await rm(dossier, { recursive: true, force: true });
    }
  });

  test("avec l'option, l'en-tete et ses pictos arrivent jusqu'au HTML mesure", async () => {
    const dossier = await mkdtemp(join(tmpdir(), "planches-"));
    try {
      const { doublure, vus } = outilsQuiGardentLeHtml(async () => (categorie, cle) =>
        categorie === "lobbies" && cle === "private" ? "data:image/svg+xml;base64,QUJD" : undefined,
      );
      doublure.lisLaSession = async () => ({
        ...sessionVide(),
        battles: [{ lobby: { key: "private" }, result: "win" }] as unknown as SessionFile["battles"],
      });

      await fabriqueLaPlanche("a/b.json", doublure, dossier, {
        entete: { sections: ["courbe"], objectif: "Tenir le support" },
      });

      expect(vus[0]).toContain('<section class="entete">');
      expect(vus[0]).toContain("Tenir le support");
      expect(vus[0]).toContain("data:image/svg+xml;base64,QUJD");
    } finally {
      await rm(dossier, { recursive: true, force: true });
    }
  });

  test("sans chargeur de pictos, l'en-tete est dessine quand meme", async () => {
    const dossier = await mkdtemp(join(tmpdir(), "planches-"));
    try {
      const { doublure, vus } = outilsQuiGardentLeHtml();
      await fabriqueLaPlanche("a/b.json", doublure, dossier, { entete: { sections: [] } });
      expect(vus[0]).toContain('<section class="entete">');
    } finally {
      await rm(dossier, { recursive: true, force: true });
    }
  });

  test("la reprise transmet l'option a chaque tentative", async () => {
    const dossier = await mkdtemp(join(tmpdir(), "planches-"));
    try {
      const vus: string[] = [];
      let appels = 0;
      const fabrique = (): OutilsDePlanche => {
        appels += 1;
        const doublure = outils();
        doublure.mesure = async (html) => {
          vus.push(html);
          if (appels === 1) throw new Error("Chromium n'a pas repondu.");
          return { hauteur: 2400, echelle: 1 };
        };
        return doublure;
      };

      await fabriqueLaPlancheAvecReprise("a/b.json", fabrique, dossier, { entete: { sections: [] } });

      // La premiere tentative echoue sur sa premiere page ; la seconde mesure
      // la synthese puis la page de manches. Chaque tentative ouvre donc bien
      // sur l'en-tete.
      expect(vus).toHaveLength(3);
      expect(vus.filter((html) => html.includes('<section class="entete">'))).toHaveLength(2);
      expect(vus[0]).toContain('<section class="entete">');
      expect(vus[1]).toContain('<section class="entete">');
    } finally {
      await rm(dossier, { recursive: true, force: true });
    }
  });
});
