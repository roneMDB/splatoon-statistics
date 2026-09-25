/** Ce que la planche et son en-tete partagent pour ecrire du HTML sans risque. */

/**
 * Echappe ce qui part dans le document.
 *
 * Seul endroit du fichier ou du texte exterieur touche le HTML : tout ce qui
 * vient de stat.ink - pseudo, arme, carte, medaille - passe par ici.
 *
 * Cinq caracteres, pas quatre : le gabarit n'ouvre ses attributs qu'avec des
 * guillemets doubles, donc l'apostrophe droite ne casserait rien aujourd'hui
 * - mais c'est une fonction d'echappement generale, pas une specialisee pour
 * ce seul gabarit, et elle doit rester correcte si un attribut change un
 * jour de guillemet.
 */
export function echappe(texte: string): string {
  return texte
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
