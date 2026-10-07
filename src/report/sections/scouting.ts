/**
 * Scouting adverse : a quoi on faisait face.
 *
 * Les adversaires sont designes par leur pseudo, leur arme a cote - voir
 * `designe` dans format.ts. Le nom de leur equipe, s'il a ete saisi, coiffe la
 * section, sous un bilan des deux camps.
 */

/** Une ligne du bilan des camps. */
const ligneDeBilan = (camp: string, totaux: TotauxDEquipe) => [
  camp,
  String(totaux.kill),
  String(totaux.assist),
  String(totaux.death),
  String(totaux.special),
  ratio(totaux.kill + totaux.assist, totaux.death),
];

import { reguliers, totauxDEquipe } from "../analyse.ts";
import type { AnalyseSession, TotauxDEquipe } from "../analyse.ts";
import { armeDominante, designeLesAdversaires, pluriel, ratio, tableau } from "../format.ts";

export function sectionScouting(analyse: AnalyseSession): string[] {
  if (analyse.adverse.length === 0) return [];

  // Une soiree ou l'equipe d'en face tourne produirait sinon un tableau d'une
  // douzaine de lignes dont la plupart pesent une manche. On tabule ceux qui
  // etaient la, et on mentionne les autres d'une ligne.
  // L'analyse classe aux eliminations seules ; ici un joueur d'appui qui
  // assiste beaucoup pese autant qu'un tueur, d'ou le reclassement.
  const adverse = [...reguliers(analyse.adverse, analyse.manches.length)].sort(
    (a, b) => b.kill + b.assist - (a.kill + a.assist) || b.kill - a.kill,
  );
  const passages = analyse.adverse.length - adverse.length;
  if (adverse.length === 0) return [];

  const titre = analyse.nomEquipeAdverse === undefined ? "En face" : `En face : ${analyse.nomEquipeAdverse}`;
  const lignes: string[] = [`### ⚔️ ${titre}`, ""];

  // L'equipe d'en face dans son ensemble, la notre a cote pour comparer.
  lignes.push(
    ...tableau(
      ["Équipe", "Élim.", "Assist.", "Morts", "Spé", "(K+A)/D"],
      [
        ligneDeBilan(analyse.nomEquipe ?? "Nous", totauxDEquipe(analyse.equipe)),
        ligneDeBilan(analyse.nomEquipeAdverse ?? "En face", totauxDEquipe(analyse.adverse)),
      ],
    ),
    "",
  );

  const noms = designeLesAdversaires(adverse);

  // Dans le tableau, l'arme n'est nommee qu'en francais : la forme bilingue
  // doublerait la largeur du bloc et le ferait defiler sur telephone. Les
  // phrases qui suivent, elles, portent les deux noms.
  lignes.push(
    ...tableau(
      ["Joueur", "Arme", "Élim.", "Assist.", "Morts", "Spé", "(K+A)/D", "Armes"],
      adverse.map((joueur, index) => [
        noms[index] ?? joueur.nom,
        joueur.armes[0]?.nom ?? "—",
        String(joueur.kill),
        String(joueur.assist),
        String(joueur.death),
        String(joueur.special),
        ratio(joueur.kill + joueur.assist, joueur.death),
        String(joueur.armes.length),
      ]),
    ),
    "",
    // Le tableau abrege pour tenir sur un telephone ; la legende rend ce qu'il
    // abrege. Le ratio est celui de l'entete, assistances comprises.
    "Élim. : éliminations · Assist. : assistances · Spé : spéciales déclenchées · " +
      "(K+A)/D : éliminations et assistances par mort · Armes : nombre d'armes jouées",
    "",
  );

  const faits: string[] = [];

  const menace = adverse[0];
  if (menace !== undefined && menace.kill + menace.assist > 0) {
    faits.push(
      // Un point median, pas de parentheses : le nom d'arme en porte deja.
      `**Menace principale : ${noms[0]}** · ${armeDominante(menace)} · ` +
        `${menace.kill} ${pluriel(menace.kill, "élimination")}, ` +
        `${menace.assist} ${pluriel(menace.assist, "assistance")} ` +
        `pour ${menace.death} ${pluriel(menace.death, "mort")}.`,
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
