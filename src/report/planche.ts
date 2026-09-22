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
 * Sur les pseudos des adversaires : `format.ts` pose la regle inverse pour le
 * compte rendu — un adversaire y est designe par son arme, jamais par son
 * pseudo. La planche fait exception, deliberement. Elle ne juge pas : elle
 * reproduit le tableau de fin de manche que les huit joueurs ont deja vu a
 * l'ecran. Voir la section B de
 * `docs/superpowers/specs/2026-09-15-planche-de-manches-design.md`.
 *
 * Sur l'allure : la carte prend la couleur de sa regle, en deux intensites
 * selon le verdict. Voir `REGLES` plus bas et
 * `docs/superpowers/specs/2026-09-22-planche-encre-ii-design.md`.
 */

import { toBattleDetail } from "../battleDetail.ts";
import type { BattleDetail, JoueurDeManche } from "../battleDetail.ts";
import type { SessionFile } from "../store.ts";
import { analyseSession } from "./analyse.ts";
import { bilanDeSession, titreDeSession } from "./format.ts";
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
function echappe(texte: string): string {
  return texte
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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
const REGLES: ReadonlyArray<readonly [cle: string, vive: string, matte: string]> = [
  ["nawabari", "#19d719", "#125518"], // Guerre de Territoire
  ["area", "#f54910", "#5f2315"], // Defense de Zone
  ["yagura", "#b05df5", "#472a65"], // Expedition Risquee
  ["hoko", "#0fdb9b", "#0e5646"], // Mission Bazookarpe
  ["asari", "#f02d7d", "#5d1a3b"], // Pluie de Palourdes
  ["tricolor", "#ff9750", "#623f2c"], // Guerre de Territoire tricolore
  ["inconnue", "#9aa0bb", "#3f4251"], // regle absente du payload, ou inconnue
];

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
 * Les polices officielles du jeu sont hors d'atteinte : la planche ne charge
 * aucune ressource externe, et cette regle ne se negocie pas pour un effet de
 * style. L'allure vient donc de la couleur et de la typographie disponible.
 *
 * Aucun emoji : leur rendu hors ecran depend d'une police d'emoji installee,
 * ce qui n'est pas acquis. Victoire et defaite passent par l'intensite de la
 * carte et par le mot.
 */
const STYLE = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  position: relative;
  width: ${LARGEUR_PLANCHE}px;
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
 * Une ligne de joueur : pseudo et chiffres sur la premiere ligne, arme sur la
 * seconde. Les chiffres sont a chasse tabulaire pour que les colonnes
 * s'alignent d'une ligne a l'autre sans tableau.
 */
function joueurEnHtml(joueur: JoueurDeManche): string {
  const chiffres = [`${joueur.inked} p.`, `${joueur.kill}/${joueur.assist}/${joueur.death}/${joueur.special}`];
  if (joueur.deconnecte) chiffres.push("déconnecté");

  return (
    `<div class="${joueur.moi ? "joueur joueur--moi" : "joueur"}">` +
    `<span class="joueur__nom">${echappe(joueur.nom)}</span>` +
    `<span class="joueur__chiffres">${echappe(chiffres.join(" · "))}</span>` +
    `<span class="joueur__arme">${echappe(joueur.arme)}</span>` +
    `</div>`
  );
}

/**
 * Une equipe. Le rappel « é/a/m/sp » est dans le titre plutot que sur chaque
 * ligne : sans lui, quatre nombres colles ne veulent rien dire ; sur chaque
 * ligne, il noierait les chiffres.
 *
 * Sous le titre, un lisere a la couleur d'encre reelle de l'equipe dans cette
 * manche. Quand stat.ink ne la donne pas — ou la donne mal —, le lisere
 * disparait plutot que de se rabattre sur une couleur inventee.
 */
function equipeEnHtml(titre: string, joueurs: JoueurDeManche[], encre?: string): string {
  const couleur = couleurSure(encre);
  const lisere = couleur === undefined ? "" : `<span class="equipe__encre" style="background:${couleur}"></span>`;

  return (
    `<div class="equipe">` +
    `<p class="equipe__titre">${echappe(titre)} — é/a/m/sp</p>` +
    lisere +
    joueurs.map(joueurEnHtml).join("") +
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
function mancheEnHtml(detail: BattleDetail, numero: number): string {
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

  // Une cle inconnue de la table retombe sur « inconnue » : c'est ce qui
  // garantit qu'aucune valeur venue de stat.ink n'atteint l'attribut de classe.
  const regle = REGLES.some(([cle]) => cle === detail.ruleKey) ? detail.ruleKey : "inconnue";
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
    equipeEnHtml("Nous", detail.nous, detail.couleurNous) +
    equipeEnHtml("Eux", detail.eux, detail.couleurEux) +
    `</div>` +
    medailles +
    `</article>` +
    `</div>`
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
export function construisLaPlanche(file: SessionFile): string {
  const analyse = analyseSession(file);
  const titre = titreDeSession(file, analyse);

  const manches = file.battles
    .map((battle, index) => mancheEnHtml(toBattleDetail(battle), index + 1))
    .join("\n");

  return [
    "<!doctype html>",
    '<html lang="fr">',
    "<head>",
    '<meta charset="utf-8">',
    // Porte la garantie « aucune ressource externe » sur le document
    // lui-meme, pas seulement sur le generateur qui l'a rendu : la CLI ecrit
    // ce fichier pour que l'utilisateur l'ouvre dans son propre navigateur,
    // qui ne connait pas cette regle sans la CSP.
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:">',
    `<title>${echappe(titre)}</title>`,
    `<style>\n${STYLE}\n</style>`,
    "</head>",
    "<body>",
    '<header class="planche__entete">',
    `<h1>${echappe(titre)}</h1>`,
    `<p>${echappe(bilanDeSession(analyse).join(" · "))}</p>`,
    "</header>",
    '<main class="planche__grille">',
    manches,
    "</main>",
    "</body>",
    "</html>",
    "",
  ].join("\n");
}
