-- 0002_rls : sécurité ligne par ligne des tables de 0001, et stockage (issue #1, sections 2 et 3).
-- Les tables créées en 0003, 0004 et 0005 reçoivent leur RLS dans leur propre migration,
-- parce qu'une policy ne peut viser qu'une table qui existe déjà.

/* ---------- Fonctions utilitaires (schéma privé, non exposé par l'API) ---------- */

create or replace function prive.est_proprietaire(p_logement_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.logements l
    where l.id = p_logement_id and l.user_id = (select auth.uid())
  );
$$;

-- Propriétaire d'une action : via sa faille ou son absence.
create or replace function prive.est_proprietaire_origine(p_faille_id uuid, p_absence_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.logements l
    where l.user_id = (select auth.uid())
      and l.id = coalesce(
        (select f.logement_id from public.failles f where f.id = p_faille_id),
        (select b.logement_id from public.absences b where b.id = p_absence_id)
      )
  );
$$;

create or replace function prive.est_proprietaire_action(p_action_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.actions a
    where a.id = p_action_id
      and prive.est_proprietaire_origine(a.faille_id, a.absence_id)
  );
$$;

revoke all on schema prive from public;
grant usage on schema prive to authenticated, service_role;
revoke all on all functions in schema prive from public, anon;
grant execute on all functions in schema prive to authenticated, service_role;

/* ---------- RLS activée sur toutes les tables, sans exception ---------- */

alter table public.logements enable row level security;
alter table public.pieces enable row level security;
alter table public.occupants enable row level security;
alter table public.declarations enable row level security;
alter table public.absences enable row level security;
alter table public.failles enable row level security;
alter table public.actions enable row level security;
alter table public.validations enable row level security;
alter table public.runs_agent enable row level security;

/* ---------- Logements : le compte propriétaire seulement ---------- */

create policy logements_proprietaire on public.logements
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

/* ---------- Tables filles du logement ---------- */

create policy pieces_proprietaire on public.pieces
  for all to authenticated
  using (prive.est_proprietaire(logement_id))
  with check (prive.est_proprietaire(logement_id));

create policy occupants_proprietaire on public.occupants
  for all to authenticated
  using (prive.est_proprietaire(logement_id))
  with check (prive.est_proprietaire(logement_id));

create policy declarations_proprietaire on public.declarations
  for all to authenticated
  using (prive.est_proprietaire(logement_id))
  with check (prive.est_proprietaire(logement_id));

create policy absences_proprietaire on public.absences
  for all to authenticated
  using (prive.est_proprietaire(logement_id))
  with check (prive.est_proprietaire(logement_id));

create policy failles_proprietaire on public.failles
  for all to authenticated
  using (prive.est_proprietaire(logement_id))
  with check (prive.est_proprietaire(logement_id));

create policy actions_proprietaire on public.actions
  for all to authenticated
  using (prive.est_proprietaire_origine(faille_id, absence_id))
  with check (prive.est_proprietaire_origine(faille_id, absence_id));

/* ---------- Agent : lecture par le propriétaire, écriture serveur uniquement ----------
   Aucune policy d'écriture : seul service_role (webhooks H, n8n), qui contourne la RLS, écrit. */

create policy validations_lecture_proprietaire on public.validations
  for select to authenticated
  using (prive.est_proprietaire_action(action_id));

create policy runs_agent_lecture_proprietaire on public.runs_agent
  for select to authenticated
  using (action_id is not null and prive.est_proprietaire_action(action_id));

/* ---------- Storage : buckets privés, chemin {user_id}/{logement_id}/… ---------- */

-- Limite de taille : l'offre gratuite plafonne l'envoi d'un fichier à 50 Mo (à confirmer),
-- d'où 50 Mo et non les 500 Mo proposés dans l'issue.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('videos', 'videos', false, 52428800, array['video/*']),
  ('contrats', 'contrats', false, 52428800, array['application/pdf']),
  ('modeles3d', 'modeles3d', false, 52428800, array['model/gltf-binary', 'application/octet-stream']),
  ('exports', 'exports', false, 52428800, array['application/pdf', 'application/json', 'model/gltf-binary', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;

create policy fichiers_lecture_proprietaire on storage.objects
  for select to authenticated
  using (
    bucket_id in ('videos', 'contrats', 'modeles3d', 'exports')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy fichiers_ajout_proprietaire on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('videos', 'contrats', 'modeles3d', 'exports')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy fichiers_modification_proprietaire on storage.objects
  for update to authenticated
  using (
    bucket_id in ('videos', 'contrats', 'modeles3d', 'exports')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id in ('videos', 'contrats', 'modeles3d', 'exports')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy fichiers_suppression_proprietaire on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('videos', 'contrats', 'modeles3d', 'exports')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
