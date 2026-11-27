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
 * **Ce que l'application lit.** s3s passe par un pilote,
 * `outils/s3s_pilote.py` (glisse par `~/repositories/s3s/stu-run.py`), qui
 * ecrit un evenement JSON par ligne, precede de `MARQUE_DU_PILOTE`, quand
 * `SPLATOON_VEILLE_EVENEMENTS=1`. Seuls les messages de STU et de
 * `upload.sh`, qui ne passent pas par s3s, sont encore lus comme du texte.
 *
 * **Ou tourne la commande.** `s3s-sync` vit dans WSL (il pilote un emulateur
 * Android par KVM). Sous WSL ou Linux, on lance `bash` directement ; sous
 * Windows, a travers `wsl.exe`. Ailleurs, la veille n'est pas proposee.
 */

import { cleDuStageSplatnet, libelleDuMode, libelleDuStage } from "./libelles.fr.ts";

/** Ce que les reglages disent de la veille. */
export type ReglageDeVeille = {
  /** Commande lancee dans un shell de connexion bash, telle qu'on la taperait. */
  commande: string;
  /** Distribution WSL visee depuis Windows ; vide : celle par defaut. */
  distribution: string;
};

/** Verrou pris par `s3s-sync` (veille, cron ou terminal) le temps d'une synchro. */
export const VERROU_S3S = "/tmp/s3s-upload.lock";

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
 * Une veille dont le groupe vit encore (lancee par une instance precedente
 * de l'application, fermee sans l'arreter) garde la place : la nouvelle le
 * dit avec le message de `s3s-sync`, et ne touche pas au fichier pid, sans
 * quoi plus rien ne pourrait arreter l'ancienne. Pour la meme raison, une
 * veille n'efface en partant que son propre pid.
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
    `if [ -s ${fichierPid} ] && kill -0 -- -"$(cat ${fichierPid})" 2>/dev/null; then ` +
      `echo "$(date '+%F %T') : une synchro est déjà en cours, on passe."; exit 0; fi`,
    `echo $$ > ${fichierPid}`,
    "export PYTHONUNBUFFERED=1",
    // Le pilote de s3s n'emet ses evenements que pour l'application.
    "export SPLATOON_VEILLE_EVENEMENTS=1",
    "set -o pipefail",
    `mkdir -p "$(dirname ${FICHIER_JOURNAL})"`,
    `{ ${commande}\n} 2>&1 | tee -i -p ${FICHIER_JOURNAL}`,
    // Un pid laisse derriere soi finirait par designer un autre processus.
    `rc=$?; [ "$(cat ${fichierPid} 2>/dev/null)" = "$$" ] && rm -f ${fichierPid}; exit $rc`,
  ].join("; ");
  return `exec setsid -w bash -c ${entreGuillemets(interieur)}`;
}


/**
 * Le script bash qui lit une capture de l'emulateur, en base64 sur une ligne,
 * pour que la fenetre l'affiche. Passer par bash plutot que par le disque de
 * l'hote : sous Windows, la capture vit dans WSL.
 *
 * Le chemin vient de la sortie de STU : seul un PNG designe par un chemin
 * absolu est lu. Rend `undefined` pour tout autre chemin.
 */
export function scriptDeCapture(chemin: string): string | undefined {
  if (!/^\/.*\.png$/i.test(chemin)) return undefined;
  return `base64 -w0 -- ${entreGuillemets(chemin)}`;
}

/** Le script bash qui arrete la veille : Ctrl+C, adresse a tout son groupe. */
export function scriptDArret(fichierPid: string = FICHIER_PID): string {
  return `[ -s ${fichierPid} ] && kill -INT -- -"$(cat ${fichierPid})"`;
}

/**
 * Le script bash qui demande une verification tout de suite, sans attendre la
 * fin du decompte.
 *
 * s3s ne sait pas ecourter son attente : c'est son pilote (`outils/s3s_pilote.py`,
 * ou l'ancien `s3s-relance.py`), par lequel `stu-run.py` fait passer s3s, qui
 * saute le reste du decompte a la reception de SIGUSR1. Le signal vise ce seul
 * processus, dans le groupe de la veille : l'action par defaut de SIGUSR1 tue,
 * et tout autre processus du groupe (bash, tee, s3s lance sans pilote) en
 * mourrait. Rend 1 si le pilote ne tourne pas.
 */
export function scriptDeVerification(fichierPid: string = FICHIER_PID): string {
  return `[ -s ${fichierPid} ] && pkill -USR1 -g "$(cat ${fichierPid})" -f 's3s(_pilote|-relance)\\.py '`;
}

/**
 * Le script bash qui libere le verrou de s3s, quel que soit celui qui le
 * tient : veille orpheline d'une instance precedente, cron, terminal.
 *
 * `fuser` donne les processus qui ont le verrou ouvert ; on vise leur groupe
 * entier, comme le ferait un Ctrl+C dans leur terminal : s3s fait sa
 * verification finale, rien n'est perdu. Si le verrou tient encore apres
 * `delaiDOuverture` secondes (Splashcat compris), SIGTERM, puis encore
 * `delaiDeFermeture` secondes. Jamais le groupe de ce script, ni celui
 * d'init.
 *
 * Rend 0 une fois le verrou libre (ou s'il l'etait deja), 1 sinon, 2 sans
 * `fuser`.
 */
export function scriptDeLiberation(
  verrou: string = VERROU_S3S,
  delaiDInterruption = 150,
  delaiDeTerminaison = 15,
): string {
  const v = entreGuillemets(verrou);
  return [
    "command -v fuser >/dev/null || exit 2",
    `libre() { flock -n ${v} true 2>/dev/null; }`,
    "libre && exit 0",
    'moi=$(ps -o pgid= -p $$ | tr -d " ")',
    "groupes() {",
    `  for p in $(fuser ${v} 2>/dev/null); do ps -o pgid= -p "$p"; done | tr -d " " | sort -u | grep -vx -e "$moi" -e 0 -e 1`,
    "}",
    'signale() { for g in $(groupes); do kill -"$1" -- -"$g" 2>/dev/null; done; }',
    'attends() { for _ in $(seq "$1"); do libre && return 0; sleep 1; done; return 1; }',
    `signale INT; attends ${delaiDInterruption} && exit 0`,
    `signale TERM; attends ${delaiDeTerminaison} && exit 0`,
    "exit 1",
  ].join("\n");
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

/** Resultat d'une partie, dans les mots de s3s : en anglais, quelle que soit la langue du jeu. */
export type Resultat = "Victory" | "Defeat" | "Draw" | "Clear";

/** Debut des lignes que le pilote de s3s ecrit pour l'application. */
export const MARQUE_DU_PILOTE = "@@splatoon-veille";

/** Version du contrat que cette application sait lire (`VERSION` du pilote). */
export const VERSION_DU_PILOTE = 1;

/**
 * Une partie, telle que le pilote la decrit : ce que s3s envoie a stat.ink,
 * puis l'issue de l'envoi. Les dates sont en secondes depuis l'epoque.
 */
export type PartieDuPilote = {
  nature: "battle" | "job";
  statut: "envoi" | "envoyee" | "deja" | "echec";
  /** Uuid de la partie chez stat.ink : l'annonce et l'issue le partagent. */
  id?: string;
  debut?: number;
  fin?: number;
  /** Cle stat.ink de la regle (`area`). */
  regle?: string;
  lobby?: string;
  /** Numero SplatNet du stage (`10`). */
  stage?: string;
  /** `win`, `lose`, `draw`, `exempted_lose` ; `clear` ou `fail` en Salmon Run. */
  resultat?: string;
  ko?: boolean;
  url?: string;
  /** Reponse de stat.ink a un envoi rate. */
  message?: string;
};

/** Ce qu'une ligne de sortie annonce. */
export type EvenementDeVeille =
  | { type: "pilote"; version: number }
  | { type: "jetons" }
  | { type: "rattrapage" }
  | { type: "decompte"; secondes: number }
  | { type: "verification"; finale: boolean }
  | { type: "partie"; partie: PartieDuPilote }
  | { type: "splashcat" }
  | { type: "deja-en-cours" }
  | { type: "splatnet-inaccessible" }
  | { type: "jetons-introuvables" }
  | { type: "capture"; chemin: string }
  | { type: "s3s-sans-pilote" }
  | { type: "ligne" };

/** Les couleurs du terminal (`\x1b[93m`) que s3s ecrit meme sans terminal. */
const ECHAPPEMENTS_ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;

/** Nettoie une ligne brute : couleurs retirees, blancs de bord aussi. */
export const nettoieLaLigne = (ligne: string): string => ligne.replace(ECHAPPEMENTS_ANSI, "").trim();

/**
 * Les messages de STU (`splatnet3-token-util/main.py`) et de `upload.sh`, qui
 * ne passent pas par le pilote, dans l'ordre ou on les essaie.
 */
const MOTIFS: readonly [RegExp, (trouve: RegExpExecArray) => EvenementDeVeille][] = [
  [/^(Booting emulator|Waiting for emulator to complete)/, () => ({ type: "jetons" })],
  [/^--- splashcat/, () => ({ type: "splashcat" })],
  [/une synchro est déjà en cours, on passe/, () => ({ type: "deja-en-cours" })],
  [/^Could not open SplatNet3 app in \d+ attempts/, () => ({ type: "splatnet-inaccessible" })],
  [/^Could not find all requested tokens in \d+ attempts/, () => ({ type: "jetons-introuvables" })],
  [/^A screenshot with SplatNet3 opened was saved to "(.+)"\.?$/, (t) => ({ type: "capture", chemin: t[1]! })],
  // s3s entre en veille : sans evenement du pilote avant, il tourne sans lui.
  [/^Waiting for new /, () => ({ type: "s3s-sans-pilote" })],
];

const estUnObjet = (valeur: unknown): valeur is Record<string, unknown> =>
  typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);

const STATUTS_DU_PILOTE: ReadonlySet<string> = new Set(["envoi", "envoyee", "deja", "echec"]);

/** Valide une partie du pilote : seuls les champs du bon type sont gardes. */
function lisLaPartie(brute: Record<string, unknown>): PartieDuPilote | undefined {
  const nature = brute["nature"];
  const statut = brute["statut"];
  if ((nature !== "battle" && nature !== "job") || typeof statut !== "string" || !STATUTS_DU_PILOTE.has(statut)) {
    return undefined;
  }
  const partie: PartieDuPilote = { nature, statut: statut as PartieDuPilote["statut"] };
  for (const cle of ["id", "regle", "lobby", "stage", "resultat", "url", "message"] as const) {
    const valeur = brute[cle];
    if (typeof valeur === "string") partie[cle] = valeur;
  }
  for (const cle of ["debut", "fin"] as const) {
    const valeur = brute[cle];
    if (typeof valeur === "number" && Number.isFinite(valeur)) partie[cle] = valeur;
  }
  if (typeof brute["ko"] === "boolean") partie.ko = brute["ko"];
  return partie;
}

/**
 * Lit un evenement du pilote. Ce qui n'est pas un evenement connu, bien forme,
 * ne va qu'au journal : un pilote plus recent ne doit pas faire tomber la
 * veille.
 */
function lisLEvenement(json: string): EvenementDeVeille {
  let brut: unknown;
  try {
    brut = JSON.parse(json);
  } catch {
    return { type: "ligne" };
  }
  if (!estUnObjet(brut)) return { type: "ligne" };
  switch (brut["type"]) {
    case "pilote":
      return typeof brut["version"] === "number" ? { type: "pilote", version: brut["version"] } : { type: "ligne" };
    case "rattrapage":
      return { type: "rattrapage" };
    case "jetons-expires":
      return { type: "jetons" };
    case "decompte":
      return typeof brut["secondes"] === "number" ? { type: "decompte", secondes: brut["secondes"] } : { type: "ligne" };
    case "verification":
      return { type: "verification", finale: brut["finale"] === true };
    case "partie": {
      const partie = lisLaPartie(brut);
      return partie === undefined ? { type: "ligne" } : { type: "partie", partie };
    }
    default:
      return { type: "ligne" };
  }
}

/** Ce qu'annonce une ligne deja nettoyee. Une ligne inconnue ne va qu'au journal. */
export function lisLigne(ligne: string): EvenementDeVeille {
  if (ligne.startsWith(MARQUE_DU_PILOTE)) return lisLEvenement(ligne.slice(MARQUE_DU_PILOTE.length));
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

/**
 * Ce qui empeche la veille d'avancer, et qu'elle ne reglera pas seule :
 *
 * - `splatnet-inaccessible` : STU a demarre l'emulateur mais n'a pas pu ouvrir
 *   SplatNet3. Le plus souvent, la Nintendo Switch App est revenue a l'ecran
 *   « Sign In » : STU va reessayer en boucle, pendant pres d'une heure, sans
 *   jamais y arriver. Parfois aussi un raté isole, que la tentative suivante
 *   rattrape : la capture permet de trancher.
 * - `jetons-introuvables` : STU a abandonne.
 */
export type AlerteDeVeille = "splatnet-inaccessible" | "jetons-introuvables";

/** Une partie vue passer pendant la veille, deja traduite pour la fenetre. */
export type PartieSuivie = {
  nature: "battle" | "job";
  /** Uuid chez stat.ink : relie l'issue d'un envoi a son annonce. */
  id?: string;
  /** Debut et fin du match, en ISO 8601. */
  debut?: string;
  fin?: string;
  /** Nom francais du stage ; absent en Salmon Run. */
  stage?: string;
  /** Nom francais de la regle. */
  regle?: string;
  resultat?: Resultat;
  ko?: boolean;
  statut: "envoi" | "envoyee" | "deja" | "echec";
  url?: string;
  /** Reponse de stat.ink a un envoi rate. */
  message?: string;
  /** Rang d'arrivee, pour que la fenetre reconnaisse la plus recente. */
  numero: number;
};

const RESULTATS_DU_PILOTE: Record<string, Resultat> = {
  win: "Victory",
  lose: "Defeat",
  exempted_lose: "Defeat",
  draw: "Draw",
  clear: "Clear",
  fail: "Defeat",
};

const enIso = (secondes: number | undefined): string | undefined =>
  secondes === undefined ? undefined : new Date(secondes * 1000).toISOString();

/** Traduit une partie du pilote pour la fenetre. */
export function partieSuivie(partie: PartieDuPilote, numero: number): PartieSuivie {
  const cleDuStage =
    partie.nature === "battle" && partie.stage !== undefined ? cleDuStageSplatnet(partie.stage) : undefined;
  const champs: Omit<PartieSuivie, "nature" | "statut" | "numero"> = {
    id: partie.id,
    debut: enIso(partie.debut),
    fin: enIso(partie.fin),
    stage:
      partie.nature === "battle" && partie.stage !== undefined
        ? libelleDuStage(cleDuStage, cleDuStage === undefined ? `stage ${partie.stage}` : undefined)
        : undefined,
    regle: partie.nature === "battle" && partie.regle !== undefined ? libelleDuMode(partie.regle) : undefined,
    resultat: partie.resultat === undefined ? undefined : RESULTATS_DU_PILOTE[partie.resultat],
    ko: partie.ko,
    url: partie.url,
    message: partie.message,
  };
  // Pas de cle a `undefined` : l'etat passe par IPC et se compare en JSON.
  const definis = Object.fromEntries(Object.entries(champs).filter(([, valeur]) => valeur !== undefined));
  return { nature: partie.nature, ...definis, statut: partie.statut, numero };
}

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
  /** Ce qui bloque la veille ; leve jusqu'a ce que s3s reparte avec des jetons valides. */
  alerte?: AlerteDeVeille;
  /** Derniere capture de l'emulateur laissee par STU (chemin Linux), tant que l'alerte tient. */
  capture?: string;
  /** « Vérifier maintenant » transmis, jusqu'a ce que s3s quitte son attente. */
  verificationDemandee?: true;
  /** « Forcer et relancer » : la synchro qui tient le verrou est en train de s'arreter. */
  liberation?: true;
  /** Version du pilote de s3s, des son premier evenement. */
  pilote?: number;
  /** s3s tourne sans pilote (`stu-run.py` ne le connait pas) : rien ne peut etre suivi. */
  sansPilote?: true;
};

/** Le bouton « Vérifier maintenant » n'a de sens que pendant le decompte d'une veille qui tourne. */
export const peutVerifierMaintenant = (etat: EtatDeVeille): boolean =>
  etat.statut === "en-cours" && etat.phase === "attente" && etat.verificationDemandee !== true;

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

  const evenement = lisLigne(ligne);
  const suivant: EtatDeVeille = { ...etat };
  // Le journal garde ce qu'un humain lirait : la sortie de s3s, pas les evenements.
  if (!ligne.startsWith(MARQUE_DU_PILOTE) && !estDuBruit(ligne)) {
    suivant.journal = [...etat.journal, ligne].slice(-TAILLE_DU_JOURNAL);
  }

  /** s3s fait cela avec des jetons valides : ce qui bloquait est leve. */
  const leveLAlerte = () => {
    delete suivant.alerte;
    delete suivant.capture;
  };
  /** L'attente est finie : la verification demandee a eu lieu, ou n'a plus lieu d'etre. */
  const quitteLAttente = () => {
    delete suivant.decompte;
    delete suivant.verificationDemandee;
  };

  switch (evenement.type) {
    case "pilote":
      suivant.pilote = evenement.version;
      delete suivant.sansPilote;
      break;
    case "s3s-sans-pilote":
      if (suivant.pilote === undefined) suivant.sansPilote = true;
      break;
    case "rattrapage":
      leveLAlerte();
      quitteLAttente();
      suivant.phase = "rattrapage";
      break;
    case "verification":
      leveLAlerte();
      quitteLAttente();
      suivant.phase = evenement.finale ? "verification-finale" : "verification";
      break;
    case "jetons":
    case "splashcat":
      quitteLAttente();
      suivant.phase = evenement.type;
      break;
    case "decompte":
      leveLAlerte();
      suivant.phase = "attente";
      suivant.decompte = evenement.secondes;
      break;
    case "deja-en-cours":
      suivant.dejaEnCours = true;
      break;
    case "splatnet-inaccessible":
      // L'abandon, plus grave, n'est pas recouvert par un echec qui le precede.
      if (suivant.alerte !== "jetons-introuvables") suivant.alerte = "splatnet-inaccessible";
      break;
    case "jetons-introuvables":
      suivant.alerte = "jetons-introuvables";
      break;
    case "capture":
      suivant.capture = evenement.chemin;
      break;
    case "partie": {
      // L'issue d'un envoi remplace son annonce, a la meme place.
      const id = evenement.partie.id;
      const rang = id === undefined ? -1 : etat.parties.findIndex((partie) => partie.id === id);
      if (rang === -1) {
        const numero = Math.max(0, ...etat.parties.map((partie) => partie.numero)) + 1;
        suivant.parties = [partieSuivie(evenement.partie, numero), ...etat.parties];
      } else {
        const ancienne = etat.parties[rang]!;
        suivant.parties = etat.parties.map((partie, i) =>
          i === rang ? partieSuivie(evenement.partie, ancienne.numero) : partie,
        );
      }
      break;
    }
    case "ligne":
      break;
  }
  return suivant;
}
