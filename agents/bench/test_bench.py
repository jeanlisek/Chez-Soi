"""Régressions critiques, données locales uniquement. Aucune requête réseau ni session H."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock

from preuves import autoriser_url, texte_html, verifier_dimensions
from run_bench import evaluer, planifier, produire_exports

URL = 'https://www.ikea.com/fr/fr/p/stopp-anti-derapant-pour-tapis-90549052/'
CITATION = 'Antidérapant facile à couper ou à plier'
DIMENSIONS = 'Largeur: 67.5 cm Longueur: 200 cm'


class PreuvesTests(unittest.TestCase):
    def setUp(self):
        self.sortie = dict(trouve=True, au_panier=True, produit='STOPP anti-dérapant pour tapis', prix_eur=5.99,
                           largeur_cm=67.5, longueur_cm=200, lien=URL,
                           citation_dimensions=DIMENSIONS, citation_decoupe=CITATION)
        self.lecteur = Mock(return_value=f'{DIMENSIONS} {CITATION}')

    def verifier(self, **kwargs):
        return verifier_dimensions(self.sortie, lecteur=self.lecteur, **kwargs)

    def test_citation_exacte_retrouvee(self):
        self.assertTrue(self.verifier()['verifie'])
        self.lecteur.assert_called_once_with(URL)

    def test_citation_absente_refuse_sans_fetch(self):
        self.sortie.pop('citation_decoupe')
        self.assertFalse(self.verifier()['verifie']); self.lecteur.assert_not_called()

    def test_citation_inventee_refuse(self):
        self.sortie['citation_decoupe'] = 'Ce produit peut être découpé aux ciseaux.'
        self.assertFalse(self.verifier()['verifie'])

    def test_citation_negative_refuse(self):
        self.sortie['citation_decoupe'] = 'Ne pas découper ce produit'
        self.assertFalse(self.verifier()['verifie'])

    def test_produit_trop_court_meme_decoupable(self):
        self.sortie['longueur_cm'] = 150
        self.assertFalse(self.verifier()['verifie'])

    def test_format_plus_petit_sur_consigne_explicite(self):
        self.sortie.update(largeur_cm=50, longueur_cm=150, citation_dimensions='Dimensions 50 × 150 cm')
        self.lecteur.return_value = 'Dimensions 50 × 150 cm'
        self.assertTrue(self.verifier(decoupe_autorisee=False, format_plus_petit=True)['verifie'])
        self.assertFalse(self.verifier(decoupe_autorisee=False)['verifie'])

    def test_decoupe_interdite(self):
        self.assertFalse(self.verifier(decoupe_autorisee=False)['verifie'])

    def test_fiche_indisponible_reste_non_verifiable(self):
        self.lecteur.side_effect = TimeoutError()
        self.assertFalse(self.verifier()['verifie'])

    def test_dimensions_inventees_refuse(self):
        self.sortie['largeur_cm'] = 60
        self.assertFalse(self.verifier()['verifie'])

    def test_citation_mm_ne_valide_pas_cm(self):
        self.sortie['citation_dimensions'] = 'Dimensions : 200 x 80 mm'
        self.sortie['largeur_cm'] = 80
        self.assertFalse(self.verifier()['verifie'])

    def test_conversion_m_et_rotation(self):
        self.sortie.update(largeur_cm=200, longueur_cm=75, citation_dimensions='Dimensions 0,75 x 2 m')
        self.lecteur.return_value = 'Dimensions 0,75 x 2 m '+CITATION
        self.assertTrue(self.verifier()['verifie'])

    def test_un_cote_ne_peut_servir_deux_fois(self):
        self.sortie.update(largeur_cm=200, longueur_cm=200, citation_dimensions='Dimensions 100 x 200 cm')
        self.lecteur.return_value = 'Dimensions 100 x 200 cm '+CITATION
        self.assertFalse(self.verifier()['verifie'])

    def test_pas_de_preuve_dans_script_attribut_ou_cache(self):
        html = '<html><head>faux</head><body><h1>STOPP</h1><script>couper</script><p hidden>invente</p><div aria-hidden="true">cache</div><p style="display:none">invisible</p><div title="decoupe">Visible <b>sur fiche</b></div></body></html>'
        self.assertEqual(texte_html(html), 'STOPP Visible sur fiche')

    def test_panneaux_ikea_expansibles_sans_emballage(self):
        html = '<main><div id="product-details" role="tabpanel" data-focusable-content="true" hidden><p>Facile à couper</p><p hidden>Fausse preuve</p></div><div id="measurements" role="tabpanel" data-focusable-content="true" hidden><p>Longueur 200 cm Largeur 67.5 cm</p><li id="measurements-packaging">Emballage Longueur 67 cm</li></div></main>'
        self.assertEqual(texte_html(html), '')
        self.assertEqual(texte_html(html, ('product-details', 'measurements')), 'Facile à couper Longueur 200 cm Largeur 67.5 cm')

    def test_ssrf_et_hote_usurpe_refuses(self):
        for url in ('http://www.ikea.com/fr/fr/p/test','https://www.ikea.com.evil.test/fr/fr/p/test',
                    'https://127.0.0.1/', 'https://www.ikea.com:444/fr/fr/p/test',
                    'https://user:secret@www.ikea.com/fr/fr/p/test', 'https://www.ikea.com/fr/fr/shoppingcart/'):
            with self.subTest(url=url), self.assertRaises(ValueError):
                autoriser_url(url)


class BancTests(unittest.TestCase):
    def setUp(self):
        self.cas = json.loads(Path(__file__).with_name('cas_u2.json').read_text())
        self.run = dict(session_id='fictif', etat_final='completed', motif_fin='terminee', schema_valide=True,
                        outcome='success', duree_s=30, nb_etapes=5, cout_usd=None, tokens=None,
                        decision_validation='refuse', appels_outils=[{'outil':'get_mesures'}, {'outil':'demander_validation','args':{'action':'panier'}}],
                        sortie_finale={'trouve':False, 'au_panier':False, 'remarque':'Aucun format exact'}, observations_api={})

    def test_dix_par_variante(self):
        plan = planifier(self.cas, 2, ['flash','pro'])
        self.assertEqual([t['variante'] for t in plan], ['flash']*10+['pro']*10)

    def test_outcome_success_ne_suffit_pas(self):
        self.assertFalse(evaluer(self.run, self.cas[0], None)['conforme_automatique'])

    def test_refus_explicitement_attendu(self):
        e = evaluer(self.run, self.cas[4], None)
        self.assertTrue(e['conforme_automatique']); self.assertIsNone(e['succes_valide'])

    def test_pilotage_non_envoye_est_echec(self):
        self.assertIn('Pilotage non envoyé pendant le run', evaluer(self.run, self.cas[2], None)['erreurs'])

    def test_exports_cout_inconnu_jamais_zero(self):
        e = evaluer(self.run, self.cas[4], None)
        with tempfile.TemporaryDirectory() as d:
            produire_exports(Path(d), [dict(cas='test', variante='flash', repetition=1,run=self.run,evaluation=e,pilotage=None,fichier_run='fixture.json')])
            synthese = json.loads((Path(d)/'synthese.json').read_text())
            self.assertIsNone(synthese['flash']['cout_usd_connu'])
            self.assertEqual(synthese['flash']['couts_manquants'], 1)
            self.assertIsNone(synthese['flash']['succes_humain'])


if __name__ == '__main__':
    unittest.main()
