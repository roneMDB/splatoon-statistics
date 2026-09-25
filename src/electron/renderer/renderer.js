/**
 * Comportement de la fenetre.
 *
 * JavaScript simple, non transpile : ce fichier est copie tel quel a cote du
 * build. Il n'a acces qu'a `window.splatoonApi`, expose par le preload.
 */

import { construisLeRendu } from "./markdown.js";

const api = window.splatoonApi;

const elements = {
  formulaire: document.getElementById("formulaire"),
  bouton: document.getElementById("bouton-previsualiser"),
  nom: document.getElementById("champ-nom"),
  debut: document.getElementById("champ-debut"),
  fin: document.getElementById("champ-fin"),
  type: document.getElementById("champ-type"),
  lobby: document.getElementById("champ-lobby"),
  compte: document.getElementById("champ-compte"),
  liste: document.getElementById("sessions-liste"),
  compteSessions: document.getElementById("sessions-compte"),
  listeVide: document.getElementById("sessions-vide"),
  listeErreurs: document.getElementById("sessions-erreurs"),
  progression: document.getElementById("progression"),
  erreur: document.getElementById("erreur"),
  avertissement: document.getElementById("avertissement"),
  succes: document.getElementById("succes"),
  vueFormulaire: document.getElementById("vue-formulaire"),
  vueApercu: document.getElementById("vue-apercu"),
  vueFiche: document.getElementById("vue-fiche"),
  apercuResume: document.getElementById("apercu-resume"),
  apercuMatchs: document.getElementById("apercu-matchs"),
  boutonEnregistrer: document.getElementById("bouton-enregistrer"),
  boutonAnnuler: document.getElementById("bouton-annuler"),
  boutonQuitter: document.getElementById("bouton-quitter"),
  ficheNom: document.getElementById("fiche-nom"),
  ficheType: document.getElementById("fiche-type"),
  ficheObjectif: document.getElementById("fiche-objectif"),
  ficheRessenti: document.getElementById("fiche-ressenti"),
  compteRenduSections: document.getElementById("compte-rendu-sections"),
  compteRenduTexte: document.getElementById("compte-rendu-texte"),
  boutonGenerer: document.getElementById("bouton-generer"),
  boutonCopier: document.getElementById("bouton-copier"),
  boutonPlanche: document.getElementById("bouton-planche"),
  boutonPlancheOuvrir: document.getElementById("bouton-planche-ouvrir"),
  plancheEntete: document.getElementById("planche-entete"),
  plancheResultat: document.getElementById("planche-resultat"),
  compteRenduOnglets: document.getElementById("compte-rendu-onglets"),
  compteRenduApercu: document.getElementById("compte-rendu-apercu"),
  ongletApercu: document.getElementById("onglet-apercu"),
  ongletMarkdown: document.getElementById("onglet-markdown"),
  vueManche: document.getElementById("vue-manche"),
  manchePosition: document.getElementById("manche-position"),
  mancheResume: document.getElementById("manche-resume"),
  mancheMedailles: document.getElementById("manche-medailles"),
  mancheEquipes: document.getElementById("manche-equipes"),
  boutonManchePrecedente: document.getElementById("bouton-manche-precedente"),
  boutonMancheSuivante: document.getElementById("bouton-manche-suivante"),
  boutonMancheRetour: document.getElementById("bouton-manche-retour"),
  boutonMancheStatink: document.getElementById("bouton-manche-statink"),
  ficheResume: document.getElementById("fiche-resume"),
  ficheMatchs: document.getElementById("fiche-matchs"),
  boutonFicheEnregistrer: document.getElementById("bouton-fiche-enregistrer"),
  boutonSupprimer: document.getElementById("bouton-supprimer"),
  boutonRetour: document.getElementById("bouton-retour"),
  titreRecuperation: document.getElementById("titre-recuperation"),
  vueReglages: document.getElementById("vue-reglages"),
  boutonReglages: document.getElementById("bouton-reglages"),
  reglagesChemin: document.getElementById("reglages-chemin"),
  reglagesAttente: document.getElementById("reglages-attente"),
  formulaireReglages: document.getElementById("formulaire-reglages"),
  reglageUtilisateur: document.getElementById("reglage-utilisateur"),
  reglageTypes: document.getElementById("reglage-types"),
  reglagesSections: document.getElementById("reglages-sections"),
  reglageEntete: document.getElementById("reglage-entete"),
  reglageDossierSessions: document.getElementById("reglage-dossier-sessions"),
  reglageDossierPlanches: document.getElementById("reglage-dossier-planches"),
  reglageDossierPictos: document.getElementById("reglage-dossier-pictos"),
  reglagesSeuils: document.getElementById("reglages-seuils"),
  boutonReglagesDefauts: document.getElementById("bouton-reglages-defauts"),
  boutonReglagesRetour: document.getElementById("bouton-reglages-retour"),
  boutonReglagesRedemarrer: document.getElementById("bouton-reglages-redemarrer"),
};

/** Vue affichee, pour que « Retour » des reglages y ramene. */
let vueCourante = "formulaire";
const TITRE_RECUPERATION = elements.titreRecuperation.textContent;

/** Une seule vue visible a la fois dans la colonne de droite. */
function montreLaVue(nom) {
  vueCourante = nom;
  elements.vueFormulaire.hidden = nom !== "formulaire";
  elements.vueApercu.hidden = nom !== "apercu";
  elements.vueFiche.hidden = nom !== "fiche";
  elements.vueManche.hidden = nom !== "manche";
  elements.vueReglages.hidden = nom !== "reglages";
  elements.titreRecuperation.textContent = nom === "reglages" ? "Réglages" : TITRE_RECUPERATION;
}

/**
 * Tableau des matchs, partage par l'apercu et la fiche.
 *
 * `ouvrable` n'est vrai que dans la fiche : l'apercu d'une recuperation n'a pas
 * encore de fichier sur disque, donc pas de manche a relire.
 */
function construisLesMatchs(rows, ouvrable = false) {
  return rows.map((row, index) => {
    const ligne = document.createElement("div");
    ligne.className = `match match--${row.result ?? "inconnu"}`;
    if (ouvrable) {
      ligne.classList.add("match--ouvrable");
      ligne.setAttribute("role", "button");
      ligne.setAttribute("tabindex", "0");
      ligne.addEventListener("click", () => ouvreLaManche(index));
      ligne.addEventListener("keydown", (evenement) => {
        if (evenement.key === "Enter" || evenement.key === " ") {
          evenement.preventDefault();
          ouvreLaManche(index);
        }
      });
    }
    const heure = row.startedAt
      ? new Date(row.startedAt).toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";
    // `row.result` reste la cle de mise en forme (classe CSS ci-dessus) ;
    // c'est `row.resultLabel` qui porte le libelle francais.
    for (const valeur of [heure, row.rule ?? "—", row.stage ?? "—", row.resultLabel ?? "—"]) {
      const cellule = document.createElement("span");
      cellule.textContent = valeur;
      ligne.append(cellule);
    }
    return ligne;
  });
}

function ecrisLeResume(element, donnees) {
  element.textContent =
    `${donnees.battleCount} match(s) — ${donnees.results.win}V - ${donnees.results.lose}D`;
}

/** Affiche un bandeau, ou le cache si le message est vide. */
function bandeau(element, message) {
  element.textContent = message ?? "";
  element.hidden = !message;
}

function cacheLesBandeaux() {
  for (const cle of ["progression", "erreur", "avertissement", "succes"]) {
    bandeau(elements[cle], "");
  }
}

/** `2026-08-19T21:00` -> `2026-08-19 21:00`, le format attendu par le noyau. */
function versFormatNoyau(valeur) {
  return valeur ? valeur.replace("T", " ") : undefined;
}

/** Instant local au format d'un champ datetime-local. */
function versChampDate(date) {
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
function preRemplisLaFenetre() {
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

/** Remplit les listes fermees depuis le noyau, pour ne rien redeclarer ici. */
async function chargeLesChoix() {
  const choix = await api.choices();

  elements.type.append(new Option("— aucun —", ""));
  elements.ficheType.append(new Option("— aucun —", ""));
  for (const type of choix.sessionTypes) {
    elements.type.append(new Option(type, type));
    elements.ficheType.append(new Option(type, type));
  }

  for (const section of choix.reportSections) {
    const etiquette = document.createElement("label");
    etiquette.className = "section";
    const case_ = document.createElement("input");
    case_.type = "checkbox";
    case_.value = section.cle;
    // Les sections cochees d'office viennent des reglages (settings.json).
    case_.checked = section.coche !== false;
    etiquette.append(case_, document.createTextNode(` ${section.libelle}`));
    elements.compteRenduSections.append(etiquette);
  }

  elements.plancheEntete.checked = choix.enteteParDefaut === true;

  elements.lobby.append(new Option("— tous —", ""));
  for (const lobby of choix.lobbies) {
    elements.lobby.append(new Option(lobby, lobby));
  }
  elements.lobby.value = "private";

  elements.compte.value = choix.defaultUser;
}

function formateLaDate(iso) {
  return new Date(iso).toLocaleString("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * Ouvre la fiche d'une session existante : ses matchs, nom et type modifiables.
 * N'echoue jamais silencieusement : une lecture en erreur (fichier supprime ou
 * modifie entre le listing et le clic, etc.) est affichee dans le bandeau
 * d'erreur, comme pour les autres actions.
 */
async function ouvreLaFiche(session) {
  cacheLesBandeaux();
  try {
    const { summary, rows } = await api.readSession(session.path);
    ficheCourante = summary;
    elements.ficheNom.value = summary.name ?? "";
    elements.ficheType.value = summary.type ?? "";
    elements.ficheObjectif.value = summary.objectif ?? "";
    elements.ficheRessenti.value = summary.ressenti ?? "";
    // Un compte rendu et une planche affiches appartiennent a la session
    // precedente : on les vide.
    cacheLeCompteRendu();
    cacheLaPlanche();
    elements.ficheResume.textContent =
      `${formateLaDate(summary.window.from)} → ${formateLaDate(summary.window.to)}\n` +
      `${summary.battleCount} match(s) — ${summary.results.win}V - ${summary.results.lose}D`;
    manchesCourantes = rows;
    elements.ficheMatchs.replaceChildren(...construisLesMatchs(rows, true));
    montreLaVue("fiche");
  } catch (erreur) {
    bandeau(elements.erreur, String(erreur?.message ?? erreur));
  }
}

function construisLaLigne(session) {
  const ligne = document.createElement("li");
  ligne.className = "session";
  ligne.setAttribute("role", "button");
  ligne.setAttribute("tabindex", "0");

  const nom = document.createElement("div");
  nom.className = session.name ? "session__nom" : "session__nom session__nom--absent";
  nom.textContent = session.name ?? "Session sans nom";
  ligne.append(nom);

  const meta = document.createElement("div");
  meta.className = "session__meta";

  if (session.type) {
    const type = document.createElement("span");
    type.className = "session__type";
    type.textContent = session.type;
    meta.append(type);
  }

  const quand = document.createElement("span");
  quand.textContent = formateLaDate(session.window.from);
  meta.append(quand);

  const bilan = document.createElement("span");
  bilan.className = "session__bilan";
  const victoires = document.createElement("b");
  victoires.textContent = `${session.results.win}V`;
  const defaites = document.createElement("i");
  defaites.textContent = `${session.results.lose}D`;
  bilan.append(victoires, " - ", defaites);
  meta.append(bilan);

  ligne.append(meta);

  ligne.addEventListener("click", () => {
    ouvreLaFiche(session);
  });
  ligne.addEventListener("keydown", (evenement) => {
    if (evenement.key === "Enter" || evenement.key === " ") {
      evenement.preventDefault();
      ouvreLaFiche(session);
    }
  });

  return ligne;
}

async function rafraichisLaListe() {
  const { sessions, errors } = await api.listSessions();

  elements.liste.replaceChildren(...sessions.map(construisLaLigne));
  elements.listeVide.hidden = sessions.length > 0;
  elements.compteSessions.textContent = sessions.length
    ? `${sessions.length} session${sessions.length > 1 ? "s" : ""}`
    : "";

  bandeau(
    elements.listeErreurs,
    errors.length
      ? `${errors.length} fichier(s) illisible(s) et ignoré(s) :\n` +
          errors.map((erreur) => `${erreur.path} — ${erreur.message}`).join("\n")
      : "",
  );
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

function verrouilleLeFormulaire(verrouille) {
  elements.formulaire.setAttribute("aria-busy", String(verrouille));
  elements.bouton.disabled = verrouille;
  elements.bouton.textContent = verrouille ? "Prévisualisation…" : "Prévisualiser";
  for (const champ of elements.formulaire.elements) {
    if (champ !== elements.bouton) champ.disabled = verrouille;
  }
}

/** Apercu en cours, consomme par l'enregistrement ; session ouverte dans la fiche. */
let apercuCourant;
let ficheCourante;
/** Lignes de la session ouverte, et rang de la manche affichee. */
let manchesCourantes = [];
let rangDeLaManche = -1;
/** Detail affiche, pour savoir quel lien stat.ink ouvrir. */
let mancheCourante;
/** Chemin du dernier PNG de planche fabrique, pour le bouton "Ouvrir le dossier". */
let cheminPlancheCourante;

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
    apercuCourant = resultat;

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
    bandeau(elements.erreur, String(erreur?.message ?? erreur));
  } finally {
    desabonne();
    verrouilleLeFormulaire(false);
  }
});

elements.boutonEnregistrer.addEventListener("click", async () => {
  if (apercuCourant === undefined) return;
  cacheLesBandeaux();
  elements.boutonEnregistrer.disabled = true;
  try {
    const resume = await api.saveSession(apercuCourant.previewId);
    apercuCourant = undefined;
    elements.nom.value = "";
    bandeau(
      elements.succes,
      `${resume.battleCount} match(s) enregistré(s). Écrit dans ${resume.path}`,
    );
    await rafraichisLaListe();
    montreLaVue("formulaire");
  } catch (erreur) {
    bandeau(elements.erreur, String(erreur?.message ?? erreur));
  } finally {
    elements.boutonEnregistrer.disabled = false;
  }
});

elements.boutonAnnuler.addEventListener("click", () => {
  apercuCourant = undefined;
  cacheLesBandeaux();
  montreLaVue("formulaire");
});

elements.boutonFicheEnregistrer.addEventListener("click", async () => {
  if (ficheCourante === undefined) return;
  cacheLesBandeaux();
  elements.boutonFicheEnregistrer.disabled = true;
  try {
    const resume = await api.updateSession({
      path: ficheCourante.path,
      name: elements.ficheNom.value.trim() || undefined,
      type: elements.ficheType.value || undefined,
      objectif: elements.ficheObjectif.value.trim() || undefined,
      ressenti: elements.ficheRessenti.value.trim() || undefined,
    });
    // Sans cela, la fiche garde le resume perime : une confirmation de
    // suppression juste apres un renommage afficherait encore l'ancien nom.
    ficheCourante = resume;
    await rafraichisLaListe();
    bandeau(elements.succes, "Session modifiée.");
  } catch (erreur) {
    bandeau(elements.erreur, String(erreur?.message ?? erreur));
  } finally {
    elements.boutonFicheEnregistrer.disabled = false;
  }
});

elements.boutonSupprimer.addEventListener("click", async () => {
  if (ficheCourante === undefined) return;
  const nom = ficheCourante.name ?? "cette session sans nom";
  if (!window.confirm(`Supprimer définitivement « ${nom} » ? Cette action est irréversible.`)) {
    return;
  }
  cacheLesBandeaux();
  elements.boutonSupprimer.disabled = true;
  try {
    await api.deleteSession(ficheCourante.path);
    ficheCourante = undefined;
    await rafraichisLaListe();
    montreLaVue("formulaire");
    bandeau(elements.succes, `Session « ${nom} » supprimée.`);
  } catch (erreur) {
    bandeau(elements.erreur, String(erreur?.message ?? erreur));
  } finally {
    elements.boutonSupprimer.disabled = false;
  }
});

/** Une ligne « libellé : valeur », brique des blocs de la vue manche. */
function ligneDeJoueur(joueur) {
  const bloc = document.createElement("div");
  bloc.className = joueur.moi ? "joueur joueur--moi" : "joueur";

  const entete = document.createElement("div");
  entete.className = "joueur__entete";

  const nom = document.createElement("b");
  nom.textContent = joueur.moi ? `→ ${joueur.nom}` : joueur.nom;
  entete.append(nom);

  const arme = document.createElement("span");
  arme.className = "joueur__arme";
  arme.textContent = joueur.arme;
  entete.append(arme);

  const chiffres = document.createElement("span");
  chiffres.className = "joueur__chiffres";
  chiffres.textContent =
    `${joueur.kill} élim. · ${joueur.assist} assist. · ${joueur.death} morts · ` +
    `${joueur.special} spé · ${joueur.inked} encre`;
  entete.append(chiffres);

  if (joueur.deconnecte) {
    const deco = document.createElement("span");
    deco.className = "joueur__deco";
    deco.textContent = "déconnecté";
    entete.append(deco);
  }

  bloc.append(entete);

  for (const piece of joueur.equipement) {
    const ligne = document.createElement("div");
    ligne.className = "joueur__gear";
    const nomPiece = document.createElement("span");
    nomPiece.className = "joueur__piece";
    nomPiece.textContent = piece.piece;
    ligne.append(nomPiece, document.createTextNode(piece.capacites.join(" · ")));
    bloc.append(ligne);
  }

  return bloc;
}

/** Un camp : son titre et ses joueurs. */
function construisUneEquipe(titre, joueurs) {
  const section = document.createElement("section");
  section.className = "equipe";
  const entete = document.createElement("h4");
  entete.textContent = titre;
  section.append(entete, ...joueurs.map(ligneDeJoueur));
  return section;
}

/** Affiche le detail d'une manche de la session ouverte, par son rang. */
async function ouvreLaManche(rang) {
  if (ficheCourante === undefined) return;
  const row = manchesCourantes[rang];
  if (row === undefined) return;

  cacheLesBandeaux();
  try {
    const detail = await api.readBattle({ path: ficheCourante.path, uuid: row.uuid });
    mancheCourante = detail;
    rangDeLaManche = rang;

    elements.manchePosition.textContent =
      `Manche ${rang + 1} / ${manchesCourantes.length}`;

    const heure = detail.startedAt
      ? new Date(detail.startedAt).toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";
    const score =
      detail.score === undefined
        ? ""
        : ` ${detail.score.nous}-${detail.score.eux}${detail.score.unite === "%" ? " %" : ""}`;
    const duree =
      detail.dureeSecondes === undefined
        ? ""
        : ` · ${Math.floor(detail.dureeSecondes / 60)} min ${String(detail.dureeSecondes % 60).padStart(2, "0")}`;
    elements.mancheResume.textContent =
      `${heure} · ${detail.rule} · ${detail.stage}
` +
      `${detail.resultLabel ?? "—"}${score}${duree}${detail.ko ? " · KO" : ""}`;

    bandeau(
      elements.mancheMedailles,
      detail.medailles.length ? `🏅 ${detail.medailles.join(" · ")}` : "",
    );

    elements.mancheEquipes.replaceChildren(
      construisUneEquipe("Nous", detail.nous),
      construisUneEquipe("Eux", detail.eux),
    );

    elements.boutonManchePrecedente.disabled = rang === 0;
    elements.boutonMancheSuivante.disabled = rang === manchesCourantes.length - 1;
    elements.boutonMancheStatink.hidden = !detail.url;

    montreLaVue("manche");
  } catch (erreur) {
    bandeau(elements.erreur, String(erreur?.message ?? erreur));
  }
}

elements.boutonManchePrecedente.addEventListener("click", () => {
  ouvreLaManche(rangDeLaManche - 1);
});

elements.boutonMancheSuivante.addEventListener("click", () => {
  ouvreLaManche(rangDeLaManche + 1);
});

elements.boutonMancheRetour.addEventListener("click", () => {
  mancheCourante = undefined;
  rangDeLaManche = -1;
  montreLaVue("fiche");
});

elements.boutonMancheStatink.addEventListener("click", async () => {
  if (mancheCourante === undefined || !mancheCourante.url) return;
  cacheLesBandeaux();
  elements.boutonMancheStatink.disabled = true;
  try {
    const issue = await api.openExternal(mancheCourante.url);
    // Le processus principal a copie le lien faute de pouvoir l'ouvrir : soit
    // xdg-open manque, soit aucun navigateur n'est atteignable - le cas normal
    // sous WSL, ou le navigateur vit du cote Windows.
    if (issue === "copie") {
      bandeau(
        elements.avertissement,
        "Aucun navigateur n'est accessible depuis cette machine. L'adresse a été " +
          "copiée dans le presse-papier. Pour ouvrir les liens directement, " +
          "renseignez la variable BROWSER ou installez wslu.",
      );
    }
  } catch (erreur) {
    bandeau(elements.erreur, String(erreur?.message ?? erreur));
  } finally {
    elements.boutonMancheStatink.disabled = false;
  }
});

/** Bascule entre l'apercu rendu et le Markdown source. */
function montreLOnglet(nom) {
  const apercu = nom === "apercu";
  elements.ongletApercu.setAttribute("aria-selected", String(apercu));
  elements.ongletMarkdown.setAttribute("aria-selected", String(!apercu));
  elements.compteRenduApercu.hidden = !apercu;
  elements.compteRenduTexte.hidden = apercu;
}

elements.ongletApercu.addEventListener("click", () => montreLOnglet("apercu"));
elements.ongletMarkdown.addEventListener("click", () => montreLOnglet("markdown"));

/** Sections cochees, dans l'ordre du document. */
function sectionsChoisies() {
  return [...elements.compteRenduSections.querySelectorAll("input:checked")].map(
    (case_) => case_.value,
  );
}

/** Remet le compte rendu a zero : rien a copier tant que rien n'est genere. */
function cacheLeCompteRendu() {
  elements.compteRenduTexte.value = "";
  elements.compteRenduTexte.hidden = true;
  elements.compteRenduApercu.replaceChildren();
  elements.compteRenduApercu.hidden = true;
  elements.compteRenduOnglets.hidden = true;
  elements.boutonCopier.disabled = true;
}

/**
 * Remet la planche a zero. Distincte de `cacheLeCompteRendu` : la planche
 * appartient a la session precedente seulement au changement de fiche, pas a
 * un echec de generation du compte rendu, qui ne change pas la session
 * affichee. Les deux etaient videes ensemble ; un echec de generation
 * effacait alors la seule trace du chemin du PNG deja ecrit.
 */
function cacheLaPlanche() {
  elements.plancheResultat.hidden = true;
  elements.plancheResultat.textContent = "";
  elements.boutonPlancheOuvrir.hidden = true;
  cheminPlancheCourante = undefined;
}

elements.boutonGenerer.addEventListener("click", async () => {
  if (ficheCourante === undefined) return;
  cacheLesBandeaux();

  const sections = sectionsChoisies();
  if (sections.length === 0) {
    bandeau(elements.avertissement, "Cochez au moins une section.");
    return;
  }

  elements.boutonGenerer.disabled = true;
  try {
    const texte = await api.buildReport({
      path: ficheCourante.path,
      sections,
      // La saisie en cours prime sur ce qui est enregistre : on peut relire un
      // compte rendu avant de decider de garder l'objectif qu'on vient d'ecrire.
      objectif: elements.ficheObjectif.value.trim(),
      ressenti: elements.ficheRessenti.value.trim(),
    });
    elements.compteRenduTexte.value = texte;
    elements.compteRenduApercu.replaceChildren(construisLeRendu(texte));
    elements.compteRenduOnglets.hidden = false;
    montreLOnglet("apercu");
    elements.boutonCopier.disabled = false;
  } catch (erreur) {
    cacheLeCompteRendu();
    bandeau(elements.erreur, String(erreur?.message ?? erreur));
  } finally {
    elements.boutonGenerer.disabled = false;
  }
});

/*
 * Fermer revient au processus principal : `window.close()` fermerait la
 * fenetre sans quitter l'application. Aucune confirmation — rien n'est perdu,
 * les sessions sont deja sur disque et la fiche en cours se reouvre telle
 * quelle.
 */
elements.boutonQuitter.addEventListener("click", async () => {
  await api.quitApp();
});

elements.boutonCopier.addEventListener("click", async () => {
  cacheLesBandeaux();
  elements.boutonCopier.disabled = true;
  try {
    await api.copyToClipboard(elements.compteRenduTexte.value);
    bandeau(elements.succes, "Compte rendu copié — prêt à coller dans Discord.");
  } catch (erreur) {
    bandeau(elements.erreur, String(erreur?.message ?? erreur));
  } finally {
    elements.boutonCopier.disabled = false;
  }
});

elements.boutonPlanche.addEventListener("click", async () => {
  if (ficheCourante === undefined) return;
  cacheLesBandeaux();

  elements.boutonPlanche.disabled = true;
  cacheLaPlanche();
  try {
    // Memes reglages que « Generer » : les sections cochees, et la saisie en
    // cours de l'objectif et du ressenti plutot que ce qui est enregistre.
    const planche = await api.buildPlanche({
      path: ficheCourante.path,
      ...(elements.plancheEntete.checked
        ? {
            entete: {
              sections: sectionsChoisies(),
              objectif: elements.ficheObjectif.value.trim(),
              ressenti: elements.ficheRessenti.value.trim(),
            },
          }
        : {}),
    });
    const ko = Math.round(planche.octets / 1024);
    // Sous WSL, le chemin Linux ne se colle pas dans l'explorateur Windows :
    // on affiche l'equivalent Windows quand l'application l'a fourni, le
    // chemin Linux sinon.
    const cheminAffiche = planche.cheminWindows ?? planche.chemin;
    const lignes = [`${cheminAffiche} · ${planche.largeur} × ${planche.hauteur} px · ${ko} Ko`];
    // "Copier" met le Markdown dans le presse-papier ; la planche l'y
    // remplace par l'image. Le dire evite de perdre un compte rendu qu'on
    // vient de copier sans s'en apercevoir.
    lignes.push(
      planche.pressePapier === "copie"
        ? "A remplacé le presse-papier par l'image — prête à coller dans Discord."
        : "Presse-papier indisponible : glissez le fichier dans Discord.",
    );
    if (planche.avertissement !== undefined) lignes.push(planche.avertissement);
    elements.plancheResultat.textContent = lignes.join("\n");
    elements.plancheResultat.hidden = false;
    cheminPlancheCourante = planche.chemin;
    elements.boutonPlancheOuvrir.hidden = false;
  } catch (erreur) {
    bandeau(elements.erreur, String(erreur?.message ?? erreur));
  } finally {
    elements.boutonPlanche.disabled = false;
  }
});

elements.boutonPlancheOuvrir.addEventListener("click", async () => {
  if (cheminPlancheCourante === undefined) return;
  cacheLesBandeaux();

  elements.boutonPlancheOuvrir.disabled = true;
  try {
    const issue = await api.revealPlanche(cheminPlancheCourante);
    if (issue === "copie") {
      bandeau(
        elements.succes,
        "Explorateur indisponible : le chemin a été copié dans le presse-papier.",
      );
    }
  } catch (erreur) {
    bandeau(elements.erreur, String(erreur?.message ?? erreur));
  } finally {
    elements.boutonPlancheOuvrir.disabled = false;
  }
});

elements.boutonRetour.addEventListener("click", () => {
  ficheCourante = undefined;
  montreLaVue("formulaire");
});

preRemplisLaFenetre();
chargeLesChoix()
  .then(rafraichisLaListe)
  .catch((erreur) => {
    bandeau(elements.erreur, `Démarrage impossible : ${String(erreur?.message ?? erreur)}`);
  });

/* --- Reglages --- */

/** Ce que l'ecran a recu a l'ouverture : descriptions, valeurs par defaut. */
let ecranDesReglages;
/** Vue a retrouver en quittant les reglages. */
let vueAvantReglages = "formulaire";

/** Une part (0,5) s'affiche en pourcentage (50) ; le reste tel quel. */
const versLEcran = (valeur, unite) => (unite === "%" ? Math.round(valeur * 100) : valeur);
const depuisLEcran = (valeur, unite) => (unite === "%" ? valeur / 100 : valeur);

/**
 * Construit les cases de sections et les lignes de seuils, une fois : leur
 * liste vient du processus principal, qui est seul a la connaitre.
 */
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
      const defaut = versLEcran(ecran.defauts.seuils[cle], description.unite);
      explication.textContent = `${description.explication} Par défaut : ${defaut} ${description.unite}.`;

      ligne.append(titre, valeur, explication);
      return ligne;
    }),
  );
}

/** Remplit le formulaire avec des reglages complets. */
function remplisLesReglages(reglages) {
  elements.reglageUtilisateur.value = reglages.utilisateur;
  elements.reglageTypes.value = reglages.typesDeSession.join(", ");
  for (const case_ of elements.reglagesSections.querySelectorAll("input")) {
    case_.checked = reglages.sectionsParDefaut.includes(case_.value);
  }
  elements.reglageEntete.checked = reglages.enteteParDefaut;
  elements.reglageDossierSessions.value = reglages.dossiers.sessions;
  elements.reglageDossierPlanches.value = reglages.dossiers.planches;
  elements.reglageDossierPictos.value = reglages.dossiers.pictos;
  for (const champ of elements.reglagesSeuils.querySelectorAll("input")) {
    champ.value = String(versLEcran(reglages.seuils[champ.dataset.cle], champ.dataset.unite));
  }
}

/**
 * Relit le formulaire. Aucune validation ici : le processus principal valide,
 * et son message nomme le champ fautif. Un champ numerique vide part tel quel
 * (`NaN` devient `null` en JSON) et se fait refuser la-bas.
 */
function lisLesReglages() {
  const seuils = {};
  for (const champ of elements.reglagesSeuils.querySelectorAll("input")) {
    seuils[champ.dataset.cle] = depuisLEcran(champ.valueAsNumber, champ.dataset.unite);
  }
  return {
    utilisateur: elements.reglageUtilisateur.value,
    typesDeSession: elements.reglageTypes.value
      .split(",")
      .map((type) => type.trim())
      .filter((type) => type !== ""),
    sectionsParDefaut: [...elements.reglagesSections.querySelectorAll("input:checked")].map(
      (case_) => case_.value,
    ),
    enteteParDefaut: elements.reglageEntete.checked,
    dossiers: {
      sessions: elements.reglageDossierSessions.value,
      planches: elements.reglageDossierPlanches.value,
      pictos: elements.reglageDossierPictos.value,
    },
    seuils,
  };
}

/**
 * Le message de validation, dit dans les mots de l'ecran. Le processus
 * principal nomme la cle du fichier (`"seuils".medaillesCitees`), ce qui sert
 * en ligne de commande ; ici on remplace chemin et cle par le libelle affiche.
 */
function messageDeReglage(erreur) {
  const brut = String(erreur?.message ?? erreur).replace(
    /^Error invoking remote method '[^']+': (Error: )?/,
    "",
  );
  const seuil = /"seuils"\.(\w+) : (.*)$/.exec(brut);
  const description = seuil && ecranDesReglages?.descriptions[seuil[1]];
  if (description) return `« ${description.libelle} » : ${seuil[2]}`;
  // Les autres messages commencent par le chemin du fichier : inutile a l'ecran.
  return brut.replace(/^[^"]*?, (?=")/, "");
}

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
    if (vueCourante !== "reglages") vueAvantReglages = vueCourante;
    montreLaVue("reglages");
    if (ecran.erreur !== undefined) {
      bandeau(
        elements.avertissement,
        `Le fichier de réglages est invalide : ${ecran.erreur} ` +
          "Le formulaire montre les réglages en cours ; enregistrer remplacera le fichier.",
      );
    }
  } catch (erreur) {
    bandeau(elements.erreur, String(erreur?.message ?? erreur));
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

elements.boutonReglagesRedemarrer.addEventListener("click", async () => {
  await api.relaunchApp();
});
