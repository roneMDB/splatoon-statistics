import { describe, expect, test } from "vitest";
import { commandesObs, obsTourne, OPTIONS_OBS } from "../src/obs.ts";

describe("commandesObs", () => {
  test("sous Windows, tasklist et obs64.exe lance depuis son dossier", () => {
    expect(commandesObs("win32", false, "D:\\Programmes\\")).toEqual({
      lecture: {
        fichier: "tasklist.exe",
        args: ["/FI", "IMAGENAME eq obs64.exe", "/FO", "CSV", "/NH"],
      },
      lancement: {
        fichier: "D:\\Programmes\\obs-studio\\bin\\64bit\\obs64.exe",
        args: ["--disable-shutdown-check", "--minimize-to-tray"],
        dossier: "D:\\Programmes\\obs-studio\\bin\\64bit",
      },
    });
  });

  test("sous WSL, les memes programmes par /mnt/c", () => {
    const commandes = commandesObs("linux", true);
    expect(commandes?.lecture.fichier).toBe("/mnt/c/Windows/System32/tasklist.exe");
    expect(commandes?.lancement).toEqual({
      fichier: "/mnt/c/Program Files/obs-studio/bin/64bit/obs64.exe",
      args: [...OPTIONS_OBS],
      dossier: "/mnt/c/Program Files/obs-studio/bin/64bit",
    });
  });

  test("ailleurs, rien", () => {
    expect(commandesObs("linux", false)).toBeUndefined();
    expect(commandesObs("darwin", false)).toBeUndefined();
  });
});

describe("obsTourne", () => {
  test("reconnait une ligne CSV de tasklist", () => {
    expect(obsTourne(`"obs64.exe","3888","Console","1","208 472 Ko"\r\n`)).toBe(true);
  });

  test("le message « aucune tache » n'est pas OBS, quelle qu'en soit la langue", () => {
    expect(obsTourne("Informations : aucune tâche en service ne correspond aux critères spécifiés.\r\n")).toBe(false);
    expect(obsTourne("INFO: No tasks are running which match the specified criteria.\r\n")).toBe(false);
    expect(obsTourne("")).toBe(false);
  });

  test("un autre processus au nom proche n'est pas OBS", () => {
    expect(obsTourne(`"obs64.exe.bak","12","Console","1","1 Ko"`)).toBe(false);
  });
});
