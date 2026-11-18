"use client";

import { useState } from "react";
import { Box } from "lucide-react";

/**
 * Réalité augmentée (bonus de la v3). Elle n'est proposée que si le navigateur sait ouvrir
 * une session WebXR « immersive-ar » ; sinon le bouton l'explique au lieu de faire semblant.
 */
export function ARButton() {
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        aria-label="Voir en réalité augmentée"
        className="grid size-14 place-items-center rounded-full border border-gris-ligne bg-white"
        onClick={async () => {
          const xr = (navigator as Navigator & { xr?: { isSessionSupported: (m: string) => Promise<boolean> } }).xr;
          const ok = xr ? await xr.isSessionSupported("immersive-ar").catch(() => false) : false;
          setMessage(ok ? "Réalité augmentée disponible : bientôt dans Chez Soi." : "Réalité augmentée non disponible sur cet appareil.");
        }}
      >
        <Box className="size-5" />
      </button>
      <span className="text-sm font-bold">AR</span>
      {message && <span className="absolute top-2 right-2 left-2 rounded-xl bg-white p-2 text-center text-xs shadow">{message}</span>}
    </div>
  );
}
