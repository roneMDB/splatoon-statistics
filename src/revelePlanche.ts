/**
 * Ce qu'il faut savoir pour reveler la planche dans le gestionnaire de
 * fichiers, sous WSL : si `explorer.exe` est atteignable.
 *
 * Meme raisonnement que `lienExterne.ts` : un appel qui semble reussir peut
 * tourner a vide (le meme `explorer.exe` renvoie d'ailleurs toujours le code
 * de sortie 1, succes ou non - voir `src/electron/main.ts`), mieux vaut
 * verifier en amont que pretendre avoir reussi.
 */

/**
 * Dit si `explorer.exe` est atteignable depuis le PATH.
 *
 * Sous WSL, WSL ajoute par defaut les dossiers Windows du PATH de l'hote a
 * celui de la distribution (`interop.appendWindowsPath`), et `explorer.exe`
 * s'y trouve normalement. Le verifier explicitement, plutot que de supposer
 * sa presence, evite de pretendre reveler un fichier sur une installation qui
 * a coupe ce pont - le meme raisonnement que `saitOuvrirUnLien` pour
 * `xdg-open`.
 *
 * @param env `PATH` du processus.
 * @param existe teste la presence d'un fichier ; injecte pour le test.
 */
export function saitOuvrirExplorer(
  env: { PATH?: string | undefined },
  existe: (fichier: string) => boolean,
): boolean {
  const dossiers = (env.PATH ?? "").split(":").filter((dossier) => dossier !== "");
  return dossiers.some((dossier) => existe(`${dossier}/explorer.exe`));
}
