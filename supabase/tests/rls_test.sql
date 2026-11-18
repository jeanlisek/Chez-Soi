-- rls_test.sql : prouve qu'un utilisateur A ne voit ni ne modifie rien des données d'un utilisateur B.
-- Tout se passe dans une transaction annulée à la fin : aucune donnée ne reste.
-- Lancer dans l'éditeur SQL ou avec psql. Succès : le message « RLS OK » ; échec : une exception.

begin;

-- Deux comptes jetables.
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'test-a@chez-soi.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'test-b@chez-soi.invalid', 'authenticated', 'authenticated');

-- Données de B, écrites comme le serveur (contourne la RLS).
insert into public.logements (id, user_id, type) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'T3');
insert into public.occupants (logement_id, libelle, deplacement, consentement_art9_le) values
  ('00000000-0000-0000-0000-0000000000b1', 'Occupant de B', 1, now());
insert into public.failles (id, logement_id, risque, element, source) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000b1', 'chute', 'tapis', 'vision');
insert into public.actions (id, faille_id, contre_mesure) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000f1', 'Sous-tapis antidérapant');
insert into public.runs_agent (action_id, usage, agent, session_id) values
  ('00000000-0000-0000-0000-0000000000c1', 2, 'h/web-surfer-flash', 'session-test-b');
insert into public.contrats (id, logement_id, titulaire_accord_le, assureur) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', now(), 'Assureur de B');

-- On devient A.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}';

do $$
declare
  n int;
begin
  select count(*) into n from public.logements;      assert n = 0, 'A voit un logement de B';
  select count(*) into n from public.occupants;      assert n = 0, 'A voit un occupant de B';
  select count(*) into n from public.failles;        assert n = 0, 'A voit une faille de B';
  select count(*) into n from public.actions;        assert n = 0, 'A voit une action de B';
  select count(*) into n from public.runs_agent;     assert n = 0, 'A voit un run de B';
  select count(*) into n from public.contrats;       assert n = 0, 'A voit un contrat de B';

  -- A ne peut pas écrire dans le logement de B.
  begin
    insert into public.occupants (logement_id, libelle, deplacement, consentement_art9_le)
    values ('00000000-0000-0000-0000-0000000000b1', 'Intrus', 0, now());
    raise exception 'A a pu ajouter un occupant chez B';
  exception when insufficient_privilege then null;
  end;

  -- A ne peut pas se créer un logement au nom de B.
  begin
    insert into public.logements (user_id, type) values ('00000000-0000-0000-0000-00000000000b', 'T1');
    raise exception 'A a pu créer un logement au nom de B';
  exception when insufficient_privilege then null;
  end;

  -- A ne peut pas écrire dans runs_agent (écriture serveur uniquement).
  begin
    insert into public.runs_agent (usage, agent, session_id) values (1, 'x', 'session-intrus');
    raise exception 'A a pu écrire dans runs_agent';
  exception when insufficient_privilege then null;
  end;

  -- A ne peut pas appeler get_contrat_champs (réservée au serveur).
  begin
    perform public.get_contrat_champs('00000000-0000-0000-0000-0000000000b1', array['assureur']);
    raise exception 'A a pu appeler get_contrat_champs';
  exception when insufficient_privilege then null;
  end;

  -- A voit le référentiel.
  select count(*) into n from public.regles;
  assert n > 0, 'A ne voit pas les règles (seed absent ?)';

  -- A voit et crée son propre logement.
  insert into public.logements (user_id, type) values ('00000000-0000-0000-0000-00000000000a', 'T2');
  select count(*) into n from public.logements;      assert n = 1, 'A ne voit pas son propre logement';

  raise notice 'RLS OK';
end;
$$;

rollback;
