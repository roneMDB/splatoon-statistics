/**
 * Comportement de la fenetre.
 *
 * JavaScript simple, non transpile : ce fichier est copie tel quel a cote du
 * build. Il n'a acces qu'a `window.splatoonApi`, expose par le preload.
 */

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
  ficheNom: document.getElementById("fiche-nom"),
  ficheType: document.getElementById("fiche-type"),
  ficheResume: document.getElementById("fiche-resume"),
  ficheMatchs: document.getElementById("fiche-matchs"),
  boutonFicheEnregistrer: document.getElementById("bouton-fiche-enregistrer"),
  boutonSupprimer: document.getElementById("bouton-supprimer"),
  boutonRetour: document.getElementById("bouton-retour"),
};

/** Une seule vue visible a la fois dans la colonne de droite. */
function montreLaVue(nom) {
  elements.vueFormulaire.hidden = nom !== "formulaire";
  elements.vueApercu.hidden = nom !== "apercu";
  elements.vueFiche.hidden = nom !== "fiche";
}

/** Tableau des matchs, partage par l'apercu et la fiche. */
function construisLesMatchs(rows) {
  return rows.map((row) => {
    const ligne = document.createElement("div");
    ligne.className = `match match--${row.result ?? "inconnu"}`;
    const heure = row.startedAt
      ? new Date(row.startedAt).toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";
    for (const valeur of [heure, row.rule ?? "—", row.stage ?? "—", row.result ?? "—"]) {
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
    elements.ficheResume.textContent =
      `${formateLaDate(summary.window.from)} → ${formateLaDate(summary.window.to)}\n` +
      `${summary.battleCount} match(s) — ${summary.results.win}V - ${summary.results.lose}D`;
    elements.ficheMatchs.replaceChildren(...construisLesMatchs(rows));
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
