/**
 * Recuperation d'une session pour l'interface graphique.
 *
 * Ce module n'importe pas `electron` : il porte toute la logique appelable par
 * le processus principal, et reste donc testable hors-ligne comme le reste du
 * noyau. Le processus principal ne fait que le cabler a un canal IPC.
 *
 * Il reprend les etapes de la ligne de commande sans le dialogue de nommage :
 * le formulaire fournit le nom et le type avant de lancer la recuperation.
 */

import { DEFAULT_OUT_DIR } from "../config.ts";
import {
  fetchSession,
  type FetchPageProgress,
  type FetchSessionDeps,
  type StopReason,
} from "../fetchSession.ts";
import {
  isSessionType,
  SESSION_TYPES,
  type SessionType,
} from "../sessionMeta.ts";
import { summarizeSessionFile, type SessionSummary } from "../sessionList.ts";
import { isKnownLobby, KNOWN_LOBBIES } from "../statink/url.ts";
import { buildSessionFile, writeSession } from "../store.ts";
import { buildWindow } from "../window.ts";
import type { FetchSessionFormInput } from "./ipcChannels.ts";

/** Resume de la session ecrite, plus de quoi rendre compte de la pagination. */
export type FetchSessionOutcome = SessionSummary & {
  pagesFetched: number;
  stopReason: StopReason;
};

export type SessionFetchHandlerDeps = {
  fetchPage?: FetchSessionDeps["fetchPage"];
  onProgress?: (progress: FetchPageProgress) => void;
  /** Injecte pour rendre `fetchedAt` previsible dans les tests. */
  now?: () => Date;
  outDir?: string;
};

/**
 * Valide la saisie, recupere les matchs, ecrit la session, rend son resume.
 *
 * Les messages d'erreur sont ceux de la ligne de commande : une saisie refusee
 * doit s'expliquer de la meme facon dans les deux facades.
 */
export async function handleFetchSession(
  input: FetchSessionFormInput,
  deps: SessionFetchHandlerDeps = {},
): Promise<FetchSessionOutcome> {
  const user = input.user.trim();
  if (user === "") {
    throw new Error("Le pseudo stat.ink est vide.");
  }

  const type = parseType(input.type);
  const lobby = parseLobby(input.lobby);
  const maxPages = parseMaxPages(input.maxPages);
  const name = input.name?.trim() || undefined;

  // Leve avant tout appel reseau si la fenetre est illisible ou a l'envers.
  const window = buildWindow(input.from, input.to);

  const outDir = deps.outDir ?? DEFAULT_OUT_DIR;
  const result = await fetchSession(
    { user, window, filters: { lobby }, maxPages },
    { fetchPage: deps.fetchPage, onPage: deps.onProgress },
  );

  const file = buildSessionFile({
    user,
    name,
    type,
    window,
    filters: { lobby },
    battles: result.battles,
    fetchedAt: deps.now?.() ?? new Date(),
  });
  const path = await writeSession(file, outDir);

  return {
    ...summarizeSessionFile(file, path),
    pagesFetched: result.pagesFetched,
    stopReason: result.stopReason,
  };
}

/** Meme refus, meme message que `--type`. */
function parseType(value: string | undefined): SessionType | undefined {
  if (value === undefined || value === "") return undefined;
  if (!isSessionType(value)) {
    throw new Error(
      `Valeur de --type inconnue : "${value}". ` +
        `Valeurs acceptees : ${SESSION_TYPES.join(", ")}`,
    );
  }
  return value;
}

/** Meme refus, meme message que `--lobby`. */
function parseLobby(value: string | undefined): string | undefined {
  if (value === undefined || value === "") return undefined;
  if (!isKnownLobby(value)) {
    throw new Error(
      `Valeur de --lobby inconnue : "${value}". ` +
        `Valeurs acceptees : ${KNOWN_LOBBIES.join(", ")}`,
    );
  }
  return value;
}

/** Meme refus, meme message que `--max-pages`. */
function parseMaxPages(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(
      `Valeur de --max-pages invalide : "${value}" (entier positif attendu).`,
    );
  }
  return value;
}
