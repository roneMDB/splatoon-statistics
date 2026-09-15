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

import { mkdir, realpath, writeFile } from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";
import { DEFAULT_PLANCHE_DIR } from "../config.ts";
import { construisLaPlanche, LARGEUR_PLANCHE } from "../report/planche.ts";
import type { SessionFile } from "../store.ts";

/**
 * Au-dela, Chromium rend une image **noire, sans erreur**. Cette limite est
 * celle d'un bitmap reel, en pixels de l'ecran, pas celle du document en
 * pixels CSS : c'est pourquoi le garde-fou ci-dessous la compare a la hauteur
 * **projetee a l'echelle de l'ecran**, pas a la seule hauteur mesuree. A
 * ~320 px la carte, 16 000 px de bitmap fait une cinquantaine de manches a
 * l'echelle 1 : hors d'atteinte pour une soiree, mais un refus explicite vaut
 * mieux qu'un PNG noir de 400 Ko.
 */
export const HAUTEUR_MAXIMALE_PLANCHE = 16_000;

/** Ce que la fabrication rend a la fenetre. */
export type ResultatPlanche = {
  /** Chemin absolu du PNG ecrit. Toujours renseigne : le fichier est le chemin fiable. */
  chemin: string;
  /**
   * Equivalent Windows de `chemin`, pour un utilisateur sous WSL qui va
   * chercher le fichier dans l'explorateur Windows. Renseigne seulement sous
   * WSL, et seulement quand la conversion aboutit (`WSL_DISTRO_NAME` present)
   * - voir `versCheminWindows` dans `wsl.ts`. Absent partout ailleurs :
   * `chemin` reste la reference que le reste du code emploie.
   */
  cheminWindows?: string;
  /** Largeur reellement capturee, en pixels — pas l'intention. Voir `capture`. */
  largeur: number;
  /** Hauteur reellement capturee, en pixels — pas l'intention. Voir `capture`. */
  hauteur: number;
  octets: number;
  /**
   * `copie` seulement quand le presse-papier a **reellement** recu l'image,
   * verification faite. Voir `planchePhotographe.ts`.
   */
  pressePapier: "copie" | "indisponible";
  /**
   * Present seulement quand la capture n'a pas rendu les dimensions
   * demandees : la fenetre hors ecran a ete bornee par le compositeur ou par
   * une limite de surface, et le PNG peut donc etre tronque. Le fichier est
   * ecrit quand meme - a toi de decider si tu le gardes - mais l'application
   * ne doit annoncer que ce qu'elle a constate, jamais l'intention.
   */
  avertissement?: string;
};

/** Ce que `mesure` constate sur le document charge. */
export type MesurePlanche = {
  /** Hauteur du contenu, en pixels CSS. */
  hauteur: number;
  /**
   * Facteur d'echelle de l'ecran (`devicePixelRatio`) : 1 pour un ecran
   * standard, 1.25 ou 2 pour un ecran HiDPI ou avec
   * `--force-device-scale-factor`. Necessaire pour projeter la hauteur en
   * pixels **reels** que Chromium va produire - voir `HAUTEUR_MAXIMALE_PLANCHE`.
   */
  echelle: number;
};

/** Ce que `capture` rend : le PNG, et ce qu'il mesure vraiment. */
export type CapturePlanche = {
  png: Uint8Array;
  /** Largeur reellement capturee, en pixels. Peut differer de l'intention. */
  largeur: number;
  /** Hauteur reellement capturee, en pixels. Peut differer de l'intention. */
  hauteur: number;
};

/** Le monde exterieur, injecte. */
export type OutilsDePlanche = {
  /** Relit la session. Refuse tout chemin hors du dossier des sessions. */
  lisLaSession: (path: string) => Promise<SessionFile>;
  /** Charge le document a cette largeur et rend ce qu'il constate. */
  mesure: (html: string, largeur: number) => Promise<MesurePlanche>;
  /**
   * Capture le document deja charge, a la hauteur CSS indiquee, et rend les
   * dimensions **reellement** capturees en plus du PNG - jamais l'intention.
   */
  capture: (hauteur: number) => Promise<CapturePlanche>;
  /** Libere la fenetre hors ecran et ses fichiers temporaires. Appelee quoi qu'il arrive. */
  ferme: () => Promise<void>;
  /**
   * Tente le presse-papier et dit s'il a reellement recu **ce** PNG - compare
   * au fichier qu'on vient d'ecrire, jamais a une intention en pixels CSS.
   * Voir `planchePhotographe.ts`.
   *
   * Asynchrone : l'API presse-papier d'Electron ne connait plus de version
   * synchrone pour les images (`writeImage`/`readImage` ont disparu du
   * `Clipboard` installe ici, remplaces par `write`/`read` bases sur
   * `ClipboardItem` et `Blob`, tous deux asynchrones).
   */
  copie: (png: Uint8Array) => Promise<boolean>;
};

/** `…/Gloup_20260804-2100_20260804-2359.json` -> `Gloup_20260804-2100_20260804-2359.png`. */
export function nomDePlanche(cheminDeSession: string): string {
  return `${basename(cheminDeSession, ".json")}.png`;
}

/**
 * Refuse tout chemin qui sort du dossier des planches, ou qui n'est pas un
 * `.png`.
 *
 * Le chemin vient de la fenetre, potentiellement compromise : c'est cette
 * garde qui protege le canal qui revele la planche dans l'explorateur.
 * Sans elle, un rendu altere ferait ouvrir n'importe quel fichier accessible
 * a l'utilisateur.
 *
 * Meme raisonnement que `cheminDeSession` dans `sessionList.ts`, adapte au
 * dossier et a l'extension des planches : le controle syntaxique
 * (`startsWith`/`endsWith`) ne suffit pas seul, un lien symbolique depose
 * dans le dossier des planches et pointant ailleurs le traverserait sans
 * etre detecte. On resout donc aussi la cible reelle avec `realpath`, racine
 * comprise - un dossier de planches deporte par lien symbolique doit rester
 * utilisable.
 *
 * Un dossier des planches absent (ENOENT) n'est pas une erreur ici : c'est
 * l'etat normal avant la premiere planche, et la racine syntaxique sert
 * alors de repli - le chemin demande echouera de toute facon plus loin, sur
 * son propre `realpath`.
 */
export async function cheminDePlanche(
  path: string,
  plancheDir: string = DEFAULT_PLANCHE_DIR,
): Promise<string> {
  const resolu = resolve(path);
  const racineSyntaxique = resolve(plancheDir);
  if (!resolu.startsWith(racineSyntaxique + sep) || !resolu.endsWith(".png")) {
    throw new Error(`Chemin de planche refuse : ${path}`);
  }

  let racine: string;
  try {
    racine = await realpath(racineSyntaxique);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      racine = racineSyntaxique;
    } else {
      throw error;
    }
  }

  let reel: string;
  try {
    reel = await realpath(resolu);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ERR_INVALID_ARG_VALUE") {
      throw new Error(`Chemin de planche refuse : ${path}`);
    }
    throw error;
  }
  if (!reel.startsWith(racine + sep)) {
    throw new Error(`Chemin de planche refuse : ${path}`);
  }

  return resolu;
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
 * le chemin fiable, le presse-papier n'est que le raccourci. Et le
 * presse-papier ne doit jamais faire echouer la fabrication : un rejet de
 * `copie` (implementation defaillante, presse-papier indisponible) vaut
 * "indisponible", jamais une exception - le fichier est deja ecrit, il ne
 * doit pas etre perdu pour un raccourci qui n'a jamais ete la partie fiable.
 */
export async function fabriqueLaPlanche(
  path: string,
  outils: OutilsDePlanche,
  plancheDir: string = DEFAULT_PLANCHE_DIR,
): Promise<ResultatPlanche> {
  const file = await outils.lisLaSession(path);
  const html = construisLaPlanche(file);

  let capture: CapturePlanche;
  let hauteurDemandee: number;
  let enErreur = false;
  try {
    const { hauteur, echelle } = await outils.mesure(html, LARGEUR_PLANCHE);
    hauteurDemandee = hauteur;

    // Le bitmap que Chromium va produire fait hauteur x echelle pixels, pas
    // hauteur pixels : sans la projection, un ecran HiDPI laisserait passer
    // une planche qui depasse la vraie limite, precisement le PNG noir que ce
    // garde-fou existe pour empecher.
    const hauteurReelleProjetee = Math.ceil(hauteur * echelle);
    if (hauteurReelleProjetee > HAUTEUR_MAXIMALE_PLANCHE) {
      throw new Error(
        `Planche trop haute pour être capturée : ${hauteurReelleProjetee} px une fois ` +
          `l'échelle de l'écran appliquée (${hauteur} px à l'échelle ${echelle}), pour ` +
          `${HAUTEUR_MAXIMALE_PLANCHE} px au maximum. Au-delà, la capture ` +
          `rendrait une image noire sans le dire.`,
      );
    }
    capture = await outils.capture(hauteur);
  } catch (erreur) {
    enErreur = true;
    throw erreur;
  } finally {
    try {
      await outils.ferme();
    } catch (erreurFermeture) {
      // Un echec de fermeture ne doit jamais masquer une exception deja en
      // cours (la garde de hauteur ci-dessus, par exemple) : sans ce garde,
      // le message soigneusement redige disparaitrait derriere un `rm` en
      // echec. On ne le laisse remplacer l'erreur courante que s'il n'y en a
      // pas deja une.
      if (!enErreur) throw erreurFermeture;
      console.error("Fermeture de la fenêtre de planche en échec :", erreurFermeture);
    }
  }

  await mkdir(plancheDir, { recursive: true });
  // Chemin absolu : c'est le produit principal, celui que l'utilisateur doit
  // pouvoir coller dans un explorateur sans savoir d'ou l'application a ete
  // lancee.
  const chemin = resolve(join(plancheDir, nomDePlanche(path)));
  await writeFile(chemin, capture.png);

  let pressePapier: "copie" | "indisponible";
  try {
    pressePapier = (await outils.copie(capture.png)) ? "copie" : "indisponible";
  } catch {
    // Voir le commentaire de tete : le presse-papier n'est que le raccourci.
    pressePapier = "indisponible";
  }

  // On annonce ce qu'on a constate, jamais l'intention : si la capture n'a
  // pas rendu les dimensions demandees, on le dit plutot que de le taire.
  const tronquee = capture.largeur !== LARGEUR_PLANCHE || capture.hauteur !== hauteurDemandee;

  return {
    chemin,
    largeur: capture.largeur,
    hauteur: capture.hauteur,
    octets: capture.png.byteLength,
    pressePapier,
    ...(tronquee
      ? {
          avertissement:
            `Planche capturée à ${capture.largeur} × ${capture.hauteur} px au lieu de ` +
            `${LARGEUR_PLANCHE} × ${hauteurDemandee} px demandés : l'image peut être tronquée.`,
        }
      : {}),
  };
}

/**
 * Tentatives maximales avant d'abandonner.
 *
 * Mesure sur la machine de developpement (WSLg), planche de 21 manches, avec
 * SwiftShader deja pose en ligne de commande : la panne residuelle du GPU est
 * intermittente, et une reprise la rattrape le plus souvent - 7 succes sur 8
 * jusqu'a 5 essais. Au-dela, la depense n'a plus de sens : quand le GPU est
 * definitivement mort, aucune reprise ne le ressuscite.
 */
export const TENTATIVES_MAXIMALES_PLANCHE = 5;

/** Pause entre deux tentatives, en ms : le temps de laisser souffler un GPU intermittent. */
const PAUSE_ENTRE_TENTATIVES_MS = 250;

function attend(ms: number): Promise<void> {
  return new Promise((donneLaMain) => setTimeout(donneLaMain, ms));
}

/**
 * Enveloppe `fabriqueLaPlanche` d'une reprise, pour la panne GPU intermittente
 * de WSLg (voir `src/wsl.ts` et `src/lanceApp.ts`).
 *
 * Chaque tentative repart d'outils neufs : une fenetre hors ecran deja
 * detruite par `ferme()` ne se recycle pas. C'est pourquoi cette fonction
 * prend une **fabrique** d'outils, appelee une fois par tentative, plutot que
 * des outils deja construits - a la difference de `fabriqueLaPlanche`, dont la
 * signature ne change pas ici.
 *
 * Quand les `TENTATIVES_MAXIMALES_PLANCHE` tentatives ont toutes echoue,
 * l'erreur levee ne repete pas seulement la derniere exception technique :
 * elle dit ce qui se passe, pour quelqu'un qui ne connait pas WSLg.
 */
export async function fabriqueLaPlancheAvecReprise(
  path: string,
  fabriqueOutils: () => OutilsDePlanche,
  plancheDir: string = DEFAULT_PLANCHE_DIR,
): Promise<ResultatPlanche> {
  let derniereErreur: unknown;

  for (let tentative = 1; tentative <= TENTATIVES_MAXIMALES_PLANCHE; tentative++) {
    try {
      return await fabriqueLaPlanche(path, fabriqueOutils(), plancheDir);
    } catch (erreur) {
      derniereErreur = erreur;
      if (tentative < TENTATIVES_MAXIMALES_PLANCHE) {
        await attend(PAUSE_ENTRE_TENTATIVES_MS);
      }
    }
  }

  const detail = derniereErreur instanceof Error ? derniereErreur.message : String(derniereErreur);
  throw new Error(
    `Le rendu graphique de la machine ne répond plus, même après ${TENTATIVES_MAXIMALES_PLANCHE} ` +
      `tentatives. C'est un défaut connu de WSLg : le processus GPU de Chromium ne survit pas ` +
      `toujours à l'usage. Relancer l'application, ou WSL lui-même si elle ne redémarre plus, ` +
      `rétablit généralement la capture. Dernière erreur rencontrée : ${detail}`,
  );
}
