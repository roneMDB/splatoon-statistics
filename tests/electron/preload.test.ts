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

  test("expose les quatre fonctions du pont", () => {
    for (const fonction of [
      "listSessions",
      "fetchSession",
      "choices",
      "onFetchProgress",
    ]) {
      expect(preload).toContain(`${fonction}:`);
    }
  });
});
