import { describe, expect, test } from "vitest";
import {
  buildWindow,
  formatStatinkDateTime,
  isWithinWindow,
  parseLocalDateTime,
} from "../src/window.ts";

// TZ est fixe a Europe/Paris par vitest.config.ts.
// Le 19 aout 2026, Paris est en CEST (UTC+2).

describe("parseLocalDateTime", () => {
  test("parse YYYY-MM-DD HH:mm dans le fuseau local", () => {
    expect(parseLocalDateTime("2026-08-19 16:00")).toBe(
      Date.UTC(2026, 7, 19, 14, 0, 0),
    );
  });

  test("parse YYYY-MM-DD HH:mm:ss dans le fuseau local", () => {
    expect(parseLocalDateTime("2026-08-19 16:00:30")).toBe(
      Date.UTC(2026, 7, 19, 14, 0, 30),
    );
  });

  test("accepte un T comme separateur", () => {
    expect(parseLocalDateTime("2026-08-19T16:00")).toBe(
      Date.UTC(2026, 7, 19, 14, 0, 0),
    );
  });

  test("applique le decalage d'hiver hors heure d'ete", () => {
    // Le 15 janvier, Paris est en CET (UTC+1).
    expect(parseLocalDateTime("2026-01-15 16:00")).toBe(
      Date.UTC(2026, 0, 15, 15, 0, 0),
    );
  });

  test("rejette une date sans heure", () => {
    expect(() => parseLocalDateTime("2026-08-19")).toThrow(/YYYY-MM-DD HH:mm/);
  });

  test("rejette un mois inexistant", () => {
    expect(() => parseLocalDateTime("2026-13-19 16:00")).toThrow(/invalide/i);
  });

  test("rejette du texte libre", () => {
    expect(() => parseLocalDateTime("hier soir")).toThrow(/YYYY-MM-DD HH:mm/);
  });
});

describe("formatStatinkDateTime", () => {
  test("formate en YYYY-MM-DD hh:mm:ss dans le fuseau local", () => {
    // stat.ink interprete ces bornes dans le fuseau du profil consulte.
    expect(formatStatinkDateTime(Date.UTC(2026, 7, 19, 14, 0, 0))).toBe(
      "2026-08-19 16:00:00",
    );
  });

  test("zero-pad les composants a un chiffre", () => {
    expect(formatStatinkDateTime(Date.UTC(2026, 0, 5, 8, 7, 6))).toBe(
      "2026-01-05 09:07:06",
    );
  });
});

describe("buildWindow", () => {
  test("conserve les bornes demandees", () => {
    const w = buildWindow("2026-08-19 20:00", "2026-08-19 23:30");
    expect(w.fromMs).toBe(Date.UTC(2026, 7, 19, 18, 0, 0));
    expect(w.toMs).toBe(Date.UTC(2026, 7, 19, 21, 30, 0));
  });

  test("elargit la fenetre serveur de 24h de chaque cote", () => {
    const w = buildWindow("2026-08-19 20:00", "2026-08-19 23:30");
    const day = 24 * 60 * 60 * 1000;
    expect(w.paddedFromMs).toBe(w.fromMs - day);
    expect(w.paddedToMs).toBe(w.toMs + day);
  });

  test("utilise maintenant comme borne haute si --to est absent", () => {
    const before = Date.now();
    const w = buildWindow("2020-01-01 20:00", undefined);
    expect(w.toMs).toBeGreaterThanOrEqual(before);
    expect(w.toMs).toBeLessThanOrEqual(Date.now());
  });

  test("rejette une fenetre dont la fin precede le debut", () => {
    expect(() => buildWindow("2026-08-19 23:00", "2026-08-19 20:00")).toThrow(
      /apres/i,
    );
  });
});

describe("isWithinWindow", () => {
  const w = buildWindow("2026-08-19 16:00", "2026-08-19 18:00");
  // start_at.time de stat.ink est en secondes epoch, pas en millisecondes.
  const at = (utcHour: number, min: number) =>
    Date.UTC(2026, 7, 19, utcHour, min, 0) / 1000;

  test("inclut un match au milieu de la fenetre", () => {
    expect(isWithinWindow(at(15, 0), w)).toBe(true);
  });

  test("inclut les deux bornes", () => {
    expect(isWithinWindow(at(14, 0), w)).toBe(true);
    expect(isWithinWindow(at(16, 0), w)).toBe(true);
  });

  test("exclut une seconde avant le debut", () => {
    expect(isWithinWindow(at(14, 0) - 1, w)).toBe(false);
  });

  test("exclut une seconde apres la fin", () => {
    expect(isWithinWindow(at(16, 0) + 1, w)).toBe(false);
  });
});
