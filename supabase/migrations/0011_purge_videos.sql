-- 0011_purge_videos.sql
-- Conservation des vidéos du logement : un mois après l'envoi (décision du CDO, 19/11/2026).
-- Une vidéo ne sert plus après l'analyse : le modèle 3D, l'image annotée, les points et leurs cotes
-- sont gardés à part (bucket modeles3d, tables failles et analyses).
-- La base ne peut pas supprimer un fichier : effacer une ligne de storage.objects laisse le fichier
-- en place. Cette fonction liste donc les vidéos arrivées à échéance ; la route
-- /api/purge/videos, appelée chaque jour par le cron Vercel, les supprime par l'API Storage.

create or replace function public.videos_a_purger(p_limite int default 100)
returns table (chemin text, envoyee_le timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name, o.created_at
  from storage.objects o
  where o.bucket_id = 'videos'
    and o.created_at < now() - interval '1 month'
  order by o.created_at
  limit greatest(1, least(coalesce(p_limite, 100), 1000));
$$;

revoke all on function public.videos_a_purger(int) from public, anon, authenticated;
grant execute on function public.videos_a_purger(int) to service_role;
