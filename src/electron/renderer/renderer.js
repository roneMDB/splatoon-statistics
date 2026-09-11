/**
 * Comportement de la fenetre.
 *
 * JavaScript simple, non transpile : ce fichier est copie tel quel a cote du
 * build. Il n'a acces qu'a `window.splatoonApi`, expose par le preload.
 */

const api = window.splatoonApi;

const elements = {
  formulaire: document.getElementById("formulaire"),
  bouton: document.getElementById("bouton-recuperer"),
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
};

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
  for (const type of choix.sessionTypes) {
    elements.type.append(new Option(type, type));
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

function construisLaLigne(session) {
  const ligne = document.createElement("li");
  ligne.className = "session";

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
  elements.bouton.textContent = verrouille ? "Récupération…" : "Récupérer";
  for (const champ of elements.formulaire.elements) {
    if (champ !== elements.bouton) champ.disabled = verrouille;
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
    const resultat = await api.fetchSession(saisie);
    bandeau(elements.progression, "");

    if (resultat.battleCount === 0) {
      bandeau(
        elements.avertissement,
        "Aucun match trouvé. Vérifiez la fenêtre de temps, le fuseau horaire, " +
          "le filtre de lobby, et que les matchs ont bien été envoyés à stat.ink.",
      );
    } else {
      bandeau(
        elements.succes,
        `${resultat.battleCount} match(s) — ${resultat.results.win}V - ` +
          `${resultat.results.lose}D. Écrit dans ${resultat.path}`,
      );
      // Le nom a servi : on le vide pour ne pas le reutiliser par megarde.
      elements.nom.value = "";
    }

    await rafraichisLaListe();
  } catch (erreur) {
    // Les valeurs saisies restent en place : on ne fait pas retaper le formulaire.
    bandeau(elements.progression, "");
    bandeau(elements.erreur, String(erreur?.message ?? erreur));
  } finally {
    desabonne();
    verrouilleLeFormulaire(false);
  }
});

preRemplisLaFenetre();
chargeLesChoix()
  .then(rafraichisLaListe)
  .catch((erreur) => {
    bandeau(elements.erreur, `Démarrage impossible : ${String(erreur?.message ?? erreur)}`);
  });
