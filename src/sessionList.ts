/**
 * Inventaire des sessions deja ecrites sur disque.
 *
 * Sert la colonne de gauche de l'interface graphique : on veut un resume par
 * session, sans garder les matchs en memoire une fois le bilan calcule.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_OUT_DIR } from "./config.ts";
import type { SessionType } from "./sessionMeta.ts";
import type { StatinkBattle } from "./statink/types.ts";
import type { SessionFile } from "./store.ts";

/** Bilan d'une session : victoires, defaites, egalites. */
export type SessionResults = {
  win: number;
  lose: number;
  draw: number;
};

/** Ce qu'on retient d'une session sans ouvrir le detail des matchs. */
export type SessionSummary = {
  /** Chemin du fichier, pour le relire quand on voudra son detail. */
  path: string;
  user: string;
  name?: string;
  type?: SessionType;
  fetchedAt: string;
  window: { from: string; to: string };
  battleCount: number;
  results: SessionResults;
};

export type ListSessionsResult = {
  /** De la session la plus recente a la plus ancienne. */
  sessions: SessionSummary[];
  /**
   * Fichiers qu'on n'a pas su lire. Ils sont signales plutot que de faire
   * echouer tout l'inventaire : un fichier abime ne doit pas cacher les autres.
   */
  errors: { path: string; message: string }[];
};

/** Compte les victoires, defaites et egalites d'une liste de matchs. */
export function tallyResults(battles: StatinkBattle[]): SessionResults {
  const results: SessionResults = { win: 0, lose: 0, draw: 0 };
  for (const battle of battles) {
    const result = battle.result;
    if (result === "win" || result === "lose" || result === "draw") {
      results[result] += 1;
    }
  }
  return results;
}

/**
 * Reduit une session a son resume. Le tableau de matchs sert au bilan puis
 * n'est plus reference : c'est ce qui permet de parcourir toute l'archive sans
 * la garder entiere en memoire.
 */
export function summarizeSessionFile(
  file: SessionFile,
  path: string,
): SessionSummary {
  return {
    path,
    user: file.user,
    ...(file.name !== undefined ? { name: file.name } : {}),
    ...(file.type !== undefined ? { type: file.type } : {}),
    fetchedAt: file.fetchedAt,
    window: { from: file.window.from, to: file.window.to },
    battleCount: file.battleCount,
    results: tallyResults(file.battles),
  };
}

/**
 * Lit les sessions ecrites dans `outDir`.
 *
 * Un dossier absent n'est pas une erreur : c'est l'etat normal avant la
 * premiere recuperation.
 */
export async function listSessions(
  outDir: string = DEFAULT_OUT_DIR,
): Promise<ListSessionsResult> {
  let fileNames: string[];
  try {
    fileNames = await readdir(outDir);
  } catch {
    return { sessions: [], errors: [] };
  }

  const sessions: SessionSummary[] = [];
  const errors: { path: string; message: string }[] = [];

  for (const fileName of fileNames.sort()) {
    if (!fileName.endsWith(".json")) continue;
    const path = join(outDir, fileName);
    try {
      const raw = await readFile(path, "utf8");
      sessions.push(summarizeSessionFile(parseSessionFile(raw), path));
    } catch (error) {
      errors.push({
        path,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  sessions.sort((a, b) => Date.parse(b.window.from) - Date.parse(a.window.from));

  return { sessions, errors };
}

/**
 * Analyse un fichier de session, en refusant ce qui n'en est pas un. Le dossier
 * de sortie peut contenir n'importe quel `.json` depose a la main.
 */
function parseSessionFile(raw: string): SessionFile {
  const parsed: unknown = JSON.parse(raw);
  if (parsed === null || typeof parsed !== "object") {
    throw new Error("Ce fichier ne contient pas un objet JSON.");
  }

  const file = parsed as Partial<SessionFile>;
  if (
    typeof file.user !== "string" ||
    typeof file.battleCount !== "number" ||
    !Array.isArray(file.battles) ||
    typeof file.fetchedAt !== "string" ||
    typeof file.window?.from !== "string" ||
    typeof file.window?.to !== "string"
  ) {
    throw new Error("Ce fichier n'est pas une session stat.ink.");
  }

  return file as SessionFile;
}
