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
 * `selection` n'est donnee que par l'apercu : chaque ligne porte une case a
 * cocher, et decocher une partie l'ajoute a `selection.exclues`. Toute la
 * ligne est une etiquette, cliquer n'importe ou bascule la case.
 *
 * @param {BattleRow[]} rows
 * @param {(rang: number) => void} [ouvre]
 * @param {{ exclues: Set<string>; auChangement: () => void }} [selection]
 */
export function construisLesMatchs(rows, ouvre, selection) {
  return rows.map((row, index) => {
    const ligne = /** @type {HTMLElement} */ (
      document.createElement(selection === undefined ? "div" : "label")
    );
    ligne.className = `match match--${row.result ?? "inconnu"}`;
    if (selection !== undefined) {
      const caseAcocher = document.createElement("input");
      caseAcocher.type = "checkbox";
      caseAcocher.className = "match__garder";
      caseAcocher.checked = !selection.exclues.has(row.uuid);
      caseAcocher.title = "Décocher pour ne pas enregistrer cette partie";
      ligne.classList.add("match--selectionnable");
      ligne.classList.toggle("match--exclue", !caseAcocher.checked);
      caseAcocher.addEventListener("change", () => {
        if (caseAcocher.checked) selection.exclues.delete(row.uuid);
        else selection.exclues.add(row.uuid);
        ligne.classList.toggle("match--exclue", !caseAcocher.checked);
        selection.auChangement();
      });
      ligne.append(caseAcocher);
    }
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
    for (const [valeur, classe] of /** @type {[string, string][]} */ ([
      [heure, ""],
      [row.rule ?? "—", "match__texte"],
      [row.stage ?? "—", "match__texte"],
      [row.resultLabel ?? "—", "match__resultat"],
    ])) {
      const cellule = document.createElement("span");
      if (classe) cellule.className = classe;
      cellule.textContent = valeur;
      ligne.append(cellule);
    }
    return ligne;
  });
}

/**
 * @param {HTMLElement} element
 * @param {{ battleCount: number; results: { win: number; lose: number } }} donnees
 * @param {number} [ecartees] Parties decochees dans l'apercu, deja retirees des comptes.
 */
export function ecrisLeResume(element, donnees, ecartees = 0) {
  element.textContent =
    `${donnees.battleCount} match(s) — ${donnees.results.win}V - ${donnees.results.lose}D` +
    (ecartees > 0 ? ` · ${ecartees} partie(s) écartée(s)` : "");
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
