/**
 * Elements du document et bandeaux de message, partages par tous les modules
 * de la fenetre.
 *
 * Chaque element est type ici une fois pour toutes : ailleurs, `elements.nom`
 * est un `HTMLInputElement` et `.value` se verifie. Qu'un identifiant existe
 * bien dans le document, c'est `tests/electron/renderer.test.ts` qui le tient.
 */

/** Le pont expose par le preload : la fenetre n'a acces a rien d'autre. */
export const api = window.splatoonApi;

export const elements = {
  formulaire: /** @type {HTMLFormElement} */ (document.getElementById("formulaire")),
  bouton: /** @type {HTMLButtonElement} */ (document.getElementById("bouton-previsualiser")),
  nom: /** @type {HTMLInputElement} */ (document.getElementById("champ-nom")),
  debut: /** @type {HTMLInputElement} */ (document.getElementById("champ-debut")),
  fin: /** @type {HTMLInputElement} */ (document.getElementById("champ-fin")),
  type: /** @type {HTMLSelectElement} */ (document.getElementById("champ-type")),
  lobby: /** @type {HTMLSelectElement} */ (document.getElementById("champ-lobby")),
  compte: /** @type {HTMLInputElement} */ (document.getElementById("champ-compte")),
  liste: /** @type {HTMLUListElement} */ (document.getElementById("sessions-liste")),
  compteSessions: /** @type {HTMLElement} */ (document.getElementById("sessions-compte")),
  listeVide: /** @type {HTMLElement} */ (document.getElementById("sessions-vide")),
  listeErreurs: /** @type {HTMLElement} */ (document.getElementById("sessions-erreurs")),
  progression: /** @type {HTMLElement} */ (document.getElementById("progression")),
  erreur: /** @type {HTMLElement} */ (document.getElementById("erreur")),
  avertissement: /** @type {HTMLElement} */ (document.getElementById("avertissement")),
  succes: /** @type {HTMLElement} */ (document.getElementById("succes")),
  vueFormulaire: /** @type {HTMLElement} */ (document.getElementById("vue-formulaire")),
  vueApercu: /** @type {HTMLElement} */ (document.getElementById("vue-apercu")),
  vueFiche: /** @type {HTMLElement} */ (document.getElementById("vue-fiche")),
  apercuResume: /** @type {HTMLElement} */ (document.getElementById("apercu-resume")),
  apercuMatchs: /** @type {HTMLElement} */ (document.getElementById("apercu-matchs")),
  boutonEnregistrer: /** @type {HTMLButtonElement} */ (document.getElementById("bouton-enregistrer")),
  boutonAnnuler: /** @type {HTMLButtonElement} */ (document.getElementById("bouton-annuler")),
  boutonQuitter: /** @type {HTMLButtonElement} */ (document.getElementById("bouton-quitter")),
  boutonDossierPlanches: /** @type {HTMLButtonElement} */ (document.getElementById("bouton-dossier-planches")),
  ficheNom: /** @type {HTMLInputElement} */ (document.getElementById("fiche-nom")),
  ficheType: /** @type {HTMLSelectElement} */ (document.getElementById("fiche-type")),
  ficheEquipe: /** @type {HTMLInputElement} */ (document.getElementById("fiche-equipe")),
  ficheEquipeAdverse: /** @type {HTMLInputElement} */ (document.getElementById("fiche-equipe-adverse")),
  equipesConnues: /** @type {HTMLDataListElement} */ (document.getElementById("equipes-connues")),
  equipesAdversesConnues: /** @type {HTMLDataListElement} */ (document.getElementById("equipes-adverses-connues")),
  ficheObjectif: /** @type {HTMLInputElement} */ (document.getElementById("fiche-objectif")),
  ficheRessenti: /** @type {HTMLTextAreaElement} */ (document.getElementById("fiche-ressenti")),
  compteRenduSections: /** @type {HTMLElement} */ (document.getElementById("compte-rendu-sections")),
  compteRenduTexte: /** @type {HTMLTextAreaElement} */ (document.getElementById("compte-rendu-texte")),
  boutonGenerer: /** @type {HTMLButtonElement} */ (document.getElementById("bouton-generer")),
  boutonCopier: /** @type {HTMLButtonElement} */ (document.getElementById("bouton-copier")),
  boutonPlanche: /** @type {HTMLButtonElement} */ (document.getElementById("bouton-planche")),
  boutonPlancheOuvrir: /** @type {HTMLButtonElement} */ (document.getElementById("bouton-planche-ouvrir")),
  plancheEntete: /** @type {HTMLInputElement} */ (document.getElementById("planche-entete")),
  plancheResultat: /** @type {HTMLElement} */ (document.getElementById("planche-resultat")),
  compteRenduOnglets: /** @type {HTMLElement} */ (document.getElementById("compte-rendu-onglets")),
  compteRenduApercu: /** @type {HTMLElement} */ (document.getElementById("compte-rendu-apercu")),
  ongletApercu: /** @type {HTMLButtonElement} */ (document.getElementById("onglet-apercu")),
  ongletMarkdown: /** @type {HTMLButtonElement} */ (document.getElementById("onglet-markdown")),
  vueManche: /** @type {HTMLElement} */ (document.getElementById("vue-manche")),
  manchePosition: /** @type {HTMLElement} */ (document.getElementById("manche-position")),
  mancheResume: /** @type {HTMLElement} */ (document.getElementById("manche-resume")),
  mancheMedailles: /** @type {HTMLElement} */ (document.getElementById("manche-medailles")),
  mancheEquipes: /** @type {HTMLElement} */ (document.getElementById("manche-equipes")),
  boutonManchePrecedente: /** @type {HTMLButtonElement} */ (document.getElementById("bouton-manche-precedente")),
  boutonMancheSuivante: /** @type {HTMLButtonElement} */ (document.getElementById("bouton-manche-suivante")),
  boutonMancheRetour: /** @type {HTMLButtonElement} */ (document.getElementById("bouton-manche-retour")),
  boutonMancheStatink: /** @type {HTMLButtonElement} */ (document.getElementById("bouton-manche-statink")),
  ficheResume: /** @type {HTMLElement} */ (document.getElementById("fiche-resume")),
  ficheMatchs: /** @type {HTMLElement} */ (document.getElementById("fiche-matchs")),
  boutonFicheEnregistrer: /** @type {HTMLButtonElement} */ (document.getElementById("bouton-fiche-enregistrer")),
  boutonCompleter: /** @type {HTMLButtonElement} */ (document.getElementById("bouton-completer")),
  boutonSupprimer: /** @type {HTMLButtonElement} */ (document.getElementById("bouton-supprimer")),
  boutonRetour: /** @type {HTMLButtonElement} */ (document.getElementById("bouton-retour")),
  titreRecuperation: /** @type {HTMLElement} */ (document.getElementById("titre-recuperation")),
  vueReglages: /** @type {HTMLElement} */ (document.getElementById("vue-reglages")),
  boutonReglages: /** @type {HTMLButtonElement} */ (document.getElementById("bouton-reglages")),
  reglagesChemin: /** @type {HTMLElement} */ (document.getElementById("reglages-chemin")),
  reglagesAttente: /** @type {HTMLElement} */ (document.getElementById("reglages-attente")),
  formulaireReglages: /** @type {HTMLFormElement} */ (document.getElementById("formulaire-reglages")),
  reglageUtilisateur: /** @type {HTMLInputElement} */ (document.getElementById("reglage-utilisateur")),
  reglageTypes: /** @type {HTMLInputElement} */ (document.getElementById("reglage-types")),
  reglagesSections: /** @type {HTMLElement} */ (document.getElementById("reglages-sections")),
  reglageEntete: /** @type {HTMLInputElement} */ (document.getElementById("reglage-entete")),
  reglageDossierSessions: /** @type {HTMLInputElement} */ (document.getElementById("reglage-dossier-sessions")),
  reglageDossierPlanches: /** @type {HTMLInputElement} */ (document.getElementById("reglage-dossier-planches")),
  reglageDossierPictos: /** @type {HTMLInputElement} */ (document.getElementById("reglage-dossier-pictos")),
  reglagesSeuils: /** @type {HTMLElement} */ (document.getElementById("reglages-seuils")),
  reglagesObjectifs: /** @type {HTMLElement} */ (document.getElementById("reglages-objectifs")),
  boutonObjectifAjouter: /** @type {HTMLButtonElement} */ (document.getElementById("bouton-objectif-ajouter")),
  boutonReglagesDefauts: /** @type {HTMLButtonElement} */ (document.getElementById("bouton-reglages-defauts")),
  boutonReglagesRetour: /** @type {HTMLButtonElement} */ (document.getElementById("bouton-reglages-retour")),
  boutonReglagesRedemarrer: /** @type {HTMLButtonElement} */ (document.getElementById("bouton-reglages-redemarrer")),
  reglageSansBarres: /** @type {HTMLInputElement} */ (document.getElementById("reglage-sans-barres")),
  bande: /** @type {HTMLElement} */ (document.getElementById("bande")),
};

/**
 * Affiche un bandeau, ou le cache si le message est vide.
 * @param {HTMLElement} element
 * @param {string | undefined} message
 */
export function bandeau(element, message) {
  element.textContent = message ?? "";
  element.hidden = !message;
}

export function cacheLesBandeaux() {
  for (const cle of /** @type {const} */ (["progression", "erreur", "avertissement", "succes"])) {
    bandeau(elements[cle], "");
  }
}

/**
 * Le texte d'une erreur remontee par le pont, quelle qu'en soit la forme.
 * @param {unknown} erreur
 * @returns {string}
 */
export function messageDe(erreur) {
  if (erreur !== null && typeof erreur === "object" && "message" in erreur) {
    return String(erreur.message);
  }
  return String(erreur);
}
