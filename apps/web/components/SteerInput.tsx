"use client";

import { useState } from "react";
import { Send } from "lucide-react";

import { cn } from "@/lib/utils";

const SUGGESTIONS = ["sans découpe", "livraison rapide", "lavable"];

/**
 * Pilotage en cours de run : la consigne part à la session H par `/api/agent/steer`
 * (table `messages_agent`). Désactivé quand aucune session n'est en cours.
 */
export function SteerInput({
  actif,
  onEnvoi,
}: {
  actif: boolean;
  onEnvoi: (consigne: string) => void | Promise<void>;
}) {
  const [texte, setTexte] = useState("");
  const envoyer = async (t: string) => {
    const c = t.trim();
    if (!c || !actif) return;
    setTexte("");
    await onEnvoi(c);
  };
  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex items-center gap-2 rounded-full bg-white p-1.5 pl-5"
        onSubmit={(e) => {
          e.preventDefault();
          void envoyer(texte);
        }}
      >
        <input
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          disabled={!actif}
          maxLength={200}
          placeholder="Demandez-lui, ex. sans découpe"
          className="h-11 flex-1 bg-transparent outline-none placeholder:text-encre-douce/70 disabled:opacity-60"
          aria-label="Consigne pour l'agent"
        />
        <button
          type="submit"
          disabled={!actif || !texte.trim()}
          aria-label="Envoyer la consigne"
          className={cn("grid size-11 place-items-center rounded-full text-white", actif ? "bg-encre" : "bg-encre-douce/50")}
        >
          <Send className="size-4" />
        </button>
      </form>
      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={!actif}
            onClick={() => void envoyer(s)}
            className="h-10 rounded-full border border-gris-ligne bg-white px-4 text-sm font-bold disabled:opacity-60"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
