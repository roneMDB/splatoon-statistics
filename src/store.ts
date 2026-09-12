import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { StatinkBattle } from "./statink/types.ts";
import type { BattleFilters } from "./statink/url.ts";
import type { SessionWindow } from "./window.ts";
import type { SessionType } from "./sessionMeta.ts";

/** Contenu du fichier de session ecrit sur disque. */
export type SessionFile = {
  source: "stat.ink";
  user: string;
  /**
   * Nom libre donne a la session. Contrat rempli par `buildSessionFile` :
   * la valeur est trimee, et absente si non fournie ou reduite a des
   * espaces apres trim.
   */
  name?: string;
  /** Nature de la session. Absent si non fourni. */
  type?: SessionType;
  /**
   * Objectif que le joueur s'etait fixe pour la session (« tenir le support »).
   * Saisi a la main : aucune donnee stat.ink ne le porte. Trime et absent s'il
   * est vide, comme `name`.
   */
  objectif?: string;
  /**
   * Ressenti du joueur sur la session, saisi a la main lui aussi. Meme contrat
   * de trim et d'absence que `objectif`.
   */
  ressenti?: string;
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
  /** Nom libre donne a la session. Facultatif. */
  name?: string;
  /** Nature de la session. Facultatif. */
  type?: SessionType;
  /** Objectif de session, saisi a la main. Facultatif. */
  objectif?: string;
  /** Ressenti sur la session, saisi a la main. Facultatif. */
  ressenti?: string;
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

  const name = options.name?.trim();
  const objectif = options.objectif?.trim();
  const ressenti = options.ressenti?.trim();

  return {
    source: "stat.ink",
    user: options.user,
    // Spread conditionnel : une cle absente plutot qu'une cle a undefined,
    // pour que l'ordre du JSON reste lisible et le champ vraiment omis.
    ...(name ? { name } : {}),
    ...(options.type !== undefined ? { type: options.type } : {}),
    ...(objectif ? { objectif } : {}),
    ...(ressenti ? { ressenti } : {}),
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
  const path = join(outDir, buildSessionFileName(file.user, sessionWindowOf(file)));
  await writeSessionAt(file, path);
  return path;
}

/**
 * Ecrit le fichier de session a un chemin deja connu, sans recalculer son nom.
 *
 * Sert a la modification d'une session existante (`updateSessionMeta`) : le
 * nom de fichier ne depend que du compte et de la fenetre, jamais du contenu
 * modifie, donc le recalculer a chaque modification risquerait d'ecrire un
 * second fichier a cote d'un original renomme ou copie a la main, en laissant
 * ce dernier intact avec ses anciennes metadonnees. Ecrire sur le chemin
 * fourni evite ce risque : quel que soit son nom, c'est ce fichier-la qui est
 * mis a jour.
 */
export async function writeSessionAt(file: SessionFile, path: string): Promise<void> {
  await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, "utf8");
}

/**
 * Reconstitue les bornes d'une session depuis son fichier. Exporte parce que
 * modifier une session passe par `buildSessionFile`, qui en a besoin.
 */
export function sessionWindowOf(file: SessionFile): SessionWindow {
  const fromMs = Date.parse(file.window.from);
  const toMs = Date.parse(file.window.to);
  return { fromMs, toMs, paddedFromMs: fromMs, paddedToMs: toMs };
}
