/**
 * Lignes de matchs et formats de date, partages par l'apercu, la fiche et la
 * liste des sessions.
 */

import { etat } from "./etat.js";

/** @typedef {import("../../battleRows.ts").BattleRow} BattleRow */

/**
 * Tableau des matchs, partage par l'apercu et la fiche.
 *
 * `ouvre` n'est donne que par la fiche : l'apercu d'une recuperation n'a pas
 * encore de fichier sur disque, donc pas de manche a relire.
 *
 * @param {BattleRow[]} rows
 * @param {(rang: number) => void} [ouvre]
 */
export function construisLesMatchs(rows, ouvre) {
  return rows.map((row, index) => {
    const ligne = document.createElement("div");
    ligne.className = `match match--${row.result ?? "inconnu"}`;
    // La couleur de la ligne est celle du mode, comme sur la planche : vive
    // pour une victoire, matte pour le reste (voir `REGLES` dans `regles.ts`).
    const couleurs = etat.couleursDeRegle[row.ruleKey ?? ""] ?? etat.couleursDeRegle.inconnue;
    if (couleurs !== undefined) {
      ligne.style.setProperty("--regle", row.result === "win" ? couleurs.vive : couleurs.matte);
    }
    if (ouvre !== undefined) {
      ligne.classList.add("match--ouvrable");
      ligne.setAttribute("role", "button");
      ligne.setAttribute("tabindex", "0");
      ligne.addEventListener("click", () => ouvre(index));
      ligne.addEventListener("keydown", (evenement) => {
        if (evenement.key === "Enter" || evenement.key === " ") {
          evenement.preventDefault();
          ouvre(index);
        }
      });
    }
    const heure = row.startedAt ? formateLHeure(row.startedAt) : "—";
    // `row.result` reste la cle de mise en forme (classe CSS ci-dessus) ;
    // c'est `row.resultLabel` qui porte le libelle francais.
    const picto = document.createElement("span");
    picto.className = "match__picto";
    const uri = row.ruleKey === undefined ? undefined : etat.pictosDeRegle[row.ruleKey];
    if (uri !== undefined) picto.style.backgroundImage = `url("${uri}")`;
    ligne.append(picto);
    for (const valeur of [heure, row.rule ?? "—", row.stage ?? "—", row.resultLabel ?? "—"]) {
      const cellule = document.createElement("span");
      cellule.textContent = valeur;
      ligne.append(cellule);
    }
    return ligne;
  });
}

/**
 * @param {HTMLElement} element
 * @param {{ battleCount: number; results: { win: number; lose: number } }} donnees
 */
export function ecrisLeResume(element, donnees) {
  element.textContent =
    `${donnees.battleCount} match(s) — ${donnees.results.win}V - ${donnees.results.lose}D`;
}

/** @param {string} iso */
export function formateLaDate(iso) {
  return new Date(iso).toLocaleString("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** @param {string} iso */
export function formateLHeure(iso) {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}
