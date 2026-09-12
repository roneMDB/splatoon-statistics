/**
 * Medailles de fin de match en francais, par libelle anglais complet.
 *
 * stat.ink ne donne pas de cle aux medailles : seulement un libelle deja
 * formate, rang compris (« #1 Splat Assister »). La table porte donc le
 * libelle entier, et non le rang d'un cote et le corps de l'autre - le
 * francais ne place pas toujours le rang en tete : « № 1 du coup de main »,
 * mais « Cible privilegiee № 1 ».
 *
 * Source : fr.splatoonwiki.org, page « Medaille », section « Noms dans
 * d'autres langues », colonne Francais (France).
 */
const MEDAILLES: Record<string, string> = {
  "#1 Base Defender": "№ 1 en défense de la base",
  "#1 Big Bubbler User": "№ 1 du super bouclier",
  "#1 Booyah Bomb User": "№ 1 du jolizator",
  "#1 Checkpoint Breaker": "№ 1 du point de contrôle",
  "#1 Clam Carrier": "№ 1 en transport de palourdes",
  "#1 Clam Stopper": "№ 1 en arrêt de palourde",
  "#1 Crab Tank User": "№ 1 du crabe d'assaut",
  "#1 Damage Taker": "№ 1 des dégâts subis",
  "#1 Enemy Splatter": "№ 1 pour liquider",
  "#1 Enemy-Base Inker": "№ 1 en encrage chez l'adversaire",
  "#1 Ground Traveler": "№ 1 de la distance parcourue",
  "#1 Home-Base Inker": "№ 1 en encrage à domicile",
  "#1 Ink Consumer": "№ 1 en consommation d'encre",
  "#1 Ink Storm User": "№ 1 de la pluie d'encre",
  "#1 Ink Vac User": "№ 1 de l'aspirencre",
  "#1 Inkjet User": "№ 1 du chromo-jet",
  "#1 Killer Wail 5.1 User": "№ 1 du haut-perceur 5.1",
  "#1 Kraken Royale User": "№ 1 du kraken royal",
  "#1 Overall Splatter": "№ 1 au combat",
  "#1 Popular Target": "Cible privilégiée № 1",
  "#1 Rainmaker Carrier": "№ 1 en transport de Bazookarpe",
  "#1 Rainmaker Stopper": "№ 1 en arrêt de Bazookarpe",
  "#1 Reefslider User": "№ 1 du Cavalsquale",
  "#1 Score Booster": "№ 1 en progression",
  "#1 Splat Assister": "№ 1 du coup de main",
  "#1 Splat Zone Guard": "№ 1 en Défense de zone",
  "#1 Splat Zone Hero": "№ 1 en héroïsme de zone",
  "#1 Splat Zone Inker": "№ 1 en encrage de zone",
  "#1 Splattercolor Screen User": "№ 1 du barrière barbouillée",
  "#1 Super Chump User": "№ 1 du multi-leurres",
  "#1 Super Jump Spot": "№ 1 du super saut",
  "#1 Tacticooler User": "№ 1 du districool",
  "#1 Tenta Missiles User": "№ 1 du multi-missile",
  "#1 Tower Stopper": "№ 1 en arrêt du stand",
  "#1 Triple Inkstrike User": "№ 1 du trimissile tornade",
  "#1 Triple Splashdown User": "№ 1 du triple choc chromatique",
  "#1 Trizooka User": "№ 1 du lance-rafales",
  "#1 Turf Inker": "№ 1 en encrage de territoire",
  "#1 Ultra Stamp User": "№ 1 de l'ultra-tamponneur",
  "#1 Wave Breaker User": "№ 1 du sonar paf",
  "#1 Zipcaster User": "№ 1 du Super Mollusque",
  "#2 Clam Carrier": "№ 2 en transport de palourdes",
  "#2 Enemy Splatter": "№ 2 pour liquider",
  "#2 Enemy-Base Inker": "№ 2 en encrage chez l'adversaire",
  "#2 Home-Base Inker": "№ 2 en encrage à domicile",
  "#2 Overall Splatter": "№ 2 au combat",
  "#2 Popular Target": "Cible privilégiée № 2",
  "#2 Score Booster": "№ 2 en progression",
  "#2 Splat Assister": "№ 2 du coup de main",
  "#2 Splat Zone Guard": "№ 2 en Défense de zone",
  "#2 Splat Zone Inker": "№ 2 en encrage de zone",
  "#2 Super Jump Spot": "№ 2 du super saut",
  "#2 Turf Inker": "№ 2 en encrage de territoire",
  "First Splat!": "Prix de la 1re victime",
  "Record-Score Setter": "Pro du record de progression",
};

/**
 * Libelle francais d'une medaille, ou `undefined` si elle est inconnue.
 *
 * L'appelant retombe alors sur le libelle anglais : une medaille ajoutee par
 * une mise a jour s'affiche en anglais plutot que de disparaitre.
 */
export function nomFrancaisDeLaMedaille(medaille: string): string | undefined {
  return MEDAILLES[medaille.trim()];
}
