/**
 * Courbe de session : quand la session a bascule.
 *
 * C'est la seule section qui regarde l'ordre des manches. Les comptes rendus
 * ecrits a la main affirmaient regulierement un decrochage de fin de soiree
 * sans jamais le mesurer ; ici la phrase n'apparait que si la serie existe.
 */

import type { AnalyseSession, Manche } from "../analyse.ts";
import { pluriel } from "../format.ts";
import {
  BAISSE_DE_REGIME_RELATIVE,
  DEFAITE_SERREE_ECART,
  MANCHE_COURTE_SECONDES,
  SERIE_FINALE_MINIMALE,
  SERIE_INITIALE_MINIMALE,
} from "../seuils.ts";

const SYMBOLES: Record<string, string> = {
  win: "✅",
  lose: "❌",
  draw: "➖",
  inconnu: "·",
};

/** Kills par manche sur une tranche, ou undefined si la tranche est vide. */
function killsParManche(manches: Manche[]): number | undefined {
  const avecMoi = manches.filter((manche) => manche.moi !== undefined);
  if (avecMoi.length === 0) return undefined;
  return avecMoi.reduce((total, manche) => total + (manche.moi?.kill ?? 0), 0) / avecMoi.length;
}

export function sectionCourbe(analyse: AnalyseSession): string[] {
  const { manches } = analyse;
  if (manches.length === 0) return [];

  const lignes: string[] = ["### 🎢 Courbe de session", ""];

  const premiere = manches[0];
  const derniere = manches[manches.length - 1];
  // Le temps de jeu est deja dans l'entete du document : on ne le repete pas.
  lignes.push(
    `${premiere?.heure ?? "—"} → ${derniere?.heure ?? "—"}`,
    "",
    manches.map((manche) => SYMBOLES[manche.resultat] ?? "·").join(" "),
    "",
  );

  const faits: string[] = [];

  if (analyse.serieInitialeVictoires >= SERIE_INITIALE_MINIMALE) {
    faits.push(
      `🚀 **Entrée en matière : ${analyse.serieInitialeVictoires} victoires d'affilée** ` +
        `pour commencer.`,
    );
  }

  if (analyse.serieFinaleDefaites >= SERIE_FINALE_MINIMALE) {
    const decrochage = manches[manches.length - analyse.serieFinaleDefaites];
    faits.push(
      `📉 **La session décroche à ${decrochage?.heure ?? "la fin"} : ` +
        `${analyse.serieFinaleDefaites} défaites d'affilée pour terminer**, ` +
        `sans plus aucune manche gagnée.`,
    );
  }

  if (analyse.koSubis > 0 || analyse.koInfliges > 0) {
    faits.push(
      `⏱️ **${analyse.koSubis} KO ${pluriel(analyse.koSubis, "subi")} pour ` +
        `${analyse.koInfliges} ${pluriel(analyse.koInfliges, "infligé")}.**`,
    );
  }

  const ecrasements = manches.filter(
    (manche) =>
      manche.resultat === "lose" &&
      manche.dureeSecondes !== undefined &&
      manche.dureeSecondes < MANCHE_COURTE_SECONDES,
  );
  if (ecrasements.length > 0) {
    const detail = ecrasements
      .map((manche) => `${manche.mode} à ${manche.heure} (${manche.dureeSecondes} s)`)
      .join(", ");
    faits.push(
      `💥 ${ecrasements.length} ${pluriel(ecrasements.length, "manche perdue", "manches perdues")} ` +
        `en moins de ${MANCHE_COURTE_SECONDES / 60} minutes : ${detail}. ` +
        `À cette durée, ce n'est pas le duel qui a manqué, c'est la mise en place.`,
    );
  }

  const serrees = manches.filter(
    (manche) =>
      manche.resultat === "lose" &&
      manche.score !== undefined &&
      manche.score.eux - manche.score.nous <= DEFAITE_SERREE_ECART,
  );
  if (serrees.length > 0) {
    const detail = serrees
      .map((manche) => `${manche.mode} ${manche.score?.nous}-${manche.score?.eux}`)
      .join(", ");
    faits.push(
      `🔥 ${serrees.length} ${pluriel(serrees.length, "défaite serrée", "défaites serrées")} ` +
        `à ${DEFAITE_SERREE_ECART} points ou moins : ${detail}.`,
    );
  }

  const moitie = Math.floor(manches.length / 2);
  const debut = killsParManche(manches.slice(0, moitie));
  const fin = killsParManche(manches.slice(moitie));
  if (
    debut !== undefined &&
    fin !== undefined &&
    debut > 0 &&
    (debut - fin) / debut >= BAISSE_DE_REGIME_RELATIVE
  ) {
    faits.push(
      `🪫 Mes éliminations par manche passent de ${debut.toFixed(1).replace(".", ",")} ` +
        `sur la première moitié à ${fin.toFixed(1).replace(".", ",")} sur la seconde.`,
    );
  }

  lignes.push(...faits.flatMap((fait) => [fait, ""]));
  return lignes;
}
