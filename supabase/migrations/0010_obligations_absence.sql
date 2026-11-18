-- 0010_obligations_absence.sql
-- Sert à l'agent les obligations liées à l'absence qui n'ont pas de durée d'inoccupation.
-- Cas d'origine : MAIF Raqvam (M2442 - 01/2023), assureur de la démo (décision du 18/11).
-- Ses conditions générales ne fixent aucune durée d'inoccupation : get_contrat_champs ne renvoie
-- donc pas de bloc inoccupation, et la seule clause liée à l'absence (art. 7.2, p. 19 : franchise
-- vol ramenée à 135 € si les protections des conditions particulières sont activées pendant
-- l'absence) restait invisible pour l'agent.
--   1. obligations_contrat.liee_absence : l'obligation dépend de l'absence (sans seuil de durée).
--   2. obligations_contrat.source : conditions générales (cg) ou conditions particulières (cp).
--   3. get_contrat_champs accepte le champ « absence » : liste des obligations liées à l'absence,
--      citation retrouvée seulement. Pas de clause, pas de champ : sans ligne, le champ est absent.

/* ---------- 1 et 2. Colonnes ---------- */

alter table public.obligations_contrat
  add column liee_absence boolean not null default false,
  add column source text not null default 'cg' check (source in ('cg', 'cp'));

comment on column public.obligations_contrat.liee_absence is
  'Vrai si l''obligation s''applique pendant une absence sans dépendre d''une durée (ex. MAIF Raqvam, art. 7.2). Le seuil de durée, lui, est une ligne de type inoccupation.';
comment on column public.obligations_contrat.source is
  'cg : conditions générales (page du PDF de l''assureur). cp : conditions particulières de l''assuré (page de ce document).';

/* ---------- 3. get_contrat_champs : champ « absence » ----------
   Reprend le corps de 0006 à l'identique et ajoute le champ « absence ».
   Même signature, mêmes droits (serveur seulement). */

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
  v_absence jsonb;
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
            select jsonb_agg(coalesce(o.texte_court, o.element) order by o.page, o.element)
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

  if 'absence' = any (p_champs) then
    select jsonb_agg(
             jsonb_strip_nulls(jsonb_build_object(
               'type', o.type,
               'element', o.element,
               'valeur', o.seuil,
               'unite', o.unite,
               'texte', coalesce(o.texte_court, o.element),
               'clause', o.clause,
               'page', o.page,
               'source', o.source
             ))
             order by o.source, o.page, o.type, o.seuil)
    into v_absence
    from public.obligations_contrat o
    where o.contrat_id = v_contrat.id
      and o.liee_absence
      and o.type <> 'inoccupation'
      and o.citation_retrouvee;

    if v_absence is not null then
      v_resultat := v_resultat || jsonb_build_object('absence', v_absence);
    end if;
  end if;

  return v_resultat;
end;
$$;

revoke all on function public.get_contrat_champs(uuid, text[]) from public, anon, authenticated;
grant execute on function public.get_contrat_champs(uuid, text[]) to service_role;
