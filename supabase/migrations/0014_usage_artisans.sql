-- 0014_usage_artisans.sql
-- Usage 4 de l'agent H : trouver des artisans pour les travaux du plan (serrure multipoints,
-- élargissement de porte…), en lecture seule. L'agent ne contacte personne ; l'utilisateur
-- reçoit des artisans proches de sa commune et un message de devis à envoyer lui-même.
-- Seule la commune (code postal et ville) part chez l'agent, jamais la rue.

alter table public.actions drop constraint if exists actions_usage_check;
alter table public.actions add constraint actions_usage_check check (usage >= 1 and usage <= 4);

alter table public.runs_agent drop constraint if exists runs_agent_usage_check;
alter table public.runs_agent add constraint runs_agent_usage_check check (usage >= 1 and usage <= 4);
