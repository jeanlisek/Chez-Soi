-- 0012 · Accord des habitants retirable (RGPD art. 9, art. 7.3).
--
-- Les capacités des habitants (déplacement, vue, audition, vigilance) sont des données de santé,
-- traitées seulement avec leur accord. Quand l'accord est retiré, l'app efface ces capacités et
-- garde le reste (prénom, nom, date de naissance, logement, vidéos, points) : le plan est alors
-- calculé sans adaptation aux habitants. Un habitant peut donc exister sans date d'accord, à
-- condition que ses capacités soient neutres.

alter table public.occupants
  alter column consentement_art9_le drop not null;

alter table public.occupants
  add constraint occupants_sans_accord_capacites_neutres check (
    consentement_art9_le is not null
    or (
      deplacement = 0
      and vue_reduite = false
      and audition_reduite = false
      and vigilance = 'adulte'
      and cardinality(contraintes) = 0
      and autre is null
    )
  );

comment on column public.occupants.consentement_art9_le is
  'Date de l''accord RGPD art. 9 ; null = accord retiré, capacités effacées (contrainte occupants_sans_accord_capacites_neutres).';
