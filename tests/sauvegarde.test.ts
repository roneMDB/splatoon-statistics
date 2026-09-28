import { mkdir, mkdtemp, readdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  creeLaSauvegarde,
  destinationDeSauvegarde,
  sauvegarde,
  SOUS_DOSSIER_DE_SAUVEGARDE,
} from "../src/sauvegarde.ts";

let racine: string;
let travail: string;
let sessions: string;
let reglages: string;
let cible: string;

beforeEach(async () => {
  racine = await mkdtemp(join(tmpdir(), "sauvegarde-"));
  travail = join(racine, "travail");
  sessions = join(travail, "data", "sessions");
  reglages = join(travail, "settings.json");
  cible = join(racine, "cible");
  await mkdir(sessions, { recursive: true });
  await writeFile(reglages, '{ "utilisateur": "Bloup" }\n');
  await writeFile(join(sessions, "Gloup_a.json"), "{}");
  await writeFile(join(sessions, "Gloup_b.json"), "{}");
  await writeFile(join(sessions, ".resumes.json"), "{}");
});

afterEach(async () => {
  vi.useRealTimers();
  await rm(racine, { recursive: true, force: true });
});

const options = () => ({ destination: { chemin: cible }, cheminReglages: reglages, dossierSessions: sessions });

describe("destinationDeSauvegarde", () => {
  test("un dossier saisi est pris tel quel, sans exiger qu'il existe", () => {
    expect(destinationDeSauvegarde(" /ailleurs ", "/home/moi")).toEqual({ chemin: "/ailleurs" });
  });

  test("vide : Mon Drive sous le dossier personnel, qui doit exister", () => {
    expect(destinationDeSauvegarde("", "/home/moi", () => false)).toEqual({
      chemin: join("/home/moi", "Mon Drive", SOUS_DOSSIER_DE_SAUVEGARDE),
      racineAttendue: join("/home/moi", "Mon Drive"),
    });
  });

  test("vide, sur un Drive en anglais : My Drive", () => {
    const existe = (chemin: string) => chemin.endsWith("My Drive");
    expect(destinationDeSauvegarde("", "/home/moi", existe).racineAttendue).toBe(join("/home/moi", "My Drive"));
  });
});

describe("sauvegarde", () => {
  test("copie les reglages et les sessions, pas le cache des resumes", async () => {
    const bilan = await sauvegarde(options());

    expect(bilan).toMatchObject({ destination: cible, copies: 3, inchanges: 0 });
    expect(await readFile(join(cible, "settings.json"), "utf8")).toContain("Bloup");
    expect((await readdir(join(cible, "data", "sessions"))).sort()).toEqual(["Gloup_a.json", "Gloup_b.json"]);
  });

  test("une seconde passe sans changement ne recopie rien", async () => {
    await sauvegarde(options());
    expect(await sauvegarde(options())).toMatchObject({ copies: 0, inchanges: 3 });
  });

  test("recopie un fichier modifie", async () => {
    await sauvegarde(options());
    const chemin = join(sessions, "Gloup_a.json");
    await writeFile(chemin, '{ "name": "scrim" }');
    const plusTard = new Date((await stat(chemin)).mtimeMs + 10_000);
    await utimes(chemin, plusTard, plusTard);

    expect(await sauvegarde(options())).toMatchObject({ copies: 1, inchanges: 2 });
    expect(await readFile(join(cible, "data", "sessions", "Gloup_a.json"), "utf8")).toContain("scrim");
  });

  test("ne supprime jamais rien a la destination", async () => {
    await sauvegarde(options());
    await rm(join(sessions, "Gloup_b.json"));

    await sauvegarde(options());
    expect(existsSync(join(cible, "data", "sessions", "Gloup_b.json"))).toBe(true);
  });

  test("sans Google Drive, echoue sans creer de dossier", async () => {
    const destination = destinationDeSauvegarde("", racine);
    await expect(sauvegarde({ ...options(), destination })).rejects.toThrow(/Google Drive introuvable/);
    expect(existsSync(join(racine, "Mon Drive"))).toBe(false);
  });

  test("avec Google Drive, cree son sous-dossier", async () => {
    await mkdir(join(racine, "Mon Drive"));
    const destination = destinationDeSauvegarde("", racine);
    await sauvegarde({ ...options(), destination });
    expect(existsSync(join(racine, "Mon Drive", SOUS_DOSSIER_DE_SAUVEGARDE, "settings.json"))).toBe(true);
  });

  test("un dossier de sessions absent n'est pas une erreur", async () => {
    await rm(sessions, { recursive: true });
    expect(await sauvegarde(options())).toMatchObject({ copies: 1 });
  });
});

describe("creeLaSauvegarde", () => {
  const cree = (automatique = true) =>
    creeLaSauvegarde({ ...options(), automatique, fichierDEtat: join(travail, ".derniere-sauvegarde.json") });

  test("des demandes rapprochees ne donnent qu'une copie, apres le delai", async () => {
    vi.useFakeTimers();
    const copie = cree();
    copie.demande();
    await vi.advanceTimersByTimeAsync(3000);
    copie.demande();
    copie.demande();
    await vi.advanceTimersByTimeAsync(3000);
    expect(existsSync(cible)).toBe(false);
    expect(copie.enAttente()).toBe(true);

    vi.useRealTimers();
    await copie.lanceMaintenant();
    const etat = await copie.etat();
    expect(etat.derniere).toMatchObject({ copies: 3 });
    expect(copie.enAttente()).toBe(false);
  });

  test("la copie part seule une fois le delai ecoule", async () => {
    vi.useFakeTimers();
    const copie = cree();
    copie.demande();
    await vi.advanceTimersByTimeAsync(5000);
    vi.useRealTimers();
    await vi.waitFor(() => expect(copie.enAttente()).toBe(false));
    expect(existsSync(join(cible, "settings.json"))).toBe(true);
  });

  test("une demande pendant une copie en relance une a la fin", async () => {
    const copie = cree();
    const premiere = copie.lanceMaintenant();
    await writeFile(join(sessions, "Gloup_c.json"), "{}");
    const seconde = copie.lanceMaintenant();
    expect(seconde).toBe(premiere);
    await seconde;
    expect(existsSync(join(cible, "data", "sessions", "Gloup_c.json"))).toBe(true);
  });

  test("hors mode automatique, une demande ne fait rien ; le bouton si", async () => {
    vi.useFakeTimers();
    const copie = cree(false);
    copie.demande();
    expect(copie.enAttente()).toBe(false);
    vi.useRealTimers();
    await copie.lanceMaintenant();
    expect(existsSync(join(cible, "settings.json"))).toBe(true);
  });

  test("une copie faite vers un autre dossier ne compte pas comme derniere sauvegarde", async () => {
    await cree().lanceMaintenant();
    const ailleurs = creeLaSauvegarde({
      ...options(),
      destination: { chemin: join(racine, "ailleurs") },
      automatique: true,
      fichierDEtat: join(travail, ".derniere-sauvegarde.json"),
    });
    expect((await ailleurs.etat()).derniere).toBeUndefined();
  });

  test("un echec est garde pour l'ecran, puis efface par une copie reussie", async () => {
    const copie = creeLaSauvegarde({
      ...options(),
      destination: destinationDeSauvegarde("", racine),
      automatique: true,
      fichierDEtat: join(travail, ".derniere-sauvegarde.json"),
    });
    await copie.lanceMaintenant();
    const echec = await copie.etat();
    expect(echec.erreur).toMatch(/Google Drive introuvable/);
    expect(echec.derniere).toBeUndefined();

    await mkdir(join(racine, "Mon Drive"));
    await copie.lanceMaintenant();
    const reprise = await copie.etat();
    expect(reprise.erreur).toBeUndefined();
    expect(reprise.derniere).toMatchObject({ copies: 3 });
  });
});
