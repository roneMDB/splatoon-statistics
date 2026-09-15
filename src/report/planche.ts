/**
 * Planche de manches : toutes les manches d'une session, empilees en un seul
 * document destine a etre photographie.
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
 * 1. **Aucune ressource externe.** Pas de police telechargee, pas d'image
 *    liee, pas de script. La fenetre hors ecran n'a pas de reseau garanti, et
 *    une planche doit rendre la meme chose hors ligne. Un test l'interdit.
 * 2. **Tout ce qui vient de stat.ink passe par `echappe`.** Les pseudos sont
 *    saisis par des joueurs ; sans cela, une simple esperluette casserait le
 *    document.
 *
 * Sur les pseudos des adversaires : `format.ts` pose la regle inverse pour le
 * compte rendu — un adversaire y est designe par son arme, jamais par son
 * pseudo. La planche fait exception, deliberement. Elle ne juge pas : elle
 * reproduit le tableau de fin de manche que les huit joueurs ont deja vu a
 * l'ecran. Voir la section B du document de conception.
 */

import { toBattleDetail } from "../battleDetail.ts";
import type { BattleDetail, JoueurDeManche } from "../battleDetail.ts";
import type { SessionFile } from "../store.ts";
import { analyseSession } from "./analyse.ts";
import { bilanDeSession, titreDeSession } from "./format.ts";

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
 * Feuille de style, en ligne.
 *
 * Pile de polices choisie pour couvrir le cyrillique, le grec et les symboles
 * que les pseudos Splatoon contiennent regulierement (`к? Reby`, `Ayσmαl`,
 * `☆Gloup☆`) : sans cela, ce sont des tofus. Aucune n'est telechargee.
 *
 * Aucun emoji : leur rendu hors ecran depend d'une police d'emoji installee,
 * ce qui n'est pas acquis. Victoire et defaite passent par la couleur du
 * bandeau et par le mot.
 *
 * La ligne "moi" est ciblee par la classe `joueur--moi`, comme `manche--win`
 * et `manche--lose` juste en dessous.
 */
const STYLE = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  width: ${LARGEUR_PLANCHE}px;
  padding: 28px;
  background: #171922;
  color: #eceef5;
  font-family: "DejaVu Sans", "Noto Sans", "Liberation Sans", Arial, sans-serif;
  font-size: 15px;
  line-height: 1.35;
}
.planche__entete { margin-bottom: 20px; }
.planche__entete h1 { font-size: 26px; letter-spacing: -0.01em; }
.planche__entete p { margin-top: 4px; color: #9aa0bb; font-size: 15px; }
.planche__grille { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: start; }
.manche {
  border-radius: 10px;
  overflow: hidden;
  background: #222534;
}
.manche__bandeau {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 16px;
  padding: 9px 16px;
  background: #4a4d63;
}
.manche--win .manche__bandeau { background: #2c7a44; }
.manche--lose .manche__bandeau { background: #9c3566; }
.manche__resultat {
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  white-space: nowrap;
}
.manche__contexte { font-size: 13px; color: #f0f1f7; text-align: right; }
.manche__equipes { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: #171922; }
.equipe { padding: 12px 14px; background: #222534; }
.equipe__titre {
  margin-bottom: 8px;
  color: #9aa0bb;
  font-size: 11px;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}
.joueur {
  display: grid;
  grid-template-columns: 1fr auto;
  padding: 5px 8px;
  border-radius: 6px;
}
.joueur + .joueur { margin-top: 2px; }
.joueur--moi { background: #39405f; }
.joueur__nom { font-weight: 600; }
.joueur__chiffres { color: #cfd3e6; font-variant-numeric: tabular-nums; white-space: nowrap; }
.joueur__arme { grid-column: 1 / -1; color: #8f95b0; font-size: 12px; }
.manche__medailles {
  padding: 9px 16px;
  border-top: 1px solid #171922;
  color: #d8c78c;
  font-size: 12px;
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
 */
function equipeEnHtml(titre: string, joueurs: JoueurDeManche[]): string {
  return (
    `<div class="equipe">` +
    `<p class="equipe__titre">${echappe(titre)} — é/a/m/sp</p>` +
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
 */
function mancheEnHtml(detail: BattleDetail, numero: number): string {
  const contexte = [
    `#${numero}`,
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
      : `<p class="manche__medailles">${echappe(detail.medailles.join(" · "))}</p>`;

  return (
    `<article class="manche manche--${echappe(detail.result ?? "inconnu")}">` +
    `<div class="manche__bandeau">` +
    `<span class="manche__resultat">${echappe(detail.resultLabel ?? "—")}</span>` +
    `<span class="manche__contexte">${echappe(contexte.join(" · "))}</span>` +
    `</div>` +
    `<div class="manche__equipes">` +
    equipeEnHtml("Nous", detail.nous) +
    equipeEnHtml("Eux", detail.eux) +
    `</div>` +
    medailles +
    `</article>`
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
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'">',
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
