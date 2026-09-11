/**
 * Fenetre de temps delimitant une session (une intra, un scrim, une compet).
 *
 * Deux fuseaux se croisent ici, d'ou la prudence :
 * - les bornes saisies par l'utilisateur sont en heure locale ;
 * - stat.ink interprete `f[term_from]` / `f[term_to]` dans le fuseau du profil
 *   consulte, ce qu'on ne peut pas connaitre de facon fiable ;
 * - `battle.start_at.time` est un epoch en secondes, non ambigu.
 *
 * On envoie donc au serveur une fenetre volontairement elargie, et on filtre
 * ensuite au epoch pres en local.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Marge appliquee de chaque cote de la fenetre pour la requete serveur. */
export const WINDOW_PADDING_MS = DAY_MS;

export type SessionWindow = {
  /** Borne basse demandee, en epoch millisecondes. */
  fromMs: number;
  /** Borne haute demandee, en epoch millisecondes. */
  toMs: number;
  /** Borne basse elargie, envoyee a stat.ink. */
  paddedFromMs: number;
  /** Borne haute elargie, envoyee a stat.ink. */
  paddedToMs: number;
};

const DATETIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;

const FORMAT_HINT = "format attendu : YYYY-MM-DD HH:mm ou YYYY-MM-DD HH:mm:ss";

/**
 * Interprete une date/heure dans le fuseau local de la machine.
 * @returns l'instant correspondant, en epoch millisecondes.
 */
export function parseLocalDateTime(input: string): number {
  const match = DATETIME_PATTERN.exec(input.trim());
  if (!match) {
    throw new Error(`Date/heure illisible : "${input}" (${FORMAT_HINT})`);
  }

  const [year, month, day, hour, minute, second] = match
    .slice(1)
    .map((part) => (part === undefined ? 0 : Number(part))) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];

  // `new Date(...)` en composants locaux fait le decalage de fuseau pour nous,
  // heure d'ete comprise, mais accepte silencieusement les debordements
  // (mois 13 devient janvier de l'annee suivante) : on verifie l'aller-retour.
  const date = new Date(year, month - 1, day, hour, minute, second, 0);
  const roundTrips =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    date.getHours() === hour &&
    date.getMinutes() === minute &&
    date.getSeconds() === second;
  if (!roundTrips) {
    throw new Error(`Date/heure invalide : "${input}"`);
  }

  return date.getTime();
}

/** Formate un instant pour `f[term_from]` / `f[term_to]`, en heure locale. */
export function formatStatinkDateTime(epochMs: number): string {
  const date = new Date(epochMs);
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    ` ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

/**
 * Construit la fenetre de session.
 * @param to borne haute ; « maintenant » si omise.
 */
export function buildWindow(from: string, to: string | undefined): SessionWindow {
  const fromMs = parseLocalDateTime(from);
  const toMs = to === undefined ? Date.now() : parseLocalDateTime(to);

  if (toMs < fromMs) {
    throw new Error("La fin de la fenetre doit etre apres son debut.");
  }

  return {
    fromMs,
    toMs,
    paddedFromMs: fromMs - WINDOW_PADDING_MS,
    paddedToMs: toMs + WINDOW_PADDING_MS,
  };
}

/**
 * Teste si un match tombe dans la fenetre demandee, bornes incluses.
 * @param startAtSeconds `battle.start_at.time`, en secondes epoch.
 */
export function isWithinWindow(
  startAtSeconds: number,
  window: SessionWindow,
): boolean {
  const startMs = startAtSeconds * 1000;
  return startMs >= window.fromMs && startMs <= window.toMs;
}
