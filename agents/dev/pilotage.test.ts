import assert from 'node:assert/strict';
import test from 'node:test';
import { etatSessionSchema, type ClientHai } from '../../apps/web/lib/hai';
import { creerPilotage } from './pilotage';

test('pilotage unique, après le seuil, avec statut relu', async () => {
  let lectures = 0, messages = 0;
  const client = {
    lireEtat: async () => { lectures++; return etatSessionSchema.parse({status:'running',steps:3}); },
    envoyerMessage: async (_id:string, texte:string) => { assert.equal(texte,'Moins de 50 €'); messages++; },
  } as unknown as ClientHai;
  const p = creerPilotage('Moins de 50 €', 3);
  await p.surEtatActif({client,sessionId:'fixture',etat:etatSessionSchema.parse({status:'running',steps:2})});
  assert.equal(lectures,0);
  for(let i=0;i<2;i++) await p.surEtatActif({client,sessionId:'fixture',etat:etatSessionSchema.parse({status:'running',steps:3})});
  assert.equal(messages,1); assert.equal(lectures,1); assert.equal(p.trace()?.etape,3);
});

test('session terminée entre deux lectures : aucun message qui la relancerait', async () => {
  const client = {
    lireEtat: async () => etatSessionSchema.parse({status:'completed',steps:4}),
    envoyerMessage: async () => { throw new Error('Envoi interdit'); },
  } as unknown as ClientHai;
  const p = creerPilotage('Moins de 50 €',3);
  await p.surEtatActif({client,sessionId:'fixture',etat:etatSessionSchema.parse({status:'running',steps:3})});
  assert.equal(p.trace(),null);
});
