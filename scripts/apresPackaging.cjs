/**
 * Crochet `afterPack` d'electron-builder : pose l'icone et les metadonnees
 * dans l'executable Windows.
 *
 * electron-builder sait le faire lui-meme, mais sous Linux il passe par Wine,
 * absent de la machine de developpement - d'ou `signAndEditExecutable: false`
 * dans `package.json`. Sous WSL, pas besoin de Wine : l'interoperabilite lance
 * directement `rcedit-x64.exe`, fourni par le paquet `rcedit`. C'est ce que
 * fait ce crochet.
 *
 * Hors de WSL et hors de Windows, il n'y a aucun moyen de lancer rcedit : le
 * crochet le dit et laisse l'executable avec l'icone d'Electron, plutot que de
 * faire echouer tout le packaging pour une icone.
 *
 * CommonJS : electron-builder charge ce fichier par `require`.
 */

const { execFileSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const { join, resolve } = require("node:path");

exports.default = async function apresPackaging(contexte) {
  if (contexte.electronPlatformName !== "win32") return;

  const { productFilename, info } = contexte.packager.appInfo;
  const exe = join(contexte.appOutDir, `${productFilename}.exe`);
  const icone = resolve("build/icon.ico");
  const rcedit = resolve("node_modules/rcedit/bin/rcedit-x64.exe");

  const sousWindowsOuWsl = process.platform === "win32" || existsSync("/proc/sys/fs/binfmt_misc/WSLInterop");
  if (!sousWindowsOuWsl) {
    console.warn("  • icone de l'executable non posee : rcedit demande Windows ou WSL");
    return;
  }

  // Sous WSL, un executable Windows veut des chemins Windows.
  const versWindows = (chemin) =>
    process.platform === "win32" ? chemin : execFileSync("wslpath", ["-w", chemin], { encoding: "utf8" }).trim();

  const version = info.metadata.version;
  execFileSync(rcedit, [
    versWindows(exe),
    "--set-icon",
    versWindows(icone),
    "--set-file-version",
    version,
    "--set-product-version",
    version,
    "--set-version-string",
    "ProductName",
    productFilename,
    "--set-version-string",
    "FileDescription",
    productFilename,
    "--set-version-string",
    "CompanyName",
    "",
  ]);
  console.log(`  • icone et metadonnees posees  exe=${exe}`);
};
