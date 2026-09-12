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

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { DEFAULT_OUT_DIR } from "./config.ts";
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
                      Par defaut : toutes.
${SECTIONS.map((section) => `                      ${section.padEnd(10)} ${LIBELLES_SECTIONS[section]}`).join("\n")}
  --objectif <texte>  Objectif de la session. Prend le pas sur celui du fichier.
  --ressenti <texte>  Ressenti sur la session. Prend le pas sur celui du fichier.
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
      out: { type: "string" },
      help: { type: "boolean" },
    },
  });

  const path = positionals[0];
  if (path === undefined) {
    throw new Error("Indiquez le fichier de session a raconter.");
  }

  let sections: SectionCompteRendu[] = [...SECTIONS];
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
  };
}

/**
 * Lit la session et rend son compte rendu.
 *
 * Passe par `readSession`, qui refuse tout chemin hors du dossier des sessions,
 * sauf si l'appelant designe explicitement un autre dossier avec `--out` : en
 * ligne de commande, c'est l'utilisateur lui-meme qui choisit ou il lit.
 */
export async function rendCompteRendu(options: ReportCliOptions): Promise<string> {
  const file: SessionFile = await readSession(options.path, options.outDir).catch(
    async (erreur: unknown) => {
      // Hors du dossier des sessions, on lit quand meme : la garde protege la
      // fenetre, pas un utilisateur qui tape un chemin dans son terminal.
      if (erreur instanceof Error && erreur.message.startsWith("Chemin de session refuse")) {
        return JSON.parse(await readFile(options.path, "utf8")) as SessionFile;
      }
      throw erreur;
    },
  );

  return construisLeCompteRendu(file, {
    sections: options.sections,
    ...(options.objectif !== undefined ? { objectif: options.objectif } : {}),
    ...(options.ressenti !== undefined ? { ressenti: options.ressenti } : {}),
  });
}

export async function main(argv: string[]): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(USAGE);
    return;
  }

  process.stdout.write(await rendCompteRendu(parseReportArgs(argv)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((erreur: unknown) => {
    console.error(erreur instanceof Error ? erreur.message : String(erreur));
    process.exitCode = 1;
  });
}
