"use client";

const DELAI_MS = 10 * 60 * 1000;

/**
 * Demande le réveil du Space vision (au plus une fois toutes les 10 minutes par navigateur).
 * Sans effet sur le logement exemple, qui n'envoie rien au Space.
 */
export function reveillerVision(logementId: string, exemple: boolean) {
  if (exemple) return;
  try {
    const dernier = Number(window.sessionStorage.getItem("chez-soi:reveil-vision") ?? 0);
    if (Date.now() - dernier < DELAI_MS) return;
    window.sessionStorage.setItem("chez-soi:reveil-vision", String(Date.now()));
  } catch {
    /* stockage indisponible : on réveille quand même */
  }
  void fetch("/api/vision/reveil", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ logement_id: logementId }),
    keepalive: true,
  }).catch(() => undefined);
}
