/**
 * Detection de WSL, et ce qu'on en fait.
 *
 * Comme `lienExterne.ts`, cette logique vit hors d'Electron pour etre testable :
 * ses deux dependances au monde exterieur - la plateforme et le contenu de
 * `/proc/version` - lui sont passees.
 *
 * Pourquoi le depot a besoin de savoir qu'il tourne sous WSL : la fabrication
 * d'une planche photographie un document dans une fenetre hors ecran, et cette
 * capture passe par le processus GPU de Chromium. Sous WSLg, ce processus ne
 * survit pas : la **premiere** capture d'une session WSL reussit, les suivantes
 * echouent toutes sur `UnknownVizError`, et l'application finit par ne plus
 * demarrer du tout (« GPU process launch failed »). Mesure sur la machine de
 * developpement : 0 capture sur 3 sans correctif.
 *
 * Le remede est de ne pas dependre du GPU de l'hote. SwiftShader est une
 * implementation purement logicielle d'OpenGL ; releve fait sur la machine de
 * developpement, avant le passage aux deux colonnes : avec elle, la meme
 * planche de 21 manches, alors rendue en une seule colonne (1080 x 6947 px),
 * passait 5 fois sur 5, y compris dans une session WSLg deja degradee ou rien
 * d'autre ne passait. Les dimensions d'une planche ont change depuis (voir
 * `LARGEUR_PLANCHE` dans `src/report/planche.ts`) ; le taux de reussite
 * mesure, lui, tient toujours.
 *
 * Le cout est une interface rendue par le processeur plutot que par le GPU.
 * Pour un formulaire et un tableau, cela ne se voit pas ; une capture qui
 * echoue, si.
 *
 * La bascule est reservee a WSL parce que c'est la seule plateforme ou le
 * defaut a ete constate et le remede mesure. Ailleurs, on ne degrade rien sur
 * la foi d'une extrapolation.
 */

/** Ce qu'on lit de `/proc/version`, ou `undefined` s'il est illisible. */
export type LecteurDeVersion = () => string | undefined;

/**
 * Vrai quand le processus tourne sous WSL.
 *
 * Deux indices, dans cet ordre : la variable que WSL pose dans l'environnement,
 * puis la signature du noyau. La variable seule ne suffit pas - elle peut
 * manquer sous un gestionnaire de services ou un shell qui repart d'un
 * environnement vide - et `/proc/version` seul ne suffit pas non plus, puisque
 * le fichier peut etre illisible. On accepte l'un ou l'autre.
 */
export function tourneSousWsl(
  plateforme: NodeJS.Platform,
  environnement: { WSL_DISTRO_NAME?: string | undefined; WSL_INTEROP?: string | undefined },
  lisLaVersion: LecteurDeVersion,
): boolean {
  if (plateforme !== "linux") return false;

  if (environnement.WSL_DISTRO_NAME !== undefined || environnement.WSL_INTEROP !== undefined) {
    return true;
  }

  const version = lisLaVersion();
  if (version === undefined) return false;
  const minuscules = version.toLowerCase();
  return minuscules.includes("microsoft") || minuscules.includes("wsl");
}

/** Un disque Windows monte sous `/mnt/<lettre>`, capture la lettre et le reste. */
const DISQUE_MONTE = /^\/mnt\/([a-zA-Z])(\/.*)?$/;

/**
 * Convertit un chemin POSIX absolu en chemin Windows, tel qu'un explorateur
 * Windows le comprend.
 *
 * Fonction pure, sans appel a `wslpath` : la regle se code, et une fonction
 * pure se teste sans processus fils.
 *
 * Deux cas :
 * - `/mnt/<lettre>/...` designe un disque Windows monte : `/mnt/c/Users/x`
 *   devient `C:\Users\x`. Ce cas ne depend pas du nom de distribution, un
 *   disque Windows etant le meme quelle que soit la distribution qui le monte.
 * - tout autre chemin absolu vit dans la distribution : `/home/erwan/y`
 *   devient `\\wsl.localhost\<distribution>\home\erwan\y`, ou la distribution
 *   vient de `WSL_DISTRO_NAME`.
 *
 * Rend `undefined` plutot que d'inventer quand la conversion ne peut pas
 * aboutir : chemin relatif, ou nom de distribution manquant pour le second
 * cas. L'appelant retombe alors sur le chemin Linux.
 */
export function versCheminWindows(
  cheminPosix: string,
  environnement: { WSL_DISTRO_NAME?: string | undefined },
): string | undefined {
  if (!cheminPosix.startsWith("/")) return undefined;

  const disque = DISQUE_MONTE.exec(cheminPosix);
  if (disque !== null) {
    const lettre = disque[1]!.toUpperCase();
    const reste = (disque[2] ?? "").slice(1).split("/").join("\\");
    return reste === "" ? `${lettre}:\\` : `${lettre}:\\${reste}`;
  }

  const distribution = environnement.WSL_DISTRO_NAME;
  if (distribution === undefined || distribution === "") return undefined;

  const reste = cheminPosix.slice(1).split("/").join("\\");
  return `\\\\wsl.localhost\\${distribution}\\${reste}`;
}
