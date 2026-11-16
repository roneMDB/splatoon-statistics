# Ouvrir et éteindre l'émulateur depuis l'application

## Pourquoi

Quand la session Nintendo de l'émulateur est perdue (Nintendo Switch App sur
« Sign In »), l'encart orange de la veille demande de taper deux commandes dans
WSL : `~/Android/boot-window.sh`, puis l'extinction par adb. L'application peut
les lancer elle-même.

## Ce que voit l'utilisateur

Dans l'encart d'alerte de STU, et seulement là, les commandes à copier sont
remplacées par **un bouton** dont le libellé dépend de la situation :

| Situation | Bouton |
|---|---|
| Pas de SDK Android (`~/Android/env.sh` absent) | aucun : la procédure écrite reste affichée |
| Veille en cours, ou verrou `/tmp/s3s-upload.lock` tenu (cron) | « Ouvrir l'émulateur » grisé, avec « Arrêter la veille d'abord » ou « Une synchro du cron est en cours » |
| Émulateur éteint (`adb devices` sans `emulator-*`) | « Ouvrir l'émulateur » |
| Ouverture en cours | « Démarrage… » grisé, jusqu'à ce qu'`adb devices` liste l'émulateur |
| Émulateur allumé | « Éteindre l'émulateur » |
| Extinction en cours | « Extinction… » grisé, jusqu'à ce qu'`adb devices` ne liste plus l'émulateur |

Le texte de l'encart devient : 1. arrêter la veille ; 2. ouvrir l'émulateur et se
reconnecter dans la Nintendo Switch App ; 3. éteindre l'émulateur par le bouton
(ne pas fermer sa fenêtre) ; 4. relancer la veille. Le rappel du cron de la
minute 0 reste en texte, sans garde.

Un émulateur allumé que l'application n'a pas ouvert (celui de STU) affiche
aussi « Éteindre l'émulateur » : l'éteindre proprement est sans risque, et c'est
le seul moyen d'en obtenir un avec fenêtre. Le bouton reste grisé tant que la
veille ou le cron tourne, pour ne pas couper STU en plein travail.

## Fermer l'application

Si l'émulateur **ouvert par l'application** est encore allumé, la fermeture
l'éteint proprement avant de quitter, comme elle envoie déjà un Ctrl+C à la
veille (`before-quit` dans `main.ts`). Elle attend la fin de l'extinction,
30 secondes au plus, puis quitte quoi qu'il arrive. Un émulateur que
l'application n'a pas ouvert n'est jamais touché à la fermeture.

## Commandes

Toutes passent par `commandeSysteme` (`bash -lc` sous Linux, `wsl.exe -e bash -lc`
sous Windows), comme la veille. Chacune commence par `source ~/Android/env.sh`.

- **État** : un seul script rend une ligne parmi `absent` (pas de `env.sh`),
  `verrou` (`flock -n /tmp/s3s-upload.lock true` échoue), `allume`, `eteint`.
- **Ouverture** : `setsid -f ~/Android/boot-window.sh > journal 2>&1`, détaché,
  pour que la mort de `wsl.exe` ne coupe pas l'émulateur ; le journal va dans
  `/tmp/splatoon-statistics-emulateur.log`. L'application retient qu'elle l'a
  ouvert (en mémoire, le temps de la session).
- **Extinction** : `adb shell sync && adb shell reboot -p`. Fermer la fenêtre
  enregistrerait un instantané rapide au lieu d'éteindre Android, et STU, qui
  démarre à froid, retrouverait la Switch App déconnectée.

Le suivi (« Démarrage… », « Extinction… ») relit l'état toutes les 2 secondes,
2 minutes au plus ; au-delà, le bouton revient à l'état lu et le journal de
l'émulateur est signalé.

## Découpage

- `src/emulateur.ts` (pur, sans Electron) : les scripts bash, la lecture de la
  ligne d'état, et la fonction qui donne le bouton (libellé, actif, action) à
  partir de l'état, du statut de la veille et de l'opération en cours.
- `src/electron/emulateurHandler.ts` : lance les scripts par un lanceur passé en
  argument (même modèle que `veilleHandler.ts`), suit l'ouverture et
  l'extinction, expose `etat`, `ouvre`, `eteint`, `eteintSiOuvertParNous`.
- IPC : `emulateurEtat`, `emulateurOuvre`, `emulateurEteint`, et un canal de
  progression ; `preload.cts` et `ipcChannels.ts` à l'avenant.
- Rendu : le bouton dans `#veille-alerte` (`index.html`, `veille.js`).
- `main.ts` : l'extinction dans `before-quit`, après l'arrêt de la veille.
- README : la procédure « La veille tourne en boucle sur les jetons » cite les
  boutons, en gardant les commandes pour qui n'a pas l'application.

## Tests

Vitest sur `src/emulateur.ts` (lecture de l'état, bouton pour chaque ligne du
tableau) et sur `emulateurHandler.ts` avec un faux lanceur : ouverture puis
suivi jusqu'à `allume`, extinction jusqu'à `eteint`, délai dépassé, extinction
à la fermeture seulement si l'application a ouvert l'émulateur. Vérification
réelle de l'application packagée sous Windows, par CDP.
