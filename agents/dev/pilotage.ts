import { estEtatTerminal, type ClientHai, type EtatSession } from "../../apps/web/lib/hai";

/** Ne relance jamais volontairement une session terminée. Le statut est relu juste avant envoi. */
export function creerPilotage(message: string | undefined, apresEtape: number) {
  if (!Number.isInteger(apresEtape) || apresEtape < 1) throw new Error("Étape de pilotage invalide");
  let trace: { message: string; etape: number; envoye_a: string } | null = null;
  let tente = false;
  return {
    trace: () => trace,
    surEtatActif: async ({client, sessionId, etat}: {client: ClientHai; sessionId: string; etat: EtatSession}) => {
      if (!message || tente || etat.steps < apresEtape || estEtatTerminal(etat.status)) return;
      const actuel = await client.lireEtat(sessionId);
      if (estEtatTerminal(actuel.status)) return;
      tente = true; // Un timeout d'envoi ne doit pas provoquer un second envoi automatique.
      await client.envoyerMessage(sessionId, message);
      trace = {message, etape: actuel.steps, envoye_a: new Date().toISOString()};
      console.log(`Pilotage envoyé à l'étape ${actuel.steps} : ${message}`);
    },
  };
}
