-- 0005_graphe : GraphRAG (issue #1, section 2 ; architecture v3, section 7).
-- Le graphe retrouve, la règle décide : le verdict se calcule sur les règles validées, jamais par le LLM.
-- Embeddings : BAAI/bge-m3, dimension 1024 (n8n/README.md, issue #1). Calculés par n8n.

create table public.graphe_noeuds (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  type text not null check (type in ('Clause', 'Article', 'Regle', 'Element', 'Faille', 'ContreMesure', 'Objet', 'Profil')),
  libelle text not null,
  proprietes jsonb not null default '{}'::jsonb,
  -- null = nœud public (loi, règle, contre-mesure) ; sinon nœud privé du contrat.
  contrat_id uuid references public.contrats (id) on delete cascade,
  regle_id uuid references public.regles (id) on delete set null,
  embedding extensions.vector(1024)
);

create table public.graphe_aretes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source_id uuid not null references public.graphe_noeuds (id) on delete cascade,
  cible_id uuid not null references public.graphe_noeuds (id) on delete cascade,
  relation text not null check (relation in ('IMPOSE', 'PORTE_SUR', 'CONCERNE', 'DETECTE_DANS', 'VIOLE', 'CORRIGE', 'REALISEE_PAR')),
  proprietes jsonb not null default '{}'::jsonb,
  -- Contrainte nécessaire à l'upsert de n8n (on_conflict=source_id,cible_id,relation).
  unique (source_id, cible_id, relation),
  check (source_id <> cible_id)
);

create index graphe_noeuds_embedding_idx on public.graphe_noeuds
  using hnsw (embedding extensions.vector_cosine_ops);
create index graphe_noeuds_type_idx on public.graphe_noeuds (type);
create index graphe_noeuds_contrat_id_idx on public.graphe_noeuds (contrat_id);
create index graphe_noeuds_regle_id_idx on public.graphe_noeuds (regle_id);
create index graphe_aretes_source_id_idx on public.graphe_aretes (source_id);
create index graphe_aretes_cible_id_idx on public.graphe_aretes (cible_id);

/* ---------- RLS : nœuds publics lisibles par tous, nœuds d'un contrat par son propriétaire ---------- */

alter table public.graphe_noeuds enable row level security;
alter table public.graphe_aretes enable row level security;

create or replace function prive.noeud_visible(p_noeud_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.graphe_noeuds n
    where n.id = p_noeud_id
      and (n.contrat_id is null or prive.est_proprietaire_contrat(n.contrat_id))
  );
$$;

revoke all on function prive.noeud_visible(uuid) from public, anon;
grant execute on function prive.noeud_visible(uuid) to authenticated, service_role;

create policy graphe_noeuds_lecture on public.graphe_noeuds
  for select to authenticated
  using (contrat_id is null or prive.est_proprietaire_contrat(contrat_id));

-- Une arête n'est visible que si ses deux nœuds le sont.
create policy graphe_aretes_lecture on public.graphe_aretes
  for select to authenticated
  using (prive.noeud_visible(source_id) and prive.noeud_visible(cible_id));

-- Aucune policy d'écriture : n8n et le serveur écrivent avec service_role.

/* ---------- RPC appelées par /api/plan ----------
   Toutes deux en SECURITY INVOKER : pour un utilisateur, la RLS s'applique en plus.
   Appelées avec service_role (qui contourne la RLS), elles ne renvoient jamais que les
   nœuds publics et ceux du contrat passé en paramètre. */

create or replace function public.match_noeuds(
  query_embedding extensions.vector(1024),
  k int default 10,
  p_contrat_id uuid default null
)
returns table (
  id uuid,
  type text,
  libelle text,
  proprietes jsonb,
  contrat_id uuid,
  regle_id uuid,
  similarite double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  select n.id, n.type, n.libelle, n.proprietes, n.contrat_id, n.regle_id,
         1 - (n.embedding operator(extensions.<=>) query_embedding) as similarite
  from public.graphe_noeuds n
  where n.embedding is not null
    and (n.contrat_id is null or n.contrat_id = p_contrat_id)
  order by n.embedding operator(extensions.<=>) query_embedding
  limit least(greatest(coalesce(k, 10), 1), 50);
$$;

-- Expansion à N sauts (2 par défaut, 3 au plus) autour des nœuds de départ.
create or replace function public.sous_graphe(
  noeud_ids uuid[],
  profondeur int default 2,
  p_contrat_id uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with recursive autorises as (
    select n.id from public.graphe_noeuds n
    where n.contrat_id is null or n.contrat_id = p_contrat_id
  ),
  parcours (id, distance) as (
    select a.id, 0
    from autorises a
    where a.id = any (noeud_ids)
    union
    select case when e.source_id = p.id then e.cible_id else e.source_id end, p.distance + 1
    from parcours p
    join public.graphe_aretes e on e.source_id = p.id or e.cible_id = p.id
    join autorises a on a.id = case when e.source_id = p.id then e.cible_id else e.source_id end
    where p.distance < least(greatest(coalesce(profondeur, 2), 0), 3)
  ),
  atteints as (
    select id, min(distance) as distance from parcours group by id
  )
  select jsonb_build_object(
    'noeuds', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', n.id, 'type', n.type, 'libelle', n.libelle, 'proprietes', n.proprietes,
        'contrat_id', n.contrat_id, 'regle_id', n.regle_id, 'distance', t.distance
      ) order by t.distance, n.type, n.libelle)
      from atteints t join public.graphe_noeuds n on n.id = t.id
    ), '[]'::jsonb),
    'aretes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'source_id', e.source_id, 'cible_id', e.cible_id,
        'relation', e.relation, 'proprietes', e.proprietes
      ))
      from public.graphe_aretes e
      where e.source_id in (select id from atteints)
        and e.cible_id in (select id from atteints)
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.match_noeuds(extensions.vector, int, uuid) from public, anon;
grant execute on function public.match_noeuds(extensions.vector, int, uuid) to authenticated, service_role;
revoke all on function public.sous_graphe(uuid[], int, uuid) from public, anon;
grant execute on function public.sous_graphe(uuid[], int, uuid) to authenticated, service_role;
