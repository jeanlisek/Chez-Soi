import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Vérifie un webhook H (https://hub.hcompany.ai/agents-api/webhooks/overview.md) :
 * `X-H-Webhook-Signature` = « sha256= » + HMAC-SHA256 hexadécimal de `{timestamp}.{corps brut}`,
 * clé = secret du webhook ; `X-H-Webhook-Timestamp` en secondes Unix. Le corps doit être
 * vérifié tel que reçu (le re-sérialiser casse la signature). Comparaison à temps constant.
 * Une livraison plus vieille que `toleranceS` (5 min, comme le SDK) est refusée.
 */
export function verifierSignatureHai(params: {
  corpsBrut: string;
  signature: string | null;
  horodatage: string | null;
  secret: string;
  maintenantS?: number;
  toleranceS?: number;
}): { valide: boolean; raison?: string } {
  const { corpsBrut, signature, horodatage, secret } = params;
  if (!signature || !horodatage) return { valide: false, raison: "en-têtes de signature absents" };
  const ts = Number(horodatage);
  if (!Number.isFinite(ts)) return { valide: false, raison: "horodatage illisible" };
  const maintenant = params.maintenantS ?? Math.floor(Date.now() / 1000);
  if (Math.abs(maintenant - ts) > (params.toleranceS ?? 300)) {
    return { valide: false, raison: "livraison hors de la fenêtre de 5 minutes" };
  }
  const attendue = `sha256=${createHmac("sha256", secret).update(`${horodatage}.${corpsBrut}`).digest("hex")}`;
  const a = Buffer.from(attendue);
  const b = Buffer.from(signature.trim());
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { valide: false, raison: "signature invalide" };
  return { valide: true };
}
