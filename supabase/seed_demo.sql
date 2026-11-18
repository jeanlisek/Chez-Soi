-- seed_demo.sql : personas fictifs et contrat fictif de la démo (issue #1, section 5).
-- À lancer APRÈS seed.sql et après la création des comptes de démo dans Supabase Auth
-- (Authentication > Users, ou API d'administration). Les e-mails ci-dessous sont à remplacer
-- par ceux des comptes créés ; un compte absent est signalé et ignoré.
-- Données entièrement fictives : aucune personne réelle.

begin;

do $$
declare
  v_marc uuid := (select id from auth.users where email = 'marc.demo@chez-soi.invalid');
  v_lea uuid := (select id from auth.users where email = 'lea.demo@chez-soi.invalid');
  v_famille uuid := (select id from auth.users where email = 'famille.demo@chez-soi.invalid');
  v_logement uuid;
  v_contrat uuid;
begin
  /* ---------- Marc → logement de Jeanne ---------- */
  if v_marc is null then
    raise notice 'Compte de Marc absent : persona ignoré.';
  else
    insert into public.logements (user_id, type, etage, ascenseur, statut_occupation, zone_otv, conservation_jusqu_au)
    values (v_marc, 'T2', 0, false, 'proprietaire', 'police', date '2026-11-21')
    returning id into v_logement;

    insert into public.occupants (logement_id, libelle, deplacement, vue_reduite, audition_reduite, vigilance, consentement_art9_le)
    values (v_logement, 'Jeanne, 79 ans (canne)', 2, false, true, 'adulte', now());

    insert into public.declarations (logement_id, element, valeur)
    values (v_logement, 'serrure', 'un point, non certifiée A2P');

    -- 35 jours d'absence cet hiver (mêmes dates que agents/dev/fixtures/contrat_u3.json).
    insert into public.absences (logement_id, depart_le, retour_le)
    values (v_logement, date '2026-12-15', date '2027-01-19');

    -- Assureur de la démo : MAIF (décision du 18/11). Le contrat de Jeanne est fictif, mais il renvoie
    -- aux conditions générales publiques MAIF Raqvam, réf. M2442 - 01/2023 (36 p.), relues le 18/11.
    -- Ces CG ne fixent AUCUNE durée d'inoccupation : le seuil de 30 jours vient des conditions particulières
    -- fictives de Jeanne (lignes 3 à 6, source 'cp').
    -- assureur_id reste vide : la ligne MAIF du référentiel assureurs arrive après la PR #17.
    insert into public.contrats (logement_id, titulaire_accord_le, assureur, formule, reference_cg, version_cg,
                                 version_cg_verifiee, statut_extraction, extrait_le, conservation_jusqu_au)
    values (v_logement, now(), 'MAIF', 'Raqvam', 'M2442', '01/2023',
            false, 'termine', now(), date '2026-11-21')
    returning id into v_contrat;

    -- Lignes 1 et 2 : citations RÉELLES des CG (garantie particulière en cas de vol), pages du PDF.
    -- Elles ne jouent que pour les tranches de tarification H à J : la démo suppose que les conditions
    -- particulières (fictives) de Jeanne la classent dans ces tranches. Pour les tranches A à G, la
    -- franchise est de 135 € dans tous les cas et la clause ne change rien.
    -- La ligne 1 n'est pas une clause d'absence en soi, mais elle donne l'enjeu : c'est la franchise qui
    -- s'applique si les protections ne sont pas activées pendant l'absence. D'où liee_absence = true.
    -- Lignes 3 à 6 : conditions particulières FICTIVES de Jeanne, page 1 (même texte que le PDF de la
    -- PR #37, services/vision/tests/donnees/conditions_particulieres_fictives_jeanne.pdf) : seuil
    -- d'inoccupation de 30 jours et protections. Décision du 18/11 : CG réelles + CP fictives.
    insert into public.obligations_contrat (contrat_id, type, element, seuil, unite, texte_court, citation, clause, page,
                                            citation_retrouvee, confirmee_le, liee_absence, source)
    values
      (v_contrat, 'franchise', 'vol', 1500, 'EUR',
       'Franchise vol de 1 500 € (tranches de tarification H à J).',
       'Pour les assurés dont le patrimoine mobilier relève des tranches H à J, la franchise est de 1 500 €.',
       'Garantie particulière en cas de vol, A, article 4 : franchise applicable en cas de vol', 18, true, now(), true, 'cg'),
      (v_contrat, 'franchise', 'vol', 135, 'EUR',
       'Franchise vol ramenée à 135 € si les protections des conditions particulières sont mises en place et activées pendant l''absence (tranches H à J).',
       'Dans les hypothèses visées ci dessous, la franchise applicable est de 135 € : – s’il est constaté que les moyens de protection décrits aux conditions particulières ont été mis en place et activés pendant l’absence',
       'Garantie particulière en cas de vol, B (vols autres que dans un véhicule), article 7.2', 19, true, now(), true, 'cg'),
      (v_contrat, 'inoccupation', 'inoccupation', 30, 'jours',
       'Au-delà de 30 jours d''inoccupation, informer l''assureur avant le départ.',
       'En cas d''inoccupation de plus de 30 jours consécutifs, l''assuré informe l''assureur avant le départ.',
       'Conditions particulières (fictives), article 1 Inoccupation des locaux', 1, true, now(), true, 'cp'),
      (v_contrat, 'prevention', 'porte_entree', null, null,
       'Portes d''accès, dont la porte d''entrée, fermées à clé',
       'Toutes les portes d''accès, dont la porte d''entrée, doivent alors être fermées à clé.',
       'Conditions particulières (fictives), article 1 Inoccupation des locaux', 1, true, now(), true, 'cp'),
      (v_contrat, 'prevention', 'fenetre', null, null,
       'Volets fermés',
       'Les volets doivent alors être fermés.',
       'Conditions particulières (fictives), article 1 Inoccupation des locaux', 1, true, now(), true, 'cp'),
      (v_contrat, 'prevention', 'serrure', 3, 'points',
       'Serrure 3 points sur la porte d''entrée',
       'La porte d''entrée doit obligatoirement être équipée d''une serrure à trois points de fermeture.',
       'Conditions particulières (fictives), article 2 Moyens de protection', 1, true, now(), true, 'cp');
  end if;

  /* ---------- Léa, 24 ans, locataire ---------- */
  if v_lea is null then
    raise notice 'Compte de Léa absent : persona ignoré.';
  else
    insert into public.logements (user_id, type, etage, ascenseur, statut_occupation, conservation_jusqu_au)
    values (v_lea, 'T1', 3, false, 'locataire', date '2026-11-21')
    returning id into v_logement;

    insert into public.occupants (logement_id, libelle, deplacement, vigilance, consentement_art9_le)
    values (v_logement, 'Léa, 24 ans', 0, 'adulte', now());
  end if;

  /* ---------- Sophie et Karim, 34 ans, propriétaires, un jeune enfant ---------- */
  if v_famille is null then
    raise notice 'Compte de Sophie et Karim absent : persona ignoré.';
  else
    insert into public.logements (user_id, type, etage, ascenseur, statut_occupation, conservation_jusqu_au)
    values (v_famille, 'T4', 1, false, 'proprietaire', date '2026-11-21')
    returning id into v_logement;

    insert into public.occupants (logement_id, libelle, deplacement, vigilance, consentement_art9_le)
    values
      (v_logement, 'Sophie, 34 ans', 0, 'adulte', now()),
      (v_logement, 'Karim, 34 ans', 0, 'adulte', now()),
      (v_logement, 'Enfant, 2 ans', 0, 'jeune_enfant', now());
  end if;
end;
$$;

commit;
