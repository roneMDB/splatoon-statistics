/**
 * Sauvegarde des donnees vers un dossier synchronise (Google Drive par defaut).
 *
 * Pas d'echeance : les donnees ne changent que par l'application (recuperer,
 * completer ou editer une session, enregistrer les reglages). On sauvegarde
 * donc apres chaque ecriture, regroupees par un court delai, et une fois au
 * demarrage pour rattraper une copie qui aurait echoue.
 *
 * La copie est additive : un fichier nouveau ou modifie est copie, rien n'est
 * jamais supprime a la destination. Une session effacee par erreur survit dans
 * la sauvegarde ; restaurer revient a recopier le dossier tel quel.
 *
 * Ce module n'importe pas `electron` : il reste testable hors de la fenetre.
 */

import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, rename, stat, utimes, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

/** Dossiers de Google Drive pour ordinateur, selon la langue du systeme. */
const DOSSIERS_DRIVE = ["Mon Drive", "My Drive"] as const;

/** Sous-dossier cree dans Drive, au nom de l'application. */
export const SOUS_DOSSIER_DE_SAUVEGARDE = "Splatoon Statistics";

/**
 * Ou les sessions sont rangees dans la sauvegarde : la meme place que dans le
 * dossier de travail par defaut, pour que restaurer soit une simple recopie.
 */
const SESSIONS_DANS_LA_SAUVEGARDE = join("data", "sessions");

/** Date et bilan de la derniere sauvegarde reussie, dans le dossier de travail. */
export const FICHIER_D_ETAT = ".derniere-sauvegarde.json";

/**
 * Les sources et la destination recopient leur date de modification l'une sur
 * l'autre. Un systeme de fichiers peut l'arrondir (2 s sous FAT, moins sous
 * Drive) : en dessous de cet ecart, une meme taille vaut « inchange ».
 */
const TOLERANCE_DE_DATE_MS = 2000;

export type Destination = {
  chemin: string;
  /**
   * Dossier qui doit deja exister pour qu'on ecrive : celui de Drive quand la
   * destination est celle par defaut. Le creer ferait un dossier ordinaire,
   * non synchronise, qui donnerait l'illusion d'une sauvegarde.
   */
  racineAttendue?: string;
};

/**
 * La destination d'apres le reglage : le dossier saisi, ou `Mon Drive` (a
 * defaut `My Drive`) sous le dossier personnel quand le reglage est vide.
 */
export function destinationDeSauvegarde(
  dossier: string,
  home: string,
  existe: (chemin: string) => boolean = existsSync,
): Destination {
  if (dossier.trim() !== "") return { chemin: resolve(dossier.trim()) };
  const drive = DOSSIERS_DRIVE.map((nom) => join(home, nom)).find((chemin) => existe(chemin));
  const racine = drive ?? join(home, DOSSIERS_DRIVE[0]);
  return { chemin: join(racine, SOUS_DOSSIER_DE_SAUVEGARDE), racineAttendue: racine };
}

export type BilanDeSauvegarde = {
  /** Date ISO de fin de la copie. */
  date: string;
  destination: string;
  copies: number;
  inchanges: number;
};

/**
 * Copie `source` vers `cible` s'il est nouveau ou modifie. Passe par un
 * fichier temporaire renomme ensuite : Drive ne synchronise jamais un fichier
 * a moitie ecrit. La date de la source est reportee sur la copie, c'est elle
 * qui dit « inchange » la fois suivante.
 */
async function copieSiChange(source: string, cible: string): Promise<boolean> {
  const avant = await stat(source);
  const deja = await stat(cible).catch(() => undefined);
  if (
    deja !== undefined &&
    deja.size === avant.size &&
    Math.abs(deja.mtimeMs - avant.mtimeMs) < TOLERANCE_DE_DATE_MS
  ) {
    return false;
  }
  const temporaire = join(dirname(cible), `.${basename(cible)}.partiel`);
  await copyFile(source, temporaire);
  await utimes(temporaire, avant.atime, avant.mtime);
  await rename(temporaire, cible);
  return true;
}

/**
 * Sauvegarde `settings.json` et les sessions. Le cache des resumes
 * (`.resumes.json`) et tout fichier cache sont laisses : ils se reconstruisent.
 * Un `cheminReglages` vide (tests) ou un fichier absent n'est pas une erreur.
 */
export async function sauvegarde(options: {
  destination: Destination;
  cheminReglages: string;
  dossierSessions: string;
}): Promise<BilanDeSauvegarde> {
  const { destination } = options;
  if (destination.racineAttendue !== undefined && !existsSync(destination.racineAttendue)) {
    throw new Error(
      `Google Drive introuvable : le dossier « ${destination.racineAttendue} » n'existe pas. ` +
        "Installez Google Drive pour ordinateur, ou choisissez un dossier de sauvegarde dans les réglages.",
    );
  }

  const dossierDesSessions = join(destination.chemin, SESSIONS_DANS_LA_SAUVEGARDE);
  await mkdir(dossierDesSessions, { recursive: true });

  let copies = 0;
  let inchanges = 0;
  const compte = (copie: boolean) => (copie ? copies++ : inchanges++);

  if (options.cheminReglages !== "" && existsSync(options.cheminReglages)) {
    compte(await copieSiChange(options.cheminReglages, join(destination.chemin, "settings.json")));
  }

  const noms = await readdir(options.dossierSessions).catch((erreur: NodeJS.ErrnoException) => {
    if (erreur.code === "ENOENT") return [];
    throw erreur;
  });
  for (const nom of noms.sort()) {
    if (!nom.endsWith(".json") || nom.startsWith(".")) continue;
    compte(await copieSiChange(join(options.dossierSessions, nom), join(dossierDesSessions, nom)));
  }

  return { date: new Date().toISOString(), destination: destination.chemin, copies, inchanges };
}

/** Ce que l'ecran des reglages montre de la sauvegarde. */
export type EtatDeSauvegarde = {
  automatique: boolean;
  destination: string;
  /** Derniere sauvegarde reussie, lue sur disque : elle survit a un redemarrage. */
  derniere?: BilanDeSauvegarde;
  /** Echec de la derniere tentative, s'il n'a pas ete rattrape depuis. */
  erreur?: string;
  enCours: boolean;
};

export async function lisLEtat(fichier: string): Promise<BilanDeSauvegarde | undefined> {
  try {
    return JSON.parse(await readFile(fichier, "utf8")) as BilanDeSauvegarde;
  } catch {
    // Absent ou illisible : l'ecran dit « jamais », la prochaine copie le recrit.
    return undefined;
  }
}

export type OptionsDeLaSauvegarde = {
  /** Reglage `sauvegarde.automatique` : sans lui, seul le bouton sauvegarde. */
  automatique: boolean;
  destination: Destination;
  cheminReglages: string;
  dossierSessions: string;
  fichierDEtat?: string;
  /** Delai qui regroupe les ecritures rapprochees en une seule copie. */
  delaiMs?: number;
};

/**
 * La sauvegarde de l'application : `demande` apres chaque ecriture,
 * `lanceMaintenant` pour le bouton et la fermeture.
 *
 * Une seule copie tourne a la fois. Une demande qui arrive pendant une copie
 * en relance une a la fin : le fichier ecrit entre-temps n'est pas perdu.
 */
export function creeLaSauvegarde(options: OptionsDeLaSauvegarde) {
  const fichierDEtat = options.fichierDEtat ?? FICHIER_D_ETAT;
  const delaiMs = options.delaiMs ?? 5000;
  let minuterie: ReturnType<typeof setTimeout> | undefined;
  let enCours: Promise<void> | undefined;
  let aRefaire = false;
  let erreur: string | undefined;

  async function uneCopie(): Promise<void> {
    try {
      const bilan = await sauvegarde(options);
      await writeFile(fichierDEtat, `${JSON.stringify(bilan, null, 2)}\n`, "utf8");
      erreur = undefined;
    } catch (echec) {
      // Gardee pour l'ecran ; la prochaine ecriture ou le prochain demarrage retente.
      erreur = echec instanceof Error ? echec.message : String(echec);
    }
  }

  function lanceMaintenant(): Promise<void> {
    if (minuterie !== undefined) {
      clearTimeout(minuterie);
      minuterie = undefined;
    }
    if (enCours !== undefined) {
      aRefaire = true;
      return enCours;
    }
    enCours = (async () => {
      try {
        do {
          aRefaire = false;
          await uneCopie();
        } while (aRefaire);
      } finally {
        enCours = undefined;
      }
    })();
    return enCours;
  }

  return {
    /** Programme une copie, repoussee a chaque nouvelle demande. Sans effet hors mode automatique. */
    demande(): void {
      if (!options.automatique) return;
      if (minuterie !== undefined) clearTimeout(minuterie);
      minuterie = setTimeout(() => void lanceMaintenant(), delaiMs);
    },
    lanceMaintenant,
    /** Vrai tant qu'une copie est programmee ou en cours : la fermeture l'attend. */
    enAttente: (): boolean => minuterie !== undefined || enCours !== undefined,
    async etat(): Promise<EtatDeSauvegarde> {
      // Une copie vers un autre dossier (reglage change depuis) ne compte pas :
      // elle ne dit rien de ce que contient la destination actuelle.
      const lue = await lisLEtat(fichierDEtat);
      const derniere = lue?.destination === options.destination.chemin ? lue : undefined;
      return {
        automatique: options.automatique,
        destination: options.destination.chemin,
        ...(derniere !== undefined ? { derniere } : {}),
        ...(erreur !== undefined ? { erreur } : {}),
        enCours: enCours !== undefined,
      };
    },
  };
}

export type Sauvegarde = ReturnType<typeof creeLaSauvegarde>;
