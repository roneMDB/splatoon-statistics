/**
 * Capacites d'equipement en francais, par cle stat.ink.
 *
 * Ecrite a la main plutot que jointe automatiquement : sendou.ink indexe ces
 * libelles par acronyme (`ABILITY_SPU`), et deriver l'acronyme du nom anglais
 * produit des collisions silencieuses - « Special Power Up » et « Sub Power Up »
 * donnent tous deux SPU, « Ink Recovery Up » et « Ink Resistance Up » tous deux
 * IRU. Une jointure automatique traduisait donc deux capacites par leur
 * homonyme sans que rien ne le signale.
 *
 * Le nom anglais est rappele en commentaire, et l'acronyme sendou qui a servi a
 * verifier chaque ligne.
 *
 * Source : sendou.ink, `locales/fr-EU/game-misc.json`.
 */
const CAPACITES: Record<string, string> = {
  ink_saver_main: "Encrémenteur (pr.)", // Ink Saver (Main) — ISM
  ink_saver_sub: "Encrémenteur (sec.)", // Ink Saver (Sub) — ISS
  ink_recovery_up: "Levée d'encre", // Ink Recovery Up — IRU
  run_speed_up: "Course à pied", // Run Speed Up — RSU
  swim_speed_up: "Turbo-calamar", // Swim Speed Up — SSU
  special_charge_up: "Jauge spéciale +", // Special Charge Up — SCU
  special_saver: "Baisse spéciale -", // Special Saver — SS
  special_power_up: "Arme spéciale +", // Special Power Up — SPU
  quick_respawn: "Sans temps morts", // Quick Respawn — QR
  quick_super_jump: "Aérodynamisme", // Quick Super Jump — QSJ
  sub_power_up: "Arme secondaire +", // Sub Power Up — BRU
  ink_resistance_up: "Pieds au sec", // Ink Resistance Up — RES
  sub_resistance_up: "Filtre à secondaires", // Sub Resistance Up — SRU
  intensify_action: "Feu de l'action", // Intensify Action — IA
  opening_gambit: "Chapeaux de roue", // Opening Gambit — OG
  last_ditch_effort: "Ultime sursaut", // Last-Ditch Effort — LDE
  tenacity: "Justice", // Tenacity — T
  comeback: "Come-back", // Comeback — CB
  ninja_squid: "Ninjalamar", // Ninja Squid — NS
  haunt: "Revanche", // Haunt — H
  thermal_ink: "Encre thermique", // Thermal Ink — TI
  respawn_punisher: "Retour perdant", // Respawn Punisher — RP
  ability_doubler: "Bonus ×2", // Ability Doubler — AD
  stealth_jump: "Réception réussie", // Stealth Jump — SJ
  object_shredder: "Démolition", // Object Shredder — OS
  drop_roller: "Super roulade", // Drop Roller — DR
};

/** Libelle francais d'une capacite, ou son nom anglais si la cle est inconnue. */
export function libelleDeLaCapacite(
  cle: string | undefined,
  anglais?: string,
): string {
  return (cle !== undefined ? CAPACITES[cle] : undefined) ?? anglais ?? cle ?? "—";
}
