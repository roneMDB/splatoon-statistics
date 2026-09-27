/**
 * Installe l'application packagee cote Windows, depuis WSL.
 *
 * A lancer apres `npm run app:package` (`npm run app:deploy`). Copie
 * `dist-app/win-unpacked` dans `%LOCALAPPDATA%\Programs\Splatoon Statistics` -
 * l'emplacement des applications installees pour un seul utilisateur, sans
 * droits d'administrateur - puis cree un raccourci dans le menu Demarrer.
 *
 * Le dossier cible est remplace en entier : un fichier d'une version
 * precedente qui n'existe plus ne doit pas survivre a la mise a jour. Les
 * donnees, elles, n'y sont pas (elles vivent dans `Documents\Splatoon
 * Statistics`, voir `src/electron/demarrage.ts`) : les remplacer ne perd rien.
 */

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const NOM = "Splatoon Statistics";
const EXE = `${NOM}.exe`;
const SOURCE = "dist-app/win-unpacked";

const echoue = (message: string): never => {
  console.error(message);
  process.exit(1);
};

/** Execute une commande PowerShell et rend sa sortie, sans le retour chariot de Windows. */
const powershell = (commande: string): string =>
  execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", commande], {
    encoding: "utf8",
  }).trim();

/** Une chaine PowerShell entre apostrophes : on double celles qu'elle contient. */
const litteral = (texte: string): string => `'${texte.replaceAll("'", "''")}'`;

const versLinux = (chemin: string): string =>
  execFileSync("wslpath", ["-u", chemin], { encoding: "utf8" }).trim();

function main(): void {
  if (!existsSync(join(SOURCE, EXE))) {
    echoue(`${SOURCE}/${EXE} introuvable : lance d'abord npm run app:package.`);
  }

  try {
    powershell("$null");
  } catch {
    echoue("powershell.exe introuvable : ce script s'execute sous WSL, sur une machine Windows.");
  }

  // Windows refuse d'ecraser les DLL d'un executable en cours : autant le dire
  // avant d'avoir efface la moitie du dossier.
  const enCours = execFileSync("tasklist.exe", ["/FI", `IMAGENAME eq ${EXE}`, "/NH"], {
    encoding: "utf8",
  });
  if (enCours.includes(EXE)) {
    echoue(`${NOM} est ouvert : ferme l'application, puis relance npm run app:deploy.`);
  }

  const localAppData = powershell("[Environment]::GetFolderPath('LocalApplicationData')");
  const appData = powershell("[Environment]::GetFolderPath('ApplicationData')");
  const cibleWindows = `${localAppData}\\Programs\\${NOM}`;
  const cible = versLinux(cibleWindows);

  // Garde-fou avant l'effacement : un dossier deja la, non vide et sans notre
  // executable, n'est pas le notre.
  if (existsSync(cible) && readdirSync(cible).length > 0 && !existsSync(join(cible, EXE))) {
    echoue(`${cibleWindows} existe et ne contient pas ${EXE} : rien n'est efface, verifie ce dossier.`);
  }

  const debut = Date.now();
  rmSync(cible, { recursive: true, force: true });
  cpSync(SOURCE, cible, { recursive: true });

  const raccourci = `${appData}\\Microsoft\\Windows\\Start Menu\\Programs\\${NOM}.lnk`;
  powershell(
    [
      `$r = (New-Object -ComObject WScript.Shell).CreateShortcut(${litteral(raccourci)})`,
      `$r.TargetPath = ${litteral(`${cibleWindows}\\${EXE}`)}`,
      `$r.WorkingDirectory = ${litteral(cibleWindows)}`,
      // Une icone nommee plutot que celle de l'executable : Windows garde en
      // cache l'icone d'un chemin, et une installation precedente au meme
      // chemin (avec l'icone d'Electron) resterait affichee.
      `$r.IconLocation = ${litteral(`${cibleWindows}\\resources\\icon.ico,0`)}`,
      `$r.Save()`,
    ].join("; "),
  );

  // Vide le cache d'icones de l'explorateur, pour que le menu Demarrer et la
  // barre des taches relisent l'icone sans attendre une session suivante. Un
  // echec n'empeche rien : l'icone finira par se mettre a jour.
  try {
    execFileSync("ie4uinit.exe", ["-show"]);
  } catch {
    console.warn("Cache d'icones non rafraichi : l'ancienne icone peut rester affichee un moment.");
  }

  console.log(`Installe dans ${cibleWindows} (${Math.round((Date.now() - debut) / 1000)} s).`);
  console.log(`Raccourci : menu Demarrer > ${NOM}.`);
}

main();
