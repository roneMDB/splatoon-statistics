/**
 * Reglages de l'utilisateur, lus dans `settings.json` a la racine du depot.
 *
 * Le fichier est facultatif et partiel : on n'y ecrit que ce qu'on veut changer,
 * tout le reste garde sa valeur par defaut (`REGLAGES_PAR_DEFAUT`). Il est
 * ignore par git - il porte le compte stat.ink de chacun ; `settings.exemple.json`
 * montre toutes les cles.
 *
 * La lecture est **stricte** : une clé inconnue ou une valeur hors bornes
 * arrete le programme avec un message qui la nomme. Une faute de frappe
 * (`"utilisateurs"`) ignoree en silence laisserait croire a un reglage pris en
 * compte ; c'est pire qu'un refus.
 *
 * Ce module ne depend d'aucun autre du depot : `config.ts`, `sessionMeta.ts`
 * et `report/seuils.ts` en tirent leurs constantes, et il ne doit pas les
 * importer en retour.
 *
 * Chemin : `SPLATOON_SETTINGS` s'il est defini, `settings.json` sinon. Une
 * valeur vide desactive la lecture - c'est ce que font les tests, pour que les
 * reglages personnels ne changent pas leur resultat.
 */

import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { SECTIONS, type SectionCompteRendu } from "./report/sectionsConnues.ts";

export type Seuils = {
  serieFinaleMinimale: number;
  serieInitialeMinimale: number;
  mancheCourteSecondes: number;
  defaiteSerreeEcart: number;
  baisseDeRegimeRelative: number;
  modeEnEchecManches: number;
  modeEnEchecStages: number;
  meilleurModeManches: number;
  partDeSessionReguliere: number;
  medaillesCitees: number;
};

export type Reglages = {
  /** Compte stat.ink interroge par defaut. */
  utilisateur: string;
  /** Natures de session proposees, dans l'ordre des menus. */
  typesDeSession: string[];
  /** Sections cochees a l'ouverture d'une fiche, et par defaut en ligne de commande. */
  sectionsParDefaut: SectionCompteRendu[];
  /** Case « compte rendu en tete de planche » cochee a l'ouverture. */
  enteteParDefaut: boolean;
  dossiers: { sessions: string; planches: string; pictos: string };
  seuils: Seuils;
};

export const REGLAGES_PAR_DEFAUT: Reglages = {
  utilisateur: "Gloup",
  typesDeSession: ["intra", "scrim", "compet", "open", "autre"],
  sectionsParDefaut: [...SECTIONS],
  enteteParDefaut: false,
  dossiers: {
    sessions: "data/sessions",
    planches: "data/planches",
    pictos: "assets/splatoon",
  },
  seuils: {
    serieFinaleMinimale: 3,
    serieInitialeMinimale: 3,
    mancheCourteSecondes: 180,
    defaiteSerreeEcart: 5,
    baisseDeRegimeRelative: 0.25,
    modeEnEchecManches: 2,
    modeEnEchecStages: 2,
    meilleurModeManches: 2,
    partDeSessionReguliere: 0.5,
    medaillesCitees: 4,
  },
};

/**
 * Ce que chaque seuil decide, dit pour l'ecran des reglages.
 *
 * Ecrit ici plutot que dans la fenetre : la liste des seuils ne vit qu'a un
 * endroit, et le type `Record<keyof Seuils, ...>` refuse qu'un seuil ajoute
 * soit oublie a l'ecran. `unite` vaut « % » pour les parts : la fenetre les
 * affiche en pourcentage et les rend en fraction.
 */
export const DESCRIPTION_DES_SEUILS: Record<
  keyof Seuils,
  { libelle: string; section: string; unite: string; explication: string }
> = {
  serieInitialeMinimale: {
    libelle: "Série de victoires en ouverture",
    section: "Courbe de session",
    unite: "victoires",
    explication:
      "Nombre de victoires d'affilée en début de session à partir duquel le compte rendu écrit « Entrée en matière : N victoires d'affilée ». En dessous, un bon départ n'est pas mentionné.",
  },
  serieFinaleMinimale: {
    libelle: "Série de défaites en fin de session",
    section: "Courbe de session",
    unite: "défaites",
    explication:
      "Nombre de défaites d'affilée pour terminer à partir duquel le compte rendu parle de décrochage (« La session décroche à 22:10 »). Plus la valeur est basse, plus vite une fin difficile est signalée.",
  },
  mancheCourteSecondes: {
    libelle: "Durée d'un écrasement",
    section: "Courbe de session",
    unite: "secondes",
    explication:
      "Une défaite plus courte que cette durée est listée comme écrasement : un KO encaissé avant toute mise en place. Une manche complète dure environ 5 minutes (300 s). Les victoires rapides ne sont pas concernées.",
  },
  defaiteSerreeEcart: {
    libelle: "Écart d'une défaite serrée",
    section: "Courbe de session",
    unite: "points",
    explication:
      "Une défaite dont l'écart au score ne dépasse pas cette valeur est listée comme défaite serrée. L'écart se compte en points dans les modes objectif, et en points de pourcentage en Guerre de territoire.",
  },
  baisseDeRegimeRelative: {
    libelle: "Baisse de régime",
    section: "Courbe de session",
    unite: "%",
    explication:
      "Compare mes éliminations par manche entre la première et la seconde moitié de session. Si la baisse atteint cette part, le compte rendu la signale (« passent de 4,2 à 2,9 »). En dessous, c'est considéré comme du bruit.",
  },
  modeEnEchecManches: {
    libelle: "Mode en échec : manches",
    section: "Carte des modes",
    unite: "manches",
    explication:
      "Nombre minimal de manches jouées dans un mode sans aucune victoire pour que le compte rendu conclue que c'est le mode qui pose problème. Va avec le seuil suivant : les deux doivent être atteints.",
  },
  modeEnEchecStages: {
    libelle: "Mode en échec : stages différents",
    section: "Carte des modes",
    unite: "stages",
    explication:
      "Nombre minimal de stages différents sur lesquels ce mode a été perdu. Perdre deux fois sur le même stage accuse le stage ; perdre sur plusieurs accuse le mode (« Ce n'est donc pas la carte, c'est le mode »).",
  },
  meilleurModeManches: {
    libelle: "Point fort : manches minimales",
    section: "Carte des modes",
    unite: "manches",
    explication:
      "Nombre minimal de manches pour qu'un mode puisse être désigné comme « le mode qui nous a tenus ». Sans ce plancher, un mode joué et gagné une seule fois passerait devant un mode gagné deux fois sur trois.",
  },
  partDeSessionReguliere: {
    libelle: "Présence d'un joueur régulier",
    section: "Bulletin de rôle et Scouting",
    unite: "%",
    explication:
      "Part des manches qu'un joueur doit avoir jouées pour compter comme régulier. Seuls les réguliers sont comparés dans le bulletin et listés dans le scouting et le bloc « En face » de la planche : un remplaçant de deux manches ne se compare pas à qui a tout joué. Les adversaires en dessous sont seulement comptés.",
  },
  medaillesCitees: {
    libelle: "Médailles citées",
    section: "Bulletin de rôle",
    unite: "médailles",
    explication:
      "Nombre de médailles, les plus fréquentes d'abord, citées dans le bulletin de rôle et affichées dans le bulletin de la planche.",
  },
};

/** Comment verifier chaque seuil : un entier au moins égal à 1, ou une part de ]0, 1]. */
const NATURE_DES_SEUILS: Record<keyof Seuils, "entier" | "part"> = {
  serieFinaleMinimale: "entier",
  serieInitialeMinimale: "entier",
  mancheCourteSecondes: "entier",
  defaiteSerreeEcart: "entier",
  baisseDeRegimeRelative: "part",
  modeEnEchecManches: "entier",
  modeEnEchecStages: "entier",
  meilleurModeManches: "entier",
  partDeSessionReguliere: "part",
  medaillesCitees: "entier",
};

const estUnObjet = (valeur: unknown): valeur is Record<string, unknown> =>
  typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);

/** Refuse toute cle hors de `connues`, en nommant la premiere trouvee. */
function refuseLesClesInconnues(objet: Record<string, unknown>, connues: readonly string[], ou: string): void {
  const inconnue = Object.keys(objet).find((cle) => !connues.includes(cle));
  if (inconnue !== undefined) {
    throw new Error(`${ou} : clé inconnue "${inconnue}". Clés acceptées : ${connues.join(", ")}.`);
  }
}

function texteNonVide(valeur: unknown, ou: string): string {
  if (typeof valeur !== "string" || valeur.trim() === "") {
    throw new Error(`${ou} : texte non vide attendu.`);
  }
  return valeur.trim();
}

/**
 * Valide un contenu de `settings.json` et le complete par les valeurs par
 * defaut. `source` sert aux messages : c'est ce que l'utilisateur doit ouvrir.
 */
export function valideLesReglages(brut: unknown, source = "settings.json"): Reglages {
  if (!estUnObjet(brut)) throw new Error(`${source} : un objet JSON est attendu.`);
  refuseLesClesInconnues(brut, Object.keys(REGLAGES_PAR_DEFAUT), source);

  const reglages: Reglages = structuredClone(REGLAGES_PAR_DEFAUT);

  if (brut.utilisateur !== undefined) {
    reglages.utilisateur = texteNonVide(brut.utilisateur, `${source}, "utilisateur"`);
  }

  if (brut.typesDeSession !== undefined) {
    const ou = `${source}, "typesDeSession"`;
    if (!Array.isArray(brut.typesDeSession) || brut.typesDeSession.length === 0) {
      throw new Error(`${ou} : liste non vide attendue.`);
    }
    // Le type finit dans le fichier de session et dans le titre du compte
    // rendu (« Open du 13/09 ») : des minuscules, des chiffres, des tirets.
    const types = brut.typesDeSession.map((type) => {
      if (typeof type !== "string" || !/^[a-z0-9-]{1,20}$/.test(type)) {
        throw new Error(`${ou} : "${String(type)}" n'est pas un type valide (minuscules, chiffres, tirets).`);
      }
      return type;
    });
    const doublon = types.find((type, index) => types.indexOf(type) !== index);
    if (doublon !== undefined) throw new Error(`${ou} : "${doublon}" apparaît deux fois.`);
    reglages.typesDeSession = types;
  }

  if (brut.sectionsParDefaut !== undefined) {
    const ou = `${source}, "sectionsParDefaut"`;
    if (!Array.isArray(brut.sectionsParDefaut)) throw new Error(`${ou} : liste attendue.`);
    const inconnue = brut.sectionsParDefaut.find(
      (section) => !(SECTIONS as readonly unknown[]).includes(section),
    );
    if (inconnue !== undefined) {
      throw new Error(`${ou} : section inconnue "${String(inconnue)}". Sections : ${SECTIONS.join(", ")}.`);
    }
    // Dans l'ordre du document, quel que soit l'ordre ecrit.
    reglages.sectionsParDefaut = SECTIONS.filter((section) =>
      (brut.sectionsParDefaut as unknown[]).includes(section),
    );
  }

  if (brut.enteteParDefaut !== undefined) {
    if (typeof brut.enteteParDefaut !== "boolean") {
      throw new Error(`${source}, "enteteParDefaut" : true ou false attendu.`);
    }
    reglages.enteteParDefaut = brut.enteteParDefaut;
  }

  if (brut.dossiers !== undefined) {
    const ou = `${source}, "dossiers"`;
    if (!estUnObjet(brut.dossiers)) throw new Error(`${ou} : objet attendu.`);
    refuseLesClesInconnues(brut.dossiers, Object.keys(REGLAGES_PAR_DEFAUT.dossiers), ou);
    for (const cle of Object.keys(reglages.dossiers) as (keyof Reglages["dossiers"])[]) {
      const valeur = brut.dossiers[cle];
      if (valeur !== undefined) reglages.dossiers[cle] = texteNonVide(valeur, `${ou}.${cle}`);
    }
  }

  if (brut.seuils !== undefined) {
    const ou = `${source}, "seuils"`;
    if (!estUnObjet(brut.seuils)) throw new Error(`${ou} : objet attendu.`);
    refuseLesClesInconnues(brut.seuils, Object.keys(NATURE_DES_SEUILS), ou);
    for (const [cle, nature] of Object.entries(NATURE_DES_SEUILS) as [keyof Seuils, "entier" | "part"][]) {
      const valeur = brut.seuils[cle];
      if (valeur === undefined) continue;
      const valide =
        typeof valeur === "number" &&
        (nature === "entier" ? Number.isInteger(valeur) && valeur >= 1 : valeur > 0 && valeur <= 1);
      if (!valide) {
        throw new Error(
          `${ou}.${cle} : ${nature === "entier" ? "entier au moins égal à 1" : "nombre entre 0 (exclu) et 1"} attendu.`,
        );
      }
      reglages.seuils[cle] = valeur as number;
    }
  }

  return reglages;
}

/**
 * Lit les reglages. Un fichier absent donne les valeurs par defaut ; un
 * fichier illisible ou invalide est une erreur, jamais un retour discret aux
 * valeurs par defaut.
 */
export function chargeLesReglages(chemin: string = cheminDesReglages()): Reglages {
  if (chemin === "") return structuredClone(REGLAGES_PAR_DEFAUT);

  let texte: string;
  try {
    texte = readFileSync(chemin, "utf8");
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(REGLAGES_PAR_DEFAUT);
    throw erreur;
  }

  let brut: unknown;
  try {
    brut = JSON.parse(texte);
  } catch (erreur) {
    throw new Error(`${chemin} : JSON invalide (${(erreur as Error).message}).`);
  }
  return valideLesReglages(brut, chemin);
}

/** Le fichier lu et ecrit : `SPLATOON_SETTINGS` s'il est defini, `settings.json` sinon. */
export function cheminDesReglages(): string {
  return process.env["SPLATOON_SETTINGS"] ?? "settings.json";
}

/**
 * Ce qui differe des valeurs par defaut, et rien d'autre.
 *
 * C'est ce qu'on ecrit : un fichier qui recopierait toutes les valeurs figerait
 * aussi celles qu'on n'a jamais touchees, et un changement de valeur par
 * defaut dans une version suivante ne l'atteindrait plus.
 */
export function ecartAuxDefauts(reglages: Reglages): Partial<Record<keyof Reglages, unknown>> {
  const ecart: Record<string, unknown> = {};
  const defauts = REGLAGES_PAR_DEFAUT as unknown as Record<string, unknown>;
  const valeurs = reglages as unknown as Record<string, unknown>;
  const pareil = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

  for (const cle of Object.keys(REGLAGES_PAR_DEFAUT)) {
    const valeur = valeurs[cle];
    const defaut = defauts[cle];
    // Les objets imbriques (dossiers, seuils) s'ecrivent eux aussi en partiel.
    if (typeof defaut === "object" && defaut !== null && !Array.isArray(defaut)) {
      const sous: Record<string, unknown> = {};
      for (const [souscle, sousdefaut] of Object.entries(defaut)) {
        const sousvaleur = (valeur as Record<string, unknown>)[souscle];
        if (!pareil(sousvaleur, sousdefaut)) sous[souscle] = sousvaleur;
      }
      if (Object.keys(sous).length > 0) ecart[cle] = sous;
    } else if (!pareil(valeur, defaut)) {
      ecart[cle] = valeur;
    }
  }
  return ecart;
}

/**
 * Valide puis ecrit des reglages, en ne gardant que l'ecart aux valeurs par
 * defaut. Rend les reglages complets, tels qu'ils seront lus au prochain
 * demarrage. Rien n'est ecrit si la validation echoue.
 */
export async function enregistreLesReglages(brut: unknown, chemin: string = cheminDesReglages()): Promise<Reglages> {
  if (chemin === "") {
    throw new Error("La lecture des réglages est désactivée (SPLATOON_SETTINGS vide) : rien à enregistrer.");
  }
  const reglages = valideLesReglages(brut, chemin);
  await writeFile(chemin, `${JSON.stringify(ecartAuxDefauts(reglages), null, 2)}\n`, "utf8");
  return reglages;
}

/**
 * Les reglages du processus, lus une fois au demarrage.
 *
 * Un reglage invalide est refuse ici, au chargement du module - avant le
 * `catch` des points d'entree. En ligne de commande, on imprime le message seul
 * plutot qu'une pile d'appels ou il se noie. Sous Electron, l'erreur remonte :
 * la boite de dialogue d'erreur du processus principal l'affiche, alors qu'un
 * `exit` fermerait l'application sans rien dire.
 */
function reglagesDuProcessus(): Reglages {
  try {
    return chargeLesReglages();
  } catch (erreur) {
    if (process.versions["electron"] !== undefined) throw erreur;
    console.error(`Réglages refusés. ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    process.exit(1);
  }
}

export const REGLAGES: Reglages = reglagesDuProcessus();
