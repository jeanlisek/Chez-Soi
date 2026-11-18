-- 0003_regles : sources, règles versionnées, conditions, diagnostics (issue #1, section 2).
-- Règle non négociable : une règle validée s'appuie sur une source P1 ou P2 vérifiée et datée.

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  rang_registre int unique,
  priorite text not null check (priorite in ('P1', 'P2', 'P3', 'P4', 'P5', 'exclu')),
  theme text,
  titre text not null,
  reference_officielle text,
  editeur text,
  type text,
  nature text check (nature in ('primaire', 'secondaire')),
  force text,
  url text,
  date_publication date,
  -- Libellé « Date / version » du registre, quand la date n'est pas un jour précis.
  version_texte text,
  date_verification date,
  statut text not null default 'garder' check (statut in ('garder', 'corriger', 'archiver', 'retirer'))
);

create table public.regles (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  code text not null,
  version int not null default 1 check (version >= 1),
  intitule text not null,
  element text not null,
  force text not null check (force in ('contrat', 'loi', 'recommande', 'information')),
  verdict_type text,
  -- Seuils lisibles par le moteur (ex. {"passage_utile_min_cm": 83}).
  parametres jsonb not null default '{}'::jsonb,
  source_id uuid references public.sources (id) on delete restrict,
  source_ref text,
  source_url text,
  statut_validation text not null default 'proposee' check (statut_validation in ('proposee', 'validee', 'retiree')),
  verifie_le date,
  relu_par text,
  unique (code, version),
  check (statut_validation <> 'validee' or (source_id is not null and verifie_le is not null))
);
comment on table public.regles is 'Une règle n''est jamais modifiée : une nouvelle version = une nouvelle ligne.';

create table public.regle_conditions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  regle_id uuid not null references public.regles (id) on delete cascade,
  -- Conditions d'un même groupe : ET. Groupes différents : OU (ex. déplacement ≥ 1 OU vue réduite).
  groupe smallint not null default 1,
  axe text not null check (
    axe in ('deplacement', 'vue_reduite', 'audition_reduite', 'vigilance', 'statut_occupation', 'absence')
    or axe like 'declaration:%'
  ),
  operateur text not null check (operateur in ('>=', '=', 'in')),
  valeur text not null
);

create table public.diagnostic_regles (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  logement_id uuid not null references public.logements (id) on delete cascade,
  faille_id uuid references public.failles (id) on delete cascade,
  regle_id uuid not null references public.regles (id) on delete restrict,
  regle_version int not null,
  verdict text not null,
  evalue_le timestamptz not null default now()
);

create index regles_source_id_idx on public.regles (source_id);
create index regle_conditions_regle_id_idx on public.regle_conditions (regle_id);
create index diagnostic_regles_logement_id_idx on public.diagnostic_regles (logement_id);
create index diagnostic_regles_faille_id_idx on public.diagnostic_regles (faille_id);
create index diagnostic_regles_regle_id_idx on public.diagnostic_regles (regle_id);

/* ---------- Garde-fous sur les règles ---------- */

-- Une règle validée doit s'appuyer sur une source P1 ou P2 vérifiée et datée.
create or replace function prive.controler_source_regle()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_priorite text;
  v_verification date;
begin
  if new.statut_validation = 'validee' then
    select s.priorite, s.date_verification into v_priorite, v_verification
    from public.sources s where s.id = new.source_id;
    if v_priorite is null or v_priorite not in ('P1', 'P2') or v_verification is null then
      raise exception 'Règle % v% : une règle validée exige une source P1 ou P2 vérifiée et datée.', new.code, new.version;
    end if;
  end if;
  return new;
end;
$$;

-- Le contenu d'une règle est figé : seuls le statut, la date de vérification et le relecteur changent.
create or replace function prive.figer_regle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.code, new.version, new.intitule, new.element, new.force, new.verdict_type,
      new.parametres, new.source_id, new.source_ref, new.source_url)
     is distinct from
     (old.code, old.version, old.intitule, old.element, old.force, old.verdict_type,
      old.parametres, old.source_id, old.source_ref, old.source_url) then
    raise exception 'Règle % v% : une règle n''est jamais modifiée, créer la version %.', old.code, old.version, old.version + 1;
  end if;
  return new;
end;
$$;

create trigger regles_controler_source
  before insert or update on public.regles
  for each row execute function prive.controler_source_regle();

create trigger regles_figer
  before update on public.regles
  for each row execute function prive.figer_regle();

/* ---------- RLS ---------- */

alter table public.sources enable row level security;
alter table public.regles enable row level security;
alter table public.regle_conditions enable row level security;
alter table public.diagnostic_regles enable row level security;

-- Référentiel : lecture par tout utilisateur authentifié, écriture service_role uniquement.
create policy sources_lecture on public.sources
  for select to authenticated using (true);

create policy regles_lecture on public.regles
  for select to authenticated using (true);

create policy regle_conditions_lecture on public.regle_conditions
  for select to authenticated using (true);

-- Diagnostics : lecture par le propriétaire du logement ; écrits par le serveur.
create policy diagnostic_regles_lecture_proprietaire on public.diagnostic_regles
  for select to authenticated
  using (prive.est_proprietaire(logement_id));
