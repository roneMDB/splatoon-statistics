/**
 * Fiche d'une session ecrite : ses champs modifiables, ses manches, et de quoi
 * l'enregistrer, la completer ou la supprimer.
 */

import { cacheLaPlanche, cacheLeCompteRendu } from "./compteRendu.js";
import { api, bandeau, cacheLesBandeaux, elements, messageDe } from "./elements.js";
import { etat, montreLaVue } from "./etat.js";
import { rafraichisLaListe } from "./liste.js";
import { ouvreLaManche } from "./manche.js";
import { construisLesMatchs, formateLaDate, formateLHeure } from "./matchs.js";

/** @typedef {import("../../sessionList.ts").SessionSummary} SessionSummary */
/** @typedef {import("../../battleRows.ts").BattleRow} BattleRow */

/**
 * Ouvre la fiche d'une session existante : ses matchs, nom et type modifiables.
 * N'echoue jamais silencieusement : une lecture en erreur (fichier supprime ou
 * modifie entre le listing et le clic, etc.) est affichee dans le bandeau
 * d'erreur, comme pour les autres actions.
 *
 * @param {SessionSummary} session
 */
export async function ouvreLaFiche(session) {
  cacheLesBandeaux();
  try {
    const { summary, rows } = await api.readSession(session.path);
    etat.ficheCourante = summary;
    elements.ficheNom.value = summary.name ?? "";
    elements.ficheType.value = summary.type ?? "";
    elements.ficheEquipe.value = summary.nomEquipe ?? "";
    elements.ficheEquipeAdverse.value = summary.nomEquipeAdverse ?? "";
    elements.ficheObjectif.value = summary.objectif ?? "";
    elements.ficheRessenti.value = summary.ressenti ?? "";
    // Un compte rendu et une planche affiches appartiennent a la session
    // precedente : on les vide.
    cacheLeCompteRendu();
    cacheLaPlanche();
    afficheLesManchesDeLaFiche(summary, rows);
    montreLaVue("fiche");
  } catch (erreur) {
    bandeau(elements.erreur, messageDe(erreur));
  }
}

/**
 * Resume et manches de la fiche. L'heure de la derniere manche recue dit, sans
 * ouvrir stat.ink, s'il en manque peut-etre encore : stat.ink recoit souvent
 * les dernieres avec retard, et « Completer la session » les rattrape.
 *
 * @param {SessionSummary} summary
 * @param {BattleRow[]} rows
 */
function afficheLesManchesDeLaFiche(summary, rows) {
  const derniere = rows.at(-1)?.startedAt;
  elements.ficheResume.textContent =
    `${formateLaDate(summary.window.from)} → ${formateLaDate(summary.window.to)}\n` +
    `${summary.battleCount} match(s) — ${summary.results.win}V - ${summary.results.lose}D` +
    (derniere ? ` · dernière manche reçue à ${formateLHeure(derniere)}` : "");
  etat.manchesCourantes = rows;
  elements.ficheMatchs.replaceChildren(...construisLesMatchs(rows, ouvreLaManche));
}

/** Les noms d'equipe en cours de saisie, qui priment sur ceux enregistres. */
export function equipesSaisies() {
  return {
    nomEquipe: elements.ficheEquipe.value.trim(),
    nomEquipeAdverse: elements.ficheEquipeAdverse.value.trim(),
  };
}

elements.boutonFicheEnregistrer.addEventListener("click", async () => {
  if (etat.ficheCourante === undefined) return;
  cacheLesBandeaux();
  elements.boutonFicheEnregistrer.disabled = true;
  try {
    const resume = await api.updateSession({
      path: etat.ficheCourante.path,
      name: elements.ficheNom.value.trim() || undefined,
      type: elements.ficheType.value || undefined,
      objectif: elements.ficheObjectif.value.trim() || undefined,
      ressenti: elements.ficheRessenti.value.trim() || undefined,
      nomEquipe: elements.ficheEquipe.value.trim() || undefined,
      nomEquipeAdverse: elements.ficheEquipeAdverse.value.trim() || undefined,
    });
    // Sans cela, la fiche garde le resume perime : une confirmation de
    // suppression juste apres un renommage afficherait encore l'ancien nom.
    etat.ficheCourante = resume;
    await rafraichisLaListe();
    bandeau(elements.succes, "Session modifiée.");
  } catch (erreur) {
    bandeau(elements.erreur, messageDe(erreur));
  } finally {
    elements.boutonFicheEnregistrer.disabled = false;
  }
});

/*
 * Les champs de la fiche ne sont pas touches : une saisie en cours, pas encore
 * enregistree, survit au rattrapage. Seuls le resume et les manches changent.
 */
elements.boutonCompleter.addEventListener("click", async () => {
  if (etat.ficheCourante === undefined) return;
  cacheLesBandeaux();
  elements.boutonCompleter.disabled = true;
  bandeau(elements.progression, "Interrogation de stat.ink…");
  const desabonne = api.onFetchProgress((avancement) => {
    bandeau(
      elements.progression,
      `Page ${avancement.page} lue, ${avancement.totalKeptSoFar} match(s) retenu(s).`,
    );
  });
  try {
    const { summary, rows, ajoutees } = await api.completeSession(etat.ficheCourante.path);
    etat.ficheCourante = summary;
    afficheLesManchesDeLaFiche(summary, rows);
    // Un compte rendu ou une planche affiches ne comptent pas les manches ajoutees.
    if (ajoutees > 0) {
      cacheLeCompteRendu();
      cacheLaPlanche();
    }
    bandeau(elements.progression, "");
    bandeau(
      elements.succes,
      ajoutees === 0
        ? "Aucune nouvelle manche sur stat.ink."
        : `${ajoutees} nouvelle(s) manche(s) ajoutée(s).`,
    );
    await rafraichisLaListe();
  } catch (erreur) {
    bandeau(elements.progression, "");
    bandeau(elements.erreur, messageDe(erreur));
  } finally {
    desabonne();
    elements.boutonCompleter.disabled = false;
  }
});

elements.boutonSupprimer.addEventListener("click", async () => {
  if (etat.ficheCourante === undefined) return;
  const nom = etat.ficheCourante.name ?? "cette session sans nom";
  if (!window.confirm(`Supprimer définitivement « ${nom} » ? Cette action est irréversible.`)) {
    return;
  }
  cacheLesBandeaux();
  elements.boutonSupprimer.disabled = true;
  try {
    await api.deleteSession(etat.ficheCourante.path);
    etat.ficheCourante = undefined;
    await rafraichisLaListe();
    montreLaVue("formulaire");
    bandeau(elements.succes, `Session « ${nom} » supprimée.`);
  } catch (erreur) {
    bandeau(elements.erreur, messageDe(erreur));
  } finally {
    elements.boutonSupprimer.disabled = false;
  }
});

elements.boutonRetour.addEventListener("click", () => {
  etat.ficheCourante = undefined;
  montreLaVue("formulaire");
});
