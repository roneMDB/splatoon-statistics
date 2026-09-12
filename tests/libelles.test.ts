import { describe, expect, test } from "vitest";
import {
  libelleDeLArme,
  libelleDeLaMedaille,
  libelleDuMode,
  libelleDuStage,
  nomDeLArme,
} from "../src/libelles.fr.ts";

describe("libelleDuMode", () => {
  test("traduit les cinq modes du jeu", () => {
    expect(libelleDuMode("nawabari")).toBe("Guerre de Territoire");
    expect(libelleDuMode("area")).toBe("Défense de Zone");
    expect(libelleDuMode("asari")).toBe("Pluie de Palourdes");
  });

  test("ne confond pas les deux modes a objectif mobile", () => {
    // Piege verifie contre les fichiers de localisation du jeu : « yagura » est
    // la tour (Tower Control) et « hoko » le porteur de bazooka (Rainmaker).
    // Les intervertir passerait inapercu a la lecture d'un compte rendu.
    expect(libelleDuMode("yagura", "Tower Control")).toBe("Expédition Risquée");
    expect(libelleDuMode("hoko", "Rainmaker")).toBe("Mission Bazookarpe");
  });

  test("retombe sur l'anglais du payload quand la cle est inconnue", () => {
    expect(libelleDuMode("mode_futur", "Future Mode")).toBe("Future Mode");
  });

  test("retombe sur la cle quand meme l'anglais manque", () => {
    expect(libelleDuMode("mode_futur")).toBe("mode_futur");
  });

  test("survit a un mode absent du match", () => {
    expect(libelleDuMode(undefined)).toBe("mode inconnu");
  });
});

describe("libelleDuStage", () => {
  test("traduit les stages des sessions du depot", () => {
    expect(libelleDuStage("masaba")).toBe("Pont Esturgeon");
    expect(libelleDuStage("yagara")).toBe("Marché Grefin");
    expect(libelleDuStage("zatou")).toBe("Supermarché Cétacé");
    expect(libelleDuStage("kombu")).toBe("Piste Méroule");
    expect(libelleDuStage("nampla")).toBe("Ruines Uma'mi");
  });

  test("distingue les deux stages que leur nom anglais fait confondre", () => {
    // Sturgeon Shipyard et Shipshape Cargo Co. evoquent tous deux un chantier
    // naval : ce sont pourtant deux cartes distinctes.
    expect(libelleDuStage("chozame")).toBe("Chantier Narval");
    expect(libelleDuStage("ohyo")).toBe("Chaland Flétan");
  });

  test("retombe sur l'anglais du payload pour une carte pas encore traduite", () => {
    expect(libelleDuStage("grand_arena", "Grand Splatlands Bowl")).toBe(
      "Grand Splatlands Bowl",
    );
  });
});

describe("libelleDeLaMedaille", () => {
  test("rend le libelle officiel du jeu", () => {
    expect(libelleDeLaMedaille("#1 Splat Assister")).toBe("№ 1 du coup de main");
    expect(libelleDeLaMedaille("#2 Turf Inker")).toBe("№ 2 en encrage de territoire");
  });

  test("place le rang ou le francais le place, pas systematiquement en tete", () => {
    // C'est pourquoi la table porte le libelle entier : separer le rang du
    // corps aurait produit « № 1 cible privilégiée », qui n'existe pas.
    expect(libelleDeLaMedaille("#1 Popular Target")).toBe("Cible privilégiée № 1");
    expect(libelleDeLaMedaille("#2 Popular Target")).toBe("Cible privilégiée № 2");
  });

  test("traduit les medailles qui n'ont pas de rang", () => {
    expect(libelleDeLaMedaille("First Splat!")).toBe("Prix de la 1re victime");
    expect(libelleDeLaMedaille("Record-Score Setter")).toBe("Pro du record de progression");
  });

  test("rend telle quelle une medaille inconnue plutot que de la perdre", () => {
    expect(libelleDeLaMedaille("#1 Future Medal")).toBe("#1 Future Medal");
    expect(libelleDeLaMedaille("Quelque chose")).toBe("Quelque chose");
  });

  test("couvre les medailles rencontrees dans les sessions du depot", () => {
    for (const medaille of [
      "#1 Checkpoint Breaker", "#1 Clam Carrier", "#1 Ground Traveler",
      "#1 Ink Consumer", "#1 Popular Target", "#1 Rainmaker Carrier",
      "#1 Score Booster", "#1 Splat Assister", "#1 Splat Zone Guard",
      "#1 Splat Zone Inker", "#1 Super Jump Spot", "#1 Tacticooler User",
      "#1 Turf Inker", "#2 Home-Base Inker", "#2 Splat Assister",
      "#2 Super Jump Spot", "#2 Turf Inker", "First Splat!", "Record-Score Setter",
    ]) {
      expect(libelleDeLaMedaille(medaille), `« ${medaille} » n'est pas traduite`).not.toBe(
        medaille,
      );
    }
  });
});

describe("nomDeLArme", () => {
  test("traduit une arme connue", () => {
    expect(nomDeLArme("nzap85", "N-ZAP '85")).toBe("N-ZAP 85");
    expect(nomDeLArme("sshooter", "Splattershot")).toBe("Liquidateur");
  });

  test("retombe sur l'anglais pour une arme pas encore traduite", () => {
    expect(nomDeLArme("arme_future", "Future Weapon")).toBe("Future Weapon");
  });
});

describe("libelleDeLArme", () => {
  test("met l'anglais entre parentheses", () => {
    expect(libelleDeLArme("Liquidateur", "Splattershot")).toBe("Liquidateur (Splattershot)");
  });

  test("n'ecrit qu'un nom quand les deux langues coincident", () => {
    expect(libelleDeLArme("Nautilus 47", "Nautilus 47")).toBe("Nautilus 47");
  });

  test("n'ecrit qu'un nom quand l'anglais est absent", () => {
    expect(libelleDeLArme("Liquidateur")).toBe("Liquidateur");
  });

  test("evite deux parentheses accolees sur les armes en « (réplique) »", () => {
    expect(libelleDeLArme("Fusil d'Ordre (réplique)", "Order Charger Replica")).toBe(
      "Fusil d'Ordre (réplique) — Order Charger Replica",
    );
  });
});
