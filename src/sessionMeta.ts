/** Nom et nature d'une session : le seul moyen de distinguer une intra d'un
 * scrim, stat.ink les rangeant tous deux sous le lobby `private`. */

/** Valeurs acceptees par `--type`, liste fermee. */
export const SESSION_TYPES = ["intra", "scrim", "compet", "autre"] as const;

export type SessionType = (typeof SESSION_TYPES)[number];

/** Metadonnees saisies par l'utilisateur, toutes facultatives. */
export type SessionMeta = {
  name?: string;
  type?: SessionType;
};

/** Fonction de question injectee : rend le dialogue testable sans TTY. */
export type Ask = (question: string) => Promise<string>;

/** Verifie qu'une chaine est un type de session connu. */
export function isSessionType(value: string): value is SessionType {
  return (SESSION_TYPES as readonly string[]).includes(value);
}

const NAME_QUESTION = "Nom de la session : ";
const TYPE_QUESTION = `Type [${SESSION_TYPES.join("/")}, Entree pour aucun] : `;

/**
 * Demande le nom, puis le type s'il n'est pas deja connu. Un nom vide arrete
 * le dialogue : sans nom, un type seul n'a pas d'usage.
 */
export async function promptSessionMeta(
  ask: Ask,
  current: SessionMeta = {},
): Promise<SessionMeta> {
  const name = (await ask(NAME_QUESTION)).trim();
  if (name === "") {
    return { ...current };
  }

  if (current.type !== undefined) {
    return { ...current, name };
  }

  while (true) {
    const answer = (await ask(TYPE_QUESTION)).trim().toLowerCase();
    if (answer === "") {
      return { ...current, name };
    }
    if (isSessionType(answer)) {
      return { ...current, name, type: answer };
    }
  }
}
