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
  /** Fabrique la planche de manches d'une session et l'ecrit en PNG. */
  buildPlanche: "planche:build",
  /** Revele le PNG d'une planche dans le gestionnaire de fichiers du systeme. */
  revealPlanche: "planche:reveal",
  /** Ouvre un lien stat.ink dans le navigateur du systeme. */
  openExternal: "app:open-external",
  /** Met un texte dans le presse-papier du systeme. */
  copyToClipboard: "app:clipboard",
  /**
   * Ferme l'application depuis la fenetre. Sous WSLg, la decoration de
   * fenetre du systeme manque a l'appel assez souvent pour qu'un bouton dans
   * la page soit la seule sortie fiable.
   */
  quitApp: "app:quit",
  /** Avancement d'une recuperation en cours, page par page. */
  fetchProgress: "session:fetch-progress",
  /**
   * Listes fermees du noyau. Sans ce canal, la fenetre redeclarerait les
   * lobbies et les types en dur, et les deux listes finiraient par diverger.
   */
  choices: "app:choices",
  /** Reglages en vigueur, ceux du fichier, les valeurs par defaut et leurs descriptions. */
  readSettings: "settings:read",
  /** Valide et ecrit `settings.json`. Pris en compte au prochain demarrage. */
  saveSettings: "settings:save",
  /** Redemarre l'application, pour appliquer des reglages enregistres. */
  relaunchApp: "app:relaunch",
} as const;

/** Ce que l'ecran des reglages recoit a l'ouverture. */
export type EcranDesReglages = {
  /** Fichier lu et ecrit, pour que l'ecran dise ou vont les modifications. */
  chemin: string;
  /** Contenu du fichier, complete par les valeurs par defaut. */
  reglages: import("../reglages.ts").Reglages;
  /** Ce que l'application utilise en ce moment, lu au demarrage. */
  actifs: import("../reglages.ts").Reglages;
  defauts: import("../reglages.ts").Reglages;
  descriptions: typeof import("../reglages.ts").DESCRIPTION_DES_SEUILS;
  sections: readonly { cle: string; libelle: string }[];
  /** Vrai quand le fichier differe de ce qui tourne : un redemarrage est attendu. */
  enAttente: boolean;
  /** Le fichier est illisible ou invalide ; `reglages` vaut alors `actifs`. */
  erreur?: string;
};

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

/** Ce que la fenetre envoie pour obtenir une planche. */
export type BuildPlancheInput = {
  path: string;
  /**
   * Pose le compte rendu dessine en tete de planche. Memes champs que
   * `BuildReportInput`, valides de la meme facon.
   */
  entete?: {
    sections: string[];
    objectif?: string;
    ressenti?: string;
  };
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
   * Fabrique la planche de la session et rend ou elle a ete ecrite.
   * `pressePapier` vaut `"indisponible"` quand le systeme n'a pas accepte
   * l'image - le cas sous WSLg : le fichier, lui, est toujours ecrit.
   */
  buildPlanche: (
    input: BuildPlancheInput,
  ) => Promise<import("./plancheHandler.ts").ResultatPlanche>;
  /**
   * Revele le PNG d'une planche dans le gestionnaire de fichiers. Refuse tout
   * chemin hors du dossier des planches. Rend `"copie"` quand la machine ne
   * sait pas le faire directement (WSL sans `explorer.exe` atteignable) : le
   * chemin est alors mis dans le presse-papier plutot que de laisser croire
   * a une ouverture.
   */
  revealPlanche: (path: string) => Promise<"ouvert" | "copie">;
  /**
   * Ouvre une URL stat.ink dans le navigateur. Refuse toute autre origine.
   * Rend `"copie"` quand la machine ne sait pas ouvrir de lien : l'adresse est
   * alors mise dans le presse-papier.
   */
  openExternal: (url: string) => Promise<"ouvert" | "copie">;
  copyToClipboard: (texte: string) => Promise<void>;
  readSettings: () => Promise<EcranDesReglages>;
  /** Rend les reglages tels qu'ils seront lus, et si un redemarrage est attendu. */
  saveSettings: (
    brut: unknown,
  ) => Promise<{ reglages: import("../reglages.ts").Reglages; enAttente: boolean }>;
  relaunchApp: () => Promise<void>;
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
    reportSections: readonly { cle: string; libelle: string; coche: boolean }[];
    /** Case « compte rendu en tete de planche » cochee a l'ouverture. */
    enteteParDefaut: boolean;
  }>;
};
