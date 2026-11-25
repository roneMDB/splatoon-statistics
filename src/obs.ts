/**
 * OBS Studio, lance a l'ouverture de l'application s'il ne tourne pas deja.
 *
 * Module pur : les commandes a lancer et la lecture de leur sortie, sans rien
 * lancer. Le gestionnaire qui les lance est `src/electron/obsHandler.ts`.
 *
 * OBS est un programme Windows. Depuis l'application Windows, on appelle
 * `tasklist.exe` et `obs64.exe` directement ; depuis WSL, les memes, par
 * `/mnt/c` (l'interoperabilite de WSL lance les `.exe`). Ailleurs (Linux hors
 * WSL, macOS), rien n'est propose : rien n'y a ete essaye.
 */

import type { CommandeSysteme } from "./veille.ts";

export const PROCESSUS_OBS = "obs64.exe";

/**
 * - `--disable-shutdown-check` : apres une fermeture brutale, OBS demande
 *   sinon s'il doit demarrer en mode sans echec, et attend une reponse.
 * - `--minimize-to-tray` : OBS demarre reduit dans la zone de notification.
 */
export const OPTIONS_OBS = ["--disable-shutdown-check", "--minimize-to-tray"] as const;

/**
 * `dossier` : OBS doit etre lance depuis son propre dossier, sinon il
 * s'arrete au demarrage sur « Failed to find locale/en-US.ini ».
 */
export type CommandesObs = {
  /** Liste les processus `obs64.exe`, en CSV sans en-tete. */
  lecture: CommandeSysteme;
  lancement: CommandeSysteme & { dossier: string };
};

/** Installation par defaut d'OBS Studio sous Windows, relative a « Program Files ». */
const DOSSIER_RELATIF = ["obs-studio", "bin", "64bit"] as const;

/**
 * Les commandes pour la plateforme, ou `undefined` si OBS n'y est pas gere.
 * `programFiles` : `%ProgramFiles%` sous Windows (`C:\Program Files` par defaut).
 */
export function commandesObs(
  plateforme: NodeJS.Platform,
  sousWsl: boolean,
  programFiles: string = "C:\\Program Files",
): CommandesObs | undefined {
  const argsDeLecture = ["/FI", `IMAGENAME eq ${PROCESSUS_OBS}`, "/FO", "CSV", "/NH"];
  if (plateforme === "win32") {
    const dossier = [programFiles.replace(/\\+$/, ""), ...DOSSIER_RELATIF].join("\\");
    return {
      lecture: { fichier: "tasklist.exe", args: argsDeLecture },
      lancement: { fichier: `${dossier}\\${PROCESSUS_OBS}`, args: [...OPTIONS_OBS], dossier },
    };
  }
  if (plateforme === "linux" && sousWsl) {
    const dossier = ["/mnt/c/Program Files", ...DOSSIER_RELATIF].join("/");
    return {
      lecture: { fichier: "/mnt/c/Windows/System32/tasklist.exe", args: argsDeLecture },
      lancement: { fichier: `${dossier}/${PROCESSUS_OBS}`, args: [...OPTIONS_OBS], dossier },
    };
  }
  return undefined;
}

/**
 * Vrai si la sortie de `tasklist` liste OBS. En CSV, chaque processus tient
 * une ligne qui commence par son nom entre guillemets ; sans processus,
 * `tasklist` ecrit un message dans la langue du systeme, qu'on ne lit pas.
 */
export function obsTourne(sortie: string): boolean {
  return sortie.split(/\r?\n/).some((ligne) => ligne.trim().toLowerCase().startsWith(`"${PROCESSUS_OBS}"`));
}
