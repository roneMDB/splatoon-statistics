/**
 * Recuperation d'une session pour l'interface graphique.
 *
 * Ce module n'importe pas `electron` : il porte toute la logique appelable par
 * le processus principal, et reste donc testable hors-ligne comme le reste du
 * noyau. Le processus principal ne fait que le cabler a un canal IPC.
 *
 * Il reprend les etapes de la ligne de commande sans le dialogue de nommage :
 * le formulaire fournit le nom et le type avant de lancer la recuperation.
 *
 * La recuperation et l'ecriture sont scindees en deux fonctions : la fenetre
 * doit pouvoir montrer un apercu des matchs avant que le fichier n'existe.
 */

import { randomUUID } from "node:crypto";
import { DEFAULT_OUT_DIR } from "../config.ts";
import { toBattleRows, type BattleRow } from "../battleRows.ts";
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
import {
  summarizeSessionFile,
  tallyResults,
  type SessionResults,
  type SessionSummary,
} from "../sessionList.ts";
import { isKnownLobby, KNOWN_LOBBIES } from "../statink/url.ts";
import type { StatinkBattle } from "../statink/types.ts";
import type { BattleFilters } from "../statink/url.ts";
import { buildSessionFile, writeSession } from "../store.ts";
import { buildWindow, type SessionWindow } from "../window.ts";
import type { FetchSessionFormInput } from "./ipcChannels.ts";

export type SessionFetchHandlerDeps = {
  fetchPage?: FetchSessionDeps["fetchPage"];
  onProgress?: (progress: FetchPageProgress) => void;
  /** Injecte pour rendre `fetchedAt` previsible dans les tests. */
  now?: () => Date;
  outDir?: string;
};

/** Ce que la fenetre recoit d'un apercu : jamais les matchs bruts. */
export type SessionPreview = {
  /** A rendre a `saveSession` pour ecrire cet apercu-la. */
  previewId: string;
  user: string;
  name?: string;
  type?: SessionType;
  window: { from: string; to: string };
  battleCount: number;
  results: SessionResults;
  rows: BattleRow[];
  pagesFetched: number;
  stopReason: StopReason;
};

/** Apercu retenu cote processus principal, matchs bruts compris. */
type ApercuRetenu = {
  user: string;
  name?: string;
  type?: SessionType;
  window: SessionWindow;
  filters: BattleFilters;
  battles: StatinkBattle[];
  /** Date de l'appel reseau, pas de l'enregistrement. */
  fetchedAt: Date;
};

/**
 * Un seul apercu a la fois : il n'y a qu'une fenetre et qu'un formulaire.
 * Previsualiser a nouveau remplace le precedent, et enregistrer le consomme.
 */
let apercuRetenu: { id: string; contenu: ApercuRetenu } | undefined;

const APERCU_PERDU =
  "L'apercu n'est plus disponible. Relancez la previsualisation.";

/**
 * Valide la saisie et interroge stat.ink, sans rien ecrire.
 *
 * Les matchs bruts restent ici : la fenetre n'en voit qu'une vue allegee, ce
 * qui evite de les faire transiter deux fois et d'exposer leur contenu a une
 * alteration en chemin.
 */
export async function previewSession(
  input: FetchSessionFormInput,
  deps: SessionFetchHandlerDeps = {},
): Promise<SessionPreview> {
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
  const filters: BattleFilters = { lobby };

  const result = await fetchSession(
    { user, window, filters, maxPages },
    { fetchPage: deps.fetchPage, onPage: deps.onProgress },
  );
  const fetchedAt = deps.now?.() ?? new Date();

  const id = randomUUID();
  apercuRetenu = {
    id,
    contenu: { user, name, type, window, filters, battles: result.battles, fetchedAt },
  };

  return {
    previewId: id,
    user,
    ...(name !== undefined ? { name } : {}),
    ...(type !== undefined ? { type } : {}),
    window: {
      from: new Date(window.fromMs).toISOString(),
      to: new Date(window.toMs).toISOString(),
    },
    battleCount: result.battles.length,
    results: tallyResults(result.battles),
    rows: toBattleRows(result.battles),
    pagesFetched: result.pagesFetched,
    stopReason: result.stopReason,
  };
}

/**
 * Ecrit l'apercu retenu, puis l'oublie : un double-clic ne doit pas ecrire
 * deux fois la meme recuperation.
 */
export async function saveSession(
  previewId: string,
  deps: SessionFetchHandlerDeps = {},
): Promise<SessionSummary> {
  if (apercuRetenu === undefined || apercuRetenu.id !== previewId) {
    throw new Error(APERCU_PERDU);
  }
  const { contenu } = apercuRetenu;
  apercuRetenu = undefined;

  const file = buildSessionFile({
    user: contenu.user,
    name: contenu.name,
    type: contenu.type,
    window: contenu.window,
    filters: contenu.filters,
    battles: contenu.battles,
    fetchedAt: contenu.fetchedAt,
  });
  const path = await writeSession(file, deps.outDir ?? DEFAULT_OUT_DIR);

  return summarizeSessionFile(file, path);
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
