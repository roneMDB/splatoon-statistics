/**
 * Mise en forme partagee par les sections : nombres, tableaux, designations.
 */

import type { AnalyseSession, StatsJoueur } from "./analyse.ts";
import type { SessionFile } from "../store.ts";
import { libelleDeLArme } from "../libelles.fr.ts";

/** Un ratio a deux decimales, virgule francaise. Rend « — » si le diviseur est nul. */
export function ratio(numerateur: number, denominateur: number): string {
  if (denominateur === 0) return "—";
  return (numerateur / denominateur).toFixed(2).replace(".", ",");
}

/** Une moyenne a une decimale, virgule francaise. */
export function moyenne(total: number, nombre: number): string {
  if (nombre === 0) return "—";
  return (total / nombre).toFixed(1).replace(".", ",");
}

/** Un pourcentage entier, sans decimale : la precision suggererait une exactitude fausse. */
export function pourcent(partie: number, total: number): string {
  if (total === 0) return "—";
  return `${Math.round((partie / total) * 100)} %`;
}

/** Accorde un mot au pluriel selon le compte. */
export function pluriel(nombre: number, singulier: string, plurielMot = `${singulier}s`): string {
  return nombre > 1 ? plurielMot : singulier;
}

/**
 * Une colonne dont chaque cellule est un nombre s'aligne a droite ; les
 * libelles restent a gauche. Les valeurs comme « 41 % », « 2,8 » ou « 9/20/25 »
 * comptent comme numeriques.
 */
const estNumerique = (cellule: string): boolean => /^[\d.,%/\s+-]+$/.test(cellule);

/**
 * Assemble un tableau en bloc de code, colonnes alignees.
 *
 * Pas de tableau Markdown : **Discord ne les rend pas**. Il affiche les barres
 * verticales telles quelles, ce qui donne une bouillie illisible - or ce
 * document n'existe que pour etre colle dans Discord. Un bloc de code, lui, y
 * est rendu a chasse fixe, donc reellement aligne.
 *
 * En contrepartie, rien de ce qui est place ici n'est mis en forme : ni gras,
 * ni emoji. Les cellules doivent rester du texte simple, et les colonnes assez
 * courtes pour tenir sans defilement horizontal sur telephone.
 */
export function tableau(entetes: string[], lignes: string[][]): string[] {
  if (lignes.length === 0) return [];

  const colonnes = entetes.length;
  const largeurs = entetes.map((entete, index) =>
    Math.max(entete.length, ...lignes.map((ligne) => (ligne[index] ?? "").length)),
  );

  // Une colonne n'est numerique que si TOUTES ses cellules le sont : une seule
  // valeur textuelle suffit a la faire basculer a gauche.
  const aDroite = Array.from({ length: colonnes }, (_, index) =>
    lignes.every((ligne) => estNumerique(ligne[index] ?? "")),
  );

  const compose = (cellules: string[]) =>
    cellules
      .map((cellule, index) => {
        const largeur = largeurs[index] ?? 0;
        return aDroite[index] === true
          ? cellule.padStart(largeur)
          : cellule.padEnd(largeur);
      })
      .join("  ")
      // La derniere colonne alignee a gauche laisserait une trainee d'espaces.
      .trimEnd();

  return ["```", compose(entetes), ...lignes.map(compose), "```"];
}

/**
 * Nomme un joueur dans le compte rendu.
 *
 * Seul point du code qui decide comment quelqu'un apparait, pour que la regle
 * change en un endroit :
 *
 * - soi-meme : « moi » ;
 * - un coequipier : son pseudo en jeu ;
 * - un adversaire : son arme dominante dans les deux langues, **jamais son
 *   pseudo**. Les adversaires
 *   d'une intra sont des camarades de club, et le compte rendu finit sur un
 *   Discord ou ils se lisent : leur pseudo n'a pas a se retrouver accole a un
 *   chiffre de morts.
 *
 * Designer un adversaire par son arme ne l'anonymise pas - dans une partie a
 * huit, « Octobrush » designe une personne pour qui etait la. Cela evite le
 * pseudo a cote du jugement, rien de plus.
 */
export function designe(joueur: StatsJoueur, camp: "nous" | "eux"): string {
  if (joueur.moi) return "moi";
  if (camp === "nous") return joueur.nom;

  const arme = joueur.armes[0];
  return arme === undefined ? "arme inconnue" : libelleDeLArme(arme.nom, arme.anglais);
}

/**
 * Designe toute une equipe adverse en levant les homonymies d'arme.
 *
 * Deux joueurs sur la meme arme dominante porteraient la meme designation :
 * on numerote alors, faute de quoi le tableau presenterait deux lignes
 * indistinguables.
 */
export function designeLesAdversaires(adversaires: StatsJoueur[]): string[] {
  const vus = new Map<string, number>();
  const total = new Map<string, number>();
  for (const joueur of adversaires) {
    const nom = designe(joueur, "eux");
    total.set(nom, (total.get(nom) ?? 0) + 1);
  }

  return adversaires.map((joueur) => {
    const nom = designe(joueur, "eux");
    if ((total.get(nom) ?? 0) < 2) return nom;
    const rang = (vus.get(nom) ?? 0) + 1;
    vus.set(nom, rang);
    return `${nom} (${rang})`;
  });
}

/** `2026-09-11T18:00:00Z` -> `11/09`. */
export function jourEtMois(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "date inconnue";
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

/**
 * Titre d'une session : « Intra du 04/08 — Équipe O ».
 *
 * Partage par le compte rendu et la planche. Les deux documents sont postes
 * l'un sous l'autre sur Discord : ils doivent porter le meme nom, et ce nom ne
 * doit se decider qu'a un seul endroit.
 */
export function titreDeSession(file: SessionFile, analyse: AnalyseSession): string {
  const quoi =
    analyse.type !== undefined
      ? analyse.type[0]?.toUpperCase() + analyse.type.slice(1)
      : "Session";
  return analyse.nom !== undefined
    ? `${quoi} du ${jourEtMois(file.window.from)} — ${analyse.nom}`
    : `${quoi} du ${jourEtMois(file.window.from)}`;
}

/**
 * Bilan d'une session, en morceaux : « 7V - 6D », « 13 manches », « 95 min de jeu ».
 *
 * Rendu sans aucune mise en forme, parce que ses deux consommateurs n'en
 * veulent pas la meme : le compte rendu met le premier morceau en gras
 * Markdown, la planche les prend tels quels.
 */
export function bilanDeSession(analyse: AnalyseSession): string[] {
  const { victoires, defaites, nuls, total } = analyse.bilan;
  const parts = [`${victoires}V - ${defaites}D`];
  if (nuls > 0) parts.push(`${nuls} ${pluriel(nuls, "nul")}`);
  parts.push(`${total} ${pluriel(total, "manche")}`);
  if (analyse.tempsDeJeuMinutes > 0) parts.push(`${analyse.tempsDeJeuMinutes} min de jeu`);
  return parts;
}
