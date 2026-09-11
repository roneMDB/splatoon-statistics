/**
 * Vue allegee d'un match : ce que la fenetre affiche, et rien de plus.
 *
 * Elle existe pour que les matchs bruts n'aient pas a traverser le pont IPC,
 * ou ils pourraient etre alteres et ou leur poids se paierait deux fois.
 */

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
  rule?: string;
  stage?: string;
  result?: string;
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
    ...(battle.rule?.key !== undefined ? { rule: battle.rule.key } : {}),
    ...(battle.stage?.key !== undefined ? { stage: battle.stage.key } : {}),
    ...(battle.result != null ? { result: battle.result } : {}),
  }));
}
