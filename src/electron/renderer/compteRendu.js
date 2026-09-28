/**
 * Bas de la fiche : le compte rendu a coller dans Discord, et la planche de
 * manches.
 */

import { api, bandeau, cacheLesBandeaux, elements, messageDe } from "./elements.js";
import { etat } from "./etat.js";
import { equipesSaisies } from "./fiche.js";
import { construisLeRendu } from "./markdown.js";

/**
 * Bascule entre l'apercu rendu et le Markdown source.
 * @param {"apercu" | "markdown"} nom
 */
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
  return [...elements.compteRenduSections.querySelectorAll("input")]
    .filter((case_) => case_.checked)
    .map((case_) => case_.value);
}

/** Remet le compte rendu a zero : rien a copier tant que rien n'est genere. */
export function cacheLeCompteRendu() {
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
export function cacheLaPlanche() {
  elements.plancheResultat.hidden = true;
  elements.plancheResultat.textContent = "";
  elements.boutonPlancheOuvrir.hidden = true;
  etat.cheminPlancheCourante = undefined;
}

elements.boutonGenerer.addEventListener("click", async () => {
  if (etat.ficheCourante === undefined) return;
  cacheLesBandeaux();

  const sections = sectionsChoisies();
  if (sections.length === 0) {
    bandeau(elements.avertissement, "Cochez au moins une section.");
    return;
  }

  elements.boutonGenerer.disabled = true;
  try {
    const texte = await api.buildReport({
      path: etat.ficheCourante.path,
      sections,
      // La saisie en cours prime sur ce qui est enregistre : on peut relire un
      // compte rendu avant de decider de garder l'objectif qu'on vient d'ecrire.
      objectif: elements.ficheObjectif.value.trim(),
      ressenti: elements.ficheRessenti.value.trim(),
      ...equipesSaisies(),
    });
    elements.compteRenduTexte.value = texte;
    elements.compteRenduApercu.replaceChildren(construisLeRendu(texte));
    elements.compteRenduOnglets.hidden = false;
    montreLOnglet("apercu");
    elements.boutonCopier.disabled = false;
  } catch (erreur) {
    cacheLeCompteRendu();
    bandeau(elements.erreur, messageDe(erreur));
  } finally {
    elements.boutonGenerer.disabled = false;
  }
});

elements.boutonCopier.addEventListener("click", async () => {
  cacheLesBandeaux();
  elements.boutonCopier.disabled = true;
  try {
    await api.copyToClipboard(elements.compteRenduTexte.value);
    bandeau(elements.succes, "Compte rendu copié — prêt à coller dans Discord.");
  } catch (erreur) {
    bandeau(elements.erreur, messageDe(erreur));
  } finally {
    elements.boutonCopier.disabled = false;
  }
});

elements.boutonPlanche.addEventListener("click", async () => {
  if (etat.ficheCourante === undefined) return;
  cacheLesBandeaux();

  elements.boutonPlanche.disabled = true;
  cacheLaPlanche();
  try {
    // Memes reglages que « Generer » : les sections cochees, et la saisie en
    // cours de l'objectif, du ressenti et des equipes plutot que ce qui est
    // enregistre.
    const planche = await api.buildPlanche({
      path: etat.ficheCourante.path,
      // Les noms d'equipe titrent les cartes : ils valent avec ou sans en-tete.
      ...equipesSaisies(),
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
    const nombre = planche.images.length;
    const ko = Math.round(planche.images.reduce((total, image) => total + image.octets, 0) / 1024);
    // Sous WSL, le chemin Linux ne se colle pas dans l'explorateur Windows :
    // on affiche l'equivalent Windows quand l'application l'a fourni, le
    // chemin Linux sinon.
    const dossierAffiche = planche.dossierWindows ?? planche.dossier;
    const lignes = [`${dossierAffiche} · ${nombre} ${nombre > 1 ? "images" : "image"} · ${ko} Ko`];
    // "Copier" met le Markdown dans le presse-papier ; la planche l'y
    // remplace par sa premiere image. Le dire evite de perdre un compte rendu
    // qu'on vient de copier sans s'en apercevoir.
    const glisser =
      nombre > 1
        ? `glissez les ${nombre} images du dossier dans Discord (10 au plus par message).`
        : "glissez le fichier dans Discord.";
    lignes.push(
      planche.pressePapier === "copie"
        ? `A remplacé le presse-papier par la première image. Pour la série complète, ${glisser}`
        : `Presse-papier indisponible : ${glisser}`,
    );
    if (planche.avertissement !== undefined) lignes.push(planche.avertissement);
    elements.plancheResultat.textContent = lignes.join("\n");
    elements.plancheResultat.hidden = false;
    etat.cheminPlancheCourante = planche.images[0]?.chemin;
    elements.boutonPlancheOuvrir.hidden = etat.cheminPlancheCourante === undefined;
  } catch (erreur) {
    bandeau(elements.erreur, messageDe(erreur));
  } finally {
    elements.boutonPlanche.disabled = false;
  }
});

elements.boutonPlancheOuvrir.addEventListener("click", async () => {
  if (etat.cheminPlancheCourante === undefined) return;
  cacheLesBandeaux();

  elements.boutonPlancheOuvrir.disabled = true;
  try {
    const issue = await api.revealPlanche(etat.cheminPlancheCourante);
    if (issue === "copie") {
      bandeau(
        elements.succes,
        "Explorateur indisponible : le chemin a été copié dans le presse-papier.",
      );
    }
  } catch (erreur) {
    bandeau(elements.erreur, messageDe(erreur));
  } finally {
    elements.boutonPlancheOuvrir.disabled = false;
  }
});

elements.boutonDossierPlanches.addEventListener("click", async () => {
  cacheLesBandeaux();

  elements.boutonDossierPlanches.disabled = true;
  try {
    const issue = await api.openPlancheDir();
    if (issue === "copie") {
      bandeau(
        elements.succes,
        "Explorateur indisponible : le chemin du dossier a été copié dans le presse-papier.",
      );
    }
  } catch (erreur) {
    bandeau(elements.erreur, messageDe(erreur));
  } finally {
    elements.boutonDossierPlanches.disabled = false;
  }
});
