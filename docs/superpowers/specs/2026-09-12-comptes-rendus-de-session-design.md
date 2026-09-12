# Comptes rendus de session — design

## Le problème

Le projet récupère les matchs d'une session et les stocke en JSON brut. Le compte
rendu qui suit chaque intra est, lui, encore écrit à la main : voir
`exemples-compte-rendu/`. Ces textes sont à la première personne, centrés sur le rôle
tenu, et recomptent les totaux à la main — travail long, et parfois faux
(`intra_1.md` cite un « score cumulé » qui n'existe nulle part dans les données).

L'application doit produire ces comptes rendus depuis le fichier de session, en ne
laissant à l'humain que la part qu'il est seul à connaître : l'objectif qu'il s'était
fixé et son ressenti.

## Contrainte vérifiée

stat.ink ne publie **aucun** libellé français : ni dans les matchs stockés, ni dans
ses référentiels (`/api/v3/rule` et `/api/v3/stage` ne servent que `en_US` et
`ja_JP`). Toute la terminologie FR doit être écrite et maintenue dans le dépôt.

Deux sources la fournissent, sauf pour les médailles :

- les **fichiers de localisation officiels du jeu** (via splatoon3.ink) pour les
  cartes et les modes ;
- **sendou.ink** (`locales/fr-EU`) pour les 172 armes, jointes aux clés stat.ink par
  l'alias numérique que celles-ci portent déjà.

Les deux concordent sur les cartes. Elles ont aussi révélé une inversion : `yagura`
(Tower Control) est l'Expédition Risquée, `hoko` (Rainmaker) la Mission Bazookarpe.

Les **médailles** n'ont aucune source publiée et restent traduites à la main.

## Ce qu'on construit

Quatre sections, cochables indépendamment, assemblées en un seul document Markdown :

| Section | Question à laquelle elle répond |
|---|---|
| Courbe de session | Quand la session a-t-elle basculé ? |
| Bulletin de rôle | Ai-je tenu mon poste, comparé à mes coéquipiers ? |
| Carte des modes | Quel mode nous coûte des manches ? |
| Scouting adverse | À quoi faisait-on face ? |

Rédaction **déterministe** : des règles détectent les faits saillants et remplissent
des gabarits. Pas de LLM — le résultat doit être reproductible et hors-ligne.

Deux champs libres saisis par l'utilisateur (objectif, ressenti) sont intégrés au
document et **persistés dans le fichier de session**.

Sortie : le Markdown s'affiche dans la fiche de session, un bouton le copie dans le
presse-papier pour un collage dans Discord.

## Architecture

Le calcul vit dans le noyau (`src/report/`, TypeScript pur, sans Electron), servi à
la fois par la ligne de commande et par l'application. Seul le Markdown fini traverse
le pont IPC — même raison d'être que `battleRows.ts` : les matchs bruts ne le
franchissent jamais.

    src/report/
      libelles.fr.ts      tables FR ; repli sur l'anglais si une clé manque
      analyse.ts          SessionFile -> AnalyseSession (chiffres, aucune phrase)
      sections/           quatre rédacteurs, AnalyseSession -> string[]
      index.ts            construisLeCompteRendu(file, options) -> string

`analyse.ts` calcule une fois ce dont les quatre sections ont besoin ; aucune section
ne relit `battles`. Cette séparation est ce qui rend les sections testables sur des
analyses construites à la main, sans fabriquer de faux payload stat.ink.

### Deux pièges relevés dans les données réelles

1. **« Moi » se repère par `me: true`**, jamais par `file.user` : le pseudo stat.ink
   (`Gloup`) diffère du nom en jeu (`☆Gloųp☆`).
2. **Les scores changent de type selon le mode** : `our_team_percent` est une chaîne
   en Guerre de Territoire (`"47.3"`), `our_team_count` un nombre dans les modes
   objectif. Chacun vaut `null` dans l'autre cas.

## Règle de rédaction

Une phrase n'est émise que si le fait qu'elle énonce est constaté. Pas de gabarit
rempli de zéros, pas de « session équilibrée » par défaut. Chaque seuil est explicite
et porte un test qui vérifie qu'un fait juste sous le seuil ne produit **rien**.

## Désignation des joueurs

Une seule fonction décide comment nommer quelqu'un : « moi » pour soi, le pseudo pour
les coéquipiers, l'arme dominante pour les adversaires. Les adversaires sont des
camarades de club ; leur pseudo ne doit pas se retrouver accolé à un jugement dans un
message posté sur le Discord commun.

Cela ne les rend pas anonymes — dans une intra à huit, « l'Octobrush » désigne une
personne pour quiconque était là. Ça évite le pseudo à côté du chiffre, rien de plus.

## Hors périmètre

Traduction des noms d'armes · comparaison entre sessions · graphiques · publication
automatique vers Discord · rédaction par un LLM.
