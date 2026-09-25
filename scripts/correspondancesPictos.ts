/**
 * Relie les cles stat.ink aux fichiers des depots qui publient les pictos du
 * jeu. Fonctions pures, testees sans reseau (`tests/scripts/`).
 *
 * Deux sources, parce qu'aucune n'a tout :
 *
 * - `Leanny/splat3` : les donnees extraites du jeu. Armes, sous-armes,
 *   speciales, stages, medailles. Les fichiers y portent les noms internes de
 *   Nintendo (`Path_Wst_Shooter_QuickMiddle_01.png`), que stat.ink ne connait
 *   pas ; le pont est l'**identifiant numerique** que stat.ink range dans les
 *   `aliases` (`"61"`) et que les tables `WeaponInfoMain` / `VersusSceneInfo`
 *   portent en `Id`.
 * - `misenhower/splatoon3.ink` (MIT) : regles et lobbies en SVG, et les polices.
 * - `splashcat-ink/splashcat` : les deux pictos de SplatNet 3 qui disent
 *   « elimination » et « mort », que ni l'une ni l'autre ne publie.
 *
 * Tout picto reste propriete de Nintendo ; voir `assets/splatoon/SOURCE.md`.
 */

/** Ce que ce projet garde d'une arme de `https://stat.ink/api/v3/weapon`. */
export type ArmeStatink = {
  key: string;
  aliases: string[];
  sub?: { key: string } | null;
  special?: { key: string } | null;
};

/** Ce que ce projet garde d'un stage de `https://stat.ink/api/v3/stage`. */
export type StageStatink = { key: string; aliases: string[] };

/** Une ligne de `WeaponInfoMain.json`, reduite aux champs utiles. */
export type ArmeMush = {
  Id: number;
  __RowId: string;
  SubWeapon?: string;
  SpecialWeapon?: string;
};

/** Une ligne de `VersusSceneInfo.json`, reduite aux champs utiles. */
export type SceneMush = { Id: number; __RowId: string };

/** Un fichier a telecharger : ou le lire, ou l'ecrire. */
export type Telechargement = { source: string; cible: string };

export type Plan = {
  telechargements: Telechargement[];
  /** Cles stat.ink sans picto trouve, par categorie, pour le rapport. */
  manquants: string[];
};

export const LEANNY = "https://raw.githubusercontent.com/Leanny/splat3/main";
export const SPLATOON3INK = "https://raw.githubusercontent.com/misenhower/splatoon3.ink/main";
export const SPLASHCAT = "https://raw.githubusercontent.com/splashcat-ink/splashcat/main";

/**
 * Regles stat.ink -> SVG de splatoon3.ink. La guerre tricolore n'y figure pas :
 * elle vient d'Inkipedia (voir `PICTOS_FIXES`).
 */
export const REGLES: Readonly<Record<string, string>> = {
  nawabari: "regular",
  area: "area",
  yagura: "yagura",
  hoko: "hoko",
  asari: "asari",
};

/**
 * Lobbies stat.ink -> SVG de splatoon3.ink. Les deux variantes Pro partagent un
 * picto, comme en jeu ; les lobbies de festival n'en ont pas chez splatoon3.ink.
 */
export const LOBBIES: Readonly<Record<string, string>> = {
  regular: "regular",
  bankara_challenge: "bankara",
  bankara_open: "bankara",
  xmatch: "x",
  event: "event",
  private: "private",
};

/** Pictos sans correspondance a calculer : une source, une cible. */
export const PICTOS_FIXES: readonly Telechargement[] = [
  {
    source: "https://cdn.wikimg.net/en/splatoonwiki/images/7/7c/S3_icon_Tricolor_Turf_War.png",
    cible: "regles/tricolor.png",
  },
  { source: `${LEANNY}/images/medal/IconMedal_00.png`, cible: "medailles/or.png" },
  { source: `${LEANNY}/images/medal/IconMedal_01.png`, cible: "medailles/argent.png" },
  {
    source: `${SPLATOON3INK}/src/assets/fonts/Splatoon1-common.woff2`,
    cible: "polices/titre.woff2",
  },
  {
    source: `${SPLATOON3INK}/src/assets/fonts/Splatoon2-common.woff2`,
    cible: "polices/texte.woff2",
  },
];

/**
 * Les pictos de SplatNet 3 qui accompagnent les chiffres d'un joueur : un
 * calmar qui en ecrase un autre (elimination), un calmar ecrase (mort).
 * Splashcat les garde en gabarits Django, la couleur d'equipe laissee a
 * remplir : on la fixe au telechargement (voir `nettoieLeSvgSplatNet`). Vif
 * pour les eliminations, eteint pour les morts : la difference se lit avant le
 * dessin.
 */
export const PICTOS_DE_SCORE: readonly (Telechargement & { couleur: string })[] = [
  {
    source: `${SPLASHCAT}/static/images/splatnet-svgs/inkling-splat.svg`,
    cible: "stats/elimination.svg",
    couleur: "#eaff3d",
  },
  {
    source: `${SPLASHCAT}/static/images/splatnet-svgs/inkling-splatted.svg`,
    cible: "stats/mort.svg",
    couleur: "#9aa0bb",
  },
];

/**
 * Rend autonome un SVG de splashcat : la balise de gabarit prend `couleur`, et
 * les attributs propres a sa page (`class`, `role`, `aria-label`, `width`)
 * tombent — la planche pose les siens. Un gabarit qu'on ne sait pas remplir
 * est refuse plutot qu'ecrit a moitie.
 */
export function nettoieLeSvgSplatNet(svg: string, couleur: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(couleur)) throw new Error(`Couleur refusee : ${couleur}`);
  const propre = svg
    .replace(/\{%\s*splatNetCssColor\s+\w+\s*%\}/g, couleur)
    .replace(/\s(?:class|role|aria-label|width)="[^"]*"/g, "")
    .replace(/\s+/g, " ")
    .replace(/ >/g, ">")
    .trim();
  if (propre.includes("{%") || propre.includes("{{") || !propre.startsWith("<svg")) {
    throw new Error("SVG de splashcat inattendu : gabarit non rempli.");
  }
  return propre;
}

/** L'identifiant numerique Nintendo que stat.ink range parmi les alias. */
export function numeroNintendo(aliases: readonly string[]): number | undefined {
  const alias = aliases.find((valeur) => /^\d+$/.test(valeur));
  return alias === undefined ? undefined : Number(alias);
}

/** `Work/Gyml/Bomb_Robot.spl__WeaponInfoSub.gyml` -> `Bomb_Robot`. */
export function nomDeGyml(chemin: string | undefined): string | undefined {
  const nom = /\/([^/]+)\.spl__/.exec(chemin ?? "")?.[1];
  return nom === undefined || nom === "" ? undefined : nom;
}

/**
 * `Vss_Kaisou04` -> `Vss_Kaisou`. La table des scenes numerote les versions
 * d'un stage ; l'image, elle, n'en a qu'une.
 */
export function nomDImageDeStage(rowId: string): string {
  return rowId.replace(/\d+$/, "");
}

/**
 * Calcule tout ce qu'il faut telecharger, a partir de la liste complete de
 * stat.ink : le jeu entier, pas seulement les sessions deja enregistrees.
 *
 * `existe` dit si un chemin figure dans le depot Leanny : une cle dont l'image
 * n'existe pas rejoint `manquants` au lieu de produire un 404 au telechargement.
 */
export function planDeTelechargement(entrees: {
  armes: readonly ArmeStatink[];
  stages: readonly StageStatink[];
  armesMush: readonly ArmeMush[];
  scenesMush: readonly SceneMush[];
  existe: (cheminLeanny: string) => boolean;
}): Plan {
  const telechargements: Telechargement[] = [];
  const manquants: string[] = [];
  const deja = new Set<string>();

  const ajoute = (cheminLeanny: string, cible: string, etiquette: string): void => {
    if (deja.has(cible)) return;
    if (!entrees.existe(cheminLeanny)) {
      manquants.push(etiquette);
      return;
    }
    deja.add(cible);
    telechargements.push({ source: `${LEANNY}/${cheminLeanny}`, cible });
  };

  const armesParId = new Map(entrees.armesMush.map((arme) => [arme.Id, arme]));
  for (const arme of entrees.armes) {
    const numero = numeroNintendo(arme.aliases);
    const mush = numero === undefined ? undefined : armesParId.get(numero);
    if (mush === undefined) {
      manquants.push(`arme ${arme.key}`);
      continue;
    }

    ajoute(`images/weapon_flat/Path_Wst_${mush.__RowId}.png`, `armes/${arme.key}.png`, `arme ${arme.key}`);

    // Les sous-armes et speciales n'ont pas d'identifiant chez stat.ink : on
    // les rejoint par l'arme principale, qui les designe des deux cotes.
    const sous = nomDeGyml(mush.SubWeapon);
    if (arme.sub?.key !== undefined && sous !== undefined) {
      ajoute(`images/subspe/Wsb_${sous}00.png`, `sous/${arme.sub.key}.png`, `sous-arme ${arme.sub.key}`);
    }
    const speciale = nomDeGyml(mush.SpecialWeapon);
    if (arme.special?.key !== undefined && speciale !== undefined) {
      ajoute(
        `images/subspe/Wsp_${speciale}00.png`,
        `speciales/${arme.special.key}.png`,
        `speciale ${arme.special.key}`,
      );
    }
  }

  const scenesParId = new Map(entrees.scenesMush.map((scene) => [scene.Id, scene]));
  for (const stage of entrees.stages) {
    const numero = numeroNintendo(stage.aliases);
    const scene = numero === undefined ? undefined : scenesParId.get(numero);
    if (scene === undefined) {
      manquants.push(`stage ${stage.key}`);
      continue;
    }
    ajoute(`images/stage/${nomDImageDeStage(scene.__RowId)}.png`, `stages/${stage.key}.png`, `stage ${stage.key}`);
  }

  for (const [cle, fichier] of Object.entries(REGLES)) {
    telechargements.push({
      source: `${SPLATOON3INK}/src/assets/img/rules/${fichier}.svg`,
      cible: `regles/${cle}.svg`,
    });
  }
  for (const [cle, fichier] of Object.entries(LOBBIES)) {
    telechargements.push({
      source: `${SPLATOON3INK}/src/assets/img/modes/${fichier}.svg`,
      cible: `lobbies/${cle}.svg`,
    });
  }
  telechargements.push(...PICTOS_FIXES);

  return { telechargements, manquants };
}
