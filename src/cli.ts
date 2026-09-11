import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  DEFAULT_MAX_PAGES,
  DEFAULT_OUT_DIR,
  DEFAULT_USER,
} from "./config.ts";
import { fetchSession } from "./fetchSession.ts";
import type { BattleFilters } from "./statink/url.ts";
import { buildSessionFile, writeSession } from "./store.ts";
import { buildWindow, type SessionWindow } from "./window.ts";

/** Valeurs acceptees par `f[lobby]`, relevees dans le formulaire stat.ink. */
const LOBBIES = [
  "private",
  "!private",
  "regular",
  "@bankara",
  "bankara_challenge",
  "bankara_open",
  "xmatch",
  "event",
  "@splatfest",
  "splatfest_challenge",
  "splatfest_open",
] as const;

export type CliOptions = {
  user: string;
  window: SessionWindow;
  filters: BattleFilters;
  outDir: string;
  maxPages: number;
};

const USAGE = `
Recupere les matchs d'une session (intra, scrim, compet) depuis stat.ink.

  npm run fetch -- --from "<date/heure>" [options]

Options
  --from <datetime>   Debut de la session. Obligatoire.
                      Format : "YYYY-MM-DD HH:mm" ou "YYYY-MM-DD HH:mm:ss",
                      en heure locale.
  --to <datetime>     Fin de la session. Par defaut : maintenant.
  --user <pseudo>     Compte stat.ink a interroger. Par defaut : ${DEFAULT_USER}.
  --lobby <valeur>    Filtre de lobby. "private" = intras / scrims / compets.
                      Valeurs : ${LOBBIES.join(", ")}
  --out <dossier>     Dossier de sortie. Par defaut : ${DEFAULT_OUT_DIR}.
  --max-pages <n>     Plafond de pages a parcourir. Par defaut : ${DEFAULT_MAX_PAGES}.
  --help              Affiche cette aide.

Exemple
  npm run fetch -- --from "2026-08-19 20:00" --to "2026-08-19 23:30" --lobby private
`.trim();

/** Analyse les arguments de la ligne de commande. */
export function parseCliArgs(argv: string[]): CliOptions {
  const { values } = parseArgs({
    args: argv,
    strict: true,
    options: {
      from: { type: "string" },
      to: { type: "string" },
      user: { type: "string" },
      lobby: { type: "string" },
      out: { type: "string" },
      "max-pages": { type: "string" },
      help: { type: "boolean" },
    },
  });

  if (values.from === undefined) {
    throw new Error("L'option --from est obligatoire.");
  }

  if (values.lobby !== undefined && !LOBBIES.includes(values.lobby as never)) {
    throw new Error(
      `Valeur de --lobby inconnue : "${values.lobby}". ` +
        `Valeurs acceptees : ${LOBBIES.join(", ")}`,
    );
  }

  let maxPages = DEFAULT_MAX_PAGES;
  if (values["max-pages"] !== undefined) {
    maxPages = Number(values["max-pages"]);
    if (!Number.isInteger(maxPages) || maxPages < 1) {
      throw new Error(
        `Valeur de --max-pages invalide : "${values["max-pages"]}" ` +
          "(entier positif attendu).",
      );
    }
  }

  return {
    user: values.user ?? DEFAULT_USER,
    window: buildWindow(values.from, values.to),
    filters: { lobby: values.lobby },
    outDir: values.out ?? DEFAULT_OUT_DIR,
    maxPages,
  };
}

/** Point d'entree : recupere la session et l'ecrit sur disque. */
export async function main(argv: string[]): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(USAGE);
    return;
  }

  const options = parseCliArgs(argv);
  const localWindow = `${new Date(options.window.fromMs).toLocaleString()} -> ${new Date(
    options.window.toMs,
  ).toLocaleString()}`;
  console.log(`Compte  : @${options.user}`);
  console.log(`Fenetre : ${localWindow}`);
  if (options.filters.lobby !== undefined) {
    console.log(`Lobby   : ${options.filters.lobby}`);
  }

  const result = await fetchSession({
    user: options.user,
    window: options.window,
    filters: options.filters,
    maxPages: options.maxPages,
  });

  const file = buildSessionFile({
    user: options.user,
    window: options.window,
    filters: options.filters,
    battles: result.battles,
    fetchedAt: new Date(),
  });
  const path = await writeSession(file, options.outDir);

  console.log(
    `\n${result.battles.length} match(s) dans la fenetre ` +
      `(${result.pagesFetched} page(s) lue(s), arret : ${result.stopReason}).`,
  );

  if (result.battles.length === 0) {
    console.warn(
      "\nAucun match trouve. Verifier la fenetre de temps, le fuseau horaire, " +
        "le filtre de lobby, et que les matchs ont bien ete envoyes a stat.ink.",
    );
  } else {
    summarize(result.battles);
  }

  console.log(`\nEcrit dans ${path}`);
}

/** Recapitulatif minimal, juste pour verifier d'un oeil que c'est la bonne session. */
function summarize(battles: Parameters<typeof buildSessionFile>[0]["battles"]): void {
  const wins = battles.filter((b) => b.result === "win").length;
  const losses = battles.filter((b) => b.result === "lose").length;
  console.log(`Bilan   : ${wins}V - ${losses}D`);
  for (const battle of battles) {
    const time = battle.start_at?.iso8601 ?? "?";
    console.log(
      `  ${time}  ${battle.lobby?.key ?? "?"}  ${battle.rule?.key ?? "?"}  ` +
        `${battle.stage?.key ?? "?"}  ${battle.result ?? "?"}`,
    );
  }
}

// Execute seulement quand le fichier est lance directement, pas quand les
// tests l'importent pour eprouver parseCliArgs.
const entryPoint = process.argv[1];
if (entryPoint !== undefined && fileURLToPath(import.meta.url) === resolve(entryPoint)) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(`\nErreur : ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
