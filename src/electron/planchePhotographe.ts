/**
 * L'implementation Electron des outils de planche : une fenetre hors ecran qui
 * charge le document, le mesure, le capture, puis disparait.
 *
 * Seul fichier du chantier qui ne se teste pas en unitaire - il lui faut un
 * vrai Chromium. La logique qu'il sert, elle, est testee dans
 * `plancheHandler.ts`, ou elle est isolee derriere `OutilsDePlanche`.
 *
 * Trois choix a expliquer :
 *
 * 1. **Fichier temporaire plutot que `data:` URL.** La longueur d'une `data:`
 *    URL est plafonnee par Chromium ; une planche de quarante manches n'a pas a
 *    decouvrir cette limite a l'execution.
 * 2. **`offscreen: true`.** Une fenetre simplement `show: false` ne peint pas
 *    forcement, et `capturePage` rendrait alors du vide. Le rendu hors ecran
 *    est le chemin prevu pour capturer sans afficher.
 * 3. **On verifie le presse-papier.** Sous WSLg, une ecriture presse-papier
 *    reussit sans que l'image franchisse la frontiere Windows - le meme piege
 *    que `xdg-open` dans `lienExterne.ts`. On relit donc le presse-papier et on
 *    compare les dimensions, plutot que d'annoncer une copie qu'on n'a pas
 *    constatee.
 *
 * Ecart au brief d'origine : celui-ci ecrivait avec `clipboard.writeImage` et
 * relisait avec `clipboard.readImage`, une API synchrone. L'Electron installe
 * ici (44.3.0) ne la propose plus - son `Clipboard` n'expose que `write` et
 * `read`, asynchrones, bases sur `ClipboardItem` et `Blob` (API web
 * standard). `copie` est donc asynchrone ici, et `OutilsDePlanche.copie`
 * (dans `plancheHandler.ts`) a ete change en consequence, avec son test.
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrowserWindow, clipboard, ClipboardItem, nativeImage } from "electron";
import { readSession } from "../sessionList.ts";
import type { OutilsDePlanche } from "./plancheHandler.ts";

/**
 * Laisse passer deux rafraichissements avant de capturer.
 *
 * Redimensionner la fenetre ne repeint pas instantanement : capturer dans la
 * foulee attrape l'ancienne taille. Deux `requestAnimationFrame` valent mieux
 * qu'une attente en millisecondes, qui serait soit trop courte soit gaspillee.
 */
const ATTENDS_DEUX_IMAGES =
  "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))";

export function outilsDePlanche(): OutilsDePlanche {
  let fenetre: BrowserWindow | undefined;
  let dossier: string | undefined;
  let largeurRendue = 0;

  return {
    lisLaSession: (path) => readSession(path),

    async mesure(html, largeur) {
      dossier = await mkdtemp(join(tmpdir(), "planche-"));
      const fichier = join(dossier, "planche.html");
      await writeFile(fichier, html, "utf8");

      largeurRendue = largeur;
      fenetre = new BrowserWindow({
        show: false,
        width: largeur,
        height: 900,
        webPreferences: {
          offscreen: true,
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
        },
      });
      fenetre.setContentSize(largeur, 900);
      await fenetre.loadFile(fichier);

      const hauteur = (await fenetre.webContents.executeJavaScript(
        "document.documentElement.scrollHeight",
      )) as number;
      return Math.ceil(hauteur);
    },

    async capture(hauteur) {
      if (fenetre === undefined) {
        throw new Error("Aucune fenêtre à capturer : la mesure n'a pas eu lieu.");
      }
      fenetre.setContentSize(largeurRendue, hauteur);
      await fenetre.webContents.executeJavaScript(ATTENDS_DEUX_IMAGES);
      const image = await fenetre.webContents.capturePage();
      return image.toPNG();
    },

    async ferme() {
      fenetre?.destroy();
      fenetre = undefined;
      if (dossier !== undefined) await rm(dossier, { recursive: true, force: true });
      dossier = undefined;
    },

    async copie(png, largeur, hauteur) {
      const octetsPng = Buffer.from(png);
      await clipboard.write([
        new ClipboardItem({
          "image/png": new Blob([octetsPng], { type: "image/png" }),
        }),
      ]);

      // On compare les dimensions plutot que de se contenter d'une simple
      // presence : une image deja presente dans le presse-papier ferait
      // passer un echec pour une reussite.
      const items = await clipboard.read();
      const item = items.find((candidat) => candidat.types.includes("image/png"));
      if (item === undefined) return false;

      const relu = await item.getType("image/png");
      // `getType` rend un `ClipboardBookmark` pour le seul type
      // "electron application/bookmark" : ici, c'est forcement un `Blob`,
      // mais son type declare reste l'union des deux.
      if (!(relu instanceof Blob)) return false;
      const image = nativeImage.createFromBuffer(Buffer.from(await relu.arrayBuffer()));
      if (image.isEmpty()) return false;
      const taille = image.getSize();
      return taille.width === largeur && taille.height === hauteur;
    },
  };
}
