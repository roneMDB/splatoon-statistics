/** Constantes de l'acces a stat.ink et valeurs par defaut de la CLI. */

export const STATINK_ORIGIN = "https://stat.ink";

/**
 * Cloudflare renvoie 403 aux User-Agent non-navigateur : celui-ci est
 * obligatoire, ce n'est pas une precaution decorative.
 */
export const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/126.0.0.0 Safari/537.36";

/** Compte interroge par defaut. */
export const DEFAULT_USER = "Gloup";

/** Dossier ou sont ecrits les fichiers de session. */
export const DEFAULT_OUT_DIR = "data/sessions";

/**
 * Plafond de securite : `page=N` trop grand renvoie la derniere page au lieu
 * d'une liste vide, donc une boucle sans garde-fou ne se terminerait jamais.
 */
export const DEFAULT_MAX_PAGES = 20;

/** Tentatives totales par requete (1 essai + 2 reprises). */
export const MAX_ATTEMPTS = 3;

/** Delai de base du backoff exponentiel entre deux tentatives, en ms. */
export const RETRY_BASE_DELAY_MS = 500;
