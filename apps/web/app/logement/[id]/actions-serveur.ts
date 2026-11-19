"use server";

import { z } from "zod";

import { calculerPlan } from "@/lib/plan";
import { clientAdmin, clientServeur } from "@/lib/supabase/server";

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
  /** Occupant à modifier (écran Compte). Absent : le premier occupant du logement. */
  occupant_id: z.uuid().optional(),
  /** Vrai : ajoute un occupant au logement au lieu d'en modifier un. */
  nouveau: z.boolean().optional(),
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
  const recherche = supabase.from("occupants").select("id").eq("logement_id", d.logement_id);
  const { data: existant } = d.nouveau
    ? { data: null }
    : await (d.occupant_id ? recherche.eq("id", d.occupant_id) : recherche.order("created_at").limit(1)).maybeSingle();
  if (d.occupant_id && !d.nouveau && !existant) return { ok: false, message: "Occupant introuvable." };
  const { error } = existant
    ? await supabase.from("occupants").update(occupant).eq("id", existant.id)
    : await supabase.from("occupants").insert(occupant);
  if (error) return { ok: false, message: "Profil non enregistré." };

  if (d.type || d.etage !== undefined || d.statut_occupation)
    await supabase
      .from("logements")
      .update({ type: d.type, etage: d.etage, statut_occupation: d.statut_occupation })
      .eq("id", d.logement_id);

  // Le profil change les règles applicables : on recalcule le plan (l'écriture ci-dessus, sous RLS,
  // a déjà prouvé que le logement est à l'utilisateur).
  const admin = clientAdmin();
  if (admin) await calculerPlan(admin, d.logement_id).catch(() => undefined);
  return { ok: true };
}

const coteSchema = z.object({
  logement_id: z.uuid(),
  faille_id: z.uuid(),
  largeur_cm: z.number().min(10).max(1000),
  longueur_cm: z.number().min(10).max(1000),
});

/**
 * Écrit la cote confirmée par l'utilisateur (écran Faille). C'est l'entrée de l'usage 2 :
 * `get_mesures` refuse une faille sans `cote_confirmee_cm`. Le logement est vérifié sous RLS,
 * puis la faille est mise à jour côté serveur, seulement si elle appartient à ce logement.
 * Le plan est recalculé : le libellé de la contre-mesure reprend les dimensions.
 */
export async function confirmerCote(entree: z.input<typeof coteSchema>): Promise<{ ok: boolean; message?: string }> {
  const c = coteSchema.safeParse(entree);
  if (!c.success) return { ok: false, message: "Dimensions invalides." };
  const supabase = await clientServeur();
  const admin = clientAdmin();
  if (!supabase || !admin) return { ok: false, message: "Service non configuré." };
  const d = c.data;

  const { data: logement } = await supabase.from("logements").select("id").eq("id", d.logement_id).maybeSingle();
  if (!logement) return { ok: false, message: "Logement introuvable." };

  const { data: faille, error } = await admin
    .from("failles")
    .update({
      largeur_cm: d.largeur_cm,
      longueur_cm: d.longueur_cm,
      cote_confirmee_cm: Math.min(d.largeur_cm, d.longueur_cm),
      cotes_confirmees_le: new Date().toISOString(),
    })
    .eq("id", d.faille_id)
    .eq("logement_id", d.logement_id)
    .select("id")
    .maybeSingle();
  if (error || !faille) return { ok: false, message: "Cote non enregistrée." };

  await calculerPlan(admin, d.logement_id).catch(() => undefined);
  return { ok: true };
}


/** Retire un occupant du logement (jamais le dernier), sous RLS, puis recalcule le plan. */
export async function supprimerOccupant(logementId: string, occupantId: string): Promise<{ ok: boolean; message?: string }> {
  if (!z.uuid().safeParse(logementId).success || !z.uuid().safeParse(occupantId).success) return { ok: false, message: "Demande invalide." };
  const supabase = await clientServeur();
  if (!supabase) return { ok: false, message: "Service non configuré." };
  const { data: tous } = await supabase.from("occupants").select("id").eq("logement_id", logementId);
  if (!tous?.some((o) => o.id === occupantId)) return { ok: false, message: "Occupant introuvable." };
  if (tous.length < 2) return { ok: false, message: "Le logement doit garder au moins un occupant." };
  const { error } = await supabase.from("occupants").delete().eq("id", occupantId).eq("logement_id", logementId);
  if (error) return { ok: false, message: "Occupant non retiré." };
  const admin = clientAdmin();
  if (admin) await calculerPlan(admin, logementId).catch(() => undefined);
  return { ok: true };
}
