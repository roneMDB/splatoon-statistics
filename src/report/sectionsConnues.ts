/**
 * Les sections du compte rendu, sans rien d'autre.
 *
 * A part de `index.ts` parce que `reglages.ts` doit les connaitre pour valider
 * `sectionsParDefaut`, et qu'`index.ts` importe les redacteurs, qui importent
 * les seuils, qui importent les reglages : un cycle.
 */

/** Sections disponibles, dans l'ordre ou elles apparaissent au document. */
export const SECTIONS = ["courbe", "role", "modes", "scouting"] as const;

export type SectionCompteRendu = (typeof SECTIONS)[number];
