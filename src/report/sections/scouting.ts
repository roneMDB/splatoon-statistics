/**
 * Scouting adverse : a quoi on faisait face.
 *
 * Les adversaires sont designes par leur arme, jamais par leur pseudo - voir
 * `designe` dans format.ts pour la raison. La section reste donc lisible par
 * les interesses eux-memes, ce qui est le cas de figure normal en intra.
 */

import { reguliers } from "../analyse.ts";
import type { AnalyseSession } from "../analyse.ts";
import { designeLesAdversaires, pluriel, ratio, tableau } from "../format.ts";

export function sectionScouting(analyse: AnalyseSession): string[] {
  if (analyse.adverse.length === 0) return [];

  // Une soiree ou l'equipe d'en face tourne produirait sinon un tableau d'une
  // douzaine de lignes dont la plupart pesent une manche. On tabule ceux qui
  // etaient la, et on mentionne les autres d'une ligne.
  const adverse = reguliers(analyse.adverse, analyse.manches.length);
  const passages = analyse.adverse.length - adverse.length;
  if (adverse.length === 0) return [];

  const lignes: string[] = ["### ⚔️ En face", ""];
  const noms = designeLesAdversaires(adverse);

  // Dans le tableau, l'arme n'est nommee qu'en francais : la forme bilingue
  // doublerait la largeur du bloc et le ferait defiler sur telephone. Les
  // phrases qui suivent, elles, portent les deux noms.
  lignes.push(
    ...tableau(
      ["Arme", "Élim.", "Morts", "Spé", "K/D", "Armes"],
      adverse.map((joueur) => [
        joueur.armes[0]?.nom ?? "—",
        String(joueur.kill),
        String(joueur.death),
        String(joueur.special),
        ratio(joueur.kill, joueur.death),
        String(joueur.armes.length),
      ]),
    ),
    "",
  );

  const faits: string[] = [];

  const menace = adverse[0];
  if (menace !== undefined && menace.kill > 0) {
    faits.push(
      `⚠️ **Menace principale : ${noms[0]}**, ${menace.kill} éliminations ` +
        `pour ${menace.death} morts.`,
    );
  }

  // Un joueur qui n'a jamais change d'arme sait exactement ce qu'il fait ;
  // c'est une information de preparation, pas un jugement.
  const monoArme = adverse.filter(
    (joueur) => joueur.armes.length === 1 && joueur.manches === analyse.manches.length,
  );
  if (monoArme.length > 0 && analyse.manches.length > 1) {
    const cites = monoArme.map((joueur) => noms[adverse.indexOf(joueur)]).join(", ");
    faits.push(
      `🎯 ${cites} : une seule arme sur toute la session. ` +
        `Un pick qui ne bouge pas se prépare à l'avance.`,
    );
  }

  const versatile = [...adverse].sort((a, b) => b.armes.length - a.armes.length)[0];
  if (versatile !== undefined && versatile.armes.length > 2) {
    // Nom francais seul en tete : la forme bilingue, suivie d'une enumeration
    // de sept armes, donne une phrase que personne ne lit jusqu'au bout.
    faits.push(
      `🔄 ${versatile.armes[0]?.nom} a tourné sur ${versatile.armes.length} armes : ` +
        versatile.armes.map((arme) => `${arme.nom} ×${arme.manches}`).join(", ") +
        `. Le tableau retient la plus jouée.`,
    );
  }

  if (passages > 0) {
    faits.push(
      `👥 ${passages} autre${passages > 1 ? "s" : ""} ` +
        `${pluriel(passages, "joueur")} ${pluriel(passages, "est passé", "sont passés")} ` +
        `en face sur moins de la moitié des manches, non ${pluriel(passages, "retenu")} ici.`,
    );
  }

  lignes.push(...faits.flatMap((fait) => [fait, ""]));
  return lignes;
}
