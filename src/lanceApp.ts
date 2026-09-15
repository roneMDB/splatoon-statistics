/**
 * Lanceur de l'application : demarre Electron en processus fils, avec le
 * drapeau logiciel qu'exige WSLg sur la vraie ligne de commande.
 *
 * Pourquoi ce fichier existe. `src/electron/main.ts` pose deja
 * `app.commandLine.appendSwitch("use-angle", "swiftshader")` sous WSL, mais
 * cela ne suffit pas : Chromium lit `--use-angle` avant que le code
 * applicatif s'execute, donc un `appendSwitch` depuis l'interieur du
 * processus n'est pris en compte qu'a moitie. Mesure sur la machine de
 * developpement, planche de 21 manches : `appendSwitch` seul, 3 captures
 * reussies sur 6 ; le meme drapeau pose sur la vraie ligne de commande du
 * processus, 6 sur 6. Seul un lanceur exterieur peut poser un drapeau avant
 * que le processus Electron ne demarre.
 *
 * Pourquoi ce fichier importe `electron` sans enfreindre la regle du noyau.
 * Le reste de `src/` (hors `src/electron/`) n'importe jamais `electron`, pour
 * rester testable sans Chromium. Ce fichier est l'exception explicite : il
 * n'importe que ce que le paquet `electron` exporte cote Node, a savoir le
 * **chemin** du binaire Electron a lancer - jamais l'API `app`/`BrowserWindow`.
 * Il ne s'execute jamais dans le processus Electron lui-meme : c'est lui qui
 * cree ce processus, en enfant, puis attend qu'il se termine. Aucune fenetre,
 * aucun IPC, aucune logique metier ici.
 */

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
// Cote Node (hors du processus Electron), le paquet "electron" exporte une
// chaine : le chemin du binaire installe dans node_modules. C'est le seul
// import d'"electron" tolere hors de src/electron/.
import electronPath from "electron";
import { tourneSousWsl } from "./wsl.ts";

const lisLaVersionDuNoyau = (): string | undefined => {
  try {
    return readFileSync("/proc/version", "utf8");
  } catch {
    return undefined;
  }
};

const sousWsl = tourneSousWsl(process.platform, process.env, lisLaVersionDuNoyau);

// Voir le commentaire de tete : ce drapeau doit venir de la ligne de commande
// du processus, pas d'un appendSwitch pose apres coup - c'est toute la raison
// d'etre de ce lanceur.
const args = [".", ...(sousWsl ? ["--use-angle=swiftshader"] : [])];

const enfant = spawn(electronPath as unknown as string, args, {
  // La fenetre Electron s'affiche via WSLg ou le systeme hote : le lanceur ne
  // doit s'interposer sur aucun flux, ni masquer la console d'Electron.
  stdio: "inherit",
});

enfant.on("error", (erreur) => {
  console.error("Impossible de lancer Electron :", erreur);
  process.exit(1);
});

enfant.on("exit", (code, signal) => {
  // Le code de sortie du lanceur doit etre celui d'Electron : sinon, un echec
  // de l'application (ou un crash du GPU non rattrape) passerait pour un
  // succes aux yeux de qui lance `npm run app`.
  if (code !== null) {
    process.exit(code);
  }
  // Termine par un signal (Ctrl+C transmis, etc.) : pas de code de sortie a
  // reprendre, mais pas un succes silencieux non plus.
  process.exit(signal !== null ? 1 : 0);
});
