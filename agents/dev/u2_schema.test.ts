import assert from 'node:assert/strict';
import test from 'node:test';
import { sortieUsage2Schema, versJsonSchema } from '../../apps/web/lib/schemas';

test('une compatibilité fonctionnelle ne requiert pas des dimensions de tapis', () => {
  const resultat = sortieUsage2Schema.parse({
    trouve:true, au_panier:false, produit:'Ampoule de test', categorie:'éclairage',
    piece:'séjour', mode_compatibilite:'fonctionnelle',
    citation_compatibilite:'Culot E27, alimentation 220-240 V.',
  });
  assert.equal(resultat.largeur_cm,undefined);
  assert.equal(resultat.longueur_cm,undefined);
});

test('un meuble distingue hauteur, profondeur et largeur à plat', () => {
  const resultat = sortieUsage2Schema.parse({
    trouve:true, au_panier:false, categorie:'meuble', mode_compatibilite:'encombrement',
    largeur_cm:80, hauteur_cm:70, profondeur_cm:35,
  });
  assert.equal(resultat.hauteur_cm,70); assert.equal(resultat.profondeur_cm,35);
  const schema = versJsonSchema(sortieUsage2Schema);
  assert.ok(!('dimensions' in (schema.properties as Record<string,unknown>)));
});

test('une dimension optionnelle ne doit pas être inventée à zéro', () => {
  assert.equal(sortieUsage2Schema.safeParse({trouve:true,au_panier:false,profondeur_cm:0}).success,false);
});
