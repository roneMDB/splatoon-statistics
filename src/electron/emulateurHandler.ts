// src/electron/emulateurHandler.ts
/**
 * Ouvre l'emulateur avec sa fenetre et l'eteint proprement, a la demande de
 * la fenetre ou a la fermeture de l'application.
 *
 * N'importe pas `electron` : le lanceur et l'attente sont passes en argument,
 * ce qui permet de tester sans rien lancer. Les scripts et le choix du bouton
 * sont dans `src/emulateur.ts`.
 */

import type { SpawnOptions } from "node:child_process";
import {
  boutonDEmulateur,
  FICHIER_JOURNAL_EMULATEUR,
  lisLaLecture,
  SCRIPT_D_ETAT,
  SCRIPT_D_EXTINCTION,
  SCRIPT_D_OUVERTURE,
  type BoutonDEmulateur,
  type EtatDEmulateur,
  type LectureDEmulateur,
} from "../emulateur.ts";
import { commandeSysteme, type ReglageDeVeille, type StatutDeVeille } from "../veille.ts";
import type { Lanceur, ProcessusDeVeille } from "./veilleHandler.ts";

/** L'etat tel que la fenetre le recoit : le bouton est deja choisi. */
export type EtatAffiche = EtatDEmulateur & { bouton: BoutonDEmulateur };

export type Emulateur = {
  etat: () => EtatAffiche;
  /** Relit l'etat (SDK, verrou du cron, emulateur) et le diffuse. */
  rafraichis: () => Promise<EtatAffiche>;
  /** Sans effet si le bouton ne propose pas d'ouvrir ; rend la main une fois l'emulateur allume. */
  ouvre: () => Promise<EtatAffiche>;
  /** Sans effet si le bouton ne propose pas d'eteindre ; rend la main une fois l'emulateur eteint. */
  eteint: () => Promise<EtatAffiche>;
  /** A la fermeture : eteint l'emulateur ouvert par l'application, 30 s au plus. */
  eteintSiOuvertParNous: () => Promise<void>;
};

export const INTERVALLE_DE_SUIVI_MS = 2000;
export const DUREE_DE_SUIVI_MS = 120_000;
export const DELAI_A_LA_FERMETURE_MS = 30_000;

/** Scripts courts : seule la sortie standard compte. */
const OPTIONS_COURTES: SpawnOptions = { stdio: ["ignore", "pipe", "ignore"], windowsHide: true };
/** L'emulateur ecrit dans son journal, pas dans un tube que personne ne viderait. */
const OPTIONS_D_OUVERTURE: SpawnOptions = { stdio: "ignore", windowsHide: true };

export function creeLEmulateur(dependances: {
  lance: Lanceur;
  plateforme: NodeJS.Platform;
  reglage: Pick<ReglageDeVeille, "distribution">;
  statutDeVeille: () => StatutDeVeille;
  onChange: (etat: EtatAffiche) => void;
  attends?: (ms: number) => Promise<void>;
}): Emulateur {
  const { lance, plateforme, reglage, statutDeVeille, onChange } = dependances;
  const attends = dependances.attends ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  let etat: EtatDEmulateur = { ouvertParNous: false };
  /** Le processus de l'emulateur ouvert par l'application, tant qu'il tourne. */
  let enfant: ProcessusDeVeille | undefined;

  const affiche = (): EtatAffiche => ({ ...etat, bouton: boutonDEmulateur(etat, statutDeVeille()) });
  const change = (suivant: EtatDEmulateur) => {
    etat = suivant;
    onChange(affiche());
  };
  /** Fin d'operation : plus d'operation, et l'erreur s'il y en a une. */
  const termine = (complement: Partial<EtatDEmulateur> = {}) => {
    const { operation: _operation, erreur: _erreur, ...reste } = etat;
    change({ ...reste, ...complement });
  };

  function execute(script: string): Promise<{ code: number | null; sortie: string }> {
    const commande = commandeSysteme(plateforme, script, reglage);
    if (commande === undefined) return Promise.resolve({ code: null, sortie: "" });
    return new Promise((resolve) => {
      const processus = lance(commande.fichier, commande.args, OPTIONS_COURTES);
      let sortie = "";
      processus.stdout?.setEncoding("utf8");
      processus.stdout?.on("data", (morceau: string) => {
        sortie += morceau;
      });
      processus.on("error", () => resolve({ code: null, sortie }));
      processus.on("close", (code) => resolve({ code, sortie }));
    });
  }

  /** Une lecture illisible (`wsl.exe` absent, par exemple) vaut `absent` : le bouton se cache. */
  async function lis(): Promise<LectureDEmulateur> {
    const { code, sortie } = await execute(SCRIPT_D_ETAT);
    return (code === 0 ? lisLaLecture(sortie) : undefined) ?? "absent";
  }

  async function rafraichis(): Promise<EtatAffiche> {
    const lecture = await lis();
    change({ ...etat, lecture });
    return affiche();
  }

  /**
   * Relit l'etat toutes les 2 s jusqu'a `attendue`, 2 min au plus, tant que
   * `continuer` le permet. Rend vrai si `attendue` a ete lue.
   */
  async function suis(attendue: LectureDEmulateur, continuer: () => boolean): Promise<boolean> {
    for (let ecoule = 0; ecoule < DUREE_DE_SUIVI_MS && continuer(); ecoule += INTERVALLE_DE_SUIVI_MS) {
      await attends(INTERVALLE_DE_SUIVI_MS);
      if (!continuer()) return false;
      const lecture = await lis();
      change({ ...etat, lecture });
      if (lecture === attendue) return true;
    }
    return false;
  }

  async function ouvre(): Promise<EtatAffiche> {
    const bouton = (await rafraichis()).bouton;
    if (!bouton.visible || !bouton.actif || bouton.action !== "ouvre") return affiche();
    const commande = commandeSysteme(plateforme, SCRIPT_D_OUVERTURE, reglage);
    if (commande === undefined) return affiche();

    const { erreur: _erreur, ...reste } = etat;
    change({ ...reste, operation: "ouverture", ouvertParNous: true });
    const processus = lance(commande.fichier, commande.args, OPTIONS_D_OUVERTURE);
    enfant = processus;
    let message = `L'émulateur n'a pas démarré : voir ${FICHIER_JOURNAL_EMULATEUR}.`;
    processus.on("error", (erreur) => {
      if (enfant !== processus) return;
      enfant = undefined;
      message = `Lancement impossible : ${erreur.message}`;
      change({ ...etat, ouvertParNous: false });
    });
    processus.on("close", () => {
      if (enfant !== processus) return;
      enfant = undefined;
      change({ ...etat, ouvertParNous: false });
    });

    const allume = await suis("allume", () => enfant === processus);
    termine(allume ? {} : { erreur: message });
    return affiche();
  }

  /** Sans garde : la fermeture eteint meme pendant l'arret de la veille. */
  async function eteindre(): Promise<EtatAffiche> {
    const { erreur: _erreur, ...reste } = etat;
    change({ ...reste, operation: "extinction" });
    const { code } = await execute(SCRIPT_D_EXTINCTION);
    if (code !== 0) {
      termine({ erreur: "L'extinction n'a pas pu être transmise à l'émulateur." });
      return affiche();
    }
    const eteint = await suis("eteint", () => true);
    termine(eteint ? {} : { erreur: "L'émulateur ne s'est pas éteint en 2 minutes." });
    return affiche();
  }

  async function eteint(): Promise<EtatAffiche> {
    const bouton = (await rafraichis()).bouton;
    if (!bouton.visible || !bouton.actif || bouton.action !== "eteint") return affiche();
    return eteindre();
  }

  async function eteintSiOuvertParNous(): Promise<void> {
    if (enfant === undefined) return;
    await Promise.race([eteindre(), attends(DELAI_A_LA_FERMETURE_MS)]);
  }

  return { etat: affiche, rafraichis, ouvre, eteint, eteintSiOuvertParNous };
}
