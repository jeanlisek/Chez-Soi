import assert from 'node:assert/strict';
import test from 'node:test';
import { sortieUsage2Schema, versJsonSchema } from '../../apps/web/lib/schemas';
import { sortieUsage2BancSchema } from '../bench/schema_u2';

test('une compatibilité fonctionnelle ne requiert pas des dimensions de tapis', () => {
  const resultat = sortieUsage2BancSchema.parse({
    trouve:true, au_panier:false, produit:'Ampoule de test', categorie:'éclairage',
    piece:'séjour', mode_compatibilite:'fonctionnelle',
    citation_compatibilite:'Culot E27, alimentation 220-240 V.',
  });
  assert.equal(resultat.largeur_cm,undefined);
  assert.equal(resultat.longueur_cm,undefined);
});

test('un meuble distingue hauteur, profondeur et largeur à plat', () => {
  const resultat = sortieUsage2BancSchema.parse({
    trouve:true, au_panier:false, categorie:'meuble', mode_compatibilite:'encombrement',
    largeur_cm:80, hauteur_cm:70, profondeur_cm:35,
  });
  assert.equal(resultat.hauteur_cm,70); assert.equal(resultat.profondeur_cm,35);
  const schema = versJsonSchema(sortieUsage2BancSchema);
  assert.ok(!('dimensions' in (schema.properties as Record<string,unknown>)));
});

test('une dimension optionnelle ne doit pas être inventée à zéro', () => {
  assert.equal(sortieUsage2BancSchema.safeParse({trouve:true,au_panier:false,profondeur_cm:0}).success,false);
});


test('le format de l’app reste distinct du banc à trois citations', () => {
  const app = versJsonSchema(sortieUsage2Schema);
  const banc = versJsonSchema(sortieUsage2BancSchema);
  const a = app.properties as Record<string, unknown>;
  const b = banc.properties as Record<string, unknown>;
  assert.deepEqual(app.required, ['trouve', 'au_panier']);
  assert.equal(app.additionalProperties, false);
  for (const nom of ['citation_dimensions', 'citation_compatibilite', 'categorie', 'piece', 'mode_compatibilite', 'hauteur_cm', 'profondeur_cm', 'diametre_cm']) {
    assert.ok(!(nom in a), `${nom} ne doit pas changer le format de production`);
    assert.ok(nom in b, `${nom} reste disponible au banc`);
  }
  assert.ok('citation_decoupe' in a && 'citation_decoupe' in b);
});
