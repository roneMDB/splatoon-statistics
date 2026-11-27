/**
 * Fait tourner la veille s3s : un processus a la fois, lance et arrete a la
 * demande, et dont chaque ligne de sortie met a jour l'etat suivi par la
 * fenetre.
 *
 * N'importe pas `electron` : le lanceur de processus est passe en argument, ce
 * qui permet de tester sans rien lancer. Le sens des commandes est dans
 * `src/veille.ts`.
 */

import type { SpawnOptions } from "node:child_process";
import {
  appliqueLaLigne,
  commandeSysteme,
  creeLeDecoupeur,
  etatAuDemarrage,
  etatInitial,
  scriptDArret,
  scriptDeCapture,
  scriptDeLancement,
  scriptDeLiberation,
  scriptDeVerification,
  peutVerifierMaintenant,
  type EtatDeVeille,
  type ReglageDeVeille,
} from "../veille.ts";

/** Ce que la veille utilise d'un processus fils : de quoi lire sa sortie et sa fin. */
export type ProcessusDeVeille = {
  stdout: NodeJS.ReadableStream | null;
  stderr: NodeJS.ReadableStream | null;
  on(evenement: "error", ecouteur: (erreur: Error) => void): unknown;
  on(evenement: "close", ecouteur: (code: number | null) => void): unknown;
};

export type Lanceur = (fichier: string, args: string[], options: SpawnOptions) => ProcessusDeVeille;

export type Veille = {
  etat: () => EtatDeVeille;
  /** Sans effet si une veille tourne deja. */
  demarre: () => EtatDeVeille;
  /** Demande l'arret (Ctrl+C) et rend la main sans attendre la fin de la verification finale. */
  arrete: () => Promise<EtatDeVeille>;
  /**
   * Fait verifier s3s tout de suite, sans attendre la fin du decompte. Sans
   * effet hors de l'attente ; rend la main des que le signal est transmis.
   */
  verifieMaintenant: () => Promise<EtatDeVeille>;
  /**
   * Arrete la synchro qui tient le verrou (veille orpheline, cron, terminal),
   * puis lance la veille. Sans effet si une veille de l'application tourne.
   */
  forceEtRelance: () => Promise<EtatDeVeille>;
  /** Rend vrai une fois la veille arretee, faux si `delaiMs` passe avant. */
  attendsLaFin: (delaiMs: number) => Promise<boolean>;
  /** La capture de l'emulateur nommee par STU, en URL `data:` ; `undefined` si elle est illisible. */
  capture: (chemin: string) => Promise<string | undefined>;
};

/**
 * `stdio` : rien en entree - s3s ne doit jamais attendre une reponse au
 * clavier. `windowsHide` : sous Windows, `wsl.exe` ouvrirait sinon une console.
 */
const OPTIONS: SpawnOptions = { stdio: ["ignore", "pipe", "pipe"], windowsHide: true };

export function creeLaVeille(dependances: {
  lance: Lanceur;
  plateforme: NodeJS.Platform;
  reglage: ReglageDeVeille;
  /** Appele a chaque changement d'etat, decompte compris (une fois par seconde). */
  onChange: (etat: EtatDeVeille) => void;
}): Veille {
  const { lance, plateforme, reglage, onChange } = dependances;
  const disponible = commandeSysteme(plateforme, "", reglage) !== undefined;

  let etat: EtatDeVeille = disponible ? etatInitial() : { ...etatInitial(), indisponible: true };

  const lisLeStatut = () => etat.statut;

  /** Ceux qui attendent la fin de la veille. */
  let enAttenteDeLaFin: (() => void)[] = [];

  const change = (suivant: EtatDeVeille) => {
    etat = suivant;
    onChange(etat);
    if (etat.statut === "arretee" && enAttenteDeLaFin.length > 0) {
      const aPrevenir = enAttenteDeLaFin;
      enAttenteDeLaFin = [];
      for (const previens of aPrevenir) previens();
    }
  };

  function attendsLaFin(delaiMs: number): Promise<boolean> {
    if (etat.statut === "arretee") return Promise.resolve(true);
    return new Promise((resolve) => {
      const minuterie = setTimeout(() => resolve(false), delaiMs);
      enAttenteDeLaFin.push(() => {
        clearTimeout(minuterie);
        resolve(true);
      });
    });
  }

  /** Une veille terminee, quelle qu'en soit la raison : plus de phase, plus de decompte. */
  const terminee = (complement: Partial<EtatDeVeille>) => {
    const { phase: _phase, decompte: _decompte, verificationDemandee: _demandee, ...reste } = etat;
    change({ ...reste, ...complement, statut: "arretee" });
  };

  function demarre(): EtatDeVeille {
    if (etat.statut !== "arretee" || etat.indisponible) return etat;
    const commande = commandeSysteme(plateforme, scriptDeLancement(reglage.commande), reglage)!;

    change(etatAuDemarrage());
    const enfant = lance(commande.fichier, commande.args, OPTIONS);

    for (const flux of [enfant.stdout, enfant.stderr]) {
      if (flux === null) continue;
      const decoupeur = creeLeDecoupeur();
      flux.setEncoding("utf8");
      flux.on("data", (morceau: string) => {
        let suivant = etat;
        for (const ligne of decoupeur.pousse(morceau)) suivant = appliqueLaLigne(suivant, ligne);
        if (suivant !== etat) change(suivant);
      });
      flux.on("end", () => {
        let suivant = etat;
        for (const ligne of decoupeur.vide()) suivant = appliqueLaLigne(suivant, ligne);
        if (suivant !== etat) change(suivant);
      });
    }

    // `error` : le programme n'a pas pu etre lance (`wsl.exe` absent, par
    // exemple). `close` suit alors, ou non : on ne compte pas dessus.
    enfant.on("error", (erreur) => {
      if (etat.statut !== "arretee") terminee({ erreur: `Lancement impossible : ${erreur.message}` });
    });
    enfant.on("close", (code) => {
      if (etat.statut !== "arretee") terminee({ codeDeSortie: code });
    });
    return etat;
  }

  async function arrete(): Promise<EtatDeVeille> {
    if (etat.statut !== "en-cours") return etat;
    change({ ...etat, statut: "arret-demande" });

    const commande = commandeSysteme(plateforme, scriptDArret(), reglage)!;
    const code = await new Promise<number | null>((resolve) => {
      const enfant = lance(commande.fichier, commande.args, { ...OPTIONS, stdio: "ignore" });
      enfant.on("error", () => resolve(null));
      enfant.on("close", resolve);
    });

    // L'arret n'a pas pu etre transmis : la veille tourne toujours, on le dit
    // plutot que d'afficher un « Arret en cours… » qui n'aboutira jamais.
    // `lisLeStatut()` et non `etat.statut` : TypeScript garde le statut lu
    // avant l'attente, alors que la veille a pu finir entre-temps.
    if (code !== 0 && lisLeStatut() === "arret-demande") {
      change({ ...etat, statut: "en-cours", erreur: "L'arrêt n'a pas pu être transmis à la veille." });
    }
    return etat;
  }

  async function verifieMaintenant(): Promise<EtatDeVeille> {
    if (!peutVerifierMaintenant(etat)) return etat;
    const { erreur: _erreur, ...reste } = etat;
    change({ ...reste, verificationDemandee: true });

    const commande = commandeSysteme(plateforme, scriptDeVerification(), reglage)!;
    const code = await new Promise<number | null>((resolve) => {
      const enfant = lance(commande.fichier, commande.args, { ...OPTIONS, stdio: "ignore" });
      enfant.on("error", () => resolve(null));
      enfant.on("close", resolve);
    });

    // Rien n'a recu le signal : s3s ne passe pas par son pilote. La demande
    // retombe, sinon le bouton resterait grise jusqu'a la verification suivante.
    if (code !== 0 && etat.verificationDemandee === true) {
      const { verificationDemandee: _demandee, ...sansDemande } = etat;
      change({
        ...sansDemande,
        erreur: "Vérification immédiate impossible : s3s ne passe pas par son pilote (voir stu-run.py).",
      });
    }
    return etat;
  }

  async function forceEtRelance(): Promise<EtatDeVeille> {
    if (etat.statut !== "arretee" || etat.indisponible || etat.liberation) return etat;
    const { erreur: _erreur, ...reste } = etat;
    change({ ...reste, liberation: true });

    const commande = commandeSysteme(plateforme, scriptDeLiberation(), reglage)!;
    const code = await new Promise<number | null>((resolve) => {
      const enfant = lance(commande.fichier, commande.args, { ...OPTIONS, stdio: "ignore" });
      enfant.on("error", () => resolve(null));
      enfant.on("close", resolve);
    });

    const { liberation: _liberation, ...sansLiberation } = etat;
    if (code !== 0) {
      change({
        ...sansLiberation,
        erreur:
          code === 2
            ? "Impossible de forcer : fuser est absent de WSL (paquet psmisc)."
            : "La synchro en cours ne s'est pas arrêtée : réessayez, ou voir ~/repositories/s3s/cron.log.",
      });
      return etat;
    }
    change(sansLiberation);
    return demarre();
  }

  async function capture(chemin: string): Promise<string | undefined> {
    const script = scriptDeCapture(chemin);
    if (script === undefined || etat.indisponible) return undefined;
    const commande = commandeSysteme(plateforme, script, reglage)!;
    return new Promise((resolve) => {
      const enfant = lance(commande.fichier, commande.args, OPTIONS);
      let base64 = "";
      enfant.stdout?.setEncoding("utf8");
      enfant.stdout?.on("data", (morceau: string) => {
        base64 += morceau;
      });
      enfant.on("error", () => resolve(undefined));
      enfant.on("close", (code) => {
        const propre = base64.trim();
        resolve(code === 0 && propre !== "" ? `data:image/png;base64,${propre}` : undefined);
      });
    });
  }

  return { etat: () => etat, demarre, arrete, verifieMaintenant, forceEtRelance, attendsLaFin, capture };
}
