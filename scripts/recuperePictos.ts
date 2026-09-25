/**
 * Recupere les pictos et polices de Splatoon 3 dans `assets/splatoon/`.
 *
 * Script de developpement, lance a la main (`npm run pictos`) quand une arme
 * ou un stage sort : l'application, elle, ne fait jamais d'appel reseau pour
 * ses pictos, elle lit ce dossier.
 *
 * Le dossier est ignore par git : ces fichiers appartiennent a Nintendo et le
 * depot est public. Chacun le remplit sur sa machine en lancant ce script.
 *
 * Les fichiers portent la cle stat.ink (`armes/nzap89.png`) : c'est la seule
 * cle que les sessions connaissent. Les correspondances sont dans
 * `correspondancesPictos.ts`.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { STATINK_ORIGIN, USER_AGENT } from "../src/config.ts";
import {
  LEANNY,
  nettoieLeSvgSplatNet,
  PICTOS_DE_SCORE,
  planDeTelechargement,
  type ArmeMush,
  type ArmeStatink,
  type SceneMush,
  type StageStatink,
} from "./correspondancesPictos.ts";

const DOSSIER = "assets/splatoon";
const TENTATIVES = 4;

/** `fetch` avec reprise : Cloudflare coupe parfois une connexion en plein vol. */
async function telecharge(url: string): Promise<Buffer> {
  let derniere: unknown;
  for (let tentative = 1; tentative <= TENTATIVES; tentative += 1) {
    try {
      const reponse = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (reponse.ok) return Buffer.from(await reponse.arrayBuffer());
      derniere = new Error(`${url} : HTTP ${reponse.status}`);
      if (reponse.status === 404) break;
    } catch (erreur) {
      derniere = erreur;
    }
    await new Promise((reprise) => setTimeout(reprise, 500 * 2 ** tentative));
  }
  throw derniere;
}

const json = async <T>(url: string): Promise<T> =>
  JSON.parse((await telecharge(url)).toString("utf8")) as T;

type ArbreGitHub = { tree: { path: string }[]; truncated: boolean };

async function main(): Promise<void> {
  const armes = await json<ArmeStatink[]>(`${STATINK_ORIGIN}/api/v3/weapon`);
  const stages = await json<StageStatink[]>(`${STATINK_ORIGIN}/api/v3/stage`);

  const arbre = await json<ArbreGitHub>(
    "https://api.github.com/repos/Leanny/splat3/git/trees/main?recursive=1",
  );
  if (arbre.truncated) throw new Error("Arbre du depot Leanny tronque : liste incomplete.");
  const chemins = new Set(arbre.tree.map((entree) => entree.path));

  // La version la plus recente des tables du jeu : `data/mush/<n>/`.
  const version = Math.max(
    ...[...chemins]
      .map((chemin) => /^data\/mush\/(\d+)\/WeaponInfoMain\.json$/.exec(chemin)?.[1])
      .filter((numero): numero is string => numero !== undefined)
      .map(Number),
  );
  const armesMush = await json<ArmeMush[]>(`${LEANNY}/data/mush/${version}/WeaponInfoMain.json`);
  const scenesMush = await json<SceneMush[]>(`${LEANNY}/data/mush/${version}/VersusSceneInfo.json`);

  const plan = planDeTelechargement({
    armes,
    stages,
    armesMush,
    scenesMush,
    existe: (chemin) => chemins.has(chemin),
  });

  let octets = 0;
  for (const { source, cible } of plan.telechargements) {
    const contenu = await telecharge(source);
    const chemin = join(DOSSIER, cible);
    await mkdir(dirname(chemin), { recursive: true });
    await writeFile(chemin, contenu);
    octets += contenu.length;
  }

  for (const { source, cible, couleur } of PICTOS_DE_SCORE) {
    const svg = nettoieLeSvgSplatNet((await telecharge(source)).toString("utf8"), couleur);
    const chemin = join(DOSSIER, cible);
    await mkdir(dirname(chemin), { recursive: true });
    await writeFile(chemin, svg, "utf8");
    octets += Buffer.byteLength(svg);
  }

  await writeFile(join(DOSSIER, "SOURCE.md"), texteDeProvenance(version), "utf8");

  console.log(
    `${plan.telechargements.length + PICTOS_DE_SCORE.length} fichiers, ${Math.round(octets / 1024)} Ko, tables du jeu v${version}.`,
  );
  if (plan.manquants.length > 0) {
    console.log(`Sans picto (${plan.manquants.length}) :\n  ${plan.manquants.join("\n  ")}`);
  }
}

function texteDeProvenance(version: number): string {
  const jour = new Date().toISOString().slice(0, 10);
  return `# Provenance des pictos

Genere par \`npm run pictos\` (\`scripts/recuperePictos.ts\`) le ${jour}.
Ne pas modifier a la main : relancer le script.

**Tous ces pictos et polices sont la propriete de Nintendo.** Ils sont utilises
ici a titre d'usage de fan, non commercial, pour illustrer les comptes rendus
d'un club. Ils ne sont couverts par aucune licence de ce depot.

| Dossier | Source |
|---|---|
| \`armes/\`, \`sous/\`, \`speciales/\`, \`stages/\`, \`medailles/\` | [Leanny/splat3](https://github.com/Leanny/splat3), donnees extraites du jeu, tables v${version} |
| \`regles/\` (sauf \`tricolor.png\`), \`lobbies/\`, \`polices/\` | [misenhower/splatoon3.ink](https://github.com/misenhower/splatoon3.ink), depot sous licence MIT |
| \`stats/\` | [splashcat-ink/splashcat](https://github.com/splashcat-ink/splashcat), pictos de SplatNet 3, couleur fixee au telechargement |
| \`regles/tricolor.png\` | [Inkipedia](https://splatoonwiki.org/wiki/File:S3_icon_Tricolor_Turf_War.png) |

Chaque fichier porte la cle stat.ink correspondante (\`armes/nzap89.png\`).
`;
}

await main();
