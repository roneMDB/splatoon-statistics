/** La couleur de chaque regle, partagee par les cartes de manche et l'en-tete. */

/**
 * Couleurs de carte, par regle.
 *
 * C'est le procede de splashcat.ink — la carte entiere prend une couleur, un
 * voile sombre porte le contenu — avec une donnee differente. splashcat colore
 * par lobby ; ici ca ne donnerait rien : sur les sessions reelles, le lobby est
 * constant d'un bout a l'autre (`private` sur les treize manches du 11/09,
 * `bankara_open` sur les vingt et une du 13/09), donc une planche monochrome.
 * La regle, elle, tourne a chaque manche.
 *
 * Deux intensites par regle : la **vive** pour une victoire, la **matte** pour
 * tout le reste. C'est le verdict, rendu par l'intensite plutot que par une
 * seconde couleur qui se battrait avec la premiere.
 *
 * La matte vaut la vive composee a 35 % sur le fond de page `#0e0f18`, mais
 * elle est ecrite ici plutot que calculee : `filter: brightness()` produirait
 * une couleur que la feuille ne nomme jamais, donc que le test de contraste ne
 * pourrait ni lire ni verifier — or c'est exactement ce que ce test existe pour
 * empecher.
 *
 * Regle qui en decoule, sans exception : **vive -> texte sombre, matte ->
 * texte clair**. Les contrastes vont de 4,89:1 (Palourdes vive) a 11,32:1, tous
 * mesures par `tests/report/planche.test.ts`, qui lit cette table dans la
 * feuille rendue plutot que de la recopier.
 *
 * Les vives viennent de la palette de splashcat (`battle.regular`, `ranked`,
 * `xmatch`, `league`, `orange`), a un ecart pres : son violet `#a64cf2` tombe a
 * 4,49:1, un centieme sous le seuil, et a ete eclairci.
 */
export const REGLES: ReadonlyArray<readonly [cle: string, vive: string, matte: string]> = [
  ["nawabari", "#19d719", "#125518"], // Guerre de Territoire
  ["area", "#f54910", "#5f2315"], // Defense de Zone
  ["yagura", "#b05df5", "#472a65"], // Expedition Risquee
  ["hoko", "#0fdb9b", "#0e5646"], // Mission Bazookarpe
  ["asari", "#f02d7d", "#5d1a3b"], // Pluie de Palourdes
  ["tricolor", "#ff9750", "#623f2c"], // Guerre de Territoire tricolore
  ["inconnue", "#9aa0bb", "#3f4251"], // regle absente du payload, ou inconnue
];

/**
 * Une cle de regle connue de la table, ou « inconnue ». C'est ce qui garantit
 * qu'aucune valeur venue de stat.ink n'atteint un attribut de classe.
 */
export function regleConnue(cle: string | undefined): string {
  return REGLES.some(([connue]) => connue === cle) ? (cle as string) : "inconnue";
}
