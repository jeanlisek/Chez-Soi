-- 0004_contrats : contrat d'assurance et obligations extraites (issue #1, section 2).
-- Règle non négociable : une obligation sans page retrouvée dans le PDF est rejetée.

create table public.contrats (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  logement_id uuid not null references public.logements (id) on delete cascade,
  -- Accord écrit et daté du titulaire du contrat.
  titulaire_accord_le timestamptz not null,
  pdf_path text,
  cg_path text,
  assureur text,
  formule text,
  reference_cg text,
  version_cg text,
  version_cg_verifiee boolean not null default false,
  statut_extraction text not null default 'en_attente'
    check (statut_extraction in ('en_attente', 'en_cours', 'termine', 'echec')),
  extrait_le timestamptz,
  conservation_jusqu_au date
);

create table public.obligations_contrat (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  contrat_id uuid not null references public.contrats (id) on delete cascade,
  type public.type_obligation not null,
  element text not null,
  seuil numeric,
  unite text,
  texte_court text,
  citation text,
  clause text,
  page int not null check (page > 0),
  citation_retrouvee boolean not null default false,
  confirmee_le timestamptz
);

create index contrats_logement_id_idx on public.contrats (logement_id);
create index obligations_contrat_contrat_id_idx on public.obligations_contrat (contrat_id);

/* ---------- RLS ---------- */

alter table public.contrats enable row level security;
alter table public.obligations_contrat enable row level security;

create or replace function prive.est_proprietaire_contrat(p_contrat_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.contrats c
    where c.id = p_contrat_id and prive.est_proprietaire(c.logement_id)
  );
$$;

revoke all on function prive.est_proprietaire_contrat(uuid) from public, anon;
grant execute on function prive.est_proprietaire_contrat(uuid) to authenticated, service_role;

create policy contrats_proprietaire on public.contrats
  for all to authenticated
  using (prive.est_proprietaire(logement_id))
  with check (prive.est_proprietaire(logement_id));

create policy obligations_contrat_proprietaire on public.obligations_contrat
  for all to authenticated
  using (prive.est_proprietaire_contrat(contrat_id))
  with check (prive.est_proprietaire_contrat(contrat_id));

/* ---------- get_contrat_champs : base du custom tool get_contrat de l'agent H ----------
   Ne renvoie que les champs demandés parmi assureur, formule, reference_cg, inoccupation.
   Jamais pdf_path, cg_path ni adresse. Réservée au serveur (service_role) : un utilisateur
   authentifié ne peut pas l'appeler avec le logement d'un autre. */

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
            select jsonb_agg(o.element order by o.element)
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
