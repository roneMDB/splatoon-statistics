/**
 * Ouverture d'un lien hors de l'application : ce qu'on accepte d'ouvrir, et si
 * la machine sait le faire.
 *
 * Les deux verifications vivent ici, hors d'Electron, pour etre testables.
 */

import { STATINK_ORIGIN } from "./config.ts";

/**
 * Verifie qu'une URL pointe bien vers stat.ink, avant de l'ouvrir.
 *
 * L'URL vient de la fenetre, potentiellement compromise : sans ce controle, un
 * rendu altere ferait ouvrir n'importe quelle adresse - `file://` comprise -
 * dans le navigateur de l'utilisateur.
 *
 * La comparaison porte sur l'origine entiere, pas sur un prefixe de chaine :
 * `https://stat.ink.exemple.test/` commence par « https://stat.ink » sans etre
 * stat.ink pour autant.
 */
export function estUneUrlStatink(url: string): boolean {
  try {
    return new URL(url).origin === new URL(STATINK_ORIGIN).origin;
  } catch {
    return false;
  }
}

/**
 * Navigateurs que `xdg-open` essaie, dans son ordre, reduits a ceux qu'on peut
 * esperer trouver sur une machine de bureau.
 *
 * `wslview` (paquet `wslu`) n'en fait pas partie a l'origine : il s'installe
 * comme alternative `x-www-browser` et se trouve donc par ce nom. On le cherche
 * quand meme directement, au cas ou l'alternative ne serait pas enregistree.
 *
 * `sensible-browser` est volontairement absent : il ne fait que deleguer a
 * `$BROWSER` ou `x-www-browser`, donc sa presence ne prouve rien.
 */
const NAVIGATEURS = [
  "x-www-browser",
  "www-browser",
  "wslview",
  "firefox",
  "chromium",
  "chromium-browser",
  "google-chrome",
];

/**
 * Dit si la machine sait vraiment ouvrir un lien.
 *
 * Deux echecs silencieux se cumulent ici, et aucun ne remonte a l'application :
 *
 * 1. `shell.openExternal` d'Electron delegue a `xdg-open` sous Linux et
 *    **resout sa promesse meme quand ce programme est absent**.
 * 2. `xdg-open` lui-meme reussit a se lancer puis echoue faute de navigateur,
 *    ce qui est le cas normal sous WSL : le navigateur est du cote Windows.
 *    Il ecrit « no method available » sur la sortie d'erreur, et c'est tout.
 *
 * Verifier la seule presence de `xdg-open` ne suffit donc pas : il faut aussi
 * qu'un navigateur soit atteignable. A defaut, l'appelant replie sur le
 * presse-papier plutot que de laisser croire a une ouverture.
 *
 * @param plateforme `process.platform`.
 * @param env `PATH` et `BROWSER` du processus.
 * @param existe teste la presence d'un fichier ; injecte pour le test.
 */
export function saitOuvrirUnLien(
  plateforme: string,
  env: { PATH?: string | undefined; BROWSER?: string | undefined },
  existe: (fichier: string) => boolean,
): boolean {
  // macOS (`open`) et Windows (`start`) font partie du systeme.
  if (plateforme !== "linux") return true;

  const dossiers = (env.PATH ?? "").split(":").filter((dossier) => dossier !== "");
  const dansLePath = (programme: string) =>
    dossiers.some((dossier) => existe(`${dossier}/${programme}`));

  if (!dansLePath("xdg-open")) return false;

  // `$BROWSER` est ce que xdg-open essaie en premier : s'il est renseigne, on
  // fait confiance a l'utilisateur qui l'a pose.
  if ((env.BROWSER ?? "").trim() !== "") return true;

  return NAVIGATEURS.some(dansLePath);
}
