-- 0001_schema : extensions, types, tables métier (issue #1, section 2).
-- Noms métier en français, snake_case. Clés uuid, created_at partout.

create extension if not exists vector with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- Schéma privé pour les fonctions utilitaires de la RLS : il n'est pas exposé par l'API.
create schema if not exists prive;

/* ---------- Types ---------- */

create type public.vigilance as enum ('adulte', 'jeune_enfant', 'troubles_cognitifs');
create type public.statut_occupation as enum ('proprietaire', 'locataire', 'heberge');
create type public.risque as enum ('chute', 'intrusion', 'incendie', 'autre');
create type public.source_faille as enum ('vision', 'declaration');
create type public.type_obligation as enum ('prevention', 'inoccupation', 'exclusion', 'garantie', 'franchise', 'plafond');
create type public.decision as enum ('approuve', 'refuse', 'modifier');

/* ---------- Logement et occupants ---------- */

create table public.logements (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text,
  etage int,
  ascenseur boolean,
  annee_construction int check (annee_construction between 1000 and 2100),
  statut_occupation public.statut_occupation,
  zone_otv text check (zone_otv in ('police', 'gendarmerie')),
  video_path text,
  modele_3d_path text,
  conservation_jusqu_au date
);
comment on table public.logements is 'Logement rattaché au compte (ex. Marc). Pas d''adresse stockée : minimisation.';

create table public.pieces (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  logement_id uuid not null references public.logements (id) on delete cascade,
  nom text not null,
  debut_s numeric check (debut_s >= 0),
  fin_s numeric,
  qualite text,
  check (fin_s is null or debut_s is null or fin_s >= debut_s)
);

create table public.occupants (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  logement_id uuid not null references public.logements (id) on delete cascade,
  libelle text not null,
  deplacement smallint not null check (deplacement between 0 and 4),
  vue_reduite boolean not null default false,
  audition_reduite boolean not null default false,
  vigilance public.vigilance not null default 'adulte',
  -- RGPD art. 9 : pas d'occupant sans consentement explicite et daté.
  consentement_art9_le timestamptz not null
);

create table public.declarations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  logement_id uuid not null references public.logements (id) on delete cascade,
  element text not null,
  valeur text,
  declare_le timestamptz not null default now()
);

create table public.absences (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  logement_id uuid not null references public.logements (id) on delete cascade,
  depart_le date not null,
  retour_le date not null,
  depasse_seuil boolean,
  delai_otv_ok boolean,
  protections jsonb,
  check (retour_le >= depart_le)
);

/* ---------- Failles, actions, validations, runs de l'agent ---------- */

create table public.failles (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  logement_id uuid not null references public.logements (id) on delete cascade,
  piece_id uuid references public.pieces (id) on delete set null,
  risque public.risque not null,
  element text not null,
  source public.source_faille not null,
  cote_estimee_cm numeric,
  marge_cm numeric check (marge_cm >= 0),
  cote_confirmee_cm numeric,
  gravite smallint check (gravite between 1 and 3),
  priorite int,
  position_3d jsonb
);

create table public.actions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  faille_id uuid references public.failles (id) on delete cascade,
  absence_id uuid references public.absences (id) on delete cascade,
  usage smallint check (usage between 1 and 3),
  contre_mesure text not null,
  prix_indicatif numeric check (prix_indicatif >= 0),
  statut text not null default 'proposee',
  resultat jsonb,
  -- Exactement une origine : une faille ou une absence.
  check (num_nonnulls(faille_id, absence_id) = 1)
);

create table public.validations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  action_id uuid not null references public.actions (id) on delete cascade,
  session_id text not null,
  call_id text not null,
  resume text not null,
  decision public.decision,
  decide_le timestamptz,
  -- Un appel d'outil H peut arriver deux fois : écriture idempotente.
  unique (session_id, call_id)
);

create table public.runs_agent (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  action_id uuid references public.actions (id) on delete cascade,
  usage smallint not null check (usage between 1 and 3),
  agent text not null,
  -- Les webhooks H peuvent arriver deux fois : upsert sur session_id.
  session_id text not null unique,
  statut_final text,
  outcome text check (outcome in ('success', 'partial', 'infeasible', 'blocked')),
  error_code text,
  resultat jsonb,
  produit_compatible boolean,
  url_finale text,
  capture_path text,
  verifie_par_humain boolean not null default false,
  envoi_detecte boolean not null default false,
  duree_s numeric,
  nb_etapes int,
  tokens int,
  cout jsonb,
  cause_echec text
);

/* ---------- Index sur toutes les clés étrangères ---------- */

create index logements_user_id_idx on public.logements (user_id);
create index pieces_logement_id_idx on public.pieces (logement_id);
create index occupants_logement_id_idx on public.occupants (logement_id);
create index declarations_logement_id_idx on public.declarations (logement_id);
create index absences_logement_id_idx on public.absences (logement_id);
create index failles_logement_id_idx on public.failles (logement_id);
create index failles_piece_id_idx on public.failles (piece_id);
create index actions_faille_id_idx on public.actions (faille_id);
create index actions_absence_id_idx on public.actions (absence_id);
create index validations_action_id_idx on public.validations (action_id);
create index runs_agent_action_id_idx on public.runs_agent (action_id);
