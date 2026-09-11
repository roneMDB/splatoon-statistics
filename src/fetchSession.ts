import { DEFAULT_MAX_PAGES } from "./config.ts";
import { fetchBattlePage } from "./statink/client.ts";
import type { StatinkBattle } from "./statink/types.ts";
import type { BattleFilters, BattleListRequest } from "./statink/url.ts";
import {
  formatStatinkDateTime,
  isWithinWindow,
  type SessionWindow,
} from "./window.ts";

/** Raison pour laquelle la pagination s'est arretee. */
export type StopReason =
  /** La page atteinte precede la borne basse elargie. */
  | "hors-fenetre"
  /** La page ne contenait aucun match. */
  | "page-vide"
  /**
   * La page n'apportait aucun uuid nouveau. stat.ink clampe `page=N` sur la
   * derniere page au lieu de renvoyer du vide : c'est ainsi qu'on detecte la fin.
   */
  | "page-deja-vue"
  /** Plafond de securite atteint. */
  | "plafond-pages";

export type FetchSessionOptions = {
  user: string;
  window: SessionWindow;
  filters?: BattleFilters;
  maxPages?: number;
};

export type FetchSessionResult = {
  /** Matchs de la fenetre, bruts, du plus ancien au plus recent. */
  battles: StatinkBattle[];
  pagesFetched: number;
  stopReason: StopReason;
};

/** Etat d'avancement, annonce apres le traitement de chaque page. */
export type FetchPageProgress = {
  /** Numero de la page qui vient d'etre lue, a partir de 1. */
  page: number;
  /** Matchs renvoyes par cette page, avant filtrage. */
  battlesInPage: number;
  /** Matchs retenus depuis le debut, toutes pages confondues. */
  totalKeptSoFar: number;
};

export type FetchSessionDeps = {
  fetchPage?: (request: BattleListRequest) => Promise<StatinkBattle[]>;
  /**
   * Rappele apres chaque page. Sert aux facades qui rendent compte de
   * l'avancement pendant que la pagination dure, l'interface graphique surtout.
   */
  onPage?: (progress: FetchPageProgress) => void;
};

/**
 * Recupere tous les matchs d'une session.
 *
 * Le filtre temporel de stat.ink s'applique dans le fuseau du profil consulte,
 * inconnu de nous : on interroge donc une fenetre elargie et on filtre ensuite
 * sur `start_at.time`, qui est un epoch non ambigu.
 */
export async function fetchSession(
  options: FetchSessionOptions,
  deps: FetchSessionDeps = {},
): Promise<FetchSessionResult> {
  const fetchPage = deps.fetchPage ?? ((request) => fetchBattlePage(request));
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  const { window } = options;

  const filters: BattleFilters = {
    ...options.filters,
    termFrom: formatStatinkDateTime(window.paddedFromMs),
    termTo: formatStatinkDateTime(window.paddedToMs),
  };

  const seen = new Set<string>();
  const kept: StatinkBattle[] = [];
  let pagesFetched = 0;
  let stopReason: StopReason = "plafond-pages";

  for (let page = 1; page <= maxPages; page += 1) {
    const battles = await fetchPage({ user: options.user, page, filters });
    pagesFetched = page;

    // Une page vide ne fait rien tourner ici : l'arret est traite plus bas,
    // apres l'annonce, pour n'avoir qu'un seul point de progression.
    let hasNewBattle = false;
    for (const battle of battles) {
      if (seen.has(battle.uuid)) continue;
      seen.add(battle.uuid);
      hasNewBattle = true;
      const startAt = battle.start_at?.time;
      if (startAt !== undefined && isWithinWindow(startAt, window)) {
        kept.push(battle);
      }
    }

    deps.onPage?.({
      page,
      battlesInPage: battles.length,
      totalKeptSoFar: kept.length,
    });

    if (battles.length === 0) {
      stopReason = "page-vide";
      break;
    }

    if (!hasNewBattle) {
      stopReason = "page-deja-vue";
      break;
    }

    if (isPastWindow(battles, window)) {
      stopReason = "hors-fenetre";
      break;
    }

    if (page === maxPages) {
      stopReason = "plafond-pages";
    }
  }

  kept.sort((a, b) => (a.start_at?.time ?? 0) - (b.start_at?.time ?? 0));

  return { battles: kept, pagesFetched, stopReason };
}

/** Vrai si le match le plus ancien de la page precede la fenetre elargie. */
function isPastWindow(
  battles: StatinkBattle[],
  window: SessionWindow,
): boolean {
  const timestamps = battles
    .map((battle) => battle.start_at?.time)
    .filter((time): time is number => time !== undefined);
  if (timestamps.length === 0) return false;
  return Math.min(...timestamps) * 1000 < window.paddedFromMs;
}
