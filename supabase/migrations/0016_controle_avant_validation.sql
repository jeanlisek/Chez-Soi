-- 0016_controle_avant_validation.sql
-- Le code relit la fiche produit AU MOMENT où l'agent demande la validation, et l'écran de
-- validation montre ce contrôle AVANT « Approuver » (taille compatible ou découpe écrite,
-- norme NF EN 14604, détection de mouvement). Avant, le contrôle n'avait lieu qu'après la décision.

alter table public.validations add column if not exists controle jsonb;
comment on column public.validations.controle is 'Contrôle de la fiche produit par le code, fait AVANT la décision de l''utilisateur (url de la fiche, nom lu, vérifications). Montré sur l''écran de validation.';
