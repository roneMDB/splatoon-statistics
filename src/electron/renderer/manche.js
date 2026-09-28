/**
 * Vue manche : le detail d'une manche de la session ouverte, les huit joueurs
 * avec leur equipement, et le passage a la manche voisine.
 */

import { api, bandeau, cacheLesBandeaux, elements, messageDe } from "./elements.js";
import { etat, montreLaVue } from "./etat.js";
import { formateLHeure } from "./matchs.js";

/** @typedef {import("../../battleDetail.ts").JoueurDeManche} JoueurDeManche */

/**
 * Le bloc d'un joueur : son arme, ses chiffres et son equipement.
 * @param {JoueurDeManche} joueur
 */
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

/**
 * Un camp : son titre et ses joueurs.
 * @param {string} titre
 * @param {JoueurDeManche[]} joueurs
 */
function construisUneEquipe(titre, joueurs) {
  const section = document.createElement("section");
  section.className = "equipe";
  const entete = document.createElement("h4");
  entete.textContent = titre;
  section.append(entete, ...joueurs.map(ligneDeJoueur));
  return section;
}

/**
 * Affiche le detail d'une manche de la session ouverte, par son rang.
 * @param {number} rang
 */
export async function ouvreLaManche(rang) {
  if (etat.ficheCourante === undefined) return;
  const row = etat.manchesCourantes[rang];
  if (row === undefined) return;

  cacheLesBandeaux();
  try {
    const detail = await api.readBattle({ path: etat.ficheCourante.path, uuid: row.uuid });
    etat.mancheCourante = detail;
    etat.rangDeLaManche = rang;

    elements.manchePosition.textContent =
      `Manche ${rang + 1} / ${etat.manchesCourantes.length}`;

    const heure = detail.startedAt ? formateLHeure(detail.startedAt) : "—";
    const score =
      detail.score === undefined
        ? ""
        : ` ${detail.score.nous}-${detail.score.eux}${detail.score.unite === "%" ? " %" : ""}`;
    const duree =
      detail.dureeSecondes === undefined
        ? ""
        : ` · ${Math.floor(detail.dureeSecondes / 60)} min ${String(detail.dureeSecondes % 60).padStart(2, "0")}`;
    elements.mancheResume.textContent =
      `${heure} · ${detail.rule} · ${detail.stage}\n` +
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
    elements.boutonMancheSuivante.disabled = rang === etat.manchesCourantes.length - 1;
    elements.boutonMancheStatink.hidden = !detail.url;

    montreLaVue("manche");
  } catch (erreur) {
    bandeau(elements.erreur, messageDe(erreur));
  }
}

elements.boutonManchePrecedente.addEventListener("click", () => {
  ouvreLaManche(etat.rangDeLaManche - 1);
});

elements.boutonMancheSuivante.addEventListener("click", () => {
  ouvreLaManche(etat.rangDeLaManche + 1);
});

elements.boutonMancheRetour.addEventListener("click", () => {
  etat.mancheCourante = undefined;
  etat.rangDeLaManche = -1;
  montreLaVue("fiche");
});

elements.boutonMancheStatink.addEventListener("click", async () => {
  if (etat.mancheCourante === undefined || !etat.mancheCourante.url) return;
  cacheLesBandeaux();
  elements.boutonMancheStatink.disabled = true;
  try {
    const issue = await api.openExternal(etat.mancheCourante.url);
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
    bandeau(elements.erreur, messageDe(erreur));
  } finally {
    elements.boutonMancheStatink.disabled = false;
  }
});
