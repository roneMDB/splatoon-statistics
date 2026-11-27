#!/usr/bin/env python3
"""Pilote de s3s pour la veille de splatoon-statistics.

    python s3s_pilote.py /chemin/vers/s3s.py [arguments de s3s]

Lance s3s tel quel (meme sortie, memes codes retour : le cron n'y voit pas de
difference), et y ajoute deux choses :

1. **Des evenements JSON**, une ligne chacun, prefixee par `MARQUE`, quand
   `SPLATOON_VEILLE_EVENEMENTS=1` (pose par l'application). L'application lit
   ces lignes au lieu du texte de s3s : plus d'expressions regulieres sur des
   messages ecrits pour un humain, et des donnees que le texte n'a pas (debut
   et fin du match, cle de la regle, numero du stage). Sans la variable, rien
   n'est emis : `cron.log` reste tel quel.

2. **La verification immediate** : en veille (`-M 60`), s3s attend sa minute
   seconde par seconde (`time.sleep(1)` dans `monitor_battles`). SIGUSR1 recu
   pendant ce decompte en saute les secondes restantes. C'est ce qu'envoie le
   bouton « Vérifier maintenant ».

s3s est importe comme module, puis certaines de ses fonctions sont enrobees :
rien n'est modifie dans son depot, `git pull` y reste possible. Les fonctions
visees (`check_if_missing`, `check_for_new_results`, `gen_new_tokens`,
`monitor_battles`, et `requests.post` vers l'API de stat.ink) sont celles de
s3s 0.7 ; si l'une disparait, le pilote la laisse et s3s tourne quand meme.

Lance par `~/repositories/s3s/stu-run.py`, qui le glisse entre Python et
`s3s.py` dans la commande de `run_s3s.py`.
"""

import importlib.util
import json
import os
import signal
import sys
import time

#: Debut des lignes d'evenement. Les autres lignes sont la sortie de s3s.
MARQUE = "@@splatoon-veille "

#: Version du contrat. L'application la lit dans l'evenement `pilote`.
VERSION = 1

#: Ecart toléré par s3s entre la creation chez stat.ink et maintenant, en
#: secondes, pour dire « déjà envoyée » (voir `post_result`).
TOLERANCE_DEJA = 7

#: Taille maximale du message d'erreur de stat.ink recopie dans l'evenement.
TAILLE_MESSAGE = 300

_dors = time.sleep


class Pilote:
    """L'etat du pilote, et ce qu'il emet. Separe du module pour les tests."""

    def __init__(self, sortie=None, actif=None, horloge=time.time):
        self.sortie = sortie if sortie is not None else sys.stdout
        self.actif = os.environ.get("SPLATOON_VEILLE_EVENEMENTS") == "1" if actif is None else actif
        self.horloge = horloge
        #: Vrai pendant une seconde du decompte de la veille.
        self.en_decompte = False
        #: Vrai de la reception de SIGUSR1 jusqu'a la fin du decompte en cours.
        self.verification_demandee = False
        #: Vrai apres un Ctrl+C : la verification suivante est la finale.
        self.arret_demande = False

    def emets(self, evenement):
        if not self.actif:
            return
        # Le saut de ligne d'abord : s3s laisse son decompte sans fin de ligne.
        self.sortie.write("\n" + MARQUE + json.dumps(evenement, ensure_ascii=False, separators=(",", ":")) + "\n")
        self.sortie.flush()

    # --- Signaux ---

    def sur_sigusr1(self, signum, frame):
        if self.en_decompte:
            self.verification_demandee = True

    def sur_sigint(self, signum, frame):
        # Le comportement par defaut de Python, plus la memoire de l'arret.
        self.arret_demande = True
        raise KeyboardInterrupt

    # --- Decompte ---

    def dors(self, secondes, appelant=None):
        """`time.sleep`, qui suit le decompte de la veille et sait l'ecourter."""
        appelant = appelant if appelant is not None else sys._getframe(1)
        if appelant.f_code.co_name != "monitor_battles":
            return _dors(secondes)
        # `i` : la seconde du decompte, de `secs` a 0. A 0 la verification suit.
        reste = appelant.f_locals.get("i", 0)
        if self.verification_demandee:
            if reste == 0:
                self.verification_demandee = False
            return None
        self.emets({"type": "decompte", "secondes": reste})
        self.en_decompte = True
        try:
            # Le signal interrompt l'attente, puis Python la reprend pour le
            # temps restant (PEP 475) : au plus une seconde avant d'agir.
            return _dors(secondes)
        finally:
            self.en_decompte = False

    # --- Envois a stat.ink ---

    def resume_de_la_charge(self, nature, charge):
        """Ce que l'application garde d'une partie, tire de ce que s3s envoie."""
        resume = {"nature": nature}
        if not isinstance(charge, dict):
            return resume
        for cle, nom in (("uuid", "id"), ("start_at", "debut"), ("end_at", "fin")):
            if charge.get(cle) is not None:
                resume[nom] = charge[cle]
        if nature == "battle":
            for cle, nom in (("rule", "regle"), ("lobby", "lobby"), ("result", "resultat")):
                if charge.get(cle) is not None:
                    resume[nom] = charge[cle]
            if charge.get("stage") is not None:
                resume["stage"] = str(charge["stage"])
            if charge.get("knockout") is not None:
                resume["ko"] = charge["knockout"] == "yes"
        else:
            # Salmon Run : reussi si toutes les vagues sont passees, ce que s3s
            # note par l'absence de `fail_reason`.
            if "clear_waves" in charge:
                resume["resultat"] = "clear" if charge.get("clear_waves") is not None and "fail_reason" not in charge else "fail"
        return resume

    def issue_de_la_reponse(self, reponse):
        """Le statut de l'envoi, avec la meme regle que `post_result`."""
        if reponse.status_code != 201:
            texte = ""
            try:
                texte = reponse.content.decode("utf-8", "replace")
            except Exception:
                pass
            return {"statut": "echec", "code": reponse.status_code, "message": texte[:TAILLE_MESSAGE]}
        issue = {"statut": "envoyee"}
        url = reponse.headers.get("location")
        if url:
            issue["url"] = url
        try:
            cree = json.loads(reponse.text)["created_at"]["time"]
        except Exception:
            cree = None
        if cree is not None and cree <= self.horloge() - TOLERANCE_DEJA:
            issue["statut"] = "deja"
        return issue

    def enrobe_le_post(self, post, unpack):
        """`requests.post`, qui annonce chaque envoi a stat.ink, puis son issue."""

        def poste(url, *args, **kwargs):
            nature = None
            if isinstance(url, str) and url.startswith("https://stat.ink/api/v3/"):
                if url.endswith("/battle"):
                    nature = "battle"
                elif url.endswith("/salmon"):
                    nature = "job"
            if nature is None:
                return post(url, *args, **kwargs)
            try:
                charge = unpack(kwargs.get("data"))
            except Exception:
                charge = None
            if isinstance(charge, dict) and charge.get("test") == "yes":
                return post(url, *args, **kwargs)
            resume = self.resume_de_la_charge(nature, charge)
            self.emets({"type": "partie", "statut": "envoi", **resume})
            try:
                reponse = post(url, *args, **kwargs)
            except Exception as erreur:
                self.emets({"type": "partie", "statut": "echec", "message": str(erreur)[:TAILLE_MESSAGE], **resume})
                raise
            self.emets({"type": "partie", **resume, **self.issue_de_la_reponse(reponse)})
            return reponse

        return poste

    # --- Branchement sur s3s ---

    def enrobe(self, module, nom, avant):
        """Fait preceder `module.nom` de `avant(*args)`. Sans effet s'il manque."""
        fonction = getattr(module, nom, None)
        if not callable(fonction):
            return

        def enrobee(*args, **kwargs):
            avant(*args, **kwargs)
            return fonction(*args, **kwargs)

        enrobee.__name__ = fonction.__name__
        setattr(module, nom, enrobee)

    def branche(self, s3s):
        self.enrobe(s3s, "check_if_missing", lambda *a, **k: self.emets({"type": "rattrapage"}))
        self.enrobe(
            s3s,
            "check_for_new_results",
            lambda *a, **k: self.emets({"type": "verification", "finale": self.arret_demande}),
        )
        self.enrobe(s3s, "gen_new_tokens", lambda *a, **k: self.emets({"type": "jetons-expires"}))
        requests = getattr(s3s, "requests", None)
        msgpack = getattr(s3s, "msgpack", None)
        if requests is not None and msgpack is not None:
            s3s.requests = _Requetes(requests, self.enrobe_le_post(requests.post, msgpack.unpackb))


class _Requetes:
    """Le module `requests` vu par s3s, dont seul `post` est enrobe."""

    def __init__(self, requests, post):
        self._requests = requests
        self.post = post

    def __getattr__(self, nom):
        return getattr(self._requests, nom)


def charge_s3s(chemin):
    """Importe `s3s.py` sous le nom `s3s`, sans lancer son `main()`."""
    sys.path.insert(0, os.path.dirname(os.path.abspath(chemin)))
    spec = importlib.util.spec_from_file_location("s3s", chemin)
    module = importlib.util.module_from_spec(spec)
    sys.modules["s3s"] = module
    spec.loader.exec_module(module)
    return module


def main(argv):
    if len(argv) < 2:
        print(f"usage : {os.path.basename(argv[0])} /chemin/vers/s3s.py [arguments de s3s]", file=sys.stderr)
        return 2
    chemin = argv[1]
    sys.argv = [chemin] + argv[2:]

    pilote = Pilote()
    time.sleep = pilote.dors
    signal.signal(signal.SIGUSR1, pilote.sur_sigusr1)
    signal.signal(signal.SIGINT, pilote.sur_sigint)

    s3s = charge_s3s(chemin)
    pilote.branche(s3s)
    pilote.emets({"type": "pilote", "version": VERSION})
    s3s.main()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
