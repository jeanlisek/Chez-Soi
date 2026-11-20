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

test('coupe-vent et sur mesure ne prouvent pas une découpe par l’utilisateur', () => {
  assert.match(ecartDecoupe('Traitement coupe-vent pour ce tissu') ?? '', /REFUSER/);
  assert.match(ecartDecoupe('Produit fabriqué sur mesure') ?? '', /REFUSER/);
  assert.equal(ecartDecoupe('Facile à couper aux ciseaux'), null);
});

/* ---------- Contrôle v2 : preuves lues sur la fiche par le code ---------- */
import { dimensionsSurFiche, phraseDecoupe, preuvesDepuisHtml } from './fiche';

const FICHE_STOPP = `<html><head><meta property="og:title" content="STOPP Antidérapant pour tapis, 67.5x200 cm - IKEA"></head>
<body><h1>STOPP</h1><p>Antidérapant pour tapis, 67.5x200 cm</p><p>5,99 €</p>
<p>Antidérapant facile à couper ou à plier, ou possibilité d'en combiner plusieurs, pour l'adapter à toutes les tailles et formes de tapis.</p>
<p>Ne pas couper le câble d'alimentation.</p></body></html>`;

test('v2 : la phrase de découpe est lue sur la fiche, même si l\'agent l\'a mal recopiée', () => {
  const p = preuvesDepuisHtml('https://www.ikea.com/fr/fr/p/stopp-90549052/', FICHE_STOPP, { largeur_cm: 67.5, longueur_cm: 200 });
  assert.match(p.phrase_decoupe ?? '', /facile à couper/);
  assert.match(p.phrase_decoupe ?? '', /^Antidérapant facile à couper.*tapis\.$/);
  assert.equal(p.dimensions_sur_fiche, true);
  assert.equal(p.nom_fiche, 'STOPP Antidérapant pour tapis, 67.5x200 cm');
});
test('v2 : une phrase négative ne prouve pas la découpe', () => {
  assert.equal(phraseDecoupe('Ne pas couper ce produit. Lavable en machine.'), null);
});
test('v2 : des dimensions absentes de la fiche ne sont pas prouvées', () => {
  assert.equal(dimensionsSurFiche('Antidérapant 60x120 cm', 67.5, 200), false);
  assert.equal(dimensionsSurFiche('Largeur : 67,5 cm. Longueur : 200 cm.', 67.5, 200), true);
  assert.equal(dimensionsSurFiche('Format 200 × 67,5 cm', 67.5, 200), true);
});
test('produit sans dimension (veilleuse) : ni cote ni dimensions exigées, champs commerciaux toujours exigés', async () => {
  const { controlerSortieUsage2 } = await import('./controle');
  const sortie = { trouve: true, au_panier: true, produit: 'ANKARLÄGG Veilleuse LED avec capteur', prix_eur: 2.99, lien: 'https://www.ikea.com/fr/fr/p/x-60612827/', delai_livraison: '3 jours' };
  assert.deepEqual(controlerSortieUsage2(sortie, undefined, true), []);
  assert.ok(controlerSortieUsage2(sortie).some((e) => /largeur_cm/.test(e)));
  assert.ok(controlerSortieUsage2({ ...sortie, prix_eur: undefined }, undefined, true).some((e) => /prix_eur/.test(e)));
});

test('contrôle avant validation : norme du détecteur, taille du tapis, fiche introuvable', async () => {
  const { controleDepuisHtml, ficheAControler } = await import('./fiche');
  const daaf = controleDepuisHtml('https://www.castorama.fr/x/1_CAFR.prd', '<title>Détecteur | Castorama</title><p>Norme EN 14604</p>', 'detecteur_fumee', null);
  assert.equal(daaf.alerte, null);
  assert.equal(daaf.nom, 'Détecteur');
  const sans = controleDepuisHtml('https://www.castorama.fr/x/1_CAFR.prd', '<p>Détecteur</p>', 'detecteur_fumee', null);
  assert.match(sans.alerte ?? '', /14604/);
  const cote = { largeur_cm: 38.4, longueur_cm: 58.8 };
  assert.equal(controleDepuisHtml('https://www.ikea.com/fr/fr/p/a-1/', '<p>67,5x200 cm</p><p>Facile à couper</p>', 'tapis', cote).alerte, null);
  assert.match(controleDepuisHtml('https://www.ikea.com/fr/fr/p/a-1/', '<p>67,5x200 cm</p>', 'tapis', cote).alerte ?? '', /Taille/);
  assert.match(controleDepuisHtml(null, null, 'tapis', cote).alerte ?? '', /Fiche produit/);
  assert.equal(ficheAControler('https://www.ikea.com/fr/fr/shoppingcart/', ['https://www.ikea.com/fr/fr/search/', 'https://www.ikea.com/fr/fr/p/a-1/', 'https://www.ikea.com/fr/fr/shoppingcart/']), 'https://www.ikea.com/fr/fr/p/a-1/');
});
