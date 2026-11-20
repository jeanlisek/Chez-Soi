import assert from 'node:assert/strict';
import test from 'node:test';
import { detecterPageInterdite } from './boucle';

test('un mot panier dans la requête ne masque pas une commande', () => {
  assert.equal(detecterPageInterdite('https://www.ikea.com/fr/fr/checkout/?from=cart'), 'checkout');
  assert.equal(detecterPageInterdite('https://www.ikea.com/fr/fr/panier/validation/'), 'validation');
  assert.equal(detecterPageInterdite('https://www.ikea.com/fr/fr/gp/buy/?basket=1'), 'buy');
});

test('une fiche, une recherche et le panier simple restent accessibles', () => {
  for (const url of [
    'https://www.ikea.com/fr/fr/p/stopp-antiderapant-pour-tapis-90549052/',
    'https://www.ikea.com/fr/fr/search/?q=delivery&order=prix',
    'https://www.ikea.com/fr/fr/shoppingcart/',
  ]) assert.equal(detecterPageInterdite(url), null, url);
});

test('un retour vers la connexion reste interdit même depuis le panier', () => {
  assert.equal(detecterPageInterdite('https://www.ikea.com/fr/fr/shoppingcart/?next=/login'), 'login');
});

test('liste blanche Castorama : fiche, rayon, recherche et panier permis, le reste coupé', async () => {
  const { horsCheminsAutorises } = await import('./boucle');
  const { estFicheAutorisee } = await import('./fiche');
  const cs = [{ hote: 'castorama.fr', exacts: ['/'], prefixes: ['/search', '/basket'], suffixes: ['_cafr.prd', '.cat'] }];
  assert.equal(horsCheminsAutorises('https://www.castorama.fr/detecteur-de-fumee-kidde-3y29/0047871276929_CAFR.prd', cs), null);
  assert.equal(horsCheminsAutorises('https://www.castorama.fr/electricite/detecteur-de-fumee/cat_id_3163.cat', cs), null);
  assert.equal(horsCheminsAutorises('https://www.castorama.fr/search?term=d%C3%A9tecteur', cs), null);
  assert.equal(horsCheminsAutorises('https://www.castorama.fr/basket', cs), null);
  assert.match(horsCheminsAutorises('https://www.castorama.fr/checkout/delivery', cs) ?? '', /chemin non autorisé/);
  assert.equal(estFicheAutorisee('https://www.castorama.fr/x/0047871276929_CAFR.prd'), true);
  assert.equal(estFicheAutorisee('https://www.castorama.fr/basket'), false);
});
