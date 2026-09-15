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
 * implementation purement logicielle d'OpenGL ; avec elle, la meme planche de
 * 21 manches (1080 x 6947 px) passe 5 fois sur 5, y compris dans une session
 * WSLg deja degradee ou rien d'autre ne passait.
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
