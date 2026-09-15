/**
 * Processus principal : ouvre la fenetre et cable les canaux IPC.
 *
 * Ce fichier ne contient aucune logique metier — elle vit dans
 * `sessionFetchHandler.ts` et `sessionList.ts`, qui n'importent pas `electron`
 * et restent donc testables hors-ligne. Ici, seulement du cablage.
 */

import { app, BrowserWindow, clipboard, ipcMain, shell } from "electron";
import { existsSync } from "node:fs";
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
import { parseSessionType, SESSION_TYPES } from "../sessionMeta.ts";
import { KNOWN_LOBBIES } from "../statink/url.ts";
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
import { fabriqueLaPlanche } from "./plancheHandler.ts";
import { outilsDePlanche } from "./planchePhotographe.ts";

const here = dirname(fileURLToPath(import.meta.url));

// Sans cela, Chromium affiche les champs de date au format de sa propre locale,
// soit du JJ/MM inverse pour un utilisateur francais.
app.commandLine.appendSwitch("lang", "fr-FR");

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

ipcMain.handle(IPC.buildPlanche, (_event, input: BuildPlancheInput) =>
  // `readSession`, appele par les outils, refuse tout chemin hors du dossier
  // des sessions : la garde est la meme que pour `readBattle`.
  fabriqueLaPlanche(input.path, outilsDePlanche()),
);

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
    clipboard.writeText(url);
    return "copie" as const;
  }

  await shell.openExternal(url);
  return "ouvert" as const;
});

ipcMain.handle(IPC.copyToClipboard, (_event, texte: unknown) => {
  if (typeof texte !== "string" || texte.length > TAILLE_MAXIMALE_PRESSE_PAPIER) {
    throw new Error("Texte a copier invalide.");
  }
  clipboard.writeText(texte);
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
