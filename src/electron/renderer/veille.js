/**
 * Veille s3s : un bouton pour la lancer et l'arreter, et le bilan de ce
 * qu'elle envoie a stat.ink. Le detail des parties envoyees vit dans la
 * colonne de droite (`envois.js`).
 *
 * L'etat vit dans le processus principal (`src/electron/veilleHandler.ts`) :
 * la fenetre le relit a l'ouverture et l'affiche a chaque changement, sans
 * rien en deduire elle-meme.
 */

import { api, elements, messageDe } from "./elements.js";
import { afficheLesEnvois, oublieLesEnvoisVus, retiensLesEnvoisVus } from "./envois.js";

/** @typedef {import("../../veille.ts").EtatDeVeille} EtatDeVeille */
/** @typedef {import("../../veille.ts").PartieSuivie} PartieSuivie */
/** @typedef {import("../emulateurHandler.ts").EtatAffiche} EtatDEmulateur */

/** Ce que dit la ligne d'etat, phase par phase. */
/** @type {Record<string, string>} */
const PHASES = {
  demarrage: "Démarrage…",
  jetons: "Rafraîchissement des jetons : l'émulateur démarre (3 à 5 minutes)…",
  rattrapage: "Rattrapage des parties pas encore envoyées…",
  attente: "En attente de nouvelles parties.",
  verification: "Vérification sur SplatNet…",
  "verification-finale": "Vérification finale avant de s'arrêter…",
  splashcat: "Envoi vers splashcat.ink…",
};

/** Ce que l'encart dit de chaque alerte. */
/** @type {Record<NonNullable<EtatDeVeille["alerte"]>, { titre: string; texte: string }>} */
const ALERTES = {
  "splatnet-inaccessible": {
    titre: "STU n'arrive pas à ouvrir SplatNet3",
    texte: "Il va réessayer, mais sans fin si la Nintendo Switch App est déconnectée. Ci-dessous, le dernier écran de l'émulateur.",
  },
  "jetons-introuvables": {
    titre: "STU a abandonné : pas de jetons",
    texte: "La veille ne peut plus rien envoyer. Ci-dessous, le dernier écran de l'émulateur.",
  },
};

/** Capture demandee en dernier : l'etat repasse chaque seconde, on ne la relit pas. */
/** @type {string | undefined} */
let captureDemandee;
/** L'encart etait-il deja visible : on relit l'emulateur a son apparition. */
let alerteVisible = false;
/** Action proposee par le bouton de l'emulateur, `undefined` s'il est grise. */
/** @type {"ouvre" | "eteint" | undefined} */
let actionDEmulateur;
/** Plus grand decompte vu depuis le debut de l'attente : la barre part de la. */
let decompteMax = 0;

/** @param {EtatDeVeille} etat */
function ligneDEtat(etat) {
  if (etat.statut === "arret-demande") {
    return etat.phase === "splashcat"
      ? "Arrêt demandé : envoi vers splashcat.ink…"
      : "Arrêt demandé : vérification finale avant de s'arrêter…";
  }
  if (etat.statut === "en-cours") {
    if (etat.sansPilote === true) {
      return "s3s tourne sans son pilote : rien ne peut être suivi ici. stu-run.py doit lancer outils/s3s_pilote.py (voir le README).";
    }
    if (etat.verificationDemandee === true) return "Vérification demandée…";
    if (etat.phase === "attente" && etat.decompte !== undefined) {
      return `En attente — prochaine vérification dans ${etat.decompte} s.`;
    }
    return PHASES[etat.phase ?? "demarrage"] ?? "";
  }
  if (etat.liberation === true) {
    return "Arrêt de la synchro en cours (vérification finale, jusqu'à 3 minutes), puis relance…";
  }
  if (etat.dejaEnCours) {
    return "Une synchro tient déjà la place (cron, terminal ou ancienne veille) : la veille n'a pas été lancée.";
  }
  if (etat.codeDeSortie === 0) return "Veille terminée.";
  if (etat.codeDeSortie !== undefined) {
    return `Veille terminée sur une erreur (code ${etat.codeDeSortie ?? "signal"}) : voir le journal.`;
  }
  return "À l'arrêt.";
}

/** @param {readonly PartieSuivie[]} parties */
function bilan(parties) {
  const envoyees = parties.filter((partie) => partie.statut === "envoyee");
  if (parties.length === 0) return "Aucune partie envoyée pour l'instant.";
  const victoires = envoyees.filter((partie) => partie.resultat === "Victory").length;
  const defaites = envoyees.filter((partie) => partie.resultat === "Defeat").length;
  const echecs = parties.filter((partie) => partie.statut === "echec").length;
  const morceaux = [
    `${envoyees.length} partie${envoyees.length > 1 ? "s" : ""} envoyée${envoyees.length > 1 ? "s" : ""}`,
  ];
  if (victoires + defaites > 0) morceaux.push(`${victoires} V / ${defaites} D`);
  if (echecs > 0) morceaux.push(`${echecs} échec${echecs > 1 ? "s" : ""}`);
  return morceaux.join(" — ");
}

/** @param {EtatDeVeille} etat */
function afficheLAlerte(etat) {
  const alerte = etat.alerte;
  elements.veilleAlerte.hidden = alerte === undefined;
  if (alerte !== undefined && !alerteVisible) void api.emulateurEtat().then(afficheLEmulateur).catch(() => {});
  alerteVisible = alerte !== undefined;
  if (alerte === undefined) {
    captureDemandee = undefined;
    elements.veilleCapture.hidden = true;
    elements.veilleCapture.removeAttribute("src");
    return;
  }
  elements.veilleAlerteTitre.textContent = ALERTES[alerte].titre;
  elements.veilleAlerteTexte.textContent = ALERTES[alerte].texte;

  const chemin = etat.capture;
  if (chemin === captureDemandee) return;
  captureDemandee = chemin;
  elements.veilleCapture.hidden = true;
  if (chemin === undefined) return;
  void api
    .veilleCapture(chemin)
    .then((image) => {
      // Une capture plus recente a pu etre demandee entre-temps.
      if (image === undefined || captureDemandee !== chemin) return;
      elements.veilleCapture.src = image;
      elements.veilleCapture.hidden = false;
    })
    .catch(() => {});
}

/**
 * Le bouton de l'emulateur, tel que le processus principal l'a choisi. Sans
 * bouton (pas de SDK Android, lecture impossible), les commandes a taper
 * restent affichees.
 * @param {EtatDEmulateur} etat
 */
function afficheLEmulateur(etat) {
  const bouton = etat.bouton;
  elements.veilleEmulateur.hidden = !bouton.visible;
  elements.emulateurManuel.hidden = bouton.visible;
  if (!bouton.visible) {
    actionDEmulateur = undefined;
    return;
  }
  elements.boutonEmulateur.textContent = bouton.libelle;
  elements.boutonEmulateur.disabled = !bouton.actif;
  actionDEmulateur = bouton.actif ? bouton.action : undefined;
  // Grise, la note dit pourquoi : elle va dans l'infobulle, pas sous les yeux.
  // Actif, la note est une erreur a lire : elle reste affichee.
  elements.boutonEmulateur.title = bouton.actif ? "" : bouton.note ?? "";
  elements.emulateurNote.textContent = bouton.actif ? bouton.note ?? "" : "";
}

/** @param {EtatDeVeille} etat */
function affiche(etat) {
  // L'encart reste en place, veille arretee comprise : il porte ses commandes.
  elements.veille.hidden = etat.indisponible === true;
  if (etat.indisponible === true) return;

  elements.veilleVoyant.dataset["statut"] = etat.statut;

  // Arretee, lancer est l'action principale ; en cours, c'est verifier, et
  // arreter passe au second plan.
  const bouton = elements.boutonVeille;
  bouton.disabled = etat.statut === "arret-demande" || etat.liberation === true;
  bouton.textContent =
    etat.statut === "arretee" ? "Lancer la veille" : etat.statut === "en-cours" ? "Arrêter" : "Arrêt en cours…";
  // Refusee par le verrou, la veille propose de forcer : c'est alors l'action
  // principale, et relancer simplement passe au second plan.
  const forcer = etat.statut === "arretee" && (etat.dejaEnCours || etat.liberation === true);
  elements.boutonForcer.hidden = !forcer;
  elements.boutonForcer.disabled = etat.liberation === true;
  elements.boutonForcer.textContent = etat.liberation === true ? "Arrêt de l'autre synchro…" : "Forcer et relancer";
  bouton.classList.toggle("bouton--discret", etat.statut !== "arretee" || forcer);
  bouton.textContent = forcer ? "Réessayer" : bouton.textContent;

  // Meme regle que `peutVerifierMaintenant` (src/veille.ts) : visible tant que
  // la veille tourne, actif pendant son decompte seulement.
  elements.boutonVerifier.hidden = etat.statut !== "en-cours";
  elements.boutonVerifier.disabled = etat.phase !== "attente" || etat.verificationDemandee === true;

  const decompte = etat.statut === "en-cours" && etat.phase === "attente" ? etat.decompte : undefined;
  elements.veilleDecompte.hidden = decompte === undefined;
  if (decompte === undefined) {
    decompteMax = 0;
  } else {
    decompteMax = Math.max(decompteMax, decompte, 1);
    elements.veilleDecompteBarre.style.width = `${(decompte / decompteMax) * 100}%`;
  }

  const rienAMontrer = etat.statut === "arretee" && etat.parties.length === 0;
  elements.veilleBilan.hidden = rienAMontrer;
  elements.veilleJournalBloc.hidden = etat.journal.length === 0;

  const erreur = etat.erreur;
  elements.veilleEtat.textContent = erreur ?? ligneDEtat(etat);
  elements.veilleEtat.classList.toggle("veille__etat--erreur", erreur !== undefined);

  afficheLAlerte(etat);

  elements.veilleBilan.textContent = bilan(etat.parties);

  afficheLesEnvois(etat);

  // Le journal suit la fin tant qu'on n'est pas remonte le lire.
  const journal = elements.veilleJournal;
  const enBas = journal.scrollTop + journal.clientHeight >= journal.scrollHeight - 4;
  journal.textContent = etat.journal.join("\n");
  if (enBas) journal.scrollTop = journal.scrollHeight;
}

elements.boutonVeille.addEventListener("click", async () => {
  try {
    const { statut } = await api.veilleEtat();
    if (statut === "arretee") {
      oublieLesEnvoisVus();
      affiche(await api.veilleStart());
    } else if (statut === "en-cours") {
      affiche(await api.veilleStop());
    }
  } catch (erreur) {
    elements.veille.hidden = false;
    elements.veilleEtat.textContent = messageDe(erreur);
    elements.veilleEtat.classList.add("veille__etat--erreur");
  }
});

elements.boutonForcer.addEventListener("click", () => {
  elements.boutonForcer.disabled = true;
  oublieLesEnvoisVus();
  void api
    .veilleForce()
    .then(affiche)
    .catch((erreur) => {
      elements.boutonForcer.disabled = false;
      elements.veilleEtat.textContent = messageDe(erreur);
      elements.veilleEtat.classList.add("veille__etat--erreur");
    });
});

elements.boutonVerifier.addEventListener("click", () => {
  // Grise tout de suite : l'etat suivant dira quand le reactiver.
  elements.boutonVerifier.disabled = true;
  void api
    .veilleVerifie()
    .then(affiche)
    .catch((erreur) => {
      elements.boutonVerifier.disabled = false;
      elements.veilleEtat.textContent = messageDe(erreur);
      elements.veilleEtat.classList.add("veille__etat--erreur");
    });
});

elements.boutonEmulateur.addEventListener("click", () => {
  const action = actionDEmulateur;
  if (action === undefined) return;
  // Grise tout de suite : le prochain etat arrive par `onEmulateurProgress`.
  elements.boutonEmulateur.disabled = true;
  const appel = action === "ouvre" ? api.emulateurOuvre() : api.emulateurEteint();
  void appel.then(afficheLEmulateur).catch((erreur) => {
    const message = messageDe(erreur);
    elements.emulateurNote.textContent = message;
    // Relit l'etat pour degriser le bouton. afficheLEmulateur efface la note :
    // on remet l'erreur si l'etat n'en donne pas.
    void api
      .emulateurEtat()
      .then((etat) => {
        afficheLEmulateur(etat);
        elements.emulateurNote.textContent ||= message;
      })
      .catch(() => {
        elements.boutonEmulateur.disabled = false;
      });
  });
});

api.onEmulateurProgress(afficheLEmulateur);
// Le bouton est toujours la : on le lit au demarrage, et a chaque retour sur
// la fenetre (STU ou le cron ont pu allumer ou eteindre l'emulateur).
const relisLEmulateur = () => void api.emulateurEtat().then(afficheLEmulateur).catch(() => {});
relisLEmulateur();
window.addEventListener("focus", relisLEmulateur);
api.onVeilleProgress(affiche);
// Une veille lancee avant un rechargement de la fenetre tourne toujours :
// ses parties deja vues ne sont pas « nouvelles ».
api
  .veilleEtat()
  .then((etat) => {
    retiensLesEnvoisVus(etat.parties);
    affiche(etat);
  })
  .catch(() => {});
