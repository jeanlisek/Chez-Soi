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

    -- 35 jours d'absence cet hiver.
    insert into public.absences (logement_id, depart_le, retour_le)
    values (v_logement, date '2026-12-20', date '2027-01-24');

    insert into public.contrats (logement_id, titulaire_accord_le, assureur, formule, reference_cg, version_cg,
                                 version_cg_verifiee, statut_extraction, extrait_le, conservation_jusqu_au)
    values (v_logement, now(), 'Assureur fictif (démo)', 'Multirisque habitation', 'CG-DEMO-2026', '2026-01',
            false, 'termine', now(), date '2026-11-21')
    returning id into v_contrat;

    insert into public.obligations_contrat (contrat_id, type, element, seuil, unite, texte_court, citation, clause, page, citation_retrouvee, confirmee_le)
    values
      (v_contrat, 'inoccupation', 'inoccupation', 30, 'jours',
       'Au-delà de 30 jours d''inoccupation, garanties vol réduites.',
       'En cas d''inoccupation des locaux pendant plus de 30 jours consécutifs, la garantie vol est réduite (texte fictif).',
       'Inoccupation', 3, true, now()),
      (v_contrat, 'prevention', 'serrure', 3, 'points',
       'Porte d''entrée équipée d''une serrure 3 points.',
       'La porte d''entrée doit être équipée d''une serrure à trois points de fermeture (texte fictif).',
       'Mesures de prévention du vol', 12, true, now());
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
