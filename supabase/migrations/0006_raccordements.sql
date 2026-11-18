-- 0006_raccordements : raccorde le schéma aux workflows n8n (PR #4), au client H (PR #9),
-- à l'usage 1 (#7) et aux maquettes (#10). Décisions de Briac du 18/11 (issue #1).

/* ---------- 1. Vocabulaire commun du champ element ----------
   Strict pour regles (clé étrangère), souple pour failles, obligations_contrat et
   declarations (vue d'alerte elements_inconnus) : une valeur imprévue de la vision ne doit
   pas faire échouer tout un envoi groupé. */

create table public.elements (
  code text primary key check (code ~ '^[a-z0-9_]+$'),
  created_at timestamptz not null default now(),
  libelle text not null,
  risque public.risque,
  -- Cote que la vision ou l'utilisateur doit renseigner pour cet élément.
  cote text
);

insert into public.elements (code, libelle, risque, cote) values
  ('porte_entree', 'Porte d''entrée', 'chute', 'passage utile (cm)'),
  ('porte_interieure', 'Porte intérieure', 'chute', 'passage utile (cm)'),
  ('ressaut', 'Ressaut ou seuil', 'chute', 'hauteur (cm)'),
  ('main_courante', 'Main courante d''escalier', 'chute', 'hauteur (cm)'),
  ('marche', 'Marche d''escalier', 'chute', 'hauteur et giron (cm)'),
  ('escalier', 'Escalier', 'chute', null),
  ('tapis', 'Tapis', 'chute', 'largeur et longueur (cm)'),
  ('eclairage', 'Éclairage', 'chute', null),
  ('garde_corps', 'Garde-corps', 'chute', 'hauteur (cm)'),
  ('barriere_securite', 'Barrière de sécurité enfant', 'chute', 'largeur (cm)'),
  ('barre_appui', 'Barre d''appui', 'chute', null),
  ('fenetre', 'Fenêtre', 'intrusion', null),
  ('serrure', 'Serrure de la porte d''entrée', 'intrusion', null),
  ('detecteur_fumee', 'Détecteur de fumée', 'incendie', null),
  ('detecteur_co', 'Détecteur de monoxyde de carbone', 'autre', null),
  ('otv', 'Opération tranquillité vacances', 'intrusion', null),
  ('inoccupation', 'Inoccupation du logement', 'intrusion', null),
  ('travaux_adaptation', 'Travaux d''adaptation du logement', 'autre', null);

alter table public.regles
  add constraint regles_element_fkey foreign key (element) references public.elements (code);

create index regles_element_idx on public.regles (element);

alter table public.elements enable row level security;
create policy elements_lecture on public.elements for select to authenticated using (true);

-- Éléments utilisés quelque part mais absents du vocabulaire. Vue en security_invoker :
-- chacun n'y voit que ses propres lignes (RLS des tables sous-jacentes).
create view public.elements_inconnus with (security_invoker = true) as
  select 'failles' as origine, f.element, count(*) as occurrences
  from public.failles f
  where not exists (select 1 from public.elements e where e.code = f.element)
  group by f.element
  union all
  select 'obligations_contrat', o.element, count(*)
  from public.obligations_contrat o
  where o.element is not null and not exists (select 1 from public.elements e where e.code = o.element)
  group by o.element
  union all
  select 'declarations', d.element, count(*)
  from public.declarations d
  where not exists (select 1 from public.elements e where e.code = d.element)
  group by d.element;

/* ---------- 2. Règles versionnées : une nouvelle version hérite de la précédente ----------
   La veille (n8n) crée la version N+1 sans recopier les seuils ni les conditions. Sans
   héritage, la nouvelle version n'aurait plus de seuil et s'appliquerait à tous les profils. */

create or replace function prive.heriter_parametres_regle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parametres = '{}'::jsonb then
    select r.parametres into new.parametres
    from public.regles r
    where r.code = new.code and r.version < new.version
    order by r.version desc
    limit 1;
    new.parametres := coalesce(new.parametres, '{}'::jsonb);
  end if;
  return new;
end;
$$;

create or replace function prive.heriter_conditions_regle()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_precedente uuid;
begin
  select r.id into v_precedente
  from public.regles r
  where r.code = new.code and r.version < new.version
  order by r.version desc
  limit 1;

  if v_precedente is not null then
    insert into public.regle_conditions (regle_id, groupe, axe, operateur, valeur)
    select new.id, c.groupe, c.axe, c.operateur, c.valeur
    from public.regle_conditions c
    where c.regle_id = v_precedente;
  end if;
  return new;
end;
$$;

create trigger regles_heriter_parametres
  before insert on public.regles
  for each row execute function prive.heriter_parametres_regle();

create trigger regles_heriter_conditions
  after insert on public.regles
  for each row execute function prive.heriter_conditions_regle();

-- Dernière version validée de chaque règle : c'est ce que lit le moteur de verdict.
create view public.regles_en_vigueur with (security_invoker = true) as
  select distinct on (r.code) r.*
  from public.regles r
  where r.statut_validation = 'validee'
  order by r.code, r.version desc;

-- Validation humaine d'une règle proposée (par Briac pour la démo, depuis l'éditeur SQL).
-- Le trigger regles_controler_source refuse la validation si la source n'est pas P1/P2 vérifiée.
create or replace function public.valider_regle(p_code text, p_version int, p_relu_par text)
returns public.regles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_regle public.regles;
begin
  if coalesce(btrim(p_relu_par), '') = '' then
    raise exception 'valider_regle : indiquer qui a relu la règle.';
  end if;
  update public.regles
     set statut_validation = 'validee', verifie_le = current_date, relu_par = p_relu_par
   where code = p_code and version = p_version and statut_validation = 'proposee'
  returning * into v_regle;
  if v_regle.id is null then
    raise exception 'valider_regle : aucune règle % v% au statut proposee.', p_code, p_version;
  end if;
  return v_regle;
end;
$$;

revoke all on function public.valider_regle(text, int, text) from public, anon, authenticated;
grant execute on function public.valider_regle(text, int, text) to service_role;

/* ---------- 3. Pièces : la vision renvoie un nom, la base retrouve ou crée la pièce ---------- */

alter table public.pieces
  add column statut text not null default 'a_analyser'
    check (statut in ('a_analyser', 'a_corriger', 'ok'));

create unique index pieces_logement_nom_idx on public.pieces (logement_id, lower(btrim(nom)));

alter table public.failles
  add column piece text,
  add column largeur_cm numeric check (largeur_cm >= 0),
  add column hauteur_cm numeric check (hauteur_cm >= 0),
  add column longueur_cm numeric check (longueur_cm >= 0),
  add column cotes_confirmees_le timestamptz;

comment on column public.failles.piece is 'Nom de pièce renvoyé par la vision ; piece_id est rempli par trigger.';

create or replace function prive.relier_piece_faille()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.piece is not null and btrim(new.piece) <> '' and new.piece_id is null then
    insert into public.pieces (logement_id, nom)
    values (new.logement_id, btrim(new.piece))
    on conflict (logement_id, lower(btrim(nom))) do update set nom = public.pieces.nom
    returning id into new.piece_id;
  end if;
  return new;
end;
$$;

create trigger failles_relier_piece
  before insert or update of piece, piece_id on public.failles
  for each row execute function prive.relier_piece_faille();

/* ---------- 4. Obligations : element facultatif (n8n envoie null quand il manque) ---------- */

alter table public.obligations_contrat alter column element drop not null;

/* ---------- 5. runs_agent aligné sur runAgentSchema (apps/web/lib/schemas.ts, PR #9) ----------
   Correspondances : etat_final → statut_final ; usage "u1/u2/u3" → 1/2/3. */

alter table public.runs_agent rename column resultat to sortie_finale;
alter table public.runs_agent
  alter column tokens type jsonb using case when tokens is null then null else jsonb_build_object('total', tokens) end;

alter table public.runs_agent
  add column logement_id uuid references public.logements (id) on delete cascade,
  add column agent_revision int,
  add column site text,
  add column erreur text,
  add column motif_fin text check (motif_fin in
    ('terminee', 'delai_apres_validation', 'delai_global', 'coupe_circuit', 'interruption', 'erreur_script')),
  add column annulee_par_script boolean not null default false,
  add column coupe_circuit jsonb,
  add column debut timestamptz,
  add column fin timestamptz,
  add column cout_usd numeric check (cout_usd >= 0),
  add column decision_validation text,
  add column appels_outils jsonb,
  add column schema_valide boolean,
  add column erreurs_schema text[],
  add column ecarts_metier text[],
  add column pages_vues text[],
  add column actions_agent jsonb,
  add column observations_api jsonb;

create index runs_agent_logement_id_idx on public.runs_agent (logement_id);

-- Un run sans action (usage 1, usage 3) reste visible du propriétaire du logement.
drop policy runs_agent_lecture_proprietaire on public.runs_agent;
create policy runs_agent_lecture_proprietaire on public.runs_agent
  for select to authenticated
  using (
    (action_id is not null and prive.est_proprietaire_action(action_id))
    or (logement_id is not null and prive.est_proprietaire(logement_id))
  );

/* ---------- 6. Contrats : sorties de l'usage 1 (conditions générales retrouvées par l'agent) ---------- */

alter table public.contrats
  add column cg_url text,
  add column fiche_information_url text,
  add column cg_reference_trouvee text,
  add column cg_date_version text;

/* ---------- 7. Correction du Registre des sources, rang 3 (issue #1, 17/11) ----------
   L'ancien lien désignait l'article L113-8, pas L113-2. */

update public.sources
   set url = 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000035731302',
       version_texte = 'L113-2 en vigueur depuis le 01/04/2018, vérifié par l''API Légifrance le 17/11/2026 ; L113-4 à vérifier',
       date_verification = date '2026-11-17'
 where rang_registre = 3;

/* ---------- 8. get_contrat_champs : protections lisibles ----------
   Avec le vocabulaire commun, l'élément vaut « serrure » ; la protection exigée se lit
   dans texte_court (« serrure 3 points »). Même signature, mêmes droits (serveur seulement). */

create or replace function public.get_contrat_champs(p_logement_id uuid, p_champs text[])
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_contrat public.contrats%rowtype;
  v_resultat jsonb := '{}'::jsonb;
  v_inoccupation public.obligations_contrat%rowtype;
begin
  select * into v_contrat
  from public.contrats c
  where c.logement_id = p_logement_id
  order by c.created_at desc
  limit 1;

  if not found then
    return null;
  end if;

  if 'assureur' = any (p_champs) then
    v_resultat := v_resultat || jsonb_build_object('assureur', v_contrat.assureur);
  end if;
  if 'formule' = any (p_champs) then
    v_resultat := v_resultat || jsonb_build_object('formule', v_contrat.formule);
  end if;
  if 'reference_cg' = any (p_champs) and v_contrat.reference_cg is not null then
    v_resultat := v_resultat || jsonb_build_object('reference_cg', v_contrat.reference_cg);
  end if;

  if 'inoccupation' = any (p_champs) then
    select * into v_inoccupation
    from public.obligations_contrat o
    where o.contrat_id = v_contrat.id
      and o.type = 'inoccupation'
      and o.citation_retrouvee
      and o.seuil is not null
    order by o.confirmee_le desc nulls last, o.created_at desc
    limit 1;

    if found then
      v_resultat := v_resultat || jsonb_build_object(
        'inoccupation', jsonb_build_object(
          'duree_max_jours', v_inoccupation.seuil,
          'protections', coalesce((
            select jsonb_agg(coalesce(o.texte_court, o.element) order by o.page, o.element)
            from public.obligations_contrat o
            where o.contrat_id = v_contrat.id
              and o.type = 'prevention'
              and o.citation_retrouvee
          ), '[]'::jsonb),
          'clause', v_inoccupation.clause,
          'page', v_inoccupation.page
        )
      );
    end if;
  end if;

  return v_resultat;
end;
$$;

revoke all on function public.get_contrat_champs(uuid, text[]) from public, anon, authenticated;
grant execute on function public.get_contrat_champs(uuid, text[]) to service_role;
