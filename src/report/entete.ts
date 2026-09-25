/**
 * En-tete de planche : le compte rendu de la session, dessine a la maniere du
 * jeu plutot que redige.
 *
 * Le compte rendu Markdown raconte ; cet en-tete montre. Il part des memes
 * chiffres (`analyseSession`) et des memes sections, mais n'en reprend aucune
 * phrase : un score en gros, une rangee de tuiles pour la courbe, des pictos
 * d'armes et de modes, des stickers. Les « faits » restent au Markdown, qui
 * est poste juste a cote.
 *
 * Les pictos sont ceux du jeu (voir `pictos.ts`). Chacun n'est declare qu'une
 * fois, en classe CSS, et repris par autant d'elements qu'il le faut : le
 * picto d'une regle sert a chaque tuile de la courbe, une URI `data:` par
 * tuile ferait peser le document pour rien. Un picto absent n'empeche rien :
 * son libelle prend sa place.
 *
 * Memes regles que `planche.ts` : tout texte passe par `echappe`, toute cle
 * stat.ink qui atteint une classe passe par `cleSure` ou `regleConnue`.
 */

import type { AnalyseSession, ArmeJouee, StatsJoueur } from "./analyse.ts";
import { reguliers } from "./analyse.ts";
import { moyenne, pluriel, ratio, titreDeSession } from "./format.ts";
import { echappe } from "./html.ts";
import type { SectionCompteRendu } from "./index.ts";
import { cleSure, type CategoriePicto, type Pictos } from "./pictos.ts";
import { REGLES, regleConnue } from "./regles.ts";
import { libelleDuLobby } from "../libelles.fr.ts";
import type { SessionFile } from "../store.ts";
import { MEDAILLES_CITEES } from "./seuils.ts";

export type OptionsEntete = {
  /** Les blocs a dessiner : les memes cases que pour le compte rendu. */
  sections: readonly SectionCompteRendu[];
  /** Prend le pas sur l'objectif enregistre dans la session. */
  objectif?: string;
  /** Prend le pas sur le ressenti enregistre dans la session. */
  ressenti?: string;
};

/** Le HTML de l'en-tete, et la feuille qui lui est propre. */
export type Entete = { html: string; style: string };

/** Tailles de picto : une classe chacune, jamais une valeur en attribut. */
type Taille = "xs" | "s" | "m" | "l" | "xl";

/**
 * Registre des pictos utilises par un en-tete.
 *
 * Rend l'element d'un picto et retient son URI, pour ne la declarer qu'une
 * fois dans la feuille. Une cle refusee par `cleSure`, ou un picto introuvable,
 * rend le libelle a la place - ou rien si le libelle est vide.
 */
class Registre {
  private readonly declares = new Map<string, string>();

  constructor(private readonly pictos: Pictos) {}

  /** Retient un picto et rend la classe qui le porte, ou `undefined` s'il manque. */
  declare(categorie: CategoriePicto, cle: string | undefined): string | undefined {
    const uri = cleSure(cle) ? this.pictos(categorie, cle) : undefined;
    if (uri === undefined) return undefined;

    const classe = `picto--${categorie}-${cle}`;
    this.declares.set(classe, uri);
    return classe;
  }

  picto(categorie: CategoriePicto, cle: string | undefined, libelle: string, taille: Taille): string {
    const classe = this.declare(categorie, cle);
    if (classe === undefined) {
      return libelle === ""
        ? ""
        : `<span class="picto-repli picto-repli--${taille}">${echappe(libelle)}</span>`;
    }
    return `<span class="picto picto--${taille} ${classe}" role="img" aria-label="${echappe(libelle)}"></span>`;
  }

  /** Une regle par picto utilise. Les URI sont des `data:` : rien n'est charge. */
  style(): string {
    return [...this.declares]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([classe, uri]) => `.${classe} { background-image: url("${uri}"); }`)
      .join("\n");
  }
}

/** Polices du jeu, si `npm run pictos` les a recuperees. */
function polices(pictos: Pictos): string {
  const familles: [famille: string, cle: string][] = [
    ["Splatoon Titre", "titre"],
    ["Splatoon Texte", "texte"],
  ];
  return familles
    .flatMap(([famille, cle]) => {
      const uri = pictos("polices", cle);
      return uri === undefined
        ? []
        : [`@font-face { font-family: "${famille}"; src: url("${uri}") format("woff2"); font-display: block; }`];
    })
    .join("\n");
}

/*
 * Deux piles, qui retombent sur celles de la planche : sans les polices du
 * jeu, l'en-tete garde l'allure des cartes. Les deux polices du jeu portent
 * tous les accents du francais (verifie sur leur table `cmap`).
 */
const TITRE = `"Splatoon Titre", "Lato Black", "Lato", "DejaVu Sans", sans-serif`;
const TEXTE = `"Splatoon Texte", "Lato", "DejaVu Sans", "Noto Sans", sans-serif`;

/** Bornes du nombre de colonnes de la courbe ; au-dela, les tuiles passent a la ligne. */
const TUILES_MIN = 12;
const TUILES_MAX = 22;

/** Couleurs de tuile par regle, depuis la meme table que les cartes. */
const COULEURS_DE_TUILE = REGLES.flatMap(([cle, vive, matte]) => [
  `.tuile--regle-${cle} { background: ${vive}; }`,
  `.tuile--regle-${cle}.tuile--mat { background: ${matte}; }`,
  `.barre--regle-${cle} { background: ${vive}; }`,
]).join("\n");

/**
 * Feuille de l'en-tete.
 *
 * Un sticker, c'est deux elements pour la meme raison que la carte de manche :
 * le corps est decoupe au `clip-path`, et un contour pose sur lui serait rogne
 * aux biseaux. L'enveloppe porte donc le contour blanc - quatre ombres nettes
 * qui epousent la silhouette - et l'ombre portee.
 *
 * Contrastes, tous au-dessus de 4,5:1 et mesures par `tests/report/entete.test.ts` :
 * texte `#f2f3fa` et `#b9bdd6` sur le panneau `#1d2036`, victoires `#eaff3d`,
 * defaites `#ff6fa1`, texte sombre `#0e0f18` sur le jaune et sur le blanc. Les
 * tuiles suivent la regle des cartes : sombre sur vive, clair sur matte.
 */
const STYLE_FIXE = `
.entete { position: relative; display: grid; grid-template-columns: 1fr 1fr; gap: 22px 24px; margin-bottom: 30px; }
.entete .plein { grid-column: 1 / -1; }
.sticker {
  filter:
    drop-shadow(3px 0 0 #f2f3fa) drop-shadow(-3px 0 0 #f2f3fa)
    drop-shadow(0 3px 0 #f2f3fa) drop-shadow(0 -3px 0 #f2f3fa)
    drop-shadow(0 7px 10px rgba(0, 0, 0, 0.55));
}
.entete > .sticker:nth-child(odd) { transform: rotate(-0.4deg); }
.entete > .sticker:nth-child(even) { transform: rotate(0.4deg); }
.sticker__corps {
  position: relative;
  height: 100%;
  padding: 18px 22px 20px;
  background: #1d2036;
  color: #f2f3fa;
  font-family: ${TEXTE};
  clip-path: polygon(0 14px, 14px 0, calc(100% - 14px) 0, 100% 14px, 100% calc(100% - 14px), calc(100% - 14px) 100%, 14px 100%, 0 calc(100% - 14px));
}
.etiquette {
  display: inline-block;
  margin-bottom: 14px;
  padding: 3px 14px 2px;
  background: #eaff3d;
  color: #0e0f18;
  font-family: ${TITRE};
  font-size: 20px;
  text-transform: uppercase;
  transform: skewX(-10deg);
}
.secondaire { color: #b9bdd6; }
.picto { display: inline-block; flex: none; background: center / contain no-repeat; }
.picto--xs { width: 22px; height: 22px; }
.picto--s { width: 34px; height: 34px; }
.picto--m { width: 46px; height: 46px; }
.picto--l { width: 72px; height: 72px; }
.picto--xl { width: 96px; height: 96px; }
.picto-repli { font-weight: 700; font-size: 12px; color: #b9bdd6; }
/* Les sous-armes et speciales sont des glyphes noirs : une pastille claire les porte. */
.pastille { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 50%; background: #f2f3fa; }
.pastille .picto-repli { color: #0e0f18; font-size: 9px; }

.score { display: flex; align-items: center; gap: 24px; }
.score__titres { flex: 1; min-width: 0; }
.score__titre { font-family: ${TITRE}; font-weight: 400; font-size: 42px; line-height: 1.05; color: #eaff3d; }
.score__sous { margin-top: 6px; font-size: 18px; }
.score__chiffres { font-family: ${TITRE}; font-size: 88px; line-height: 1; white-space: nowrap; }
.score__v { color: #eaff3d; }
.score__d { color: #ff6fa1; }
.score__tiret { color: #b9bdd6; margin: 0 10px; }
.score__lettre { font-size: 36px; margin-left: 2px; }
.score__puces { display: grid; grid-template-columns: auto auto; gap: 4px 16px; list-style: none; font-size: 15px; }
.score__puces b { font-family: ${TITRE}; font-weight: 400; font-size: 22px; color: #f2f3fa; margin-right: 4px; }

.mots { display: flex; gap: 28px; align-items: flex-start; }
.postit {
  flex: 0 1 44%;
  padding: 18px 22px 20px;
  background: #eaff3d;
  color: #0e0f18;
  font-family: ${TEXTE};
  font-size: 22px;
  line-height: 1.25;
  transform: rotate(-1.6deg);
  box-shadow: 0 8px 14px rgba(0, 0, 0, 0.5);
}
.postit__titre, .bulle__titre { display: block; margin-bottom: 6px; font-family: ${TITRE}; font-size: 15px; text-transform: uppercase; letter-spacing: 0.04em; }
.bulle {
  position: relative;
  flex: 1 1 56%;
  padding: 16px 22px 18px;
  border-radius: 22px;
  background: #f2f3fa;
  color: #0e0f18;
  font-family: ${TEXTE};
  font-size: 19px;
  line-height: 1.3;
  transform: rotate(0.8deg);
  box-shadow: 0 8px 14px rgba(0, 0, 0, 0.5);
}
.bulle::before { content: ""; position: absolute; left: 34px; bottom: -16px; border: 9px solid transparent; border-top: 9px solid #f2f3fa; border-left: 9px solid #f2f3fa; }
.bulle p + p { margin-top: 4px; }

.courbe__heures { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 15px; }
/*
 * Autant de colonnes que de manches, avec un plancher : treize tuiles occupent
 * toute la largeur, cinq ne deviennent pas des dalles de trois cents pixels.
 */
.courbe { display: grid; gap: 8px; list-style: none; }
${[...Array(TUILES_MAX - TUILES_MIN + 1).keys()].map((i) => `.courbe--${i + TUILES_MIN} { grid-template-columns: repeat(${i + TUILES_MIN}, 1fr); }`).join("\n")}
.tuile {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  height: 92px;
  padding: 7px 0 5px;
  color: #0e0f18;
  clip-path: polygon(0 8px, 8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%);
}
.tuile--mat { color: #f2f3fa; }
.tuile__verdict { font-family: ${TITRE}; font-size: 24px; line-height: 1; }
.tuile__ko { position: absolute; top: 3px; right: 4px; font-family: ${TITRE}; font-size: 11px; }
${COULEURS_DE_TUILE}

.chiffres { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; }
.chiffre { padding: 10px 6px 8px; background: #0e0f18; text-align: center; clip-path: polygon(0 8px, 8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%); }
.chiffre__valeur { display: block; font-family: ${TITRE}; font-size: 34px; line-height: 1.05; color: #eaff3d; }
.chiffre__libelle { display: block; font-size: 13px; font-weight: 700; text-transform: uppercase; color: #f2f3fa; }
.chiffre__moyenne { display: block; font-size: 13px; color: #b9bdd6; }
.armes { display: flex; flex-wrap: wrap; gap: 12px 22px; margin-top: 16px; }
.arme { display: flex; align-items: center; gap: 10px; }
.arme__kit { display: flex; flex-direction: column; gap: 4px; }
.arme__nom { display: block; font-weight: 700; font-size: 15px; }
.arme__manches { display: block; font-size: 13px; }
.medailles { display: flex; flex-wrap: wrap; gap: 8px 18px; margin-top: 16px; list-style: none; }
.medaille { display: flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 700; }
.medaille__nombre { font-family: ${TITRE}; font-size: 18px; color: #eaff3d; }

.modes { display: flex; flex-direction: column; gap: 12px; list-style: none; }
.mode { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 12px; }
.mode__libelle { display: block; font-weight: 700; font-size: 16px; }
.mode__piste { display: block; height: 10px; margin-top: 5px; background: #0e0f18; }
.barre { display: block; height: 100%; }
.mode__vd { font-family: ${TITRE}; font-size: 24px; white-space: nowrap; }
.stages { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 18px; list-style: none; }
.stage__image { display: block; width: 100%; aspect-ratio: 16 / 9; background: center / cover no-repeat #0e0f18; }
.stage__legende { display: flex; justify-content: space-between; gap: 6px; margin-top: 4px; font-size: 13px; font-weight: 700; }
.stage__vd { color: #b9bdd6; white-space: nowrap; }

.adversaires { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; list-style: none; }
.adversaire { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: #0e0f18; clip-path: polygon(0 8px, 8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%); }
.adversaire__nom { display: block; font-weight: 700; font-size: 15px; line-height: 1.2; }
.adversaire__chiffres { display: block; margin-top: 3px; font-size: 13px; }
.adversaire__chiffres b { font-family: ${TITRE}; font-weight: 400; font-size: 17px; color: #eaff3d; }
`.trim();

/** Un sticker : l'enveloppe au contour, le corps decoupe, une etiquette. */
function sticker(contenu: string, options: { etiquette?: string; plein?: boolean; classe?: string } = {}): string {
  const classes = ["sticker", ...(options.plein ? ["plein"] : []), ...(options.classe ? [options.classe] : [])];
  const etiquette = options.etiquette === undefined ? "" : `<p class="etiquette">${echappe(options.etiquette)}</p>`;
  return `<div class="${classes.join(" ")}"><div class="sticker__corps">${etiquette}${contenu}</div></div>`;
}

/** Bandeau de score : titre, lobby, horaires, V-D en gros, reperes. */
function blocScore(file: SessionFile, analyse: AnalyseSession, registre: Registre): string {
  const { victoires, defaites, nuls, total } = analyse.bilan;
  const premiere = analyse.manches[0];
  const derniere = analyse.manches[analyse.manches.length - 1];
  const lobby = libelleDuLobby(analyse.lobby);

  const sous = [
    analyse.lobby === undefined ? undefined : lobby,
    premiere === undefined ? undefined : `${premiere.heure} → ${derniere?.heure ?? "—"}`,
  ].filter((part): part is string => part !== undefined);

  const puces: string[] = [
    `<li><b>${total}</b>${pluriel(total, "manche")}</li>`,
    ...(analyse.tempsDeJeuMinutes > 0 ? [`<li><b>${analyse.tempsDeJeuMinutes}</b>min de jeu</li>`] : []),
    ...(nuls > 0 ? [`<li><b>${nuls}</b>${pluriel(nuls, "nul")}</li>`] : []),
    ...(analyse.koInfliges > 0 ? [`<li><b>${analyse.koInfliges}</b>KO ${pluriel(analyse.koInfliges, "infligé")}</li>`] : []),
    ...(analyse.koSubis > 0 ? [`<li><b>${analyse.koSubis}</b>KO ${pluriel(analyse.koSubis, "subi")}</li>`] : []),
  ];

  return sticker(
    `<div class="score">` +
      registre.picto("lobbies", analyse.lobby, "", "xl") +
      `<div class="score__titres">` +
      `<h1 class="score__titre">${echappe(titreDeSession(file, analyse))}</h1>` +
      `<p class="score__sous secondaire">${echappe(sous.join(" · "))}</p>` +
      `</div>` +
      `<p class="score__chiffres">` +
      `<span class="score__v">${victoires}<span class="score__lettre">V</span></span>` +
      `<span class="score__tiret">–</span>` +
      `<span class="score__d">${defaites}<span class="score__lettre">D</span></span>` +
      `</p>` +
      `<ul class="score__puces secondaire">${puces.join("")}</ul>` +
      `</div>`,
    { plein: true, classe: "bloc-score" },
  );
}

/** Objectif en post-it, ressenti en bulle. Rien si les deux sont vides. */
function blocMots(objectif: string | undefined, ressenti: string | undefined): string {
  if (!objectif && !ressenti) return "";

  const postit = objectif
    ? `<div class="postit"><span class="postit__titre">Objectif</span>${echappe(objectif)}</div>`
    : "";
  const bulle = ressenti
    ? `<div class="bulle"><span class="bulle__titre">Ressenti</span>` +
      ressenti
        .split("\n")
        .filter((ligne) => ligne.trim() !== "")
        .map((ligne) => `<p>${echappe(ligne)}</p>`)
        .join("") +
      `</div>`
    : "";

  return `<div class="mots plein">${postit}${bulle}</div>`;
}

const VERDICTS: Record<string, string> = { win: "V", lose: "D", draw: "=", inconnu: "?" };

/** Une tuile par manche, couleur de la regle : vive si gagnee, matte sinon. */
function blocCourbe(analyse: AnalyseSession, registre: Registre): string {
  if (analyse.manches.length === 0) return "";
  const premiere = analyse.manches[0];
  const derniere = analyse.manches[analyse.manches.length - 1];

  const tuiles = analyse.manches.map((manche) => {
    const classes = [
      "tuile",
      `tuile--regle-${regleConnue(manche.regle)}`,
      ...(manche.resultat === "win" ? [] : ["tuile--mat"]),
    ];
    return (
      `<li class="${classes.join(" ")}">` +
      registre.picto("regles", manche.regle, "", "s") +
      `<span class="tuile__verdict">${VERDICTS[manche.resultat] ?? "?"}</span>` +
      (manche.ko ? `<span class="tuile__ko">KO</span>` : "") +
      `</li>`
    );
  });

  return sticker(
    `<p class="courbe__heures secondaire"><span>${echappe(premiere?.heure ?? "—")}</span>` +
      `<span>${echappe(derniere?.heure ?? "—")}</span></p>` +
      `<ol class="courbe courbe--${Math.min(Math.max(tuiles.length, TUILES_MIN), TUILES_MAX)}">${tuiles.join("")}</ol>`,
    { etiquette: "Courbe de session", plein: true },
  );
}

/** Une arme et son kit : picto principal, sous-arme et speciale en pastilles. */
function armeEnHtml(arme: ArmeJouee, registre: Registre, detail: string, taille: Taille = "l"): string {
  const kit = [
    arme.sous === undefined ? "" : `<span class="pastille">${registre.picto("sous", arme.sous, "", "xs")}</span>`,
    arme.speciale === undefined
      ? ""
      : `<span class="pastille">${registre.picto("speciales", arme.speciale, "", "xs")}</span>`,
  ].join("");

  return (
    registre.picto("armes", arme.cle, "", taille) +
    (kit === "" ? "" : `<span class="arme__kit">${kit}</span>`) +
    `<span><span class="arme__nom">${echappe(arme.nom)}</span>${detail}</span>`
  );
}

/** Mes chiffres en tuiles, mes armes, mes medailles. */
function blocBulletin(analyse: AnalyseSession, registre: Registre, plein: boolean): string {
  const moi = analyse.moi;
  if (moi === undefined) return "";

  const chiffres: [string, number][] = [
    ["Élim.", moi.kill],
    ["Assist.", moi.assist],
    ["Morts", moi.death],
    ["Spéciaux", moi.special],
  ];
  const tuiles = [
    ...chiffres.map(
      ([libelle, valeur]) =>
        `<div class="chiffre"><span class="chiffre__valeur">${valeur}</span>` +
        `<span class="chiffre__libelle">${libelle}</span>` +
        `<span class="chiffre__moyenne">${moyenne(valeur, moi.manches)} / manche</span></div>`,
    ),
    `<div class="chiffre"><span class="chiffre__valeur">${ratio(moi.kill + moi.assist, moi.death)}</span>` +
      `<span class="chiffre__libelle">(É+A)/M</span>` +
      `<span class="chiffre__moyenne">rendement</span></div>`,
  ];

  const armes = moi.armes.map(
    (arme) =>
      `<div class="arme">` +
      armeEnHtml(
        arme,
        registre,
        `<span class="arme__manches secondaire">${arme.manches} ${pluriel(arme.manches, "manche")}</span>`,
      ) +
      `</div>`,
  );

  const medailles = analyse.medailles.slice(0, MEDAILLES_CITEES).map(
    (medaille) =>
      `<li class="medaille">` +
      registre.picto("medailles", medaille.or ? "or" : "argent", "", "s") +
      `<span>${echappe(medaille.libelle)}</span>` +
      `<span class="medaille__nombre">×${medaille.nombre}</span></li>`,
  );

  return sticker(
    `<div class="chiffres">${tuiles.join("")}</div>` +
      `<div class="armes">${armes.join("")}</div>` +
      (medailles.length === 0 ? "" : `<ul class="medailles">${medailles.join("")}</ul>`),
    { etiquette: "Bulletin", plein },
  );
}

/** Un sticker par mode, avec sa barre de victoires ; les stages en vignettes. */
function blocModes(analyse: AnalyseSession, registre: Registre, plein: boolean): string {
  if (analyse.parMode.length === 0) return "";

  const modes = analyse.parMode.map((mode) => {
    const part = mode.manches === 0 ? 0 : Math.round((mode.victoires / mode.manches) * 100);
    return (
      `<li class="mode">` +
      registre.picto("regles", mode.cle, "", "m") +
      `<span><span class="mode__libelle">${echappe(mode.libelle)}</span>` +
      `<span class="mode__piste"><span class="barre barre--regle-${regleConnue(mode.cle)}" style="width:${part}%"></span></span></span>` +
      `<span class="mode__vd"><span class="score__v">${mode.victoires}V</span> ` +
      `<span class="score__d">${mode.defaites}D</span></span>` +
      `</li>`
    );
  });

  const stages = analyse.parStage.map((stage) => {
    const vignette = registre.declare("stages", stage.cle);
    return (
      `<li class="stage">` +
      (vignette === undefined
        ? ""
        : `<span class="stage__image ${vignette}" role="img" aria-label="${echappe(stage.libelle)}"></span>`) +
      `<span class="stage__legende"><span>${echappe(stage.libelle)}</span>` +
      `<span class="stage__vd">${stage.victoires}V-${stage.defaites}D</span></span>` +
      `</li>`
    );
  });

  return sticker(
    `<ul class="modes">${modes.join("")}</ul>` + `<ul class="stages">${stages.join("")}</ul>`,
    { etiquette: "Modes et stages", plein },
  );
}

/**
 * Le nom francais de l'arme dominante, numerote en cas d'homonymie.
 *
 * `designeLesAdversaires` rend la forme bilingue, faite pour une phrase ; sur
 * une carte de 370 pixels, « Épinceau brosse stellapex (Cometz Octobrush) »
 * passe sur deux lignes. Le francais seul, comme dans le tableau du Markdown.
 */
function nomsFrancaisNumerotes(adverse: StatsJoueur[]): string[] {
  const nom = (joueur: StatsJoueur) => joueur.armes[0]?.nom ?? "arme inconnue";
  const total = new Map<string, number>();
  for (const joueur of adverse) total.set(nom(joueur), (total.get(nom(joueur)) ?? 0) + 1);

  const vus = new Map<string, number>();
  return adverse.map((joueur) => {
    if ((total.get(nom(joueur)) ?? 0) < 2) return nom(joueur);
    const rang = (vus.get(nom(joueur)) ?? 0) + 1;
    vus.set(nom(joueur), rang);
    return `${nom(joueur)} (${rang})`;
  });
}

/** Les adversaires presents sur la session, designes par leur arme. */
function blocEnFace(analyse: AnalyseSession, registre: Registre): string {
  const adverse: StatsJoueur[] = reguliers(analyse.adverse, analyse.manches.length);
  if (adverse.length === 0) return "";
  const noms = nomsFrancaisNumerotes(adverse);

  const cartes = adverse.map((joueur, index) => {
    const arme = joueur.armes[0];
    const chiffres =
      `<span class="adversaire__chiffres secondaire">` +
      `<b>${joueur.kill}</b> élim. · <b>${joueur.death}</b> morts · K/D <b>${ratio(joueur.kill, joueur.death)}</b>` +
      `</span>`;
    return (
      `<li class="adversaire">` +
      (arme === undefined
        ? `<span><span class="adversaire__nom">${echappe(noms[index] ?? "—")}</span>${chiffres}</span>`
        : registre.picto("armes", arme.cle, "", "l") +
          `<span><span class="adversaire__nom">${echappe(noms[index] ?? arme.nom)}</span>${chiffres}</span>`) +
      `</li>`
    );
  });

  return sticker(`<ul class="adversaires">${cartes.join("")}</ul>`, { etiquette: "En face", plein: true });
}

/**
 * Rend l'en-tete d'une session.
 *
 * Deterministe, comme la planche : meme session, memes options, memes pictos,
 * meme chaine. L'ordre des blocs est fixe - score, mots, courbe, bulletin et
 * modes cote a cote, adversaires - quel que soit l'ordre des sections cochees :
 * c'est une mise en page, pas une suite de paragraphes.
 */
export function enteteEnHtml(
  file: SessionFile,
  analyse: AnalyseSession,
  options: OptionsEntete,
  pictos: Pictos,
): Entete {
  const registre = new Registre(pictos);
  const objectif = (options.objectif ?? analyse.objectif)?.trim();
  const ressenti = (options.ressenti ?? analyse.ressenti)?.trim();
  const avec = (section: SectionCompteRendu) => options.sections.includes(section);

  // Bulletin et modes partagent une rangee ; seul, l'un prend toute la largeur.
  const duo = avec("role") && analyse.moi !== undefined && avec("modes") && analyse.parMode.length > 0;

  const blocs = [
    blocScore(file, analyse, registre),
    blocMots(objectif, ressenti),
    avec("courbe") ? blocCourbe(analyse, registre) : "",
    avec("role") ? blocBulletin(analyse, registre, !duo) : "",
    avec("modes") ? blocModes(analyse, registre, !duo) : "",
    avec("scouting") ? blocEnFace(analyse, registre) : "",
  ].filter((bloc) => bloc !== "");

  return {
    html: `<section class="entete">\n${blocs.join("\n")}\n</section>`,
    style: [polices(pictos), STYLE_FIXE, registre.style()].filter((partie) => partie !== "").join("\n"),
  };
}
