import { afterEach, describe, expect, test } from "vitest";
import { mkdir, mkdtemp, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  deleteSession,
  listSessions,
  readSession,
  summarizeSessionFile,
  tallyResults,
  updateSessionMeta,
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

describe("garde de chemin", () => {
  test("refuse un chemin hors du dossier des sessions", async () => {
    const dir = await tempDir();

    await expect(readSession("/etc/passwd.json", dir)).rejects.toThrow(/refuse/i);
    await expect(deleteSession("/etc/passwd.json", dir)).rejects.toThrow(/refuse/i);
  });

  test("refuse une evasion par ..", async () => {
    const dir = await tempDir();
    const evasion = join(dir, "..", "ailleurs.json");

    await expect(readSession(evasion, dir)).rejects.toThrow(/refuse/i);
  });

  test("refuse un fichier qui n'est pas un .json", async () => {
    const dir = await tempDir();

    await expect(readSession(join(dir, "notes.txt"), dir)).rejects.toThrow(/refuse/i);
  });

  test("refuse un lien symbolique qui pointe hors du dossier des sessions", async () => {
    const dir = await tempDir();
    const ailleurs = await tempDir();
    const cible = join(ailleurs, "secret.json");
    await writeFile(cible, '{"quelque":"chose"}', "utf8");
    const lien = join(dir, "session.json");
    await symlink(cible, lien);

    await expect(readSession(lien, dir)).rejects.toThrow(/refuse/i);
    await expect(deleteSession(lien, dir)).rejects.toThrow(/refuse/i);
  });

  test("refuse un lien symbolique pendouillant vers l'exterieur plutot que de tolerer l'absence de cible", async () => {
    const dir = await tempDir();
    const ailleurs = await tempDir();
    // La cible n'existe pas : realpath echouera en ENOENT. Un lien pendouillant
    // pointant hors du dossier ne doit pas franchir la garde pour autant -
    // sinon deleteSession supprimerait le lien sans jamais avoir verifie sa
    // cible, et une cible creee apres coup (TOCTOU) serait lue ou supprimee
    // sans etre interceptee.
    const cible = join(ailleurs, "absent.json");
    const lien = join(dir, "session.json");
    await symlink(cible, lien);

    await expect(readSession(lien, dir)).rejects.toThrow();
    await expect(deleteSession(lien, dir)).rejects.toThrow();
  });

  test("un dossier voisin dont le nom est prefixe par celui des sessions n'est pas pris pour un sous-dossier", async () => {
    const parent = await tempDir();
    const dir = join(parent, "sessions");
    const voisin = join(parent, "sessions-evil");
    await mkdir(voisin);
    const cible = join(voisin, "fichier.json");
    await writeFile(cible, "{}", "utf8");

    await expect(readSession(cible, dir)).rejects.toThrow(/refuse/i);
  });

  test("un lien symbolique sur un dossier intermediaire du chemin est intercepte", async () => {
    const dir = await tempDir();
    const ailleurs = await tempDir();
    await writeFile(join(ailleurs, "fichier.json"), "{}", "utf8");
    const sousDossier = join(dir, "sous");
    await symlink(ailleurs, sousDossier);

    await expect(readSession(join(dir, "sous", "fichier.json"), dir)).rejects.toThrow(/refuse/i);
  });

  test("accepte un dossier de sessions atteint par un lien symbolique (lire, modifier, supprimer)", async () => {
    // Le dossier reel des sessions est ailleurs ; `dir` n'est qu'un lien vers
    // lui - le cas d'un utilisateur qui deporte ses sessions sur un autre
    // disque. La racine elle-meme doit donc etre resolue par `realpath` avant
    // toute comparaison, pas seulement le chemin demande.
    const parent = await tempDir();
    const reel = await tempDir();
    const dir = join(parent, "sessions-liees");
    await symlink(reel, dir);

    const path = await ecrisSession(dir, {
      name: "via lien",
      from: "2026-08-19 20:00",
      to: "2026-08-19 22:00",
      battles: [battle("a", "win")],
    });

    const lue = await readSession(path, dir);
    expect(lue.name).toBe("via lien");

    const resume = await updateSessionMeta(path, { name: "renommee via lien" }, dir);
    expect(resume.name).toBe("renommee via lien");

    await deleteSession(path, dir);
    const { sessions } = await listSessions(dir);
    expect(sessions).toEqual([]);
  });

  test("n'echoue pas quand le dossier des sessions n'existe pas encore (racine non realpath-able)", async () => {
    const dir = join(await tempDir(), "jamais-cree");

    await expect(readSession(join(dir, "session.json"), dir)).rejects.toThrow();
  });

  test("refuse un chemin contenant un octet NUL avec le meme message que les autres refus", async () => {
    const dir = await tempDir();
    const avecNul = join(dir, `session${String.fromCharCode(0)}.json`);

    await expect(readSession(avecNul, dir)).rejects.toThrow(/refuse/i);
  });
});

describe("readSession", () => {
  test("rend la session complete, matchs compris", async () => {
    const dir = await tempDir();
    const path = await ecrisSession(dir, {
      name: "Scrim contre Les Corsaires",
      from: "2026-08-19 20:00",
      to: "2026-08-19 22:00",
      battles: [battle("a", "win"), battle("b", "lose")],
    });

    const file = await readSession(path, dir);

    expect(file.name).toBe("Scrim contre Les Corsaires");
    expect(file.battles).toHaveLength(2);
  });

  test("echoue clairement sur un fichier absent", async () => {
    const dir = await tempDir();

    await expect(readSession(join(dir, "jamais-ecrit.json"), dir)).rejects.toThrow();
  });
});

describe("updateSessionMeta", () => {
  test("change le nom et le type sans toucher au reste", async () => {
    const dir = await tempDir();
    const path = await ecrisSession(dir, {
      name: "faute de frappe",
      type: "intra",
      from: "2026-08-19 20:00",
      to: "2026-08-19 22:00",
      battles: [battle("a", "win")],
    });

    const resume = await updateSessionMeta(
      path,
      { name: "Intra Équipe A vs Équipe N", type: "scrim" },
      dir,
    );

    expect(resume.name).toBe("Intra Équipe A vs Équipe N");
    expect(resume.type).toBe("scrim");
    expect(resume.path).toBe(path);

    const relu = await readSession(path, dir);
    expect(relu.battles).toHaveLength(1);
    expect(relu.window.from).toBe("2026-08-19T18:00:00.000Z");
  });

  test("preserve fetchedAt : c'est la recuperation qui date le fichier", async () => {
    const dir = await tempDir();
    const path = await ecrisSession(dir, {
      name: "avant",
      from: "2026-08-19 20:00",
      to: "2026-08-19 22:00",
    });
    const avant = (await readSession(path, dir)).fetchedAt;

    await updateSessionMeta(path, { name: "apres" }, dir);

    expect((await readSession(path, dir)).fetchedAt).toBe(avant);
  });

  test("traite un nom vide comme une suppression du nom", async () => {
    const dir = await tempDir();
    const path = await ecrisSession(dir, {
      name: "a effacer",
      from: "2026-08-19 20:00",
      to: "2026-08-19 22:00",
    });

    const resume = await updateSessionMeta(path, { name: "   " }, dir);

    expect(resume.name).toBeUndefined();
    expect(Object.keys(await readSession(path, dir))).not.toContain("name");
  });

  test("n'ecrit pas un second fichier : le nom ne depend pas du label", async () => {
    const dir = await tempDir();
    const path = await ecrisSession(dir, {
      name: "premier nom",
      from: "2026-08-19 20:00",
      to: "2026-08-19 22:00",
    });

    await updateSessionMeta(path, { name: "tout autre nom" }, dir);

    const { sessions } = await listSessions(dir);
    expect(sessions).toHaveLength(1);
  });

  test("ecrit sur le chemin fourni plutot que de recalculer un nom, meme si le fichier a ete renomme a la main", async () => {
    const dir = await tempDir();
    const original = await ecrisSession(dir, {
      name: "premier nom",
      from: "2026-08-19 20:00",
      to: "2026-08-19 22:00",
    });
    const renomme = join(dir, "renomme-a-la-main.json");
    await rename(original, renomme);

    const resume = await updateSessionMeta(renomme, { name: "nouveau nom" }, dir);

    expect(resume.path).toBe(renomme);
    const { sessions } = await listSessions(dir);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.path).toBe(renomme);
    expect(sessions[0]?.name).toBe("nouveau nom");
  });
});

describe("deleteSession", () => {
  test("retire la session de l'inventaire", async () => {
    const dir = await tempDir();
    const path = await ecrisSession(dir, {
      name: "a jeter",
      from: "2026-08-19 20:00",
      to: "2026-08-19 22:00",
    });
    await ecrisSession(dir, { name: "a garder", from: "2026-08-20 20:00", to: "2026-08-20 22:00" });

    await deleteSession(path, dir);

    const { sessions } = await listSessions(dir);
    expect(sessions.map((session) => session.name)).toEqual(["a garder"]);
  });

  test("echoue sur un fichier absent plutot que de faire semblant", async () => {
    const dir = await tempDir();

    await expect(deleteSession(join(dir, "jamais-ecrit.json"), dir)).rejects.toThrow();
  });
});
