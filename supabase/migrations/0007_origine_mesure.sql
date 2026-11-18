-- 0007_origine_mesure.sql
-- Origine de la mesure d'une faille (proposition de Jean-Li, issue #1, côté vision #11).
-- source (vision / declaration) dit qui a signalé la faille ;
-- origine dit si la mesure sort du pipeline ou d'une saisie manuelle (plan B de la démo).
-- Nulle quand la faille n'a pas de cote (serrure, détecteur, éclairage) ou vient d'une déclaration.

alter table public.failles
  add column origine text check (origine in ('pipeline', 'manuel'));

comment on column public.failles.origine is
  'pipeline : mesure calculée par le service vision ; manuel : valeur saisie à la main. Ne remplace pas source.';
comment on column public.failles.cote_estimee_cm is
  'Cote principale comparée par la règle (passage utile d''une porte, longueur d''un tapis). largeur_cm, longueur_cm et hauteur_cm en sont le détail.';
