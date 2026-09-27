/**
 * Rend `build/icone.svg` en PNG et en ICO, pour l'application packagee.
 *
 * Script de developpement, lance a la main (`npm run icone`) quand le dessin
 * change. Les fichiers produits sont versionnes : c'est un dessin original, et
 * le packaging ne doit pas dependre d'un rendu fait a la volee.
 *
 * Le rendu passe par Chromium, celui d'Electron, deja installe : aucun outil de
 * rasterisation de plus a demander. Le SVG est dessine dans un `<canvas>` a
 * chaque taille, plutot que photographie par `capturePage` - le dessin 2D ne
 * passe pas par le processus GPU, qui tient mal sous WSLg (voir
 * `src/lanceApp.ts`).
 *
 * L'ICO embarque ses tailles en PNG, ce que Windows lit depuis Vista : le
 * format se reduit alors a un en-tete et a une table d'entrees.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// Cote Node, le paquet "electron" exporte le chemin de son binaire.
import electronPath from "electron";

/** Les tailles que Windows va chercher : barre des taches, explorateur, menu Demarrer. */
const TAILLES = [16, 20, 24, 32, 40, 48, 64, 128, 256] as const;
const SOURCE = "build/icone.svg";

/** Application Electron jetable : dessine le SVG a chaque taille, ecrit les PNG, se ferme. */
const PRINCIPAL = `
const { app, BrowserWindow } = require("electron");
const { writeFileSync } = require("node:fs");
const [svg, sortie, tailles] = process.argv.slice(-3);
app.whenReady().then(async () => {
  const fenetre = new BrowserWindow({ show: false });
  await fenetre.loadURL("about:blank");
  const rendus = await fenetre.webContents.executeJavaScript(\`(async () => {
    const image = new Image();
    image.src = "data:image/svg+xml;base64," + \${JSON.stringify(Buffer.from(require("node:fs").readFileSync(svg)).toString("base64"))};
    await image.decode();
    return \${tailles}.map((taille) => {
      const toile = document.createElement("canvas");
      toile.width = toile.height = taille;
      toile.getContext("2d").drawImage(image, 0, 0, taille, taille);
      return toile.toDataURL("image/png");
    });
  })()\`);
  writeFileSync(sortie, JSON.stringify(rendus));
  app.exit(0);
});
`;

function versIco(pngs: Buffer[], tailles: readonly number[]): Buffer {
  const entete = Buffer.alloc(6);
  entete.writeUInt16LE(0, 0); // reserve
  entete.writeUInt16LE(1, 2); // type : icone
  entete.writeUInt16LE(pngs.length, 4);

  let decalage = 6 + 16 * pngs.length;
  const entrees = pngs.map((png, rang) => {
    const entree = Buffer.alloc(16);
    const taille = tailles[rang] as number;
    // 0 veut dire 256 : le champ ne tient qu'un octet.
    entree.writeUInt8(taille >= 256 ? 0 : taille, 0);
    entree.writeUInt8(taille >= 256 ? 0 : taille, 1);
    entree.writeUInt8(0, 2); // pas de palette
    entree.writeUInt8(0, 3);
    entree.writeUInt16LE(1, 4); // plans
    entree.writeUInt16LE(32, 6); // bits par pixel
    entree.writeUInt32LE(png.length, 8);
    entree.writeUInt32LE(decalage, 12);
    decalage += png.length;
    return entree;
  });

  return Buffer.concat([entete, ...entrees, ...pngs]);
}

function main(): void {
  const dossier = mkdtempSync(join(tmpdir(), "icone-"));
  try {
    writeFileSync(join(dossier, "package.json"), JSON.stringify({ name: "icone", main: "main.cjs" }));
    writeFileSync(join(dossier, "main.cjs"), PRINCIPAL);
    const sortie = join(dossier, "rendus.json");

    const resultat = spawnSync(
      electronPath as unknown as string,
      [dossier, SOURCE, sortie, JSON.stringify(TAILLES)],
      { stdio: ["ignore", "ignore", "inherit"] },
    );
    if (resultat.status !== 0) throw new Error(`Electron a echoue (code ${resultat.status}).`);

    const pngs = (JSON.parse(readFileSync(sortie, "utf8")) as string[]).map((uri) =>
      Buffer.from(uri.slice(uri.indexOf(",") + 1), "base64"),
    );
    writeFileSync("build/icon.png", pngs[pngs.length - 1] as Buffer);
    writeFileSync("build/icon.ico", versIco(pngs, TAILLES));
    console.log(`build/icon.png (256 px) et build/icon.ico (${TAILLES.join(", ")} px).`);
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

main();
