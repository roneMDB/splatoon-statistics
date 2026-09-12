import { describe, expect, test } from "vitest";
import { estUneUrlStatink, saitOuvrirUnLien } from "../src/lienExterne.ts";

describe("estUneUrlStatink", () => {
  test("accepte une url de match stat.ink", () => {
    expect(estUneUrlStatink("https://stat.ink/@Gloup/spl3/338b0431")).toBe(true);
  });

  test("refuse un autre domaine", () => {
    expect(estUneUrlStatink("https://exemple.test/phishing")).toBe(false);
  });

  test("refuse un schema local, qui ouvrirait un fichier de la machine", () => {
    expect(estUneUrlStatink("file:///etc/passwd")).toBe(false);
  });

  test("refuse un domaine qui imite stat.ink", () => {
    expect(estUneUrlStatink("https://stat.ink.exemple.test/x")).toBe(false);
    expect(estUneUrlStatink("https://notstat.ink/x")).toBe(false);
  });

  test("refuse ce qui n'est pas une url", () => {
    expect(estUneUrlStatink("pas une url")).toBe(false);
    expect(estUneUrlStatink("")).toBe(false);
  });
});

describe("saitOuvrirUnLien", () => {
  const presents =
    (...fichiers: string[]) =>
    (f: string) =>
      fichiers.includes(f);

  const PATH = "/usr/local/bin:/usr/bin";
  const xdg = "/usr/bin/xdg-open";

  test("accepte quand xdg-open et un navigateur sont la", () => {
    expect(saitOuvrirUnLien("linux", { PATH }, presents(xdg, "/usr/bin/firefox"))).toBe(true);
  });

  test("refuse quand xdg-open est absent, comme sur une WSL minimale", () => {
    expect(saitOuvrirUnLien("linux", { PATH }, presents("/usr/bin/firefox"))).toBe(false);
  });

  test("refuse quand xdg-open est la mais qu'aucun navigateur ne l'est", () => {
    // Le cas normal sous WSL : le navigateur vit du cote Windows. xdg-open se
    // lance, echoue avec « no method available », et personne n'en sait rien.
    expect(saitOuvrirUnLien("linux", { PATH }, presents(xdg))).toBe(false);
  });

  test("accepte wslview, qui fait le pont vers le navigateur Windows", () => {
    expect(saitOuvrirUnLien("linux", { PATH }, presents(xdg, "/usr/bin/wslview"))).toBe(true);
  });

  test("accepte x-www-browser, sous lequel wslview s'enregistre", () => {
    expect(saitOuvrirUnLien("linux", { PATH }, presents(xdg, "/usr/bin/x-www-browser"))).toBe(
      true,
    );
  });

  test("fait confiance a BROWSER quand il est renseigne", () => {
    // xdg-open l'essaie en premier : un utilisateur qui l'a pose sait ce qu'il fait.
    expect(
      saitOuvrirUnLien(
        "linux",
        { PATH, BROWSER: "/mnt/c/.../vivaldi.exe" },
        presents(xdg),
      ),
    ).toBe(true);
  });

  test("ignore un BROWSER vide ou fait d'espaces", () => {
    expect(saitOuvrirUnLien("linux", { PATH, BROWSER: "   " }, presents(xdg))).toBe(false);
  });

  test("ne compte pas sensible-browser, qui ne fait que deleguer", () => {
    expect(
      saitOuvrirUnLien("linux", { PATH }, presents(xdg, "/usr/bin/sensible-browser")),
    ).toBe(false);
  });

  test("refuse quand le PATH est vide ou absent", () => {
    expect(saitOuvrirUnLien("linux", { PATH: "" }, presents(xdg))).toBe(false);
    expect(saitOuvrirUnLien("linux", {}, presents(xdg))).toBe(false);
  });

  test("ne cherche rien ailleurs que sous Linux : le systeme sait le faire", () => {
    expect(saitOuvrirUnLien("darwin", {}, presents())).toBe(true);
    expect(saitOuvrirUnLien("win32", {}, presents())).toBe(true);
  });

  test("ignore les entrees vides du PATH", () => {
    expect(
      saitOuvrirUnLien("linux", { PATH: "::/usr/bin:" }, presents(xdg, "/usr/bin/firefox")),
    ).toBe(true);
  });
});
