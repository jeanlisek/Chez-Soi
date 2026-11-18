-- agent_test.sql : tests de la migration 0008 (analyses, messages_agent, webhooks_recus, assureurs, actions).
-- Tout se passe dans une transaction annulée à la fin : aucune donnée ne reste.
-- Lancer après seed.sql, dans l'éditeur SQL ou avec psql. Succès : « AGENT OK » ; échec : une exception.

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'test-a@chez-soi.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'test-b@chez-soi.invalid', 'authenticated', 'authenticated');

-- Données écrites comme le serveur (contourne la RLS).
insert into public.logements (id, user_id, type) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'T2'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'T3');
insert into public.failles (id, logement_id, risque, element, source) values
  ('00000000-0000-0000-0000-0000000000fa', '00000000-0000-0000-0000-0000000000a1', 'chute', 'tapis', 'vision'),
  ('00000000-0000-0000-0000-0000000000fb', '00000000-0000-0000-0000-0000000000b1', 'chute', 'tapis', 'vision');
insert into public.contrats (id, logement_id, titulaire_accord_le, assureur) values
  ('00000000-0000-0000-0000-0000000000db', '00000000-0000-0000-0000-0000000000b1', now(), 'Assureur de B');
insert into public.obligations_contrat (id, contrat_id, type, element, texte_court, page) values
  ('00000000-0000-0000-0000-0000000000eb', '00000000-0000-0000-0000-0000000000db', 'prevention', 'serrure', 'Serrure 3 points', 12);
insert into public.actions (id, faille_id, contre_mesure) values
  ('00000000-0000-0000-0000-0000000000cb', '00000000-0000-0000-0000-0000000000fb', 'Sous-tapis');
insert into public.runs_agent (action_id, usage, agent, session_id, controle_document) values
  ('00000000-0000-0000-0000-0000000000cb', 2, 'h/web-surfer-flash', 'session-test-b',
   '{"url": "https://exemple.invalid/cg.pdf", "domaine_officiel": true, "reference": "trouvee"}');
insert into public.messages_agent (session_id, contenu, statut_envoi, envoye_le) values
  ('session-test-b', 'moins de 50 €', 'envoye', now());
insert into public.analyses (logement_id, type, piece, statut) values
  ('00000000-0000-0000-0000-0000000000b1', 'video', 'sejour', 'en_cours');
insert into public.assureurs (nom, domaines, url_depart) values
  ('Assureur test', array['assureur-test.invalid'], 'https://assureur-test.invalid/');

-- Dédoublonnage des webhooks : la deuxième livraison identique n'insère rien.
do $$
declare
  n int;
begin
  insert into public.webhooks_recus (livraison_id, type, session_id, signature_valide)
  values ('livraison-1', 'session.completed', 'session-test-b', true);
  insert into public.webhooks_recus (livraison_id, type, session_id, signature_valide)
  values ('livraison-1', 'session.completed', 'session-test-b', true)
  on conflict (livraison_id) do nothing;
  get diagnostics n = row_count;
  assert n = 0, 'Une livraison en double a été insérée';

  -- Contraintes métier.
  begin
    insert into public.analyses (logement_id, type) values ('00000000-0000-0000-0000-0000000000b1', 'contrat');
    raise exception 'Analyse de contrat acceptée sans contrat';
  exception when check_violation then null;
  end;
  begin
    insert into public.analyses (logement_id, type, statut) values ('00000000-0000-0000-0000-0000000000b1', 'video', 'echec');
    raise exception 'Analyse en échec acceptée sans erreur';
  exception when check_violation then null;
  end;
  begin
    insert into public.actions (faille_id, contre_mesure, force)
    values ('00000000-0000-0000-0000-0000000000fb', 'x', 'contrat');
    raise exception 'Action « contrat » acceptée sans clause';
  exception when check_violation then null;
  end;
  begin
    insert into public.actions (faille_id, contre_mesure, force)
    values ('00000000-0000-0000-0000-0000000000fb', 'x', 'loi');
    raise exception 'Action « loi » acceptée sans règle';
  exception when check_violation then null;
  end;
  begin
    insert into public.messages_agent (session_id, contenu) values ('session-inconnue', 'x');
    raise exception 'Message accepté pour une session inconnue';
  exception when foreign_key_violation then null;
  end;
end;
$$;

-- On devient A.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}';

do $$
declare
  n int;
begin
  select count(*) into n from public.analyses;        assert n = 0, 'A voit une analyse de B';
  select count(*) into n from public.messages_agent;  assert n = 0, 'A voit un message de B';
  select count(*) into n from public.webhooks_recus;  assert n = 0, 'A voit le journal des webhooks';
  select count(*) into n from public.assureurs;       assert n >= 1, 'A ne voit pas le référentiel des assureurs';

  begin
    insert into public.assureurs (nom, domaines) values ('Intrus', array['intrus.invalid']);
    raise exception 'A a pu écrire dans assureurs';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.analyses (logement_id, type) values ('00000000-0000-0000-0000-0000000000a1', 'video');
    raise exception 'A a pu écrire dans analyses';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.webhooks_recus (livraison_id, type, signature_valide) values ('x', 'x', true);
    raise exception 'A a pu écrire dans webhooks_recus';
  exception when insufficient_privilege then null;
  end;

  -- A ne peut pas rattacher à sa propre action une clause du contrat de B.
  begin
    insert into public.actions (faille_id, contre_mesure, force, obligation_id)
    values ('00000000-0000-0000-0000-0000000000fa', 'Serrure', 'contrat', '00000000-0000-0000-0000-0000000000eb');
    raise exception 'A a pu citer une clause du contrat de B';
  exception when insufficient_privilege then null;
  end;

  -- A crée une action sur sa propre faille, justifiée par une règle du référentiel.
  insert into public.actions (faille_id, contre_mesure, force, priorite, regle_id, explication)
  select '00000000-0000-0000-0000-0000000000fa', 'Sous-tapis antidérapant', 'recommande', 1, r.id, 'Test'
  from public.regles_en_vigueur r where r.code = 'CHUTE-TAPIS';
  get diagnostics n = row_count;
  assert n = 1, 'A ne peut pas créer son action justifiée (règle CHUTE-TAPIS absente ?)';
end;
$$;

-- On devient B : il voit son analyse, son message et le contrôle du document.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}';

do $$
declare
  n int;
begin
  select count(*) into n from public.analyses;        assert n = 1, 'B ne voit pas son analyse';
  select count(*) into n from public.messages_agent;  assert n = 1, 'B ne voit pas son message';
  select count(*) into n from public.runs_agent where controle_document->>'reference' = 'trouvee';
  assert n = 1, 'B ne voit pas le contrôle du document';
  raise notice 'AGENT OK';
end;
$$;

rollback;
