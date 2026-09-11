import { describe, expect, test } from "vitest";
import { parseCliArgs } from "../src/cli.ts";

describe("parseCliArgs", () => {
  test("lit la fenetre depuis --from et --to", () => {
    const options = parseCliArgs([
      "--from",
      "2026-08-18 20:00",
      "--to",
      "2026-08-18 23:30",
    ]);
    expect(options.window.fromMs).toBe(Date.UTC(2026, 7, 18, 18, 0, 0));
    expect(options.window.toMs).toBe(Date.UTC(2026, 7, 18, 21, 30, 0));
  });

  test("utilise Gloup comme compte par defaut", () => {
    expect(parseCliArgs(["--from", "2026-08-18 20:00"]).user).toBe("Gloup");
  });

  test("accepte un autre compte via --user", () => {
    const options = parseCliArgs(["--from", "2026-08-18 20:00", "--user", "Autre"]);
    expect(options.user).toBe("Autre");
  });

  test("transmet --lobby comme filtre serveur", () => {
    const options = parseCliArgs([
      "--from",
      "2026-08-18 20:00",
      "--lobby",
      "private",
    ]);
    expect(options.filters.lobby).toBe("private");
  });

  test("ne pose aucun filtre de lobby par defaut", () => {
    expect(parseCliArgs(["--from", "2026-08-18 20:00"]).filters.lobby).toBeUndefined();
  });

  test("utilise data/sessions comme dossier de sortie par defaut", () => {
    expect(parseCliArgs(["--from", "2026-08-18 20:00"]).outDir).toBe("data/sessions");
  });

  test("accepte un dossier de sortie via --out", () => {
    const options = parseCliArgs(["--from", "2026-08-18 20:00", "--out", "/tmp/x"]);
    expect(options.outDir).toBe("/tmp/x");
  });

  test("accepte un plafond de pages via --max-pages", () => {
    const options = parseCliArgs(["--from", "2026-08-18 20:00", "--max-pages", "5"]);
    expect(options.maxPages).toBe(5);
  });

  test("exige --from", () => {
    expect(() => parseCliArgs([])).toThrow(/--from/);
  });

  test("refuse un --max-pages non numerique", () => {
    expect(() =>
      parseCliArgs(["--from", "2026-08-18 20:00", "--max-pages", "beaucoup"]),
    ).toThrow(/--max-pages/);
  });

  test("refuse une valeur de lobby inconnue", () => {
    expect(() =>
      parseCliArgs(["--from", "2026-08-18 20:00", "--lobby", "salon"]),
    ).toThrow(/lobby/i);
  });

  test("propage l'erreur de format d'une date invalide", () => {
    expect(() => parseCliArgs(["--from", "hier soir"])).toThrow(/YYYY-MM-DD HH:mm/);
  });

  test("refuse une option inconnue", () => {
    expect(() => parseCliArgs(["--from", "2026-08-18 20:00", "--zoom"])).toThrow();
  });
});
