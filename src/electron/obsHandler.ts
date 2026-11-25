/**
 * Lance OBS a l'ouverture de l'application, s'il ne tourne pas deja.
 *
 * N'importe pas `electron` : le lanceur et le test d'existence sont passes en
 * argument, ce qui permet de tester sans rien lancer. Les commandes sont dans
 * `src/obs.ts`.
 */

import type { SpawnOptions } from "node:child_process";
import { obsTourne, type CommandesObs } from "../obs.ts";

/** Ce que l'ouverture d'OBS utilise d'un processus fils. */
export type ProcessusObs = {
  stdout: NodeJS.ReadableStream | null;
  on(evenement: "error", ecouteur: (erreur: Error) => void): unknown;
  on(evenement: "close", ecouteur: (code: number | null) => void): unknown;
  on(evenement: "spawn", ecouteur: () => void): unknown;
  unref(): void;
};

export type LanceurObs = (fichier: string, args: string[], options: SpawnOptions) => ProcessusObs;

export type ResultatObs =
  /** Plateforme sans OBS gere. */
  | { etat: "non-gere" }
  | { etat: "deja-lance" }
  | { etat: "lance" }
  | { etat: "introuvable"; chemin: string }
  | { etat: "echec"; message: string };

export async function demarreObsSiBesoin(dependances: {
  lance: LanceurObs;
  commandes: CommandesObs | undefined;
  existe: (chemin: string) => boolean;
}): Promise<ResultatObs> {
  const { lance, commandes, existe } = dependances;
  if (commandes === undefined) return { etat: "non-gere" };

  const { lecture, lancement } = commandes;
  const liste = await new Promise<{ code: number | null; sortie: string }>((resolve) => {
    const processus = lance(lecture.fichier, lecture.args, {
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    });
    let sortie = "";
    processus.stdout?.setEncoding("utf8");
    processus.stdout?.on("data", (morceau: string) => {
      sortie += morceau;
    });
    processus.on("error", () => resolve({ code: null, sortie }));
    processus.on("close", (code) => resolve({ code, sortie }));
  });
  // Sans lecture fiable, on ne lance rien : mieux vaut pas d'OBS que deux.
  if (liste.code !== 0) return { etat: "echec", message: "liste des processus illisible (tasklist)" };
  if (obsTourne(liste.sortie)) return { etat: "deja-lance" };
  if (!existe(lancement.fichier)) return { etat: "introuvable", chemin: lancement.fichier };

  // `detached` et `unref` : OBS vit sa vie, et fermer l'application ne le
  // ferme pas. Sa sortie ne va nulle part : personne ne la lirait.
  const processus = lance(lancement.fichier, lancement.args, {
    cwd: lancement.dossier,
    detached: true,
    stdio: "ignore",
  });
  return new Promise((resolve) => {
    processus.on("error", (erreur) => resolve({ etat: "echec", message: erreur.message }));
    processus.on("spawn", () => {
      processus.unref();
      resolve({ etat: "lance" });
    });
  });
}

/** La ligne de console qui dit ce qui s'est passe. */
export function messageObs(resultat: ResultatObs): string | undefined {
  switch (resultat.etat) {
    case "non-gere":
      return undefined;
    case "deja-lance":
      return "OBS tourne déjà.";
    case "lance":
      return "OBS lancé.";
    case "introuvable":
      return `OBS introuvable : ${resultat.chemin}`;
    case "echec":
      return `OBS non lancé : ${resultat.message}`;
  }
}
