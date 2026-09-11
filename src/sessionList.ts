/**
 * Inventaire des sessions deja ecrites sur disque.
 *
 * Sert la colonne de gauche de l'interface graphique : on veut un resume par
 * session, sans garder les matchs en memoire une fois le bilan calcule.
 */

import { readdir, readFile, realpath, rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { DEFAULT_OUT_DIR } from "./config.ts";
import type { SessionType } from "./sessionMeta.ts";
import type { StatinkBattle } from "./statink/types.ts";
import { buildSessionFile, sessionWindowOf, writeSessionAt } from "./store.ts";
import type { SessionFile } from "./store.ts";
import type { BattleFilters } from "./statink/url.ts";

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

/**
 * Refuse tout chemin qui sort du dossier des sessions.
 *
 * La fenetre envoie ce chemin : sans ce controle, un rendu compromis ferait
 * lire ou supprimer n'importe quel fichier accessible a l'utilisateur.
 *
 * Le controle syntaxique (`startsWith`/`endsWith`) ne suffit pas seul : un
 * lien symbolique depose dans le dossier des sessions et pointant ailleurs le
 * traverserait sans etre detecte, meme si le lien porte sur un dossier
 * intermediaire du chemin plutot que sur le fichier final. On resout donc
 * aussi la cible reelle avec `realpath`.
 *
 * La racine elle-meme doit passer par `realpath`, pas seulement le chemin
 * demande : si `outDir` (ou l'un de ses dossiers parents) est lui-meme un
 * lien symbolique - un utilisateur qui deporte `data/sessions` sur un autre
 * disque, par exemple -, comparer la cible reelle a la racine syntaxique ne
 * correspondrait jamais, et tout acces serait refuse. C'est aussi ce qui rend
 * la garde independante de la plateforme : sur macOS, `os.tmpdir()` rend un
 * chemin sous `/var`, lui-meme un lien vers `/private/var`.
 *
 * Un echec de `realpath` sur la racine est tolere quand il s'agit d'un
 * dossier absent (ENOENT) : c'est l'etat normal avant la premiere
 * recuperation, la racine syntaxique sert alors de repli. Dans ce cas, le
 * chemin demande echouera de toute facon plus loin (`readFile`/`rm`), puisque
 * rien ne peut exister sous un dossier qui n'existe pas lui-meme.
 *
 * Un echec de `realpath` sur le chemin demande est refuse ici, sans
 * tolerance pour ENOENT : un fichier simplement absent aurait de toute facon
 * fait echouer `readFile`/`rm` en aval, mais un lien symbolique pendouillant
 * depose dans le dossier et pointant hors de celui-ci franchirait sinon la
 * garde. Si la cible apparaissait entre ce controle et l'acces reel
 * (TOCTOU), la lecture ou la suppression porterait alors hors du dossier
 * sans etre interceptee.
 *
 * Un chemin contenant un octet NUL fait lever a Node un `TypeError` avant
 * tout acces disque ; on l'aligne ici sur le message des autres refus plutot
 * que de le laisser filtrer tel quel.
 */
async function cheminDeSession(path: string, outDir: string): Promise<string> {
  const resolu = resolve(path);
  const racineSyntaxique = resolve(outDir);
  if (!resolu.startsWith(racineSyntaxique + sep) || !resolu.endsWith(".json")) {
    throw new Error(`Chemin de session refuse : ${path}`);
  }

  let racine: string;
  try {
    racine = await realpath(racineSyntaxique);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      racine = racineSyntaxique;
    } else {
      throw error;
    }
  }

  let reel: string;
  try {
    reel = await realpath(resolu);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ERR_INVALID_ARG_VALUE") {
      throw new Error(`Chemin de session refuse : ${path}`);
    }
    throw error;
  }
  if (!reel.startsWith(racine + sep)) {
    throw new Error(`Chemin de session refuse : ${path}`);
  }

  return resolu;
}

/**
 * Lit une session complete, matchs compris.
 *
 * Le chemin vient de la fenetre, potentiellement compromise : c'est
 * `cheminDeSession` qui garantit qu'on ne lit jamais un fichier hors du
 * dossier des sessions. L'appelant doit donc s'attendre a un rejet — pas
 * seulement a une session — des que le chemin recu ne designe pas un fichier
 * de ce dossier.
 */
export async function readSession(
  path: string,
  outDir: string = DEFAULT_OUT_DIR,
): Promise<SessionFile> {
  const resolu = await cheminDeSession(path, outDir);
  return parseSessionFile(await readFile(resolu, "utf8"));
}

/**
 * Change le nom et le type d'une session ecrite.
 *
 * Le fichier est reconstruit par `buildSessionFile` plutot que retouche : le
 * format et l'ordre des cles restent identiques a l'ecriture initiale - pour
 * un fichier produit par la version courante. `buildSessionFile` ne connait
 * qu'une liste fermee de champs de niveau fichier ; un champ de ce niveau
 * qu'une version future (ou un depot a la main) aurait ajoute et que celle-ci
 * ignore ne survivrait donc pas a une modification. Les matchs, eux,
 * traversent intacts : `battles` n'est jamais retouche.
 * `fetchedAt` est repris tel quel, c'est la recuperation qui date le fichier.
 *
 * Ecrit sur le chemin deja valide par `cheminDeSession` plutot que de
 * recalculer un nom de fichier depuis le compte et la fenetre : un fichier
 * renomme ou copie a la main garde ainsi son nom, au lieu qu'une modification
 * en ecrive un second a cote sous le nom canonique et laisse l'original
 * intact avec ses anciennes metadonnees.
 *
 * Remplace les metadonnees, ne les fusionne pas : omettre `name` ou `type`
 * les efface du fichier plutot que de conserver la valeur existante. C'est
 * voulu, l'appelant est un formulaire qui pre-remplit les deux champs depuis
 * la session et les renvoie toujours tous les deux ; un futur appel partiel
 * devra relire la session au prealable s'il veut en garder un des deux.
 */
export async function updateSessionMeta(
  path: string,
  meta: { name?: string; type?: SessionType },
  outDir: string = DEFAULT_OUT_DIR,
): Promise<SessionSummary> {
  const resolu = await cheminDeSession(path, outDir);
  const file = parseSessionFile(await readFile(resolu, "utf8"));

  const reconstruit = buildSessionFile({
    user: file.user,
    name: meta.name,
    type: meta.type,
    window: sessionWindowOf(file),
    // Le fichier stocke les filtres a plat ; ils repartent tels quels.
    filters: file.filters as BattleFilters,
    battles: file.battles,
    fetchedAt: new Date(file.fetchedAt),
  });

  await writeSessionAt(reconstruit, resolu);
  return summarizeSessionFile(reconstruit, resolu);
}

/**
 * Supprime definitivement une session.
 *
 * Le chemin vient de la fenetre, potentiellement compromise : c'est
 * `cheminDeSession` qui garantit qu'on ne supprime jamais un fichier hors du
 * dossier des sessions. L'appelant doit donc s'attendre a un rejet plutot
 * qu'une suppression des qu'un chemin hors de ce dossier lui est passe.
 */
export async function deleteSession(
  path: string,
  outDir: string = DEFAULT_OUT_DIR,
): Promise<void> {
  await rm(await cheminDeSession(path, outDir));
}
