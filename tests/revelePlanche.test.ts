import { describe, expect, test } from "vitest";
import { saitOuvrirExplorer } from "../src/revelePlanche.ts";

describe("saitOuvrirExplorer", () => {
  const presents =
    (...fichiers: string[]) =>
    (f: string) =>
      fichiers.includes(f);

  const PATH = "/usr/local/bin:/usr/bin:/mnt/c/WINDOWS";

  test("accepte quand explorer.exe est dans le PATH", () => {
    expect(saitOuvrirExplorer({ PATH }, presents("/mnt/c/WINDOWS/explorer.exe"))).toBe(true);
  });

  test("refuse quand explorer.exe est absent, comme sur une distribution sans interop Windows", () => {
    expect(saitOuvrirExplorer({ PATH }, presents("/usr/bin/autre-chose"))).toBe(false);
  });

  test("refuse quand le PATH est vide ou absent", () => {
    expect(saitOuvrirExplorer({ PATH: "" }, presents("/mnt/c/WINDOWS/explorer.exe"))).toBe(false);
    expect(saitOuvrirExplorer({}, presents("/mnt/c/WINDOWS/explorer.exe"))).toBe(false);
  });

  test("ignore les entrees vides du PATH", () => {
    expect(
      saitOuvrirExplorer(
        { PATH: "::/mnt/c/WINDOWS:" },
        presents("/mnt/c/WINDOWS/explorer.exe"),
      ),
    ).toBe(true);
  });
});
