import { MAX_ATTEMPTS, RETRY_BASE_DELAY_MS, USER_AGENT } from "../config.ts";
import type { StatinkBattle } from "./types.ts";
import { buildBattleListUrl, type BattleListRequest } from "./url.ts";

/** Dependances injectables, pour tester sans reseau ni attente reelle. */
export type ClientDeps = {
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Une erreur dont une nouvelle tentative peut venir a bout. */
class RetryableError extends Error {}

/**
 * Recupere une page de matchs.
 * Reessaie jusqu'a MAX_ATTEMPTS sur erreur reseau ou 5xx ; echoue
 * immediatement sur 403 et 404, qui ne se resolvent pas d'eux-memes.
 */
export async function fetchBattlePage(
  request: BattleListRequest,
  deps: ClientDeps = {},
): Promise<StatinkBattle[]> {
  const doFetch = deps.fetch ?? globalThis.fetch;
  const sleep = deps.sleep ?? defaultSleep;
  const url = buildBattleListUrl(request);

  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await requestPage(doFetch, url);
    } catch (error) {
      if (!(error instanceof RetryableError)) throw error;
      lastError = error;
      if (attempt < MAX_ATTEMPTS) {
        await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
      }
    }
  }

  throw new Error(
    `Echec apres ${MAX_ATTEMPTS} tentatives sur ${url} : ${lastError?.message}`,
  );
}

async function requestPage(
  doFetch: (url: string, init?: RequestInit) => Promise<Response>,
  url: string,
): Promise<StatinkBattle[]> {
  let response: Response;
  try {
    response = await doFetch(url, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "application/json",
      },
    });
  } catch (error) {
    throw new RetryableError(
      `Erreur reseau : ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (response.status === 403) {
    throw new Error(
      "stat.ink a renvoye 403 : la requete a ete refusee par Cloudflare. " +
        "Verifier que le User-Agent envoye est bien celui d'un navigateur.",
    );
  }
  if (response.status === 404) {
    throw new Error(
      "stat.ink a renvoye 404 : le compte est inconnu, ou son journal de " +
        "matchs n'est pas public.",
    );
  }
  if (!response.ok) {
    throw new RetryableError(`statut HTTP ${response.status}`);
  }

  const body = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error(
      `Reponse de stat.ink illisible (JSON invalide) : ${body.slice(0, 200)}`,
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error(
      `Reponse inattendue de stat.ink : une liste de matchs etait attendue, ` +
        `recu ${typeof parsed}.`,
    );
  }

  return parsed as StatinkBattle[];
}
