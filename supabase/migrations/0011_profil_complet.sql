-- 0011 · Profil complet (maquette finale de Hoang-Kim, décision de Jean-Li du 19/11).
-- Champs facultatifs, saisis par l'utilisateur dans le profil en trois étapes.
-- Données personnelles : elles restent sous la RLS existante (un utilisateur ne voit que son logement),
-- ne sont jamais renvoyées par les outils de l'agent (`get_contrat`, `get_mesures`) et ne sortent pas de l'app.
-- `contraintes` et `autre` décrivent des capacités fonctionnelles (RGPD art. 9) : jamais de diagnostic,
-- et seulement avec le consentement daté déjà exigé (`occupants.consentement_art9_le`).

alter table public.occupants
  add column if not exists nom text,
  add column if not exists naissance date,
  add column if not exists contraintes text[] not null default '{}',
  add column if not exists autre text;

alter table public.occupants
  add constraint occupants_nom_longueur check (nom is null or char_length(nom) <= 60),
  add constraint occupants_autre_longueur check (autre is null or char_length(autre) <= 300),
  add constraint occupants_contraintes_nombre check (cardinality(contraintes) <= 12),
  add constraint occupants_naissance_plausible check (naissance is null or (naissance >= date '1900-01-01' and naissance <= current_date));

alter table public.logements
  add column if not exists adresse text;

alter table public.logements
  add constraint logements_adresse_longueur check (adresse is null or char_length(adresse) <= 200);

comment on column public.occupants.naissance is 'Date de naissance, facultative : sert à proposer les points de vigilance par âge. Jamais transmise à l''agent.';
comment on column public.occupants.contraintes is 'Capacités fonctionnelles cochées dans le profil (jamais de diagnostic). Art. 9 RGPD : consentement daté requis.';
comment on column public.logements.adresse is 'Adresse du logement, facultative. Jamais transmise à l''agent ni au service vision.';
