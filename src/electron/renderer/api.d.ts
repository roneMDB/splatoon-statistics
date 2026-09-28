/**
 * Ce que la fenetre voit du preload : le pont `window.splatoonApi`, type par
 * le contrat partage. Lu par `tsconfig.renderer.json` seulement - le rendu
 * n'est pas transpile, ce fichier ne sert qu'a la verification.
 */

import type { SplatoonApi } from "../ipcChannels.ts";

declare global {
  interface Window {
    splatoonApi: SplatoonApi;
  }
}

export {};
