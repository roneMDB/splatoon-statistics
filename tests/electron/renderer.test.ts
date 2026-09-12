import { describe, expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/**
 * Le rendu n'est ni transpile ni type : rien ne rattrape un identifiant mal
 * orthographie, qui se traduirait a l'execution par un `null` silencieux puis
 * un « Cannot read properties of null » au premier clic. Ces tests relient le
 * script au document.
 */
const lis = (nom: string) =>
  readFile(fileURLToPath(new URL(`../../src/electron/renderer/${nom}`, import.meta.url)), "utf8");

const html = await lis("index.html");
const script = await lis("renderer.js");

/** Identifiants declares dans le document. */
const idsDuDocument = new Set(
  [...html.matchAll(/\bid="([^"]+)"/g)].map((trouve) => trouve[1] as string),
);

/** Identifiants que le script va chercher. */
const idsDemandes = [
  ...script.matchAll(/getElementById\("([^"]+)"\)/g),
].map((trouve) => trouve[1] as string);

describe("cablage du rendu", () => {
  test("chaque getElementById du script vise un id du document", () => {
    for (const id of idsDemandes) {
      expect(idsDuDocument.has(id), `l'id "${id}" est demandé par renderer.js mais absent du HTML`).toBe(true);
    }
  });

  test("le script va bien chercher les elements du compte rendu", () => {
    for (const id of [
      "fiche-objectif",
      "fiche-ressenti",
      "compte-rendu-sections",
      "compte-rendu-texte",
      "compte-rendu-apercu",
      "compte-rendu-onglets",
      "onglet-apercu",
      "onglet-markdown",
      "bouton-generer",
      "bouton-copier",
    ]) {
      expect(idsDemandes).toContain(id);
    }
  });

  test("le script va bien chercher les elements de la vue manche", () => {
    for (const id of [
      "vue-manche",
      "manche-position",
      "manche-resume",
      "manche-medailles",
      "manche-equipes",
      "bouton-manche-precedente",
      "bouton-manche-suivante",
      "bouton-manche-retour",
      "bouton-manche-statink",
    ]) {
      expect(idsDemandes).toContain(id);
    }
  });

  test("chaque vue est masquee ou montree par montreLaVue", () => {
    // Une vue ajoutee au HTML mais oubliee dans montreLaVue resterait affichee
    // par-dessus les autres, ou invisible pour toujours.
    const vues = [...html.matchAll(/\bid="(vue-[^"]+)"/g)].map((t) => t[1] as string);
    expect(vues.length).toBeGreaterThan(1);

    const corps = /function montreLaVue\([\s\S]*?\n\}/.exec(script)?.[0] ?? "";
    for (const id of vues) {
      const propriete = new RegExp(`(\\w+):\\s*document\\.getElementById\\("${id}"\\)`).exec(
        script,
      )?.[1];
      expect(propriete, `la vue "${id}" n'est jamais recuperee`).toBeDefined();
      expect(
        corps.includes(`elements.${propriete}`),
        `la vue "${id}" n'est pas geree par montreLaVue`,
      ).toBe(true);
    }
  });

  test("chaque bouton du document est branche par le script", () => {
    // Les boutons de soumission sont branches par le `submit` du formulaire,
    // pas par un ecouteur de clic : on ne les attend pas ici.
    const boutons = [...html.matchAll(/<button([^>]*)id="(bouton-[^"]+)"([^>]*)>/g)]
      .filter((trouve) => !`${trouve[1]}${trouve[3]}`.includes('type="submit"'))
      .map((trouve) => trouve[2] as string);
    expect(boutons.length).toBeGreaterThan(0);

    for (const id of boutons) {
      // Le script nomme ses elements en camelCase ; on remonte donc au
      // getElementById puis a la propriete qui le porte.
      const declaration = new RegExp(`(\\w+):\\s*document\\.getElementById\\("${id}"\\)`).exec(
        script,
      );
      expect(declaration, `le bouton "${id}" n'est jamais recupere par renderer.js`).not.toBeNull();

      const propriete = declaration?.[1];
      expect(
        new RegExp(`elements\\.${propriete}\\.addEventListener`).test(script),
        `le bouton "${id}" est recupere mais n'ecoute aucun evenement`,
      ).toBe(true);
    }
  });

  test("le compte rendu ne peut pas etre copie avant d'avoir ete genere", () => {
    expect(html).toMatch(/id="bouton-copier"[\s\S]{0,80}disabled/);
  });

  test("la politique de securite du document reste fermee", () => {
    // Le compte rendu n'ajoute aucune ressource distante : la CSP ne doit pas
    // avoir ete relachee au passage.
    expect(html).toContain("default-src 'none'; style-src 'self'; script-src 'self';");
  });
});
