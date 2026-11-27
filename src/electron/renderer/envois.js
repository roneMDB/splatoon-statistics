/**
 * Parties envoyees par la veille, dans la colonne de droite au-dessus du
 * formulaire : le bilan, la serie en frise, et une ligne par partie qui se
 * deplie sur les statistiques du match.
 *
 * La veille sait de chaque partie ce que s3s envoie a stat.ink (heures,
 * regle, stage, resultat) et l'adresse obtenue. Les statistiques des joueurs
 * sont lues sur stat.ink au premier
 * depliage (canal `readStatinkBattle`), puis gardees : replier et redeplier
 * ne refait pas d'appel.
 *
 * L'etat arrive chaque seconde pendant le decompte : la liste n'est pas
 * reconstruite, chaque ligne est mise a jour en place, pour qu'une ligne
 * depliee le reste quand une nouvelle partie arrive.
 */

import { api, bandeau, cacheLesBandeaux, elements, messageDe } from "./elements.js";
import { montreLaVue } from "./etat.js";
import { afficheLaManche, texteDeLaDuree, texteDuScore } from "./manche.js";
import { formateLHeure } from "./matchs.js";
import { versChampDate } from "./recuperation.js";

/** @typedef {import("../../veille.ts").EtatDeVeille} EtatDeVeille */
/** @typedef {import("../../veille.ts").PartieSuivie} PartieSuivie */
/** @typedef {import("../../battleDetail.ts").BattleDetail} BattleDetail */
/** @typedef {import("../../battleDetail.ts").JoueurDeManche} JoueurDeManche */

/** @type {Record<string, string>} */
const RESULTATS = { Victory: "Victoire", Defeat: "Défaite", Draw: "Égalité", Clear: "Réussite" };

/** @type {Record<PartieSuivie["statut"], string>} */
const STATUTS = { envoi: "envoi…", envoyee: "envoyée ✓", deja: "déjà sur stat.ink", echec: "échec de l'envoi" };

/** Duree pendant laquelle une partie qui vient d'arriver reste mise en evidence. */
const DUREE_NOUVELLE_MS = 8000;

/** Marge autour des parties pour la fenetre de recuperation : leurs heures sont exactes. */
const MARGE_MS = 60 * 1000;

/**
 * Une ligne affichee, et ce qu'elle montre : on ne la retouche que si la
 * partie a change (l'envoi qui aboutit, par exemple).
 * @typedef {{ li: HTMLLIElement; signature: string; url: string | undefined }} LigneDEnvoi
 */

/** Rang de la partie -> sa ligne. */
/** @type {Map<number, LigneDEnvoi>} */
const lignes = new Map();

/** Adresse stat.ink -> lecture en cours ou faite. Survit a la ligne. */
/** @type {Map<string, Promise<BattleDetail>>} */
const details = new Map();

/** Plus grand rang deja affiche : au-dela, la partie est nouvelle. */
let dernierNumeroVu = 0;

/** Parties de la derniere mise a jour, la plus recente en tete. */
/** @type {readonly PartieSuivie[]} */
let partiesCourantes = [];

/** Signature de la derniere frise, du bilan et du bouton, pour ne les refaire qu'a un changement. */
let resumeAffiche = "";

/**
 * Une partie de match envoyee a une page stat.ink : la seule qui se deplie.
 * Le Salmon Run (`salmon3`) n'a pas de joueurs a comparer, et le canal ne
 * lit que les matchs.
 * @param {PartieSuivie} partie
 */
function estDepliable(partie) {
  return partie.url !== undefined && /^https:\/\/stat\.ink\/@[^/]+\/spl3\/[0-9a-f-]{36}$/i.test(partie.url);
}

/**
 * Lit (une fois) le detail d'une partie sur stat.ink. Un echec n'est pas
 * garde : « Réessayer » relance la lecture.
 * @param {string} url
 */
function litLeDetail(url) {
  let lecture = details.get(url);
  if (lecture === undefined) {
    lecture = api.readStatinkBattle(url);
    details.set(url, lecture);
    lecture.catch(() => details.delete(url));
  }
  return lecture;
}

/** @param {PartieSuivie} partie */
function signatureDe(partie) {
  const { numero: _numero, ...reste } = partie;
  return JSON.stringify(reste);
}

/** « Défense de Zone · Pont Esturgeon », ou ce qu'on en sait. */
/** @param {PartieSuivie} partie */
function libelleDeLaPartie(partie) {
  if (partie.nature === "job") return "Salmon Run";
  const morceaux = [partie.regle, partie.stage].filter((morceau) => morceau !== undefined);
  return morceaux.length > 0 ? morceaux.join(" · ") : "Match";
}

/**
 * Le tableau des huit joueurs : arme, K (A), morts, speciaux, encre.
 * @param {BattleDetail} detail
 */
function tableauDesJoueurs(detail) {
  const table = document.createElement("table");
  table.className = "envoi__joueurs";

  const entete = document.createElement("thead");
  const ligneDEntete = document.createElement("tr");
  for (const [texte, titre] of /** @type {[string, string][]} */ ([
    ["", ""],
    ["", ""],
    ["K (A)", "Éliminations (assistances)"],
    ["M", "Morts"],
    ["Spé", "Spéciaux"],
    ["Encre", "Points d'encrage"],
  ])) {
    const cellule = document.createElement("th");
    cellule.scope = "col";
    cellule.textContent = texte;
    if (titre) cellule.title = titre;
    ligneDEntete.append(cellule);
  }
  entete.append(ligneDEntete);
  table.append(entete);

  for (const [titre, joueurs] of /** @type {const} */ ([
    ["Nous", detail.nous],
    ["Eux", detail.eux],
  ])) {
    const corps = document.createElement("tbody");
    const ligneDeCamp = document.createElement("tr");
    ligneDeCamp.className = "envoi__camp";
    const camp = document.createElement("th");
    camp.scope = "rowgroup";
    camp.colSpan = 6;
    camp.textContent = titre;
    ligneDeCamp.append(camp);
    corps.append(ligneDeCamp, ...joueurs.map(ligneDeJoueur));
    table.append(corps);
  }
  return table;
}

/** @param {JoueurDeManche} joueur */
function ligneDeJoueur(joueur) {
  const ligne = document.createElement("tr");
  if (joueur.moi) ligne.className = "envoi__moi";
  if (joueur.deconnecte) ligne.classList.add("envoi__deconnecte");

  const nom = document.createElement("th");
  nom.scope = "row";
  nom.textContent = joueur.moi ? `→ ${joueur.nom}` : joueur.nom;
  if (joueur.deconnecte) nom.title = "Déconnecté";

  const arme = document.createElement("td");
  arme.className = "envoi__arme";
  arme.textContent = joueur.arme;

  ligne.append(nom, arme);
  for (const valeur of [
    `${joueur.kill} (${joueur.assist})`,
    String(joueur.death),
    String(joueur.special),
    joueur.inked.toLocaleString("fr-FR"),
  ]) {
    const cellule = document.createElement("td");
    cellule.className = "envoi__nombre";
    cellule.textContent = valeur;
    ligne.append(cellule);
  }
  return ligne;
}

/**
 * Remplit le bloc deplie d'une ligne : la lecture, son erreur, ou le match.
 * @param {HTMLElement} bloc
 * @param {string} url
 */
function remplisLeDetail(bloc, url) {
  bloc.dataset["url"] = url;
  const attente = document.createElement("p");
  attente.className = "envoi__attente";
  attente.textContent = "Lecture sur stat.ink…";
  bloc.replaceChildren(attente);

  litLeDetail(url)
    .then((detail) => {
      // La ligne a pu changer d'adresse entre-temps.
      if (bloc.dataset["url"] !== url) return;
      const resume = document.createElement("p");
      resume.className = "envoi__resume";
      resume.textContent =
        `${detail.rule} · ${detail.stage} · ${detail.resultLabel ?? "—"}` +
        `${texteDuScore(detail)}${detail.ko ? " KO" : ""}${texteDeLaDuree(detail)}`;

      const contenu = [resume];
      if (detail.medailles.length > 0) {
        const medailles = document.createElement("p");
        medailles.className = "envoi__medailles";
        medailles.textContent = `🏅 ${detail.medailles.join(" · ")}`;
        contenu.push(medailles);
      }

      const pied = document.createElement("p");
      pied.className = "envoi__pied";
      const voir = document.createElement("button");
      voir.type = "button";
      voir.className = "bouton--discret";
      voir.textContent = "Voir le détail →";
      voir.addEventListener("click", () => void ouvreLaPartie(url));
      pied.append(voir);

      bloc.replaceChildren(...contenu, tableauDesJoueurs(detail), pied);
    })
    .catch((erreur) => {
      if (bloc.dataset["url"] !== url) return;
      const message = document.createElement("p");
      message.className = "envoi__erreur";
      // Le pont prefixe le message du processus principal : on ne garde que lui.
      message.textContent = messageDe(erreur).replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
      const reessayer = document.createElement("button");
      reessayer.type = "button";
      reessayer.className = "bouton--discret";
      reessayer.textContent = "Réessayer";
      reessayer.addEventListener("click", () => remplisLeDetail(bloc, url));
      message.append(" ", reessayer);
      bloc.replaceChildren(message);
    });
}

/**
 * Deplie ou replie une ligne. Le detail n'est lu qu'au premier depliage.
 * @param {HTMLLIElement} li
 */
function basculeLaLigne(li) {
  const bouton = /** @type {HTMLButtonElement | null} */ (li.querySelector(".envoi__deplier"));
  const bloc = /** @type {HTMLElement | null} */ (li.querySelector(".envoi__detail"));
  const url = li.dataset["url"];
  if (bouton === null || bloc === null || url === undefined) return;
  const ouvert = bouton.getAttribute("aria-expanded") !== "true";
  bouton.setAttribute("aria-expanded", String(ouvert));
  li.classList.toggle("envoi--ouvert", ouvert);
  bloc.hidden = !ouvert;
  if (ouvert && bloc.dataset["url"] !== url) remplisLeDetail(bloc, url);
}

/**
 * Habille une ligne d'apres sa partie. Le bloc deplie, s'il existe, reste en
 * place : seul l'en-tete est refait.
 * @param {HTMLLIElement} li
 * @param {PartieSuivie} partie
 */
function habilleLaLigne(li, partie) {
  const depliable = estDepliable(partie);
  const ouvert = depliable && li.classList.contains("envoi--ouvert");
  const nouvelle = li.classList.contains("envoi--nouvelle");
  li.className = `envoi envoi--${partie.statut}`;
  if (nouvelle) li.classList.add("envoi--nouvelle");
  if (partie.resultat === "Victory" || partie.resultat === "Clear") li.classList.add("envoi--victoire");
  if (partie.resultat === "Defeat") li.classList.add("envoi--defaite");
  if (ouvert) li.classList.add("envoi--ouvert");
  if (depliable && partie.url !== undefined) li.dataset["url"] = partie.url;
  else delete li.dataset["url"];

  const entete = document.createElement("div");
  entete.className = "envoi__ligne";

  // Le bouton porte le depliage au clavier et pour les lecteurs d'ecran ; un
  // clic n'importe ou sur la ligne fait de meme (voir l'ecouteur de la liste).
  const deplier = document.createElement(depliable ? "button" : "span");
  deplier.className = "envoi__deplier";
  if (deplier instanceof HTMLButtonElement) {
    deplier.type = "button";
    deplier.setAttribute("aria-expanded", String(ouvert));
    deplier.title = "Afficher les statistiques du match";
  }

  const chevron = document.createElement("span");
  chevron.className = "envoi__chevron";
  chevron.setAttribute("aria-hidden", "true");
  chevron.textContent = depliable ? "▸" : "";

  const heure = document.createElement("span");
  heure.className = "envoi__heure";
  heure.textContent = partie.debut ? formateLHeure(partie.debut) : "—";

  const stage = document.createElement("span");
  stage.className = "envoi__stage";
  stage.textContent = libelleDeLaPartie(partie);

  const resultat = document.createElement("span");
  resultat.className = "envoi__resultat";
  resultat.textContent =
    (partie.resultat ? RESULTATS[partie.resultat] ?? partie.resultat : "") + (partie.ko ? " KO" : "");

  const statut = document.createElement("span");
  statut.className = "envoi__statut";
  statut.textContent = STATUTS[partie.statut];
  // La reponse de stat.ink a un envoi rate, au survol.
  if (partie.message) statut.title = partie.message;

  deplier.append(chevron, heure, stage, resultat, statut);
  entete.append(deplier);

  const url = partie.url;
  if (url !== undefined) {
    const lien = document.createElement("button");
    lien.type = "button";
    lien.className = "bouton--discret envoi__lien";
    lien.textContent = "stat.ink";
    lien.title = "Ouvrir la partie sur stat.ink";
    lien.addEventListener("click", () => {
      void api.openExternal(url).catch(() => {});
    });
    entete.append(lien);
  }

  let bloc = /** @type {HTMLElement | null} */ (li.querySelector(".envoi__detail"));
  if (!depliable) {
    bloc?.remove();
    bloc = null;
  } else if (bloc === null) {
    bloc = document.createElement("div");
    bloc.className = "envoi__detail";
    bloc.hidden = true;
  }
  li.replaceChildren(entete, ...(bloc === null ? [] : [bloc]));
  // L'adresse a change sous un bloc deplie (rare) : on relit.
  if (bloc !== null && ouvert && url !== undefined && bloc.dataset["url"] !== url) remplisLeDetail(bloc, url);
}

/**
 * Parties de match envoyees, avec leurs heures, dans l'ordre ou elles ont ete
 * jouees : ce que « Récupérer ces parties » ira chercher.
 * @param {readonly PartieSuivie[]} parties
 */
function partiesARecuperer(parties) {
  return [...parties]
    .reverse()
    .filter(
      (partie) =>
        partie.nature === "battle" &&
        partie.debut !== undefined &&
        (partie.statut === "envoyee" || partie.statut === "deja"),
    );
}

/** @param {readonly PartieSuivie[]} parties */
function bilan(parties) {
  const envoyees = parties.filter((partie) => partie.statut === "envoyee" || partie.statut === "deja");
  const victoires = envoyees.filter((partie) => partie.resultat === "Victory").length;
  const defaites = envoyees.filter((partie) => partie.resultat === "Defeat").length;
  const echecs = parties.filter((partie) => partie.statut === "echec").length;
  const morceaux = [`${parties.length} partie${parties.length > 1 ? "s" : ""}`];
  if (victoires + defaites > 0) morceaux.push(`${victoires} V / ${defaites} D`);
  if (echecs > 0) morceaux.push(`${echecs} échec${echecs > 1 ? "s" : ""}`);
  return morceaux.join(" — ");
}

/**
 * Frise, bilan, plage horaire et bouton de recuperation.
 * @param {readonly PartieSuivie[]} parties
 */
function afficheLeResume(parties) {
  elements.envoisBilan.textContent = bilan(parties);

  // La plus recente en tete : de la plus ancienne a la fin de la plus recente.
  const datees = parties.filter((partie) => partie.debut !== undefined);
  const premiere = datees.at(-1)?.debut;
  const derniere = datees[0] === undefined ? undefined : datees[0].fin ?? datees[0].debut;
  elements.envoisPlage.textContent =
    premiere === undefined || derniere === undefined
      ? ""
      : `${formateLHeure(premiere)} → ${formateLHeure(derniere)}`;

  elements.envoisFrise.replaceChildren(
    ...[...parties].reverse().map((partie) => {
      const pastille = document.createElement("li");
      pastille.className = "envois__pastille";
      if (partie.statut === "echec") pastille.classList.add("envois__pastille--echec");
      else if (partie.resultat === "Victory" || partie.resultat === "Clear") pastille.classList.add("envois__pastille--victoire");
      else if (partie.resultat === "Defeat") pastille.classList.add("envois__pastille--defaite");
      return pastille;
    }),
  );

  const nombre = partiesARecuperer(parties).length;
  elements.boutonEnvoisRecuperer.hidden = nombre === 0;
  elements.boutonEnvoisRecuperer.textContent =
    nombre === 1 ? "Récupérer cette partie →" : `Récupérer ces ${nombre} parties →`;
}

/**
 * Met le bloc a jour d'apres l'etat de la veille.
 * @param {EtatDeVeille} etat
 */
export function afficheLesEnvois(etat) {
  const parties = etat.parties;
  partiesCourantes = parties;
  elements.envois.hidden = etat.indisponible === true || (parties.length === 0 && etat.statut === "arretee");
  elements.envoisStatut.textContent = etat.statut === "arretee" ? "veille arrêtée" : "● veille en cours";
  elements.envoisStatut.classList.toggle("envois__statut--actif", etat.statut !== "arretee");

  if (parties.length === 0) {
    lignes.clear();
    elements.envoisListe.replaceChildren();
    elements.envoisBilan.textContent = "En attente de la première partie.";
    elements.envoisPlage.textContent = "";
    elements.envoisFrise.replaceChildren();
    elements.boutonEnvoisRecuperer.hidden = true;
    resumeAffiche = "";
    return;
  }

  const resume = JSON.stringify(parties);
  if (resume === resumeAffiche) return;
  resumeAffiche = resume;
  afficheLeResume(parties);

  const vues = new Set();
  /** @type {HTMLLIElement[]} */
  const ordre = [];
  for (const partie of parties) {
    vues.add(partie.numero);
    const signature = signatureDe(partie);
    let ligne = lignes.get(partie.numero);
    if (ligne === undefined) {
      ligne = { li: document.createElement("li"), signature: "", url: undefined };
      lignes.set(partie.numero, ligne);
    }
    if (ligne.signature !== signature) {
      habilleLaLigne(ligne.li, partie);
      ligne.signature = signature;
      ligne.url = partie.url;
    }
    if (partie.numero > dernierNumeroVu) {
      dernierNumeroVu = partie.numero;
      const li = ligne.li;
      li.classList.add("envoi--nouvelle");
      setTimeout(() => li.classList.remove("envoi--nouvelle"), DUREE_NOUVELLE_MS);
    }
    ordre.push(ligne.li);
  }
  for (const numero of [...lignes.keys()]) if (!vues.has(numero)) lignes.delete(numero);
  // Deplacer un noeud existant le garde tel quel : les lignes depliees le restent.
  elements.envoisListe.replaceChildren(...ordre);
}

/**
 * Les parties deja la (rechargement de la fenetre) ne sont pas « nouvelles ».
 * @param {readonly PartieSuivie[]} parties
 */
export function retiensLesEnvoisVus(parties) {
  dernierNumeroVu = Math.max(0, ...parties.map((partie) => partie.numero));
}

/** Une nouvelle veille repart d'une liste vide : sa premiere partie est nouvelle. */
export function oublieLesEnvoisVus() {
  dernierNumeroVu = 0;
}

/**
 * Ouvre une partie envoyee dans la vue manche, avec le passage a la partie
 * voisine (dans l'ordre ou elles ont ete jouees) et le retour au formulaire.
 * @param {string} url
 */
async function ouvreLaPartie(url) {
  const adresses = [...partiesCourantes]
    .reverse()
    .filter(estDepliable)
    .map((partie) => /** @type {string} */ (partie.url));
  const rang = adresses.indexOf(url);
  if (rang === -1) return;

  cacheLesBandeaux();
  try {
    const detail = await litLeDetail(url);
    const precedente = adresses[rang - 1];
    const suivante = adresses[rang + 1];
    afficheLaManche(detail, `Partie envoyée ${rang + 1} / ${adresses.length}`, {
      ...(precedente !== undefined ? { precedente: () => void ouvreLaPartie(precedente) } : {}),
      ...(suivante !== undefined ? { suivante: () => void ouvreLaPartie(suivante) } : {}),
      retour: () => montreLaVue("formulaire"),
    });
  } catch (erreur) {
    bandeau(elements.erreur, messageDe(erreur));
  }
}

// Un clic n'importe ou sur l'en-tete d'une ligne la deplie, sauf sur le lien
// stat.ink, qui garde son propre clic.
elements.envoisListe.addEventListener("click", (evenement) => {
  const cible = /** @type {HTMLElement} */ (evenement.target);
  if (cible.closest(".envoi__lien") !== null) return;
  const entete = cible.closest(".envoi__ligne");
  const li = /** @type {HTMLLIElement | null} */ (entete?.parentElement ?? null);
  if (li === null || li.dataset["url"] === undefined) return;
  basculeLaLigne(li);
});

/**
 * Remplit le formulaire avec la fenetre des parties envoyees : du debut de la
 * premiere a la fin de la derniere, a une minute pres.
 */
elements.boutonEnvoisRecuperer.addEventListener("click", () => {
  const parties = partiesARecuperer(partiesCourantes);
  const debuts = parties.map((partie) => Date.parse(/** @type {string} */ (partie.debut)));
  const fins = parties.map((partie) => Date.parse(partie.fin ?? /** @type {string} */ (partie.debut)));
  if (debuts.length === 0) return;

  cacheLesBandeaux();
  elements.debut.value = versChampDate(new Date(Math.min(...debuts) - MARGE_MS));
  elements.fin.value = versChampDate(new Date(Math.min(Math.max(...fins) + MARGE_MS, Date.now())));
  elements.formulaire.scrollIntoView({ behavior: "smooth", block: "start" });
  elements.nom.focus({ preventScroll: true });
});
