import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const workflow = JSON.parse(readFileSync(new URL('../n8n/analyse_contrat.json', import.meta.url)));
const code = workflow.nodes.find(n => n.name === '05 · Filtrer les clauses').parameters.jsCode;
function filtrer(obligation) {
  return vm.runInNewContext(`(function () { ${code} })()`, {
    $json: { contrat_id: '11111111-2222-4333-8444-555555555555', extraction: { obligations: [obligation] } },
  })[0].json;
}
const clause = { type:'prevention', element:'tapis', clause:'Article 2', page:3, citation:'Maintenir les circulations dégagées.', citation_retrouvee:true };

test('une citation effectivement retrouvée conserve la clause', () => {
  assert.equal(filtrer(clause).obligations.length, 1);
});
test('une preuve absente, négative ou sous forme de chaîne est rejetée', () => {
  for (const valeur of [undefined, null, false, 'true']) {
    const resultat = filtrer({...clause, citation_retrouvee: valeur});
    assert.equal(resultat.obligations.length, 0);
    assert.equal(resultat.rejetees.length, 1);
  }
});
test('une citation vide, une page absente ou une clause manquante est rejetée', () => {
  for (const changement of [{citation:''}, {citation:'   '}, {page:null}, {clause:''}]) {
    assert.equal(filtrer({...clause,...changement}).obligations.length, 0);
  }
});

const pipeline = JSON.parse(readFileSync(new URL('../n8n/pipeline_analyse.json', import.meta.url)));
const preparerFailles = pipeline.nodes.find(n => n.name === '05 · Préparer les failles').parameters.jsCode;
test('la pièce vision est conservée pour le trigger Supabase, sans cote confirmée', () => {
  const r = vm.runInNewContext(`(function () { ${preparerFailles} })()`, {
    $json: { logement_id:'11111111-2222-4333-8444-555555555555', failles:[{element:'tapis',piece:'séjour',risque:'chute',cote_estimee_cm:160}] },
  })[0].json;
  assert.equal(r.lignes[0].piece,'séjour');
  assert.equal(Object.hasOwn(r.lignes[0],'cote_confirmee_cm'),false);
});
