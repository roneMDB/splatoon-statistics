import { MAX_ATTEMPTS, RETRY_BASE_DELAY_MS, STATINK_ORIGIN, USER_AGENT } from "../config.ts";
import type { StatinkBattle } from "./types.ts";
import { buildBattleListUrl, type BattleListRequest } from "./url.ts";

/** Dependances injectables, pour tester sans reseau ni attente reelle. */
export type ClientDeps = {
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
  sleep?: (ms: number) => Promise<void>;
};

type DoFetch = (url: string, init?: RequestInit) => Promise<Response>;

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
  const parsed = await fetchJson(
    buildBattleListUrl(request),
    "stat.ink a renvoye 404 : le compte est inconnu, ou son journal de " +
      "matchs n'est pas public.",
    deps,
  );
  if (!Array.isArray(parsed)) {
    throw new Error(
      `Reponse inattendue de stat.ink : une liste de matchs etait attendue, ` +
        `recu ${typeof parsed}.`,
    );
  }
  return parsed as StatinkBattle[];
}

/**
 * Identifiant stat.ink d'un match, tire de l'adresse de sa page
 * (`https://stat.ink/@Gloup/spl3/<id>`). Ce n'est pas le `uuid` du match :
 * celui-la vient de SplatNet, l'identifiant de la page est propre a stat.ink.
 * Rend `undefined` pour toute autre adresse.
 */
export function idDuMatchStatink(url: string): string | undefined {
  const trouve =
    /^https:\/\/stat\.ink\/@[^/?#]+\/spl3\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(
      url,
    );
  return trouve?.[1]?.toLowerCase();
}

/**
 * Recupere un seul match par l'identifiant de sa page stat.ink. Meme forme
 * qu'un element de `fetchBattlePage`, memes tentatives.
 */
export async function fetchBattle(id: string, deps: ClientDeps = {}): Promise<StatinkBattle> {
  const url = new URL(`/api/v3/battle/${encodeURIComponent(id)}`, STATINK_ORIGIN).toString();
  const parsed = await fetchJson(
    url,
    "stat.ink a renvoye 404 : ce match est introuvable (pas encore traite, ou supprime).",
    deps,
  );
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Reponse inattendue de stat.ink : un match etait attendu, recu ${typeof parsed}.`);
  }
  return parsed as StatinkBattle;
}

async function fetchJson(url: string, message404: string, deps: ClientDeps): Promise<unknown> {
  const doFetch = deps.fetch ?? globalThis.fetch;
  const sleep = deps.sleep ?? defaultSleep;

  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await requestJson(doFetch, url, message404);
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

async function requestJson(doFetch: DoFetch, url: string, message404: string): Promise<unknown> {
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
    throw new Error(message404);
  }
  if (!response.ok) {
    throw new RetryableError(`statut HTTP ${response.status}`);
  }

  const body = await response.text();
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(
      `Reponse de stat.ink illisible (JSON invalide) : ${body.slice(0, 200)}`,
    );
  }
}
