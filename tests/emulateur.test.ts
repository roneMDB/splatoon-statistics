// tests/emulateur.test.ts
import { describe, expect, test } from "vitest";
import {
  boutonDEmulateur,
  FICHIER_JOURNAL_EMULATEUR,
  lisLaLecture,
  SCRIPT_D_ETAT,
  SCRIPT_D_EXTINCTION,
  SCRIPT_D_OUVERTURE,
  type EtatDEmulateur,
} from "../src/emulateur.ts";

const etat = (complement: Partial<EtatDEmulateur>): EtatDEmulateur => ({ ouvertParNous: false, ...complement });

describe("lisLaLecture", () => {
  test("garde la derniere ligne non vide : un shell de connexion peut ecrire avant", () => {
    expect(lisLaLecture("bienvenue\nallume\n\n")).toBe("allume");
  });
  test("rend undefined pour toute autre sortie", () => {
    expect(lisLaLecture("")).toBeUndefined();
    expect(lisLaLecture("emulator-5554 device")).toBeUndefined();
  });
});

describe("scripts", () => {
  test("la lecture teste env.sh, puis le verrou du cron, puis adb", () => {
    const env = SCRIPT_D_ETAT.indexOf("env.sh");
    const verrou = SCRIPT_D_ETAT.indexOf("flock -n /tmp/s3s-upload.lock");
    const adb = SCRIPT_D_ETAT.indexOf("adb devices");
    expect(env).toBeGreaterThanOrEqual(0);
    expect(verrou).toBeGreaterThan(env);
    expect(adb).toBeGreaterThan(verrou);
  });
  test("l'ouverture garde le processus en vie et sort l'emulateur du groupe", () => {
    expect(SCRIPT_D_OUVERTURE).toContain("exec setsid -w");
    expect(SCRIPT_D_OUVERTURE).toContain("boot-window.sh");
    expect(SCRIPT_D_OUVERTURE).toContain(FICHIER_JOURNAL_EMULATEUR);
  });
  test("l'extinction synchronise avant d'eteindre Android", () => {
    expect(SCRIPT_D_EXTINCTION.indexOf("adb shell sync")).toBeGreaterThanOrEqual(0);
    expect(SCRIPT_D_EXTINCTION.indexOf("adb shell reboot -p")).toBeGreaterThan(
      SCRIPT_D_EXTINCTION.indexOf("adb shell sync"),
    );
  });
});

describe("boutonDEmulateur", () => {
  test("cache tant que rien n'est lu, ou sans SDK Android", () => {
    expect(boutonDEmulateur(etat({}), "arretee")).toEqual({ visible: false });
    expect(boutonDEmulateur(etat({ lecture: "absent" }), "arretee")).toEqual({ visible: false });
  });
  test("emulateur eteint, veille arretee : ouvrir", () => {
    expect(boutonDEmulateur(etat({ lecture: "eteint" }), "arretee")).toEqual({
      visible: true,
      libelle: "Ouvrir l'émulateur",
      actif: true,
      action: "ouvre",
    });
  });
  test("emulateur allume, veille arretee : eteindre", () => {
    expect(boutonDEmulateur(etat({ lecture: "allume" }), "arretee")).toEqual({
      visible: true,
      libelle: "Éteindre l'émulateur",
      actif: true,
      action: "eteint",
    });
  });
  test("veille en cours ou en arret : grise, avec la raison", () => {
    for (const statut of ["en-cours", "arret-demande"] as const) {
      expect(boutonDEmulateur(etat({ lecture: "eteint" }), statut)).toEqual({
        visible: true,
        libelle: "Ouvrir l'émulateur",
        actif: false,
        note: "Arrêter la veille d'abord.",
      });
    }
  });
  test("verrou du cron tenu : grise, avec la raison", () => {
    expect(boutonDEmulateur(etat({ lecture: "verrou" }), "arretee")).toEqual({
      visible: true,
      libelle: "Ouvrir l'émulateur",
      actif: false,
      note: "Une synchro du cron est en cours.",
    });
  });
  test("operation en cours : grise, quel que soit le reste", () => {
    expect(boutonDEmulateur(etat({ lecture: "eteint", operation: "ouverture" }), "arretee")).toEqual({
      visible: true,
      libelle: "Démarrage…",
      actif: false,
    });
    expect(boutonDEmulateur(etat({ lecture: "allume", operation: "extinction" }), "en-cours")).toEqual({
      visible: true,
      libelle: "Extinction…",
      actif: false,
    });
  });
  test("une erreur passe en note quand rien ne bloque", () => {
    expect(boutonDEmulateur(etat({ lecture: "eteint", erreur: "Échec." }), "arretee")).toEqual({
      visible: true,
      libelle: "Ouvrir l'émulateur",
      actif: true,
      action: "ouvre",
      note: "Échec.",
    });
  });
});
