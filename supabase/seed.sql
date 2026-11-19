-- seed.sql : référentiel de la démo (issue #1, section 5).
-- Sources : lignes P1 et P2 du Registre des sources (rangs 1 à 24), vérification du 17/11/2026.
-- Règles : les 12 règles du doc « CDO · Données et base ». DAAF reste « proposee » tant que
-- son texte n'est pas relu sur Légifrance. Une règle validée exige une source P1/P2 vérifiée
-- et datée (contrôlé par le trigger regles_controler_source).
-- Les personas, leur logement et le contrat fictif sont dans seed_demo.sql : ils exigent
-- que les comptes de démo existent d'abord dans auth.users.
-- Prérequis : migrations 0001 à 0008 (graphe : 0005, vocabulaire elements : 0006, assureurs : 0008).

begin;

insert into public.sources
  (rang_registre, priorite, theme, titre, reference_officielle, version_texte, editeur, type, nature, force, url, date_verification, statut)
values
  (1, 'P1', 'Incendie', 'Détecteur de fumée obligatoire dans tout logement', 'Loi n° 2010-238 du 9 mars 2010 ; CCH art. L142-1 et R142-2 à R142-5 (ex-R129-12 à R129-15)', 'Loi 2010 ; obligation depuis le 8 mars 2015', 'Parlement / Légifrance', 'Loi + code', 'primaire', 'Obligation légale', 'https://questions.assemblee-nationale.fr/dyn/16/questions/QANR5L16QE5879.pdf', '2026-11-17', 'garder'),
  (2, 'P1', 'Incendie', 'Détecteur de fumée : modalités d''installation', 'Arrêté du 5 février 2013 (application des ex-art. R129-12 à R129-15 CCH)', 'JO du 14/03/2013', 'Ministère du logement', 'Arrêté', 'primaire', 'Obligation légale', 'https://www.anil.org/documentation-experte/analyses-juridiques-jurisprudence/analyses-juridiques/analyses-juridiques-2010/obligation-dinstaller-des-detecteurs-de-fumee-dans-les-logements/', '2026-11-17', 'garder'),
  (3, 'P1', 'Assurance', 'Déclaration d''aggravation du risque', 'Code des assurances, art. L113-2 (3°) et L113-4', 'L113-2 en vigueur depuis le 01/04/2018, vérifié par l''API Légifrance le 17/11/2026 ; L113-4 à vérifier', 'Légifrance', 'Code', 'primaire', 'Obligation légale', 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000035731302', '2026-11-17', 'garder'),
  (4, 'P1', 'Assurance', 'Contrat d''assurance habitation de l''utilisateur', 'Conditions particulières + conditions générales de l''assureur', 'Version signée par l''assuré', 'Assureur', 'Contrat', 'primaire', 'Exigence du contrat', null, '2026-11-17', 'garder'),
  (5, 'P1', 'Données', 'Données de santé : catégorie particulière', 'RGPD art. 9 ; loi Informatique et libertés art. 6', 'Règlement (UE) 2016/679', 'UE / CNIL', 'Règlement', 'primaire', 'Obligation légale (pour l''équipe)', 'https://cnil.fr/quelles-formalites-pour-les-traitements-de-donnees-de-sante-caractere-personnel', '2026-11-17', 'garder'),
  (6, 'P1', 'Location', 'Logement décent', 'Décret n° 2002-120 du 30 janvier 2002 (art. 187 loi SRU)', 'Modifié notamment en 2017, 2020, 2021 et 2023', 'Légifrance', 'Décret', 'primaire', 'Obligation légale (bailleur)', 'https://www.caf.fr/sites/default/files/medias/101/OFFRE-DE-SERVICE/Logement/logement_decent_criteres.pdf', '2026-11-17', 'garder'),
  (7, 'P1', 'Location', 'Travaux d''adaptation par le locataire', 'Loi n° 89-462 du 6 juillet 1989, art. 7 f ; décret n° 2016-1282 du 29 septembre 2016', 'Service-Public vérifié le 28/05/2025', 'DILA / Légifrance', 'Loi + décret', 'primaire', 'Information juridique', 'https://www.service-public.gouv.fr/particuliers/vosdroits/F1874', '2026-11-17', 'garder'),
  (8, 'P1', 'Location', 'État des installations d''électricité et de gaz', 'Décrets n° 2016-1104 (gaz) et 2016-1105 (électricité) du 11 août 2016 ; loi du 6 juillet 1989 art. 3-3', 'Obligatoire pour toute nouvelle location depuis le 1er janvier 2018', 'Légifrance', 'Décret', 'primaire', 'Obligation légale (bailleur)', 'https://www.notaires.fr/fr/immobilier-fiscalit%C3%A9/diagnostics-environnement/diagnostics-immobiliers-obligatoires-pour-la-location', '2026-11-17', 'garder'),
  (9, 'P1', 'Absence', 'Opération tranquillité vacances', 'Service-Public, actualité A15031', 'Mise à jour le 13/07/2026', 'DILA', 'Fiche officielle', 'primaire', 'Information officielle', 'https://www.service-public.gouv.fr/particuliers/actualites/A15031?lang=fr', '2026-11-17', 'garder'),
  (10, 'P1', 'Aides', 'MaPrimeAdapt''', 'Service-Public F37501 ; loi de finances pour 2024 ; Anah', 'Fiche mise à jour le 01/01/2026', 'DILA / Anah', 'Fiche officielle', 'primaire', 'Information officielle', 'https://www.justice.fr/fiche/maprimeadapt-travaux-adaptation-logement-perte-autonomie', '2026-11-17', 'garder'),
  (11, 'P2', 'Accessibilité', 'Accessibilité des logements neufs', 'Arrêté du 24 décembre 2015 (NOR ETLL1511145A), version consolidée', 'En vigueur au 17/11/2026 ; modifié en 2016, 2019, 2020', 'Légifrance', 'Arrêté', 'primaire', 'Référence du neuf (recommandé)', 'https://www.legifrance.gouv.fr/loda/id/JORFTEXT000031692481', '2026-11-17', 'garder'),
  (12, 'P2', 'Accessibilité', '20 % de logements accessibles, 80 % évolutifs', 'Décret n° 2019-305 du 11 avril 2019 (loi ELAN)', 'Depuis le 1er octobre 2019', 'Légifrance', 'Décret', 'primaire', 'Référence du neuf', 'https://www.ffbatiment.fr/techniques-batiment/reglementation-construction/reglementation-accessibilite-handicapes/dossier/reglementation-accessibilite-batiments-concernes', '2026-11-17', 'garder'),
  (13, 'P2', 'Accessibilité', 'Travaux dans les bâtiments collectifs existants', 'Arrêté du 26 février 2007 (NOR SOCU0612413A)', 'En vigueur ; modifié le 23/03/2016', 'Légifrance', 'Arrêté', 'primaire', 'Référence (recommandé)', 'https://www.legifrance.gouv.fr/loda/id/JORFTEXT000000795692', '2026-11-17', 'garder'),
  (14, 'P2', 'Chutes', 'Garde-corps : hauteur de protection', 'CCH art. L134-12 et R134-59 (ex-R111-15) ; normes NF P01-012 (révisée le 22/11/2024) et NF P01-013', 'CCH depuis juillet 2021', 'Légifrance / AFNOR', 'Code + norme', 'primaire', 'Référence (recommandé ; décence si location)', 'https://qualiteconstruction.com/wp-content/uploads/2024/05/Fiche-Qualite-Reglementaire-A01-Hauteurs-Protection-Garde-Corps-AQC.pdf', '2026-11-17', 'garder'),
  (15, 'P2', 'Enfants', 'Barrières de sécurité pour enfants', 'NF EN 1930 (EN 1930:2011)', 'Publiée en février 2012', 'AFNOR', 'Norme', 'primaire', 'Référence produit', 'https://www.boutique.afnor.org/en-gb/standard/nf-en-1930/child-use-and-care-articles-safety-barriers-safety-requirements-and-test-me/fa142691/1208', '2026-11-17', 'garder'),
  (16, 'P2', 'Cambriolage', 'Certification A2P des serrures', 'CNPP, référentiel H61 « Serrures de bâtiment »', 'Version janvier 2023', 'CNPP', 'Certification', 'primaire', 'Référence produit', 'https://www.batiweb.com/actualites/vie-des-societes/une-serrure-trois-points-recoit-la-certification-a2p-17123', '2026-11-17', 'garder'),
  (17, 'P2', 'Chutes', 'Prévention des chutes accidentelles chez la personne âgée', 'HAS / SFDRMG, recommandation de bonne pratique', '2005, mise à jour 19/07/2006', 'HAS', 'Recommandation', 'primaire', 'Recommandation officielle', 'https://www.has-sante.fr/jcms/c_272503/', '2026-11-17', 'garder'),
  (18, 'P2', 'Chutes', 'Chutes répétées des personnes âgées', 'HAS / SFGG, recommandation', 'Avril 2009', 'HAS', 'Recommandation', 'primaire', 'Recommandation officielle', 'https://www.has-sante.fr/jcms/c_813833/fr/une-strategie-pour-mieux-prendre-en-charge-les-personnes-agees-faisant-des-chutes-a-repetition', '2026-11-17', 'garder'),
  (19, 'P2', 'Chutes', 'Activité physique et risque de chute', 'HAS, synthèse (sur la base des recommandations OMS 2022)', 'Avril 2024', 'HAS', 'Recommandation', 'primaire', 'Recommandation officielle', 'https://www.has-sante.fr/upload/docs/application/pdf/2024-04/synthese_aps_personnes_agees_a_risque_de_chute.pdf', '2026-11-17', 'garder'),
  (20, 'P2', 'Chutes', 'Aménager son logement, prévenir les chutes', 'pour-les-personnes-agees.gouv.fr (CNSA)', 'Mise à jour 2026', 'CNSA', 'Guide officiel', 'primaire', 'Recommandation officielle', 'https://www.pour-les-personnes-agees.gouv.fr/comment-prevenir-les-risques-de-chutes-chez-les-personnes-agees', '2026-11-17', 'garder'),
  (21, 'P2', 'Chutes', 'Brochure « Bouger en toute sérénité »', 'Santé publique France et caisses de retraite', '2024', 'SPF', 'Guide officiel', 'primaire', 'Recommandation officielle', 'https://www.pour-les-personnes-agees.gouv.fr/prevenir-les-chutes-un-nouveau-guide-est-disponible', '2026-11-17', 'garder'),
  (22, 'P2', 'Chutes', 'Prévenir les chutes des personnes âgées', 'ameli.fr', 'Page en ligne', 'Assurance maladie', 'Guide officiel', 'primaire', 'Recommandation officielle', 'https://www.ameli.fr/assure/sante/bons-gestes/seniors/prevenir-chutes-personnes-agees', null, 'corriger'),
  (23, 'P2', 'Monoxyde de carbone', 'Intoxications au monoxyde de carbone', 'Ministère de la santé, Santé publique France', 'Campagne du 26/11/2025', 'DGS / SPF', 'Guide officiel', 'primaire', 'Recommandation officielle', 'https://www.sante.fr/node/1134686', '2026-11-17', 'garder'),
  (24, 'P2', 'Cambriolage', 'Cambriolage : comment réagir et limiter les risques', 'Gendarmerie nationale', '13/01/2023, mise à jour 01/03/2023', 'Gendarmerie', 'Guide officiel', 'primaire', 'Recommandation officielle', 'https://www.gendarmerie.interieur.gouv.fr/conseils/habitation/cambriolage-comment-reagir-et-limiter-les-risques', '2026-11-17', 'garder')
on conflict (rang_registre) do nothing;

-- Règles et conditions. Conditions d'un même groupe : ET ; groupes différents : OU.
-- Une règle sans condition s'applique à tous les profils.
with r as (
  insert into public.regles
    (code, version, intitule, element, force, verdict_type, parametres, source_id, source_ref, source_url, statut_validation, verifie_le, relu_par)
  select 'ACC-PORTE-ENT', 1, 'Porte d''entrée : passage utile ≥ 0,83 m (largeur nominale 0,90 m)', 'porte_entree', 'recommande', 'seuil_min', '{"passage_utile_min_cm": 83}'::jsonb,
         s.id, 'Arrêté du 24/12/2015', s.url, 'validee', date '2026-11-17', 'Équipe 2 (CDO)'
  from public.sources s where s.rang_registre = 11
  on conflict (code, version) do nothing
  returning id
)
insert into public.regle_conditions (regle_id, groupe, axe, operateur, valeur)
select r.id, c.groupe, c.axe, c.operateur, c.valeur
from r, (values
  (1, 'deplacement', '>=', '3')
) as c (groupe, axe, operateur, valeur);

with r as (
  insert into public.regles
    (code, version, intitule, element, force, verdict_type, parametres, source_id, source_ref, source_url, statut_validation, verifie_le, relu_par)
  select 'ACC-PORTE-INT', 1, 'Porte intérieure : passage utile ≥ 0,77 m (largeur nominale 0,80 m)', 'porte_interieure', 'recommande', 'seuil_min', '{"passage_utile_min_cm": 77}'::jsonb,
         s.id, 'Arrêté du 24/12/2015', s.url, 'validee', date '2026-11-17', 'Équipe 2 (CDO)'
  from public.sources s where s.rang_registre = 11
  on conflict (code, version) do nothing
  returning id
)
insert into public.regle_conditions (regle_id, groupe, axe, operateur, valeur)
select r.id, c.groupe, c.axe, c.operateur, c.valeur
from r, (values
  (1, 'deplacement', '>=', '3')
) as c (groupe, axe, operateur, valeur);

with r as (
  insert into public.regles
    (code, version, intitule, element, force, verdict_type, parametres, source_id, source_ref, source_url, statut_validation, verifie_le, relu_par)
  select 'ACC-RESSAUT', 1, 'Ressaut ≤ 2 cm, bord arrondi ou chanfreiné', 'ressaut', 'recommande', 'seuil_max', '{"hauteur_max_cm": 2}'::jsonb,
         s.id, 'Arrêté du 24/12/2015', s.url, 'validee', date '2026-11-17', 'Équipe 2 (CDO)'
  from public.sources s where s.rang_registre = 11
  on conflict (code, version) do nothing
  returning id
)
insert into public.regle_conditions (regle_id, groupe, axe, operateur, valeur)
select r.id, c.groupe, c.axe, c.operateur, c.valeur
from r, (values
  (1, 'deplacement', '>=', '2')
) as c (groupe, axe, operateur, valeur);

with r as (
  insert into public.regles
    (code, version, intitule, element, force, verdict_type, parametres, source_id, source_ref, source_url, statut_validation, verifie_le, relu_par)
  select 'ESC-MAIN-COUR', 1, 'Escalier : main courante entre 0,80 et 1,00 m de hauteur', 'main_courante', 'recommande', 'intervalle', '{"hauteur_min_cm": 80, "hauteur_max_cm": 100}'::jsonb,
         s.id, 'Arrêté du 24/12/2015, art. 6.1 (parties communes, application aux escaliers privés à vérifier)', s.url, 'validee', date '2026-11-17', 'Équipe 2 (CDO)'
  from public.sources s where s.rang_registre = 11
  on conflict (code, version) do nothing
  returning id
)
insert into public.regle_conditions (regle_id, groupe, axe, operateur, valeur)
select r.id, c.groupe, c.axe, c.operateur, c.valeur
from r, (values
  (1, 'deplacement', '>=', '1'),
  (2, 'vue_reduite', '=', 'true')
) as c (groupe, axe, operateur, valeur);

with r as (
  insert into public.regles
    (code, version, intitule, element, force, verdict_type, parametres, source_id, source_ref, source_url, statut_validation, verifie_le, relu_par)
  select 'ESC-MARCHES', 1, 'Marches : hauteur ≤ 17 cm, giron ≥ 28 cm', 'marche', 'recommande', 'seuils', '{"hauteur_max_cm": 17, "giron_min_cm": 28}'::jsonb,
         s.id, 'Arrêté du 24/12/2015, art. 6.1', s.url, 'validee', date '2026-11-17', 'Équipe 2 (CDO)'
  from public.sources s where s.rang_registre = 11
  on conflict (code, version) do nothing
  returning id
)
insert into public.regle_conditions (regle_id, groupe, axe, operateur, valeur)
select r.id, c.groupe, c.axe, c.operateur, c.valeur
from r, (values
  (1, 'deplacement', '>=', '1')
) as c (groupe, axe, operateur, valeur);

with r as (
  insert into public.regles
    (code, version, intitule, element, force, verdict_type, parametres, source_id, source_ref, source_url, statut_validation, verifie_le, relu_par)
  select 'ESC-VIGILANCE', 1, 'Bande d''éveil à 0,50 m en haut, première et dernière contremarches contrastées', 'escalier', 'recommande', 'presence', '{"bande_eveil_distance_cm": 50}'::jsonb,
         s.id, 'Arrêté du 24/12/2015, art. 6.1', s.url, 'validee', date '2026-11-17', 'Équipe 2 (CDO)'
  from public.sources s where s.rang_registre = 11
  on conflict (code, version) do nothing
  returning id
)
insert into public.regle_conditions (regle_id, groupe, axe, operateur, valeur)
select r.id, c.groupe, c.axe, c.operateur, c.valeur
from r, (values
  (1, 'vue_reduite', '=', 'true')
) as c (groupe, axe, operateur, valeur);

with r as (
  insert into public.regles
    (code, version, intitule, element, force, verdict_type, parametres, source_id, source_ref, source_url, statut_validation, verifie_le, relu_par)
  select 'CHUTE-TAPIS', 1, 'Tapis fixés ou munis de bandes antidérapantes', 'tapis', 'recommande', 'presence', '{}'::jsonb,
         s.id, 'pour-les-personnes-agees.gouv.fr (CNSA)', s.url, 'validee', date '2026-11-17', 'Équipe 2 (CDO)'
  from public.sources s where s.rang_registre = 20
  on conflict (code, version) do nothing
  returning id
)
insert into public.regle_conditions (regle_id, groupe, axe, operateur, valeur)
select r.id, c.groupe, c.axe, c.operateur, c.valeur
from r, (values
  (1, 'deplacement', '>=', '1')
) as c (groupe, axe, operateur, valeur);

with r as (
  insert into public.regles
    (code, version, intitule, element, force, verdict_type, parametres, source_id, source_ref, source_url, statut_validation, verifie_le, relu_par)
  select 'CHUTE-NUIT', 1, 'Éclairage sans zone d''ombre, chemin lumineux pour les levers nocturnes', 'eclairage', 'recommande', 'presence', '{}'::jsonb,
         s.id, 'pour-les-personnes-agees.gouv.fr (CNSA)', s.url, 'validee', date '2026-11-17', 'Équipe 2 (CDO)'
  from public.sources s where s.rang_registre = 20
  on conflict (code, version) do nothing
  returning id
)
insert into public.regle_conditions (regle_id, groupe, axe, operateur, valeur)
select r.id, c.groupe, c.axe, c.operateur, c.valeur
from r, (values
  (1, 'deplacement', '>=', '1'),
  (2, 'vigilance', '=', 'troubles_cognitifs')
) as c (groupe, axe, operateur, valeur);

with r as (
  insert into public.regles
    (code, version, intitule, element, force, verdict_type, parametres, source_id, source_ref, source_url, statut_validation, verifie_le, relu_par)
  select 'CAMB-SERRURE', 1, 'Serrure multipoints certifiée A2P (donnée déclarée)', 'serrure', 'recommande', 'declaration', '{"priorite_si_contrat": 1}'::jsonb,
         s.id, 'CNPP, référentiel H61 ; MAIF', s.url, 'validee', date '2026-11-17', 'Équipe 2 (CDO)'
  from public.sources s where s.rang_registre = 16
  on conflict (code, version) do nothing
  returning id
)
select count(*) from r;

with r as (
  insert into public.regles
    (code, version, intitule, element, force, verdict_type, parametres, source_id, source_ref, source_url, statut_validation, verifie_le, relu_par)
  select 'ABS-OTV', 1, 'Inscription OTV : 45 à 3 jours avant le départ (zone police), jusqu''à la veille (zone gendarmerie)', 'otv', 'information', 'delai', '{"police": {"jours_avant_max": 45, "jours_avant_min": 3}, "gendarmerie": {"jours_avant_min": 1}}'::jsonb,
         s.id, 'Service-Public, actualité A15031 (13/07/2026)', s.url, 'validee', date '2026-11-17', 'Équipe 2 (CDO)'
  from public.sources s where s.rang_registre = 9
  on conflict (code, version) do nothing
  returning id
)
insert into public.regle_conditions (regle_id, groupe, axe, operateur, valeur)
select r.id, c.groupe, c.axe, c.operateur, c.valeur
from r, (values
  (1, 'absence', '=', 'declaree')
) as c (groupe, axe, operateur, valeur);

with r as (
  insert into public.regles
    (code, version, intitule, element, force, verdict_type, parametres, source_id, source_ref, source_url, statut_validation, verifie_le, relu_par)
  select 'LOC-TRAVAUX', 1, 'Locataire : demande écrite au bailleur avant travaux d''adaptation', 'travaux_adaptation', 'information', 'information', '{}'::jsonb,
         s.id, 'Loi du 6 juillet 1989, art. 7 f ; décret 2016-1282 ; Service-Public F1874', s.url, 'validee', date '2026-11-17', 'Équipe 2 (CDO)'
  from public.sources s where s.rang_registre = 7
  on conflict (code, version) do nothing
  returning id
)
insert into public.regle_conditions (regle_id, groupe, axe, operateur, valeur)
select r.id, c.groupe, c.axe, c.operateur, c.valeur
from r, (values
  (1, 'statut_occupation', '=', 'locataire')
) as c (groupe, axe, operateur, valeur);

with r as (
  insert into public.regles
    (code, version, intitule, element, force, verdict_type, parametres, source_id, source_ref, source_url, statut_validation, verifie_le, relu_par)
  select 'DAAF', 1, 'Détecteur de fumée dans le logement', 'detecteur_fumee', 'loi', 'presence', '{}'::jsonb,
         s.id, 'CCH art. L142-1 et R142-2 à R142-5 (texte à relire sur Légifrance)', s.url, 'proposee', null, null
  from public.sources s where s.rang_registre = 1
  on conflict (code, version) do nothing
  returning id
)
select count(*) from r;

-- Graphe de connaissances (0005_graphe) : nœuds publics Element, Regle et ContreMesure.
-- Rejouable : rien n'est créé deux fois. Les embeddings restent à null : n8n les calcule.

-- Un nœud Element par entrée du vocabulaire commun (table elements, 0006).
insert into public.graphe_noeuds (type, libelle, proprietes)
select 'Element', e.libelle, jsonb_build_object('element', e.code, 'risque', e.risque)
from public.elements e
where not exists (
  select 1 from public.graphe_noeuds n
  where n.type = 'Element' and n.contrat_id is null and n.proprietes ->> 'element' = e.code
);

-- Synonymes des nœuds Element (GraphRAG, 18/11) : un libellé d'un ou deux mots est trop court pour
-- une recherche par le sens. Ces mots servent seulement à reconnaître un élément que la vision
-- nomme autrement ; ils ne créent aucune règle. Rejouable : l'embedding n'est remis à null
-- (donc recalculé par l'app) que si les synonymes changent.
with syn (element, synonymes) as (values
  ('tapis', 'tapis, carpette, descente de lit, paillasson, tapis de couloir, tapis de bain, moquette non fixée'),
  ('ressaut', 'seuil de porte, seuil surélevé, barre de seuil, petite marche isolée, différence de niveau au sol, rebord au sol'),
  ('porte_entree', 'porte d''entrée, porte palière, porte principale du logement'),
  ('porte_interieure', 'porte de chambre, porte de salle de bain, porte de cuisine, porte de couloir, passage de porte'),
  ('main_courante', 'main courante, rampe d''escalier, poignée le long de l''escalier'),
  ('marche', 'marche, contremarche, nez de marche, giron'),
  ('escalier', 'escalier, cage d''escalier, volée de marches, escalier intérieur'),
  ('eclairage', 'éclairage, lampe, luminaire, plafonnier, veilleuse, interrupteur, zone sombre'),
  ('garde_corps', 'garde-corps, balustrade, rambarde de balcon, parapet'),
  ('barriere_securite', 'barrière de sécurité pour enfant, barrière d''escalier pour bébé'),
  ('barre_appui', 'barre d''appui, barre de maintien, poignée de douche, barre de relèvement, barre de toilettes'),
  ('fenetre', 'fenêtre, baie vitrée, porte-fenêtre, vitre, volet, vasistas'),
  ('serrure', 'serrure, verrou, cylindre, barillet, serrure trois points'),
  ('detecteur_fumee', 'détecteur de fumée, DAAF, détecteur d''incendie, alarme incendie'),
  ('detecteur_co', 'détecteur de monoxyde de carbone, détecteur de CO, détecteur de gaz')
)
update public.graphe_noeuds n
set proprietes = n.proprietes || jsonb_build_object('synonymes', s.synonymes),
    embedding = null
from syn s
where n.type = 'Element' and n.contrat_id is null
  and n.proprietes ->> 'element' = s.element
  and n.proprietes ->> 'synonymes' is distinct from s.synonymes;

-- Un nœud Regle par code, pointé sur sa dernière version (la veille le repointe ensuite).
insert into public.graphe_noeuds (type, libelle, proprietes, regle_id)
select 'Regle', r.intitule,
       jsonb_build_object('code', r.code, 'version', r.version, 'force', r.force,
                          'source_ref', r.source_ref, 'source_url', r.source_url),
       r.id
from public.regles r
where r.version = (select max(r2.version) from public.regles r2 where r2.code = r.code)
  and not exists (
    select 1 from public.graphe_noeuds n
    where n.type = 'Regle' and n.contrat_id is null and n.proprietes ->> 'code' = r.code
  );

-- Regle PORTE_SUR Element.
insert into public.graphe_aretes (source_id, cible_id, relation)
select nr.id, ne.id, 'PORTE_SUR'
from public.graphe_noeuds nr
join public.regles r on r.id = nr.regle_id
join public.graphe_noeuds ne
  on ne.type = 'Element' and ne.contrat_id is null and ne.proprietes ->> 'element' = r.element
where nr.type = 'Regle' and nr.contrat_id is null
on conflict (source_id, cible_id, relation) do nothing;

-- Contre-mesures connues (proposées par l'équipe, à relier aux objets par l'usage 2).
with cm (code_regle, libelle, element) as (values
  ('ACC-PORTE-ENT', 'Élargissement du passage de la porte d''entrée (travaux)', 'porte_entree'),
  ('ACC-PORTE-INT', 'Élargissement du passage de la porte intérieure (travaux)', 'porte_interieure'),
  ('ACC-RESSAUT', 'Rampe de seuil ou suppression du ressaut', 'ressaut'),
  ('ESC-MAIN-COUR', 'Main courante continue posée entre 0,80 et 1,00 m', 'main_courante'),
  ('ESC-MARCHES', 'Nez de marche antidérapants et contrastés', 'marche'),
  ('ESC-VIGILANCE', 'Bande d''éveil de vigilance et contremarches contrastées', 'escalier'),
  ('CHUTE-TAPIS', 'Sous-tapis antidérapant ou fixation du tapis au sol', 'tapis'),
  ('CHUTE-NUIT', 'Veilleuses à détection de mouvement sur le trajet de nuit', 'eclairage'),
  ('CAMB-SERRURE', 'Serrure multipoints certifiée A2P', 'serrure'),
  ('ABS-OTV', 'Inscription à l''Opération tranquillité vacances', 'otv'),
  ('DAAF', 'Détecteur de fumée marqué NF EN 14604', 'detecteur_fumee')
)
insert into public.graphe_noeuds (type, libelle, proprietes)
select 'ContreMesure', cm.libelle, jsonb_build_object('code_regle', cm.code_regle, 'element', cm.element, 'origine', 'seed')
from cm
where not exists (
  select 1 from public.graphe_noeuds n
  where n.type = 'ContreMesure' and n.contrat_id is null and n.proprietes ->> 'code_regle' = cm.code_regle
);

-- ContreMesure CORRIGE Regle.
insert into public.graphe_aretes (source_id, cible_id, relation)
select nc.id, nr.id, 'CORRIGE'
from public.graphe_noeuds nc
join public.graphe_noeuds nr
  on nr.type = 'Regle' and nr.contrat_id is null and nr.proprietes ->> 'code' = nc.proprietes ->> 'code_regle'
where nc.type = 'ContreMesure' and nc.contrat_id is null
on conflict (source_id, cible_id, relation) do nothing;

-- Référentiel des assureurs (0008) : domaines officiels et page de départ de l'usage 1.
-- Valeurs de agents/dev/fixtures/contrat_u1.json, vérifiées sans connexion le 18/11/2026.
-- Rejouable : la clé est le nom (index assureurs_nom_idx).
insert into public.assureurs (nom, domaines, url_depart, verifie_le, notes)
values
  ('MAIF', '{maif.fr}', 'https://www.maif.fr', '2026-11-18',
   'Conditions générales Raqvam publiques (référence M2442).'),
  ('Altima Assurances', '{altima-assurances.fr}', 'https://www.altima-assurances.fr', '2026-11-18',
   'Conditions générales MRH publiques (référence 202007_298).'),
  ('Acheel', '{acheel.com}', 'https://v2.acheel.com/insurance/property', '2026-11-18',
   'Cas « non publié » : aucune condition générale accessible sans connexion.')
on conflict (lower(btrim(nom))) do update
  set domaines = excluded.domaines,
      url_depart = excluded.url_depart,
      verifie_le = excluded.verifie_le,
      notes = excluded.notes;

-- Contrats déjà lus : rattachement à l'assureur du référentiel quand le nom est identique.
-- Les nouveaux contrats sont rattachés par l'application à la lecture (lib/contrat.ts).
update public.contrats c
set assureur_id = a.id
from public.assureurs a
where c.assureur_id is null
  and lower(btrim(c.assureur)) = lower(btrim(a.nom));

commit;

-- Articles de loi (19/11) : un nœud Article par texte publié sur Légifrance qui fonde une règle validée,
-- puis Article IMPOSE Regle. Le lien Légifrance ne vit plus seulement dans la règle : le GraphRAG remonte
-- jusqu'au texte. Embedding laissé vide : l'app le calcule au prochain plan (completerEmbeddings).
-- Rejouable : la clé est l'URL du texte.
insert into public.graphe_noeuds (type, libelle, proprietes)
select distinct on (r.source_url)
       'Article',
       split_part(r.source_ref, ',', 1),
       jsonb_build_object('source_url', r.source_url, 'source_ref', split_part(r.source_ref, ',', 1), 'origine', 'seed')
from public.regles_en_vigueur r
where r.source_url like 'https://www.legifrance.gouv.fr/%'
  and not exists (
    select 1 from public.graphe_noeuds n
    where n.type = 'Article' and n.contrat_id is null and n.proprietes ->> 'source_url' = r.source_url
  )
order by r.source_url, r.code;

insert into public.graphe_aretes (source_id, cible_id, relation)
select na.id, nr.id, 'IMPOSE'
from public.graphe_noeuds na
join public.regles_en_vigueur r on r.source_url = na.proprietes ->> 'source_url'
join public.graphe_noeuds nr
  on nr.type = 'Regle' and nr.contrat_id is null and nr.proprietes ->> 'code' = r.code
where na.type = 'Article' and na.contrat_id is null
on conflict (source_id, cible_id, relation) do nothing;

-- Validées le 19/11 par Jean-Li Sek, sources vérifiées sur Légifrance et Service-Public :
-- DAAF v2 (source : CCH art. R142-2 sur Légifrance ; la v1 citait une réponse ministérielle, retirée)
-- et CAMB-FENETRES (conseil police et gendarmerie, Service-Public A15031, déjà au registre pour l'OTV).
-- Rejouable : rien n'est réinséré si la règle existe ; une règle n'est jamais modifiée (prive.figer_regle).
insert into public.regles (code, version, intitule, element, force, verdict_type, parametres, source_id, source_ref, source_url, statut_validation, verifie_le, relu_par)
select code, 2, intitule, element, force, verdict_type, parametres, source_id, 'CCH, art. R142-2 (Légifrance)',
       'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000051721576', 'validee', '2026-11-19', 'Jean-Li Sek'
from public.regles where code = 'DAAF' and version = 1
  and not exists (select 1 from public.regles where code = 'DAAF' and version = 2);
update public.regles set statut_validation = 'retiree' where code = 'DAAF' and version = 1 and statut_validation = 'proposee';

insert into public.regles (code, version, intitule, element, force, verdict_type, parametres, source_id, source_ref, source_url, statut_validation, verifie_le, relu_par)
select 'CAMB-FENETRES', 1, 'Verrouiller avec soin la fermeture des portes, fenêtres et volets', 'fenetre', 'recommande', 'presence', '{}'::jsonb,
       s.id, 'Service-Public, actualité A15031 : conseils de la police et de la gendarmerie',
       'https://www.service-public.gouv.fr/particuliers/actualites/A15031?lang=fr', 'validee', '2026-11-19', 'Jean-Li Sek'
from public.sources s where s.url = 'https://www.service-public.gouv.fr/particuliers/actualites/A15031?lang=fr'
  and not exists (select 1 from public.regles where code = 'CAMB-FENETRES');

-- Nœud Regle repointé sur la dernière version, nœud et arêtes de la nouvelle règle, contre-mesure.
update public.graphe_noeuds n
set regle_id = r.id,
    proprietes = n.proprietes || jsonb_build_object('version', r.version, 'source_ref', r.source_ref, 'source_url', r.source_url)
from public.regles r
where n.type = 'Regle' and n.contrat_id is null and n.proprietes ->> 'code' = r.code
  and r.version = (select max(r2.version) from public.regles r2 where r2.code = r.code and r2.statut_validation = 'validee')
  and n.regle_id is distinct from r.id;
insert into public.graphe_noeuds (type, libelle, proprietes, regle_id)
select 'Regle', r.intitule, jsonb_build_object('code', r.code, 'version', r.version, 'force', r.force, 'source_ref', r.source_ref, 'source_url', r.source_url), r.id
from public.regles r
where r.code = 'CAMB-FENETRES'
  and not exists (select 1 from public.graphe_noeuds n where n.type = 'Regle' and n.contrat_id is null and n.proprietes ->> 'code' = r.code);
insert into public.graphe_aretes (source_id, cible_id, relation)
select nr.id, ne.id, 'PORTE_SUR'
from public.graphe_noeuds nr
join public.regles r on r.id = nr.regle_id
join public.graphe_noeuds ne on ne.type = 'Element' and ne.contrat_id is null and ne.proprietes ->> 'element' = r.element
where nr.type = 'Regle' and nr.contrat_id is null
on conflict (source_id, cible_id, relation) do nothing;
insert into public.graphe_noeuds (type, libelle, proprietes)
select 'ContreMesure', 'Fenêtres et volets verrouillés, surtout en cas d''absence',
       jsonb_build_object('code_regle', 'CAMB-FENETRES', 'element', 'fenetre', 'origine', 'seed')
where not exists (
  select 1 from public.graphe_noeuds n
  where n.type = 'ContreMesure' and n.contrat_id is null and n.proprietes ->> 'code_regle' = 'CAMB-FENETRES'
);
insert into public.graphe_aretes (source_id, cible_id, relation)
select nc.id, nr.id, 'CORRIGE'
from public.graphe_noeuds nc
join public.graphe_noeuds nr on nr.type = 'Regle' and nr.contrat_id is null and nr.proprietes ->> 'code' = nc.proprietes ->> 'code_regle'
where nc.type = 'ContreMesure' and nc.contrat_id is null
on conflict (source_id, cible_id, relation) do nothing;

-- Textes de loi dont la règle cite une autre page (Service-Public) : article Légifrance vérifié le 19/11.
with art (code_regle, libelle, url) as (values
  ('DAAF', 'CCH, art. R142-2', 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000051721576'),
  ('LOC-TRAVAUX', 'Loi n° 89-462 du 6 juillet 1989, art. 7 f', 'https://www.legifrance.gouv.fr/loda/id/JORFTEXT000000509310')
)
insert into public.graphe_noeuds (type, libelle, proprietes)
select 'Article', a.libelle, jsonb_build_object('source_url', a.url, 'source_ref', a.libelle, 'origine', 'seed')
from art a
where not exists (select 1 from public.graphe_noeuds n where n.type = 'Article' and n.contrat_id is null and n.proprietes ->> 'source_url' = a.url);
with art (code_regle, url) as (values
  ('DAAF', 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000051721576'),
  ('LOC-TRAVAUX', 'https://www.legifrance.gouv.fr/loda/id/JORFTEXT000000509310')
)
insert into public.graphe_aretes (source_id, cible_id, relation)
select na.id, nr.id, 'IMPOSE'
from art a
join public.graphe_noeuds na on na.type = 'Article' and na.contrat_id is null and na.proprietes ->> 'source_url' = a.url
join public.graphe_noeuds nr on nr.type = 'Regle' and nr.contrat_id is null and nr.proprietes ->> 'code' = a.code_regle
on conflict (source_id, cible_id, relation) do nothing;
