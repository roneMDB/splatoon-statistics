/**
 * Scouting adverse : a quoi on faisait face.
 *
 * Les adversaires sont designes par leur pseudo, leur arme a cote - voir
 * `designe` dans format.ts. Le nom de leur equipe, s'il a ete saisi, coiffe la
 * section.
 */

import { reguliers } from "../analyse.ts";
import type { AnalyseSession } from "../analyse.ts";
import { armeDominante, designeLesAdversaires, pluriel, ratio, tableau } from "../format.ts";

export function sectionScouting(analyse: AnalyseSession): string[] {
  if (analyse.adverse.length === 0) return [];

  // Une soiree ou l'equipe d'en face tourne produirait sinon un tableau d'une
  // douzaine de lignes dont la plupart pesent une manche. On tabule ceux qui
  // etaient la, et on mentionne les autres d'une ligne.
  const adverse = reguliers(analyse.adverse, analyse.manches.length);
  const passages = analyse.adverse.length - adverse.length;
  if (adverse.length === 0) return [];

  const titre = analyse.nomEquipeAdverse === undefined ? "En face" : `En face : ${analyse.nomEquipeAdverse}`;
  const lignes: string[] = [`### ⚔️ ${titre}`, ""];
  const noms = designeLesAdversaires(adverse);

  // Dans le tableau, l'arme n'est nommee qu'en francais : la forme bilingue
  // doublerait la largeur du bloc et le ferait defiler sur telephone. Les
  // phrases qui suivent, elles, portent les deux noms.
  lignes.push(
    ...tableau(
      ["Joueur", "Arme", "Élim.", "Morts", "Spé", "K/D", "Armes"],
      adverse.map((joueur, index) => [
        noms[index] ?? joueur.nom,
        joueur.armes[0]?.nom ?? "—",
        String(joueur.kill),
        String(joueur.death),
        String(joueur.special),
        ratio(joueur.kill, joueur.death),
        String(joueur.armes.length),
      ]),
    ),
    "",
    // Le tableau abrege pour tenir sur un telephone ; la legende rend ce qu'il
    // abrege. « K/D » surtout, qui ne compte pas les assistances.
    "Élim. : éliminations · Spé : spéciales déclenchées · " +
      "K/D : éliminations par mort, sans les assistances · Armes : nombre d'armes jouées",
    "",
  );

  const faits: string[] = [];

  const menace = adverse[0];
  if (menace !== undefined && menace.kill > 0) {
    faits.push(
      // Un point median, pas de parentheses : le nom d'arme en porte deja.
      `**Menace principale : ${noms[0]}** · ${armeDominante(menace)} · ${menace.kill} éliminations ` +
        `pour ${menace.death} morts.`,
    );
  }

  // Un joueur qui n'a jamais change d'arme sait exactement ce qu'il fait ;
  // c'est une information de preparation, pas un jugement.
  const monoArme = adverse.filter(
    (joueur) => joueur.armes.length === 1 && joueur.manches === analyse.manches.length,
  );
  if (monoArme.length > 0 && analyse.manches.length > 1) {
    const cites = monoArme
      .map((joueur) => `${noms[adverse.indexOf(joueur)]} · ${armeDominante(joueur)}`)
      .join(" ; ");
    faits.push(
      `Une seule arme sur toute la session : ${cites}. ` +
        `Un pick qui ne bouge pas se prépare à l'avance.`,
    );
  }

  const versatile = [...adverse].sort((a, b) => b.armes.length - a.armes.length)[0];
  if (versatile !== undefined && versatile.armes.length > 2) {
    // Noms francais seuls : la forme bilingue, sur une enumeration de sept
    // armes, donne une phrase que personne ne lit jusqu'au bout.
    faits.push(
      `${noms[adverse.indexOf(versatile)]} a tourné sur ${versatile.armes.length} armes : ` +
        versatile.armes.map((arme) => `${arme.nom} ×${arme.manches}`).join(", ") +
        `. Le tableau retient la plus jouée.`,
    );
  }

  if (passages > 0) {
    faits.push(
      `${passages} autre${passages > 1 ? "s" : ""} ` +
        `${pluriel(passages, "joueur")} ${pluriel(passages, "est passé", "sont passés")} ` +
        `en face sur moins de la moitié des manches, non ${pluriel(passages, "retenu")} ici.`,
    );
  }

  lignes.push(...faits.flatMap((fait) => [fait, ""]));
  return lignes;
}
