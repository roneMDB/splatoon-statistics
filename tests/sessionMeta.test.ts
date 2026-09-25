import { describe, expect, test } from "vitest";
import {
  isSessionType,
  parseSessionType,
  promptSessionMeta,
  SESSION_TYPES,
} from "../src/sessionMeta.ts";

/** Repond aux questions dans l'ordre, et retient ce qui a ete demande. */
const scriptedAsk = (answers: string[]) => {
  const asked: string[] = [];
  const ask = async (question: string) => {
    asked.push(question);
    const answer = answers.shift();
    if (answer === undefined) {
      throw new Error(`Question inattendue : ${question}`);
    }
    return answer;
  };
  return { ask, asked };
};

describe("isSessionType", () => {
  test("accepte les quatre valeurs de la liste fermee", () => {
    expect(SESSION_TYPES).toEqual(["intra", "scrim", "compet", "open", "autre"]);
    for (const value of SESSION_TYPES) {
      expect(isSessionType(value)).toBe(true);
    }
  });

  test("refuse une valeur hors liste", () => {
    expect(isSessionType("tournoi")).toBe(false);
    expect(isSessionType("")).toBe(false);
  });
});

describe("parseSessionType", () => {
  test("accepte une valeur de la liste fermee", () => {
    for (const value of SESSION_TYPES) {
      expect(parseSessionType(value)).toBe(value);
    }
  });

  test("traite une valeur absente ou vide comme aucun type, tel que les appelants actuels l'attendent", () => {
    expect(parseSessionType(undefined)).toBeUndefined();
    expect(parseSessionType("")).toBeUndefined();
  });

  test("refuse une valeur hors liste, avec le mot du contexte de l'appelant dans le message", () => {
    expect(() => parseSessionType("tournoi", "--type")).toThrow(
      /Valeur de --type inconnue : "tournoi"\. Valeurs acceptees : intra, scrim, compet, open, autre/,
    );
    expect(() => parseSessionType("tournoi", "type")).toThrow(
      /Valeur de type inconnue : "tournoi"\. Valeurs acceptees : intra, scrim, compet, open, autre/,
    );
  });

  test("utilise \"type\" par defaut quand aucun mot de contexte n'est fourni", () => {
    expect(() => parseSessionType("tournoi")).toThrow(/Valeur de type inconnue/);
  });
});

describe("promptSessionMeta", () => {
  test("retient le nom puis le type saisis", async () => {
    const { ask } = scriptedAsk(["Scrim contre Les Corsaires", "scrim"]);
    expect(await promptSessionMeta(ask)).toEqual({
      name: "Scrim contre Les Corsaires",
      type: "scrim",
    });
  });

  test("nettoie les espaces autour des reponses", async () => {
    const { ask } = scriptedAsk(["  Intra Équipe A vs Équipe N  ", "  INTRA  "]);
    expect(await promptSessionMeta(ask)).toEqual({
      name: "Intra Équipe A vs Équipe N",
      type: "intra",
    });
  });

  test("un nom vide arrete le dialogue sans demander le type", async () => {
    const { ask, asked } = scriptedAsk(["   "]);
    expect(await promptSessionMeta(ask)).toEqual({});
    expect(asked).toHaveLength(1);
  });

  test("une reponse vide au type laisse la session sans type", async () => {
    const { ask } = scriptedAsk(["Match EBTV", ""]);
    expect(await promptSessionMeta(ask)).toEqual({ name: "Match EBTV" });
  });

  test("repose la question tant que le type est invalide", async () => {
    const { ask, asked } = scriptedAsk(["Match EBTV", "tournoi", "compet"]);
    expect(await promptSessionMeta(ask)).toEqual({
      name: "Match EBTV",
      type: "compet",
    });
    expect(asked).toHaveLength(3);
  });

  test("ne demande pas le type quand il est deja connu", async () => {
    const { ask, asked } = scriptedAsk(["Match EBTV"]);
    expect(await promptSessionMeta(ask, { type: "compet" })).toEqual({
      name: "Match EBTV",
      type: "compet",
    });
    expect(asked).toHaveLength(1);
  });
});

test("accepte le type open, pour les sessions en lobby ouvert", () => {
  expect(parseSessionType("open")).toBe("open");
});
