/**
 * Ecran des reglages : il relit `settings.json`, explique chaque seuil, et
 * renvoie le formulaire au processus principal, seul a valider.
 */

import { api, bandeau, cacheLesBandeaux, elements, messageDe } from "./elements.js";
import { etat, montreLaVue } from "./etat.js";

/** @typedef {import("../ipcChannels.ts").EcranDesReglages} EcranDesReglages */
/** @typedef {import("../../reglages.ts").Reglages} Reglages */
/** @typedef {import("./etat.js").Vue} Vue */
/** @typedef {import("../../sauvegarde.ts").EtatDeSauvegarde} EtatDeSauvegarde */

/** Ce que l'ecran a recu a l'ouverture : descriptions, valeurs par defaut. */
/** @type {EcranDesReglages | undefined} */
let ecranDesReglages;
/** Vue a retrouver en quittant les reglages. */
/** @type {Vue} */
let vueAvantReglages = "formulaire";

/** Une part (0,5) s'affiche en pourcentage (50) ; le reste tel quel. */
/** @type {(valeur: number, unite: string) => number} */
const versLEcran = (valeur, unite) => (unite === "%" ? Math.round(valeur * 100) : valeur);
/** @type {(valeur: number, unite: string) => number} */
const depuisLEcran = (valeur, unite) => (unite === "%" ? valeur / 100 : valeur);

/**
 * Construit les cases de sections et les lignes de seuils, une fois : leur
 * liste vient du processus principal, qui est seul a la connaitre.
 */
/** @param {EcranDesReglages} ecran */
function construisLEcranDesReglages(ecran) {
  elements.reglagesSections.replaceChildren(
    ...ecran.sections.map((section) => {
      const etiquette = document.createElement("label");
      etiquette.className = "section";
      const case_ = document.createElement("input");
      case_.type = "checkbox";
      case_.value = section.cle;
      etiquette.append(case_, document.createTextNode(` ${section.libelle}`));
      return etiquette;
    }),
  );

  elements.reglagesSeuils.replaceChildren(
    ...Object.entries(ecran.descriptions).map(([cle, description]) => {
      const ligne = document.createElement("div");
      ligne.className = "seuil";

      const titre = document.createElement("label");
      titre.className = "seuil__titre";
      titre.htmlFor = `seuil-${cle}`;
      titre.textContent = description.libelle;
      const section = document.createElement("span");
      section.className = "seuil__section";
      section.textContent = description.section;
      titre.append(section);

      const valeur = document.createElement("span");
      valeur.className = "seuil__valeur";
      const champ = document.createElement("input");
      champ.type = "number";
      champ.id = `seuil-${cle}`;
      champ.dataset.cle = cle;
      champ.dataset.unite = description.unite;
      champ.min = "1";
      champ.step = description.unite === "%" ? "5" : "1";
      if (description.unite === "%") champ.max = "100";
      const unite = document.createElement("span");
      unite.className = "seuil__unite";
      unite.textContent = description.unite;
      valeur.append(champ, unite);

      const explication = document.createElement("p");
      explication.className = "reglages__aide";
      const defaut = versLEcran(parCle(ecran.defauts.seuils)[cle] ?? Number.NaN, description.unite);
      explication.textContent = `${description.explication} Par défaut : ${defaut} ${description.unite}.`;

      ligne.append(titre, valeur, explication);
      return ligne;
    }),
  );
}

/**
 * Les seuils lus par la cle qu'en porte un champ (`data-cle`) : une chaine,
 * que le document ne peut pas garantir parmi les cles de `Seuils`.
 * @param {Reglages["seuils"]} seuils
 * @returns {Record<string, number | undefined>}
 */
const parCle = (seuils) => seuils;

/**
 * Les bornes d'un objectif, dans l'ordre de l'ecran.
 * @type {readonly { cle: "mortsMax" | "speciauxMin"; libelle: string }[]}
 */
const BORNES_D_OBJECTIF = [
  { cle: "mortsMax", libelle: "Morts max" },
  { cle: "speciauxMin", libelle: "Spéciaux min" },
];

/** Nom d'une arme pour l'ecran, sa cle a defaut. */
/** @type {(cle: string) => string} */
const nomDArme = (cle) => ecranDesReglages?.armes.find((arme) => arme.cle === cle)?.nom ?? cle;

/**
 * Une ligne d'objectif : l'arme, ses deux bornes, et de quoi la retirer. Une
 * arme reglee dans le fichier mais absente de la liste (meme nom dans les deux
 * langues) est ajoutee au choix, sous sa cle, plutot que perdue.
 *
 * @param {string} [cle]
 * @param {Partial<Record<"mortsMax" | "speciauxMin", number>>} [bornes]
 */
function ligneDObjectif(cle, bornes = {}) {
  const ligne = document.createElement("div");
  ligne.className = "objectif";

  const armes = ecranDesReglages?.armes ?? [];
  const choix = document.createElement("select");
  choix.setAttribute("aria-label", "Arme");
  const inconnue = cle !== undefined && !armes.some((arme) => arme.cle === cle);
  choix.append(
    ...(inconnue ? [{ cle, nom: cle }] : []).concat(armes).map(({ cle: valeur, nom }) => new Option(nom, valeur)),
  );
  if (cle !== undefined) choix.value = cle;

  const champs = BORNES_D_OBJECTIF.map(({ cle: borne, libelle }) => {
    const etiquette = document.createElement("label");
    etiquette.className = "objectif__borne";
    const champ = document.createElement("input");
    champ.type = "number";
    champ.min = "0";
    champ.step = "1";
    champ.dataset.borne = borne;
    const valeur = bornes[borne];
    if (valeur !== undefined) champ.value = String(valeur);
    etiquette.append(document.createTextNode(libelle), champ);
    return etiquette;
  });

  const retirer = document.createElement("button");
  retirer.type = "button";
  retirer.className = "bouton--discret";
  retirer.textContent = "Retirer";
  retirer.addEventListener("click", () => ligne.remove());

  ligne.append(choix, ...champs, retirer);
  return ligne;
}

/**
 * Relit les objectifs. Un champ vide n'est pas une borne ; une ligne sans
 * aucune part telle quelle, et le processus principal la refuse en la
 * nommant. Deux lignes sur la meme arme ne tiendraient pas dans le fichier :
 * la seconde effacerait la premiere sans rien dire, on refuse donc ici.
 */
function lisLesObjectifs() {
  /** @type {Record<string, Record<string, number>>} */
  const objectifs = {};
  for (const ligne of elements.reglagesObjectifs.querySelectorAll(".objectif")) {
    const arme = ligne.querySelector("select")?.value ?? "";
    if (objectifs[arme] !== undefined) {
      throw new Error(`« ${nomDArme(arme)} » a deux lignes d'objectifs : n'en gardez qu'une.`);
    }
    /** @type {Record<string, number>} */
    const bornes = {};
    for (const champ of ligne.querySelectorAll("input")) {
      const borne = champ.dataset.borne;
      if (borne !== undefined && champ.value.trim() !== "") bornes[borne] = champ.valueAsNumber;
    }
    objectifs[arme] = bornes;
  }
  return objectifs;
}

/**
 * Remplit le formulaire avec des reglages complets.
 * @param {Reglages} reglages
 */
function remplisLesReglages(reglages) {
  elements.reglageUtilisateur.value = reglages.utilisateur;
  elements.reglageTypes.value = reglages.typesDeSession.join(", ");
  for (const case_ of elements.reglagesSections.querySelectorAll("input")) {
    case_.checked = /** @type {readonly string[]} */ (reglages.sectionsParDefaut).includes(case_.value);
  }
  elements.reglageEntete.checked = reglages.enteteParDefaut;
  elements.reglageSansBarres.checked = reglages.fenetreSansBarres;
  elements.reglageDossierSessions.value = reglages.dossiers.sessions;
  elements.reglageDossierPlanches.value = reglages.dossiers.planches;
  elements.reglageDossierPictos.value = reglages.dossiers.pictos;
  elements.reglageSauvegardeAuto.checked = reglages.sauvegarde.automatique;
  elements.reglageSauvegardeDossier.value = reglages.sauvegarde.dossier;
  for (const champ of elements.reglagesSeuils.querySelectorAll("input")) {
    const { cle = "", unite = "" } = champ.dataset;
    champ.value = String(versLEcran(parCle(reglages.seuils)[cle] ?? Number.NaN, unite));
  }
  elements.reglagesObjectifs.replaceChildren(
    ...Object.entries(reglages.objectifsParArme).map(([cle, bornes]) => ligneDObjectif(cle, bornes)),
  );
}

/**
 * Relit le formulaire. Aucune validation ici : le processus principal valide,
 * et son message nomme le champ fautif. Un champ numerique vide part tel quel
 * (`NaN` devient `null` en JSON) et se fait refuser la-bas.
 */
function lisLesReglages() {
  /** @type {Record<string, number>} */
  const seuils = {};
  for (const champ of elements.reglagesSeuils.querySelectorAll("input")) {
    const { cle = "", unite = "" } = champ.dataset;
    seuils[cle] = depuisLEcran(champ.valueAsNumber, unite);
  }
  return {
    utilisateur: elements.reglageUtilisateur.value,
    typesDeSession: elements.reglageTypes.value
      .split(",")
      .map((type) => type.trim())
      .filter((type) => type !== ""),
    sectionsParDefaut: [...elements.reglagesSections.querySelectorAll("input")]
      .filter((case_) => case_.checked)
      .map((case_) => case_.value),
    enteteParDefaut: elements.reglageEntete.checked,
    fenetreSansBarres: elements.reglageSansBarres.checked,
    dossiers: {
      sessions: elements.reglageDossierSessions.value,
      planches: elements.reglageDossierPlanches.value,
      pictos: elements.reglageDossierPictos.value,
    },
    seuils,
    objectifsParArme: lisLesObjectifs(),
    sauvegarde: {
      automatique: elements.reglageSauvegardeAuto.checked,
      dossier: elements.reglageSauvegardeDossier.value,
    },
  };
}

/**
 * Le message de validation, dit dans les mots de l'ecran. Le processus
 * principal nomme la cle du fichier (`"seuils".medaillesCitees`), ce qui sert
 * en ligne de commande ; ici on remplace chemin et cle par le libelle affiche.
 */
/** @param {unknown} erreur */
function messageDeReglage(erreur) {
  const brut = messageDe(erreur).replace(
    /^Error invoking remote method '[^']+': (Error: )?/,
    "",
  );
  const [, cleDuSeuil = "", raison] = /"seuils"\.(\w+) : (.*)$/.exec(brut) ?? [];
  /** @type {Record<string, { libelle: string } | undefined>} */
  const descriptions = ecranDesReglages?.descriptions ?? {};
  const description = descriptions[cleDuSeuil];
  if (description) return `« ${description.libelle} » : ${raison}`;
  const [, arme, raisonDArme] = /"objectifsParArme"\.(\w+)(?:\.\w+)? : (.*)$/.exec(brut) ?? [];
  if (arme !== undefined) return `Objectifs « ${nomDArme(arme)} » : ${raisonDArme}`;
  // Les autres messages commencent par le chemin du fichier : inutile a l'ecran.
  return brut.replace(/^[^"]*?, (?=")/, "");
}

/** @type {(copies: number) => string} */
const bilanDeCopie = (copies) =>
  copies === 0 ? "déjà à jour" : `${copies} fichier${copies > 1 ? "s" : ""} copié${copies > 1 ? "s" : ""}`;

/**
 * La ligne d'etat de la sauvegarde : ou, quand, et l'echec eventuel. La
 * destination est celle en cours, pas celle du formulaire : un dossier
 * enregistre ne sert qu'au prochain demarrage.
 * @param {EtatDeSauvegarde} etatDeSauvegarde
 */
function montreLaSauvegarde(etatDeSauvegarde) {
  const { derniere, erreur, destination, enCours } = etatDeSauvegarde;
  const quand =
    derniere === undefined
      ? "Aucune sauvegarde pour l'instant."
      : `Dernière sauvegarde : ${new Date(derniere.date).toLocaleString("fr-FR")} (${bilanDeCopie(derniere.copies)}).`;
  const lignes = [`Vers ${destination}`, enCours ? "Sauvegarde en cours…" : quand];
  if (erreur !== undefined) lignes.push(`Échec de la dernière tentative : ${erreur}`);
  elements.sauvegardeEtat.textContent = lignes.join("\n");
  elements.sauvegardeEtat.classList.toggle("sauvegarde__etat--echec", erreur !== undefined);
}

/** @param {boolean} enAttente */
function signaleLAttente(enAttente) {
  elements.reglagesAttente.hidden = !enAttente;
  elements.boutonReglagesRedemarrer.hidden = !enAttente;
}

elements.boutonReglages.addEventListener("click", async () => {
  cacheLesBandeaux();
  try {
    const ecran = await api.readSettings();
    if (ecranDesReglages === undefined) construisLEcranDesReglages(ecran);
    ecranDesReglages = ecran;
    elements.reglagesChemin.textContent = ecran.chemin;
    remplisLesReglages(ecran.reglages);
    signaleLAttente(ecran.enAttente);
    montreLaSauvegarde(await api.backupStatus());
    if (etat.vueCourante !== "reglages") vueAvantReglages = etat.vueCourante;
    montreLaVue("reglages");
    if (ecran.erreur !== undefined) {
      bandeau(
        elements.avertissement,
        `Le fichier de réglages est invalide : ${ecran.erreur} ` +
          "Le formulaire montre les réglages en cours ; enregistrer remplacera le fichier.",
      );
    }
  } catch (erreur) {
    bandeau(elements.erreur, messageDe(erreur));
  }
});

elements.formulaireReglages.addEventListener("submit", async (evenement) => {
  evenement.preventDefault();
  cacheLesBandeaux();
  try {
    const { reglages, enAttente } = await api.saveSettings(lisLesReglages());
    remplisLesReglages(reglages);
    signaleLAttente(enAttente);
    bandeau(
      elements.succes,
      enAttente
        ? "Réglages enregistrés. Redémarrez l'application pour les appliquer."
        : "Réglages enregistrés : ce sont déjà ceux en cours.",
    );
  } catch (erreur) {
    bandeau(elements.erreur, `Réglages non enregistrés. ${messageDeReglage(erreur)}`);
  }
});

elements.boutonObjectifAjouter.addEventListener("click", () => {
  elements.reglagesObjectifs.append(ligneDObjectif());
});

elements.boutonReglagesDefauts.addEventListener("click", () => {
  if (ecranDesReglages === undefined) return;
  cacheLesBandeaux();
  remplisLesReglages(ecranDesReglages.defauts);
  bandeau(elements.avertissement, "Valeurs par défaut affichées : rien n'est écrit tant que vous n'enregistrez pas.");
});

elements.boutonReglagesRetour.addEventListener("click", () => {
  cacheLesBandeaux();
  montreLaVue(vueAvantReglages);
});

elements.boutonSauvegarder.addEventListener("click", async () => {
  cacheLesBandeaux();
  elements.boutonSauvegarder.disabled = true;
  elements.sauvegardeEtat.textContent = "Sauvegarde en cours…";
  try {
    const etatDeSauvegarde = await api.runBackup();
    montreLaSauvegarde(etatDeSauvegarde);
    if (etatDeSauvegarde.erreur === undefined) bandeau(elements.succes, "Sauvegarde faite.");
    else bandeau(elements.erreur, `Sauvegarde impossible. ${etatDeSauvegarde.erreur}`);
  } catch (erreur) {
    bandeau(elements.erreur, messageDe(erreur));
  } finally {
    elements.boutonSauvegarder.disabled = false;
  }
});

elements.boutonSauvegardeDossier.addEventListener("click", async () => {
  cacheLesBandeaux();
  try {
    if ((await api.openBackupDir()) === "copie") {
      bandeau(elements.succes, "Chemin du dossier de sauvegarde copié dans le presse-papier.");
    }
  } catch (erreur) {
    bandeau(elements.erreur, messageDeReglage(erreur));
  }
});

elements.boutonReglagesRedemarrer.addEventListener("click", async () => {
  await api.relaunchApp();
});
