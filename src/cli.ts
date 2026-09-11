import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  DEFAULT_MAX_PAGES,
  DEFAULT_OUT_DIR,
  DEFAULT_USER,
} from "./config.ts";
import { fetchSession } from "./fetchSession.ts";
import {
  isSessionType,
  promptSessionMeta,
  SESSION_TYPES,
  type Ask,
  type SessionMeta,
  type SessionType,
} from "./sessionMeta.ts";
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
  name?: string;
  type?: SessionType;
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
  --name <texte>      Nom de la session. Demande a l'ecran s'il est absent.
                      Exemple : "Scrim contre Les Corsaires".
  --type <valeur>     Nature de la session. Valeurs : ${SESSION_TYPES.join(", ")}
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
      name: { type: "string" },
      type: { type: "string" },
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

  if (values.type !== undefined && !isSessionType(values.type)) {
    throw new Error(
      `Valeur de --type inconnue : "${values.type}". ` +
        `Valeurs acceptees : ${SESSION_TYPES.join(", ")}`,
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
    name: values.name,
    type: values.type as SessionType | undefined,
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

  // Nommer apres le bilan : on choisit le nom en voyant ce que la fenetre a
  // ramene. Fournir --name vaut "je donne tout en ligne de commande" et
  // n'ouvre aucun dialogue, meme si --type manque.
  const meta = await resolveSessionMeta(options);
  if (meta.name === undefined) {
    console.warn(
      "\nSession enregistree sans nom. Relancer avec --name pour la nommer.",
    );
  }

  const file = buildSessionFile({
    user: options.user,
    name: meta.name,
    type: meta.type,
    window: options.window,
    filters: options.filters,
    battles: result.battles,
    fetchedAt: new Date(),
  });
  const path = await writeSession(file, options.outDir);

  if (meta.name !== undefined) {
    const type = meta.type === undefined ? "" : ` (${meta.type})`;
    console.log(`\nSession : ${meta.name}${type}`);
  }
  console.log(`Ecrit dans ${path}`);
}

/**
 * Dependances injectables de `resolveSessionMeta`, pour l'eprouver sans TTY
 * ni vraie interface readline. Par defaut, `isInteractive` vaut
 * `process.stdin.isTTY` et `ask` ouvre une interface readline reelle.
 */
export type ResolveSessionMetaDeps = {
  /** Vrai si l'entree est un terminal interactif. */
  isInteractive?: boolean;
  /** Fonction de question a utiliser pour le dialogue, si celui-ci s'ouvre. */
  ask?: Ask;
};

/**
 * Complete les metadonnees manquantes en interrogeant l'utilisateur. Hors
 * terminal interactif, la session est simplement enregistree sans nom : un
 * defaut de label ne doit pas faire echouer une recuperation scriptee. Un
 * `--name` vide ou reduit a des espaces compte comme absent, au meme titre
 * qu'un `--name` non fourni.
 */
export async function resolveSessionMeta(
  options: CliOptions,
  deps: ResolveSessionMetaDeps = {},
): Promise<SessionMeta> {
  const name = options.name?.trim() || undefined;
  const isInteractive = deps.isInteractive ?? process.stdin.isTTY === true;

  if (name !== undefined || !isInteractive) {
    return { name, type: options.type };
  }

  console.log("");
  if (deps.ask !== undefined) {
    return promptSessionMeta(deps.ask, { type: options.type });
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await promptSessionMeta((question) => rl.question(question), {
      type: options.type,
    });
  } finally {
    rl.close();
  }
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
