/**
 * Types du payload brut de stat.ink (`/@<user>/spl3/index.json`).
 *
 * On ne type que les champs sur lesquels le code s'appuie ; le reste du payload
 * traverse intact grace a l'index signature, puisque cette iteration stocke les
 * matchs sans les transformer.
 */

/** Libelle localise renvoye par stat.ink. */
export type LocalizedName = {
  en_US?: string;
  ja_JP?: string;
  [locale: string]: string | undefined;
};

/** Element de referentiel (mode, stage, arme, lobby...). */
export type KeyedName = {
  key: string;
  name?: LocalizedName;
  [extra: string]: unknown;
};

/** Instant renvoye par stat.ink : epoch en secondes + forme ISO 8601. */
export type StatinkTime = {
  /** Epoch en SECONDES, pas en millisecondes. */
  time: number;
  iso8601: string;
};

export type StatinkWeapon = KeyedName & {
  type?: KeyedName;
  sub?: KeyedName;
  special?: KeyedName;
};

/** Un des 4 joueurs d'une equipe, avec sa performance et son equipement. */
export type StatinkTeamMember = {
  me: boolean;
  name: string | null;
  number: string | null;
  splashtag_title: string | null;
  rank_in_team: number | null;
  weapon: StatinkWeapon | null;
  kill: number | null;
  assist: number | null;
  kill_or_assist: number | null;
  death: number | null;
  special: number | null;
  inked: number | null;
  disconnected: boolean;
  [extra: string]: unknown;
};

/** Un match tel que stat.ink le renvoie. */
export type StatinkBattle = {
  id: string;
  uuid: string;
  url: string;
  lobby: KeyedName | null;
  rule: KeyedName | null;
  stage: KeyedName | null;
  result: "win" | "lose" | "draw" | null;
  knockout: boolean | null;
  start_at: StatinkTime | null;
  end_at: StatinkTime | null;
  our_team_members: StatinkTeamMember[] | null;
  their_team_members: StatinkTeamMember[] | null;
  [extra: string]: unknown;
};
