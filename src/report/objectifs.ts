/**
 * Mes objectifs par arme, confrontes a une manche.
 *
 * Un objectif se juge manche par manche et non sur la moyenne de la session :
 * « 5 morts au plus » tenu en moyenne peut cacher une manche a neuf morts, et
 * c'est elle qu'on veut voir.
 *
 * Seule une manche allee au bout est jugee : un KO, subi ou inflige, coupe la
 * manche avant son terme, et ses chiffres ne se comparent pas a ceux d'une
 * manche entiere. La regle vit ici, une fois, pour que le compte
 * rendu, l'en-tete et les cartes de la planche jugent de la meme facon.
 */

import type { ObjectifsArme } from "../reglages.ts";

/** Ce qui est juge : mes chiffres sur une manche, et si elle a fini par KO. */
export type ChiffresJuges = { death: number; special: number; ko: boolean };

/** Verdict de chaque objectif pose ; une borne absente n'a pas de verdict. */
export type Verdicts = { morts?: boolean; speciaux?: boolean };

/** Une manche terminee par KO n'est pas jugee : aucun verdict. */
export function jugeLaManche(objectifs: ObjectifsArme, chiffres: ChiffresJuges): Verdicts {
  if (chiffres.ko) return {};
  return {
    ...(objectifs.mortsMax !== undefined ? { morts: chiffres.death <= objectifs.mortsMax } : {}),
    ...(objectifs.speciauxMin !== undefined ? { speciaux: chiffres.special >= objectifs.speciauxMin } : {}),
  };
}
