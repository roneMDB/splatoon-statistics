/**
 * Detail d'une manche : tout ce que la vue « manche » affiche, et rien de plus.
 *
 * Complement de `battleRows.ts`, qui reduit chaque manche a quatre colonnes pour
 * le tableau. Ici on aplatit **une seule** manche, a la demande : le detail
 * complet des huit joueurs ne traverse le pont IPC que pour celle qu'on regarde,
 * jamais pour les treize d'une session.
 *
 * Comme `battleRows.ts`, c'est ici que le vocabulaire est traduit, avant
 * d'atteindre la fenetre - celle-ci n'importe rien du noyau.
 */

import { libelleDeLaCapacite } from "./abilites.fr.ts";
import {
  libelleDeLArme,
  libelleDeLaMedaille,
  libelleDuMode,
  libelleDuResultat,
  libelleDuStage,
  nomDeLArme,
} from "./libelles.fr.ts";
import type { StatinkBattle, StatinkTeamMember } from "./statink/types.ts";

/** Une piece d'equipement et ses capacites, la principale en tete. */
export type PieceEquipee = {
  /** « Tête », « Haut » ou « Pieds ». */
  piece: string;
  capacites: string[];
};

/** Un joueur tel que la vue « manche » le montre. */
export type JoueurDeManche = {
  nom: string;
  moi: boolean;
  /** Arme en francais, l'anglais entre parentheses. */
  arme: string;
  kill: number;
  assist: number;
  death: number;
  special: number;
  /**
   * Cle stat.ink de la speciale du joueur (`ultrashot`...), telle quelle : la
   * planche en tire le picto qui accompagne son nombre de speciaux, comme en
   * jeu. Absente quand stat.ink ne la donne pas.
   */
  speciale?: string;
  inked: number;
  deconnecte: boolean;
  /** Vide quand stat.ink ne donne pas l'equipement. */
  equipement: PieceEquipee[];
};

/** Score de fin de manche, meme forme que dans l'analyse de compte rendu. */
export type ScoreDeManche = { nous: number; eux: number; unite: "%" | "pts" };

/** Une manche, vue en detail. */
export type BattleDetail = {
  uuid: string;
  /** Lien vers la page stat.ink du match. Chaine vide s'il manque. */
  url: string;
  startedAt: string;
  dureeSecondes?: number;
  rule: string;
  /**
   * Cle brute de la regle (`yagura`, `asari`...), a cote de son libelle
   * traduit. La planche colore ses cartes par regle : un nom de classe CSS ne
   * peut pas se fonder sur un libelle francais accentue.
   */
  ruleKey?: string;
  stage: string;
  /** Resultat brut, cle de mise en forme. */
  result?: string;
  /** Resultat en francais, celui qui s'affiche. */
  resultLabel?: string;
  ko: boolean;
  score?: ScoreDeManche;
  medailles: string[];
  /**
   * Couleurs d'encre reelles des deux equipes, en RGBA hexadecimal tel que
   * stat.ink les donne (`a0c937ff`). Non validees ici, comme les pseudos :
   * c'est au rendu de s'en mefier. Voir `couleurSure` dans `report/planche.ts`.
   */
  couleurNous?: string;
  couleurEux?: string;
  nous: JoueurDeManche[];
  eux: JoueurDeManche[];
};

/** Noms francais des trois emplacements d'equipement, dans l'ordre du jeu. */
const PIECES: ReadonlyArray<readonly [string, string]> = [
  ["headgear", "Tête"],
  ["clothing", "Haut"],
  ["shoes", "Pieds"],
];

const nombre = (valeur: unknown): number =>
  typeof valeur === "number" && Number.isFinite(valeur) ? valeur : 0;

/** Forme d'une capacite dans le payload : seule `key` nous interesse. */
type CapaciteBrute = { key?: string; name?: { en_US?: string } } | null | undefined;

const traduisLaCapacite = (capacite: CapaciteBrute): string | undefined =>
  capacite?.key === undefined
    ? undefined
    : libelleDeLaCapacite(capacite.key, capacite.name?.en_US);

/**
 * Aplatit l'equipement d'un joueur.
 *
 * Une piece absente est omise plutot que rendue vide : stat.ink ne renseigne pas
 * toujours l'equipement, et une ligne « Tête — » n'apprend rien.
 */
function equipementDe(membre: StatinkTeamMember): PieceEquipee[] {
  const gears = membre["gears"] as Record<string, unknown> | undefined;
  if (gears == null || typeof gears !== "object") return [];

  const pieces: PieceEquipee[] = [];
  for (const [cle, nom] of PIECES) {
    const piece = gears[cle] as
      | { primary_ability?: CapaciteBrute; secondary_abilities?: CapaciteBrute[] }
      | undefined;
    if (piece == null) continue;

    const capacites = [
      traduisLaCapacite(piece.primary_ability),
      ...(piece.secondary_abilities ?? []).map(traduisLaCapacite),
    ].filter((capacite): capacite is string => capacite !== undefined);

    if (capacites.length > 0) pieces.push({ piece: nom, capacites });
  }
  return pieces;
}

function joueurDe(membre: StatinkTeamMember): JoueurDeManche {
  const weapon = membre.weapon;
  const nom = nomDeLArme(weapon?.key, weapon?.name?.en_US);

  return {
    nom: membre.name ?? "(sans nom)",
    moi: membre.me === true,
    arme: libelleDeLArme(nom, weapon?.name?.en_US),
    kill: nombre(membre.kill),
    assist: nombre(membre.assist),
    death: nombre(membre.death),
    special: nombre(membre.special),
    ...(weapon?.special?.key == null ? {} : { speciale: weapon.special.key }),
    inked: nombre(membre.inked),
    deconnecte: membre.disconnected === true,
    equipement: equipementDe(membre),
  };
}

/** Meme lecture que dans l'analyse : voir `src/report/analyse.ts`. */
function lisLeScore(battle: StatinkBattle): ScoreDeManche | undefined {
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

/** Aplatit une manche en vue detaillee, deja traduite. */
export function toBattleDetail(battle: StatinkBattle): BattleDetail {
  const debutMs = Date.parse(battle.start_at?.iso8601 ?? "");
  const finMs = Date.parse(battle.end_at?.iso8601 ?? "");
  const dureeSecondes =
    Number.isFinite(debutMs) && Number.isFinite(finMs) && finMs > debutMs
      ? Math.round((finMs - debutMs) / 1000)
      : undefined;

  const medailles = Array.isArray(battle["medals"])
    ? (battle["medals"] as unknown[])
        .filter((medaille): medaille is string => typeof medaille === "string")
        .map(libelleDeLaMedaille)
    : [];

  return {
    uuid: battle.uuid,
    url: typeof battle.url === "string" ? battle.url : "",
    startedAt: battle.start_at?.iso8601 ?? "",
    ...(dureeSecondes !== undefined ? { dureeSecondes } : {}),
    rule: libelleDuMode(battle.rule?.key, battle.rule?.name?.en_US),
    ...(battle.rule?.key !== undefined ? { ruleKey: battle.rule.key } : {}),
    stage: libelleDuStage(battle.stage?.key, battle.stage?.name?.en_US),
    ...(battle.result != null
      ? { result: battle.result, resultLabel: libelleDuResultat(battle.result) }
      : {}),
    ko: battle.knockout === true,
    ...(lisLeScore(battle) !== undefined ? { score: lisLeScore(battle) } : {}),
    medailles,
    ...(typeof battle["our_team_color"] === "string"
      ? { couleurNous: battle["our_team_color"] }
      : {}),
    ...(typeof battle["their_team_color"] === "string"
      ? { couleurEux: battle["their_team_color"] }
      : {}),
    nous: (battle.our_team_members ?? []).map(joueurDe),
    eux: (battle.their_team_members ?? []).map(joueurDe),
  };
}
