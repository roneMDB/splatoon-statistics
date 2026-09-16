/**
 * Processus principal : ouvre la fenetre et cable les canaux IPC.
 *
 * Ce fichier ne contient aucune logique metier — elle vit dans
 * `sessionFetchHandler.ts` et `sessionList.ts`, qui n'importent pas `electron`
 * et restent donc testables hors-ligne. Ici, seulement du cablage.
 */

import { app, BrowserWindow, clipboard, ipcMain, shell } from "electron";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { DEFAULT_USER } from "../config.ts";
import { previewSession, saveSession } from "./sessionFetchHandler.ts";
import {
  deleteSession,
  listSessions,
  readSession,
  summarizeSessionFile,
  updateSessionMeta,
} from "../sessionList.ts";
import { toBattleRows } from "../battleRows.ts";
import { toBattleDetail } from "../battleDetail.ts";
import { estUneUrlStatink, saitOuvrirUnLien } from "../lienExterne.ts";
import { saitOuvrirExplorer } from "../revelePlanche.ts";
import { parseSessionType, SESSION_TYPES } from "../sessionMeta.ts";
import { KNOWN_LOBBIES } from "../statink/url.ts";
import { tourneSousWsl, versCheminWindows } from "../wsl.ts";
import {
  IPC,
  type BuildPlancheInput,
  type BuildReportInput,
  type FetchSessionFormInput,
  type ReadBattleInput,
} from "./ipcChannels.ts";
import {
  construisLeCompteRendu,
  estUneSection,
  LIBELLES_SECTIONS,
  SECTIONS,
} from "../report/index.ts";
import { cheminDePlanche, fabriqueLaPlancheAvecReprise } from "./plancheHandler.ts";
import { outilsDePlanche } from "./planchePhotographe.ts";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Sous WSL, on rend par SwiftShader plutot que par le GPU de l'hote.
 *
 * La fabrication d'une planche photographie un document dans une fenetre hors
 * ecran, et cette capture passe par le processus GPU de Chromium. Sous WSLg,
 * ce processus ne survit pas : la premiere capture d'une session WSL reussit,
 * les suivantes echouent toutes sur `UnknownVizError`, et l'application finit
 * par ne plus demarrer du tout - le preload n'est plus charge, et la fenetre
 * s'ouvre sur « Demarrage impossible ».
 *
 * Releve fait sur la machine de developpement, avant le passage aux deux
 * colonnes : une planche de 21 manches, alors rendue en une seule colonne
 * (1080 x 6947 px), donnait 0 capture sur 3 sans ce drapeau, 5 sur 5 avec, y
 * compris dans une session WSLg deja degradee ou plus rien ne passait. Les
 * dimensions d'une planche ont change depuis (voir `LARGEUR_PLANCHE` dans
 * `src/report/planche.ts`) ; le taux de reussite mesure, lui, tient toujours.
 *
 * Le raisonnement est celui de `lienExterne.ts` : sous WSL, ce qui devrait
 * marcher echoue en silence, et mieux vaut le prevoir que le decouvrir.
 *
 * **Le drapeau n'est pas pose ici**, et c est delibere : Chromium lit
 * `--use-angle` avant que le code applicatif s'execute. Un `appendSwitch`
 * depuis ce fichier n'est donc pris en compte qu'a moitie, et le poser *en
 * plus* de la ligne de commande fait baisser le taux de reussite au lieu de
 * l'assurer - 5 captures sur 6 en cumulant, 6 sur 6 avec la seule ligne de
 * commande. C'est `src/lanceApp.ts`, le lanceur, qui le pose, et lui seul.
 *
 * Ce commentaire reste ici parce que c'est ici qu'on ira le chercher.
 *
 * Reserve a WSL : c'est la seule plateforme ou le defaut a ete constate et le
 * remede mesure. Le cout est une interface rendue par le processeur, ce qui ne
 * se voit pas sur un formulaire et un tableau.
 */

// Sans cela, Chromium affiche les champs de date au format de sa propre locale,
// soit du JJ/MM inverse pour un utilisateur francais.
app.commandLine.appendSwitch("lang", "fr-FR");

const lisLaVersionDuNoyau = (): string | undefined => {
  try {
    return readFileSync("/proc/version", "utf8");
  } catch {
    return undefined;
  }
};

/** Environnement WSL, lu une fois : ni la plateforme ni les variables ne changent en cours de route. */
const environnementWsl = {
  WSL_DISTRO_NAME: process.env["WSL_DISTRO_NAME"],
  WSL_INTEROP: process.env["WSL_INTEROP"],
};

const sousWslActif = tourneSousWsl(process.platform, environnementWsl, lisLaVersionDuNoyau);

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 720,
    title: "Splatoon Statistics",
    backgroundColor: "#12121a",
    webPreferences: {
      preload: join(here, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Le rendu n'est pas transpile : il est copie tel quel a cote du build.
  void window.loadFile(join(here, "renderer", "index.html"));
  return window;
}

ipcMain.handle(IPC.listSessions, () => listSessions());

ipcMain.handle(IPC.choices, () => ({
  lobbies: KNOWN_LOBBIES,
  sessionTypes: SESSION_TYPES,
  defaultUser: DEFAULT_USER,
  reportSections: SECTIONS.map((cle) => ({ cle, libelle: LIBELLES_SECTIONS[cle] })),
}));

ipcMain.handle(
  IPC.previewSession,
  async (event, input: FetchSessionFormInput) =>
    previewSession(input, {
      // La progression ne part qu'a la fenetre qui a demande l'apercu.
      onProgress: (progress) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send(IPC.fetchProgress, progress);
        }
      },
    }),
);

ipcMain.handle(IPC.saveSession, (_event, previewId: string) =>
  saveSession(previewId),
);

ipcMain.handle(IPC.readSession, async (_event, path: string) => {
  const file = await readSession(path);
  return { summary: summarizeSessionFile(file, path), rows: toBattleRows(file.battles) };
});

ipcMain.handle(
  IPC.updateSession,
  (
    _event,
    input: {
      path: string;
      name?: string;
      type?: string;
      objectif?: string;
      ressenti?: string;
    },
  ) =>
    updateSessionMeta(input.path, {
      name: input.name,
      type: parseSessionType(input.type),
      objectif: input.objectif,
      ressenti: input.ressenti,
    }),
);

ipcMain.handle(IPC.deleteSession, (_event, path: string) => deleteSession(path));

ipcMain.handle(IPC.readBattle, async (_event, input: ReadBattleInput) => {
  // readSession refuse tout chemin hors du dossier des sessions.
  const file = await readSession(input.path);
  const battle = file.battles.find((manche) => manche.uuid === input.uuid);
  if (battle === undefined) {
    throw new Error("Cette manche ne figure pas dans la session.");
  }
  return toBattleDetail(battle);
});

ipcMain.handle(IPC.buildReport, async (_event, input: BuildReportInput) => {
  // Les sections viennent de la fenetre : on les valide avant de lire quoi que
  // ce soit, comme `parseSessionType` le fait pour le type de session.
  const inconnue = (input.sections ?? []).find((section) => !estUneSection(section));
  if (inconnue !== undefined) {
    throw new Error(`Section de compte rendu inconnue : "${inconnue}"`);
  }

  // readSession refuse tout chemin hors du dossier des sessions.
  const file = await readSession(input.path);
  return construisLeCompteRendu(file, {
    sections: (input.sections ?? []).filter(estUneSection),
    ...(input.objectif !== undefined ? { objectif: input.objectif } : {}),
    ...(input.ressenti !== undefined ? { ressenti: input.ressenti } : {}),
  });
});

ipcMain.handle(IPC.buildPlanche, async (_event, input: BuildPlancheInput) => {
  // `readSession`, appele par les outils, refuse tout chemin hors du dossier
  // des sessions : la garde est la meme que pour `readBattle`.
  //
  // `outilsDePlanche` est passee telle quelle, comme fabrique : chaque
  // reprise a besoin d'une fenetre hors ecran neuve, pas de celle deja
  // detruite par la tentative precedente. Voir `plancheHandler.ts`.
  const resultat = await fabriqueLaPlancheAvecReprise(input.path, outilsDePlanche);
  if (!sousWslActif) return resultat;

  // Sous WSL, le chemin Linux affiche ne se colle pas dans l'explorateur
  // Windows : on ajoute son equivalent quand la conversion aboutit (voir
  // `versCheminWindows`), sans rien changer a `chemin` lui-meme.
  const cheminWindows = versCheminWindows(resultat.chemin, environnementWsl);
  return cheminWindows === undefined ? resultat : { ...resultat, cheminWindows };
});

/**
 * Revele le PNG d'une planche dans le gestionnaire de fichiers.
 *
 * Le chemin vient de la fenetre : `cheminDePlanche` refuse tout ce qui n'est
 * pas un `.png` du dossier des planches, meme raisonnement que pour les
 * sessions et les manches.
 *
 * Sous WSL, `shell.showItemInFolder` ouvrirait l'explorateur Linux (absent)
 * plutot que celui de Windows : on lance `explorer.exe` nous-memes, apres
 * avoir verifie qu'il est atteignable - comme `openExternal` le fait pour un
 * navigateur. Son code de sortie ne prouve rien, y compris en cas de reussite
 * (mesure sur la machine de developpement : 1 a chaque fois) ; on ne l'attend
 * donc pas et on ne le lit jamais.
 *
 * Quand `explorer.exe` est hors d'atteinte, ou que le chemin Windows ne peut
 * pas se calculer (nom de distribution absent), le chemin est copie dans le
 * presse-papier plutot que de laisser croire a une ouverture - a defaut du
 * chemin Windows, c'est le chemin Linux qui est copie.
 */
ipcMain.handle(IPC.revealPlanche, async (_event, path: unknown) => {
  if (typeof path !== "string") {
    throw new Error("Chemin de planche invalide.");
  }
  const resolu = await cheminDePlanche(path);

  if (!sousWslActif) {
    shell.showItemInFolder(resolu);
    return "ouvert" as const;
  }

  const cheminWindows = versCheminWindows(resolu, environnementWsl);
  const environnementPath = { PATH: process.env["PATH"] };
  if (cheminWindows !== undefined && saitOuvrirExplorer(environnementPath, existsSync)) {
    spawn("explorer.exe", [`/select,${cheminWindows}`], {
      detached: true,
      stdio: "ignore",
    }).unref();
    return "ouvert" as const;
  }

  await clipboard.writeText(cheminWindows ?? resolu);
  return "copie" as const;
});

/**
 * Copie un texte fourni par la fenetre.
 *
 * Le presse-papier appartient a l'utilisateur : on borne la taille pour qu'un
 * rendu compromis ne puisse pas y deverser un contenu demesure. Un compte
 * rendu fait quelques milliers de caracteres.
 */
const TAILLE_MAXIMALE_PRESSE_PAPIER = 100_000;

/**
 * Ouvre le lien stat.ink d'une manche, ou le copie a defaut.
 *
 * L'URL vient de la fenetre : elle est verifiee avant d'atteindre le
 * navigateur, sans quoi un rendu compromis ferait ouvrir n'importe quelle
 * adresse - `file://` comprise - sur la machine de l'utilisateur.
 *
 * `shell.openExternal` resout sa promesse meme quand `xdg-open` est absent :
 * le bouton semblerait alors fonctionner sans rien faire. On verifie donc en
 * amont, et on replie sur le presse-papier plutot que de mentir.
 */
ipcMain.handle(IPC.openExternal, async (_event, url: unknown) => {
  if (typeof url !== "string" || !estUneUrlStatink(url)) {
    throw new Error("Lien refusé : seules les adresses stat.ink sont ouvertes.");
  }

  const environnement = {
    PATH: process.env["PATH"],
    BROWSER: process.env["BROWSER"],
  };
  if (!saitOuvrirUnLien(process.platform, environnement, existsSync)) {
    await clipboard.writeText(url);
    return "copie" as const;
  }

  await shell.openExternal(url);
  return "ouvert" as const;
});

ipcMain.handle(IPC.copyToClipboard, async (_event, texte: unknown) => {
  if (typeof texte !== "string" || texte.length > TAILLE_MAXIMALE_PRESSE_PAPIER) {
    throw new Error("Texte a copier invalide.");
  }
  await clipboard.writeText(texte);
});

/**
 * `app.quit()` et non `window.close()` : fermer la seule fenetre laisserait le
 * processus principal en vie sous macOS, ou `window-all-closed` ne quitte pas.
 * Le bouton promet de fermer l'application, il la ferme.
 */
ipcMain.handle(IPC.quitApp, () => {
  app.quit();
});

void app.whenReady().then(() => {
  createWindow();

  // Sous macOS, cliquer l'icone du dock rouvre une fenetre sans relancer l'appli.
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
