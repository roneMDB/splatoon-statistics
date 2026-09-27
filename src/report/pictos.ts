/**
 * Pictos et polices de Splatoon 3, lus dans `assets/splatoon/` et rendus en
 * URI `data:` pour la planche.
 *
 * Le dossier est rempli une fois pour toutes par `npm run pictos` (voir
 * `scripts/recuperePictos.ts`), sur chaque machine : il est ignore par git, ces
 * fichiers appartenant a Nintendo. Ce module ne fait aucun appel reseau, et la
 * planche reste un document autonome - une URI `data:` n'est pas un chargement.
 *
 * Seul ce qu'une session utilise est lu : les 174 armes pesent 3 Mo, une
 * session en utilise une trentaine.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_PICTOS_DIR } from "../config.ts";
import type { SessionFile } from "../store.ts";
import { REGLES } from "./regles.ts";

export type CategoriePicto =
  | "armes"
  | "sous"
  | "speciales"
  | "regles"
  | "lobbies"
  | "stages"
  | "medailles"
  | "stats"
  | "polices";

/** Rend l'URI `data:` d'un picto, ou `undefined` s'il n'existe pas. */
export type Pictos = (categorie: CategoriePicto, cle: string) => string | undefined;

/** Aucun picto : la planche retombe partout sur le texte. */
export const aucunPicto: Pictos = () => undefined;

/**
 * Une cle stat.ink devient un nom de fichier, et plus tard une classe CSS :
 * tout ce qui n'est pas `[a-z0-9_]` est refuse, pas nettoye. Une cle hostile ne
 * sort jamais du dossier et n'atteint jamais le document.
 */
export const cleSure = (cle: string | undefined): cle is string =>
  cle !== undefined && /^[a-z0-9_]{1,64}$/.test(cle);

const TYPES: Readonly<Record<string, string>> = {
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

/** Chaque categorie et les extensions qu'on y cherche, dans l'ordre. */
const EXTENSIONS: Readonly<Record<CategoriePicto, readonly string[]>> = {
  armes: [".png"],
  sous: [".png"],
  speciales: [".png"],
  // La tricolore n'existe qu'en PNG ; les autres regles sont des SVG.
  regles: [".svg", ".png"],
  lobbies: [".svg"],
  stages: [".png"],
  medailles: [".png"],
  // Les pictos de SplatNet 3 qui disent « elimination » et « mort ».
  stats: [".svg"],
  polices: [".woff2"],
};

/** Toutes les cles d'une session, par categorie. */
export function clesDeLaSession(file: SessionFile): Map<CategoriePicto, Set<string>> {
  const cles = new Map<CategoriePicto, Set<string>>(
    (Object.keys(EXTENSIONS) as CategoriePicto[]).map((categorie) => [categorie, new Set()]),
  );
  const ajoute = (categorie: CategoriePicto, cle: string | undefined) => {
    if (cleSure(cle)) cles.get(categorie)?.add(cle);
  };

  for (const battle of file.battles) {
    ajoute("regles", battle.rule?.key);
    ajoute("stages", battle.stage?.key);
    ajoute("lobbies", battle.lobby?.key);
    for (const membre of [...(battle.our_team_members ?? []), ...(battle.their_team_members ?? [])]) {
      ajoute("armes", membre.weapon?.key);
      ajoute("sous", membre.weapon?.sub?.key);
      ajoute("speciales", membre.weapon?.special?.key);
    }
  }
  ajoute("medailles", "or");
  ajoute("medailles", "argent");
  ajoute("stats", "elimination");
  ajoute("stats", "mort");
  ajoute("polices", "titre");
  ajoute("polices", "texte");

  return cles;
}

/** Lit un picto en URI `data:`, ou `undefined` s'il manque ou si la cle est douteuse. */
async function lisUnPicto(dossier: string, categorie: CategoriePicto, cle: string): Promise<string | undefined> {
  if (!cleSure(cle)) return undefined;
  for (const extension of EXTENSIONS[categorie]) {
    const contenu = await readFile(join(dossier, categorie, `${cle}${extension}`)).catch(() => undefined);
    if (contenu !== undefined) return `data:${TYPES[extension]};base64,${contenu.toString("base64")}`;
  }
  return undefined;
}

/** Ce que la fenetre de l'application emprunte au jeu pour s'habiller. */
export type Habillage = {
  polices: { titre?: string; texte?: string };
  /** Picto de chaque regle connue, par cle stat.ink. */
  regles: Record<string, string>;
  /**
   * Couleurs de chaque regle, celles de la planche (`REGLES`) : la fenetre ne
   * les redeclare pas. `inconnue` est toujours la.
   */
  couleurs: Record<string, { vive: string; matte: string }>;
};

/**
 * Polices et pictos de regle, pour la fenetre. Meme tolerance que pour la
 * planche : sans `npm run pictos`, la fenetre garde ses polices systeme et ses
 * lignes sans picto, mais s'ouvre.
 */
export async function chargeLHabillage(dossier: string = DEFAULT_PICTOS_DIR): Promise<Habillage> {
  const regles: Record<string, string> = {};
  for (const [cle] of REGLES) {
    const uri = await lisUnPicto(dossier, "regles", cle);
    if (uri !== undefined) regles[cle] = uri;
  }
  const titre = await lisUnPicto(dossier, "polices", "titre");
  const texte = await lisUnPicto(dossier, "polices", "texte");
  return {
    polices: { ...(titre !== undefined ? { titre } : {}), ...(texte !== undefined ? { texte } : {}) },
    regles,
    couleurs: Object.fromEntries(REGLES.map(([cle, vive, matte]) => [cle, { vive, matte }])),
  };
}

/**
 * Lit les pictos d'une session. Un fichier absent n'est pas une erreur : le
 * picto manque, la planche retombe sur le texte. Une arme sortie apres le
 * dernier `npm run pictos` ne doit pas empecher de fabriquer la planche.
 */
export async function chargeLesPictos(
  file: SessionFile,
  dossier: string = DEFAULT_PICTOS_DIR,
): Promise<Pictos> {
  const trouves = new Map<string, string>();

  for (const [categorie, cles] of clesDeLaSession(file)) {
    for (const cle of cles) {
      const uri = await lisUnPicto(dossier, categorie, cle);
      if (uri !== undefined) trouves.set(`${categorie}/${cle}`, uri);
    }
  }

  return (categorie, cle) => trouves.get(`${categorie}/${cle}`);
}
