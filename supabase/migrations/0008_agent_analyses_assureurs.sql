-- 0008_agent_analyses_assureurs.sql
-- Ajouts demandés par les issues ouvertes (#11, #12, #13) et la PR #17 (usage 1), plus le référentiel des assureurs.
-- Règle suivie : pas de table sans un écrivain et un lecteur identifiés.
--   1. runs_agent.controle_document : contrôle du PDF des conditions générales (controleDocumentSchema, PR #17).
--   2. assureurs : domaines officiels et page de départ de l'usage 1 (contrat_u1.json, PR #17) ; contrats.assureur_id.
--   3. webhooks_recus : dédoublonnage des livraisons H (en-tête X-H-Webhook-Delivery, #12).
--   4. analyses : état des traitements asynchrones de la vidéo et du contrat (#11, /analyse et /contrat).
--   5. messages_agent : consignes envoyées à une session en cours (/api/agent/steer, #12).
--   6. actions : priorité, force, clause ou règle qui justifie l'action, explication (#13, /api/plan).

/* ---------- 1. runs_agent : contrôle du document de l'usage 1 ---------- */

alter table public.runs_agent
  add column controle_document jsonb;

comment on column public.runs_agent.controle_document is
  'Usage 1 : contrôle du PDF par le code (controleDocumentSchema, PR #17) : url, domaine_officiel, telecharge, est_pdf, sha256, reference (trouvee, absente, non_verifiable)…';

/* ---------- 2. Référentiel des assureurs ---------- */

create table public.assureurs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nom text not null,
  -- Domaines sur lesquels le PDF des conditions générales doit se trouver (ex. {maif.fr}).
  domaines text[] not null check (cardinality(domaines) >= 1),
  -- Page publique d'où l'agent part pour chercher les conditions générales.
  url_depart text,
  verifie_le date,
  notes text
);

create unique index assureurs_nom_idx on public.assureurs (lower(btrim(nom)));

alter table public.assureurs enable row level security;

-- Référentiel public : lecture par les utilisateurs connectés, écriture serveur uniquement.
create policy assureurs_lecture on public.assureurs
  for select to authenticated using (true);

alter table public.contrats
  add column assureur_id uuid references public.assureurs (id) on delete set null;

create index contrats_assureur_id_idx on public.contrats (assureur_id);

comment on column public.contrats.assureur_id is
  'Assureur du référentiel. La colonne texte assureur reste : c''est ce qui est lu dans les conditions particulières.';

/* ---------- 3. Webhooks H reçus (dédoublonnage) ---------- */

create table public.webhooks_recus (
  id uuid primary key default gen_random_uuid(),
  recu_le timestamptz not null default now(),
  -- En-tête X-H-Webhook-Delivery, stable d'une nouvelle tentative à l'autre.
  livraison_id text not null unique,
  evenement_id text,
  type text not null,
  session_id text,
  signature_valide boolean not null,
  traite_le timestamptz,
  erreur text
);

create index webhooks_recus_session_id_idx on public.webhooks_recus (session_id);

-- RLS sans policy : seul service_role (route /api/webhooks/hai) lit et écrit.
alter table public.webhooks_recus enable row level security;

comment on table public.webhooks_recus is
  'Journal des livraisons de webhooks H. Insérer avec on conflict (livraison_id) do nothing : 0 ligne insérée = doublon, à ignorer.';

/* ---------- 4. Analyses asynchrones (vidéo et contrat) ---------- */

create table public.analyses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  logement_id uuid not null references public.logements (id) on delete cascade,
  contrat_id uuid references public.contrats (id) on delete cascade,
  type text not null check (type in ('video', 'contrat')),
  -- Une vidéo par pièce (#11) : nom de la pièce filmée.
  piece text,
  statut text not null default 'en_attente'
    check (statut in ('en_attente', 'en_cours', 'terminee', 'echec')),
  entree_path text,
  version_pipeline text,
  debut timestamptz,
  fin timestamptz,
  erreur text,
  resultat jsonb,
  check (type <> 'contrat' or contrat_id is not null),
  check (statut <> 'echec' or erreur is not null)
);

create index analyses_logement_id_idx on public.analyses (logement_id);
create index analyses_contrat_id_idx on public.analyses (contrat_id);

alter table public.analyses enable row level security;

-- Lecture par le propriétaire (suivi dans l'interface), écriture serveur (route, n8n).
create policy analyses_lecture_proprietaire on public.analyses
  for select to authenticated
  using (prive.est_proprietaire(logement_id));

/* ---------- 5. Messages de pilotage envoyés à une session ---------- */

create table public.messages_agent (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  session_id text not null references public.runs_agent (session_id) on delete cascade,
  auteur text not null default 'utilisateur' check (auteur in ('utilisateur', 'systeme')),
  contenu text not null check (char_length(contenu) between 1 and 2000),
  envoye_le timestamptz,
  statut_envoi text check (statut_envoi in ('envoye', 'echec')),
  erreur text
);

create index messages_agent_session_id_idx on public.messages_agent (session_id);

alter table public.messages_agent enable row level security;

create or replace function prive.est_proprietaire_session(p_session_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.runs_agent r
    where r.session_id = p_session_id
      and (
        (r.action_id is not null and prive.est_proprietaire_action(r.action_id))
        or (r.logement_id is not null and prive.est_proprietaire(r.logement_id))
      )
  );
$$;

revoke all on function prive.est_proprietaire_session(text) from public, anon;
grant execute on function prive.est_proprietaire_session(text) to authenticated, service_role;

-- Lecture par le propriétaire du run ; l'envoi passe par la route /api/agent/steer (serveur).
create policy messages_agent_lecture_proprietaire on public.messages_agent
  for select to authenticated
  using (prive.est_proprietaire_session(session_id));

/* ---------- 6. Actions : ce qui les justifie (#13) ---------- */

alter table public.actions
  add column priorite int check (priorite >= 1),
  -- Même vocabulaire que regles.force. Ordre du verdict : contrat, puis loi, puis recommandé.
  add column force text check (force in ('contrat', 'loi', 'recommande', 'information')),
  add column obligation_id uuid references public.obligations_contrat (id) on delete set null,
  add column regle_id uuid references public.regles (id) on delete restrict,
  -- Texte du LLM : il explique, il ne change jamais le verdict.
  add column explication text,
  -- Règle non négociable : une action « contrat » cite une clause (avec sa page), une action « loi » ou
  -- « recommandé » cite une règle (avec sa source).
  add constraint actions_contrat_cite_clause check (force is distinct from 'contrat' or obligation_id is not null),
  add constraint actions_regle_citee check (force not in ('loi', 'recommande') or regle_id is not null);

create index actions_obligation_id_idx on public.actions (obligation_id);
create index actions_regle_id_idx on public.actions (regle_id);

-- Un utilisateur ne peut rattacher à son action qu'une clause de son propre contrat.
-- (La sous-requête sur obligations_contrat est elle-même filtrée par la RLS.)
drop policy actions_proprietaire on public.actions;
create policy actions_proprietaire on public.actions
  for all to authenticated
  using (prive.est_proprietaire_origine(faille_id, absence_id))
  with check (
    prive.est_proprietaire_origine(faille_id, absence_id)
    and (obligation_id is null
         or exists (select 1 from public.obligations_contrat o where o.id = obligation_id))
  );
