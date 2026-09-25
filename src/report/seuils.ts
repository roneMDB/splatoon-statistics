/**
 * Seuils de la redaction.
 *
 * La regle du compte rendu : une phrase n'est ecrite que si le fait qu'elle
 * enonce est constate. Ces constantes disent ou passe la frontiere, en un seul
 * endroit, pour qu'elle soit discutable et testable plutot que dispersee dans
 * des `if` au fil des sections.
 *
 * Les valeurs se reglent dans `settings.json`, cle `seuils` (voir
 * `reglages.ts`) ; les commentaires ci-dessous decrivent les valeurs par
 * defaut.
 */

import { REGLAGES } from "../reglages.ts";

const { seuils } = REGLAGES;

/** Defaites consecutives en fin de session a partir desquelles on parle de decrochage. */
export const SERIE_FINALE_MINIMALE = seuils.serieFinaleMinimale;

/** Victoires consecutives en ouverture a partir desquelles on parle d'entree reussie. */
export const SERIE_INITIALE_MINIMALE = seuils.serieInitialeMinimale;

/**
 * Duree sous laquelle une manche perdue n'est plus un match mais un ecrasement.
 * Une manche complete dure environ cinq minutes ; trois minutes, c'est deja un
 * KO encaisse avant toute mise en place.
 */
export const MANCHE_COURTE_SECONDES = seuils.mancheCourteSecondes;

/** Ecart de score sous lequel une defaite compte comme serree. */
export const DEFAITE_SERREE_ECART = seuils.defaiteSerreeEcart;

/**
 * Ecart relatif entre les deux moities de session a partir duquel la baisse
 * merite d'etre signalee. En dessous, c'est du bruit.
 */
export const BAISSE_DE_REGIME_RELATIVE = seuils.baisseDeRegimeRelative;

/** Manches minimales pour qu'un mode sans victoire soit autre chose qu'un accident. */
export const MODE_EN_ECHEC_MANCHES = seuils.modeEnEchecManches;

/** Stages distincts minimaux pour conclure que c'est le mode et non la carte. */
export const MODE_EN_ECHEC_STAGES = seuils.modeEnEchecStages;

/**
 * Manches minimales pour qu'un mode soit designe comme le point fort de la
 * session. Sans ce plancher, un mode joue une seule fois et gagne une seule
 * fois passerait devant un mode gagne deux fois sur trois.
 */
export const MEILLEUR_MODE_MANCHES = seuils.meilleurModeManches;

/**
 * Part de la session a partir de laquelle un joueur compte comme regulier.
 *
 * Les compositions bougent en cours de soiree : quelqu'un qui a joue deux
 * manches sur quatorze ne se compare pas a quelqu'un qui les a toutes jouees.
 * Les classements et le tableau de scouting s'en tiennent donc aux reguliers.
 */
export const PART_DE_SESSION_REGULIERE = seuils.partDeSessionReguliere;

/** Medailles les plus frequentes citees dans le bulletin de role. */
export const MEDAILLES_CITEES = seuils.medaillesCitees;
