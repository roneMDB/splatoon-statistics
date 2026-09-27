/**
 * Point d'entree du processus principal : fixe le dossier de travail, puis
 * charge `main.ts`.
 *
 * Pourquoi un fichier a part. Les reglages, les sessions, les planches et les
 * pictos sont des chemins relatifs au dossier courant (`settings.json`,
 * `data/sessions`...), et `reglages.ts` lit `settings.json` des le chargement
 * du module. En developpement, le dossier courant est le depot : tout y est.
 * Une application packagee, elle, demarre dans un dossier quelconque (celui
 * de l'executable, celui d'un raccourci). Il faut donc changer de dossier
 * **avant** que `main.ts` et ses imports ne soient evalues - ce qu'un import
 * statique, remonte en tete de module, ne permet pas. D'ou l'import dynamique.
 *
 * Version packagee : on travaille dans `Documents\Splatoon Statistics`, et non
 * dans `AppData` - c'est la qu'on va chercher une planche pour la glisser dans
 * Discord, et qu'on ouvre `settings.json` a la main. Les pictos, eux, sont
 * embarques dans le paquet (`resources/splatoon`, voir `build` dans
 * `package.json`) : sans `npm` sous la main, personne ne lancerait
 * `npm run pictos`.
 */

import { app, dialog } from "electron";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// Sans cela, Chromium affiche les champs de date au format de sa propre locale,
// soit du JJ/MM inverse pour un utilisateur francais. Pose ici plutot que dans
// `main.ts` : un drapeau doit l'etre avant `ready`, et l'import dynamique
// ci-dessous ne garantit pas d'arriver avant.
app.commandLine.appendSwitch("lang", "fr-FR");

if (app.isPackaged) {
  const dossierDeTravail = join(app.getPath("documents"), "Splatoon Statistics");
  mkdirSync(dossierDeTravail, { recursive: true });
  process.chdir(dossierDeTravail);

  const pictosEmbarques = join(process.resourcesPath, "splatoon");
  if (existsSync(pictosEmbarques)) {
    process.env["SPLATOON_PICTOS_PAR_DEFAUT"] ??= pictosEmbarques;
  }
}

try {
  await import("./main.ts");
} catch (erreur) {
  // Un `settings.json` refuse leve ici, au chargement de `reglages.ts`. Sans
  // cette boite, l'application packagee se fermerait sans rien dire : il n'y a
  // pas de console pour lire la pile d'appels.
  await app.whenReady();
  dialog.showErrorBox(
    "Démarrage impossible",
    erreur instanceof Error ? erreur.message : String(erreur),
  );
  app.exit(1);
}
