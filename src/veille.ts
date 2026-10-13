/**
 * Veille s3s : lancer `s3s-sync -r -M 60` depuis l'application, l'arreter, et
 * suivre ce qu'elle envoie a stat.ink.
 *
 * Ce module ne depend ni d'Electron ni d'un processus : il dit quelle commande
 * lancer, et lit ce que la commande ecrit. `electron/veilleHandler.ts` fait
 * tourner le processus.
 *
 * **Arreter, c'est faire Ctrl+C.** `s3s-sync` (voir `~/repositories/s3s/upload.sh`
 * et `stu-run.py`) attend un SIGINT adresse a tout son groupe de processus,
 * comme le terminal l'envoie : s3s fait alors sa verification finale, rend 0,
 * puis l'envoi Splashcat a lieu. Un SIGTERM ou un `kill -9` couperait tout ca.
 * D'ou `setsid` au lancement : la commande a un groupe a elle seule, dont le
 * meneur ecrit son pid dans `FICHIER_PID` ; l'arret envoie SIGINT a ce groupe.
 * On vise le groupe et non un pid parce que `s3s-sync` peut se relancer sous
 * `sg kvm`, et parce que s3s tourne sous deux enrobages Python.
 *
 * **Ou tourne la commande.** `s3s-sync` vit dans WSL (il pilote un emulateur
 * Android par KVM). Sous WSL ou Linux, on lance `bash` directement ; sous
 * Windows, a travers `wsl.exe`. Ailleurs, la veille n'est pas proposee.
 */

/** Ce que les reglages disent de la veille. */
export type ReglageDeVeille = {
  /** Commande lancee dans un shell de connexion bash, telle qu'on la taperait. */
  commande: string;
  /** Distribution WSL visee depuis Windows ; vide : celle par defaut. */
  distribution: string;
};

/** Ou le meneur du groupe de la veille ecrit son pid, cote Linux. */
export const FICHIER_PID = "/tmp/splatoon-statistics-veille.pid";

/** Sortie complete de la derniere veille, cote Linux, telle que l'ecran la nomme. */
export const CHEMIN_DU_JOURNAL = "~/.cache/splatoon-statistics/veille.log";

/** La meme, pour bash : `~` ne s'etend pas entre guillemets, `$HOME` si. */
const FICHIER_JOURNAL = `"$HOME/${CHEMIN_DU_JOURNAL.slice(2)}"`;

/** Un programme et ses arguments, prets pour `spawn`, sans shell intermediaire cote hote. */
export type CommandeSysteme = { fichier: string; args: string[] };

/** Entoure un texte de guillemets simples pour bash, guillemets internes compris. */
export const entreGuillemets = (texte: string): string => `'${texte.replaceAll("'", `'\\''`)}'`;

/**
 * Le script bash qui lance la veille.
 *
 * `setsid -w` place la commande dans une session, donc un groupe, a elle : le
 * bash interieur en est le meneur et ecrit son pid. `-w` fait attendre
 * `setsid` : sans lui, l'application croirait la veille finie aussitot.
 *
 * `PYTHONUNBUFFERED=1` : sans terminal, Python ecrit sa sortie par blocs de
 * plusieurs kilo-octets, et le suivi arriverait en retard, par paquets.
 *
 * La sortie passe par `tee -i -p` avant d'atteindre l'application. Fermer
 * l'application pendant l'arret ferme le tube de sortie : sans relais, s3s
 * mourrait d'un `BrokenPipeError` en pleine verification finale. `tee -p`
 * continue d'ecrire dans `FICHIER_JOURNAL` quand le tube est rompu, et `-i`
 * le rend sourd au Ctrl+C adresse au groupe. Mesure : la commande va au bout
 * apres la fermeture de son lecteur. Le journal complet reste sur disque.
 */
export function scriptDeLancement(commande: string, fichierPid: string = FICHIER_PID): string {
  const interieur = [
    `echo $$ > ${fichierPid}`,
    "export PYTHONUNBUFFERED=1",
    "set -o pipefail",
    `mkdir -p "$(dirname ${FICHIER_JOURNAL})"`,
    `{ ${commande}\n} 2>&1 | tee -i -p ${FICHIER_JOURNAL}`,
    // Un pid laisse derriere soi finirait par designer un autre processus.
    `rc=$?; rm -f ${fichierPid}; exit $rc`,
  ].join("; ");
  return `exec setsid -w bash -c ${entreGuillemets(interieur)}`;
}


/** Le script bash qui arrete la veille : Ctrl+C, adresse a tout son groupe. */
export function scriptDArret(fichierPid: string = FICHIER_PID): string {
  return `[ -s ${fichierPid} ] && kill -INT -- -"$(cat ${fichierPid})"`;
}

/**
 * Enrobe un script bash pour la plateforme. Le shell est un shell de
 * connexion (`-l`) : c'est lui qui met `~/.local/bin`, ou vit `s3s-sync`, dans
 * le PATH.
 *
 * Rend `undefined` hors de Linux et Windows : rien n'y a ete essaye.
 */
export function commandeSysteme(
  plateforme: NodeJS.Platform,
  script: string,
  reglage: Pick<ReglageDeVeille, "distribution">,
): CommandeSysteme | undefined {
  const bash = ["bash", "-lc", script];
  if (plateforme === "linux") return { fichier: bash[0]!, args: bash.slice(1) };
  if (plateforme === "win32") {
    const distribution = reglage.distribution.trim();
    return {
      fichier: "wsl.exe",
      args: [...(distribution === "" ? [] : ["-d", distribution]), "-e", ...bash],
    };
  }
  return undefined;
}

/*
 * Lecture de la sortie.
 */

/** Resultat tel que s3s l'ecrit : en anglais, quelle que soit la langue du jeu. */
export type Resultat = "Victory" | "Defeat" | "Draw" | "Clear";

/** Ce qu'une ligne de sortie annonce. */
export type EvenementDeVeille =
  | { type: "jetons" }
  | { type: "rattrapage" }
  | { type: "attente" }
  | { type: "decompte"; secondes: number }
  | { type: "verification" }
  | { type: "verification-finale" }
  | { type: "partie-detectee"; nature: "battle" | "job"; heure: string; stage: string; resultat: Resultat }
  | { type: "partie-envoyee"; nature: "battle" | "job"; url: string }
  | { type: "deja-envoyee"; nature: "battle" | "job"; url: string }
  | { type: "echec-envoi"; nature: "battle" | "job" }
  | { type: "splashcat" }
  | { type: "deja-en-cours" }
  | { type: "ligne" };

/** Les couleurs du terminal (`\x1b[93m`) que s3s ecrit meme sans terminal. */
const ECHAPPEMENTS_ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;

/** Nettoie une ligne brute : couleurs retirees, blancs de bord aussi. */
export const nettoieLaLigne = (ligne: string): string => ligne.replace(ECHAPPEMENTS_ANSI, "").trim();

const NATURE = "(battle|job)";

/** Les messages de `s3s.py`, `stu-run.py` et `upload.sh`, dans l'ordre ou on les essaie. */
const MOTIFS: readonly [RegExp, (trouve: RegExpExecArray) => EvenementDeVeille][] = [
  [/^Press Ctrl\+C to exit\. (\d+)/, (t) => ({ type: "decompte", secondes: Number(t[1]) })],
  [/^Checking for new results/, () => ({ type: "verification" })],
  [/^Checking to see if there are unuploaded .* before exiting/, () => ({ type: "verification-finale" })],
  [/^Waiting for new /, () => ({ type: "attente" })],
  [
    new RegExp(`^New ${NATURE} result detected at (.+?)! \\((.*), (Victory|Defeat|Draw|Clear)\\)$`),
    (t) => ({
      type: "partie-detectee",
      nature: t[1] as "battle" | "job",
      heure: t[2]!,
      stage: t[3]!,
      resultat: t[4] as Resultat,
    }),
  ],
  [
    new RegExp(`^${NATURE} uploaded to (\\S+)`, "i"),
    (t) => ({ type: "partie-envoyee", nature: t[1]!.toLowerCase() as "battle" | "job", url: t[2]! }),
  ],
  [
    new RegExp(`^${NATURE} already uploaded - (\\S+)`, "i"),
    (t) => ({ type: "deja-envoyee", nature: t[1]!.toLowerCase() as "battle" | "job", url: t[2]! }),
  ],
  [
    new RegExp(`^Error uploading ${NATURE}`),
    (t) => ({ type: "echec-envoi", nature: t[1] as "battle" | "job" }),
  ],
  [/^Checking if there are previously-unuploaded /, () => ({ type: "rattrapage" })],
  [/^Previously-unuploaded .* detected/, () => ({ type: "rattrapage" })],
  [/^(Booting emulator|Waiting for emulator to complete)/, () => ({ type: "jetons" })],
  [/^--- splashcat/, () => ({ type: "splashcat" })],
  [/une synchro est déjà en cours, on passe/, () => ({ type: "deja-en-cours" })],
];

/** Ce qu'annonce une ligne deja nettoyee. Une ligne inconnue ne va qu'au journal. */
export function lisLigne(ligne: string): EvenementDeVeille {
  for (const [motif, evenement] of MOTIFS) {
    const trouve = motif.exec(ligne);
    if (trouve !== null) return evenement(trouve);
  }
  return { type: "ligne" };
}

/**
 * Lignes que le journal tait : le decompte (une par seconde), les barres de
 * progression de s3s, et les milliers de « next chunk done » de l'emulateur.
 */
const BRUIT = [/^Press Ctrl\+C to exit/, /^>?=+>/, /^next chunk done$/, /^#+$/];
const estDuBruit = (ligne: string) => BRUIT.some((motif) => motif.test(ligne));

/**
 * Recoupe un flux en lignes. s3s reecrit son decompte sur place avec `\r` :
 * le retour chariot termine donc une ligne au meme titre que `\n`.
 */
export function creeLeDecoupeur(): { pousse: (morceau: string) => string[]; vide: () => string[] } {
  let reste = "";
  return {
    pousse(morceau) {
      const lignes = (reste + morceau).split(/\r\n|\r|\n/);
      reste = lignes.pop() ?? "";
      return lignes;
    },
    vide() {
      const dernier = reste;
      reste = "";
      return dernier === "" ? [] : [dernier];
    },
  };
}

/*
 * Suivi : l'etat que la fenetre affiche.
 */

export type StatutDeVeille = "arretee" | "en-cours" | "arret-demande";

/** Ou en est la veille, dans ses grandes etapes. */
export type PhaseDeVeille =
  | "demarrage"
  | "jetons"
  | "rattrapage"
  | "attente"
  | "verification"
  | "verification-finale"
  | "splashcat";

/** Une partie vue passer pendant la veille. */
export type PartieSuivie = {
  nature: "battle" | "job";
  /** Absents pour une partie rattrapee : s3s ne les ecrit qu'en veille. */
  heure?: string;
  stage?: string;
  resultat?: Resultat;
  statut: "envoi" | "envoyee" | "deja" | "echec";
  url?: string;
  /** Rang d'arrivee, pour que la fenetre reconnaisse la plus recente. */
  numero: number;
};

export type EtatDeVeille = {
  statut: StatutDeVeille;
  phase?: PhaseDeVeille;
  /** Secondes avant la prochaine verification, pendant l'attente. */
  decompte?: number;
  /** La plus recente en tete. */
  parties: PartieSuivie[];
  /** Dernieres lignes utiles de la sortie, la plus ancienne en tete. */
  journal: string[];
  /** Vrai quand la commande a cede la place a une synchro deja en cours (cron). */
  dejaEnCours: boolean;
  /** Code de sortie de la derniere veille terminee ; `null` : tuee par un signal. */
  codeDeSortie?: number | null;
  /** Lancement impossible, ou arret refuse. */
  erreur?: string;
  /** Plateforme ou la veille n'est pas proposee. */
  indisponible?: boolean;
};

/** Lignes gardees au journal : de quoi lire une erreur, pas un historique. */
export const TAILLE_DU_JOURNAL = 200;

export const etatInitial = (): EtatDeVeille => ({
  statut: "arretee",
  parties: [],
  journal: [],
  dejaEnCours: false,
});

/** Une veille qui (re)demarre : les parties de la precedente ne la concernent plus. */
export const etatAuDemarrage = (): EtatDeVeille => ({
  ...etatInitial(),
  statut: "en-cours",
  phase: "demarrage",
});

/**
 * Applique une ligne brute a l'etat. Rend un nouvel etat : l'ancien n'est pas
 * modifie, la fenetre peut le garder.
 */
export function appliqueLaLigne(etat: EtatDeVeille, brute: string): EtatDeVeille {
  const ligne = nettoieLaLigne(brute);
  if (ligne === "") return etat;

  const suivant: EtatDeVeille = { ...etat };
  if (!estDuBruit(ligne)) {
    suivant.journal = [...etat.journal, ligne].slice(-TAILLE_DU_JOURNAL);
  }

  const evenement = lisLigne(ligne);
  const numero = (etat.parties[0]?.numero ?? 0) + 1;

  switch (evenement.type) {
    case "jetons":
    case "rattrapage":
    case "attente":
    case "verification":
    case "verification-finale":
    case "splashcat":
      suivant.phase = evenement.type;
      delete suivant.decompte;
      break;
    case "decompte":
      suivant.phase = "attente";
      suivant.decompte = evenement.secondes;
      break;
    case "deja-en-cours":
      suivant.dejaEnCours = true;
      break;
    case "partie-detectee":
      suivant.parties = [
        {
          nature: evenement.nature,
          heure: evenement.heure,
          stage: evenement.stage,
          resultat: evenement.resultat,
          statut: "envoi",
          numero,
        },
        ...etat.parties,
      ];
      break;
    case "partie-envoyee":
    case "deja-envoyee":
    case "echec-envoi": {
      const statut =
        evenement.type === "partie-envoyee" ? "envoyee" : evenement.type === "deja-envoyee" ? "deja" : "echec";
      const url = evenement.type === "echec-envoi" ? undefined : evenement.url;
      // L'envoi suit toujours l'annonce de sa partie. Sans annonce (rattrapage,
      // ou partie deja traitee), c'est une partie de plus.
      const enAttente = etat.parties[0];
      if (enAttente !== undefined && enAttente.statut === "envoi" && enAttente.nature === evenement.nature) {
        suivant.parties = [{ ...enAttente, statut, ...(url ? { url } : {}) }, ...etat.parties.slice(1)];
      } else {
        suivant.parties = [
          { nature: evenement.nature, statut, ...(url ? { url } : {}), numero },
          ...etat.parties,
        ];
      }
      break;
    }
    case "ligne":
      break;
  }
  return suivant;
}
