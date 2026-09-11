import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { StatinkBattle } from "./statink/types.ts";
import type { BattleFilters } from "./statink/url.ts";
import type { SessionWindow } from "./window.ts";

/** Contenu du fichier de session ecrit sur disque. */
export type SessionFile = {
  source: "stat.ink";
  user: string;
  /** Instant de la recuperation, en ISO 8601 UTC. */
  fetchedAt: string;
  /** Fenetre demandee, en ISO 8601 UTC pour lever toute ambiguite de fuseau. */
  window: { from: string; to: string };
  /** Filtres serveur reellement appliques. */
  filters: Record<string, string>;
  battleCount: number;
  /** Matchs bruts, non transformes, du plus ancien au plus recent. */
  battles: StatinkBattle[];
};

export type BuildSessionFileOptions = {
  user: string;
  window: SessionWindow;
  filters?: BattleFilters;
  battles: StatinkBattle[];
  fetchedAt: Date;
};

/** Assemble le contenu du fichier de session, sans rien ecrire. */
export function buildSessionFile(
  options: BuildSessionFileOptions,
): SessionFile {
  const filters: Record<string, string> = {};
  for (const [key, value] of Object.entries(options.filters ?? {})) {
    if (value !== undefined && value !== "") {
      filters[key] = value;
    }
  }

  return {
    source: "stat.ink",
    user: options.user,
    fetchedAt: options.fetchedAt.toISOString(),
    window: {
      from: new Date(options.window.fromMs).toISOString(),
      to: new Date(options.window.toMs).toISOString(),
    },
    filters,
    battleCount: options.battles.length,
    battles: options.battles,
  };
}

/**
 * Nom de fichier deterministe : reexecuter la meme requete reecrit le meme
 * fichier plutot que d'en accumuler des variantes.
 */
export function buildSessionFileName(
  user: string,
  window: SessionWindow,
): string {
  const stamp = (epochMs: number) => {
    const date = new Date(epochMs);
    const pad = (value: number) => String(value).padStart(2, "0");
    return (
      `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
      `-${pad(date.getHours())}${pad(date.getMinutes())}`
    );
  };
  const safeUser = user.replace(/[^\w.-]+/g, "-");
  return `${safeUser}_${stamp(window.fromMs)}_${stamp(window.toMs)}.json`;
}

/** Ecrit le fichier de session dans `outDir` et renvoie son chemin. */
export async function writeSession(
  file: SessionFile,
  outDir: string,
): Promise<string> {
  await mkdir(outDir, { recursive: true });
  const path = join(outDir, buildSessionFileName(file.user, windowOf(file)));
  await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  return path;
}

/** Reconstitue les bornes locales depuis le fichier, pour nommer le fichier. */
function windowOf(file: SessionFile): SessionWindow {
  const fromMs = Date.parse(file.window.from);
  const toMs = Date.parse(file.window.to);
  return { fromMs, toMs, paddedFromMs: fromMs, paddedToMs: toMs };
}
