import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Les fenetres de temps sont interpretees dans le fuseau local : on le fixe
    // pour que les tests soient deterministes, quelle que soit la machine.
    env: { TZ: "Europe/Paris" },
  },
});
