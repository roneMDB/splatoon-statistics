import { mkdir, readFile, writeFile } from "node:fs/promises";
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
  /**
   * Nom de mon equipe pour cette session. Porte par la session et non par les
   * reglages : l'equipe change de nom, et une ancienne session doit garder
   * celui qu'elle avait. Meme contrat de trim et d'absence que `objectif`.
   */
  nomEquipe?: string;
  /** Nom de l'equipe d'en face. Meme contrat que `equipe`. */
  nomEquipeAdverse?: string;
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
  /** Nom de mon equipe. Facultatif. */
  nomEquipe?: string;
  /** Nom de l'equipe adverse. Facultatif. */
  nomEquipeAdverse?: string;
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
  const nomEquipe = options.nomEquipe?.trim();
  const nomEquipeAdverse = options.nomEquipeAdverse?.trim();

  return {
    source: "stat.ink",
    user: options.user,
    // Spread conditionnel : une cle absente plutot qu'une cle a undefined,
    // pour que l'ordre du JSON reste lisible et le champ vraiment omis.
    ...(name ? { name } : {}),
    ...(options.type !== undefined ? { type: options.type } : {}),
    ...(objectif ? { objectif } : {}),
    ...(ressenti ? { ressenti } : {}),
    ...(nomEquipe ? { nomEquipe } : {}),
    ...(nomEquipeAdverse ? { nomEquipeAdverse } : {}),
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

/** Noms d'equipe saisis en cours, qui prennent le pas sur ceux de la session. */
export type Equipes = { nomEquipe?: string; nomEquipeAdverse?: string };

/**
 * La session avec les noms d'equipe de la saisie en cours, comme l'objectif et
 * le ressenti : on relit un compte rendu avant d'enregistrer. Un champ absent
 * garde la valeur de la session ; une chaine vide l'efface.
 */
export function avecLesEquipes(file: SessionFile, equipes: Equipes = {}): SessionFile {
  const resultat = { ...file };
  for (const cle of ["nomEquipe", "nomEquipeAdverse"] as const) {
    const valeur = equipes[cle];
    if (valeur === undefined) continue;
    if (valeur.trim() === "") delete resultat[cle];
    else resultat[cle] = valeur.trim();
  }
  return resultat;
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

/** Ce que rend l'ecriture d'une session. */
export type EcritureDeSession = {
  path: string;
  /** Le contenu reellement ecrit : complete, si le fichier existait deja. */
  file: SessionFile;
  /**
   * Manches ajoutees a une session deja ecrite. Absent quand le fichier
   * n'existait pas : c'est une premiere ecriture, pas une completion.
   */
  ajoutees?: number;
};

/**
 * Ecrit le fichier de session dans `outDir`.
 *
 * Le nom de fichier ne dependant que du compte et de la fenetre, recuperer a
 * nouveau la meme fenetre vise le meme fichier - le cas courant, stat.ink
 * recevant souvent les dernieres manches avec retard. Le fichier deja la est
 * alors complete (`completeLaSession`) plutot qu'ecrase : l'objectif, le
 * ressenti et les noms d'equipe saisis a la main ne se perdent pas.
 *
 * Un fichier illisible a cet emplacement arrete l'ecriture : il n'est pas a
 * nous de decider qu'il ne vaut rien.
 */
export async function writeSession(
  file: SessionFile,
  outDir: string,
): Promise<EcritureDeSession> {
  await mkdir(outDir, { recursive: true });
  const path = join(outDir, buildSessionFileName(file.user, sessionWindowOf(file)));
  const existant = await litSiPresent(path);
  if (existant === undefined) {
    await writeSessionAt(file, path);
    return { path, file };
  }
  const { file: complete, ajoutees } = completeLaSession(existant, file);
  await writeSessionAt(complete, path);
  return { path, file: complete, ajoutees };
}

/** La session ecrite a `path`, ou `undefined` s'il n'y a pas de fichier. */
async function litSiPresent(path: string): Promise<SessionFile | undefined> {
  let brut: string;
  try {
    brut = await readFile(path, "utf8");
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw erreur;
  }
  try {
    return parseSessionFile(brut);
  } catch (erreur) {
    throw new Error(
      `Un fichier illisible occupe deja ${path} (${(erreur as Error).message}) : ` +
        "deplacez-le ou supprimez-le avant de recuperer cette session a nouveau.",
    );
  }
}

/** Champs saisis par le joueur, qu'une nouvelle recuperation ne doit pas effacer. */
const SAISIES = ["name", "type", "objectif", "ressenti", "nomEquipe", "nomEquipeAdverse"] as const;

/**
 * Complete une session deja ecrite avec une nouvelle recuperation de la meme
 * fenetre.
 *
 * - Les manches sont reunies par `uuid` : une manche que stat.ink n'a pas
 *   ramenee cette fois reste, une manche deja connue prend sa version
 *   recuperee, plus fraiche. Sauf si les filtres different : les deux
 *   recuperations ne portent alors pas sur les memes manches, et la nouvelle
 *   remplace l'ancienne plutot que de s'y melanger.
 * - Chaque saisie (nom, type, objectif, ressenti, equipes) prend la valeur
 *   fournie par la recuperation, et garde celle du fichier sinon.
 * - `fetchedAt` est celui de la recuperation.
 */
export function completeLaSession(
  existant: SessionFile,
  recupere: SessionFile,
): { file: SessionFile; ajoutees: number } {
  const connues = new Set(existant.battles.map((manche) => manche.uuid));
  const ajoutees = recupere.battles.filter((manche) => !connues.has(manche.uuid)).length;

  let battles = recupere.battles;
  if (memesFiltres(existant.filters, recupere.filters)) {
    const parUuid = new Map(existant.battles.map((manche) => [manche.uuid, manche]));
    for (const manche of recupere.battles) parUuid.set(manche.uuid, manche);
    battles = [...parUuid.values()].sort(
      (a, b) => (a.start_at?.time ?? 0) - (b.start_at?.time ?? 0),
    );
  }

  const saisies: Partial<Pick<SessionFile, (typeof SAISIES)[number]>> = {};
  for (const cle of SAISIES) {
    const valeur = recupere[cle] ?? existant[cle];
    if (valeur !== undefined) (saisies as Record<string, string>)[cle] = valeur;
  }

  const file = buildSessionFile({
    user: recupere.user,
    ...saisies,
    window: sessionWindowOf(recupere),
    // Le fichier stocke les filtres a plat ; ils repartent tels quels.
    filters: recupere.filters as BattleFilters,
    battles,
    fetchedAt: new Date(recupere.fetchedAt),
  });
  return { file, ajoutees };
}

function memesFiltres(a: Record<string, string>, b: Record<string, string>): boolean {
  const cles = Object.keys(a);
  return cles.length === Object.keys(b).length && cles.every((cle) => a[cle] === b[cle]);
}

/**
 * Analyse un fichier de session, en refusant ce qui n'en est pas un. Le dossier
 * de sortie peut contenir n'importe quel `.json` depose a la main.
 */
export function parseSessionFile(raw: string): SessionFile {
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
