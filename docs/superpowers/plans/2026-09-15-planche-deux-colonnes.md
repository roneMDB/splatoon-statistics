# Planche en deux colonnes, style Encre — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ranger les manches sur deux colonnes à 1600 px de large, et donner à la planche l'allure du jeu — sans toucher à son contenu.

**Architecture:** Tout tient dans `src/report/planche.ts` : la constante de largeur, la feuille de style en ligne, un conteneur en grille autour des cartes, et un numéro de manche sorti du contexte pour devenir un élément à part. Aucune autre partie du dépôt ne change.

**Tech Stack:** TypeScript (ESM, imports en `.ts`), Vitest. Aucune dépendance nouvelle. CSS Grid, et la police **Lato** déjà installée sur la machine.

**Spec :** `docs/superpowers/specs/2026-09-15-planche-deux-colonnes-design.md`

## Global Constraints

- **Aucune dépendance nouvelle**, ni runtime ni développement.
- **Imports avec extension `.ts`**, jamais sans.
- **Commentaires et identifiants en français sans accent** (ASCII) ; les chaînes destinées à l'utilisateur portent leurs accents.
- **La planche ne charge aucune ressource externe** : ni police téléchargée, ni image, ni script, ni feuille de style liée. Pas de `url(`, pas de `@import`. Le test qui l'impose ne doit pas être affaibli.
- **Aucun emoji dans la planche.**
- **Tout ce qui vient de stat.ink passe par `echappe`.**
- **`construisLaPlanche` garde sa signature `(file: SessionFile) => string`, sa pureté et son déterminisme.**
- **Le contenu ne change pas** : mêmes joueurs, mêmes armes dans les deux langues, mêmes points d'encre, mêmes médailles, même ordre.
- `npm test` et `npm run typecheck` doivent passer à la fin de chaque tâche.
- **`HAUTEUR_MAXIMALE_PLANCHE` reste a 16 000 px.** Avec deux colonnes il faudrait environ 95 manches pour l'atteindre, contre une cinquantaine avant : le garde-fou protege desormais contre un cas franchement absurde. Ce n'est pas une raison de le retirer, ni de le retoucher.
- **Hors perimetre, a ne pas ajouter** : taches d'encre, formes coupees en biais, rotation des cartes, troisieme colonne, theme clair, retrait d'information pour gagner de la place. Le style vient de la couleur et de la typographie ; le reste attendra d'etre demande.
- Chaque commit se termine par `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

## Une règle héritée, qui gouverne tout test sur la planche

La feuille de style est **en ligne dans le document rendu**. Une assertion qui cherche une sous-chaîne dans tout le HTML peut donc trouver sa preuve dans le CSS et passer sur du code faux. Ce piège s'est manifesté **quatre fois** dans le chantier précédent, dont une fois sur des codes couleur (`#171922` contient « #1 »).

**La règle :** une assertion sur la planche porte sur une sous-chaîne qui ne peut pas exister dans une feuille de style — typiquement `class="..."` avec ses guillemets — ou sur une position située **après `</style>`**.

Deux exceptions légitimes, déjà en place, à ne pas toucher : le test « rend un document HTML complet » (qui vise `width: …px` dans `body`) et le test « ne charge aucune ressource externe » (dont tout l'intérêt est de surveiller le CSS).

## Structure des fichiers

| Fichier | Nature du changement |
|---|---|
| `src/report/planche.ts` | `LARGEUR_PLANCHE` 1080 → 1600 ; feuille de style remplacée ; conteneur `<main class="planche__grille">` ; numéro de manche dans son propre `<span>` |
| `tests/report/planche.test.ts` | ajustement du test de largeur, ré-ancrage du test d'ordre, un test neuf pour la grille |
| `README.md` | la ligne qui décrit la planche, si elle mentionne ses dimensions |

---

### Task 1: Deux colonnes

Le gain de hauteur, et lui seul. Aucun changement de couleur ni de typographie : ce découpage permet à une revue de juger la disposition sans être distraite par le style.

**Files:**
- Modify: `src/report/planche.ts`
- Modify: `tests/report/planche.test.ts`

**Interfaces:**
- Consumes: rien de nouveau.
- Produces: `LARGEUR_PLANCHE = 1600` ; un conteneur `<main class="planche__grille">` enveloppe toutes les cartes.

- [ ] **Step 1: Écrire les tests qui échouent**

Dans `tests/report/planche.test.ts`, ajouter ce test à la suite de « rend une carte par manche, dans l'ordre de jeu » :

```typescript
  test("range les manches dans une grille a deux colonnes", () => {
    const html = construisLaPlanche(session([battle("a", "win"), battle("b", "lose")]));

    // Le conteneur existe et enveloppe les cartes : sans lui, la grille CSS
    // n'a pas de parent sur qui s'appliquer.
    expect(html).toContain('<main class="planche__grille">');
    expect(html).toContain("</main>");

    const grille = html.split('<main class="planche__grille">')[1]?.split("</main>")[0] ?? "";
    expect(grille.match(/class="manche manche--/g)).toHaveLength(2);

    // Deux colonnes, declarees sur le conteneur et non sur le corps.
    expect(html).toMatch(/\.planche__grille\s*\{[^}]*grid-template-columns:\s*1fr 1fr/);
  });
```

Le test existant « rend un document HTML complet » compare déjà à `LARGEUR_PLANCHE`, donc il suivra la constante sans retouche. **Ne le modifie pas.**

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run tests/report/planche.test.ts`
Expected: FAIL — `expected '<!doctype html>…' to contain '<main class="planche__grille">'`

- [ ] **Step 3: Porter la largeur à 1600 et envelopper les cartes**

Dans `src/report/planche.ts`, remplacer la constante et son commentaire :

```typescript
/**
 * Largeur de rendu, en pixels CSS. La capture ouvre sa fenetre a cette
 * largeur : la changer ici la change partout.
 *
 * 1600 et non 1080 depuis le passage a deux colonnes : une planche d'une seule
 * colonne donnait 1080 x 6947 px pour vingt et une manches, un ruban que
 * Discord reduisait a une vignette illisible. A deux colonnes, la meme session
 * tient en 1600 x 3484 - le rapport tombe de 1:6,4 a 1:2,2.
 */
export const LARGEUR_PLANCHE = 1600;
```

Puis, dans `construisLaPlanche`, envelopper les cartes. Remplacer :

```typescript
    "</header>",
    manches,
    "</body>",
```

par :

```typescript
    "</header>",
    '<main class="planche__grille">',
    manches,
    "</main>",
    "</body>",
```

- [ ] **Step 4: Déclarer la grille dans la feuille de style**

Dans la constante `STYLE`, ajouter la règle de grille juste après le bloc `.planche__entete p`, et retirer la marge basse des cartes, que l'écart de grille remplace :

```css
.planche__grille { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: start; }
```

Et dans la règle `.manche`, **supprimer** la ligne `margin-bottom: 14px;` — sans quoi l'écart entre deux lignes de la grille serait compté deux fois.

`align-items: start` compte : sans lui, deux cartes voisines s'étireraient à la hauteur de la plus grande, et une manche sans médaille afficherait un bas vide.

- [ ] **Step 5: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run tests/report/planche.test.ts`
Expected: PASS — tous les tests du fichier, y compris celui de la largeur qui suit désormais 1600.

- [ ] **Step 6: Mesurer le gain sur une vraie session**

```bash
npm run report -- data/sessions/Gloup_20260913-2006_20260913-2343.json --planche
```

Puis vérifier que le document déclare bien la nouvelle largeur et la grille :

```bash
grep -c "grid-template-columns: 1fr 1fr" data/planches/Gloup_20260913-2006_20260913-2343.html
grep -c "width: 1600px" data/planches/Gloup_20260913-2006_20260913-2343.html
rm -f data/planches/Gloup_20260913-2006_20260913-2343.html
```

Expected: `2` puis `1` — la première règle apparaît deux fois (la grille des manches et celle des équipes), la seconde une seule.

**Ne lance pas `npm run app`** : cela ouvre une fenêtre chez l'utilisateur et dégrade son environnement graphique.

- [ ] **Step 7: Lancer toute la suite et le typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/report/planche.ts tests/report/planche.test.ts
git commit -m "feat(planche): range les manches sur deux colonnes

1600 px de large au lieu de 1080. Vingt et une manches tiennent en
1600x3484 au lieu de 1080x6947 : le rapport passe de 1:6,4 a 1:2,2,
soit une vignette Discord lisible au lieu d un ruban vertical.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Le style Encre

L'allure. Le numéro de manche sort du contexte pour devenir un élément à part — c'est lui qui donne le rythme à la grille — et la feuille de style est remplacée.

**Files:**
- Modify: `src/report/planche.ts`
- Modify: `tests/report/planche.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `LARGEUR_PLANCHE = 1600` et `<main class="planche__grille">` (Task 1).
- Produces: le bandeau d'une manche rend désormais trois éléments dans cet ordre exact :
  `<span class="manche__numero">N</span><span class="manche__resultat">Libellé</span><span class="manche__contexte">heure · mode · …</span>`

- [ ] **Step 1: Ré-ancrer le test de l'ordre de jeu**

Ce test a une histoire : il a fallu **quatre reprises** pour qu'il prouve enfin ce qu'il annonce. Il s'ancre aujourd'hui sur `class="manche__contexte">#3 · 21:33`, et le numéro quitte le contexte — l'ancre disparaît donc.

Dans `tests/report/planche.test.ts`, remplacer la fonction `position` du test « rend une carte par manche, dans l'ordre de jeu » :

```typescript
    const position = (numero: number, uuid: string) =>
      corps.indexOf(`class="manche__contexte">#${numero} · ${heureAttendue(uuid)}`);
```

par :

```typescript
    // Le numero est toujours croissant par construction (il vaut index+1) :
    // seul ne prouve rien. Ce qui compte, c'est que le numero N porte l'heure
    // de LA manche N. On ancre donc sur le bandeau entier, du numero jusqu'a
    // l'heure — une sequence que la feuille de style ne peut pas contenir.
    const position = (numero: number, uuid: string, libelle: string) =>
      corps.indexOf(
        `class="manche__numero">${numero}</span>` +
          `<span class="manche__resultat">${libelle}</span>` +
          `<span class="manche__contexte">${heureAttendue(uuid)}`,
      );
```

Et adapter les trois appels, la fixture donnant `win, lose, win` :

```typescript
    const p1 = position(1, "a", "Victoire");
    const p2 = position(2, "b", "Défaite");
    const p3 = position(3, "c", "Victoire");
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run tests/report/planche.test.ts -t "ordre de jeu"`
Expected: FAIL — `expected -1 to be greater than or equal to 0` : l'ancre ne correspond à rien tant que le bandeau n'a pas été découpé.

- [ ] **Step 3: Sortir le numéro du contexte**

Dans `src/report/planche.ts`, remplacer `mancheEnHtml` :

```typescript
/**
 * Une carte de manche.
 *
 * « Nous » passe toujours en premier, meme quand on perd : le jeu place
 * l'equipe victorieuse en haut, mais ici la constance de lecture d'une carte a
 * l'autre vaut mieux que la mimique.
 *
 * Le numero a son propre element, hors du contexte : a deux colonnes, c'est
 * lui qui donne le rythme a la grille et permet de retrouver une manche sans
 * compter les cartes.
 */
function mancheEnHtml(detail: BattleDetail, numero: number): string {
  const contexte = [
    heureDe(detail.startedAt),
    detail.rule,
    detail.stage,
    scoreDe(detail),
    detail.ko ? "KO" : undefined,
    duree(detail.dureeSecondes),
  ].filter((part): part is string => part !== undefined);

  const medailles =
    detail.medailles.length === 0
      ? ""
      : `<p class="manche__medailles">${echappe(detail.medailles.join(" · "))}</p>`;

  return (
    `<article class="manche manche--${echappe(detail.result ?? "inconnu")}">` +
    `<div class="manche__bandeau">` +
    `<span class="manche__numero">${numero}</span>` +
    `<span class="manche__resultat">${echappe(detail.resultLabel ?? "—")}</span>` +
    `<span class="manche__contexte">${echappe(contexte.join(" · "))}</span>` +
    `</div>` +
    `<div class="manche__equipes">` +
    equipeEnHtml("Nous", detail.nous) +
    equipeEnHtml("Eux", detail.eux) +
    `</div>` +
    medailles +
    `</article>`
  );
}
```

`numero` est un nombre produit par le code, jamais une donnée de stat.ink : il n'a pas besoin d'`echappe`.

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run tests/report/planche.test.ts -t "ordre de jeu"`
Expected: PASS

- [ ] **Step 5: Prouver que le test rattrape une inversion**

Ce test ne vaut que s'il échoue quand l'ordre est faux. Le vérifier pour de bon.

Dans `construisLaPlanche`, remplacer temporairement :

```typescript
  const manches = file.battles
```

par :

```typescript
  const manches = [...file.battles].reverse()
```

Run: `npx vitest run tests/report/planche.test.ts -t "ordre de jeu"`
Expected: **FAIL**. Si le test passe malgré l'inversion, il ne prouve rien : reprendre l'ancre avant d'aller plus loin.

Puis remettre `file.battles` et relancer :

Run: `npx vitest run tests/report/planche.test.ts -t "ordre de jeu"`
Expected: PASS

Rapporter dans le rapport de tâche ce que l'inversion a produit.

- [ ] **Step 6: Remplacer la feuille de style**

Dans `src/report/planche.ts`, remplacer **entièrement** la constante `STYLE` par celle-ci. Le commentaire qui la précède est également remplacé :

```typescript
/**
 * Feuille de style, en ligne.
 *
 * Pile de polices choisie pour couvrir le cyrillique, le grec, le japonais et
 * les symboles que les pseudos Splatoon contiennent regulierement (`к? Reby`,
 * `Sひ freebox`, `☆Gloup☆`) : sans cela, ce sont des tofus. Aucune n'est
 * telechargee. Lato ouvre la pile pour ses graisses Black et Heavy, qui
 * portent les titres ; DejaVu Sans assure la couverture derriere elle.
 *
 * Les polices officielles du jeu sont hors d'atteinte : la planche ne charge
 * aucune ressource externe, et cette regle ne se negocie pas pour un effet de
 * style. L'allure vient donc de la couleur et de la typographie disponible.
 *
 * Aucun emoji : leur rendu hors ecran depend d'une police d'emoji installee,
 * ce qui n'est pas acquis. Victoire et defaite passent par la couleur du
 * bandeau et par le mot.
 */
const STYLE = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  width: ${LARGEUR_PLANCHE}px;
  padding: 28px;
  background: #0e0f18;
  color: #f2f3fa;
  font-family: "Lato", "DejaVu Sans", "Noto Sans", "Liberation Sans", Arial, sans-serif;
  font-size: 15px;
  line-height: 1.35;
}
.planche__entete { margin-bottom: 22px; padding-left: 6px; }
.planche__entete h1 {
  font-family: "Lato Black", "Lato", "DejaVu Sans", sans-serif;
  font-weight: 900;
  font-style: italic;
  font-size: 40px;
  text-transform: uppercase;
  letter-spacing: -0.01em;
  color: #eaff3d;
}
.planche__entete p {
  margin-top: 2px;
  font-size: 17px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #9aa0bb;
}
.planche__grille { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: start; }
.manche { border-radius: 4px; overflow: hidden; background: #1a1c2b; }
.manche__bandeau {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 14px 8px 10px;
  background: #4a4d63;
}
.manche--win .manche__bandeau { background: linear-gradient(100deg, #19d719 0%, #12a512 100%); }
.manche--lose .manche__bandeau { background: linear-gradient(100deg, #f02d7d 0%, #c01e63 100%); }
.manche__numero {
  font-family: "Lato Black", "Lato", "DejaVu Sans", sans-serif;
  font-weight: 900;
  font-style: italic;
  font-size: 26px;
  line-height: 1;
  min-width: 34px;
  text-align: center;
  color: #0e0f18;
}
.manche__resultat {
  font-family: "Lato Black", "Lato", "DejaVu Sans", sans-serif;
  font-weight: 900;
  font-style: italic;
  font-size: 16px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
  color: #0e0f18;
}
.manche__contexte {
  margin-left: auto;
  font-size: 12px;
  font-weight: 700;
  text-align: right;
  color: #0e0f18;
  opacity: 0.82;
}
.manche__equipes { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: #0e0f18; }
.equipe { padding: 10px 12px; background: #1a1c2b; }
.equipe__titre {
  margin-bottom: 6px;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #6f7699;
}
.joueur {
  display: grid;
  grid-template-columns: 1fr auto;
  padding: 4px 7px;
  border-radius: 5px;
}
.joueur + .joueur { margin-top: 2px; }
.joueur--moi { background: #2e3352; box-shadow: inset 3px 0 0 #eaff3d; }
.joueur__nom { font-weight: 700; }
.joueur__chiffres { color: #c9cee6; font-variant-numeric: tabular-nums; white-space: nowrap; }
.joueur__arme { grid-column: 1 / -1; font-size: 11px; color: #7d84a8; }
.manche__medailles {
  padding: 7px 14px;
  border-top: 1px solid #0e0f18;
  font-size: 11px;
  font-weight: 700;
  color: #eaff3d;
}
`.trim();
```

Le bandeau gris `#4a4d63` reste la valeur par défaut : il sert aux résultats « match nul » et « inconnu », que ni `manche--win` ni `manche--lose` ne couvrent.

- [ ] **Step 7: Lancer toute la suite et le typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS

En particulier, ces tests doivent passer **sans avoir été retouchés** : « ne charge aucune ressource externe » (le dégradé emploie `linear-gradient`, pas `url(`), « echappe ce qui vient de stat.ink », « est deterministe », « nomme les huit joueurs », « marque ma ligne, et elle seule », « porte les medailles ». Si l'un tombe, c'est la refonte qui a changé un comportement : corriger la refonte, pas le test.

- [ ] **Step 8: Regarder le résultat**

Produire une vraie planche et vérifier ce qui se vérifie par programme :

```bash
npm run report -- data/sessions/Gloup_20260911-2000_20260911-2301.json --planche
grep -c "eaff3d" data/planches/Gloup_20260911-2000_20260911-2301.html
grep -c 'class="manche__numero"' data/planches/Gloup_20260911-2000_20260911-2301.html
grep -c "url(\|@import\|<script\|<img\|<link" data/planches/Gloup_20260911-2000_20260911-2301.html
```

Expected: le jaune apparaît plusieurs fois, `manche__numero` exactement **13** fois (une par manche), et la dernière commande rend **0**.

Puis supprimer le fichier produit : `rm -f data/planches/Gloup_20260911-2000_20260911-2301.html`

**Tu ne peux pas juger l'apparence** — tu n'as pas d'écran. Ne prétends pas l'avoir regardée ; dis dans ton rapport que la vérification visuelle revient au contrôleur. **Ne lance pas `npm run app`.**

- [ ] **Step 9: Mettre le README à jour**

La section « La planche de manches » du README décrit les manches comme **empilées**, ce qui cesse d'être vrai. Remplacer :

```markdown
**Fabriquer la planche** rend une image unique — toutes les manches de la session
empilées, les huit joueurs de chacune avec leur arme, leurs chiffres et les
médailles. C'est ce que la session se postait autrefois en captures d'écran,
une par manche.
```

par :

```markdown
**Fabriquer la planche** rend une image unique — toutes les manches de la session
rangées sur deux colonnes, les huit joueurs de chacune avec leur arme, leurs
chiffres et les médailles. C'est ce que la session se postait autrefois en
captures d'écran, une par manche.
```

Ne rien ajouter d'autre : pas de section neuve, pas de description du style, pas de chiffres de dimensions qui se périmeraient au prochain ajustement.

- [ ] **Step 10: Lancer toute la suite et le typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add src/report/planche.ts tests/report/planche.test.ts README.md
git commit -m "feat(planche): style Encre, aux couleurs du jeu

Titre en Lato Black italique jaune acide, bandeaux de verdict en degrade
vert et rose satures, numero de manche en gros italique qui donne le
rythme a la grille, liseré jaune sur ma ligne.

Le numero sort du contexte pour avoir son propre element. Le test de
l ordre de jeu est reancre en consequence, et sa preuve refaite :
inverser les manches le fait bien echouer.

Aucune police telechargee : Lato est deja installee, et la pile retombe
sur DejaVu Sans.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Vérification finale

- [ ] `npm test` — tout vert
- [ ] `npm run typecheck` — aucune erreur
- [ ] `npm run app:build` — aucune erreur
- [ ] Le contrôleur rend une planche réelle et la regarde : deux colonnes, titre jaune, bandeaux vifs, numéros lisibles, aucun tofu dans les pseudos, rien qui déborde
- [ ] Les dimensions annoncées correspondent au PNG produit
