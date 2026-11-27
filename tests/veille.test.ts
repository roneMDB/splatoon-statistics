import { describe, expect, test } from "vitest";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appliqueLaLigne,
  commandeSysteme,
  creeLeDecoupeur,
  entreGuillemets,
  etatAuDemarrage,
  lisLigne,
  MARQUE_DU_PILOTE,
  nettoieLaLigne,
  peutVerifierMaintenant,
  scriptDArret,
  scriptDeCapture,
  scriptDeLancement,
  scriptDeLiberation,
  scriptDeVerification,
  TAILLE_DU_JOURNAL,
  type EtatDeVeille,
} from "../src/veille.ts";

/** Applique des lignes une a une, comme le gestionnaire le fait. */
const rejoue = (lignes: string[], depart: EtatDeVeille = etatAuDemarrage()) =>
  lignes.reduce(appliqueLaLigne, depart);

/** Une ligne d'evenement, telle que `outils/s3s_pilote.py` l'ecrit. */
const evt = (evenement: Record<string, unknown>) => `${MARQUE_DU_PILOTE} ${JSON.stringify(evenement)}`;

/** Un match tel que s3s l'envoie a stat.ink : Pont Esturgeon, en Defense de Zone. */
const MATCH = {
  type: "partie",
  nature: "battle",
  id: "u-1",
  debut: 1_790_000_000,
  fin: 1_790_000_200,
  regle: "area",
  lobby: "private",
  stage: "10",
  resultat: "win",
  ko: false,
};

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
    // Sans elle, le pilote de s3s se tait (cron).
    expect(script).toContain("export SPLATOON_VEILLE_EVENEMENTS=1");
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

  test("une veille encore vivante garde sa place et son pid ; un pid perime est remplace", () => {
    const dossier = mkdtempSync(join(tmpdir(), "veille-"));
    const fichierPid = join(dossier, "veille.pid");
    const lance = (commande: string) =>
      execFileSync("bash", ["-c", scriptDeLancement(commande, fichierPid)], {
        encoding: "utf8",
        env: { ...process.env, HOME: dossier },
      });

    // Un groupe vivant : celui du processus de test.
    const groupeVivant = execFileSync("ps", ["-o", "pgid=", "-p", String(process.pid)], { encoding: "utf8" }).trim();
    writeFileSync(fichierPid, groupeVivant);
    const sortie = lance("echo 'ne doit pas tourner'");
    expect(sortie).toMatch(/une synchro est déjà en cours, on passe\.$/m);
    expect(sortie).not.toContain("ne doit pas tourner");
    expect(readFileSync(fichierPid, "utf8")).toBe(groupeVivant);

    // Un pid perime : la veille demarre, puis efface le sien.
    writeFileSync(fichierPid, "999999");
    expect(lance("echo 'tourne'")).toBe("tourne\n");
    expect(existsSync(fichierPid)).toBe(false);
  });

  test("l'arret est un Ctrl+C adresse au groupe entier", () => {
    expect(scriptDArret()).toMatch(/kill -INT -- -"\$\(cat /);
  });

  test("la verification immediate ne signale que le pilote, dans le groupe de la veille", async () => {
    // SIGUSR1 tue par defaut : un voisin du groupe vise par erreur mourrait.
    const dossier = mkdtempSync(join(tmpdir(), "verifie-"));
    const fichier = (nom: string) => join(dossier, nom);
    writeFileSync(
      fichier("cible.sh"),
      `trap 'echo recu > "$1"; exit 0' USR1\nwhile :; do sleep 0.05; done\n`,
    );
    writeFileSync(
      fichier("meneur.sh"),
      [
        `echo $$ > "${fichier("pid")}"`,
        `bash "${fichier("cible.sh")}" "${fichier("recu")}" s3s_pilote.py s3s.py &`,
        `sleep 5 & echo $! > "${fichier("voisin")}"`,
        "wait",
      ].join("\n"),
    );
    const meneur = spawn("setsid", ["-w", "bash", fichier("meneur.sh")], { stdio: "ignore" });
    try {
      const attends = async (condition: () => boolean) => {
        for (let essai = 0; essai < 100 && !condition(); essai++) await new Promise((r) => setTimeout(r, 20));
        expect(condition()).toBe(true);
      };
      await attends(() => existsSync(fichier("voisin")));
      await new Promise((r) => setTimeout(r, 100));

      execFileSync("bash", ["-c", scriptDeVerification(fichier("pid"))]);
      await attends(() => existsSync(fichier("recu")));

      const voisin = readFileSync(fichier("voisin"), "utf8").trim();
      // `kill -0` : le voisin vit toujours.
      expect(() => execFileSync("kill", ["-0", voisin])).not.toThrow();
    } finally {
      try {
        process.kill(-Number(readFileSync(fichier("pid"), "utf8")), "SIGKILL");
      } catch {
        meneur.kill("SIGKILL");
      }
    }
  });

  describe("liberation du verrou", () => {
    /**
     * Un detenteur du verrou dans son propre groupe, comme une veille ou le
     * cron. `surInt` : ce qu'il fait d'un Ctrl+C.
     */
    function detenteur(dossier: string, surInt: string) {
      const verrou = join(dossier, "verrou");
      writeFileSync(
        join(dossier, "detenteur.sh"),
        `exec 9>"${verrou}"; flock 9; trap '${surInt}' INT; touch "${join(dossier, "pret")}"; while :; do sleep 0.05; done\n`,
      );
      const processus = spawn("setsid", ["bash", join(dossier, "detenteur.sh")], { stdio: "ignore" });
      return { verrou, processus };
    }
    const pret = async (dossier: string) => {
      for (let essai = 0; essai < 100 && !existsSync(join(dossier, "pret")); essai++) {
        await new Promise((r) => setTimeout(r, 20));
      }
    };
    const libere = (verrou: string, delai: number, terminaison: number) =>
      spawnSync("bash", ["-c", scriptDeLiberation(verrou, delai, terminaison)]).status;

    test("un verrou libre l'est tout de suite", () => {
      const dossier = mkdtempSync(join(tmpdir(), "verrou-"));
      expect(libere(join(dossier, "verrou"), 1, 1)).toBe(0);
    });

    test("Ctrl+C au groupe qui tient le verrou, puis attend qu'il le rende", async () => {
      const dossier = mkdtempSync(join(tmpdir(), "verrou-"));
      const { verrou, processus } = detenteur(dossier, `echo int > "${join(dossier, "signal")}"; exit 0`);
      try {
        await pret(dossier);
        expect(libere(verrou, 5, 1)).toBe(0);
        expect(readFileSync(join(dossier, "signal"), "utf8")).toBe("int\n");
      } finally {
        processus.kill("SIGKILL");
      }
    });

    test("un detenteur sourd au Ctrl+C recoit SIGTERM", async () => {
      const dossier = mkdtempSync(join(tmpdir(), "verrou-"));
      const { verrou, processus } = detenteur(dossier, "");
      try {
        await pret(dossier);
        expect(libere(verrou, 1, 5)).toBe(0);
      } finally {
        processus.kill("SIGKILL");
      }
    });
  });

  test("sans pilote, la verification immediate echoue sans rien signaler", () => {
    const dossier = mkdtempSync(join(tmpdir(), "verifie-"));
    writeFileSync(join(dossier, "pid"), "999999");
    expect(() => execFileSync("bash", ["-c", scriptDeVerification(join(dossier, "pid"))])).toThrow();
  });
});

describe("peutVerifierMaintenant", () => {
  test("seulement pendant l'attente d'une veille qui tourne, une fois", () => {
    const enAttente = rejoue([evt({ type: "decompte", secondes: 30 })]);
    expect(peutVerifierMaintenant(enAttente)).toBe(true);
    expect(peutVerifierMaintenant({ ...enAttente, verificationDemandee: true })).toBe(false);
    expect(peutVerifierMaintenant(etatAuDemarrage())).toBe(false);
    expect(peutVerifierMaintenant({ ...enAttente, statut: "arret-demande" })).toBe(false);
  });

  test("la demande retombe des que s3s verifie", () => {
    const demande: EtatDeVeille = { ...rejoue([evt({ type: "decompte", secondes: 30 })]), verificationDemandee: true };
    // Le decompte file a toute vitesse avant la verification : la demande tient.
    expect(rejoue([evt({ type: "decompte", secondes: 0 })], demande).verificationDemandee).toBe(true);
    expect(rejoue([evt({ type: "verification", finale: false })], demande).verificationDemandee).toBeUndefined();
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

describe("lisLigne : les evenements du pilote", () => {
  test.each([
    [{ type: "pilote", version: 1 }, { type: "pilote", version: 1 }],
    [{ type: "rattrapage" }, { type: "rattrapage" }],
    [{ type: "jetons-expires" }, { type: "jetons" }],
    [{ type: "decompte", secondes: 42 }, { type: "decompte", secondes: 42 }],
    [{ type: "verification", finale: false }, { type: "verification", finale: false }],
    [{ type: "verification", finale: true }, { type: "verification", finale: true }],
  ])("%j", (evenement, attendu) => {
    expect(lisLigne(evt(evenement))).toEqual(attendu);
  });

  test("une partie, champs valides seulement", () => {
    expect(lisLigne(evt({ ...MATCH, statut: "envoyee", url: "https://stat.ink/@Gloup/spl3/a", debut: "hier" }))).toEqual({
      type: "partie",
      partie: {
        nature: "battle",
        statut: "envoyee",
        id: "u-1",
        fin: 1_790_000_200,
        regle: "area",
        lobby: "private",
        stage: "10",
        resultat: "win",
        ko: false,
        url: "https://stat.ink/@Gloup/spl3/a",
      },
    });
  });

  test.each([
    ["un JSON illisible", `${MARQUE_DU_PILOTE} {pas du json`],
    ["un type inconnu", evt({ type: "inconnu" })],
    ["une partie sans statut", evt({ type: "partie", nature: "battle" })],
    ["une nature inconnue", evt({ ...MATCH, nature: "autre", statut: "envoi" })],
    ["un decompte sans secondes", evt({ type: "decompte" })],
  ])("%s ne va qu'au journal", (_cas, ligne) => {
    expect(lisLigne(ligne)).toEqual({ type: "ligne" });
  });
});

describe("lisLigne : les messages de STU et d'upload.sh, recopies tels quels", () => {
  test.each([
    ["Booting emulator...", { type: "jetons" }],
    ["--- splashcat (s3si.ts) 2026-10-13 21:40:00 --- (Ctrl+C pour passer)", { type: "splashcat" }],
    ["2026-10-13 21:40:00 : une synchro est déjà en cours, on passe.", { type: "deja-en-cours" }],
    ["Waiting for new battles... (checking every 1 minute)", { type: "s3s-sans-pilote" }],
    ["Battle uploaded to https://stat.ink/@Gloup/spl3/abc", { type: "ligne" }],
    ["s3s v0.7.0", { type: "ligne" }],
  ])("%s", (ligne, evenement) => {
    expect(lisLigne(ligne)).toEqual(evenement);
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
  test("une partie annoncee passe de « envoi » a « envoyee », a la meme place, traduite", () => {
    const annoncee = rejoue([evt({ ...MATCH, statut: "envoi" })]);
    expect(annoncee.parties).toEqual([
      {
        nature: "battle",
        id: "u-1",
        debut: "2026-09-21T14:13:20.000Z",
        fin: "2026-09-21T14:16:40.000Z",
        stage: "Pont Esturgeon",
        regle: "Défense de Zone",
        resultat: "Victory",
        ko: false,
        statut: "envoi",
        numero: 1,
      },
    ]);

    const envoyee = appliqueLaLigne(annoncee, evt({ ...MATCH, statut: "envoyee", url: "https://stat.ink/@Gloup/spl3/abc" }));
    expect(envoyee.parties).toHaveLength(1);
    expect(envoyee.parties[0]).toMatchObject({ statut: "envoyee", url: "https://stat.ink/@Gloup/spl3/abc", numero: 1 });
    // L'etat d'avant n'a pas bouge : la fenetre peut le garder.
    expect(annoncee.parties[0]?.statut).toBe("envoi");
  });

  test("sans identifiant, l'issue remplace l'annonce qui la precede, et rien d'autre", () => {
    const anonyme = { type: "partie", nature: "battle" };
    const etat = rejoue([
      evt({ ...anonyme, statut: "envoi" }),
      evt({ ...anonyme, statut: "envoyee", url: "https://stat.ink/@Gloup/spl3/a" }),
      evt({ ...anonyme, statut: "envoi" }),
      evt({ ...anonyme, statut: "envoyee", url: "https://stat.ink/@Gloup/spl3/b" }),
      // Une issue sans annonce devant elle s'ajoute.
      evt({ ...anonyme, statut: "echec" }),
    ]);
    expect(etat.parties.map((partie) => [partie.numero, partie.statut, partie.url])).toEqual([
      [3, "echec", undefined],
      [2, "envoyee", "https://stat.ink/@Gloup/spl3/b"],
      [1, "envoyee", "https://stat.ink/@Gloup/spl3/a"],
    ]);
  });

  test("la plus recente en tete, numerotee a la suite ; un echec garde le message de stat.ink", () => {
    const etat = rejoue([
      evt({ ...MATCH, statut: "envoyee" }),
      evt({ ...MATCH, id: "u-2", stage: "15", resultat: "lose", statut: "echec", message: "invalid" }),
    ]);
    expect(etat.parties.map((partie) => [partie.numero, partie.stage, partie.resultat, partie.statut, partie.message])).toEqual([
      [2, "Supermarché Cétacé", "Defeat", "echec", "invalid"],
      [1, "Pont Esturgeon", "Victory", "envoyee", undefined],
    ]);
  });

  test("un Salmon Run n'a ni stage ni regle ; un stage inconnu garde son numero", () => {
    const etat = rejoue([
      evt({ type: "partie", nature: "job", id: "j-1", stage: "7", resultat: "clear", statut: "envoyee" }),
      evt({ ...MATCH, id: "u-9", stage: "999", statut: "envoyee" }),
    ]);
    expect(etat.parties[1]).toEqual({ nature: "job", id: "j-1", resultat: "Clear", statut: "envoyee", numero: 1 });
    expect(etat.parties[0]?.stage).toBe("stage 999");
  });

  test("suit les phases, et le decompte pendant l'attente", () => {
    let etat = rejoue(["Booting emulator..."]);
    expect(etat.phase).toBe("jetons");
    etat = rejoue([evt({ type: "rattrapage" })], etat);
    expect(etat.phase).toBe("rattrapage");
    etat = rejoue([evt({ type: "decompte", secondes: 42 })], etat);
    expect(etat).toMatchObject({ phase: "attente", decompte: 42 });
    etat = appliqueLaLigne(etat, evt({ type: "verification", finale: false }));
    expect(etat.phase).toBe("verification");
    expect(etat.decompte).toBeUndefined();
    etat = appliqueLaLigne(etat, evt({ type: "verification", finale: true }));
    expect(etat.phase).toBe("verification-finale");
    etat = appliqueLaLigne(etat, evt({ type: "jetons-expires" }));
    expect(etat.phase).toBe("jetons");
  });

  test("le journal tait les evenements, le decompte et le bruit de l'emulateur, et reste borne", () => {
    const etat = rejoue([
      evt({ type: "decompte", secondes: 3 }),
      "Press Ctrl+C to exit. 3",
      "next chunk done",
      ">=>      ===>",
      "",
      "Battle uploaded to https://stat.ink/@Gloup/spl3/abc",
    ]);
    expect(etat.journal).toEqual(["Battle uploaded to https://stat.ink/@Gloup/spl3/abc"]);

    const plein = rejoue(Array.from({ length: TAILLE_DU_JOURNAL + 5 }, (_, i) => `ligne ${i}`));
    expect(plein.journal).toHaveLength(TAILLE_DU_JOURNAL);
    expect(plein.journal[0]).toBe("ligne 5");
  });

  test("s3s en veille sans pilote est signale, mais pas une fois le pilote annonce", () => {
    expect(rejoue(["Waiting for new battles... (checking every 1 minute)"]).sansPilote).toBe(true);
    const avecPilote = rejoue([evt({ type: "pilote", version: 1 }), "Waiting for new battles... (checking every 1 minute)"]);
    expect(avecPilote).toMatchObject({ pilote: 1 });
    expect(avecPilote.sansPilote).toBeUndefined();
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
    const repartie = appliqueLaLigne(alerte, evt({ type: "rattrapage" }));
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
