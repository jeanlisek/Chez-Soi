import assert from 'node:assert/strict';
import test from 'node:test';
import { chercherCitation, ecartCitation, verifierCitationSurFiche } from './fiche';
import { ecartDecoupe } from './controle';
import { sortieUsage2Schema } from '../../apps/web/lib/schemas';

test('citation_decoupe reste une chaîne plate optionnelle (contrat PR #20)', () => {
  assert.equal(sortieUsage2Schema.safeParse({trouve:false,au_panier:false}).success,true);
  assert.equal(sortieUsage2Schema.safeParse({trouve:true,au_panier:true,citation_decoupe:'Facile à couper ou à plier'}).success,true);
  assert.equal(sortieUsage2Schema.safeParse({trouve:true,au_panier:true,citation_decoupe:{texte:'Facile à couper'}}).success,false);
});
test('une citation approchée reste un écart, une négation ne prouve pas la découpe', () => {
  const diagnostic = chercherCitation('Antidérapant pour tissus facile à couper', 'Antidérapant pour tapis facile à couper');
  assert.equal(diagnostic.statut,'approchee');
  assert.match(ecartCitation({...diagnostic,url:'https://www.ikea.com',erreur:null}) ?? '', /REFUSER/);
  assert.match(ecartDecoupe('Ne pas couper ce produit') ?? '', /REFUSER/);
});
test('la relecture refuse une URL arbitraire avant toute requête', async () => {
  assert.equal((await verifierCitationSurFiche('https://127.0.0.1/private','facile à couper')).statut,'non_verifiable');
});
