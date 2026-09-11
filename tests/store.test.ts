import { afterEach, describe, expect, test } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSessionFile, buildSessionFileName, writeSession } from "../src/store.ts";
import { buildWindow } from "../src/window.ts";
import type { StatinkBattle } from "../src/statink/types.ts";

const window = buildWindow("2026-08-19 16:00", "2026-08-19 18:00");

const battle = (uuid: string, iso: string) =>
  ({
    id: uuid,
    uuid,
    url: `https://stat.ink/@Gloup/spl3/${uuid}`,
    lobby: { key: "private" },
    start_at: { time: Date.parse(iso) / 1000, iso8601: iso },
    // Un champ que le code ne connait pas : il doit survivre au stockage.
    champ_inconnu: { profond: 42 },
  }) as unknown as StatinkBattle;

const dirs: string[] = [];
const tempDir = async () => {
  const dir = await mkdtemp(join(tmpdir(), "splat-store-"));
  dirs.push(dir);
  return dir;
};
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("buildSessionFileName", () => {
  test("compose un nom deterministe depuis le pseudo et la fenetre locale", () => {
    expect(buildSessionFileName("Gloup", window)).toBe(
      "Gloup_20260819-1600_20260819-1800.json",
    );
  });

  test("assainit un pseudo contenant des caracteres interdits", () => {
    expect(buildSessionFileName("a/b c", window)).toMatch(/^a-b-c_/);
  });
});

describe("buildSessionFile", () => {
  test("decrit la provenance, la fenetre et le nombre de matchs", () => {
    const file = buildSessionFile({
      user: "Gloup",
      window,
      filters: { lobby: "private" },
      battles: [battle("a", "2026-08-19T15:00:00Z")],
      fetchedAt: new Date("2026-08-19T17:34:00Z"),
    });
    expect(file.source).toBe("stat.ink");
    expect(file.user).toBe("Gloup");
    expect(file.fetchedAt).toBe("2026-08-19T17:34:00.000Z");
    expect(file.window).toEqual({
      from: "2026-08-19T14:00:00.000Z",
      to: "2026-08-19T16:00:00.000Z",
    });
    expect(file.filters).toEqual({ lobby: "private" });
    expect(file.battleCount).toBe(1);
  });

  test("garde les matchs strictement intacts", () => {
    const original = battle("a", "2026-08-19T15:00:00Z");
    const file = buildSessionFile({
      user: "Gloup",
      window,
      battles: [original],
      fetchedAt: new Date("2026-08-19T17:34:00Z"),
    });
    expect(file.battles[0]).toEqual(original);
  });

  test("omet les filtres vides plutot que d'ecrire des undefined", () => {
    const file = buildSessionFile({
      user: "Gloup",
      window,
      filters: { lobby: undefined },
      battles: [],
      fetchedAt: new Date("2026-08-19T17:34:00Z"),
    });
    expect(file.filters).toEqual({});
  });
});

describe("writeSession", () => {
  test("ecrit le fichier et renvoie son chemin", async () => {
    const dir = await tempDir();
    const file = buildSessionFile({
      user: "Gloup",
      window,
      battles: [battle("a", "2026-08-19T15:00:00Z")],
      fetchedAt: new Date("2026-08-19T17:34:00Z"),
    });
    const path = await writeSession(file, dir);
    expect(path).toBe(join(dir, "Gloup_20260819-1600_20260819-1800.json"));
    const written = JSON.parse(await readFile(path, "utf8"));
    expect(written.battleCount).toBe(1);
    expect(written.battles[0].champ_inconnu.profond).toBe(42);
  });

  test("cree le dossier de sortie s'il n'existe pas", async () => {
    const dir = join(await tempDir(), "sous", "dossier");
    const file = buildSessionFile({
      user: "Gloup",
      window,
      battles: [],
      fetchedAt: new Date("2026-08-19T17:34:00Z"),
    });
    const path = await writeSession(file, dir);
    await expect(readFile(path, "utf8")).resolves.toContain('"battleCount": 0');
  });

  test("ecrit un JSON indente et termine par un retour a la ligne", async () => {
    const dir = await tempDir();
    const file = buildSessionFile({
      user: "Gloup",
      window,
      battles: [],
      fetchedAt: new Date("2026-08-19T17:34:00Z"),
    });
    const content = await readFile(await writeSession(file, dir), "utf8");
    expect(content).toContain('\n  "user": "Gloup"');
    expect(content.endsWith("\n")).toBe(true);
  });
});
