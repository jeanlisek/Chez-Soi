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
  /** Profil complet (migration 0011), facultatif. */
  nom: z.string().trim().max(60).optional(),
  naissance: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  contraintes: z.array(z.string().trim().min(1).max(60)).max(12).optional(),
  autre: z.string().trim().max(300).optional(),
  adresse: z.string().trim().max(200).optional(),
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
    nom: d.nom || null,
    naissance: d.naissance || null,
    contraintes: d.contraintes ?? [],
    autre: d.autre || null,
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

  if (d.type || d.etage !== undefined || d.statut_occupation || d.adresse !== undefined)
    await supabase
      .from("logements")
      .update({ type: d.type, etage: d.etage, statut_occupation: d.statut_occupation, ...(d.adresse !== undefined ? { adresse: d.adresse || null } : {}) })
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

const occupantCompletSchema = z.object({
  id: z.uuid().optional(),
  prenom: z.string().trim().min(1).max(40),
  nom: z.string().trim().max(60),
  naissance: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
  deplacement: z.number().int().min(0).max(4),
  vue: z.number().int().min(0).max(3),
  audition: z.number().int().min(0).max(3),
  vigilance: z.array(z.string().trim().min(1).max(30)).max(8),
  autre: z.string().trim().max(300),
});
const profilCompletSchema = z.object({
  logement_id: z.uuid(),
  adresse: z.string().trim().max(200),
  type: z.string().max(10),
  etage: z.number().int().min(0).max(60).nullable(),
  statut_occupation: z.enum(["proprietaire", "locataire", "heberge"]).nullable(),
  ascenseur: z.boolean(),
  /** Accord RGPD art. 9 (AAAA-MM-JJ) : obligatoire, sans lui rien n'est enregistré. */
  accord_le: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  occupants: z.array(occupantCompletSchema).min(1).max(12),
});

/**
 * Enregistre le profil complet (écrans Profil et Compte) : le logement, puis chaque habitant
 * (ajouté, modifié ou retiré), sous RLS. Capacités fonctionnelles seulement, jamais de diagnostic.
 * Le plan est recalculé une seule fois à la fin.
 */
export async function enregistrerProfilComplet(entree: z.input<typeof profilCompletSchema>): Promise<{ ok: boolean; message?: string }> {
  const p = profilCompletSchema.safeParse(entree);
  if (!p.success) return { ok: false, message: "Profil incomplet : chaque habitant a besoin d'un prénom." };
  const supabase = await clientServeur();
  if (!supabase) return { ok: false, message: "Service non configuré." };
  const d = p.data;

  const { error: errLogement, data: logement } = await supabase
    .from("logements")
    .update({ adresse: d.adresse || null, type: d.type || null, etage: d.etage, statut_occupation: d.statut_occupation, ascenseur: d.ascenseur })
    .eq("id", d.logement_id)
    .select("id")
    .maybeSingle();
  if (errLogement || !logement) return { ok: false, message: "Logement non enregistré." };

  const { data: existants } = await supabase.from("occupants").select("id").eq("logement_id", d.logement_id);
  const ids = new Set((existants ?? []).map((o) => o.id));
  const accord = new Date(d.accord_le).toISOString();
  const gardes: string[] = [];
  for (const o of d.occupants) {
    const age = o.naissance ? new Date().getFullYear() - Number(o.naissance.slice(0, 4)) : undefined;
    const ligne = {
      logement_id: d.logement_id,
      libelle: o.prenom,
      nom: o.nom || null,
      naissance: o.naissance || null,
      deplacement: o.deplacement,
      vue_reduite: o.vue >= 2,
      audition_reduite: o.audition >= 2,
      vigilance: o.vigilance.includes("memoire") ? ("troubles_cognitifs" as const) : age !== undefined && age < 12 ? ("jeune_enfant" as const) : ("adulte" as const),
      contraintes: [...o.vigilance, `vue:${o.vue}`, `audition:${o.audition}`].slice(0, 12),
      autre: o.autre || null,
      consentement_art9_le: accord,
    };
    if (o.id && ids.has(o.id)) {
      const { error } = await supabase.from("occupants").update(ligne).eq("id", o.id);
      if (error) return { ok: false, message: `${o.prenom} : profil non enregistré.` };
      gardes.push(o.id);
    } else {
      const { data, error } = await supabase.from("occupants").insert(ligne).select("id").single();
      if (error || !data) return { ok: false, message: `${o.prenom} : profil non enregistré.` };
      gardes.push(data.id);
    }
  }
  const retires = [...ids].filter((id) => !gardes.includes(id));
  if (retires.length) await supabase.from("occupants").delete().in("id", retires).eq("logement_id", d.logement_id);

  const admin = clientAdmin();
  if (admin) await calculerPlan(admin, d.logement_id).catch(() => undefined);
  return { ok: true };
}

/**
 * « Signaler une erreur de détection » (écran du point) : retire un point de la vision que
 * l'utilisateur sait faux (le sol pris pour un tapis…). Le logement est vérifié sous RLS ;
 * ses actions partent avec lui, puis le plan est recalculé.
 */
export async function retirerPoint(logementId: string, failleId: string): Promise<{ ok: boolean; message?: string }> {
  if (!z.uuid().safeParse(logementId).success || !z.uuid().safeParse(failleId).success) return { ok: false, message: "Demande invalide." };
  const supabase = await clientServeur();
  const admin = clientAdmin();
  if (!supabase || !admin) return { ok: false, message: "Service non configuré." };
  const { data: logement } = await supabase.from("logements").select("id").eq("id", logementId).maybeSingle();
  if (!logement) return { ok: false, message: "Logement introuvable." };
  const { data, error } = await admin.from("failles").delete().eq("id", failleId).eq("logement_id", logementId).eq("source", "vision").select("id");
  if (error || !data?.length) return { ok: false, message: "Point non retiré." };
  await calculerPlan(admin, logementId).catch(() => undefined);
  return { ok: true };
}

/**
 * Retrait de l'accord des habitants (RGPD art. 9 et 7.3) : leurs capacités, données de santé, sont
 * effacées ; prénom, nom, date de naissance, logement, vidéos et points restent. Le plan est recalculé
 * sans adaptation aux habitants. La base refuse de garder une capacité sans accord (migration 0012).
 */
export async function retirerAccord(logementId: string): Promise<{ ok: boolean; message?: string }> {
  if (!z.uuid().safeParse(logementId).success) return { ok: false, message: "Demande invalide." };
  const supabase = await clientServeur();
  if (!supabase) return { ok: false, message: "Service non configuré." };
  const { data, error } = await supabase
    .from("occupants")
    .update({ consentement_art9_le: null, deplacement: 0, vue_reduite: false, audition_reduite: false, vigilance: "adulte", contraintes: [], autre: null })
    .eq("logement_id", logementId)
    .select("id");
  if (error || !data?.length) return { ok: false, message: "Accord non retiré." };
  const admin = clientAdmin();
  if (admin) await calculerPlan(admin, logementId).catch(() => undefined);
  return { ok: true };
}

const BUCKETS_DU_LOGEMENT = ["videos", "modeles3d", "exports"] as const;

/** Tous les fichiers sous un préfixe (le listage du stockage n'est pas récursif). */
async function fichiersSous(admin: NonNullable<ReturnType<typeof clientAdmin>>, bucket: string, prefixe: string): Promise<string[]> {
  const chemins: string[] = [];
  for (let page = 0; page < 20; page++) {
    const { data } = await admin.storage.from(bucket).list(prefixe, { limit: 100, offset: page * 100 });
    if (!data?.length) break;
    for (const x of data) {
      const chemin = `${prefixe}/${x.name}`;
      // Un dossier n'a pas d'identifiant : on descend dedans.
      if (x.id) chemins.push(chemin);
      else chemins.push(...(await fichiersSous(admin, bucket, chemin)));
    }
    if (data.length < 100) break;
  }
  return chemins;
}

const demenagementSchema = z.object({ logement_id: z.uuid(), adresse: z.string().trim().min(5).max(200) });

/**
 * « X déménage » : un compte = un logement. Les habitants et le contrat restent ; tout ce qui
 * décrit l'ancien logement est effacé (vidéos, modèles 3D, images, pièces, points, plan, absences,
 * éléments déclarés), car ces données personnelles n'ont plus d'usage. Type, étage et statut sont
 * redemandés. Le logement est vérifié sous RLS avant tout effacement.
 */
export async function demenager(entree: z.input<typeof demenagementSchema>): Promise<{ ok: boolean; message?: string }> {
  const p = demenagementSchema.safeParse(entree);
  if (!p.success) return { ok: false, message: "Indiquez la nouvelle adresse." };
  const supabase = await clientServeur();
  const admin = clientAdmin();
  if (!supabase || !admin) return { ok: false, message: "Service non configuré." };
  const { logement_id: id, adresse } = p.data;
  const { data: logement } = await supabase.from("logements").select("id, user_id").eq("id", id).maybeSingle();
  if (!logement) return { ok: false, message: "Logement introuvable." };

  for (const bucket of BUCKETS_DU_LOGEMENT) {
    const chemins = await fichiersSous(admin, bucket, `${logement.user_id}/${id}`);
    for (let i = 0; i < chemins.length; i += 100) {
      const { error } = await admin.storage.from(bucket).remove(chemins.slice(i, i + 100));
      if (error) return { ok: false, message: "Vidéos de l'ancien logement non effacées, réessayez." };
    }
  }
  // Les actions, validations, runs de l'agent liés et les diagnostics partent avec les points (cascade).
  for (const table of ["failles", "pieces", "absences", "declarations"] as const) {
    const { error } = await admin.from(table).delete().eq("logement_id", id);
    if (error) return { ok: false, message: "Ancien logement non effacé, réessayez." };
  }
  await admin.from("analyses").delete().eq("logement_id", id).eq("type", "video");
  const { error } = await admin
    .from("logements")
    .update({ adresse, type: null, etage: null, statut_occupation: null, ascenseur: null, modele_3d_path: null, video_path: null })
    .eq("id", id);
  if (error) return { ok: false, message: "Nouvelle adresse non enregistrée." };
  await calculerPlan(admin, id).catch(() => undefined);
  return { ok: true };
}
