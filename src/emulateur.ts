// src/emulateur.ts
/**
 * L'emulateur Android de STU, ouvert avec sa fenetre et eteint depuis
 * l'application quand la session Nintendo est perdue (Nintendo Switch App sur
 * « Sign In »).
 *
 * Module pur : les scripts bash et les decisions, sans rien lancer. Le
 * gestionnaire qui les lance est `src/electron/emulateurHandler.ts`.
 */

import { VERROU_S3S, type StatutDeVeille } from "./veille.ts";

/** Sortie de l'emulateur ouvert par l'application. */
export const FICHIER_JOURNAL_EMULATEUR = "/tmp/splatoon-statistics-emulateur.log";


/** Ce que rend `SCRIPT_D_ETAT`. */
export type LectureDEmulateur = "absent" | "verrou" | "allume" | "eteint";
const LECTURES: ReadonlySet<string> = new Set<LectureDEmulateur>(["absent", "verrou", "allume", "eteint"]);

export type OperationDEmulateur = "ouverture" | "extinction";

export type EtatDEmulateur = {
  /** Derniere lecture ; absente tant que rien n'a ete lu. */
  lecture?: LectureDEmulateur;
  /** Ouverture ou extinction suivie jusqu'a son terme. */
  operation?: OperationDEmulateur;
  /** L'application a lance l'emulateur, et ce processus tourne encore. */
  ouvertParNous: boolean;
  /** Echec de la derniere operation, jusqu'a la suivante. */
  erreur?: string;
};

export type BoutonDEmulateur =
  | { visible: false }
  | { visible: true; libelle: string; actif: boolean; action?: "ouvre" | "eteint"; note?: string };

/**
 * Une ligne : `absent` sans SDK Android, `verrou` si une synchro du cron
 * tourne (son emulateur est alors celui de STU), sinon `allume` ou `eteint`.
 * `adb devices` liste l'emulateur des son lancement (`offline`), avant la fin
 * du demarrage d'Android.
 */
export const SCRIPT_D_ETAT = [
  `[ -r "$HOME/Android/env.sh" ] || { echo absent; exit 0; }`,
  `source "$HOME/Android/env.sh"`,
  `flock -n ${VERROU_S3S} true 2>/dev/null || { echo verrou; exit 0; }`,
  `if adb devices 2>/dev/null | grep -q '^emulator-'; then echo allume; else echo eteint; fi`,
].join("\n");

/**
 * `exec` : le processus lance par l'application devient `setsid -w`, qui
 * attend l'emulateur. Il garde la distribution WSL en vie, et sa fin dit que
 * l'emulateur s'est arrete. `setsid` sort l'emulateur du groupe de
 * l'application : une fermeture brutale ne lui envoie aucun signal.
 */
export const SCRIPT_D_OUVERTURE = `exec setsid -w "$HOME/Android/boot-window.sh" > ${FICHIER_JOURNAL_EMULATEUR} 2>&1 < /dev/null`;

/**
 * Eteint Android, et non la fenetre : fermer la fenetre enregistre un
 * instantane rapide, et STU, qui demarre a froid, retrouverait la Switch App
 * deconnectee. Le code de `reboot -p` est ignore : la connexion adb tombe
 * avec Android.
 */
export const SCRIPT_D_EXTINCTION = [
  `source "$HOME/Android/env.sh"`,
  "adb shell sync || exit 1",
  "adb shell reboot -p",
  "exit 0",
].join("\n");

/** La derniere ligne non vide, si c'est une lecture connue. */
export function lisLaLecture(sortie: string): LectureDEmulateur | undefined {
  const lignes = sortie.split("\n").map((ligne) => ligne.trim()).filter((ligne) => ligne !== "");
  const derniere = lignes.at(-1);
  return derniere !== undefined && LECTURES.has(derniere) ? (derniere as LectureDEmulateur) : undefined;
}

/** Le bouton de l'encart, tel que la fenetre l'affiche. */
export function boutonDEmulateur(etat: EtatDEmulateur, statutDeVeille: StatutDeVeille): BoutonDEmulateur {
  const { lecture, operation, erreur } = etat;
  if (lecture === undefined || lecture === "absent") return { visible: false };
  if (operation === "ouverture") return { visible: true, libelle: "Démarrage…", actif: false };
  if (operation === "extinction") return { visible: true, libelle: "Extinction…", actif: false };

  const action = lecture === "allume" ? "eteint" : "ouvre";
  const libelle = action === "eteint" ? "Éteindre l'émulateur" : "Ouvrir l'émulateur";
  if (statutDeVeille !== "arretee") {
    return { visible: true, libelle, actif: false, note: "Arrêter la veille d'abord." };
  }
  if (lecture === "verrou") {
    return { visible: true, libelle, actif: false, note: "Une synchro du cron est en cours." };
  }
  return { visible: true, libelle, actif: true, action, ...(erreur === undefined ? {} : { note: erreur }) };
}
