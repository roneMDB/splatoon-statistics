/**
 * Vocabulaire francais du jeu : modes, stages, resultats, medailles.
 *
 * Sert les trois surfaces qui affichent du texte - le compte rendu, la fenetre
 * et la ligne de commande - et vit donc a la racine du noyau plutot que dans
 * `report/`.
 *
 * stat.ink ne publie que l'anglais et le japonais, y compris sur ses
 * referentiels (`/api/v3/rule`, `/api/v3/stage`) : le francais n'existe donc
 * nulle part dans les donnees, et doit vivre ici.
 *
 * Les stages viennent des fichiers de localisation officiels du jeu
 * (splatoon3.ink), joints aux cles stat.ink par leur nom anglais, et sont
 * confirmes mot pour mot par sendou.ink. Les modes en reprennent la casse
 * competitive (sendou.ink), qui met une majuscule aux mots pleins. Les armes
 * vivent dans `armes.fr.ts`, assez nombreuses pour meriter leur fichier.
 *
 * Les medailles vivent dans `medailles.fr.ts`, d'apres le wiki francais du
 * jeu : stat.ink ne leur donne pas de cle, seulement un libelle deja formate.
 *
 * Toute table est faillible : une cle inconnue retombe sur le libelle anglais
 * du payload plutot que de faire echouer le compte rendu. Une nouvelle carte
 * s'affichera donc en anglais en attendant d'etre ajoutee ici, ce qui est
 * exactement le comportement voulu.
 */

import { nomFrancaisDeLArme } from "./armes.fr.ts";
import { nomFrancaisDeLaMedaille } from "./medailles.fr.ts";

/**
 * Modes de jeu, par cle stat.ink.
 *
 * Le nom anglais est rappele en commentaire : les deux modes a objectif mobile
 * s'echangent facilement de traduction. C'est la tour (« Tower Control ») qui
 * est une expedition, et le porteur de bazooka (« Rainmaker ») qui est une
 * mission. Verifie contre les fichiers de localisation du jeu.
 */
const MODES: Record<string, string> = {
  nawabari: "Guerre de Territoire", // Turf War
  area: "Défense de Zone", // Splat Zones
  yagura: "Expédition Risquée", // Tower Control
  hoko: "Mission Bazookarpe", // Rainmaker
  asari: "Pluie de Palourdes", // Clam Blitz
  tricolor: "Guerre de Territoire tricolore", // Tricolor Turf War
};

/** Stages, par cle stat.ink. */
const STAGES: Record<string, string> = {
  yunohana: "Canyon aux colonnes",
  gonzui: "Banlieue Balibot",
  kinmedai: "Galeries Guppy",
  mategai: "Réservoir Rigadelle",
  namero: "Casse Rascasse",
  yagara: "Marché Grefin",
  masaba: "Pont Esturgeon",
  mahimahi: "Club Ca$halot",
  zatou: "Supermarché Cétacé",
  chozame: "Chantier Narval",
  amabi: "Institut Calam'arts",
  sumeshi: "Parc Carapince",
  hirame: "Lotissement Filament",
  kusaya: "Sources Sauret",
  manta: "Manta Maria",
  nampla: "Ruines Uma'mi",
  taraport: "Halles de Port-merlu",
  kombu: "Piste Méroule",
  takaashi: "Quartier Crabe-ciels",
  ohyo: "Chaland Flétan",
  negitoro: "Mine marine",
  baigai: "Arène Méca-ramen",
  kajiki: "Terminal Rorqual",
  ryugu: "Gare Aiguillat",
  decaline: "Passage Turbot",
};

/** Libelle francais d'un mode, ou son nom anglais si la cle est inconnue. */
export function libelleDuMode(cle: string | undefined, anglais?: string): string {
  return (cle !== undefined ? MODES[cle] : undefined) ?? anglais ?? cle ?? "mode inconnu";
}

/**
 * Nomme une arme dans les deux langues.
 *
 * Elles cohabitent parce que les deux circulent : le francais est ce
 * qu'affiche le jeu, l'anglais ce qu'emploient la communaute competitive et
 * tous les outils d'analyse. Quand les deux coincident, ou que le francais
 * manque, un seul suffit.
 *
 * Quatorze armes portent deja une parenthese en francais (« Fusil d'Ordre
 * (réplique) ») : pour celles-la, l'anglais est introduit par un tiret, faute
 * de quoi le libelle finirait sur deux parentheses accolees.
 */
export function libelleDeLArme(francais: string, anglais?: string): string {
  if (anglais === undefined || anglais === francais) return francais;
  return francais.includes("(")
    ? `${francais} — ${anglais}`
    : `${francais} (${anglais})`;
}

/** Nom francais d'une arme, ou son nom anglais a defaut. */
export function nomDeLArme(cle: string | undefined, anglais?: string): string {
  return nomFrancaisDeLArme(cle) ?? anglais ?? cle ?? "arme inconnue";
}

/** Libelle francais d'un stage, ou son nom anglais si la cle est inconnue. */
export function libelleDuStage(cle: string | undefined, anglais?: string): string {
  return (cle !== undefined ? STAGES[cle] : undefined) ?? anglais ?? cle ?? "stage inconnu";
}

/** Lobbies, tels que stat.ink les nomme, sous leur nom francais en jeu. */
const LOBBIES: Record<string, string> = {
  regular: "Match classique",
  bankara_challenge: "Match anarchie (série)",
  bankara_open: "Match anarchie (ouvert)",
  xmatch: "Match X",
  event: "Match challenge",
  splatfest_challenge: "Festival (défi)",
  splatfest_open: "Festival (ouvert)",
  private: "Match privé",
};

/** Libelle francais d'un lobby, ou son nom anglais si la cle est inconnue. */
export function libelleDuLobby(cle: string | undefined, anglais?: string): string {
  return (cle !== undefined ? LOBBIES[cle] : undefined) ?? anglais ?? cle ?? "lobby inconnu";
}

/** Resultats d'une manche, tels que stat.ink les nomme. */
const RESULTATS: Record<string, string> = {
  win: "Victoire",
  lose: "Défaite",
  draw: "Match nul",
};

/**
 * Libelle francais d'un resultat de manche.
 *
 * La valeur brute (`win`, `lose`) reste utilisee ailleurs comme cle technique,
 * pour la mise en forme : c'est le libelle seul qui est traduit.
 */
export function libelleDuResultat(resultat: string | undefined): string {
  return (resultat !== undefined ? RESULTATS[resultat] : undefined) ?? resultat ?? "—";
}

/**
 * Traduit une medaille telle que stat.ink la donne, rang compris.
 *
 * « #1 Splat Assister » devient « № 1 du coup de main ». La traduction porte
 * sur le libelle entier : en francais le rang n'est pas toujours en tete
 * (« Cible privilegiee № 1 »), le separer du corps donnerait des libelles
 * faux. Une medaille inconnue garde son libelle anglais plutot que de
 * disparaitre.
 */
export function libelleDeLaMedaille(medaille: string): string {
  const brut = medaille.trim();
  return nomFrancaisDeLaMedaille(brut) ?? brut;
}
