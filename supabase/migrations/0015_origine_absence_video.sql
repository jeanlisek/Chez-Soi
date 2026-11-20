-- 0015_origine_absence_video.sql
-- Détecteur de fumée (règle DAAF, obligation légale) : la vision peut en voir un, pas prouver
-- qu'il manque. Sans détecteur vu ni déclaré, le plan ajoute un point « non repéré » qui pose la
-- question à l'utilisateur (PR #127). Ce point porte l'origine `absence_video`.

alter table public.failles drop constraint if exists failles_origine_check;
alter table public.failles add constraint failles_origine_check
  check (origine = any (array['pipeline'::text, 'manuel'::text, 'absence_video'::text]));
