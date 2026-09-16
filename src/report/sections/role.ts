/**
 * Bulletin de role : ce que mes chiffres disent de mon poste, compares a ceux
 * de mes coequipiers.
 *
 * Une part de l'equipe ne veut rien dire seule ; c'est l'ecart a un quart -
 * la part d'un joueur sur quatre - qui informe. Les sorties de cette section
 * sont donc toujours rapportees a ce repere.
 */

import { reguliers } from "../analyse.ts";
import type { AnalyseSession, StatsJoueur } from "../analyse.ts";
import { moyenne, ordinal, pluriel, pourcent, ratio, tableau } from "../format.ts";
import { MEDAILLES_CITEES } from "../seuils.ts";

/** Total d'un compteur sur toute l'equipe. */
const totalEquipe = (equipe: StatsJoueur[], champ: "kill" | "assist" | "death" | "special") =>
  equipe.reduce((total, joueur) => total + joueur[champ], 0);

/** Rang d'un joueur sur un classement decroissant, a partir de 1. */
function rang(equipe: StatsJoueur[], moi: StatsJoueur, valeur: (j: StatsJoueur) => number): number {
  return (
    [...equipe].sort((a, b) => valeur(b) - valeur(a)).findIndex((joueur) => joueur === moi) + 1
  );
}

export function sectionRole(analyse: AnalyseSession): string[] {
  const moi = analyse.moi;
  const equipe = analyse.equipe;
  // Sans joueur identifie, la section n'a pas d'objet : elle ne parle que de moi.
  if (moi === undefined || equipe.length === 0) return [];

  const lignes: string[] = ["### 🎯 Bulletin de rôle", ""];

  const indicateurs: [string, number, "kill" | "assist" | "death" | "special"][] = [
    ["Éliminations", moi.kill, "kill"],
    ["Assistances", moi.assist, "assist"],
    ["Spéciaux", moi.special, "special"],
    ["Morts", moi.death, "death"],
  ];

  lignes.push(
    ...tableau(
      ["Indicateur", "Total", "Moy.", "Part"],
      indicateurs.map(([libelle, valeur, champ]) => [
        libelle,
        String(valeur),
        moyenne(valeur, moi.manches),
        pourcent(valeur, totalEquipe(equipe, champ)),
      ]),
    ),
    "",
  );

  const faits: string[] = [];

  const partAssists = totalEquipe(equipe, "assist");
  const partKills = totalEquipe(equipe, "kill");
  if (partAssists > 0 && partKills > 0) {
    // Le repere n'est 25 % que si quatre joueurs ont fait toute la session.
    // Des qu'une composition bouge, il se deplace : on le calcule.
    const manchesDeLEquipe = equipe.reduce((total, joueur) => total + joueur.manches, 0);
    faits.push(
      `**${pourcent(moi.assist, partAssists)} des assistances de l'équipe, ` +
        `${pourcent(moi.kill, partKills)} de ses éliminations** — pour une part ` +
        `attendue de ${pourcent(moi.manches, manchesDeLEquipe)}.`,
    );
  }

  // Un remplacant de deux manches n'est pas un point de comparaison.
  const comparables = reguliers(equipe, analyse.manches.length);
  if (comparables.length > 1 && comparables.includes(moi)) {
    const rendement = (joueur: StatsJoueur) =>
      joueur.death === 0 ? Number.POSITIVE_INFINITY : (joueur.kill + joueur.assist) / joueur.death;
    const rangRendement = rang(comparables, moi, rendement);
    const rangMorts = rang(comparables, moi, (joueur) => joueur.death);

    faits.push(
      `Mon rendement (élim. + assist. par mort) est de ` +
        `**${ratio(moi.kill + moi.assist, moi.death)}** — ` +
        `${ordinal(rangRendement)} des ${comparables.length} joueurs présents ` +
        `sur toute la session.`,
    );

    // Contredit souvent le ressenti : on meurt beaucoup sans mourir le plus.
    if (rangMorts > 1) {
      const devant = comparables.filter((joueur) => joueur.death > moi.death).length;
      faits.push(
        `Je meurs ${moi.death} fois — ${devant} ${pluriel(devant, "coéquipier")} ` +
          `${pluriel(devant, "meurt", "meurent")} davantage. ` +
          `Le volume de morts n'est donc pas l'anomalie ; c'est ce qu'elles rapportent qui l'est.`,
      );
    }
  }

  const citees = analyse.medailles.slice(0, MEDAILLES_CITEES);
  if (citees.length > 0) {
    faits.push(
      `Médailles : ` +
        citees.map((medaille) => `${medaille.libelle} ×${medaille.nombre}`).join(" · "),
    );
  }

  lignes.push(...faits.flatMap((fait) => [fait, ""]));
  return lignes;
}
