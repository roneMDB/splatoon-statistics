/**
 * Veille s3s : un bouton pour la lancer et l'arreter, et le suivi de ce
 * qu'elle envoie a stat.ink.
 *
 * L'etat vit dans le processus principal (`src/electron/veilleHandler.ts`) :
 * la fenetre le relit a l'ouverture et l'affiche a chaque changement, sans
 * rien en deduire elle-meme.
 */

import { api, elements, messageDe } from "./elements.js";

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

/** @type {Record<string, string>} */
const RESULTATS = { Victory: "Victoire", Defeat: "Défaite", Draw: "Égalité", Clear: "Réussite" };

/** @type {Record<PartieSuivie["statut"], string>} */
const STATUTS = { envoi: "envoi…", envoyee: "envoyée ✓", deja: "déjà sur stat.ink", echec: "échec de l'envoi" };

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

/** Duree pendant laquelle une partie qui vient d'arriver reste mise en evidence. */
const DUREE_NOUVELLE_MS = 8000;

/** Plus grand numero de partie deja affiche : au-dela, la partie est nouvelle. */
let dernierNumeroVu = 0;
/** Numero de partie -> instant ou elle est apparue, tant qu'elle est nouvelle. */
/** @type {Map<number, number>} */
const apparitions = new Map();
/** Liste affichee, pour ne pas la reconstruire chaque seconde (le decompte). */
let partiesAffichees = "";
/** Capture demandee en dernier : l'etat repasse chaque seconde, on ne la relit pas. */
/** @type {string | undefined} */
let captureDemandee;
/** L'encart etait-il deja visible : on relit l'emulateur a son apparition. */
let alerteVisible = false;
/** Action proposee par le bouton de l'emulateur, `undefined` s'il est grise. */
/** @type {"ouvre" | "eteint" | undefined} */
let actionDEmulateur;
/** Dernier etat recu, pour retirer la mise en evidence une fois passee. */
/** @type {EtatDeVeille | undefined} */
let dernierEtat;

/**
 * s3s ecrit l'heure en 12 heures (`9:41:12 PM`) ; on la rend en 24 heures,
 * sans les secondes. Une heure d'une autre forme passe telle quelle.
 * @param {string} heure
 */
function enHeureFrancaise(heure) {
  const trouve = /^(\d{1,2}):(\d{2})(?::\d{2})? ?(AM|PM)$/i.exec(heure);
  if (trouve === null) return heure;
  const [, h = "0", minutes = "00", moitie = "AM"] = trouve;
  const heures = (Number(h) % 12) + (moitie.toUpperCase() === "PM" ? 12 : 0);
  return `${String(heures).padStart(2, "0")}:${minutes}`;
}

/** @param {EtatDeVeille} etat */
function ligneDEtat(etat) {
  if (etat.statut === "arret-demande") {
    return etat.phase === "splashcat"
      ? "Arrêt demandé : envoi vers splashcat.ink…"
      : "Arrêt demandé : vérification finale avant de s'arrêter…";
  }
  if (etat.statut === "en-cours") {
    if (etat.phase === "attente" && etat.decompte !== undefined) {
      return `En attente — prochaine vérification dans ${etat.decompte} s.`;
    }
    return PHASES[etat.phase ?? "demarrage"] ?? "";
  }
  if (etat.dejaEnCours) {
    return "Une synchro tournait déjà (cron ou terminal) : la veille n'a pas été lancée. Réessayez dans un moment.";
  }
  if (etat.codeDeSortie === 0) return "Veille terminée.";
  if (etat.codeDeSortie !== undefined) {
    return `Veille terminée sur une erreur (code ${etat.codeDeSortie ?? "signal"}) : voir le journal.`;
  }
  return "";
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

/** @param {PartieSuivie} partie */
function ligneDePartie(partie) {
  const ligne = document.createElement("li");
  ligne.className = `veille__partie veille__partie--${partie.statut}`;
  if (partie.resultat === "Victory" || partie.resultat === "Clear") ligne.classList.add("veille__partie--victoire");
  if (partie.resultat === "Defeat") ligne.classList.add("veille__partie--defaite");
  const apparue = apparitions.get(partie.numero);
  if (apparue !== undefined && Date.now() - apparue < DUREE_NOUVELLE_MS) {
    ligne.classList.add("veille__partie--nouvelle");
  }

  const heure = document.createElement("span");
  heure.className = "veille__heure";
  heure.textContent = partie.heure ? enHeureFrancaise(partie.heure) : "—";

  const quoi = document.createElement("span");
  quoi.className = "veille__quoi";
  const resultat = partie.resultat ? RESULTATS[partie.resultat] ?? partie.resultat : undefined;
  quoi.textContent =
    partie.stage !== undefined
      ? `${partie.stage} · ${resultat}`
      : partie.nature === "job"
        ? "Salmon Run rattrapé"
        : "Partie rattrapée";

  const statut = document.createElement("span");
  statut.className = "veille__statut";
  statut.textContent = STATUTS[partie.statut];

  ligne.append(heure, quoi, statut);

  const url = partie.url;
  if (url !== undefined) {
    const lien = document.createElement("button");
    lien.type = "button";
    lien.className = "bouton--discret veille__lien";
    lien.textContent = "stat.ink";
    lien.title = "Ouvrir la partie sur stat.ink";
    lien.addEventListener("click", () => {
      void api.openExternal(url).catch(() => {});
    });
    ligne.append(lien);
  }
  return ligne;
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
  elements.emulateurNote.textContent = bouton.note ?? "";
}

/** @param {EtatDeVeille} etat */
function affiche(etat) {
  dernierEtat = etat;
  const bouton = elements.boutonVeille;
  bouton.hidden = etat.indisponible === true;
  bouton.disabled = etat.statut === "arret-demande";
  bouton.textContent =
    etat.statut === "arretee"
      ? "Lancer la veille s3s"
      : etat.statut === "en-cours"
        ? "Arrêter la veille"
        : "Arrêt en cours…";
  bouton.classList.toggle("bouton-veille--active", etat.statut !== "arretee");

  const aMontrer =
    etat.statut !== "arretee" ||
    etat.parties.length > 0 ||
    etat.erreur !== undefined ||
    etat.codeDeSortie !== undefined ||
    etat.alerte !== undefined ||
    etat.dejaEnCours;
  elements.veille.hidden = !aMontrer;
  if (!aMontrer) return;

  const erreur = etat.erreur;
  elements.veilleEtat.textContent = erreur ?? ligneDEtat(etat);
  elements.veilleEtat.classList.toggle("veille__etat--erreur", erreur !== undefined);

  afficheLAlerte(etat);

  elements.veilleBilan.textContent = bilan(etat.parties);

  const parties = JSON.stringify(etat.parties);
  if (parties !== partiesAffichees) {
    partiesAffichees = parties;
    for (const partie of etat.parties) {
      if (partie.numero <= dernierNumeroVu) continue;
      dernierNumeroVu = partie.numero;
      apparitions.set(partie.numero, Date.now());
      // Reconstruit la liste une fois la mise en evidence passee.
      setTimeout(() => {
        apparitions.delete(partie.numero);
        partiesAffichees = "";
        if (dernierEtat !== undefined) affiche(dernierEtat);
      }, DUREE_NOUVELLE_MS);
    }
    elements.veilleParties.replaceChildren(...etat.parties.map(ligneDePartie));
  }

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
      // Une nouvelle veille repart d'une liste vide : sa premiere partie est nouvelle.
      dernierNumeroVu = 0;
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

elements.boutonEmulateur.addEventListener("click", () => {
  const action = actionDEmulateur;
  if (action === undefined) return;
  // Grise tout de suite : le prochain etat arrive par `onEmulateurProgress`.
  elements.boutonEmulateur.disabled = true;
  const appel = action === "ouvre" ? api.emulateurOuvre() : api.emulateurEteint();
  void appel.then(afficheLEmulateur).catch((erreur) => {
    elements.emulateurNote.textContent = messageDe(erreur);
  });
});

api.onEmulateurProgress(afficheLEmulateur);
api.onVeilleProgress(affiche);
// Une veille lancee avant un rechargement de la fenetre tourne toujours :
// ses parties deja vues ne sont pas « nouvelles ».
api
  .veilleEtat()
  .then((etat) => {
    dernierNumeroVu = Math.max(0, ...etat.parties.map((partie) => partie.numero));
    affiche(etat);
  })
  .catch(() => {});
