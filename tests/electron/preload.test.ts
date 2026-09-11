import { describe, expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { IPC } from "../../src/electron/ipcChannels.ts";

/**
 * Le preload tourne dans le bac a sable d'Electron, dont le chargeur ne sait
 * pas resoudre un module local : il doit donc etre autonome et redeclarer les
 * noms de canaux. Ces tests interdisent que les deux listes divergent.
 */
const preloadPath = fileURLToPath(
  new URL("../../src/electron/preload.cts", import.meta.url),
);
const preload = await readFile(preloadPath, "utf8");

/**
 * `main.ts` cable les gestionnaires IPC ; rien d'autre ne le verifiait. Un
 * canal renommer dans `IPC` et dans le preload sans recabler `main.ts`
 * donnerait un "No handler registered" a l'execution, dans la seule zone du
 * projet qu'aucun test ne couvrait.
 */
const mainPath = fileURLToPath(new URL("../../src/electron/main.ts", import.meta.url));
const main = await readFile(mainPath, "utf8");

/**
 * Fonctions exposees par le pont, avec la cle de IPC qu'elles sont censees
 * invoquer. Identique au nom de la fonction, sauf `onFetchProgress` : le
 * prefixe `on` note un abonnement, la cle du canal reste `fetchProgress`.
 */
const FONCTIONS = [
  ["listSessions", "listSessions"],
  ["previewSession", "previewSession"],
  ["saveSession", "saveSession"],
  ["readSession", "readSession"],
  ["updateSession", "updateSession"],
  ["deleteSession", "deleteSession"],
  ["choices", "choices"],
  ["onFetchProgress", "fetchProgress"],
] as const satisfies ReadonlyArray<readonly [string, keyof typeof IPC]>;

/**
 * Lit le bloc `const CANAUX = { ... } as const;` et rend la table nom ->
 * valeur de canal qu'il redeclare. Sert a resoudre une reference
 * `CANAUX.xxx` trouvee plus loin dans le fichier vers sa vraie valeur.
 */
function canauxRedeclares(source: string): Record<string, string> {
  const bloc = source.match(/const CANAUX = \{([\s\S]*?)\}\s*as const;/);
  const corps = bloc?.[1];
  if (corps === undefined) {
    throw new Error("Bloc CANAUX introuvable dans le preload.");
  }
  const table: Record<string, string> = {};
  for (const paire of corps.matchAll(/(\w+):\s*"([^"]+)"/g)) {
    const nom = paire[1];
    const valeur = paire[2];
    if (nom === undefined || valeur === undefined) continue;
    table[nom] = valeur;
  }
  return table;
}

/**
 * Decoupe le fichier en segments, un par fonction exposee : de son nom a
 * celui de la fonction suivante (ou la fin du fichier). Insensible a l'ordre
 * et a la mise en forme (saut de ligne, espace) puisqu'il ne cherche que les
 * bornes `nomDeFonction:`.
 */
function segmentsParFonction(source: string): Map<string, string> {
  // Les noms de fonction (listSessions, previewSession, ...) sont aussi les
  // cles du bloc CANAUX plus haut dans le fichier : il faut chercher leurs
  // bornes uniquement a partir de l'objet expose, sous peine de decouper le
  // bloc CANAUX au lieu des fonctions elles-memes.
  const debutExpose = source.indexOf("exposeInMainWorld(");
  if (debutExpose === -1) {
    throw new Error("Appel a exposeInMainWorld introuvable dans le preload.");
  }
  const expose = source.slice(debutExpose);

  const positions = FONCTIONS.map(([nom]) => {
    const trouve = new RegExp(`\\b${nom}:`).exec(expose);
    if (!trouve) {
      throw new Error(`Fonction "${nom}" introuvable dans le preload.`);
    }
    return { nom, index: trouve.index };
  }).sort((a, b) => a.index - b.index);

  const segments = new Map<string, string>();
  positions.forEach(({ nom, index }, i) => {
    const suivante = positions[i + 1];
    const fin = suivante !== undefined ? suivante.index : expose.length;
    segments.set(nom, expose.slice(index, fin));
  });
  return segments;
}

describe("preload", () => {
  test("n'importe rien d'autre qu'electron", () => {
    const imports = preload.match(/^import .*/gm) ?? [];
    expect(imports).toHaveLength(1);
    expect(imports[0]).toContain('from "electron"');
  });

  test("reprend exactement les noms de canaux de ipcChannels", () => {
    for (const canal of Object.values(IPC)) {
      expect(preload).toContain(`"${canal}"`);
    }
  });

  test("expose les fonctions du pont", () => {
    for (const [fonction] of FONCTIONS) {
      expect(preload).toContain(`${fonction}:`);
    }
  });

  test("chaque fonction invoque le canal IPC qui porte son nom", () => {
    // Ne suffit pas que chaque canal et chaque nom de fonction figurent
    // quelque part dans le fichier (les tests precedents) : il faut que
    // CHAQUE fonction invoque LE canal qui lui correspond. Un pont mal cable
    // (ex : previewSession invoquant CANAUX.saveSession) passerait les tests
    // ci-dessus sans broncher, puisque toutes les chaines attendues
    // resteraient presentes ailleurs dans le fichier.
    const table = canauxRedeclares(preload);
    const segments = segmentsParFonction(preload);

    for (const [fonction, cleAttendue] of FONCTIONS) {
      const segment = segments.get(fonction)!;
      const reference = segment.match(/CANAUX\.(\w+)/);
      const cle = reference?.[1];
      expect(
        cle,
        `la fonction "${fonction}" n'invoque aucun CANAUX.xxx`,
      ).toBeDefined();

      const valeurInvoquee = cle === undefined ? undefined : table[cle];
      expect(
        valeurInvoquee,
        `la fonction "${fonction}" invoque "CANAUX.${cle}", absent du bloc CANAUX`,
      ).toBeDefined();

      expect(
        valeurInvoquee,
        `la fonction "${fonction}" invoque le canal "${valeurInvoquee}" ` +
          `("CANAUX.${cle}") au lieu du canal "${IPC[cleAttendue]}" attendu`,
      ).toBe(IPC[cleAttendue]);
    }
  });

  test("chaque fonction qui declare un parametre le transmet a l'appel invoke", () => {
    // Un preload qui invoquerait `ipcRenderer.invoke(CANAUX.readSession)` sans
    // le `path` recu passerait les tests ci-dessus (le canal reste le bon)
    // tout en cassant silencieusement la fiche : ce test ferme ce trou.
    const segments = segmentsParFonction(preload);

    for (const [fonction] of FONCTIONS) {
      const segment = segments.get(fonction)!;
      if (!segment.includes("ipcRenderer.invoke(")) {
        // onFetchProgress s'abonne via ipcRenderer.on, pas invoke : autre
        // mecanique, deja couverte par ailleurs.
        continue;
      }

      const signature = segment.match(new RegExp(`${fonction}:\\s*\\(([^)]*)\\)`));
      const parametre = signature?.[1]?.split(":")[0]?.trim();
      if (!parametre) continue; // fonction sans parametre (listSessions, choices)

      const appel = segment.match(/ipcRenderer\.invoke\(CANAUX\.\w+([^)]*)\)/);
      const argumentsTransmis = appel?.[1] ?? "";
      expect(
        new RegExp(`\\b${parametre}\\b`).test(argumentsTransmis),
        `la fonction "${fonction}" declare le parametre "${parametre}" mais ne le ` +
          `transmet pas a invoke (appel : "invoke(CANAUX...${argumentsTransmis})")`,
      ).toBe(true);
    }
  });
});

describe("main.ts cable un gestionnaire pour chaque canal", () => {
  test("un ipcMain.handle existe pour chaque canal, sauf la progression (un envoi, pas une invocation)", () => {
    const geres = new Set(
      [...main.matchAll(/ipcMain\.handle\(\s*IPC\.(\w+)/g)].map((trouve) => trouve[1]),
    );

    for (const [nom, cle] of Object.entries(IPC)) {
      if (cle === IPC.fetchProgress) continue;
      expect(
        geres.has(nom),
        `aucun ipcMain.handle(IPC.${nom}, ...) trouve dans main.ts pour le canal "${cle}"`,
      ).toBe(true);
    }
  });
});
