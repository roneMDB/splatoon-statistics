/** Nom et nature d'une session : le seul moyen de distinguer une intra d'un
 * scrim, stat.ink les rangeant tous deux sous le lobby `private`. */

/** Valeurs acceptees par `--type`, liste fermee. */
export const SESSION_TYPES = ["intra", "scrim", "compet", "open", "autre"] as const;

/** Type union des natures de session acceptees. */
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

/**
 * Convertit une saisie en SessionType, ou refuse avec un message explicite.
 *
 * Reunit une validation autrefois dupliquee entre le processus principal
 * (fenetre d'edition) et l'apercu de recuperation, avec un message legerement
 * different d'un site a l'autre (« type » contre « --type »). Vivait en
 * partie dans `main.ts`, qui importe `electron` et ne peut donc rien tester :
 * une seule regle ici la rend verifiable hors-ligne, et empeche les deux
 * appelants de deriver encore l'un de l'autre.
 *
 * @param value saisie de l'appelant ; vide ou absente si rien n'a ete choisi
 *   (ni erreur ni type dans ce cas, tel que les deux appelants l'attendent).
 * @param label mot repris dans le message de refus, propre au contexte de
 *   l'appelant : "--type" pour la ligne de commande et l'apercu de
 *   recuperation, "type" (par defaut) pour le formulaire de mise a jour.
 */
export function parseSessionType(
  value: string | undefined,
  label = "type",
): SessionType | undefined {
  if (value === undefined || value === "") return undefined;
  if (!isSessionType(value)) {
    throw new Error(
      `Valeur de ${label} inconnue : "${value}". ` +
        `Valeurs acceptees : ${SESSION_TYPES.join(", ")}`,
    );
  }
  return value;
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
