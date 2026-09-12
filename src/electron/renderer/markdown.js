/**
 * Rendu du Markdown que ce projet produit.
 *
 * Pas une implementation de Markdown : exactement le sous-ensemble que
 * `src/report/` ecrit, et rien d'autre. Titres `##` et `###`, `**gras**`,
 * citations `>`, blocs ``` ```. Une bibliotheque serait de toute facon
 * impossible a charger - la fenetre applique `default-src 'none'`.
 *
 * Deux moities :
 *
 * - `analyseMarkdown` transforme le texte en arbre de blocs. Fonction pure,
 *   testee hors navigateur (`tests/markdown.test.ts`).
 * - `construisLeRendu` construit le DOM depuis cet arbre. Sans logique propre.
 *
 * Le DOM est construit avec `createElement` et `textContent`, **jamais**
 * `innerHTML` : les noms de joueurs viennent de stat.ink et le ressenti est
 * saisi librement ; ni l'un ni l'autre ne doit pouvoir injecter du balisage.
 */

/** `a **b** c` -> segments, en marquant ceux qui sont en gras. */
function segments(ligne) {
  const morceaux = [];
  let reste = ligne;

  while (reste.length > 0) {
    const ouvre = reste.indexOf("**");
    if (ouvre === -1) break;

    const ferme = reste.indexOf("**", ouvre + 2);
    // Un `**` non ferme n'est pas du gras : c'est du texte (« 2 ** 3 »).
    if (ferme === -1) break;

    if (ouvre > 0) morceaux.push({ texte: reste.slice(0, ouvre), gras: false });
    morceaux.push({ texte: reste.slice(ouvre + 2, ferme), gras: true });
    reste = reste.slice(ferme + 2);
  }

  if (reste.length > 0) morceaux.push({ texte: reste, gras: false });
  return morceaux;
}

/**
 * Transforme le Markdown en blocs.
 *
 * Types rendus : `titre` (avec `niveau`), `paragraphe`, `citation` (une entree
 * de `lignes` par ligne citee) et `code` (lignes brutes, non interpretees).
 */
export function analyseMarkdown(texte) {
  const blocs = [];
  const lignes = String(texte ?? "").split("\n");

  let paragraphe = [];
  let citation = [];

  const fermeLeParagraphe = () => {
    if (paragraphe.length > 0) {
      blocs.push({ type: "paragraphe", segments: segments(paragraphe.join("\n")) });
      paragraphe = [];
    }
  };
  const fermeLaCitation = () => {
    if (citation.length > 0) {
      blocs.push({ type: "citation", lignes: citation.map(segments) });
      citation = [];
    }
  };
  const fermeTout = () => {
    fermeLeParagraphe();
    fermeLaCitation();
  };

  for (let index = 0; index < lignes.length; index += 1) {
    const ligne = lignes[index];

    if (ligne.startsWith("```")) {
      fermeTout();
      const contenu = [];
      index += 1;
      // Un bloc laisse ouvert se ferme en fin de texte plutot que de tout avaler.
      while (index < lignes.length && !lignes[index].startsWith("```")) {
        contenu.push(lignes[index]);
        index += 1;
      }
      blocs.push({ type: "code", lignes: contenu });
      continue;
    }

    const titre = /^(#{2,3})\s+(.*)$/.exec(ligne);
    if (titre !== null) {
      fermeTout();
      blocs.push({
        type: "titre",
        niveau: titre[1].length,
        segments: segments(titre[2]),
      });
      continue;
    }

    if (ligne.startsWith("> ") || ligne === ">") {
      fermeLeParagraphe();
      citation.push(ligne.slice(1).replace(/^ /, ""));
      continue;
    }

    if (ligne.trim() === "") {
      fermeTout();
      continue;
    }

    fermeLaCitation();
    paragraphe.push(ligne);
  }

  fermeTout();
  return blocs;
}

/** Ajoute des segments a un element, en texte pur. */
function poseLesSegments(element, morceaux, doc) {
  for (const morceau of morceaux) {
    if (morceau.gras) {
      const fort = doc.createElement("strong");
      fort.textContent = morceau.texte;
      element.append(fort);
    } else {
      element.append(doc.createTextNode(morceau.texte));
    }
  }
}

/** Construit le rendu d'un compte rendu, pret a etre insere dans la page. */
export function construisLeRendu(texte, doc = document) {
  const racine = doc.createElement("div");
  racine.className = "apercu";

  for (const bloc of analyseMarkdown(texte)) {
    if (bloc.type === "titre") {
      const titre = doc.createElement(`h${bloc.niveau === 2 ? "2" : "3"}`);
      titre.className = "apercu__titre";
      poseLesSegments(titre, bloc.segments, doc);
      racine.append(titre);
      continue;
    }

    if (bloc.type === "code") {
      const pre = doc.createElement("pre");
      pre.className = "apercu__code";
      pre.textContent = bloc.lignes.join("\n");
      racine.append(pre);
      continue;
    }

    if (bloc.type === "citation") {
      const citation = doc.createElement("blockquote");
      citation.className = "apercu__citation";
      for (const ligne of bloc.lignes) {
        const paragraphe = doc.createElement("p");
        poseLesSegments(paragraphe, ligne, doc);
        citation.append(paragraphe);
      }
      racine.append(citation);
      continue;
    }

    const paragraphe = doc.createElement("p");
    paragraphe.className = "apercu__paragraphe";
    poseLesSegments(paragraphe, bloc.segments, doc);
    racine.append(paragraphe);
  }

  return racine;
}
