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
  }) => Promise<import("../sessionList.ts").SessionSummary>;
  deleteSession: (path: string) => Promise<void>;
  /** Renvoie la fonction de desabonnement. */
  onFetchProgress: (
    listener: (progress: import("../fetchSession.ts").FetchPageProgress) => void,
  ) => () => void;
  /** Listes fermees, pour que la fenetre ne duplique pas les valeurs du noyau. */
  choices: () => Promise<{
    lobbies: readonly string[];
    sessionTypes: readonly SessionType[];
    defaultUser: string;
  }>;
};
