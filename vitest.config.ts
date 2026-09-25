import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Les fenetres de temps sont interpretees dans le fuseau local : on le fixe
    // pour que les tests soient deterministes, quelle que soit la machine.
    //
    // SPLATOON_SETTINGS vide : les tests ignorent le `settings.json` de
    // l'utilisateur et tournent sur les reglages par defaut (voir reglages.ts).
    env: { TZ: "Europe/Paris", SPLATOON_SETTINGS: "" },
  },
});
