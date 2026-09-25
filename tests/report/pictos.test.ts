import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { chargeLesPictos, clesDeLaSession, cleSure } from "../../src/report/pictos.ts";
import type { SessionFile } from "../../src/store.ts";
import type { StatinkBattle } from "../../src/statink/types.ts";

const session = (battles: Partial<StatinkBattle>[]): SessionFile =>
  ({
    source: "stat.ink",
    user: "Gloup",
    fetchedAt: "2026-09-11T21:30:44.274Z",
    window: { from: "2026-09-11T18:00:00.000Z", to: "2026-09-11T21:01:00.000Z" },
    filters: {},
    battleCount: battles.length,
    battles,
  }) as SessionFile;

const manche = session([
  {
    lobby: { key: "private" },
    rule: { key: "tricolor" },
    stage: { key: "masaba" },
    our_team_members: [
      { weapon: { key: "nzap89", sub: { key: "robotbomb" }, special: { key: "decoy" } } },
    ],
    their_team_members: [{ weapon: { key: "../../etc/passwd" } }],
  } as unknown as StatinkBattle,
]);

describe("cleSure", () => {
  test("accepte une cle stat.ink, refuse tout ce qui pourrait sortir du dossier ou du HTML", () => {
    expect(cleSure("nzap89")).toBe(true);
    expect(cleSure("bankara_open")).toBe(true);
    expect(cleSure("../x")).toBe(false);
    expect(cleSure('a"b')).toBe(false);
    expect(cleSure("")).toBe(false);
    expect(cleSure(undefined)).toBe(false);
  });
});

test("clesDeLaSession reunit les cles de toutes les categories, sans les cles hostiles", () => {
  const cles = clesDeLaSession(manche);
  expect([...(cles.get("armes") ?? [])]).toEqual(["nzap89"]);
  expect([...(cles.get("sous") ?? [])]).toEqual(["robotbomb"]);
  expect([...(cles.get("speciales") ?? [])]).toEqual(["decoy"]);
  expect([...(cles.get("regles") ?? [])]).toEqual(["tricolor"]);
  expect([...(cles.get("lobbies") ?? [])]).toEqual(["private"]);
  expect([...(cles.get("stages") ?? [])]).toEqual(["masaba"]);
  expect([...(cles.get("medailles") ?? [])]).toEqual(["or", "argent"]);
  expect([...(cles.get("polices") ?? [])]).toEqual(["titre", "texte"]);
});

describe("chargeLesPictos", () => {
  let dossier: string;

  beforeEach(async () => {
    dossier = await mkdtemp(join(tmpdir(), "pictos-"));
    for (const [chemin, contenu] of [
      ["armes/nzap89.png", "png-nzap"],
      ["armes/splattershot.png", "png-inutile"],
      ["regles/tricolor.png", "png-tricolore"],
      ["lobbies/private.svg", "<svg/>"],
      ["polices/titre.woff2", "woff"],
    ] as const) {
      await mkdir(join(dossier, chemin, ".."), { recursive: true });
      await writeFile(join(dossier, chemin), contenu);
    }
  });

  afterEach(async () => {
    await rm(dossier, { recursive: true, force: true });
  });

  test("rend chaque picto present en URI data, avec son type", async () => {
    const pictos = await chargeLesPictos(manche, dossier);

    expect(pictos("armes", "nzap89")).toBe(
      `data:image/png;base64,${Buffer.from("png-nzap").toString("base64")}`,
    );
    // La tricolore est un PNG la ou les autres regles sont des SVG.
    expect(pictos("regles", "tricolor")).toMatch(/^data:image\/png;base64,/);
    expect(pictos("lobbies", "private")).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(pictos("polices", "titre")).toMatch(/^data:font\/woff2;base64,/);
  });

  test("ne lit que ce que la session utilise", async () => {
    const pictos = await chargeLesPictos(manche, dossier);
    expect(pictos("armes", "splattershot")).toBeUndefined();
  });

  test("un picto absent manque sans faire echouer le chargement", async () => {
    const pictos = await chargeLesPictos(manche, dossier);
    expect(pictos("sous", "robotbomb")).toBeUndefined();
    expect(pictos("stages", "masaba")).toBeUndefined();
  });

  test("un dossier inexistant donne une planche sans pictos, pas une erreur", async () => {
    const pictos = await chargeLesPictos(manche, join(dossier, "absent"));
    expect(pictos("armes", "nzap89")).toBeUndefined();
  });
});
