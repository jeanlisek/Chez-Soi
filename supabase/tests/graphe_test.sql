-- graphe_test.sql : vérifie 0005, 0006 et 0010 sur les données du seed. Tout est annulé à la fin.
-- Succès : le message « GRAPHE OK » ; échec : une exception.

begin;

-- Données jetables : un compte B, son logement, son contrat, une clause privée liée à une règle.
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'test-a@chez-soi.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'test-b@chez-soi.invalid', 'authenticated', 'authenticated');
insert into public.logements (id, user_id, type) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'T2');
insert into public.contrats (id, logement_id, titulaire_accord_le, assureur, formule) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', now(), 'Assureur de B', 'Formule B');

do $$
declare
  v_regle_noeud uuid;
  v_clause uuid;
  v_vecteur text;
  v_json jsonb;
  v_n int;
  v_txt text;
  v_regle public.regles;
begin
  /* --- Graphe : nœud Clause privé de B, arête IMPOSE vers la règle CAMB-SERRURE (comme n8n) --- */
  select id into v_regle_noeud from public.graphe_noeuds where type = 'Regle' and proprietes ->> 'code' = 'CAMB-SERRURE';
  insert into public.graphe_noeuds (type, libelle, proprietes, contrat_id)
  values ('Clause', 'Serrure 3 points exigée', '{"page": 12}', '00000000-0000-0000-0000-0000000000d1')
  returning id into v_clause;
  insert into public.graphe_aretes (source_id, cible_id, relation) values (v_clause, v_regle_noeud, 'IMPOSE');
  -- Rejouer l'upsert de n8n ne crée pas de doublon.
  insert into public.graphe_aretes (source_id, cible_id, relation) values (v_clause, v_regle_noeud, 'IMPOSE')
  on conflict (source_id, cible_id, relation) do nothing;
  select count(*) into v_n from public.graphe_aretes where source_id = v_clause;
  assert v_n = 1, 'upsert graphe_aretes : doublon';

  /* --- Embeddings : vecteur unitaire sur 3 nœuds, recherche du plus proche --- */
  v_vecteur := '[' || array_to_string(array_fill(0::real, array[1023]) || array[1::real], ',') || ']';
  update public.graphe_noeuds set embedding = v_vecteur::extensions.vector where id = v_regle_noeud;
  update public.graphe_noeuds set embedding = v_vecteur::extensions.vector where id = v_clause;
  select count(*) into v_n from public.match_noeuds(v_vecteur::extensions.vector, 5, null);
  assert v_n = 1, 'match_noeuds sans contrat doit ignorer la clause privée de B';
  select count(*) into v_n from public.match_noeuds(v_vecteur::extensions.vector, 5, '00000000-0000-0000-0000-0000000000d1');
  assert v_n = 2, 'match_noeuds avec le contrat de B doit voir sa clause';

  /* --- sous_graphe à 2 sauts depuis la règle : Element, ContreMesure ; la clause seulement avec son contrat --- */
  v_json := public.sous_graphe(array[v_regle_noeud], 2, null);
  assert jsonb_array_length(v_json -> 'noeuds') >= 3, 'sous_graphe : trop peu de nœuds';
  assert not (v_json::text like '%' || v_clause::text || '%'), 'sous_graphe sans contrat expose la clause de B';
  v_json := public.sous_graphe(array[v_regle_noeud], 2, '00000000-0000-0000-0000-0000000000d1');
  assert v_json::text like '%' || v_clause::text || '%', 'sous_graphe avec contrat ne voit pas la clause';

  /* --- Nouvelle version d'une règle, comme la veille n8n : sans paramètres ni conditions --- */
  insert into public.regles (code, version, intitule, element, force, verdict_type, source_id, source_ref, source_url, statut_validation, verifie_le)
  select code, 2, intitule, element, force, verdict_type, source_id, 'test v2', source_url, 'proposee', current_date
  from public.regles where code = 'ESC-MAIN-COUR' and version = 1;
  select count(*) into v_n from public.regle_conditions c join public.regles r on r.id = c.regle_id
  where r.code = 'ESC-MAIN-COUR' and r.version = 2;
  assert v_n = 2, 'les conditions de la v1 ne sont pas héritées';
  select parametres ->> 'hauteur_min_cm' into v_txt from public.regles where code = 'ESC-MAIN-COUR' and version = 2;
  assert v_txt = '80', 'les paramètres de la v1 ne sont pas hérités';
  select version into v_n from public.regles_en_vigueur where code = 'ESC-MAIN-COUR';
  assert v_n = 1, 'une règle proposée ne doit pas être en vigueur';
  v_regle := public.valider_regle('ESC-MAIN-COUR', 2, 'Test');
  select version into v_n from public.regles_en_vigueur where code = 'ESC-MAIN-COUR';
  assert v_n = 2, 'la v2 validée doit être en vigueur';

  /* --- Élément inconnu : refusé pour une règle --- */
  begin
    insert into public.regles (code, intitule, element, force) values ('TEST-X', 'x', 'element_inconnu', 'recommande');
    raise exception 'une règle avec un élément inconnu a été acceptée';
  exception when foreign_key_violation then null;
  end;

  /* --- Pièces : la vision envoie un nom, la base relie la pièce (sans doublon de casse) --- */
  insert into public.failles (logement_id, risque, element, source, piece, largeur_cm, longueur_cm)
  values ('00000000-0000-0000-0000-0000000000b1', 'chute', 'tapis', 'vision', 'Salon', 60, 160),
         ('00000000-0000-0000-0000-0000000000b1', 'chute', 'eclairage', 'vision', ' salon ', null, null),
         ('00000000-0000-0000-0000-0000000000b1', 'chute', 'objet_inconnu', 'vision', 'Chambre', null, null);
  select count(*) into v_n from public.pieces where logement_id = '00000000-0000-0000-0000-0000000000b1';
  assert v_n = 2, 'pièces : attendu Salon et Chambre, sans doublon';
  select count(*) into v_n from public.failles where logement_id = '00000000-0000-0000-0000-0000000000b1' and piece_id is null;
  assert v_n = 0, 'une faille n''est pas reliée à sa pièce';
  select count(*) into v_n from public.elements_inconnus where element = 'objet_inconnu';
  assert v_n = 1, 'elements_inconnus ne signale pas objet_inconnu';

  /* --- Obligations : element facultatif ; protections lisibles --- */
  insert into public.obligations_contrat (contrat_id, type, element, seuil, unite, texte_court, clause, page, citation_retrouvee)
  values ('00000000-0000-0000-0000-0000000000d1', 'inoccupation', 'inoccupation', 30, 'jours', 'Inoccupation 30 jours', 'Inoccupation', 3, true),
         ('00000000-0000-0000-0000-0000000000d1', 'prevention', 'serrure', 3, 'points', 'Serrure 3 points', 'Prévention vol', 12, true),
         ('00000000-0000-0000-0000-0000000000d1', 'exclusion', null, null, null, 'Exclusion sans élément', 'Exclusions', 5, true);
  v_json := public.get_contrat_champs('00000000-0000-0000-0000-0000000000b1', array['inoccupation']);
  assert v_json -> 'inoccupation' -> 'protections' = '["Serrure 3 points"]'::jsonb, 'protections : ' || v_json::text;

  /* --- 0010 : obligations liées à l'absence sans durée (cas MAIF Raqvam, art. 7.2) --- */
  v_json := public.get_contrat_champs('00000000-0000-0000-0000-0000000000b1', array['absence']);
  assert not (v_json ? 'absence'), 'absence renvoyé sans ligne liée à l''absence : ' || v_json::text;
  insert into public.obligations_contrat (contrat_id, type, element, seuil, unite, texte_court, clause, page, citation_retrouvee, liee_absence, source)
  values ('00000000-0000-0000-0000-0000000000d1', 'prevention', 'serrure', 3, 'points', 'Serrure 3 points (CP)', 'CP', 1, true, true, 'cp'),
         ('00000000-0000-0000-0000-0000000000d1', 'franchise', 'vol', 135, 'EUR', 'Franchise 135 €', 'Art. 7.2', 19, true, true, 'cg'),
         ('00000000-0000-0000-0000-0000000000d1', 'franchise', 'vol', 1500, 'EUR', 'Franchise 1 500 €', 'Art. 4', 18, true, true, 'cg'),
         ('00000000-0000-0000-0000-0000000000d1', 'franchise', 'vol', 99, 'EUR', 'Non liée', 'Art. X', 20, true, false, 'cg'),
         ('00000000-0000-0000-0000-0000000000d1', 'franchise', 'vol', 98, 'EUR', 'Non retrouvée', 'Art. Y', 21, false, true, 'cg');
  v_json := public.get_contrat_champs('00000000-0000-0000-0000-0000000000b1', array['absence']);
  assert jsonb_array_length(v_json -> 'absence') = 3, 'absence : attendu 3 lignes : ' || v_json::text;
  assert (v_json -> 'absence' -> 0 ->> 'page')::int = 18 and v_json -> 'absence' -> 0 ->> 'source' = 'cg', 'absence : ordre (cg, page) : ' || v_json::text;
  assert v_json -> 'absence' -> 1 = '{"type": "franchise", "element": "vol", "valeur": 135, "unite": "EUR", "texte": "Franchise 135 €", "clause": "Art. 7.2", "page": 19, "source": "cg"}'::jsonb,
    'absence : ligne 135 € : ' || (v_json -> 'absence' -> 1)::text;
  assert v_json -> 'absence' -> 2 ->> 'source' = 'cp', 'absence : la ligne cp vient en dernier : ' || v_json::text;
  assert not (v_json ? 'inoccupation'), 'inoccupation renvoyé sans être demandé';
  begin
    insert into public.obligations_contrat (contrat_id, type, element, clause, page, source)
    values ('00000000-0000-0000-0000-0000000000d1', 'franchise', 'vol', 'Z', 1, 'autre');
    raise exception 'source « autre » acceptée';
  exception when check_violation then null;
  end;

  /* --- runs_agent : un run d'usage 1 rattaché au logement, au format runAgentSchema --- */
  insert into public.runs_agent (logement_id, usage, agent, agent_revision, session_id, statut_final, motif_fin, tokens, cout_usd, ecarts_metier)
  values ('00000000-0000-0000-0000-0000000000b1', 1, 'h/web-surfer-flash', 2, 'session-test-u1', 'completed', 'terminee',
          '{"entree": 1000, "sortie": 200}', 0.03, array['delai_livraison vide']);

  raise notice 'GRAPHE OK (étape service)';
end;
$$;

-- On devient A : aucun nœud ni aucune arête du contrat de B, aucun run de B.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}';

do $$
declare
  v_n int;
begin
  select count(*) into v_n from public.graphe_noeuds where contrat_id is not null;
  assert v_n = 0, 'A voit un nœud privé de B';
  select count(*) into v_n from public.graphe_aretes where relation = 'IMPOSE';
  assert v_n = 0, 'A voit une arête vers un nœud privé de B';
  select count(*) into v_n from public.graphe_noeuds where type = 'Regle';
  assert v_n > 0, 'A ne voit pas les nœuds publics';
  select count(*) into v_n from public.runs_agent;
  assert v_n = 0, 'A voit un run de B';
  begin
    perform public.valider_regle('DAAF', 1, 'A');
    raise exception 'A a pu valider une règle';
  exception when insufficient_privilege then null;
  end;
  raise notice 'GRAPHE OK';
end;
$$;

rollback;
