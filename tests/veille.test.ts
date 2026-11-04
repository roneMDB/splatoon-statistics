import { describe, expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appliqueLaLigne,
  commandeSysteme,
  creeLeDecoupeur,
  entreGuillemets,
  etatAuDemarrage,
  lisLigne,
  nettoieLaLigne,
  scriptDArret,
  scriptDeCapture,
  scriptDeLancement,
  TAILLE_DU_JOURNAL,
  type EtatDeVeille,
} from "../src/veille.ts";

/** Applique des lignes une a une, comme le pilote le fait. */
const rejoue = (lignes: string[], depart: EtatDeVeille = etatAuDemarrage()) =>
  lignes.reduce(appliqueLaLigne, depart);

describe("commandeSysteme", () => {
  test("sous Linux et WSL, lance bash en shell de connexion, pour trouver ~/.local/bin", () => {
    expect(commandeSysteme("linux", "s3s-sync", { distribution: "Ubuntu" })).toEqual({
      fichier: "bash",
      args: ["-lc", "s3s-sync"],
    });
  });

  test("sous Windows, passe par wsl.exe, dans la distribution par defaut si rien n'est dit", () => {
    expect(commandeSysteme("win32", "s3s-sync", { distribution: "" })).toEqual({
      fichier: "wsl.exe",
      args: ["-e", "bash", "-lc", "s3s-sync"],
    });
    expect(commandeSysteme("win32", "s3s-sync", { distribution: "Ubuntu-24.04" })?.args).toEqual([
      "-d",
      "Ubuntu-24.04",
      "-e",
      "bash",
      "-lc",
      "s3s-sync",
    ]);
  });

  test("n'est pas proposee ailleurs", () => {
    expect(commandeSysteme("darwin", "s3s-sync", { distribution: "" })).toBeUndefined();
  });
});

describe("scripts", () => {
  test("les guillemets simples d'une commande survivent", () => {
    const sortie = execFileSync("bash", ["-c", `printf %s ${entreGuillemets("l'appli dit 'bonjour'")}`], {
      encoding: "utf8",
    });
    expect(sortie).toBe("l'appli dit 'bonjour'");
  });

  test("le lancement isole la commande dans son groupe et force une sortie au fil de l'eau", () => {
    const script = scriptDeLancement("s3s-sync -r -M 60");
    expect(script).toMatch(/^exec setsid -w bash -c '/);
    expect(script).toContain("PYTHONUNBUFFERED=1");
    expect(script).toContain("s3s-sync -r -M 60");
    expect(script).toContain("tee -i -p");
  });

  test("la commande tourne, rend son code, et laisse son journal mais pas son pid", () => {
    // Ni le pid ni le journal de l'utilisateur : une veille peut tourner pendant les tests.
    const dossier = mkdtempSync(join(tmpdir(), "veille-"));
    const fichierPid = join(dossier, "veille.pid");
    let sortie = "";
    let code = 0;
    try {
      execFileSync("bash", ["-c", scriptDeLancement("echo 'bonjour'; exit 3", fichierPid)], {
        encoding: "utf8",
        env: { ...process.env, HOME: dossier },
      });
    } catch (erreur) {
      ({ stdout: sortie, status: code } = erreur as { stdout: string; status: number });
    }
    expect(code).toBe(3);
    expect(sortie).toBe("bonjour\n");
    expect(readFileSync(join(dossier, ".cache/splatoon-statistics/veille.log"), "utf8")).toBe("bonjour\n");
    expect(existsSync(fichierPid)).toBe(false);
  });

  test("l'arret est un Ctrl+C adresse au groupe entier", () => {
    expect(scriptDArret()).toMatch(/kill -INT -- -"\$\(cat /);
  });
});

describe("creeLeDecoupeur", () => {
  test("coupe sur \\n, \\r\\n et \\r, et garde la ligne inachevee pour plus tard", () => {
    const decoupeur = creeLeDecoupeur();
    expect(decoupeur.pousse("Press Ctrl+C to exit. 3 \rPress Ctrl+C")).toEqual(["Press Ctrl+C to exit. 3 "]);
    expect(decoupeur.pousse(" to exit. 2 \rNew battle\r\nfin")).toEqual([
      "Press Ctrl+C to exit. 2 ",
      "New battle",
    ]);
    expect(decoupeur.vide()).toEqual(["fin"]);
    expect(decoupeur.vide()).toEqual([]);
  });
});

describe("lisLigne : les messages de s3s.py, recopies tels quels", () => {
  test.each([
    ["Waiting for new battles... (checking every 1 minute)", { type: "attente" }],
    ["Waiting for new battles and jobs... (checking every 2 minutes)", { type: "attente" }],
    ["Press Ctrl+C to exit. 42", { type: "decompte", secondes: 42 }],
    ["Checking for new results...", { type: "verification" }],
    ["Checking to see if there are unuploaded battles before exiting...", { type: "verification-finale" }],
    ["Checking if there are previously-unuploaded battles/jobs...", { type: "rattrapage" }],
    ["Previously-unuploaded battles detected. Uploading now...", { type: "rattrapage" }],
    ["Booting emulator...", { type: "jetons" }],
    ["--- splashcat (s3si.ts) 2026-10-13 21:40:00 --- (Ctrl+C pour passer)", { type: "splashcat" }],
    ["2026-10-13 21:40:00 : une synchro est déjà en cours, on passe.", { type: "deja-en-cours" }],
    ["s3s v0.7.0", { type: "ligne" }],
  ])("%s", (ligne, evenement) => {
    expect(lisLigne(ligne)).toEqual(evenement);
  });

  test("une partie detectee, avec son heure, son stage et son resultat", () => {
    expect(lisLigne("New battle result detected at 9:41:12 PM! (Museum, Victory)")).toEqual({
      type: "partie-detectee",
      nature: "battle",
      heure: "9:41:12 PM",
      stage: "Museum",
      resultat: "Victory",
    });
    expect(lisLigne("New job result detected at 10:02:51 PM! (Bay, Clear)")).toMatchObject({
      nature: "job",
      resultat: "Clear",
    });
  });

  test("l'envoi, deja fait ou rate", () => {
    expect(lisLigne("Battle uploaded to https://stat.ink/@Gloup/spl3/abc")).toEqual({
      type: "partie-envoyee",
      nature: "battle",
      url: "https://stat.ink/@Gloup/spl3/abc",
    });
    expect(lisLigne("Job uploaded to https://stat.ink/@Gloup/salmon3/def")).toMatchObject({ nature: "job" });
    expect(lisLigne("Battle already uploaded - https://stat.ink/@Gloup/spl3/abc")).toMatchObject({
      type: "deja-envoyee",
    });
    expect(lisLigne("Error uploading battle. (ID: VnNIaXN0b3J5)")).toEqual({ type: "echec-envoi", nature: "battle" });
  });

  test("les echecs de STU, et la capture qu'il laisse", () => {
    expect(lisLigne("Could not open SplatNet3 app in 3 attempts.")).toEqual({ type: "splatnet-inaccessible" });
    expect(lisLigne("Could not find all requested tokens in 16 attempts, application will stop now.")).toEqual({
      type: "jetons-introuvables",
    });
    expect(
      lisLigne(
        'A screenshot with SplatNet3 opened was saved to "/home/erwan/repositories/splatnet3-token-util/2026-11-04_13-42-28.png".',
      ),
    ).toEqual({ type: "capture", chemin: "/home/erwan/repositories/splatnet3-token-util/2026-11-04_13-42-28.png" });
  });

  test("les couleurs du terminal sont retirees avant lecture", () => {
    expect(nettoieLaLigne("\x1b[93m\x1b[1ms3s\x1b[0m\x1b[93m v0.7.0\x1b[0m  ")).toBe("s3s v0.7.0");
  });
});

describe("appliqueLaLigne", () => {
  test("une partie annoncee passe de « envoi » a « envoyee », avec son lien", () => {
    const annoncee = rejoue(["New battle result detected at 9:41:12 PM! (Museum, Victory)"]);
    expect(annoncee.parties).toEqual([
      { nature: "battle", heure: "9:41:12 PM", stage: "Museum", resultat: "Victory", statut: "envoi", numero: 1 },
    ]);

    const envoyee = appliqueLaLigne(annoncee, "Battle uploaded to https://stat.ink/@Gloup/spl3/abc");
    expect(envoyee.parties).toEqual([
      {
        nature: "battle",
        heure: "9:41:12 PM",
        stage: "Museum",
        resultat: "Victory",
        statut: "envoyee",
        url: "https://stat.ink/@Gloup/spl3/abc",
        numero: 1,
      },
    ]);
    // L'etat d'avant n'a pas bouge : la fenetre peut le garder.
    expect(annoncee.parties[0]?.statut).toBe("envoi");
  });

  test("la plus recente en tete, numerotee a la suite", () => {
    const etat = rejoue([
      "New battle result detected at 9:41:12 PM! (Museum, Victory)",
      "Battle uploaded to https://stat.ink/@Gloup/spl3/a",
      "New battle result detected at 9:46:30 PM! (Cargo, Defeat)",
      "Error uploading battle. (ID: b)",
    ]);
    expect(etat.parties.map((partie) => [partie.numero, partie.stage, partie.statut])).toEqual([
      [2, "Cargo", "echec"],
      [1, "Museum", "envoyee"],
    ]);
  });

  test("un envoi sans annonce (rattrapage) ajoute une partie sans stage", () => {
    const etat = rejoue(["Battle uploaded to https://stat.ink/@Gloup/spl3/a"]);
    expect(etat.parties).toEqual([
      { nature: "battle", statut: "envoyee", url: "https://stat.ink/@Gloup/spl3/a", numero: 1 },
    ]);
  });

  test("suit les phases, et le decompte pendant l'attente", () => {
    let etat = rejoue(["Booting emulator..."]);
    expect(etat.phase).toBe("jetons");
    etat = rejoue(["Waiting for new battles... (checking every 1 minute)", "Press Ctrl+C to exit. 42 "], etat);
    expect(etat).toMatchObject({ phase: "attente", decompte: 42 });
    etat = appliqueLaLigne(etat, "Checking for new results...");
    expect(etat.phase).toBe("verification");
    expect(etat.decompte).toBeUndefined();
  });

  test("le journal tait le decompte et le bruit de l'emulateur, et reste borne", () => {
    const etat = rejoue([
      "Press Ctrl+C to exit. 3",
      "next chunk done",
      ">=>      ===>",
      "",
      "Waiting for new battles... (checking every 1 minute)",
    ]);
    expect(etat.journal).toEqual(["Waiting for new battles... (checking every 1 minute)"]);

    const plein = rejoue(Array.from({ length: TAILLE_DU_JOURNAL + 5 }, (_, i) => `ligne ${i}`));
    expect(plein.journal).toHaveLength(TAILLE_DU_JOURNAL);
    expect(plein.journal[0]).toBe("ligne 5");
  });

  test("retient qu'une synchro tournait deja", () => {
    expect(rejoue(["2026-10-13 21:40:00 : une synchro est déjà en cours, on passe."]).dejaEnCours).toBe(true);
  });

  test("SplatNet3 qui ne s'ouvre pas leve une alerte, avec la capture de l'emulateur", () => {
    const etat = rejoue([
      "Booting emulator...",
      "Opening SplatNet3 - attempt 3/3 failed.",
      "Could not open SplatNet3 app in 3 attempts.",
      'A screenshot with SplatNet3 opened was saved to "/stu/2026-11-04_13-42-28.png".',
    ]);
    expect(etat).toMatchObject({ phase: "jetons", alerte: "splatnet-inaccessible", capture: "/stu/2026-11-04_13-42-28.png" });
  });

  test("l'abandon de STU l'emporte, et la capture reste", () => {
    const etat = rejoue([
      "Could not open SplatNet3 app in 3 attempts.",
      'A screenshot with SplatNet3 opened was saved to "/stu/a.png".',
      "Could not find all requested tokens in 16 attempts, application will stop now.",
    ]);
    expect(etat).toMatchObject({ alerte: "jetons-introuvables", capture: "/stu/a.png" });
  });

  test("l'alerte tombe des que s3s repart avec des jetons valides", () => {
    const alerte = rejoue([
      "Could not open SplatNet3 app in 3 attempts.",
      'A screenshot with SplatNet3 opened was saved to "/stu/a.png".',
      "Booting emulator...",
    ]);
    expect(alerte.alerte).toBe("splatnet-inaccessible");
    const repartie = appliqueLaLigne(alerte, "Checking if there are previously-unuploaded battles/jobs...");
    expect(repartie.alerte).toBeUndefined();
    expect(repartie.capture).toBeUndefined();
  });
});

describe("scriptDeCapture", () => {
  test("lit une capture PNG en base64, chemin entre guillemets", () => {
    expect(scriptDeCapture("/stu/l'écran.png")).toBe(`base64 -w0 -- '/stu/l'\\''écran.png'`);
  });

  test.each(["relatif.png", "/stu/journal.txt", ""])("refuse %j : pas une capture de STU", (chemin) => {
    expect(scriptDeCapture(chemin)).toBeUndefined();
  });
});
