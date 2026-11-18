-- 0009_analyses_space.sql
-- Aligne la table analyses (0008) sur ce que renvoie le Space vision (services/vision/app.py, AnalyseEtat, PR #18).
-- Relecture de Jean-Li sur la PR #23 : 0008 était déjà appliquée, les corrections passent donc ici.
--   1. statut : « termine » au lieu de « terminee », comme le Space, pour que n8n recopie la valeur telle quelle.
--   2. service_analyse_id : l'analyse_id renvoyé par POST /analyse (202), dont n8n a besoin pour GET /analyse/{id}.
--   3. origine : « pipeline » (calcul en direct) ou « precalcule » (plan B de la démo), recopiée du résultat du Space.

/* ---------- 1. Statut ---------- */

alter table public.analyses drop constraint analyses_statut_check;

update public.analyses set statut = 'termine' where statut = 'terminee';

alter table public.analyses
  add constraint analyses_statut_check
  check (statut in ('en_attente', 'en_cours', 'termine', 'echec'));

/* ---------- 2. Identifiant de l'analyse côté Space ---------- */

alter table public.analyses
  add column service_analyse_id text unique;

comment on column public.analyses.service_analyse_id is
  'analyse_id renvoyé par POST /analyse du Space vision ; sert à interroger GET /analyse/{id}.';

/* ---------- 3. Origine du résultat ---------- */

alter table public.analyses
  add column origine text check (origine in ('pipeline', 'precalcule'));

-- Une analyse vidéo terminée dit toujours si elle montre un calcul en direct ou le plan B.
alter table public.analyses
  add constraint analyses_video_terminee_origine
  check (type <> 'video' or statut <> 'termine' or origine is not null);

comment on column public.analyses.origine is
  'pipeline : calcul du Space en direct ; precalcule : résultat préparé à l''avance (plan B). Obligatoire pour une vidéo terminée.';
