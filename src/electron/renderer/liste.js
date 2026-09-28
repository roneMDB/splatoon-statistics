/**
 * Colonne de gauche : les sessions deja ecrites.
 */

import { api, bandeau, elements } from "./elements.js";
import { ouvreLaFiche } from "./fiche.js";
import { formateLaDate } from "./matchs.js";

/** @typedef {import("../../sessionList.ts").SessionSummary} SessionSummary */

/** @param {SessionSummary} session */
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

export async function rafraichisLaListe() {
  const { sessions, errors } = await api.listSessions();

  elements.liste.replaceChildren(...sessions.map(construisLaLigne));
  proposeLesEquipes(sessions);
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

/**
 * Remplit les suggestions des champs d'equipe avec les noms deja saisis. Le nom
 * de mon equipe change avec le temps : la liste suit l'ordre des sessions, la
 * plus recente d'abord, pour que le nom actuel soit propose en premier.
 *
 * @param {SessionSummary[]} sessions
 */
function proposeLesEquipes(sessions) {
  /** @param {"nomEquipe" | "nomEquipeAdverse"} champ */
  const options = (champ) =>
    [...new Set(sessions.map((session) => session[champ] ?? ""))]
      .filter((nom) => nom !== "")
      .map((nom) => {
        const option = document.createElement("option");
        option.value = nom;
        return option;
      });
  elements.equipesConnues.replaceChildren(...options("nomEquipe"));
  elements.equipesAdversesConnues.replaceChildren(...options("nomEquipeAdverse"));
}
