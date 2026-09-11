import { STATINK_ORIGIN } from "../config.ts";

/**
 * Filtres serveur de la page utilisateur stat.ink.
 * Les cles correspondent aux champs `f[...]` du formulaire de filtrage.
 */
export type BattleFilters = {
  /** `private` (intras/scrims), `!private`, `bankara_open`, `xmatch`, ... */
  lobby?: string | undefined;
  /** Mode : `area`, `yagura`, `hoko`, `asari`, `nawabari`. */
  rule?: string | undefined;
  /** Cle de stage. */
  map?: string | undefined;
  /** Cle d'arme principale. */
  weapon?: string | undefined;
  /** `win`, `lose`, `draw`. */
  result?: string | undefined;
  /** Pseudo d'un joueur present dans le match. */
  playedWith?: string | undefined;
  /** Borne basse, au format `YYYY-MM-DD hh:mm:ss`. */
  termFrom?: string | undefined;
  /** Borne haute, au format `YYYY-MM-DD hh:mm:ss`. */
  termTo?: string | undefined;
};

/**
 * Valeurs acceptees par `f[lobby]`, relevees dans le formulaire stat.ink.
 * Source unique : la CLI et l'interface graphique proposent la meme liste.
 */
export const KNOWN_LOBBIES = [
  "private",
  "!private",
  "regular",
  "@bankara",
  "bankara_challenge",
  "bankara_open",
  "xmatch",
  "event",
  "@splatfest",
  "splatfest_challenge",
  "splatfest_open",
] as const;

/** Un lobby connu de stat.ink. */
export type KnownLobby = (typeof KNOWN_LOBBIES)[number];

/** Verifie qu'une chaine est un lobby connu. */
export function isKnownLobby(value: string): value is KnownLobby {
  return (KNOWN_LOBBIES as readonly string[]).includes(value);
}

export type BattleListRequest = {
  /** Pseudo stat.ink (`screen_name`), sans le `@`. */
  user: string;
  /** Numero de page, a partir de 1. */
  page: number;
  filters?: BattleFilters;
};

/** Correspondance filtre interne -> nom du parametre attendu par stat.ink. */
const FILTER_PARAMS: ReadonlyArray<[keyof BattleFilters, string]> = [
  ["lobby", "f[lobby]"],
  ["rule", "f[rule]"],
  ["map", "f[map]"],
  ["weapon", "f[weapon]"],
  ["result", "f[result]"],
  ["playedWith", "f[played_with]"],
  ["termFrom", "f[term_from]"],
  ["termTo", "f[term_to]"],
];

/** Construit l'URL `index.json` du journal Splatoon 3 d'un joueur. */
export function buildBattleListUrl(request: BattleListRequest): string {
  const user = request.user.trim();
  if (user === "") {
    throw new Error("Le pseudo stat.ink est vide.");
  }
  if (!Number.isInteger(request.page) || request.page < 1) {
    throw new Error(`Numero de page invalide : ${request.page}`);
  }

  const url = new URL(
    `/@${encodeURIComponent(user)}/spl3/index.json`,
    STATINK_ORIGIN,
  );
  url.searchParams.set("page", String(request.page));

  const filters = request.filters ?? {};
  for (const [key, param] of FILTER_PARAMS) {
    const value = filters[key];
    if (value !== undefined && value !== "") {
      url.searchParams.set(param, value);
    }
  }

  // Sans `f[term]=term`, stat.ink ignore silencieusement term_from/term_to.
  if (filters.termFrom !== undefined || filters.termTo !== undefined) {
    url.searchParams.set("f[term]", "term");
  }

  return url.toString();
}
