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

  const change = (suivant: EtatDeVeille) => {
    etat = suivant;
    onChange(etat);
  };

  /** Une veille terminee, quelle qu'en soit la raison : plus de phase, plus de decompte. */
  const terminee = (complement: Partial<EtatDeVeille>) => {
    const { phase: _phase, decompte: _decompte, ...reste } = etat;
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

  return { etat: () => etat, demarre, arrete, capture };
}
