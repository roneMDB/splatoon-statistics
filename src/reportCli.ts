/**
 * Imprime le compte rendu d'une session deja enregistree.
 *
 * Point d'entree distinct de `cli.ts` : celui-ci recupere depuis stat.ink, avec
 * ses propres options et son propre `parseArgs` strict. Les melanger obligerait
 * chacun a tolerer les options de l'autre.
 *
 * Sert surtout a travailler la redaction : comparer deux formulations ne
 * demande pas de lancer l'application.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { DEFAULT_OUT_DIR, DEFAULT_PICTOS_DIR, DEFAULT_PLANCHE_DIR } from "./config.ts";
import { REGLAGES } from "./reglages.ts";
import { chargeLesPictos } from "./report/pictos.ts";
import { construisLaPlanche } from "./report/planche.ts";
import { readSession } from "./sessionList.ts";
import {
  construisLeCompteRendu,
  estUneSection,
  LIBELLES_SECTIONS,
  SECTIONS,
  type SectionCompteRendu,
} from "./report/index.ts";
import type { SessionFile } from "./store.ts";

const USAGE = `
Imprime le compte rendu d'une session enregistree.

  npm run report -- <fichier de session> [options]

Options
  --sections <liste>  Sections a inclure, separees par des virgules.
                      Par defaut : ${REGLAGES.sectionsParDefaut.join(", ") || "aucune"} (settings.json).
${SECTIONS.map((section) => `                      ${section.padEnd(10)} ${LIBELLES_SECTIONS[section]}`).join("\n")}
  --objectif <texte>  Objectif de la session. Prend le pas sur celui du fichier.
  --ressenti <texte>  Ressenti sur la session. Prend le pas sur celui du fichier.
  --planche           Ecrit la planche de manches en HTML au lieu d'imprimer
                      le compte rendu. Dans ${DEFAULT_PLANCHE_DIR}. Les
                      chiffres des joueurs portent les pictos du jeu.
  --entete            Avec --planche : pose le compte rendu en tete, dessine
                      avec les pictos du jeu (${DEFAULT_PICTOS_DIR}). Reprend
                      --sections, --objectif et --ressenti.
  --out <dossier>     Dossier des sessions. Par defaut : ${DEFAULT_OUT_DIR}.
  --help              Affiche cette aide.

Exemple
  npm run report -- data/sessions/Gloup_20260911-2000_20260911-2301.json --sections role,modes
`.trim();

export type ReportCliOptions = {
  path: string;
  sections: SectionCompteRendu[];
  objectif?: string;
  ressenti?: string;
  outDir: string;
  /** Ecrit la planche en HTML au lieu d'imprimer le compte rendu. */
  planche: boolean;
  /** Avec `planche` : pose le compte rendu dessine en tete de planche. */
  entete: boolean;
};

/** Analyse les arguments. Le chemin de session est positionnel. */
export function parseReportArgs(argv: string[]): ReportCliOptions {
  const { values, positionals } = parseArgs({
    args: argv,
    strict: true,
    allowPositionals: true,
    options: {
      sections: { type: "string" },
      objectif: { type: "string" },
      ressenti: { type: "string" },
      planche: { type: "boolean" },
      entete: { type: "boolean" },
      out: { type: "string" },
      help: { type: "boolean" },
    },
  });

  const path = positionals[0];
  if (path === undefined) {
    throw new Error("Indiquez le fichier de session a raconter.");
  }

  let sections: SectionCompteRendu[] = [...REGLAGES.sectionsParDefaut];
  if (values.sections !== undefined) {
    const demandees = values.sections
      .split(",")
      .map((section) => section.trim())
      .filter((section) => section !== "");

    const inconnue = demandees.find((section) => !estUneSection(section));
    if (inconnue !== undefined) {
      throw new Error(
        `Section inconnue : "${inconnue}". Sections : ${SECTIONS.join(", ")}`,
      );
    }
    sections = demandees.filter(estUneSection);
  }

  return {
    path,
    sections,
    ...(values.objectif !== undefined ? { objectif: values.objectif } : {}),
    ...(values.ressenti !== undefined ? { ressenti: values.ressenti } : {}),
    outDir: values.out ?? DEFAULT_OUT_DIR,
    planche: values.planche === true,
    entete: values.entete === true,
  };
}

/**
 * Lit la session designee par la ligne de commande.
 *
 * Passe par `readSession`, qui refuse tout chemin hors du dossier des sessions,
 * sauf si l'appelant designe explicitement un autre dossier avec `--out` : en
 * ligne de commande, c'est l'utilisateur lui-meme qui choisit ou il lit. La
 * garde protege la fenetre, pas quelqu'un qui tape un chemin dans son terminal.
 */
async function lisLaSession(options: ReportCliOptions): Promise<SessionFile> {
  return readSession(options.path, options.outDir).catch(async (erreur: unknown) => {
    if (erreur instanceof Error && erreur.message.startsWith("Chemin de session refuse")) {
      return JSON.parse(await readFile(options.path, "utf8")) as SessionFile;
    }
    throw erreur;
  });
}

/** Lit la session et rend son compte rendu. */
export async function rendCompteRendu(options: ReportCliOptions): Promise<string> {
  const file = await lisLaSession(options);

  return construisLeCompteRendu(file, {
    sections: options.sections,
    ...(options.objectif !== undefined ? { objectif: options.objectif } : {}),
    ...(options.ressenti !== undefined ? { ressenti: options.ressenti } : {}),
  });
}

/**
 * Ecrit la planche en HTML et rend son chemin.
 *
 * Le HTML, pas le PNG : la capture demande Electron, que la ligne de commande
 * n'a pas et ne doit pas acquerir. Ouvert dans un navigateur, le fichier montre
 * exactement ce que l'application photographiera - de quoi travailler le
 * gabarit sans relancer l'application.
 *
 * `plancheDir` reprend le meme role que le parametre homonyme de
 * `fabriqueLaPlanche` : sans lui, cette fonction ecrirait toujours dans le
 * vrai `DEFAULT_PLANCHE_DIR`, seule partie de la CLI a ecrire des fichiers et
 * seule sans test.
 */
export async function ecrisLaPlanche(
  options: ReportCliOptions,
  plancheDir: string = DEFAULT_PLANCHE_DIR,
  pictosDir: string = DEFAULT_PICTOS_DIR,
): Promise<string> {
  const file = await lisLaSession(options);
  await mkdir(plancheDir, { recursive: true });

  const pictos = await chargeLesPictos(file, pictosDir);
  const html = options.entete
    ? construisLaPlanche(file, {
        entete: {
          sections: options.sections,
          ...(options.objectif !== undefined ? { objectif: options.objectif } : {}),
          ...(options.ressenti !== undefined ? { ressenti: options.ressenti } : {}),
        },
        pictos,
      })
    : construisLaPlanche(file, { pictos });

  const chemin = join(plancheDir, `${basename(options.path, ".json")}.html`);
  await writeFile(chemin, html, "utf8");
  return chemin;
}

export async function main(argv: string[]): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(USAGE);
    return;
  }

  const options = parseReportArgs(argv);

  if (options.planche) {
    console.log(`Planche écrite dans ${await ecrisLaPlanche(options)}`);
    return;
  }

  process.stdout.write(await rendCompteRendu(options));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((erreur: unknown) => {
    console.error(erreur instanceof Error ? erreur.message : String(erreur));
    process.exitCode = 1;
  });
}
