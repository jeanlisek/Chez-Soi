"use server";

import { z } from "zod";

import { clientServeur } from "@/lib/supabase/server";

const profilSchema = z.object({
  logement_id: z.uuid(),
  libelle: z.string().trim().min(1).max(40),
  deplacement: z.number().int().min(0).max(4),
  vue_reduite: z.boolean(),
  audition_reduite: z.boolean(),
  troubles_memoire: z.boolean(),
  /** Accord RGPD art. 9 : obligatoire, daté. Sans lui, rien n'est enregistré. */
  consentement_art9_le: z.string().min(10),
  type: z.string().max(10).optional(),
  etage: z.number().int().min(-1).max(60).optional(),
  statut_occupation: z.enum(["proprietaire", "locataire", "heberge"]).optional(),
});

/** Enregistre l'occupant (capacités fonctionnelles, jamais de diagnostic) et le logement, sous RLS. */
export async function enregistrerProfil(entree: z.input<typeof profilSchema>): Promise<{ ok: boolean; message?: string }> {
  const p = profilSchema.safeParse(entree);
  if (!p.success) return { ok: false, message: "Profil incomplet." };
  const supabase = await clientServeur();
  if (!supabase) return { ok: false, message: "Service non configuré." };
  const d = p.data;

  const occupant = {
    logement_id: d.logement_id,
    libelle: d.libelle,
    deplacement: d.deplacement,
    vue_reduite: d.vue_reduite,
    audition_reduite: d.audition_reduite,
    vigilance: d.troubles_memoire ? ("troubles_cognitifs" as const) : ("adulte" as const),
    consentement_art9_le: new Date(d.consentement_art9_le).toISOString(),
  };
  const { data: existant } = await supabase
    .from("occupants")
    .select("id")
    .eq("logement_id", d.logement_id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  const { error } = existant
    ? await supabase.from("occupants").update(occupant).eq("id", existant.id)
    : await supabase.from("occupants").insert(occupant);
  if (error) return { ok: false, message: "Profil non enregistré." };

  if (d.type || d.etage !== undefined || d.statut_occupation)
    await supabase
      .from("logements")
      .update({ type: d.type, etage: d.etage, statut_occupation: d.statut_occupation })
      .eq("id", d.logement_id);
  return { ok: true };
}
