"""Tests du pilote de s3s : `python3 -m unittest discover outils` (ou `npm run test:pilote`).

s3s n'est pas importe : un faux module tient sa place, avec les memes noms.
"""

import io
import json
import types
import unittest

from s3s_pilote import MARQUE, Pilote, decodeur_msgpack


def evenements(sortie):
    return [json.loads(ligne[len(MARQUE):]) for ligne in sortie.getvalue().splitlines() if ligne.startswith(MARQUE)]


class Reponse:
    def __init__(self, status_code, location=None, cree=None, content=b""):
        self.status_code = status_code
        self.headers = {"location": location} if location else {}
        self.text = json.dumps({"created_at": {"time": cree}}) if cree is not None else "{}"
        self.content = content


def pilote(actif=True, maintenant=1_000_000):
    sortie = io.StringIO()
    return Pilote(sortie=sortie, actif=actif, horloge=lambda: maintenant), sortie


CHARGE_MATCH = {
    "uuid": "u-1",
    "lobby": "private",
    "rule": "area",
    "stage": 10,
    "result": "win",
    "knockout": "no",
    "start_at": 999_500,
    "end_at": 999_700,
}


class TestEmission(unittest.TestCase):
    def test_rien_sans_la_variable(self):
        p, sortie = pilote(actif=False)
        p.emets({"type": "pilote"})
        self.assertEqual(sortie.getvalue(), "")

    def test_une_ligne_par_evenement_apres_un_saut_de_ligne(self):
        p, sortie = pilote()
        p.emets({"type": "decompte", "secondes": 3})
        self.assertEqual(sortie.getvalue(), f'\n{MARQUE}{{"type":"decompte","secondes":3}}\n')


class TestEnvoi(unittest.TestCase):
    def poste(self, p, url, charge, reponse):
        appels = []

        def post(url, *args, **kwargs):
            appels.append(url)
            if isinstance(reponse, Exception):
                raise reponse
            return reponse

        enrobe = p.enrobe_le_post(post, lambda data: data)
        return enrobe(url, data=charge), appels

    def test_annonce_puis_issue_d_un_match_envoye(self):
        p, sortie = pilote()
        reponse = Reponse(201, "https://stat.ink/@Gloup/spl3/abc", cree=1_000_000)
        rendue, appels = self.poste(p, "https://stat.ink/api/v3/battle", CHARGE_MATCH, reponse)
        self.assertIs(rendue, reponse)
        self.assertEqual(appels, ["https://stat.ink/api/v3/battle"])
        commun = {
            "type": "partie",
            "nature": "battle",
            "id": "u-1",
            "debut": 999_500,
            "fin": 999_700,
            "regle": "area",
            "lobby": "private",
            "resultat": "win",
            "stage": "10",
            "ko": False,
        }
        self.assertEqual(
            evenements(sortie),
            [
                {**commun, "statut": "envoi"},
                {**commun, "statut": "envoyee", "url": "https://stat.ink/@Gloup/spl3/abc"},
            ],
        )

    def test_deja_envoyee_quand_stat_ink_l_avait_avant(self):
        p, sortie = pilote(maintenant=1_000_000)
        self.poste(p, "https://stat.ink/api/v3/battle", CHARGE_MATCH, Reponse(201, "https://x", cree=999_000))
        self.assertEqual(evenements(sortie)[-1]["statut"], "deja")

    def test_echec_avec_le_message_du_serveur(self):
        p, sortie = pilote()
        self.poste(p, "https://stat.ink/api/v3/battle", CHARGE_MATCH, Reponse(400, content=b'{"error":"nope"}'))
        dernier = evenements(sortie)[-1]
        self.assertEqual((dernier["statut"], dernier["code"], dernier["message"]), ("echec", 400, '{"error":"nope"}'))

    def test_erreur_reseau_annoncee_puis_relancee(self):
        p, sortie = pilote()
        with self.assertRaises(ConnectionError):
            self.poste(p, "https://stat.ink/api/v3/battle", CHARGE_MATCH, ConnectionError("coupé"))
        self.assertEqual(evenements(sortie)[-1]["statut"], "echec")

    def test_salmon_run(self):
        p, sortie = pilote()
        charge = {"uuid": "j-1", "stage": 7, "start_at": 5, "clear_waves": 3}
        self.poste(p, "https://stat.ink/api/v3/salmon", charge, Reponse(201, "https://y", cree=1_000_000))
        self.assertEqual(
            evenements(sortie)[-1],
            {"type": "partie", "nature": "job", "id": "j-1", "debut": 5, "resultat": "clear", "statut": "envoyee", "url": "https://y"},
        )
        p, sortie = pilote()
        self.poste(p, "https://stat.ink/api/v3/salmon", {**charge, "clear_waves": 1, "fail_reason": "wipe_out"}, Reponse(201))
        self.assertEqual(evenements(sortie)[-1]["resultat"], "fail")

    def test_les_autres_requetes_passent_sans_bruit(self):
        p, sortie = pilote()
        _, appels = self.poste(p, "https://api.lp1.av5ja.srv.nintendo.net/api/graphql", {}, Reponse(200))
        self.assertEqual(appels, ["https://api.lp1.av5ja.srv.nintendo.net/api/graphql"])
        self.assertEqual(evenements(sortie), [])

    def test_un_envoi_de_test_ne_compte_pas(self):
        p, sortie = pilote()
        self.poste(p, "https://stat.ink/api/v3/battle", {**CHARGE_MATCH, "test": "yes"}, Reponse(200))
        self.assertEqual(evenements(sortie), [])


class TestBranchement(unittest.TestCase):
    def faux_s3s(self):
        appels = []
        module = types.SimpleNamespace(
            check_if_missing=lambda *a: appels.append("check_if_missing"),
            check_for_new_results=lambda *a: appels.append("check_for_new_results") or "resultat",
            gen_new_tokens=lambda *a: appels.append("gen_new_tokens"),
            requests=types.SimpleNamespace(post=lambda *a, **k: None, get="get d'origine"),
            msgpack=types.SimpleNamespace(unpackb=lambda data, **options: data),
        )
        return module, appels

    def test_annonce_chaque_etape_et_garde_le_comportement(self):
        p, sortie = pilote()
        s3s, appels = self.faux_s3s()
        p.branche(s3s)
        s3s.check_if_missing()
        self.assertEqual(s3s.check_for_new_results(), "resultat")
        p.arret_demande = True
        s3s.check_for_new_results()
        s3s.gen_new_tokens("expiry")
        self.assertEqual(appels, ["check_if_missing", "check_for_new_results", "check_for_new_results", "gen_new_tokens"])
        self.assertEqual(
            evenements(sortie),
            [
                {"type": "rattrapage"},
                {"type": "verification", "finale": False},
                {"type": "verification", "finale": True},
                {"type": "jetons-expires"},
            ],
        )
        # Le reste de `requests` est celui d'origine.
        self.assertEqual(s3s.requests.get, "get d'origine")

    def test_une_fonction_absente_est_laissee(self):
        p, _ = pilote()
        s3s = types.SimpleNamespace()
        p.branche(s3s)
        self.assertFalse(hasattr(s3s, "check_if_missing"))


class TestDecodeur(unittest.TestCase):
    def test_msgpack_d_avant_1_0_rend_des_cles_str(self):
        options_vues = []

        def unpackb(data, **options):
            options_vues.append(options)
            if "strict_map_key" in options:
                raise TypeError("unexpected keyword argument 'strict_map_key'")
            return {"uuid": "u-1"} if options.get("raw") is False else {b"uuid": b"u-1"}

        decode = decodeur_msgpack(types.SimpleNamespace(unpackb=unpackb))
        self.assertEqual(decode(b"..."), {"uuid": "u-1"})
        self.assertEqual(options_vues[-1], {"raw": False})

    def test_msgpack_1_x_accepte_les_cles_entieres(self):
        vues = []
        decode = decodeur_msgpack(types.SimpleNamespace(unpackb=lambda data, **options: vues.append(options) or {}))
        decode(b"...")
        self.assertEqual(vues, [{"raw": False, "strict_map_key": False}])

    def test_avec_le_msgpack_installe(self):
        try:
            import msgpack
        except ImportError:
            self.skipTest("msgpack absent")
        charge = {"uuid": "u-1", "stage": 10, "splatnet_json": {1: 2}}
        self.assertEqual(decodeur_msgpack(msgpack)(msgpack.packb(charge)), charge)


class FauxCadre:
    def __init__(self, nom, i):
        self.f_code = types.SimpleNamespace(co_name=nom)
        self.f_locals = {"i": i}


class TestDecompte(unittest.TestCase):
    def setUp(self):
        import s3s_pilote

        self.module = s3s_pilote
        self.dormi = []
        self.vrai_dors = s3s_pilote._dors
        s3s_pilote._dors = self.dormi.append

    def tearDown(self):
        self.module._dors = self.vrai_dors

    def test_chaque_seconde_du_decompte_est_annoncee(self):
        p, sortie = pilote()
        p.dors(1, FauxCadre("monitor_battles", 42))
        self.assertEqual(evenements(sortie), [{"type": "decompte", "secondes": 42}])
        self.assertEqual(self.dormi, [1])

    def test_hors_de_la_veille_un_sommeil_ordinaire(self):
        p, sortie = pilote()
        p.dors(2, FauxCadre("fetch_json", 0))
        self.assertEqual((self.dormi, evenements(sortie)), ([2], []))

    def test_sigusr1_saute_le_reste_du_decompte(self):
        p, _ = pilote()
        p.en_decompte = True
        p.sur_sigusr1(None, None)
        p.en_decompte = False
        for i in (30, 29, 1):
            p.dors(1, FauxCadre("monitor_battles", i))
        self.assertEqual(self.dormi, [])
        p.dors(1, FauxCadre("monitor_battles", 0))
        self.assertFalse(p.verification_demandee)
        # Le decompte suivant dort de nouveau.
        p.dors(1, FauxCadre("monitor_battles", 60))
        self.assertEqual(self.dormi, [1])

    def test_sigusr1_hors_decompte_ignore(self):
        p, _ = pilote()
        p.sur_sigusr1(None, None)
        self.assertFalse(p.verification_demandee)

    def test_ctrl_c_marque_l_arret_et_interrompt(self):
        p, _ = pilote()
        with self.assertRaises(KeyboardInterrupt):
            p.sur_sigint(None, None)
        self.assertTrue(p.arret_demande)


if __name__ == "__main__":
    unittest.main()
