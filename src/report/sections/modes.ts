/**
 * Carte des modes : ce qui a tenu, ce qui a coule.
 *
 * L'interet de la section tient a une distinction que le ressenti ne fait pas :
 * un mode perdu sur une seule carte peut etre un probleme de carte ; le meme
 * mode perdu sur plusieurs cartes ne l'est plus.
 */

import type { AnalyseSession } from "../analyse.ts";
import { pluriel, tableau } from "../format.ts";
import {
  MEILLEUR_MODE_MANCHES,
  MODE_EN_ECHEC_MANCHES,
  MODE_EN_ECHEC_STAGES,
} from "../seuils.ts";

export function sectionModes(analyse: AnalyseSession): string[] {
  if (analyse.parMode.length === 0) return [];

  const lignes: string[] = ["### 🗺️ Carte des modes", ""];

  const parBilan = [...analyse.parMode].sort(
    (a, b) => b.victoires - b.defaites - (a.victoires - a.defaites),
  );

  lignes.push(
    // Les cartes passent apres le bilan : ce sont les cellules les plus larges,
    // et une derniere colonne qui deborde coute moins qu'une colonne du milieu.
    ...tableau(
      ["Mode", "Bilan", "é/a/m", "Cartes"],
      parBilan.map((mode) => [
        mode.libelle,
        `${mode.victoires}V-${mode.defaites}D`,
        `${mode.kill}/${mode.assist}/${mode.death}`,
        mode.stages.join(", "),
      ]),
    ),
    "",
  );

  const faits: string[] = [];

  for (const mode of parBilan) {
    if (
      mode.victoires === 0 &&
      mode.manches >= MODE_EN_ECHEC_MANCHES &&
      mode.stages.length >= MODE_EN_ECHEC_STAGES
    ) {
      faits.push(
        `**${mode.libelle} : ${mode.defaites} défaites, aucune victoire, ` +
          `sur ${mode.stages.length} cartes différentes.** ` +
          `Ce n'est donc pas la carte, c'est le mode.`,
      );
    }
  }

  // Un mode joue une seule fois ne dit rien, meme gagne : il ne peut pas etre
  // le point fort de la session.
  const meilleur = parBilan.find((mode) => mode.manches >= MEILLEUR_MODE_MANCHES);
  if (meilleur !== undefined && meilleur.victoires > meilleur.defaites) {
    faits.push(
      `**${meilleur.libelle}** est le mode qui nous a tenus : ` +
        `${meilleur.victoires}V-${meilleur.defaites}D sur ` +
        `${meilleur.stages.length} ${pluriel(meilleur.stages.length, "carte")}.`,
    );
  }

  lignes.push(...faits.flatMap((fait) => [fait, ""]));
  return lignes;
}
