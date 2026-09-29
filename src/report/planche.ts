/**
 * Planche de manches : toutes les manches d'une session, rangees sur deux
 * colonnes dans un seul document destine a etre photographie.
 *
 * Pourquoi une image plutot que du Markdown : un bloc de manche pese environ
 * 700 caracteres, et treize manches en font 9000 — cinq a six messages
 * Discord, dont la limite est de 2000. L'image n'a pas cette limite, et c'est
 * de toute facon le format d'origine : la session se postait en captures
 * d'ecran prises dans le jeu.
 *
 * Ce module ne photographie rien. Il rend une chaine, comme
 * `construisLeCompteRendu` rend du Markdown, et pour la meme raison : une
 * fonction pure se teste par assertion, sans navigateur. La capture vit dans
 * `src/electron/`.
 *
 * Deux regles tiennent tout le fichier :
 *
 * 1. **Rien a aller chercher.** Pas de police telechargee, pas d'image liee,
 *    pas de script. La fenetre hors ecran n'a pas de reseau garanti, et une
 *    planche doit rendre la meme chose hors ligne. La seule ressource du
 *    document est le motif de `texture.ts`, embarque en `data:` — ce n'est pas
 *    un chargement. Un test refuse toute autre forme.
 * 2. **Tout ce qui vient de stat.ink passe par `echappe`** — sauf ce qui
 *    atterrit dans un attribut `style`, ou echapper ne suffit pas et ou la
 *    valeur est refusee plutot que nettoyee. Voir `couleurSure`.
 *
 * Sur les pseudos : la planche reproduit le tableau de fin de manche que les
 * huit joueurs ont deja vu a l'ecran, adversaires compris. Chaque camp porte
 * le nom de son equipe quand il a ete saisi, « Nous » et « Eux » sinon.
 *
 * Sur l'allure : la carte prend la couleur de sa regle, en deux intensites
 * selon le verdict. Voir `REGLES` dans `regles.ts` et
 * `docs/superpowers/specs/2026-09-22-planche-encre-ii-design.md`.
 */

import { toBattleDetail } from "../battleDetail.ts";
import type { BattleDetail, JoueurDeManche } from "../battleDetail.ts";
import type { SessionFile } from "../store.ts";
import { analyseSession } from "./analyse.ts";
import { enteteEnHtml, Registre, type OptionsEntete } from "./entete.ts";
import { bilanDeSession, rencontre, titreDeSession } from "./format.ts";
import { echappe } from "./html.ts";
import { aucunPicto, type Pictos } from "./pictos.ts";
import type { ObjectifsArme } from "../reglages.ts";
import { jugeLaManche } from "./objectifs.ts";
import { REGLES, regleConnue } from "./regles.ts";
import { OBJECTIFS_PAR_ARME } from "./seuils.ts";
import { MOTIF_SCOTCH } from "./texture.ts";

/**
 * Largeur de rendu, en pixels CSS. La capture ouvre sa fenetre a cette
 * largeur : la changer ici la change partout.
 *
 * 1600 et non 1080 depuis le passage a deux colonnes : une planche d'une seule
 * colonne donnait 1080 x 6947 px pour vingt et une manches, un ruban que
 * Discord reduisait a une vignette illisible. A deux colonnes, la meme session
 * tient en 1600 x 3484 - le rapport tombe de 1:6,4 a 1:2,2.
 */
export const LARGEUR_PLANCHE = 1600;

/**
 * Largeur d'une page de manches, en pixels CSS : une colonne, la largeur d'une
 * colonne de la planche entiere.
 *
 * L'application ne poste plus un ruban mais une serie d'images, parce qu'aucun
 * ecran n'affichait le ruban a la bonne echelle : 1600 x 4835 px pour vingt et
 * une manches, c'etait 3,7 px de texte sur un telephone ajuste a sa largeur, et
 * 314 px de large dans la visionneuse de Discord, qui l'ajuste a la hauteur de
 * l'ecran. Une page de trois manches fait environ 800 x 1150 : la visionneuse
 * la montre presque a taille reelle sur PC, et un telephone la lit d'un seul
 * pincement.
 */
export const LARGEUR_PAGE_MANCHES = 800;

/** Trois cartes : au-dela, la page depasse la hauteur d'un ecran de PC. */
export const MANCHES_PAR_PAGE = 3;

/** Les couleurs de regle, en CSS. Une ligne par intensite, ancrable par le test. */
const COULEURS_DE_REGLE = REGLES.flatMap(([cle, vive, matte]) => [
  `.manche--regle-${cle} { background: ${vive}; }`,
  `.manche--regle-${cle}.manche--mat { background: ${matte}; }`,
]).join("\n");

/**
 * Voile du panneau des equipes.
 *
 * Le fond de page plutot que du noir pur, pour rester dans la palette. Dense a
 * dessein : la couleur de la regle reste a nu sur le bandeau et sur le pourtour
 * de la carte, ce qui suffit a ce que la carte « ait la couleur ». Un voile
 * translucide ferait remonter la teinte sous les huit lignes de joueurs, ou
 * elle ne sert a rien et coute de la lisibilite — a 0,68 la couleur de l'arme
 * tombe a 3,62:1.
 */
const VOILE = "rgba(14, 15, 24, 0.78)";

/**
 * Une couleur d'equipe, rendue inoffensive.
 *
 * `our_team_color` vaut `a0c937ff` — du RGBA hexadecimal, sans diese, alpha
 * compris. Il part dans un attribut `style`, et `echappe` n'y suffirait pas :
 * il laisse passer le point-virgule et les deux-points, de quoi ajouter
 * d'autres declarations. On ne nettoie donc pas la valeur, on la refuse si elle
 * n'est pas exactement six ou huit chiffres hexadecimaux.
 *
 * L'alpha est jete : il vaut `ff` dans toutes les manches observees, et un
 * liseré semi-transparent sur le voile ne voudrait rien dire.
 */
function couleurSure(couleur: string | undefined): string | undefined {
  if (couleur === undefined || !/^[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/.test(couleur)) {
    return undefined;
  }
  return `#${couleur.slice(0, 6)}`;
}

/**
 * Feuille de style, en ligne.
 *
 * Pile de polices choisie pour couvrir le cyrillique, le grec et les symboles
 * que les pseudos Splatoon contiennent regulierement (`к? Reby`, `Ayσmαl`,
 * `☆Gloup☆`) : sans cela, ce sont des tofus. Verifie via `fc-list` : DejaVu
 * Sans porte ces trois-la. Aucune police n'est telechargee. Lato ouvre la
 * pile pour ses graisses Black et Heavy, qui portent les titres ; DejaVu Sans
 * assure la couverture derriere elle.
 *
 * Le japonais (`アヤノコジ`) n'est pas couvert par cette pile : ni Lato, ni
 * DejaVu Sans, ni Liberation Sans ne portent les hiragana ou katakana, et
 * "Noto Sans" en graisse normale - pourtant declaree ci-dessous - n'est meme
 * pas installee sur la machine de developpement (seule "Noto Sans Mono" l'est,
 * verifie via `fc-list`). Quand le japonais s'affiche, c'est le repli
 * generique de fontconfig derriere `sans-serif` qui trouve une police CJK du
 * systeme (IPAGothic, Droid Sans Fallback...). Sur un poste qui n'en a
 * aucune, ces pseudos tombent en tofu, et le depot ne peut rien y garantir
 * sans charger une police - ce qui lui est interdit.
 *
 * Lato, en tete de pile, ne porte pas non plus `★`, `☆` ni `◇` : verifie via
 * `fc-list`, ces trois caracteres sont dans DejaVu Sans mais pas dans Lato.
 * Un pseudo qui les melange a des lettres latines (`☆Gloųp☆`, `ØtS◇Ann`,
 * `S★ Urαηus`) se rend donc a cheval sur deux fontes sur une meme ligne, la
 * ou DejaVu seule les aurait rendus d'un bloc. Ce n'est pas un tofu et ca ne
 * casse rien ; ce n'est pas non plus un bug a corriger en reordonnant la
 * pile - Lato reste en tete parce qu'elle porte les titres.
 *
 * Les polices officielles du jeu ne servent qu'a l'en-tete (voir `entete.ts`),
 * embarquees en `data:` comme la texture : la planche ne charge toujours
 * aucune ressource externe. Les cartes, elles, gardent cette pile.
 *
 * Aucun emoji : leur rendu hors ecran depend d'une police d'emoji installee,
 * ce qui n'est pas acquis. Victoire et defaite passent par l'intensite de la
 * carte et par le mot.
 */
const style = (largeur: number) => `
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  position: relative;
  width: ${largeur}px;
  /*
   * Le bas est plus genereux que le reste : les cartes sont legerement
   * pivotees, et une rotation ne compte pas dans « scrollHeight ». Sans cette
   * marge, le coin bas de la derniere carte sortirait de la capture.
   */
  padding: 28px 28px 42px;
  background: #0e0f18;
  color: #f2f3fa;
  font-family: "Lato", "DejaVu Sans", "Noto Sans", "Liberation Sans", Arial, sans-serif;
  font-size: 15px;
  line-height: 1.35;
}
/*
 * Le motif, declare une fois et repris par les deux selecteurs qui le portent.
 * Chaque reprise choisit sa couleur et son opacite ; le masque, lui, ne pese
 * qu'une fois dans le document — d'ou l'absence de doublon prefixe
 * -webkit-, qui le ferait peser 36 ko de plus pour rien : Chromium accepte la
 * forme sans prefixe depuis sa version 120, et la planche est rendue par
 * Chromium.
 */
body::before, .manche::after {
  content: "";
  position: absolute;
  inset: 0;
  mask-image: url("${MOTIF_SCOTCH}");
  mask-size: 620px;
  mask-repeat: repeat;
  mask-mode: luminance;
}
/* Le fond de page etait plat ; le meme scotch, a peine visible. */
body::before { background: #ffffff; opacity: 0.04; }
/*
 * Les trois couches d'une carte, de bas en haut : la couleur de regle portee
 * par « .manche », le voile du panneau, la texture, puis le texte. Les
 * z-index sont ecrits parce que l'ordre importe et qu'aucun ne se devine :
 * la texture doit couvrir le voile — sinon on ne la voit que dans le bandeau,
 * la ou le voile ne passe pas — mais rester sous le texte.
 *
 * « .manche » porte un clip-path, donc etablit le contexte d'empilement : ces
 * trois valeurs se comparent entre elles et nulle part ailleurs. Et
 * « .manche__equipes » n'a volontairement pas de z-index, faute de quoi il
 * etablirait le sien et enfermerait ses lignes de joueurs sous la texture.
 */
.manche__equipes::before { content: ""; position: absolute; inset: 0; z-index: 0; background: ${VOILE}; }
.manche__medailles::before { content: ""; position: absolute; inset: 0; z-index: 0; background: ${VOILE}; }
.manche__bandeau, .equipe, .manche__medailles span { position: relative; z-index: 2; }
.planche__entete { position: relative; margin-bottom: 22px; padding-left: 6px; }
.planche__entete h1 {
  font-family: "Lato Black", "Lato", "DejaVu Sans", sans-serif;
  font-weight: 900;
  font-style: italic;
  font-size: 40px;
  text-transform: uppercase;
  letter-spacing: -0.01em;
  color: #eaff3d;
}
.planche__entete p {
  margin-top: 2px;
  font-size: 17px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #9aa0bb;
}
.planche__grille { position: relative; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: start; }
.planche__grille--colonne { grid-template-columns: 1fr; }
/* Le titre d'une page de manches : 800 px ne tiennent pas le titre a 40 px. */
.planche__entete--page h1 { font-size: 26px; }
.planche__entete--page p { font-size: 14px; }
/*
 * L'enveloppe porte ce que la carte ne peut pas porter elle-meme : une carte
 * est decoupee au « clip-path », et un « filter » pose sur l'element decoupe
 * verrait son ombre rognee par la decoupe. Ici l'ombre epouse la silhouette.
 */
.carte { filter: drop-shadow(0 5px 9px rgba(0, 0, 0, 0.5)); }
.carte:nth-child(odd) { transform: rotate(-0.5deg); }
.carte:nth-child(even) { transform: rotate(0.5deg); }
/*
 * La silhouette de splashcat : coins biseautes plutot qu'arrondis — plus
 * proche de l'angulaire du jeu — et une encoche au milieu du bord haut. La
 * sienne est un trou en forme de calmar, decoupe au masque SVG ; un
 * « clip-path: polygon() » ne sait pas percer un trou, alors l'encoche mord le
 * bord. Le centre du bandeau est vide de toute facon : le numero est a gauche,
 * le contexte a droite.
 */
.manche {
  position: relative;
  overflow: hidden;
  clip-path: polygon(
    0 14px, 14px 0,
    calc(50% - 46px) 0, calc(50% - 34px) 12px,
    calc(50% + 34px) 12px, calc(50% + 46px) 0,
    calc(100% - 14px) 0, 100% 14px,
    100% calc(100% - 14px), calc(100% - 14px) 100%,
    14px 100%, 0 calc(100% - 14px)
  );
}
/*
 * La texture eclaircit les couleurs vives et assombrit les mates : dans les
 * deux cas elle eloigne le fond du texte au lieu de l'en rapprocher. Une
 * texture sombre sur une couleur vive ferait l'inverse — a 6 % seulement, le
 * rose des Palourdes tombe deja a 4,39:1. Le test mesure les deux etats.
 *
 * Le masque est normalise (voir « texture.ts »), donc l'opacite declaree ici est
 * bien l'opacite maximale du motif : c'est ce que le test lit.
 */
.manche::after { z-index: 1; background: #ffffff; opacity: 0.24; }
.manche--mat::after { background: #000000; opacity: 0.32; }
${COULEURS_DE_REGLE}
.manche__bandeau {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px 16px 10px 12px;
  color: #0e0f18;
}
/*
 * Le texte du bandeau suit l'intensite de la carte, et rien d'autre : sombre
 * sur une couleur vive, clair sur sa matte. C'est une seule paire de regles la
 * ou il fallait auparavant une liste d'exceptions par etat, et c'est ce que le
 * test mesure sur les quatorze fonds.
 */
.manche--mat .manche__bandeau { color: #f2f3fa; text-shadow: 1px 1px 0 rgba(0, 0, 0, 0.45); }
.manche__numero {
  font-family: "Lato Black", "Lato", "DejaVu Sans", sans-serif;
  font-weight: 900;
  font-style: italic;
  font-size: 26px;
  line-height: 1;
  min-width: 34px;
  text-align: center;
}
.manche__resultat {
  font-family: "Lato Black", "Lato", "DejaVu Sans", sans-serif;
  font-weight: 900;
  font-style: italic;
  font-size: 16px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
}
/*
 * Sans opacite, contrairement a l'ancienne planche : sur la plus sombre des
 * couleurs vives, le voile de 0,82 faisait tomber ce texte a 4,15:1. Sa
 * discretion tient desormais a sa taille et a son alignement.
 */
.manche__contexte {
  margin-left: auto;
  font-size: 12px;
  font-weight: 700;
  text-align: right;
}
.manche__equipes {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1fr;
  color: #f2f3fa;
  text-shadow: 1px 1px 0 rgba(0, 0, 0, 0.55);
}
.equipe { padding: 10px 12px; }
.equipe + .equipe { border-left: 1px solid rgba(242, 243, 250, 0.14); }
.equipe__titre {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #e6e8f4;
}
/*
 * La couleur d'encre reelle de l'equipe dans cette manche — our_team_color et
 * their_team_color, presents dans le payload et jusqu'ici inexploites.
 * Aucun texte ne se pose dessus, donc rien a verifier cote contraste : c'est
 * un aplat, et il change a chaque manche.
 */
.equipe__encre { display: block; height: 4px; border-radius: 2px; margin: 5px 0 7px; }
.joueur {
  display: grid;
  grid-template-columns: 1fr auto;
  padding: 4px 7px;
  border-radius: 5px;
}
.joueur + .joueur { margin-top: 2px; }
.joueur--moi { background: #232741; box-shadow: inset 3px 0 0 #eaff3d; }
.joueur__nom { font-weight: 700; }
.joueur__chiffres { color: #e6e8f4; font-variant-numeric: tabular-nums; white-space: nowrap; }
/*
 * Les chiffres d'un joueur, chacun sous son picto. La base des pictos est
 * repetee ici plutot que prise a l'en-tete : une planche sans en-tete a aussi
 * ses pictos. Les tailles sont posees par le contexte, qui l'emporte sur
 * celles de l'en-tete (« .picto--xs »).
 */
.stat { display: inline-flex; align-items: center; gap: 3px; margin-left: 9px; }
/* Pas de raccourci « background » : plus specifique que la classe du picto, il
   en effacerait l'image. */
.stat .picto { display: inline-block; flex: none; background-position: center; background-size: contain; background-repeat: no-repeat; }
.stat--elim .picto, .stat--mort .picto { width: 31px; height: 16px; }
.stat--spe .picto { width: 20px; height: 20px; }
.stat .picto-repli { font-size: 10px; font-weight: 700; color: #b9bdd6; }
.stat__assist { font-size: 10px; color: #b9bdd6; align-self: flex-start; }
.stat--encre { color: #b9bdd6; font-size: 12px; }
/*
 * Mes objectifs d'arme, tenus ou manques. Jaune du jeu contre rose : les deux
 * se distinguent par leur clarte autant que par leur teinte, ce qui tient
 * pour un lecteur qui ne separe pas le rouge du vert. Le trait sous le chiffre
 * manque le redit sans couleur.
 */
.stat--tenu { color: #eaff3d; font-weight: 900; }
.stat--manque { color: #ff7a9c; font-weight: 900; text-decoration: underline 2px; text-underline-offset: 3px; }
/* La borne ajustee d'une manche ecourtee, en retrait du chiffre qu'elle juge. */
.stat__objectif { margin-left: 2px; font-size: 10px; font-weight: 700; color: #e6e8f4; text-decoration: none; display: inline-block; }
.planche__legende {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px 22px;
  margin: 0 0 18px;
  font-size: 13px;
  color: #c9cde0;
}
.legende__entree { display: inline-flex; align-items: center; gap: 7px; }
.legende__entree .stat { margin-left: 0; color: #f2f3fa; font-weight: 700; font-variant-numeric: tabular-nums; }
.joueur__arme { grid-column: 1 / -1; font-size: 11px; color: #e6e8f4; }
/*
 * Les medailles partagent le voile des equipes : posees sur une couleur de
 * regle a nu, leur jaune tomberait a 1,6:1 sur le turquoise.
 */
.manche__medailles {
  position: relative;
  padding: 7px 14px;
  border-top: 1px solid rgba(242, 243, 250, 0.12);
  font-size: 11px;
  font-weight: 700;
  color: #eaff3d;
  text-shadow: 1px 1px 0 rgba(0, 0, 0, 0.55);
}
`.trim();

/** `252` -> `4:12`. */
function duree(secondes: number | undefined): string | undefined {
  if (secondes === undefined) return undefined;
  return `${Math.floor(secondes / 60)}:${String(secondes % 60).padStart(2, "0")}`;
}

/** `22:01`, heure locale — la meme lecture que l'analyse et la fiche de manche. */
function heureDe(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  return new Date(ms).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function scoreDe(detail: BattleDetail): string | undefined {
  if (detail.score === undefined) return undefined;
  const unite = detail.score.unite === "%" ? " %" : "";
  return `${detail.score.nous}-${detail.score.eux}${unite}`;
}

/**
 * Les chiffres d'un joueur, a la maniere du tableau de fin de manche de
 * SplatNet 3 : un picto devant chaque nombre plutot qu'un « é/a/m/sp » a
 * dechiffrer. Eliminations (assistances en exposant), morts, puis speciaux
 * sous le picto de la speciale du joueur. Sans picto, l'abreviation revient a
 * sa place, et la legende de la planche la traduit.
 */
function chiffresEnHtml(
  joueur: JoueurDeManche,
  registre: Registre,
  objectifs: ObjectifsDArme,
  manche: CadreDeJugement,
): string {
  // Mes objectifs seulement, et pour l'arme de cette manche : ceux d'un autre
  // joueur ne sont pas les miens.
  const miens = joueur.moi && joueur.armeCle !== undefined ? objectifs[joueur.armeCle] : undefined;
  const jugement =
    miens === undefined
      ? undefined
      : jugeLaManche(miens, { ...joueur, ...cadreDe(manche) });
  const verdicts = jugement?.verdicts ?? {};
  const marque = (tenu: boolean | undefined) =>
    tenu === undefined ? "" : tenu ? " stat--tenu" : " stat--manque";
  // Sur une manche ecourtee, la borne appliquee suit le chiffre : sans elle,
  // 3 morts en rose sur une manche de 1:52 contredirait « 5 morts max ».
  const borne = (texte: string) =>
    jugement?.ajuste === true ? `<span class="stat__objectif">${texte}</span>` : "";
  const stat = (modificateur: string, picto: string, valeur: string, tenu?: boolean, suite = "") =>
    `<span class="stat stat--${modificateur}${marque(tenu)}">${picto}${valeur}${tenu === undefined ? "" : suite}</span>`;

  return [
    stat(
      "elim",
      registre.picto("stats", "elimination", "é", "xs"),
      `${joueur.kill}<span class="stat__assist">+${joueur.assist}</span>`,
    ),
    stat(
      "mort",
      registre.picto("stats", "mort", "m", "xs"),
      String(joueur.death),
      verdicts.morts,
      borne(`≤${jugement?.bornes.mortsMax}`),
    ),
    stat(
      "spe",
      registre.picto("speciales", joueur.speciale, "sp", "xs"),
      String(joueur.special),
      verdicts.speciaux,
      borne(`≥${jugement?.bornes.speciauxMin}`),
    ),
    stat("encre", "", `${joueur.inked} p.`),
    ...(joueur.deconnecte ? [`<span class="stat">déconnecté</span>`] : []),
  ].join("");
}

/** Ce qu'il faut d'une manche pour y juger mes objectifs : sa duree et sa regle. */
type CadreDeJugement = Pick<BattleDetail, "dureeSecondes" | "ruleKey">;

function cadreDe(manche: CadreDeJugement): { dureeSecondes?: number; regle?: string } {
  return {
    ...(manche.dureeSecondes !== undefined ? { dureeSecondes: manche.dureeSecondes } : {}),
    ...(manche.ruleKey !== undefined ? { regle: manche.ruleKey } : {}),
  };
}

/**
 * Une ligne de joueur : pseudo et chiffres sur la premiere ligne, arme sur la
 * seconde. Les chiffres sont a chasse tabulaire pour que les colonnes
 * s'alignent d'une ligne a l'autre sans tableau.
 */
function joueurEnHtml(
  joueur: JoueurDeManche,
  registre: Registre,
  objectifs: ObjectifsDArme,
  manche: CadreDeJugement,
): string {
  return (
    `<div class="${joueur.moi ? "joueur joueur--moi" : "joueur"}">` +
    `<span class="joueur__nom">${echappe(joueur.nom)}</span>` +
    `<span class="joueur__chiffres">${chiffresEnHtml(joueur, registre, objectifs, manche)}</span>` +
    `<span class="joueur__arme">${echappe(joueur.arme)}</span>` +
    `</div>`
  );
}

/**
 * Une equipe. Ce que disent ses chiffres est dans la legende de la planche,
 * une fois pour toutes, plutot que repete sous chaque titre.
 *
 * Sous le titre, un lisere a la couleur d'encre reelle de l'equipe dans cette
 * manche. Quand stat.ink ne la donne pas — ou la donne mal —, le lisere
 * disparait plutot que de se rabattre sur une couleur inventee.
 */
function equipeEnHtml(
  titre: string,
  joueurs: JoueurDeManche[],
  registre: Registre,
  objectifs: ObjectifsDArme,
  manche: CadreDeJugement,
  encre?: string,
): string {
  const couleur = couleurSure(encre);
  const lisere = couleur === undefined ? "" : `<span class="equipe__encre" style="background:${couleur}"></span>`;

  return (
    `<div class="equipe">` +
    `<p class="equipe__titre">${echappe(titre)}</p>` +
    lisere +
    joueurs.map((joueur) => joueurEnHtml(joueur, registre, objectifs, manche)).join("") +
    `</div>`
  );
}

/**
 * Une carte de manche.
 *
 * « Nous » passe toujours en premier, meme quand on perd : le jeu place
 * l'equipe victorieuse en haut, mais ici la constance de lecture d'une carte a
 * l'autre vaut mieux que la mimique.
 *
 * Le numero a son propre element, hors du contexte : a deux colonnes, c'est
 * lui qui donne le rythme a la grille et permet de retrouver une manche sans
 * compter les cartes.
 */
function mancheEnHtml(
  detail: BattleDetail,
  numero: number,
  registre: Registre,
  camps: { nous: string; eux: string },
  objectifs: ObjectifsDArme,
): string {
  const contexte = [
    heureDe(detail.startedAt),
    detail.rule,
    detail.stage,
    scoreDe(detail),
    detail.ko ? "KO" : undefined,
    duree(detail.dureeSecondes),
  ].filter((part): part is string => part !== undefined);

  const medailles =
    detail.medailles.length === 0
      ? ""
      : `<p class="manche__medailles"><span>${echappe(detail.medailles.join(" · "))}</span></p>`;

  // Une cle inconnue de la table retombe sur « inconnue » : voir `regleConnue`.
  const regle = regleConnue(detail.ruleKey);
  // Le modificateur de resultat reste en tete : deux tests comptent les cartes
  // avec `class="manche manche--`.
  const classes = [
    "manche",
    `manche--${echappe(detail.result ?? "inconnu")}`,
    `manche--regle-${regle}`,
    ...(detail.result === "win" ? [] : ["manche--mat"]),
  ];

  return (
    `<div class="carte">` +
    `<article class="${classes.join(" ")}">` +
    `<div class="manche__bandeau">` +
    `<span class="manche__numero">${numero}</span>` +
    `<span class="manche__resultat">${echappe(detail.resultLabel ?? "—")}</span>` +
    `<span class="manche__contexte">${echappe(contexte.join(" · "))}</span>` +
    `</div>` +
    `<div class="manche__equipes">` +
    equipeEnHtml(camps.nous, detail.nous, registre, objectifs, detail, detail.couleurNous) +
    equipeEnHtml(camps.eux, detail.eux, registre, objectifs, detail, detail.couleurEux) +
    `</div>` +
    medailles +
    `</article>` +
    `</div>`
  );
}

/** Le titre de chaque camp sur les cartes : le nom d'equipe saisi, ou le generique. */
function campsDe(file: SessionFile): { nous: string; eux: string } {
  return { nous: file.nomEquipe ?? "Nous", eux: file.nomEquipeAdverse ?? "Eux" };
}

/**
 * La legende des chiffres de joueur, posee une fois entre l'en-tete et les
 * cartes. Le picto de speciale qu'elle montre est le mien quand je suis dans
 * la session : c'est celui que le lecteur du club connait le mieux sur la
 * planche.
 */
function legendeEnHtml(details: BattleDetail[], registre: Registre, objectifs: ObjectifsDArme): string {
  const joueurs = details.flatMap((detail) => [...detail.nous, ...detail.eux]);
  // L'entree des objectifs ne parait que sur une page ou l'un d'eux est juge :
  // ma ligne, avec une arme a objectifs, dans une manche assez longue.
  const jugementDe = (detail: BattleDetail) => {
    const moi = detail.nous.find((joueur) => joueur.moi);
    const miens = moi?.armeCle === undefined ? undefined : objectifs[moi.armeCle];
    return moi === undefined || miens === undefined
      ? undefined
      : jugeLaManche(miens, { ...moi, ...cadreDe(detail) });
  };
  const jugements = details.map(jugementDe);
  const juges = jugements.some((jugement) => jugement !== undefined);
  const auProrata = jugements.some((jugement) => jugement?.ajuste === true);
  const avecSpeciale = joueurs.filter((joueur) => joueur.speciale !== undefined);
  const speciale = (avecSpeciale.find((joueur) => joueur.moi) ?? avecSpeciale[0])?.speciale;

  const entree = (modificateur: string, exemple: string, texte: string) =>
    `<span class="legende__entree"><span class="stat stat--${modificateur}">${exemple}</span>${echappe(texte)}</span>`;

  return (
    `<p class="planche__legende">` +
    entree(
      "elim",
      `${registre.picto("stats", "elimination", "é", "xs")}5<span class="stat__assist">+2</span>`,
      "éliminations, + assistances",
    ) +
    entree("mort", `${registre.picto("stats", "mort", "m", "xs")}3`, "morts") +
    entree(
      "spe",
      `${registre.picto("speciales", speciale, "sp", "xs")}4`,
      "spéciales déclenchées (picto de la spéciale du joueur)",
    ) +
    entree("encre", "1200 p.", "points d'encrage") +
    (juges
      ? `<span class="legende__entree"><span class="stat stat--tenu">3</span>` +
        `<span class="stat stat--manque">7</span>${echappe("mes objectifs d'arme : tenu, manqué")}</span>`
      : "") +
    (auProrata
      ? `<span class="legende__entree"><span class="stat stat--manque">3<span class="stat__objectif">≤2</span></span>` +
        `${echappe("manche écourtée : objectif au prorata du temps joué")}</span>`
      : "") +
    `</p>`
  );
}

/**
 * Rend la planche d'une session.
 *
 * Deterministe : aucune date de generation, aucun identifiant aleatoire. Deux
 * appels sur le meme fichier rendent deux fois la meme chaine - c'est ce qui
 * rend ce module testable par assertion.
 *
 * `battles` est stocke du plus ancien au plus recent (voir `store.ts`) : le
 * numero de manche est donc son rang, sans tri prealable.
 */
export type OptionsPlanche = {
  /**
   * Pose le compte rendu en tete de planche, dessine (voir `entete.ts`). Sans
   * lui, la planche est exactement celle d'avant l'option.
   */
  entete?: OptionsEntete;
  /**
   * Pictos du jeu, pour l'en-tete et les chiffres des joueurs. Sans eux, l'un
   * et les autres retombent sur le texte.
   */
  pictos?: Pictos;
  /** Mes objectifs par arme ; ceux des reglages par defaut. */
  objectifsParArme?: ObjectifsDArme;
};

/** Mes objectifs, indexes par cle d'arme stat.ink. */
type ObjectifsDArme = Record<string, ObjectifsArme>;

export function construisLaPlanche(file: SessionFile, options: OptionsPlanche = {}): string {
  const objectifs = options.objectifsParArme ?? OBJECTIFS_PAR_ARME;
  const analyse = analyseSession(file, objectifs);
  const titre = titreDeSession(file, analyse);
  const pictos = options.pictos ?? aucunPicto;
  const registre = new Registre(pictos);

  // Cartes et legende d'abord : l'en-tete rend la feuille du registre, qui doit
  // deja connaitre tous les pictos des cartes.
  const details = file.battles.map((battle) => toBattleDetail(battle));
  const camps = campsDe(file);
  const manches = details.map((detail, index) => mancheEnHtml(detail, index + 1, registre, camps, objectifs)).join("\n");
  const legende = legendeEnHtml(details, registre, objectifs);
  const entete =
    options.entete === undefined ? undefined : enteteEnHtml(file, analyse, options.entete, pictos, registre);

  return documentEnHtml({
    titre,
    largeur: LARGEUR_PLANCHE,
    polices: entete !== undefined,
    styles: entete === undefined ? [registre.style()] : [entete.style],
    corps: [
      // Le bandeau de score de l'en-tete porte deja titre et bilan : les deux
      // ensemble afficheraient la session deux fois.
      entete === undefined
        ? [
            '<header class="planche__entete">',
            `<h1>${echappe(titre)}</h1>`,
            `<p>${echappe([rencontre(analyse), ...bilanDeSession(analyse)].filter(Boolean).join(" · "))}</p>`,
            "</header>",
          ].join("\n")
        : entete.html,
      legende,
      '<main class="planche__grille">',
      manches,
      "</main>",
    ],
  });
}

/** Une image de la serie : son nom de fichier sans extension, et sa largeur CSS. */
export type PagePlanche = { nom: string; html: string; largeur: number };

/**
 * Rend la planche en serie de pages, une image chacune : ce que l'application
 * photographie. Voir `LARGEUR_PAGE_MANCHES` pour la raison du decoupage.
 *
 * Avec l'en-tete, une page de synthese l'ouvre, a la largeur de la planche
 * entiere pour laquelle `entete.ts` est dessine. Viennent ensuite les manches,
 * `MANCHES_PAR_PAGE` par page. Chaque page porte le titre et la legende : dans
 * une galerie Discord, elle peut etre vue seule. Chacune a aussi son propre
 * registre de pictos, pour n'embarquer que ceux qu'elle montre.
 *
 * Les noms commencent par un rang a deux chiffres : l'explorateur les range
 * dans l'ordre, et le nettoyage des pages perimees (`plancheHandler.ts`) les
 * reconnait a ce motif.
 */
export function construisLesPages(file: SessionFile, options: OptionsPlanche = {}): PagePlanche[] {
  const objectifs = options.objectifsParArme ?? OBJECTIFS_PAR_ARME;
  const analyse = analyseSession(file, objectifs);
  const titre = titreDeSession(file, analyse);
  const pictos = options.pictos ?? aucunPicto;
  const details = file.battles.map((battle) => toBattleDetail(battle));
  const pages: PagePlanche[] = [];

  if (options.entete !== undefined) {
    const entete = enteteEnHtml(file, analyse, options.entete, pictos, new Registre(pictos));
    pages.push({
      nom: "00-synthese",
      largeur: LARGEUR_PLANCHE,
      html: documentEnHtml({ titre, largeur: LARGEUR_PLANCHE, polices: true, styles: [entete.style], corps: [entete.html] }),
    });
  }

  // Au moins une page, meme vide : une fabrication qui ne rendrait aucune
  // image n'aurait rien a copier ni a montrer.
  const nombre = Math.max(1, Math.ceil(details.length / MANCHES_PAR_PAGE));
  for (let rang = 0; rang < nombre; rang++) {
    const debut = rang * MANCHES_PAR_PAGE;
    const lot = details.slice(debut, debut + MANCHES_PAR_PAGE);
    const registre = new Registre(pictos);
    const manches = lot
      .map((detail, index) => mancheEnHtml(detail, debut + index + 1, registre, campsDe(file), objectifs))
      .join("\n");
    const legende = legendeEnHtml(lot, registre, objectifs);
    const premiere = debut + 1;
    const derniere = debut + lot.length;
    const portee =
      lot.length === 0
        ? "Aucune manche"
        : `${premiere === derniere ? `Manche ${premiere}` : `Manches ${premiere} à ${derniere}`} sur ${details.length}`;

    pages.push({
      nom: `${String(rang + 1).padStart(2, "0")}-manches-${premiere}-${Math.max(premiere, derniere)}`,
      largeur: LARGEUR_PAGE_MANCHES,
      html: documentEnHtml({
        titre,
        largeur: LARGEUR_PAGE_MANCHES,
        polices: false,
        styles: [registre.style()],
        corps: [
          '<header class="planche__entete planche__entete--page">',
          `<h1>${echappe(titre)}</h1>`,
          `<p>${echappe([rencontre(analyse), portee].filter(Boolean).join(" · "))}</p>`,
          "</header>",
          legende,
          '<main class="planche__grille planche__grille--colonne">',
          manches,
          "</main>",
        ],
      }),
    });
  }

  return pages;
}

/**
 * Le document autour d'un corps : la feuille commune a la largeur voulue, les
 * feuilles propres a la page, et la CSP.
 */
function documentEnHtml(page: {
  titre: string;
  largeur: number;
  /** L'en-tete embarque les polices du jeu : la CSP doit alors les admettre. */
  polices: boolean;
  styles: string[];
  corps: string[];
}): string {
  return [
    "<!doctype html>",
    '<html lang="fr">',
    "<head>",
    '<meta charset="utf-8">',
    // Porte la garantie « aucune ressource externe » sur le document
    // lui-meme, pas seulement sur le generateur qui l'a rendu : la CLI ecrit
    // ce fichier pour que l'utilisateur l'ouvre dans son propre navigateur,
    // qui ne connait pas cette regle sans la CSP.
    // L'en-tete embarque les polices du jeu en `data:` : sans `font-src`, la
    // CSP les refuserait et l'en-tete retomberait en silence sur Lato.
    page.polices
      ? '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:; font-src data:">'
      : '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:">',
    `<title>${echappe(page.titre)}</title>`,
    `<style>\n${style(page.largeur)}\n</style>`,
    ...page.styles.filter((feuille) => feuille !== "").map((feuille) => `<style>\n${feuille}\n</style>`),
    "</head>",
    "<body>",
    ...page.corps,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}
