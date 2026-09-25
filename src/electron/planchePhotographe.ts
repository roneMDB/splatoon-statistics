/**
 * L'implementation Electron des outils de planche : une fenetre hors ecran qui
 * charge le document, le mesure, le capture, puis disparait.
 *
 * Seul fichier du chantier qui ne se teste pas en unitaire - il lui faut un
 * vrai Chromium. La logique qu'il sert, elle, est testee dans
 * `plancheHandler.ts`, ou elle est isolee derriere `OutilsDePlanche`.
 *
 * Quatre choix a expliquer :
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
 *    constatee. La comparaison se fait contre le PNG qu'on vient d'ecrire, pas
 *    contre une intention en pixels CSS : voir le commentaire de `copie`
 *    ci-dessous, c'est subtil.
 * 4. **Des delais de garde sur tout aller-retour avec Chromium.** `loadFile`,
 *    la mesure, `capturePage()` et le presse-papier peuvent chacun ne jamais
 *    rendre la main - en rendu hors ecran, c'est le compositeur qui pilote
 *    `requestAnimationFrame`, et sans image emise la promesse ne se resout
 *    jamais ; sous WSLg, `clipboard.read()` peut attendre indefiniment le
 *    proprietaire de la selection X. Sans garde, `fabriqueLaPlanche` ne rend
 *    jamais la main, le bouton reste verrouille pour toujours, et le seul
 *    recours est de relancer l'application.
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
import { chargeLesPictos } from "../report/pictos.ts";
import { readSession } from "../sessionList.ts";
import type { CapturePlanche, MesurePlanche, OutilsDePlanche } from "./plancheHandler.ts";

/**
 * Laisse passer deux rafraichissements avant de capturer.
 *
 * Redimensionner la fenetre ne repeint pas instantanement : capturer dans la
 * foulee attrape l'ancienne taille. Deux `requestAnimationFrame` valent mieux
 * qu'une attente en millisecondes, qui serait soit trop courte soit gaspillee.
 */
const ATTENDS_DEUX_IMAGES =
  "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))";

/**
 * Pause apres les deux images, avant `capturePage()`.
 *
 * Les deux `requestAnimationFrame` disent que le **rendu** a vu la nouvelle
 * taille, pas que le **compositeur** a deja reconstruit la surface hors ecran
 * a cette taille. Capturer dans cet intervalle echoue en moins de 100 ms sur
 * `UnknownVizError` - la panne qu'on attribuait au seul GPU de WSLg. Mesure
 * sur la machine de developpement (WSLg, SwiftShader, planche de 3745 px) :
 * sans pause, 4 captures sur 8 ; avec 250 ms, 8 sur 8, comme avec 500 ms.
 * Une reprise qui recree la fenetre refait la meme course : c'est pourquoi
 * cinq tentatives pouvaient toutes echouer.
 */
const PAUSE_APRES_REDIMENSIONNEMENT_MS = 250;

/** Delai de garde sur un aller-retour Chromium qui peut ne jamais rendre la main. */
const DELAI_LONG_MS = 30_000;

/**
 * Delai de garde sur le presse-papier, nettement plus court : un
 * gestionnaire de presse-papier absent ou fige (WSLg degrade) ne doit pas
 * faire attendre l'utilisateur aussi longtemps qu'un rendu Chromium complet,
 * d'autant que rater le presse-papier n'est jamais fatal - voir `copie`.
 */
const DELAI_COURT_MS = 8_000;

/**
 * Court-circuite une promesse qui ne repond pas, avec un message qui dit ce
 * qui n'a pas repondu plutot que de laisser l'appelant en suspens pour
 * toujours.
 */
function avecDelaiDeGarde<T>(promesse: Promise<T>, delaiMs: number, quoi: string): Promise<T> {
  return new Promise((donneLaMain, casse) => {
    const minuteur = setTimeout(() => {
      casse(new Error(`${quoi} n'a pas répondu en ${Math.round(delaiMs / 1000)} s.`));
    }, delaiMs);
    promesse.then(
      (valeur) => {
        clearTimeout(minuteur);
        donneLaMain(valeur);
      },
      (erreur: unknown) => {
        clearTimeout(minuteur);
        casse(erreur);
      },
    );
  });
}

export function outilsDePlanche(): OutilsDePlanche {
  let fenetre: BrowserWindow | undefined;
  let dossier: string | undefined;
  let largeurRendue = 0;

  return {
    lisLaSession: (path) => readSession(path),
    chargeLesPictos: (file) => chargeLesPictos(file),

    async mesure(html, largeur): Promise<MesurePlanche> {
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
      await avecDelaiDeGarde(fenetre.loadFile(fichier), DELAI_LONG_MS, "Le chargement de la planche");

      const [hauteur, echelle] = await avecDelaiDeGarde(
        Promise.all([
          // Apres les polices : l'en-tete embarque celles du jeu, et une
          // mesure prise avant leur application donnerait la hauteur du texte
          // en police de repli - une capture tronquee ou trop longue.
          fenetre.webContents.executeJavaScript(
            "document.fonts.ready.then(() => document.documentElement.scrollHeight)",
          ),
          fenetre.webContents.executeJavaScript("window.devicePixelRatio"),
        ]),
        DELAI_LONG_MS,
        "La mesure de la planche",
      ) as [number, number];

      return { hauteur: Math.ceil(hauteur), echelle };
    },

    async capture(hauteur): Promise<CapturePlanche> {
      if (fenetre === undefined) {
        throw new Error("Aucune fenêtre à capturer : la mesure n'a pas eu lieu.");
      }
      fenetre.setContentSize(largeurRendue, hauteur);
      await avecDelaiDeGarde(
        fenetre.webContents.executeJavaScript(ATTENDS_DEUX_IMAGES),
        DELAI_LONG_MS,
        "L'attente du rendu de la planche",
      );
      await new Promise((donneLaMain) => setTimeout(donneLaMain, PAUSE_APRES_REDIMENSIONNEMENT_MS));
      const image = await avecDelaiDeGarde(
        fenetre.webContents.capturePage(),
        DELAI_LONG_MS,
        "La capture de la planche",
      );

      // Les dimensions reellement capturees, pas l'intention : une fenetre
      // bornee par le compositeur ou par une limite de surface rendrait
      // sinon une image tronquee que l'application annoncerait comme
      // conforme. Voir `plancheHandler.ts`.
      const taille = image.getSize();
      return { png: image.toPNG(), largeur: taille.width, hauteur: taille.height };
    },

    async ferme() {
      fenetre?.destroy();
      fenetre = undefined;
      if (dossier !== undefined) await rm(dossier, { recursive: true, force: true });
      dossier = undefined;
    },

    async copie(png) {
      // Meme raisonnement que `saitOuvrirUnLien` dans `lienExterne.ts` : un
      // appel systeme qui reussit ne prouve rien en soi, seul le constat
      // compte. Ici, le constat peut lui-meme echouer - `write()` ou `read()`
      // rejetes faute de gestionnaire de presse-papier actif (WSLg degrade,
      // session sans serveur X, CI), ou trop lents (voir `DELAI_COURT_MS`).
      // L'ancienne API `writeImage`/`readImage` echouait en silence ; rien ne
      // garantit que `write`/`read`, promesses web-standard, en fassent
      // autant. Sans ce filet, un rejet remonterait hors de
      // `fabriqueLaPlanche` **apres** que le PNG a ete ecrit sur disque :
      // toute sortie anormale - rejet, delai depasse, entree "image/png"
      // absente, dimensions qui ne correspondent pas - vaut donc
      // "indisponible", jamais une exception.
      try {
        const octetsEcrits = Buffer.from(png);
        await avecDelaiDeGarde(
          clipboard.write([
            new ClipboardItem({
              "image/png": new Blob([octetsEcrits], { type: "image/png" }),
            }),
          ]),
          DELAI_COURT_MS,
          "L'écriture dans le presse-papier",
        );

        const items = await avecDelaiDeGarde(clipboard.read(), DELAI_COURT_MS, "La lecture du presse-papier");
        const item = items.find((candidat) => candidat.types.includes("image/png"));
        if (item === undefined) return false;

        const relu = await item.getType("image/png");
        // `getType` rend un `ClipboardBookmark` pour le seul type
        // "electron application/bookmark" : ici, c'est forcement un `Blob`,
        // mais son type declare reste l'union des deux.
        if (!(relu instanceof Blob)) return false;
        const octetsRelus = Buffer.from(await relu.arrayBuffer());

        // On compare les dimensions du PNG relu a celles du PNG qu'on vient
        // d'ecrire - jamais a une intention en pixels CSS. C'est subtil :
        // `capturePage()` produit un bitmap de CSS x devicePixelRatio pixels,
        // et `nativeImage.createFromBuffer` sur des octets PNG bruts n'a
        // aucune idee de cette echelle - il traite le buffer comme une seule
        // representation a l'echelle 1, donc `getSize()` rend alors la
        // taille reelle en pixels du bitmap, pas la taille CSS demandee. A
        // l'echelle 1 les deux coincident, mais sur un ecran HiDPI (1.25, 2,
        // `--force-device-scale-factor`) comparer ce resultat a la largeur et
        // la hauteur CSS ferait echouer une copie pourtant reussie. En
        // decodant les DEUX cotes - le PNG ecrit et le PNG relu - de la meme
        // maniere, la comparaison reste juste quelle que soit l'echelle de
        // l'ecran, sans avoir besoin de la connaitre ici. Elle continue aussi
        // de proteger contre une image deja presente dans le presse-papier :
        // ses dimensions n'ont aucune raison de coincider avec celles de la
        // planche qu'on vient de produire.
        const tailleEcrite = nativeImage.createFromBuffer(octetsEcrits).getSize();
        const tailleRelue = nativeImage.createFromBuffer(octetsRelus).getSize();
        if (tailleRelue.width === 0 && tailleRelue.height === 0) return false;
        return tailleEcrite.width === tailleRelue.width && tailleEcrite.height === tailleRelue.height;
      } catch {
        return false;
      }
    },
  };
}
