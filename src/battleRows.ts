/**
 * Vue allegee d'un match : ce que la fenetre affiche, et rien de plus.
 *
 * Elle existe pour que les matchs bruts n'aient pas a traverser le pont IPC,
 * ou ils pourraient etre alteres et ou leur poids se paierait deux fois.
 *
 * C'est aussi le seul endroit ou le vocabulaire du match est traduit avant
 * d'atteindre la fenetre : celle-ci n'importe rien du noyau, elle ne peut donc
 * pas traduire elle-meme. Sans cela, la fiche afficherait les cles stat.ink
 * brutes (« yagura », « zatou ») au-dessus d'un compte rendu qui dit
 * « Expédition Risquée » et « Supermarché Cétacé ».
 */

import { libelleDuMode, libelleDuResultat, libelleDuStage } from "./libelles.fr.ts";
import type { StatinkBattle } from "./statink/types.ts";

/**
 * Une ligne du tableau de matchs : exactement les colonnes affichees dans le
 * resume de la ligne de commande (`summarize`). Les champs absents ou null
 * sont omis plutot que remplaces par une valeur par defaut, pour que le
 * rendu en affichage soit fidele a la disponibilite des donnees.
 */
export type BattleRow = {
  uuid: string;
  /** ISO 8601 tel que stat.ink le donne, ou chaine vide si le match n'en a pas. */
  startedAt: string;
  lobby?: string;
  /** Mode, en francais. */
  rule?: string;
  /** Carte, en francais. */
  stage?: string;
  /**
   * Resultat brut (`win`, `lose`, `draw`).
   *
   * Reste en anglais : la fenetre s'en sert comme cle de mise en forme
   * (`.match--win` colore la ligne). C'est `resultLabel` qui s'affiche.
   */
  result?: string;
  /** Resultat en francais, celui que la fenetre montre. */
  resultLabel?: string;
};

/**
 * Aplatit des matchs bruts stat.ink en lignes affichables, dans l'ordre recu.
 * Cette transformation reduit la taille des objets (puisque les matchs bruts
 * contiennent les donnees completes du match, ses joueurs, etc.) avant de les
 * transmettre par IPC, ou ils pourraient etre alteres et ou leur poids se
 * paierait deux fois.
 */
export function toBattleRows(battles: StatinkBattle[]): BattleRow[] {
  return battles.map((battle) => ({
    uuid: battle.uuid,
    startedAt: battle.start_at?.iso8601 ?? "",
    ...(battle.lobby?.key !== undefined ? { lobby: battle.lobby.key } : {}),
    ...(battle.rule?.key !== undefined
      ? { rule: libelleDuMode(battle.rule.key, battle.rule.name?.en_US) }
      : {}),
    ...(battle.stage?.key !== undefined
      ? { stage: libelleDuStage(battle.stage.key, battle.stage.name?.en_US) }
      : {}),
    ...(battle.result != null
      ? { result: battle.result, resultLabel: libelleDuResultat(battle.result) }
      : {}),
  }));
}
