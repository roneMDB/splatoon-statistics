/**
 * Comportement de la fenetre : point d'entree.
 *
 * JavaScript simple, non transpile : les modules de ce dossier sont copies tels
 * quels a cote du build, et verifies par `tsconfig.renderer.json` depuis leurs
 * annotations JSDoc. Ils n'ont acces qu'a `window.splatoonApi`, expose par le
 * preload.
 *
 * Chaque module branche ses propres boutons en se chargeant ; celui-ci les
 * charge tous, habille la fenetre et remplit ce qui vient du noyau.
 */

import "./compteRendu.js";
import { api, bandeau, elements, messageDe } from "./elements.js";
import { etat } from "./etat.js";
import "./fiche.js";
import { rafraichisLaListe } from "./liste.js";
import "./manche.js";
import { preRemplisLaFenetre } from "./recuperation.js";
import "./reglages.js";

/**
 * Habille la fenetre aux couleurs du jeu : polices, motif, pictos de regle, et
 * bande de titre quand la fenetre n'a plus la sienne.
 *
 * Rien ici n'est indispensable. Sans `npm run pictos`, les polices et les
 * pictos manquent et la fenetre garde ses polices systeme ; un echec de
 * chargement d'une police ne doit pas empecher de s'en servir.
 *
 * Les polices passent par `FontFace` et le motif par une propriete CSS posee
 * depuis le script : une feuille `<style>` ecrite a la volee serait refusee
 * par la politique de securite du document (`style-src 'self'`).
 */
async function appliqueLHabillage() {
  const habillage = await api.habillage();
  const racine = document.documentElement;

  for (const [famille, uri] of /** @type {const} */ ([
    ["Splatoon Titre", habillage.polices.titre],
    ["Splatoon Texte", habillage.polices.texte],
  ])) {
    if (uri === undefined) continue;
    try {
      document.fonts.add(await new FontFace(famille, `url("${uri}")`).load());
    } catch {
      // Police illisible : on reste sur la pile de repli.
    }
  }

  racine.style.setProperty("--motif", `url("${habillage.motif}")`);
  etat.pictosDeRegle = habillage.regles;
  etat.couleursDeRegle = habillage.couleurs;

  if (habillage.sansBarres) {
    racine.style.setProperty("--hauteur-bande", `${habillage.hauteurBande}px`);
    document.body.classList.add("sans-barres");
    elements.bande.hidden = false;
  }
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

/*
 * Fermer revient au processus principal : `window.close()` fermerait la
 * fenetre sans quitter l'application. Aucune confirmation — rien n'est perdu,
 * les sessions sont deja sur disque et la fiche en cours se reouvre telle
 * quelle.
 */
elements.boutonQuitter.addEventListener("click", async () => {
  await api.quitApp();
});

preRemplisLaFenetre();
// L'habillage passe avant la liste : les lignes de manches lisent ses pictos.
// Il ne bloque pas le demarrage s'il echoue.
appliqueLHabillage()
  .catch(() => {})
  .then(chargeLesChoix)
  .then(rafraichisLaListe)
  .catch((erreur) => {
    bandeau(elements.erreur, `Démarrage impossible : ${messageDe(erreur)}`);
  });
