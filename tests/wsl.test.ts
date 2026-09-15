import { describe, expect, test } from "vitest";
import { tourneSousWsl, versCheminWindows } from "../src/wsl.ts";

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

describe("versCheminWindows", () => {
  test("convertit un disque monte sous /mnt en lettre Windows", () => {
    expect(versCheminWindows("/mnt/c/Users/erwan/x.png", {})).toBe(
      "C:\\Users\\erwan\\x.png",
    );
  });

  test("met la lettre de lecteur en majuscule", () => {
    expect(versCheminWindows("/mnt/d/dossier/fichier.txt", {})).toBe(
      "D:\\dossier\\fichier.txt",
    );
  });

  test("un disque /mnt ne depend pas du nom de distribution", () => {
    expect(versCheminWindows("/mnt/c/Users/x", { WSL_DISTRO_NAME: undefined })).toBe(
      "C:\\Users\\x",
    );
  });

  test("convertit un chemin de la distribution en UNC wsl.localhost", () => {
    expect(
      versCheminWindows("/home/erwan/repositories/x.png", { WSL_DISTRO_NAME: "Ubuntu" }),
    ).toBe("\\\\wsl.localhost\\Ubuntu\\home\\erwan\\repositories\\x.png");
  });

  test("rend undefined quand le nom de distribution manque", () => {
    expect(versCheminWindows("/home/erwan/x.png", {})).toBeUndefined();
    expect(
      versCheminWindows("/home/erwan/x.png", { WSL_DISTRO_NAME: undefined }),
    ).toBeUndefined();
  });

  test("rend undefined pour un chemin relatif", () => {
    expect(versCheminWindows("data/planches/x.png", { WSL_DISTRO_NAME: "Ubuntu" })).toBeUndefined();
  });

  test("ne prend pas /mnt2 ou /mntx pour un disque monte", () => {
    // "/mnt" doit etre un segment complet, pas un prefixe de nom de dossier.
    expect(
      versCheminWindows("/mnt2/c/x", { WSL_DISTRO_NAME: "Ubuntu" }),
    ).toBe("\\\\wsl.localhost\\Ubuntu\\mnt2\\c\\x");
  });
});
