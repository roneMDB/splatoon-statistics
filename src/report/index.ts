/**
 * Assemble le compte rendu d'une session en Markdown.
 *
 * Le document est destine a etre colle dans Discord : d'ou le Markdown, les
 * emoji en clair plutot qu'en raccourcis `:like_this:` (Discord rend les deux,
 * les premiers restent lisibles dans la fenetre), et des sections courtes.
 *
 * La redaction est deterministe : aucun modele de langage n'intervient. Deux
 * fois le meme fichier de session donnent deux fois le meme texte.
 */

import type { SessionFile } from "../store.ts";
import { analyseSession } from "./analyse.ts";
import type { AnalyseSession } from "./analyse.ts";
import { bilanDeSession, titreDeSession } from "./format.ts";
import { sectionCourbe } from "./sections/courbe.ts";
import { sectionModes } from "./sections/modes.ts";
import { sectionRole } from "./sections/role.ts";
import { sectionScouting } from "./sections/scouting.ts";

/** Sections disponibles, dans l'ordre ou elles apparaissent au document. */
export const SECTIONS = ["courbe", "role", "modes", "scouting"] as const;

export type SectionCompteRendu = (typeof SECTIONS)[number];

/** Intitules des sections, pour les cases a cocher de la fenetre et l'aide de la CLI. */
export const LIBELLES_SECTIONS: Record<SectionCompteRendu, string> = {
  courbe: "Courbe de session",
  role: "Bulletin de rôle",
  modes: "Carte des modes",
  scouting: "Scouting adverse",
};

const REDACTEURS: Record<SectionCompteRendu, (analyse: AnalyseSession) => string[]> = {
  courbe: sectionCourbe,
  role: sectionRole,
  modes: sectionModes,
  scouting: sectionScouting,
};

/** Verifie qu'une chaine designe une section connue. */
export function estUneSection(valeur: string): valeur is SectionCompteRendu {
  return (SECTIONS as readonly string[]).includes(valeur);
}

export type OptionsCompteRendu = {
  /** Sections a inclure, dans l'ordre voulu. Vide : l'entete seul. */
  sections: readonly SectionCompteRendu[];
  /** Prend le pas sur l'objectif enregistre dans la session. */
  objectif?: string;
  /** Prend le pas sur le ressenti enregistre dans la session. */
  ressenti?: string;
};

/** Titre et bilan, toujours presents : c'est ce qui identifie le post. */
function entete(file: SessionFile, analyse: AnalyseSession): string[] {
  const [premier, ...reste] = bilanDeSession(analyse);
  const bilan = [`**${premier}**`, ...reste].join(" · ");

  return [`## ${titreDeSession(file, analyse)}`, "", bilan, ""];
}

/**
 * Redige le compte rendu.
 *
 * Une section qui n'a rien a dire ne rend aucune ligne et disparait du
 * document : mieux vaut un compte rendu plus court qu'un titre suivi du vide.
 */
export function construisLeCompteRendu(
  file: SessionFile,
  options: OptionsCompteRendu,
): string {
  const analyse = analyseSession(file);
  const objectif = (options.objectif ?? analyse.objectif)?.trim();
  const ressenti = (options.ressenti ?? analyse.ressenti)?.trim();

  const lignes = entete(file, analyse);

  if (objectif) lignes.push(`**Objectif de la session : ${objectif}**`, "");
  if (ressenti) lignes.push(...ressenti.split("\n").map((ligne) => `> ${ligne}`), "");

  for (const section of options.sections) {
    lignes.push(...REDACTEURS[section](analyse));
  }

  // Une seule ligne vide entre deux blocs, et pas de ligne vide finale.
  const compact: string[] = [];
  for (const ligne of lignes) {
    if (ligne === "" && compact[compact.length - 1] === "") continue;
    compact.push(ligne);
  }
  while (compact[compact.length - 1] === "") compact.pop();

  return `${compact.join("\n")}\n`;
}
