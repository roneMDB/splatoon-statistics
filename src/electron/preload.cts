/**
 * Pont entre la fenetre et le processus principal.
 *
 * La fenetre n'a aucun acces a Node : elle ne voit que les quatre fonctions
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
  fetchSession: "session:fetch",
  fetchProgress: "session:fetch-progress",
  choices: "app:choices",
} as const;

contextBridge.exposeInMainWorld("splatoonApi", {
  listSessions: () => ipcRenderer.invoke(CANAUX.listSessions),

  fetchSession: (input: unknown) =>
    ipcRenderer.invoke(CANAUX.fetchSession, input),

  choices: () => ipcRenderer.invoke(CANAUX.choices),

  /** Renvoie de quoi se desabonner : la fenetre le fait apres chaque recuperation. */
  onFetchProgress: (listener: (progress: unknown) => void) => {
    const handler = (_event: unknown, progress: unknown) => listener(progress);
    ipcRenderer.on(CANAUX.fetchProgress, handler);
    return () => {
      ipcRenderer.removeListener(CANAUX.fetchProgress, handler);
    };
  },
});
