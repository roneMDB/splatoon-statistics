/**
 * Fabrication d'une planche : du fichier de session au PNG sur disque.
 *
 * Ce module n'importe pas `electron`. Tout ce qui exige un vrai Chromium ou un
 * vrai systeme - charger un document, le mesurer, le capturer, ecrire dans le
 * presse-papier - lui est **injecte** sous la forme d'`OutilsDePlanche`. C'est
 * ce qui permet de tester ici le garde-fou de hauteur, l'ordre des operations
 * et le nommage du fichier, sans lancer d'application.
 *
 * `src/electron/planchePhotographe.ts` fournit l'implementation reelle de ces
 * outils.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { DEFAULT_PLANCHE_DIR } from "../config.ts";
import { construisLaPlanche, LARGEUR_PLANCHE } from "../report/planche.ts";
import type { SessionFile } from "../store.ts";

/**
 * Au-dela, Chromium rend une image **noire, sans erreur**. A ~320 px la carte,
 * cela fait une cinquantaine de manches : hors d'atteinte pour une soiree, mais
 * un refus explicite vaut mieux qu'un PNG noir de 400 Ko.
 */
export const HAUTEUR_MAXIMALE_PLANCHE = 16_000;

/** Ce que la fabrication rend a la fenetre. */
export type ResultatPlanche = {
  /** Chemin du PNG ecrit. Toujours renseigne : le fichier est le chemin fiable. */
  chemin: string;
  largeur: number;
  hauteur: number;
  octets: number;
  /**
   * `copie` seulement quand le presse-papier a **reellement** recu l'image,
   * verification faite. Voir `planchePhotographe.ts`.
   */
  pressePapier: "copie" | "indisponible";
};

/** Le monde exterieur, injecte. */
export type OutilsDePlanche = {
  /** Relit la session. Refuse tout chemin hors du dossier des sessions. */
  lisLaSession: (path: string) => Promise<SessionFile>;
  /** Charge le document a cette largeur et rend la hauteur de son contenu, en pixels. */
  mesure: (html: string, largeur: number) => Promise<number>;
  /** Capture le document deja charge, a la hauteur indiquee. */
  capture: (hauteur: number) => Promise<Uint8Array>;
  /** Libere la fenetre hors ecran et ses fichiers temporaires. Appelee quoi qu'il arrive. */
  ferme: () => Promise<void>;
  /** Tente le presse-papier et dit s'il a reellement recu l'image. */
  copie: (png: Uint8Array, largeur: number, hauteur: number) => boolean;
};

/** `…/Gloup_20260804-2100_20260804-2359.json` -> `Gloup_20260804-2100_20260804-2359.png`. */
export function nomDePlanche(cheminDeSession: string): string {
  return `${basename(cheminDeSession, ".json")}.png`;
}

/**
 * Fabrique la planche d'une session et l'ecrit sur disque.
 *
 * L'ordre voulu : on mesure avant de capturer pour pouvoir refuser une planche
 * trop haute, et on ferme la fenetre avant d'ecrire - une fenetre ouverte
 * pendant une ecriture disque ne sert a rien. Le `finally` garantit que la
 * fenetre se ferme meme si la mesure ou la capture echoue ; en revanche,
 * `writeFile` n'etant pas injecte, rien ne verifie par test qu'il s'execute
 * bien apres `ferme()` - c'est l'ordre du code ci-dessous qui en decide.
 *
 * Le PNG est toujours ecrit, meme quand le presse-papier a fonctionne : c'est
 * le chemin fiable, le presse-papier n'est que le raccourci.
 */
export async function fabriqueLaPlanche(
  path: string,
  outils: OutilsDePlanche,
  plancheDir: string = DEFAULT_PLANCHE_DIR,
): Promise<ResultatPlanche> {
  const file = await outils.lisLaSession(path);
  const html = construisLaPlanche(file);

  let hauteur: number;
  let png: Uint8Array;
  try {
    hauteur = await outils.mesure(html, LARGEUR_PLANCHE);
    if (hauteur > HAUTEUR_MAXIMALE_PLANCHE) {
      throw new Error(
        `Planche trop haute pour être capturée : ${hauteur} px, pour ` +
          `${HAUTEUR_MAXIMALE_PLANCHE} px au maximum. Au-delà, la capture ` +
          `rendrait une image noire sans le dire.`,
      );
    }
    png = await outils.capture(hauteur);
  } finally {
    await outils.ferme();
  }

  await mkdir(plancheDir, { recursive: true });
  const chemin = join(plancheDir, nomDePlanche(path));
  await writeFile(chemin, png);

  return {
    chemin,
    largeur: LARGEUR_PLANCHE,
    hauteur,
    octets: png.byteLength,
    pressePapier: outils.copie(png, LARGEUR_PLANCHE, hauteur) ? "copie" : "indisponible",
  };
}
