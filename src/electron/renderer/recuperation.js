/**
 * Colonne de droite, vue par defaut : le formulaire de recuperation, puis
 * l'apercu des matchs trouves avant de les enregistrer.
 */

import { api, bandeau, cacheLesBandeaux, elements, messageDe } from "./elements.js";
import { etat, montreLaVue } from "./etat.js";
import { rafraichisLaListe } from "./liste.js";
import { construisLesMatchs, ecrisLeResume } from "./matchs.js";

/**
 * `2026-08-19T21:00` -> `2026-08-19 21:00`, le format attendu par le noyau.
 * @param {string} valeur
 */
function versFormatNoyau(valeur) {
  return valeur ? valeur.replace("T", " ") : undefined;
}

/**
 * Instant local au format d'un champ datetime-local.
 * @param {Date} date
 */
function versChampDate(date) {
  /** @param {number} nombre */
  const deuxChiffres = (nombre) => String(nombre).padStart(2, "0");
  return (
    `${date.getFullYear()}-${deuxChiffres(date.getMonth() + 1)}-` +
    `${deuxChiffres(date.getDate())}T${deuxChiffres(date.getHours())}:` +
    `${deuxChiffres(date.getMinutes())}`
  );
}

/**
 * Pre-remplit la fenetre type d'une session de club : ce soir 21:00 ->
 * maintenant. Si on lance l'appli avant 21:00, la borne basse serait apres la
 * borne haute : on retombe alors sur les deux dernieres heures.
 */
export function preRemplisLaFenetre() {
  const maintenant = new Date();
  const debut = new Date(maintenant);
  debut.setHours(21, 0, 0, 0);
  if (debut.getTime() >= maintenant.getTime()) {
    debut.setTime(maintenant.getTime() - 2 * 60 * 60 * 1000);
    debut.setSeconds(0, 0);
  }
  elements.debut.value = versChampDate(debut);
  elements.fin.value = versChampDate(maintenant);
}

function litLeFormulaire() {
  return {
    user: elements.compte.value.trim(),
    name: elements.nom.value.trim() || undefined,
    type: elements.type.value || undefined,
    lobby: elements.lobby.value || undefined,
    from: versFormatNoyau(elements.debut.value) ?? "",
    to: versFormatNoyau(elements.fin.value),
  };
}

/** @param {boolean} verrouille */
function verrouilleLeFormulaire(verrouille) {
  elements.formulaire.setAttribute("aria-busy", String(verrouille));
  elements.bouton.disabled = verrouille;
  elements.bouton.textContent = verrouille ? "Prévisualisation…" : "Prévisualiser";
  for (const champ of elements.formulaire.elements) {
    if (champ !== elements.bouton && "disabled" in champ) champ.disabled = verrouille;
  }
}

elements.formulaire.addEventListener("submit", async (evenement) => {
  evenement.preventDefault();
  cacheLesBandeaux();

  const saisie = litLeFormulaire();
  if (!saisie.from) {
    bandeau(elements.erreur, "Indiquez le début de la session.");
    return;
  }

  verrouilleLeFormulaire(true);
  bandeau(elements.progression, "Interrogation de stat.ink…");

  const desabonne = api.onFetchProgress((avancement) => {
    bandeau(
      elements.progression,
      `Page ${avancement.page} lue, ${avancement.totalKeptSoFar} match(s) retenu(s).`,
    );
  });

  try {
    const resultat = await api.previewSession(saisie);
    bandeau(elements.progression, "");
    etat.apercuCourant = resultat;

    ecrisLeResume(elements.apercuResume, resultat);
    elements.apercuMatchs.replaceChildren(...construisLesMatchs(resultat.rows));
    montreLaVue("apercu");

    if (resultat.battleCount === 0) {
      // Enregistrable quand meme : une soiree sans match est une information.
      bandeau(
        elements.avertissement,
        "Aucun match trouvé. Vérifiez la fenêtre de temps, le fuseau horaire, " +
          "le filtre de lobby, et que les matchs ont bien été envoyés à stat.ink.",
      );
    }
  } catch (erreur) {
    // Les valeurs saisies restent en place : on ne fait pas retaper le formulaire.
    bandeau(elements.progression, "");
    bandeau(elements.erreur, messageDe(erreur));
  } finally {
    desabonne();
    verrouilleLeFormulaire(false);
  }
});

elements.boutonEnregistrer.addEventListener("click", async () => {
  if (etat.apercuCourant === undefined) return;
  cacheLesBandeaux();
  elements.boutonEnregistrer.disabled = true;
  try {
    const resume = await api.saveSession(etat.apercuCourant.previewId);
    etat.apercuCourant = undefined;
    elements.nom.value = "";
    bandeau(
      elements.succes,
      resume.ajoutees === undefined
        ? `${resume.battleCount} match(s) enregistré(s). Écrit dans ${resume.path}`
        : // Le fichier existait : il a ete complete, pas remplace.
          `Session déjà enregistrée, complétée : ${resume.ajoutees} nouvelle(s) manche(s), ` +
            `${resume.battleCount} au total. Objectif, ressenti et équipes conservés.`,
    );
    await rafraichisLaListe();
    montreLaVue("formulaire");
  } catch (erreur) {
    bandeau(elements.erreur, messageDe(erreur));
  } finally {
    elements.boutonEnregistrer.disabled = false;
  }
});

elements.boutonAnnuler.addEventListener("click", () => {
  etat.apercuCourant = undefined;
  cacheLesBandeaux();
  montreLaVue("formulaire");
});
