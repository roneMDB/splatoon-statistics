/**
 * Tableau de match : la session racontee comme une rencontre entre deux
 * equipes, sans point de vue.
 *
 * L'en-tete (`entete.ts`) est mon bulletin : mon objectif, mon ressenti, mes
 * chiffres, mes medailles, des victoires et des defaites vues de mon camp. En
 * intra, en scrim ou en compet, la session est aussi un match entre deux
 * equipes du club ou d'ailleurs, et c'est cette image-la qu'on poste pour tout
 * le monde : les deux camps a egalite, chacun sous son nom et sa couleur, et
 * personne de souligne.
 *
 * Concretement, rien ici ne lit `moi`, `objectifs`, `medailles` ni `ressenti`.
 * Le camp A est le mien, parce que stat.ink ne connait que « nous » et « eux »,
 * mais il n'a pas d'autre privilege que d'etre ecrit a gauche.
 *
 * Memes regles que l'en-tete, dont il reprend le vocabulaire visuel (stickers,
 * etiquettes, pictos) : tout texte passe par `echappe`, toute cle stat.ink qui
 * atteint une classe passe par `cleSure` ou `regleConnue`.
 */

import type { AnalyseSession, Manche, StatsJoueur } from "./analyse.ts";
import { reguliers, totauxDEquipe } from "./analyse.ts";
import { Registre, polices, STYLE_FIXE, sticker, TEXTE, TITRE, type Entete } from "./entete.ts";
import { designeLesAdversaires, pluriel, ratio, titreDeSession } from "./format.ts";
import { echappe } from "./html.ts";
import type { Pictos } from "./pictos.ts";
import { REGLES, regleConnue } from "./regles.ts";
import { libelleDuLobby } from "../libelles.fr.ts";
import type { SessionFile } from "../store.ts";

/**
 * Couleur de chaque camp, la meme d'un bout a l'autre du tableau.
 *
 * Pas le vert et le rose de victoire et defaite de l'en-tete : ici, une couleur
 * designe une equipe, pas un verdict. Le jaune du jeu et un cyan, distincts par
 * la teinte comme par la clarte, tous deux au-dessus de 4,5:1 sur le panneau
 * `#1d2036` et sur le fond `#0e0f18` (mesure par le test).
 */
export const COULEUR_CAMP_A = "#eaff3d";
export const COULEUR_CAMP_B = "#47d7ff";

/** Les deux camps : le nom saisi, sinon un generique qui ne dit pas « nous ». */
function campsDe(analyse: AnalyseSession): { a: string; b: string } {
  return { a: analyse.nomEquipe ?? "Équipe A", b: analyse.nomEquipeAdverse ?? "Équipe B" };
}

/** Le camp gagnant d'une manche, vu de stat.ink : `win` est une victoire du camp A. */
function gagnant(manche: Manche): "a" | "b" | undefined {
  if (manche.resultat === "win") return "a";
  if (manche.resultat === "lose") return "b";
  return undefined;
}

const COULEURS_DE_CASE = REGLES.map(([cle, vive]) => `.duel__case--regle-${cle} { background: ${vive}; }`).join("\n");

/**
 * Feuille propre au tableau, posee apres celle de l'en-tete.
 *
 * Une case gagnee prend la couleur vive de sa regle, texte sombre - la paire
 * deja mesuree pour les tuiles et les cartes. Une case perdue reste sur le
 * fond, texte clair : le gagnant de chaque manche se lit sans legende.
 */
const STYLE_TABLEAU = `
.camp-a { color: ${COULEUR_CAMP_A}; }
.camp-b { color: ${COULEUR_CAMP_B}; }
.etiquette--camp-b { background: ${COULEUR_CAMP_B}; }

.duel-score__entete { display: flex; align-items: center; gap: 20px; }
.duel-score__face { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 36px; margin-top: 18px; }
.duel-score__nom { font-family: ${TITRE}; font-size: 46px; line-height: 1.05; overflow-wrap: anywhere; }
.duel-score__nom--a { text-align: right; }
.duel-score__chiffres { font-family: ${TITRE}; font-size: 104px; line-height: 1; white-space: nowrap; }
.duel-score__pied { display: flex; flex-direction: column; align-items: center; gap: 12px; margin-top: 14px; }
.duel-score__verdict { font-family: ${TITRE}; font-size: 26px; line-height: 1; padding: 6px 16px 5px; color: #0e0f18; text-transform: uppercase; clip-path: polygon(0 6px, 6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%); }
.duel-score__verdict--a { background: ${COULEUR_CAMP_A}; }
.duel-score__verdict--b { background: ${COULEUR_CAMP_B}; }
.duel-score__verdict--egalite { background: #b9bdd6; }
.duel-score__puces { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 22px; list-style: none; font-size: 15px; }
.duel-score__puces b { font-family: ${TITRE}; font-weight: 400; font-size: 22px; margin-right: 4px; }

.duel { display: grid; gap: 6px; align-items: stretch; }
.duel__tete { display: flex; flex-direction: column; align-items: center; gap: 2px; padding-bottom: 2px; }
.duel__numero { font-family: ${TITRE}; font-size: 13px; color: #b9bdd6; }
.duel__camp { display: flex; align-items: center; padding-right: 10px; font-family: ${TITRE}; font-size: 20px; line-height: 1.05; overflow-wrap: anywhere; }
.duel__case {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 52px;
  background: #0e0f18;
  color: #b9bdd6;
  font-family: ${TITRE};
  font-size: 22px;
  clip-path: polygon(0 6px, 6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%);
}
.duel__case--gagnee { color: #0e0f18; }
.duel__unite { font-size: 12px; margin-left: 1px; }
.duel__ko { position: absolute; top: 2px; right: 4px; font-size: 10px; }
${COULEURS_DE_CASE}

.repartition { display: flex; height: 10px; margin-top: 5px; background: #0e0f18; }
.repartition__a { display: block; height: 100%; background: ${COULEUR_CAMP_A}; }
.repartition__b { display: block; height: 100%; background: ${COULEUR_CAMP_B}; }

.effectif { display: flex; flex-direction: column; gap: 8px; list-style: none; }
.effectif__ligne { display: grid; grid-template-columns: 46px minmax(0, 1fr) repeat(5, 64px); align-items: center; gap: 10px; }
.effectif__entetes { font-size: 12px; font-weight: 700; text-transform: uppercase; color: #b9bdd6; }
.effectif__entetes span { text-align: center; }
.membre { padding: 6px 10px; background: #0e0f18; clip-path: polygon(0 8px, 8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%); }
.membre__nom { display: block; font-weight: 700; font-size: 16px; line-height: 1.2; overflow-wrap: anywhere; }
.membre__arme { display: block; font-size: 13px; }
.membre__chiffre { font-family: ${TITRE}; font-size: 20px; text-align: center; white-space: nowrap; }
.membre__assist { font-family: ${TEXTE}; font-size: 12px; color: #b9bdd6; }
.membre__passage { margin-top: 10px; font-size: 13px; }

.mentions { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.mention { display: flex; align-items: center; gap: 12px; padding: 12px 14px; background: #0e0f18; clip-path: polygon(0 8px, 8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%); }
.mention__libelle { display: block; font-size: 13px; font-weight: 700; text-transform: uppercase; color: #b9bdd6; }
.mention__valeur { display: block; font-family: ${TITRE}; font-size: 30px; line-height: 1.05; color: #f2f3fa; }
.mention__qui { display: block; font-weight: 700; font-size: 15px; overflow-wrap: anywhere; }
`.trim();

/** Bandeau : titre, puis les deux noms de part et d'autre du score en manches. */
function blocScore(file: SessionFile, analyse: AnalyseSession, camps: { a: string; b: string }, registre: Registre): string {
  const { victoires, defaites, nuls, total } = analyse.bilan;
  const premiere = analyse.manches[0];
  const derniere = analyse.manches[analyse.manches.length - 1];

  const sous = [
    analyse.lobby === undefined ? undefined : libelleDuLobby(analyse.lobby),
    premiere === undefined ? undefined : `${premiere.heure} → ${derniere?.heure ?? "—"}`,
  ].filter((part): part is string => part !== undefined);

  const verdict =
    victoires > defaites
      ? `<p class="duel-score__verdict duel-score__verdict--a">Victoire ${echappe(camps.a)}</p>`
      : victoires < defaites
        ? `<p class="duel-score__verdict duel-score__verdict--b">Victoire ${echappe(camps.b)}</p>`
        : `<p class="duel-score__verdict duel-score__verdict--egalite">Égalité</p>`;

  // KO infliges par le camp A = KO subis par le camp B, et inversement.
  const puces = [
    `<li><b>${total}</b>${pluriel(total, "manche")}</li>`,
    ...(analyse.tempsDeJeuMinutes > 0 ? [`<li><b>${analyse.tempsDeJeuMinutes}</b>min de jeu</li>`] : []),
    ...(nuls > 0 ? [`<li><b>${nuls}</b>${pluriel(nuls, "nul")}</li>`] : []),
    ...(analyse.koInfliges > 0
      ? [`<li><b class="camp-a">${analyse.koInfliges}</b>KO ${pluriel(analyse.koInfliges, "infligé")} par ${echappe(camps.a)}</li>`]
      : []),
    ...(analyse.koSubis > 0
      ? [`<li><b class="camp-b">${analyse.koSubis}</b>KO ${pluriel(analyse.koSubis, "infligé")} par ${echappe(camps.b)}</li>`]
      : []),
  ];

  return sticker(
    `<div class="duel-score__entete">` +
      registre.picto("lobbies", analyse.lobby, "", "l") +
      `<div><h1 class="score__titre">${echappe(titreDeSession(file, analyse))}</h1>` +
      `<p class="score__sous secondaire">${echappe(sous.join(" · "))}</p></div>` +
      `</div>` +
      `<div class="duel-score__face">` +
      `<p class="duel-score__nom duel-score__nom--a camp-a">${echappe(camps.a)}</p>` +
      `<p class="duel-score__chiffres"><span class="camp-a">${victoires}</span>` +
      `<span class="score__tiret">–</span><span class="camp-b">${defaites}</span></p>` +
      `<p class="duel-score__nom camp-b">${echappe(camps.b)}</p>` +
      `</div>` +
      `<div class="duel-score__pied">${verdict}<ul class="duel-score__puces secondaire">${puces.join("")}</ul></div>`,
    { plein: true, classe: "bloc-score" },
  );
}

/** Le score d'un camp dans une case : entier, l'unite en petit. */
function scoreDeCase(manche: Manche, camp: "a" | "b"): string {
  if (manche.score === undefined) return "—";
  const valeur = Math.round(camp === "a" ? manche.score.nous : manche.score.eux);
  return manche.score.unite === "%" ? `${valeur}<span class="duel__unite">%</span>` : String(valeur);
}

/**
 * Manche par manche, une ligne par camp : la case du gagnant s'allume a la
 * couleur de la regle, celle du perdant reste eteinte. Le KO est marque chez
 * celui qui l'a inflige.
 */
function blocDuel(analyse: AnalyseSession, camps: { a: string; b: string }, registre: Registre): string {
  if (analyse.manches.length === 0) return "";

  const tetes = analyse.manches.map(
    (manche) =>
      `<span class="duel__tete"><span class="duel__numero">${manche.numero}</span>` +
      registre.picto("regles", manche.regle, "", "s") +
      `</span>`,
  );
  const ligne = (camp: "a" | "b") =>
    `<span class="duel__camp camp-${camp}">${echappe(camps[camp])}</span>` +
    analyse.manches
      .map((manche) => {
        const gagnee = gagnant(manche) === camp;
        const classes = [
          "duel__case",
          ...(gagnee ? ["duel__case--gagnee", `duel__case--regle-${regleConnue(manche.regle)}`] : []),
        ];
        return (
          `<span class="${classes.join(" ")}">${scoreDeCase(manche, camp)}` +
          (gagnee && manche.ko ? `<span class="duel__ko">KO</span>` : "") +
          `</span>`
        );
      })
      .join("");

  // Le nombre de colonnes est un entier compte ici : rien de stat.ink
  // n'atteint l'attribut `style`.
  const colonnes = `grid-template-columns: 210px repeat(${analyse.manches.length}, minmax(0, 1fr))`;

  return sticker(
    `<div class="duel" style="${colonnes}"><span></span>${tetes.join("")}${ligne("a")}${ligne("b")}</div>`,
    { etiquette: "Manche par manche", plein: true },
  );
}

/** Repartition des manches gagnees entre les deux camps, en barre bicolore. */
function repartition(a: number, b: number): string {
  const total = a + b;
  if (total === 0) return `<span class="repartition"></span>`;
  const partA = Math.round((a / total) * 100);
  return (
    `<span class="repartition"><span class="repartition__a" style="width:${partA}%"></span>` +
    `<span class="repartition__b" style="width:${100 - partA}%"></span></span>`
  );
}

/** Modes et stages, en manches gagnees par chaque camp. */
function blocModes(analyse: AnalyseSession, registre: Registre): string {
  if (analyse.parMode.length === 0) return "";

  const modes = analyse.parMode.map(
    (mode) =>
      `<li class="mode">` +
      registre.picto("regles", mode.cle, "", "m") +
      `<span><span class="mode__libelle">${echappe(mode.libelle)}</span>${repartition(mode.victoires, mode.defaites)}</span>` +
      `<span class="mode__vd"><span class="camp-a">${mode.victoires}</span> – <span class="camp-b">${mode.defaites}</span></span>` +
      `</li>`,
  );

  const stages = analyse.parStage.map((stage) => {
    const vignette = registre.declare("stages", stage.cle);
    return (
      `<li class="stage">` +
      (vignette === undefined
        ? ""
        : `<span class="stage__image ${vignette}" role="img" aria-label="${echappe(stage.libelle)}"></span>`) +
      `<span class="stage__legende"><span>${echappe(stage.libelle)}</span>` +
      `<span class="stage__vd"><span class="camp-a">${stage.victoires}</span>–<span class="camp-b">${stage.defaites}</span></span></span>` +
      `</li>`
    );
  });

  return sticker(`<ul class="modes">${modes.join("")}</ul><ul class="stages">${stages.join("")}</ul>`, {
    etiquette: "Modes et stages",
  });
}

/** Les pseudos d'un camp, homonymes departages. Personne n'y est « moi ». */
function noms(joueurs: StatsJoueur[]): string[] {
  return designeLesAdversaires(joueurs.map((joueur) => ({ ...joueur, moi: false })));
}

/**
 * Un camp : son bilan, puis ses reguliers, une ligne chacun avec son arme
 * dominante. Les joueurs de passage comptent dans le bilan et sont nommes sous
 * la liste, sans chiffres : sur deux manches, ils ne se comparent a personne.
 */
function blocCamp(joueurs: StatsJoueur[], manches: number, nom: string, camp: "a" | "b", registre: Registre): string {
  if (joueurs.length === 0) return "";
  const presents = reguliers(joueurs, manches);
  const passage = joueurs.filter((joueur) => !presents.includes(joueur));
  const pseudos = noms(presents);

  const totaux = totauxDEquipe(joueurs);
  const bilan =
    `<p class="equipe__bilan secondaire">` +
    `<b>${totaux.kill}</b> élim. · <b>${totaux.assist}</b> assist. · <b>${totaux.death}</b> morts · ` +
    `<b>${totaux.special}</b> spé. · (É+A)/M <b>${ratio(totaux.kill + totaux.assist, totaux.death)}</b>` +
    `</p>`;

  const entetes =
    `<li class="effectif__ligne effectif__entetes"><span></span><span></span>` +
    `<span>Élim.</span><span>Morts</span><span>Spé.</span><span>(É+A)/M</span><span>Encre</span></li>`;

  const lignes = presents.map((joueur, index) => {
    const arme = joueur.armes[0];
    return (
      `<li class="effectif__ligne membre">` +
      (arme === undefined ? "<span></span>" : registre.picto("armes", arme.cle, "", "m")) +
      `<span><span class="membre__nom">${echappe(pseudos[index] ?? joueur.nom)}</span>` +
      (arme === undefined ? "" : `<span class="membre__arme secondaire">${echappe(arme.nom)}</span>`) +
      `</span>` +
      `<span class="membre__chiffre">${joueur.kill}<span class="membre__assist">+${joueur.assist}</span></span>` +
      `<span class="membre__chiffre">${joueur.death}</span>` +
      `<span class="membre__chiffre">${joueur.special}</span>` +
      `<span class="membre__chiffre">${ratio(joueur.kill + joueur.assist, joueur.death)}</span>` +
      `<span class="membre__chiffre">${(joueur.inked / 1000).toFixed(1).replace(".", ",")}k</span>` +
      `</li>`
    );
  });

  const dePassage =
    passage.length === 0
      ? ""
      : `<p class="membre__passage secondaire">De passage : ${echappe(noms(passage).join(", "))}</p>`;

  return (
    `<div class="sticker sticker--camp-${camp}"><div class="sticker__corps">` +
    `<p class="etiquette etiquette--camp-${camp}">${echappe(nom)}</p>` +
    bilan +
    `<ul class="effectif">${entetes}${lignes.join("")}</ul>` +
    dePassage +
    `</div></div>`
  );
}

/** Un joueur et son camp, pour les mentions. */
type JoueurDuMatch = { joueur: StatsJoueur; nom: string; camp: "a" | "b" };

/**
 * Les meilleurs du match, tous camps confondus, parmi les reguliers. Une
 * egalite nomme tous les ex aequo : choisir l'un d'eux serait arbitraire.
 */
function blocMentions(analyse: AnalyseSession, camps: { a: string; b: string }, registre: Registre): string {
  const manches = analyse.manches.length;
  const deCamp = (joueurs: StatsJoueur[], camp: "a" | "b"): JoueurDuMatch[] => {
    const presents = reguliers(joueurs, manches);
    const pseudos = noms(presents);
    return presents.map((joueur, index) => ({ joueur, nom: pseudos[index] ?? joueur.nom, camp }));
  };
  const tous = [...deCamp(analyse.equipe, "a"), ...deCamp(analyse.adverse, "b")];
  if (tous.length === 0) return "";

  const criteres: [libelle: string, valeur: (joueur: StatsJoueur) => number, affiche: (n: number) => string][] = [
    ["Éliminations", (j) => j.kill, String],
    ["Spéciaux", (j) => j.special, String],
    // Sans mort, le rendement est infini, et passe devant tout le monde.
    ["(É+A)/M", (j) => (j.death === 0 ? Infinity : (j.kill + j.assist) / j.death), (n) => (n === Infinity ? "∞" : ratio(n, 1))],
    ["Encrage", (j) => j.inked, (n) => `${n} p.`],
  ];

  const tuiles = criteres.map(([libelle, valeur, affiche]) => {
    const meilleure = Math.max(...tous.map(({ joueur }) => valeur(joueur)));
    const premiers = tous.filter(({ joueur }) => valeur(joueur) === meilleure);
    const arme = premiers.length === 1 ? premiers[0]!.joueur.armes[0] : undefined;
    return (
      `<div class="mention">` +
      (arme === undefined ? "" : registre.picto("armes", arme.cle, "", "m")) +
      `<span><span class="mention__libelle">${echappe(libelle)}</span>` +
      `<span class="mention__valeur">${echappe(affiche(meilleure))}</span>` +
      premiers
        .map(({ nom, camp }) => `<span class="mention__qui camp-${camp}">${echappe(nom)} <span class="secondaire">· ${echappe(camps[camp])}</span></span>`)
        .join("") +
      `</span></div>`
    );
  });

  return sticker(`<div class="mentions">${tuiles.join("")}</div>`, { etiquette: "Mentions" });
}

/**
 * Rend le tableau de match d'une session.
 *
 * Deterministe, comme l'en-tete : meme session, memes pictos, meme chaine.
 * L'ordre des blocs est fixe - score, manche par manche, les deux camps cote a
 * cote, puis modes et mentions cote a cote.
 */
export function tableauDeMatchEnHtml(
  file: SessionFile,
  analyse: AnalyseSession,
  pictos: Pictos,
  registre: Registre = new Registre(pictos),
): Entete {
  const camps = campsDe(analyse);
  const manches = analyse.manches.length;

  const blocs = [
    blocScore(file, analyse, camps, registre),
    blocDuel(analyse, camps, registre),
    blocCamp(analyse.equipe, manches, camps.a, "a", registre),
    blocCamp(analyse.adverse, manches, camps.b, "b", registre),
    blocModes(analyse, registre),
    blocMentions(analyse, camps, registre),
  ].filter((bloc) => bloc !== "");

  return {
    html: `<section class="entete">\n${blocs.join("\n")}\n</section>`,
    style: [polices(pictos), STYLE_FIXE, STYLE_TABLEAU, registre.style()].filter((partie) => partie !== "").join("\n"),
  };
}
