/**
 * Fabrique une AnalyseSession pour tester les sections sans passer par un faux
 * payload stat.ink. C'est ce que permet la separation entre `analyse.ts`, qui
 * compte, et les sections, qui redigent.
 */

import type { AnalyseSession, Manche, StatsJoueur } from "../../../src/report/analyse.ts";

export function joueur(partiel: Partial<StatsJoueur> & { nom: string }): StatsJoueur {
  return {
    moi: false,
    manches: 1,
    kill: 0,
    assist: 0,
    death: 0,
    special: 0,
    inked: 0,
    armes: [{ nom: "N-ZAP '85", manches: 1 }],
    ...partiel,
  };
}

export function manche(partiel: Partial<Manche> = {}): Manche {
  return {
    numero: 1,
    debut: "2026-09-11T19:00:00Z",
    heure: "21:00",
    dureeSecondes: 300,
    resultat: "win",
    ko: false,
    mode: "Défense de zone",
    stage: "Marché Grefin",
    medailles: [],
    ...partiel,
  };
}

export function analyse(partiel: Partial<AnalyseSession> = {}): AnalyseSession {
  const manches = partiel.manches ?? [];
  return {
    manches,
    bilan: {
      victoires: manches.filter((m) => m.resultat === "win").length,
      defaites: manches.filter((m) => m.resultat === "lose").length,
      nuls: 0,
      total: manches.length,
    },
    tempsDeJeuMinutes: 50,
    equipe: [],
    adverse: [],
    parMode: [],
    parStage: [],
    medailles: [],
    koSubis: 0,
    koInfliges: 0,
    serieFinaleDefaites: 0,
    serieInitialeVictoires: 0,
    ...partiel,
  };
}

/** Le texte entier d'une section, pour chercher ce qui s'y trouve ou non. */
export const texte = (lignes: string[]): string => lignes.join("\n");
