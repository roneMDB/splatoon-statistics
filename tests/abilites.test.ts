import { describe, expect, test } from "vitest";
import { libelleDeLaCapacite } from "../src/abilites.fr.ts";

describe("libelleDeLaCapacite", () => {
  test("traduit les capacites les plus courantes", () => {
    expect(libelleDeLaCapacite("special_charge_up")).toBe("Jauge spéciale +");
    expect(libelleDeLaCapacite("swim_speed_up")).toBe("Turbo-calamar");
    expect(libelleDeLaCapacite("quick_respawn")).toBe("Sans temps morts");
  });

  test("ne confond pas les capacites que leur acronyme rend homonymes", () => {
    // « Special Power Up » et « Sub Power Up » donnent tous deux SPU ;
    // « Ink Recovery Up » et « Ink Resistance Up » tous deux IRU. Une jointure
    // automatique traduisait l'une par l'autre sans rien signaler.
    expect(libelleDeLaCapacite("special_power_up")).toBe("Arme spéciale +");
    expect(libelleDeLaCapacite("sub_power_up")).toBe("Arme secondaire +");
    expect(libelleDeLaCapacite("ink_recovery_up")).toBe("Levée d'encre");
    expect(libelleDeLaCapacite("ink_resistance_up")).toBe("Pieds au sec");
  });

  test("retombe sur l'anglais pour une capacite inconnue", () => {
    expect(libelleDeLaCapacite("capacite_future", "Future Ability")).toBe("Future Ability");
  });

  test("survit a une capacite absente", () => {
    expect(libelleDeLaCapacite(undefined)).toBe("—");
  });
});
