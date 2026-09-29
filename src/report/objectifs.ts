/**
 * Mes objectifs par arme, confrontes a une manche.
 *
 * Un objectif se juge manche par manche et non sur la moyenne de la session :
 * « 5 morts au plus » tenu en moyenne peut cacher une manche a neuf morts, et
 * c'est elle qu'on veut voir.
 *
 * Les objectifs sont poses pour une manche entiere : cinq minutes dans les
 * modes objectif, trois en guerre de territoire. Une manche ecourtee - un KO,
 * subi ou inflige - est jugee au prorata du temps joue : 1:52 de jeu sur cinq
 * minutes, c'est 37 % d'une manche, donc 37 % des objectifs. Trois choix
 * encadrent ce prorata :
 *
 * - **L'arrondi est exigeant** : les morts permises vers le bas, les speciaux
 *   attendus vers le haut. On ne meurt pas 1,9 fois ; accorder 2 morts serait
 *   accorder plus que l'objectif.
 * - **Rien n'est remonte au-dela de cinq minutes** : une prolongation garde
 *   les objectifs d'une manche entiere. Elle ajoute rarement plus d'une
 *   demi-minute, et la regle reste simple.
 * - **Sous une minute, la manche n'est pas jugee** : les objectifs y tombent
 *   a zero, et un match nul de 13 secondes serait « tenu » sans avoir joue.
 *
 * La regle vit ici, une fois, pour que le compte rendu, l'en-tete et les
 * cartes de la planche jugent de la meme facon.
 */

import type { ObjectifsArme } from "../reglages.ts";

/** Duree d'une manche entiere, a laquelle les objectifs sont poses. */
export const DUREE_DE_REFERENCE_SECONDES = 300;

/**
 * Regles dont la manche entiere dure trois minutes. Sans elles, une guerre de
 * territoire jouee jusqu'au bout serait jugee comme ecourtee, a 60 %.
 */
const REGLES_EN_TROIS_MINUTES: ReadonlySet<string> = new Set(["nawabari", "tricolor"]);

/** Duree d'une manche entiere pour une regle ; cinq minutes si elle est inconnue. */
export function dureeDeReference(regle: string | undefined): number {
  return regle !== undefined && REGLES_EN_TROIS_MINUTES.has(regle) ? 180 : DUREE_DE_REFERENCE_SECONDES;
}

/** Duree sous laquelle une manche n'est pas jugee. */
export const DUREE_MINIMALE_JUGEE_SECONDES = 60;

/**
 * Ce qui est juge : mes chiffres sur une manche, sa duree et sa regle (cle
 * stat.ink). Une duree inconnue juge la manche comme entiere : on ne sait pas
 * qu'elle a ete ecourtee.
 */
export type ChiffresJuges = { death: number; special: number; dureeSecondes?: number; regle?: string };

/** Verdict de chaque objectif pose ; une borne absente n'a pas de verdict. */
export type Verdicts = { morts?: boolean; speciaux?: boolean };

/** Le jugement d'une manche : les bornes appliquees, et leur verdict. */
export type Jugement = {
  verdicts: Verdicts;
  /** Les bornes reellement appliquees, apres prorata. */
  bornes: ObjectifsArme;
  /** Vrai quand la manche, ecourtee, a ete jugee au prorata. */
  ajuste: boolean;
};

/**
 * Juge une manche. Rend `undefined` pour une manche trop courte pour l'etre.
 */
export function jugeLaManche(objectifs: ObjectifsArme, chiffres: ChiffresJuges): Jugement | undefined {
  const duree = chiffres.dureeSecondes;
  if (duree !== undefined && duree < DUREE_MINIMALE_JUGEE_SECONDES) return undefined;

  const part = duree === undefined ? 1 : Math.min(1, duree / dureeDeReference(chiffres.regle));
  const bornes: ObjectifsArme = {
    ...(objectifs.mortsMax !== undefined ? { mortsMax: Math.floor(objectifs.mortsMax * part) } : {}),
    ...(objectifs.speciauxMin !== undefined ? { speciauxMin: Math.ceil(objectifs.speciauxMin * part) } : {}),
  };

  return {
    verdicts: {
      ...(bornes.mortsMax !== undefined ? { morts: chiffres.death <= bornes.mortsMax } : {}),
      ...(bornes.speciauxMin !== undefined ? { speciaux: chiffres.special >= bornes.speciauxMin } : {}),
    },
    bornes,
    ajuste: part < 1,
  };
}
