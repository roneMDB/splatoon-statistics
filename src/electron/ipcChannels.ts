/**
 * Contrat entre le processus principal, le preload et la fenetre.
 *
 * Ce fichier n'importe pas `electron` : il est partage par les trois cotes et
 * doit rester chargeable partout, y compris dans les tests.
 */

import type { SessionType } from "../sessionMeta.ts";

/** Noms des canaux IPC. */
export const IPC = {
  /** Inventaire des sessions deja ecrites. */
  listSessions: "sessions:list",
  /** Interroge stat.ink sans rien ecrire, et retient l'apercu. */
  previewSession: "session:preview",
  /** Ecrit l'apercu retenu. */
  saveSession: "session:save",
  /** Relit une session ecrite, matchs compris. */
  readSession: "session:read",
  /** Change le nom et le type d'une session ecrite. */
  updateSession: "session:update",
  /** Supprime definitivement une session. */
  deleteSession: "session:delete",
  /** Detail complet d'une manche : les 8 joueurs, leur equipement, les medailles. */
  readBattle: "battle:read",
  /** Redige le compte rendu d'une session ecrite. */
  buildReport: "report:build",
  /** Ouvre un lien stat.ink dans le navigateur du systeme. */
  openExternal: "app:open-external",
  /** Met un texte dans le presse-papier du systeme. */
  copyToClipboard: "app:clipboard",
  /** Avancement d'une recuperation en cours, page par page. */
  fetchProgress: "session:fetch-progress",
  /**
   * Listes fermees du noyau. Sans ce canal, la fenetre redeclarerait les
   * lobbies et les types en dur, et les deux listes finiraient par diverger.
   */
  choices: "app:choices",
} as const;

/** Ce que le formulaire de la fenetre envoie pour lancer une recuperation. */
export type FetchSessionFormInput = {
  user: string;
  name?: string;
  /** Valide contre SESSION_TYPES avant tout appel reseau. */
  type?: string;
  /** Format du noyau : `YYYY-MM-DD HH:mm` ou `YYYY-MM-DD HH:mm:ss`, heure locale. */
  from: string;
  /** Par defaut : maintenant. */
  to?: string;
  /** Valide contre KNOWN_LOBBIES avant tout appel reseau. */
  lobby?: string;
  maxPages?: number;
};

/** Ce que la fenetre envoie pour obtenir le detail d'une manche. */
export type ReadBattleInput = {
  path: string;
  /** Identifiant de la manche, tel que `BattleRow` le porte. */
  uuid: string;
};

/** Ce que la fenetre envoie pour obtenir un compte rendu. */
export type BuildReportInput = {
  path: string;
  /** Noms de sections. Valides contre SECTIONS avant toute lecture. */
  sections: string[];
  objectif?: string;
  ressenti?: string;
};

/** Type du pont expose a la fenetre par le preload. */
export type SplatoonApi = {
  listSessions: () => Promise<import("../sessionList.ts").ListSessionsResult>;
  previewSession: (
    input: FetchSessionFormInput,
  ) => Promise<import("./sessionFetchHandler.ts").SessionPreview>;
  saveSession: (
    previewId: string,
  ) => Promise<import("../sessionList.ts").SessionSummary>;
  readSession: (path: string) => Promise<{
    summary: import("../sessionList.ts").SessionSummary;
    rows: import("../battleRows.ts").BattleRow[];
  }>;
  updateSession: (input: {
    path: string;
    name?: string;
    type?: string;
    objectif?: string;
    ressenti?: string;
  }) => Promise<import("../sessionList.ts").SessionSummary>;
  deleteSession: (path: string) => Promise<void>;
  /** Detail d'une manche, deja traduit. */
  readBattle: (
    input: ReadBattleInput,
  ) => Promise<import("../battleDetail.ts").BattleDetail>;
  /** Rend le compte rendu en Markdown, pret a etre colle. */
  buildReport: (input: BuildReportInput) => Promise<string>;
  /**
   * Ouvre une URL stat.ink dans le navigateur. Refuse toute autre origine.
   * Rend `"copie"` quand la machine ne sait pas ouvrir de lien : l'adresse est
   * alors mise dans le presse-papier.
   */
  openExternal: (url: string) => Promise<"ouvert" | "copie">;
  copyToClipboard: (texte: string) => Promise<void>;
  /** Renvoie la fonction de desabonnement. */
  onFetchProgress: (
    listener: (progress: import("../fetchSession.ts").FetchPageProgress) => void,
  ) => () => void;
  /** Listes fermees, pour que la fenetre ne duplique pas les valeurs du noyau. */
  choices: () => Promise<{
    lobbies: readonly string[];
    sessionTypes: readonly SessionType[];
    defaultUser: string;
    /** Sections de compte rendu proposees, dans l'ordre du document. */
    reportSections: readonly { cle: string; libelle: string }[];
  }>;
};
