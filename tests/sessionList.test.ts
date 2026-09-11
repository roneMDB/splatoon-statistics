import { afterEach, describe, expect, test } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  listSessions,
  summarizeSessionFile,
  tallyResults,
} from "../src/sessionList.ts";
import { buildSessionFile, writeSession } from "../src/store.ts";
import { buildWindow } from "../src/window.ts";
import type { StatinkBattle } from "../src/statink/types.ts";

/** Match minimal : seul le resultat compte pour le bilan. */
const battle = (uuid: string, result: string) =>
  ({
    id: uuid,
    uuid,
    url: `https://stat.ink/@Gloup/spl3/${uuid}`,
    lobby: { key: "private" },
    result,
    start_at: { time: 1_755_000_000, iso8601: "2026-08-12T12:00:00+00:00" },
  }) as unknown as StatinkBattle;

const dirs: string[] = [];
const tempDir = async () => {
  const dir = await mkdtemp(join(tmpdir(), "splat-list-"));
  dirs.push(dir);
  return dir;
};
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

/** Ecrit une vraie session, par les memes fonctions que la CLI. */
async function ecrisSession(
  dir: string,
  options: {
    user?: string;
    name?: string;
    type?: "intra" | "scrim" | "compet" | "autre";
    from: string;
    to: string;
    battles?: StatinkBattle[];
  },
) {
  return writeSession(
    buildSessionFile({
      user: options.user ?? "Gloup",
      name: options.name,
      type: options.type,
      window: buildWindow(options.from, options.to),
      battles: options.battles ?? [],
      fetchedAt: new Date("2026-08-19T17:34:00Z"),
    }),
    dir,
  );
}

describe("tallyResults", () => {
  test("compte les victoires, defaites et egalites", () => {
    expect(
      tallyResults([
        battle("a", "win"),
        battle("b", "lose"),
        battle("c", "win"),
        battle("d", "draw"),
      ]),
    ).toEqual({ win: 2, lose: 1, draw: 1 });
  });

  test("rend un bilan a zero pour une session vide", () => {
    expect(tallyResults([])).toEqual({ win: 0, lose: 0, draw: 0 });
  });

  test("ignore un resultat absent ou inconnu plutot que de le compter", () => {
    const sansResultat = { uuid: "x" } as unknown as StatinkBattle;
    expect(tallyResults([sansResultat, battle("y", "exempted_lose")])).toEqual({
      win: 0,
      lose: 0,
      draw: 0,
    });
  });
});

describe("summarizeSessionFile", () => {
  test("retient les metadonnees et le bilan, jamais les matchs", () => {
    const file = buildSessionFile({
      user: "Gloup",
      name: "Scrim contre Les Corsaires",
      type: "scrim",
      window: buildWindow("2026-08-19 16:00", "2026-08-19 18:00"),
      battles: [battle("a", "win"), battle("b", "lose")],
      fetchedAt: new Date("2026-08-19T17:34:00Z"),
    });

    const resume = summarizeSessionFile(file, "/tmp/x.json");

    expect(resume).toEqual({
      path: "/tmp/x.json",
      user: "Gloup",
      name: "Scrim contre Les Corsaires",
      type: "scrim",
      fetchedAt: "2026-08-19T17:34:00.000Z",
      window: {
        from: "2026-08-19T14:00:00.000Z",
        to: "2026-08-19T16:00:00.000Z",
      },
      battleCount: 2,
      results: { win: 1, lose: 1, draw: 0 },
    });
    expect(resume).not.toHaveProperty("battles");
  });

  test("omet le nom et le type quand la session n'en a pas", () => {
    const file = buildSessionFile({
      user: "Gloup",
      window: buildWindow("2026-08-19 16:00", "2026-08-19 18:00"),
      battles: [],
      fetchedAt: new Date("2026-08-19T17:34:00Z"),
    });

    const resume = summarizeSessionFile(file, "/tmp/x.json");

    expect(resume.name).toBeUndefined();
    expect(resume.type).toBeUndefined();
  });
});

describe("listSessions", () => {
  test("rend une liste vide quand le dossier n'existe pas encore", async () => {
    const absent = join(await tempDir(), "jamais-cree");

    await expect(listSessions(absent)).resolves.toEqual({
      sessions: [],
      errors: [],
    });
  });

  test("resume chaque session ecrite sur disque", async () => {
    const dir = await tempDir();
    await ecrisSession(dir, {
      name: "Intra Équipe A vs Équipe N",
      type: "intra",
      from: "2026-08-19 20:00",
      to: "2026-08-19 22:00",
      battles: [battle("a", "win"), battle("b", "lose"), battle("c", "win")],
    });

    const { sessions, errors } = await listSessions(dir);

    expect(errors).toEqual([]);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.name).toBe("Intra Équipe A vs Équipe N");
    expect(sessions[0]?.type).toBe("intra");
    expect(sessions[0]?.battleCount).toBe(3);
    expect(sessions[0]?.results).toEqual({ win: 2, lose: 1, draw: 0 });
    expect(sessions[0]?.path).toMatch(/\.json$/);
  });

  test("classe la session la plus recente en premier", async () => {
    const dir = await tempDir();
    await ecrisSession(dir, { name: "veille", from: "2026-08-18 20:00", to: "2026-08-18 22:00" });
    await ecrisSession(dir, { name: "ce soir", from: "2026-08-20 20:00", to: "2026-08-20 22:00" });
    await ecrisSession(dir, { name: "avant-veille", from: "2026-08-17 20:00", to: "2026-08-17 22:00" });

    const { sessions } = await listSessions(dir);

    expect(sessions.map((session) => session.name)).toEqual([
      "ce soir",
      "veille",
      "avant-veille",
    ]);
  });

  test("signale un fichier illisible sans perdre les autres", async () => {
    const dir = await tempDir();
    await ecrisSession(dir, { name: "bonne", from: "2026-08-19 20:00", to: "2026-08-19 22:00" });
    await writeFile(join(dir, "casse.json"), "{ ceci n'est pas du JSON", "utf8");

    const { sessions, errors } = await listSessions(dir);

    expect(sessions.map((session) => session.name)).toEqual(["bonne"]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.path).toMatch(/casse\.json$/);
    expect(errors[0]?.message).not.toBe("");
  });

  test("signale un JSON valide qui n'est pas une session", async () => {
    const dir = await tempDir();
    await writeFile(join(dir, "intrus.json"), '{"quelque": "chose"}', "utf8");

    const { sessions, errors } = await listSessions(dir);

    expect(sessions).toEqual([]);
    expect(errors).toHaveLength(1);
  });

  test("ignore les fichiers qui ne sont pas des .json", async () => {
    const dir = await tempDir();
    await ecrisSession(dir, { name: "bonne", from: "2026-08-19 20:00", to: "2026-08-19 22:00" });
    await writeFile(join(dir, "notes.txt"), "rien a voir", "utf8");

    const { sessions, errors } = await listSessions(dir);

    expect(sessions).toHaveLength(1);
    expect(errors).toEqual([]);
  });
});
