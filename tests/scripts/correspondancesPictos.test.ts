import { describe, expect, test } from "vitest";
import {
  LEANNY,
  nomDeGyml,
  nomDImageDeStage,
  numeroNintendo,
  planDeTelechargement,
} from "../../scripts/correspondancesPictos.ts";

describe("numeroNintendo", () => {
  test("prend l'alias numerique parmi les autres", () => {
    expect(numeroNintendo(["61", "n_zap_89"])).toBe(61);
    expect(numeroNintendo(["bridge", "hammerhead_bridge", "10"])).toBe(10);
  });

  test("sans alias numerique, rien", () => {
    expect(numeroNintendo(["n_zap_89"])).toBeUndefined();
  });
});

describe("nomDeGyml", () => {
  test("extrait le nom interne d'un chemin gyml", () => {
    expect(nomDeGyml("Work/Gyml/Bomb_Robot.spl__WeaponInfoSub.gyml")).toBe("Bomb_Robot");
    expect(nomDeGyml("Work/Gyml/SpFirework.spl__WeaponInfoSpecial.gyml")).toBe("SpFirework");
  });

  test("un chemin absent ou mal forme ne donne rien", () => {
    expect(nomDeGyml(undefined)).toBeUndefined();
    expect(nomDeGyml("")).toBeUndefined();
  });
});

test("nomDImageDeStage retire la version de la scene", () => {
  expect(nomDImageDeStage("Vss_Kaisou04")).toBe("Vss_Kaisou");
  expect(nomDImageDeStage("Vss_Yagara")).toBe("Vss_Yagara");
});

describe("planDeTelechargement", () => {
  const armesMush = [
    {
      Id: 61,
      __RowId: "Shooter_QuickMiddle_01",
      SubWeapon: "Work/Gyml/Bomb_Robot.spl__WeaponInfoSub.gyml",
      SpecialWeapon: "Work/Gyml/SpFirework.spl__WeaponInfoSpecial.gyml",
    },
  ];
  const scenesMush = [{ Id: 10, __RowId: "Vss_Kaisou04" }];
  const nzap = {
    key: "nzap89",
    aliases: ["61", "n_zap_89"],
    sub: { key: "robotbomb" },
    special: { key: "decoy" },
  };

  test("relie arme, sous-arme, speciale et stage a leurs fichiers, nommes par cle stat.ink", () => {
    const plan = planDeTelechargement({
      armes: [nzap],
      stages: [{ key: "masaba", aliases: ["bridge", "10"] }],
      armesMush,
      scenesMush,
      existe: () => true,
    });

    expect(plan.manquants).toEqual([]);
    expect(plan.telechargements).toEqual(
      expect.arrayContaining([
        { source: `${LEANNY}/images/weapon_flat/Path_Wst_Shooter_QuickMiddle_01.png`, cible: "armes/nzap89.png" },
        { source: `${LEANNY}/images/subspe/Wsb_Bomb_Robot00.png`, cible: "sous/robotbomb.png" },
        { source: `${LEANNY}/images/subspe/Wsp_SpFirework00.png`, cible: "speciales/decoy.png" },
        { source: `${LEANNY}/images/stage/Vss_Kaisou.png`, cible: "stages/masaba.png" },
      ]),
    );
  });

  test("couvre les regles, les lobbies, la tricolore, les medailles et les polices", () => {
    const cibles = planDeTelechargement({
      armes: [],
      stages: [],
      armesMush: [],
      scenesMush: [],
      existe: () => true,
    }).telechargements.map((telechargement) => telechargement.cible);

    for (const cible of [
      "regles/nawabari.svg",
      "regles/area.svg",
      "regles/yagura.svg",
      "regles/hoko.svg",
      "regles/asari.svg",
      "regles/tricolor.png",
      "lobbies/private.svg",
      "lobbies/xmatch.svg",
      "lobbies/bankara_open.svg",
      "medailles/or.png",
      "medailles/argent.png",
      "polices/titre.woff2",
      "polices/texte.woff2",
    ]) {
      expect(cibles).toContain(cible);
    }
  });

  test("une sous-arme partagee par deux armes n'est telechargee qu'une fois", () => {
    const plan = planDeTelechargement({
      armes: [nzap, { ...nzap, key: "nzap89_deco" }],
      stages: [],
      armesMush,
      scenesMush,
      existe: () => true,
    });
    const sous = plan.telechargements.filter((t) => t.cible === "sous/robotbomb.png");
    expect(sous).toHaveLength(1);
  });

  test("une arme inconnue du jeu ou une image absente du depot est signalee, pas telechargee", () => {
    const plan = planDeTelechargement({
      armes: [nzap, { key: "nouvelle", aliases: ["9999"] }],
      stages: [{ key: "masaba", aliases: ["10"] }],
      armesMush,
      scenesMush,
      existe: (chemin) => !chemin.includes("Vss_"),
    });

    expect(plan.manquants).toEqual(["arme nouvelle", "stage masaba"]);
    expect(plan.telechargements.some((t) => t.cible.startsWith("stages/"))).toBe(false);
  });
});
