/**
 * Pont entre la fenetre et le processus principal.
 *
 * La fenetre n'a aucun acces a Node : elle ne voit que les fonctions
 * exposees ici.
 *
 * Deux contraintes expliquent la forme inhabituelle de ce fichier :
 *
 * 1. Il est ecrit en `.cts`, donc emis en CommonJS, malgre le `"type":
 *    "module"` du depot : c'est ce qu'attend le chargeur de preload.
 * 2. Il n'importe **que** `electron`. Le bac a sable (`sandbox: true`) fournit
 *    un chargeur reduit, incapable de resoudre un module local : importer
 *    `./ipcChannels.ts` fait echouer le preload en silence, et la fenetre se
 *    retrouve sans pont. Les noms de canaux sont donc redeclares ici, et
 *    `tests/electron/preload.test.ts` interdit qu'ils divergent de `IPC`.
 */

import { contextBridge, ipcRenderer } from "electron";

const CANAUX = {
  listSessions: "sessions:list",
  previewSession: "session:preview",
  saveSession: "session:save",
  readSession: "session:read",
  updateSession: "session:update",
  deleteSession: "session:delete",
  readBattle: "battle:read",
  buildReport: "report:build",
  buildPlanche: "planche:build",
  revealPlanche: "planche:reveal",
  openExternal: "app:open-external",
  copyToClipboard: "app:clipboard",
  quitApp: "app:quit",
  fetchProgress: "session:fetch-progress",
  choices: "app:choices",
} as const;

contextBridge.exposeInMainWorld("splatoonApi", {
  listSessions: () => ipcRenderer.invoke(CANAUX.listSessions),

  previewSession: (input: unknown) =>
    ipcRenderer.invoke(CANAUX.previewSession, input),

  saveSession: (previewId: string) =>
    ipcRenderer.invoke(CANAUX.saveSession, previewId),

  readSession: (path: string) => ipcRenderer.invoke(CANAUX.readSession, path),

  updateSession: (input: unknown) =>
    ipcRenderer.invoke(CANAUX.updateSession, input),

  deleteSession: (path: string) =>
    ipcRenderer.invoke(CANAUX.deleteSession, path),

  readBattle: (input: unknown) => ipcRenderer.invoke(CANAUX.readBattle, input),

  buildReport: (input: unknown) => ipcRenderer.invoke(CANAUX.buildReport, input),

  buildPlanche: (input: unknown) =>
    ipcRenderer.invoke(CANAUX.buildPlanche, input),

  revealPlanche: (path: string) => ipcRenderer.invoke(CANAUX.revealPlanche, path),

  openExternal: (url: string) => ipcRenderer.invoke(CANAUX.openExternal, url),

  copyToClipboard: (texte: string) =>
    ipcRenderer.invoke(CANAUX.copyToClipboard, texte),

  choices: () => ipcRenderer.invoke(CANAUX.choices),

  /** Ferme l'application : la fenetre ne peut pas quitter le processus seule. */
  quitApp: () => ipcRenderer.invoke(CANAUX.quitApp),

  /** Renvoie de quoi se desabonner : la fenetre le fait apres chaque recuperation. */
  onFetchProgress: (listener: (progress: unknown) => void) => {
    const handler = (_event: unknown, progress: unknown) => listener(progress);
    ipcRenderer.on(CANAUX.fetchProgress, handler);
    return () => {
      ipcRenderer.removeListener(CANAUX.fetchProgress, handler);
    };
  },
});
