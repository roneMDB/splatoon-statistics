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
import { previewSession, saveSession } from "./sessionFetchHandler.ts";
import {
  deleteSession,
  listSessions,
  readSession,
  summarizeSessionFile,
  updateSessionMeta,
} from "../sessionList.ts";
import { toBattleRows } from "../battleRows.ts";
import { parseSessionType, SESSION_TYPES } from "../sessionMeta.ts";
import { KNOWN_LOBBIES } from "../statink/url.ts";
import { IPC, type FetchSessionFormInput } from "./ipcChannels.ts";

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
  (_event, input: { path: string; name?: string; type?: string }) =>
    updateSessionMeta(input.path, {
      name: input.name,
      type: parseSessionType(input.type),
    }),
);

ipcMain.handle(IPC.deleteSession, (_event, path: string) => deleteSession(path));

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
