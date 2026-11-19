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
