import { describe, expect, test } from "vitest";
import { tourneSousWsl } from "../src/wsl.ts";

/** Le `/proc/version` d'une vraie machine WSL2. */
const VERSION_WSL =
  "Linux version 6.18.33.2-microsoft-standard-WSL2 (root@build) #1 SMP PREEMPT_DYNAMIC";

/** Celui d'une machine Linux ordinaire. */
const VERSION_LINUX =
  "Linux version 6.8.0-45-generic (buildd@lcy02) #45-Ubuntu SMP PREEMPT_DYNAMIC";

const jamaisLu = () => {
  throw new Error("La version du noyau n'aurait pas du etre lue.");
};

describe("tourneSousWsl", () => {
  test("reconnait WSL a la variable d'environnement, sans lire le noyau", () => {
    expect(tourneSousWsl("linux", { WSL_DISTRO_NAME: "Ubuntu" }, jamaisLu)).toBe(true);
    expect(tourneSousWsl("linux", { WSL_INTEROP: "/run/WSL/1_interop" }, jamaisLu)).toBe(true);
  });

  test("reconnait WSL a la signature du noyau quand l'environnement est vide", () => {
    expect(tourneSousWsl("linux", {}, () => VERSION_WSL)).toBe(true);
  });

  test("ne prend pas un Linux ordinaire pour du WSL", () => {
    expect(tourneSousWsl("linux", {}, () => VERSION_LINUX)).toBe(false);
  });

  test("ne casse pas quand /proc/version est illisible", () => {
    expect(tourneSousWsl("linux", {}, () => undefined)).toBe(false);
  });

  // Le fichier n'existe pas ailleurs, et la question ne se pose pas : la bascule
  // ne concerne que la plateforme ou le defaut a ete constate.
  test("repond non hors de Linux, sans rien lire", () => {
    expect(tourneSousWsl("win32", { WSL_DISTRO_NAME: "Ubuntu" }, jamaisLu)).toBe(false);
    expect(tourneSousWsl("darwin", {}, jamaisLu)).toBe(false);
  });
});
