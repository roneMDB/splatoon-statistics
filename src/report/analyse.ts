/**
 * Reduit une session a ce qu'un compte rendu a besoin de savoir.
 *
 * Ce module compte, il ne redige pas : aucune phrase n'en sort, seulement des
 * chiffres et des libelles. Les sections de compte rendu travaillent toutes sur
 * le resultat de `analyseSession` et ne relisent jamais `battles`, ce qui les
 * rend testables sur une analyse construite a la main plutot que sur un faux
 * payload stat.ink.
 */

import type { SessionFile } from "../store.ts";
import type { StatinkBattle, StatinkTeamMember } from "../statink/types.ts";
import {
  libelleDeLaMedaille,
  libelleDuMode,
  libelleDuStage,
  nomDeLArme,
} from "../libelles.fr.ts";
import { PART_DE_SESSION_REGULIERE } from "./seuils.ts";

/**
 * Une arme jouee par quelqu'un, et sur combien de manches.
 *
 * Les deux langues restent separees jusqu'a l'affichage : une enumeration
 * d'armes ne veut pas des deux noms a chaque entree, une designation si.
 */
export type ArmeJouee = {
  /** Nom francais, ou anglais a defaut. */
  nom: string;
  /** Nom anglais, absent quand il est identique au francais. */
  anglais?: string;
  manches: number;
  /** Cle stat.ink (`nzap89`) : c'est elle qui designe le picto. */
  cle?: string;
  /** Cles stat.ink de la sous-arme et de la speciale, quand stat.ink les donne. */
  sous?: string;
  speciale?: string;
};

/** Totaux d'un joueur sur toute la session, quel que soit son camp. */
export type StatsJoueur = {
  nom: string;
  moi: boolean;
  manches: number;
  kill: number;
  assist: number;
  death: number;
  special: number;
  inked: number;
  /** De l'arme la plus jouee a la moins jouee. */
  armes: ArmeJouee[];
};

/** Score de fin de manche. L'unite depend du mode, pas du resultat. */
export type ScoreManche = {
  nous: number;
  eux: number;
  /** `%` en guerre de territoire, `pts` dans les modes objectif. */
  unite: "%" | "pts";
};

/** Une manche, dans l'ordre ou elle a ete jouee. */
export type Manche = {
  /** Rang dans la session, a partir de 1. */
  numero: number;
  debut: string;
  /** Heure locale, `HH:mm`, telle qu'elle sera affichee. */
  heure: string;
  dureeSecondes?: number;
  resultat: "win" | "lose" | "draw" | "inconnu";
  /** Vrai seulement pour une manche terminee par KO. Toujours faux en guerre de territoire. */
  ko: boolean;
  mode: string;
  /** Cle stat.ink de la regle (`area`), pour son picto et sa couleur. */
  regle?: string;
  stage: string;
  score?: ScoreManche;
  /** Mes chiffres sur cette manche, absents si je n'y figure pas. */
  moi?: { kill: number; assist: number; death: number; special: number; inked: number };
  medailles: string[];
};

/** Bilan d'un mode sur la session, tous stages confondus. */
export type AgregatMode = {
  libelle: string;
  manches: number;
  victoires: number;
  defaites: number;
  kill: number;
  assist: number;
  death: number;
  special: number;
  /** Stages distincts, dans l'ordre ou ils ont ete joues. */
  stages: string[];
  /** Cle stat.ink de la regle. */
  cle?: string;
};

/** Bilan d'un stage sur la session. */
export type AgregatStage = {
  libelle: string;
  /** Cle stat.ink du stage (`masaba`), pour sa vignette. */
  cle?: string;
  manches: number;
  victoires: number;
  defaites: number;
};

/** Tout ce qu'un compte rendu peut dire d'une session. */
export type AnalyseSession = {
  nom?: string;
  type?: string;
  /** Cle stat.ink du lobby de la premiere manche (`private`). */
  lobby?: string;
  objectif?: string;
  ressenti?: string;
  manches: Manche[];
  bilan: { victoires: number; defaites: number; nuls: number; total: number };
  /** Somme des durees de manche, arrondie a la minute. */
  tempsDeJeuMinutes: number;
  moi?: StatsJoueur;
  /** Mes coequipiers et moi, du plus de kills au moins. */
  equipe: StatsJoueur[];
  /** L'equipe d'en face, du plus de kills au moins. */
  adverse: StatsJoueur[];
  parMode: AgregatMode[];
  parStage: AgregatStage[];
  /**
   * Mes medailles, de la plus frequente a la moins. `or` : les medailles
   * « #1 ... » de stat.ink, dorees en jeu ; les autres sont argentees.
   */
  medailles: { libelle: string; nombre: number; or: boolean }[];
  koSubis: number;
  koInfliges: number;
  /** Defaites consecutives en fin de session. 0 si la derniere manche est gagnee. */
  serieFinaleDefaites: number;
  /** Victoires consecutives en ouverture. 0 si la premiere manche est perdue. */
  serieInitialeVictoires: number;
};

/**
 * Accumulateur interne : `armes` est une table avant d'etre un classement.
 * Elle est indexee par cle stat.ink, pas par libelle, pour qu'une arme reste
 * une arme quelle que soit la langue dans laquelle on la nommera.
 */
type CumulJoueur = Omit<StatsJoueur, "armes"> & {
  armes: Map<string, ArmeJouee>;
};

const zeroJoueur = (nom: string, moi: boolean): CumulJoueur => ({
  nom,
  moi,
  manches: 0,
  kill: 0,
  assist: 0,
  death: 0,
  special: 0,
  inked: 0,
  armes: new Map(),
});

/**
 * Convertit ce que stat.ink donne pour un compteur de joueur.
 *
 * Les champs valent `null` quand la donnee manque - un joueur deconnecte, par
 * exemple. On compte alors zero plutot que de propager `NaN` dans tous les
 * totaux de l'equipe.
 */
const nombre = (valeur: unknown): number =>
  typeof valeur === "number" && Number.isFinite(valeur) ? valeur : 0;

function cumuleLeJoueur(cumuls: Map<string, CumulJoueur>, membre: StatinkTeamMember): void {
  const nom = membre.name ?? "(sans nom)";
  const cumul = cumuls.get(nom) ?? zeroJoueur(nom, membre.me === true);
  cumul.manches += 1;
  cumul.kill += nombre(membre.kill);
  cumul.assist += nombre(membre.assist);
  cumul.death += nombre(membre.death);
  cumul.special += nombre(membre.special);
  cumul.inked += nombre(membre.inked);

  const weapon = membre.weapon;
  if (weapon != null) {
    const cle = weapon.key;
    const deja = cumul.armes.get(cle);
    if (deja !== undefined) {
      deja.manches += 1;
    } else {
      const nom = nomDeLArme(cle, weapon.name?.en_US);
      const anglais = weapon.name?.en_US;
      const sous = weapon.sub?.key;
      const speciale = weapon.special?.key;
      cumul.armes.set(cle, {
        nom,
        ...(anglais !== undefined && anglais !== nom ? { anglais } : {}),
        manches: 1,
        cle,
        ...(typeof sous === "string" ? { sous } : {}),
        ...(typeof speciale === "string" ? { speciale } : {}),
      });
    }
  }

  cumuls.set(nom, cumul);
}

/** Fige les accumulateurs en classement : joueurs par kills, armes par manches. */
function classe(cumuls: Map<string, CumulJoueur>): StatsJoueur[] {
  return [...cumuls.values()]
    .map((cumul) => ({
      ...cumul,
      armes: [...cumul.armes.values()].sort(
        (a, b) => b.manches - a.manches || a.nom.localeCompare(b.nom),
      ),
    }))
    .sort((a, b) => b.kill - a.kill || a.nom.localeCompare(b.nom));
}

/**
 * Lit le score de fin de manche.
 *
 * Les deux champs ne coexistent jamais : la guerre de territoire renseigne
 * `our_team_percent`, une *chaine* (« 47.3 »), et laisse `our_team_count` a
 * `null` ; les modes objectif font l'inverse avec un *nombre*. Un match dont
 * aucun des deux n'est renseigne n'a pas de score affichable - on n'en invente
 * pas.
 */
function lisLeScore(battle: StatinkBattle): ScoreManche | undefined {
  const pourcentNous = Number.parseFloat(String(battle["our_team_percent"] ?? ""));
  const pourcentEux = Number.parseFloat(String(battle["their_team_percent"] ?? ""));
  if (Number.isFinite(pourcentNous) && Number.isFinite(pourcentEux)) {
    return { nous: pourcentNous, eux: pourcentEux, unite: "%" };
  }

  const nous = battle["our_team_count"];
  const eux = battle["their_team_count"];
  if (typeof nous === "number" && typeof eux === "number") {
    return { nous, eux, unite: "pts" };
  }

  return undefined;
}

/** Longueur de la serie de tete d'une liste de resultats. */
function serieDeTete(resultats: string[], cherche: string): number {
  let longueur = 0;
  for (const resultat of resultats) {
    if (resultat !== cherche) break;
    longueur += 1;
  }
  return longueur;
}

/**
 * Ne retient que les joueurs presents sur une part suffisante de la session.
 *
 * Comparer les totaux d'un joueur qui a fait deux manches a ceux d'un joueur
 * qui en a fait quatorze produit des classements faux : le second est « devant »
 * pour la seule raison qu'il a joue. Exporte parce que deux sections en ont
 * besoin, avec la meme definition.
 */
export function reguliers(joueurs: StatsJoueur[], manchesDeLaSession: number): StatsJoueur[] {
  const minimum = manchesDeLaSession * PART_DE_SESSION_REGULIERE;
  return joueurs.filter((joueur) => joueur.manches >= minimum);
}

/** Reduit une session a son analyse. Ne redige rien, ne juge rien. */
export function analyseSession(file: SessionFile): AnalyseSession {
  const manches: Manche[] = [];
  const bilan = { victoires: 0, defaites: 0, nuls: 0, total: 0 };
  const equipe = new Map<string, CumulJoueur>();
  const adverse = new Map<string, CumulJoueur>();
  const modes = new Map<string, AgregatMode>();
  const stages = new Map<string, AgregatStage>();
  const medailles = new Map<string, { nombre: number; or: boolean }>();
  let koSubis = 0;
  let koInfliges = 0;
  let secondesDeJeu = 0;

  for (const battle of file.battles) {
    const resultat =
      battle.result === "win" || battle.result === "lose" || battle.result === "draw"
        ? battle.result
        : "inconnu";
    bilan.total += 1;
    if (resultat === "win") bilan.victoires += 1;
    if (resultat === "lose") bilan.defaites += 1;
    if (resultat === "draw") bilan.nuls += 1;

    const debutMs = Date.parse(battle.start_at?.iso8601 ?? "");
    const finMs = Date.parse(battle.end_at?.iso8601 ?? "");
    const dureeSecondes =
      Number.isFinite(debutMs) && Number.isFinite(finMs) && finMs > debutMs
        ? Math.round((finMs - debutMs) / 1000)
        : undefined;
    if (dureeSecondes !== undefined) secondesDeJeu += dureeSecondes;

    const ko = battle.knockout === true;
    if (ko && resultat === "lose") koSubis += 1;
    if (ko && resultat === "win") koInfliges += 1;

    const mode = libelleDuMode(battle.rule?.key, battle.rule?.name?.en_US);
    const stage = libelleDuStage(battle.stage?.key, battle.stage?.name?.en_US);

    const moiDansLaManche = (battle.our_team_members ?? []).find((membre) => membre.me === true);
    const mesMedailles = Array.isArray(battle["medals"])
      ? (battle["medals"] as unknown[]).filter((m): m is string => typeof m === "string")
      : [];

    manches.push({
      numero: manches.length + 1,
      debut: battle.start_at?.iso8601 ?? "",
      heure: Number.isFinite(debutMs)
        ? new Date(debutMs).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
        : "—",
      ...(dureeSecondes !== undefined ? { dureeSecondes } : {}),
      resultat,
      ko,
      mode,
      ...(battle.rule?.key !== undefined ? { regle: battle.rule.key } : {}),
      stage,
      ...(lisLeScore(battle) !== undefined ? { score: lisLeScore(battle) } : {}),
      ...(moiDansLaManche !== undefined
        ? {
            moi: {
              kill: nombre(moiDansLaManche.kill),
              assist: nombre(moiDansLaManche.assist),
              death: nombre(moiDansLaManche.death),
              special: nombre(moiDansLaManche.special),
              inked: nombre(moiDansLaManche.inked),
            },
          }
        : {}),
      medailles: mesMedailles.map(libelleDeLaMedaille),
    });

    for (const medaille of mesMedailles) {
      const libelle = libelleDeLaMedaille(medaille);
      const deja = medailles.get(libelle);
      medailles.set(libelle, {
        nombre: (deja?.nombre ?? 0) + 1,
        or: medaille.startsWith("#1"),
      });
    }

    for (const membre of battle.our_team_members ?? []) cumuleLeJoueur(equipe, membre);
    for (const membre of battle.their_team_members ?? []) cumuleLeJoueur(adverse, membre);

    const agregatMode = modes.get(mode) ?? {
      libelle: mode,
      manches: 0,
      victoires: 0,
      defaites: 0,
      kill: 0,
      assist: 0,
      death: 0,
      special: 0,
      stages: [],
      ...(battle.rule?.key !== undefined ? { cle: battle.rule.key } : {}),
    };
    agregatMode.manches += 1;
    if (resultat === "win") agregatMode.victoires += 1;
    if (resultat === "lose") agregatMode.defaites += 1;
    agregatMode.kill += nombre(moiDansLaManche?.kill);
    agregatMode.assist += nombre(moiDansLaManche?.assist);
    agregatMode.death += nombre(moiDansLaManche?.death);
    agregatMode.special += nombre(moiDansLaManche?.special);
    if (!agregatMode.stages.includes(stage)) agregatMode.stages.push(stage);
    modes.set(mode, agregatMode);

    const agregatStage = stages.get(stage) ?? {
      libelle: stage,
      ...(battle.stage?.key !== undefined ? { cle: battle.stage.key } : {}),
      manches: 0,
      victoires: 0,
      defaites: 0,
    };
    agregatStage.manches += 1;
    if (resultat === "win") agregatStage.victoires += 1;
    if (resultat === "lose") agregatStage.defaites += 1;
    stages.set(stage, agregatStage);
  }

  const resultats = manches.map((manche) => manche.resultat);
  const equipeClassee = classe(equipe);

  return {
    ...(file.name !== undefined ? { nom: file.name } : {}),
    ...(file.type !== undefined ? { type: file.type } : {}),
    ...(file.battles[0]?.lobby?.key !== undefined ? { lobby: file.battles[0].lobby.key } : {}),
    ...(file.objectif !== undefined ? { objectif: file.objectif } : {}),
    ...(file.ressenti !== undefined ? { ressenti: file.ressenti } : {}),
    manches,
    bilan,
    tempsDeJeuMinutes: Math.round(secondesDeJeu / 60),
    ...(equipeClassee.find((joueur) => joueur.moi) !== undefined
      ? { moi: equipeClassee.find((joueur) => joueur.moi) }
      : {}),
    equipe: equipeClassee,
    adverse: classe(adverse),
    parMode: [...modes.values()],
    parStage: [...stages.values()],
    medailles: [...medailles]
      .map(([libelle, { nombre: nombreDeFois, or }]) => ({ libelle, nombre: nombreDeFois, or }))
      .sort((a, b) => b.nombre - a.nombre || a.libelle.localeCompare(b.libelle)),
    koSubis,
    koInfliges,
    serieFinaleDefaites: serieDeTete([...resultats].reverse(), "lose"),
    serieInitialeVictoires: serieDeTete(resultats, "win"),
  };
}
