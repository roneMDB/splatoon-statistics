/**
 * Vue manche : le detail d'une manche, les huit joueurs avec leur equipement,
 * et le passage a la manche voisine. La manche vient d'une session ouverte,
 * ou d'une partie que la veille vient d'envoyer (`envois.js`).
 */

import { api, bandeau, cacheLesBandeaux, elements, messageDe } from "./elements.js";
import { etat, montreLaVue } from "./etat.js";
import { formateLHeure } from "./matchs.js";

/** @typedef {import("../../battleDetail.ts").JoueurDeManche} JoueurDeManche */
/** @typedef {import("../../battleDetail.ts").BattleDetail} BattleDetail */

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
  nom.className = "joueur__nom";
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
 * Ou mene chaque bouton de la vue : la manche voisine quand il y en a une, et
 * la vue d'ou l'on vient. Une manche de session et une partie envoyee par la
 * veille partagent la vue, pas leur navigation.
 * @typedef {{ precedente?: () => void; suivante?: () => void; retour: () => void }} NavigationDeManche
 */

/** @type {NavigationDeManche} */
let navigation = { retour: () => montreLaVue("fiche") };

/**
 * Affiche le detail d'une manche, d'ou qu'il vienne.
 * @param {BattleDetail} detail
 * @param {string} position Titre de la vue (« Manche 3 / 12 »).
 * @param {NavigationDeManche} suite
 */
export function afficheLaManche(detail, position, suite) {
  etat.mancheCourante = detail;
  navigation = suite;

  elements.manchePosition.textContent = position;

  const heure = detail.startedAt ? formateLHeure(detail.startedAt) : "—";
  elements.mancheResume.textContent =
    `${heure} · ${detail.rule} · ${detail.stage}\n` +
    `${detail.resultLabel ?? "—"}${texteDuScore(detail)}${texteDeLaDuree(detail)}${detail.ko ? " · KO" : ""}`;

  bandeau(
    elements.mancheMedailles,
    detail.medailles.length ? `🏅 ${detail.medailles.join(" · ")}` : "",
  );

  elements.mancheEquipes.replaceChildren(
    construisUneEquipe("Nous", detail.nous),
    construisUneEquipe("Eux", detail.eux),
  );

  elements.boutonManchePrecedente.disabled = suite.precedente === undefined;
  elements.boutonMancheSuivante.disabled = suite.suivante === undefined;
  elements.boutonMancheStatink.hidden = !detail.url;

  montreLaVue("manche");
}

/**
 * ` 38-100 %`, ou rien sans score.
 * @param {BattleDetail} detail
 */
export function texteDuScore(detail) {
  return detail.score === undefined
    ? ""
    : ` ${detail.score.nous}-${detail.score.eux}${detail.score.unite === "%" ? " %" : ""}`;
}

/**
 * ` · 3 min 12`, ou rien sans duree.
 * @param {BattleDetail} detail
 */
export function texteDeLaDuree(detail) {
  return detail.dureeSecondes === undefined
    ? ""
    : ` · ${Math.floor(detail.dureeSecondes / 60)} min ${String(detail.dureeSecondes % 60).padStart(2, "0")}`;
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
    etat.rangDeLaManche = rang;
    const total = etat.manchesCourantes.length;
    afficheLaManche(detail, `Manche ${rang + 1} / ${total}`, {
      ...(rang > 0 ? { precedente: () => void ouvreLaManche(rang - 1) } : {}),
      ...(rang < total - 1 ? { suivante: () => void ouvreLaManche(rang + 1) } : {}),
      retour: () => {
        etat.rangDeLaManche = -1;
        montreLaVue("fiche");
      },
    });
  } catch (erreur) {
    bandeau(elements.erreur, messageDe(erreur));
  }
}

elements.boutonManchePrecedente.addEventListener("click", () => {
  navigation.precedente?.();
});

elements.boutonMancheSuivante.addEventListener("click", () => {
  navigation.suivante?.();
});

elements.boutonMancheRetour.addEventListener("click", () => {
  etat.mancheCourante = undefined;
  navigation.retour();
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
          "indiquez un navigateur dans les réglages, renseignez la variable BROWSER ou installez wslu.",
      );
    }
  } catch (erreur) {
    bandeau(elements.erreur, messageDe(erreur));
  } finally {
    elements.boutonMancheStatink.disabled = false;
  }
});
