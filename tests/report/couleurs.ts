/** Mesures de couleur partagees par les tests de la planche et de son en-tete. */

/**
 * Luminance relative d'un `#rrggbb`, formule de WCAG 2.1.
 *
 * Vit dans les tests et nulle part ailleurs : la planche n'a aucun besoin de
 * ce calcul a l'execution, ce sont les tests seuls qui verifient que les
 * couleurs choisies dans les feuilles de style tiennent.
 */
export const luminance = (couleur: string): number => {
  const canaux = [1, 3, 5].map((i) => Number.parseInt(couleur.slice(i, i + 2), 16) / 255);
  const [r, v, b] = canaux.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * v! + 0.0722 * b!;
};

/** Rapport de contraste WCAG entre deux couleurs opaques, de 1:1 a 21:1. */
export const contraste = (avant: string, arriere: string): number => {
  const [clair, sombre] = [luminance(avant), luminance(arriere)].sort((x, y) => y - x);
  return (clair! + 0.05) / (sombre! + 0.05);
};

/**
 * Compose une couleur semi-transparente sur son fond : un texte a `opacity`
 * ne contraste pas comme sa couleur nominale, et c'est le resultat du melange
 * que l'oeil compare au fond.
 */
export const melange = (avant: string, arriere: string, opacite: number): string => {
  const octet = (couleur: string, i: number) => Number.parseInt(couleur.slice(i, i + 2), 16);
  const canal = (i: number) =>
    Math.round(octet(avant, i) * opacite + octet(arriere, i) * (1 - opacite))
      .toString(16)
      .padStart(2, "0");
  return `#${canal(1)}${canal(3)}${canal(5)}`;
};

/**
 * Decoupe un `rgba(r, g, b, a)` en la couleur opaque et l'alpha que `melange`
 * attend. Le voile du panneau des equipes est semi-transparent : c'est sa
 * composition sur la couleur de regle que l'oeil compare au texte.
 */
export const voileDe = (valeur: string): { teinte: string; alpha: number } => {
  const nombres = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(valeur);
  if (nombres === null) return { teinte: "", alpha: 0 };
  const octet = (i: number) => Number(nombres[i]).toString(16).padStart(2, "0");
  return { teinte: `#${octet(1)}${octet(2)}${octet(3)}`, alpha: Number(nombres[4]) };
};

/**
 * La derniere valeur de `propriete` declaree par le bloc qui ouvre sur
 * `selecteur`. Le selecteur est ancre en debut de ligne : sans cela,
 * `.manche__contexte {` trouverait d'abord `.manche--inconnu .manche__contexte {`,
 * qui se termine par la meme chaine et ne declare pas les memes proprietes.
 */
export const declaration = (html: string, selecteur: string, propriete: string): string => {
  const bloc = html.split(`\n${selecteur}`)[1]?.split("}")[0] ?? "";
  const valeurs = [...bloc.matchAll(new RegExp(`${propriete}:\\s*([^;]+);`, "g"))];
  return valeurs.at(-1)?.[1]?.trim() ?? "";
};
