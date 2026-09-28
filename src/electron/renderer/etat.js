/**
 * Etat de la fenetre, partage par ses modules, et la bascule entre les vues.
 *
 * Un seul objet plutot que des variables exportees : un module importe une
 * liaison en lecture seule, il ne pourrait pas la modifier.
 */

import { elements } from "./elements.js";

/** @typedef {import("../../sessionList.ts").SessionSummary} SessionSummary */
/** @typedef {import("../../battleRows.ts").BattleRow} BattleRow */
/** @typedef {import("../../battleDetail.ts").BattleDetail} BattleDetail */
/** @typedef {import("../sessionFetchHandler.ts").SessionPreview} SessionPreview */
/** @typedef {"formulaire" | "apercu" | "fiche" | "manche" | "reglages"} Vue */

export const etat = {
  /** Vue affichee, pour que « Retour » des reglages y ramene. */
  vueCourante: /** @type {Vue} */ ("formulaire"),
  /** Apercu en cours, consomme par l'enregistrement. */
  apercuCourant: /** @type {SessionPreview | undefined} */ (undefined),
  /** Session ouverte dans la fiche. */
  ficheCourante: /** @type {SessionSummary | undefined} */ (undefined),
  /** Lignes de la session ouverte. */
  manchesCourantes: /** @type {BattleRow[]} */ ([]),
  /** Rang de la manche affichee, -1 hors de la vue manche. */
  rangDeLaManche: -1,
  /** Detail affiche, pour savoir quel lien stat.ink ouvrir. */
  mancheCourante: /** @type {BattleDetail | undefined} */ (undefined),
  /**
   * Premiere image de la derniere planche fabriquee, pour le bouton "Ouvrir le
   * dossier" : la reveler ouvre l'explorateur dans le dossier de la session.
   */
  cheminPlancheCourante: /** @type {string | undefined} */ (undefined),
  /** Pictos de regle, par cle stat.ink, recus avec l'habillage. */
  pictosDeRegle: /** @type {Record<string, string>} */ ({}),
  /** Couleurs de regle, par cle stat.ink. */
  couleursDeRegle: /** @type {Record<string, { vive: string; matte: string }>} */ ({}),
};

const TITRE_RECUPERATION = elements.titreRecuperation.textContent;

/**
 * Une seule vue visible a la fois dans la colonne de droite.
 * @param {Vue} nom
 */
export function montreLaVue(nom) {
  etat.vueCourante = nom;
  elements.vueFormulaire.hidden = nom !== "formulaire";
  elements.vueApercu.hidden = nom !== "apercu";
  elements.vueFiche.hidden = nom !== "fiche";
  elements.vueManche.hidden = nom !== "manche";
  elements.vueReglages.hidden = nom !== "reglages";
  elements.titreRecuperation.textContent = nom === "reglages" ? "Réglages" : TITRE_RECUPERATION;
}
