/**
 * Processus principal : ouvre la fenetre et cable les canaux IPC.
 *
 * Ce fichier ne contient aucune logique metier — elle vit dans
 * `sessionFetchHandler.ts` et `sessionList.ts`, qui n'importent pas `electron`
 * et restent donc testables hors-ligne. Ici, seulement du cablage.
 */

import { app, BrowserWindow, ipcMain } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { DEFAULT_USER } from "../config.ts";
import { listSessions } from "../sessionList.ts";
import { SESSION_TYPES } from "../sessionMeta.ts";
import { KNOWN_LOBBIES } from "../statink/url.ts";
import { IPC, type FetchSessionFormInput } from "./ipcChannels.ts";
import { handleFetchSession } from "./sessionFetchHandler.ts";

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
}));

ipcMain.handle(
  IPC.fetchSession,
  async (event, input: FetchSessionFormInput) =>
    handleFetchSession(input, {
      // La progression ne part qu'a la fenetre qui a demande la recuperation.
      onProgress: (progress) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send(IPC.fetchProgress, progress);
        }
      },
    }),
);

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
