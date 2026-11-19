export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      absences: {
        Row: {
          created_at: string
          delai_otv_ok: boolean | null
          depart_le: string
          depasse_seuil: boolean | null
          id: string
          logement_id: string
          protections: Json | null
          retour_le: string
        }
        Insert: {
          created_at?: string
          delai_otv_ok?: boolean | null
          depart_le: string
          depasse_seuil?: boolean | null
          id?: string
          logement_id: string
          protections?: Json | null
          retour_le: string
        }
        Update: {
          created_at?: string
          delai_otv_ok?: boolean | null
          depart_le?: string
          depasse_seuil?: boolean | null
          id?: string
          logement_id?: string
          protections?: Json | null
          retour_le?: string
        }
        Relationships: [
          {
            foreignKeyName: "absences_logement_id_fkey"
            columns: ["logement_id"]
            isOneToOne: false
            referencedRelation: "logements"
            referencedColumns: ["id"]
          },
        ]
      }
      actions: {
        Row: {
          absence_id: string | null
          contre_mesure: string
          created_at: string
          explication: string | null
          faille_id: string | null
          force: string | null
          id: string
          obligation_id: string | null
          priorite: number | null
          prix_indicatif: number | null
          regle_id: string | null
          resultat: Json | null
          statut: string
          usage: number | null
        }
        Insert: {
          absence_id?: string | null
          contre_mesure: string
          created_at?: string
          explication?: string | null
          faille_id?: string | null
          force?: string | null
          id?: string
          obligation_id?: string | null
          priorite?: number | null
          prix_indicatif?: number | null
          regle_id?: string | null
          resultat?: Json | null
          statut?: string
          usage?: number | null
        }
        Update: {
          absence_id?: string | null
          contre_mesure?: string
          created_at?: string
          explication?: string | null
          faille_id?: string | null
          force?: string | null
          id?: string
          obligation_id?: string | null
          priorite?: number | null
          prix_indicatif?: number | null
          regle_id?: string | null
          resultat?: Json | null
          statut?: string
          usage?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "actions_absence_id_fkey"
            columns: ["absence_id"]
            isOneToOne: false
            referencedRelation: "absences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actions_faille_id_fkey"
            columns: ["faille_id"]
            isOneToOne: false
            referencedRelation: "failles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actions_obligation_id_fkey"
            columns: ["obligation_id"]
            isOneToOne: false
            referencedRelation: "obligations_contrat"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actions_regle_id_fkey"
            columns: ["regle_id"]
            isOneToOne: false
            referencedRelation: "regles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actions_regle_id_fkey"
            columns: ["regle_id"]
            isOneToOne: false
            referencedRelation: "regles_en_vigueur"
            referencedColumns: ["id"]
          },
        ]
      }
      analyses: {
        Row: {
          contrat_id: string | null
          created_at: string
          debut: string | null
          entree_path: string | null
          erreur: string | null
          fin: string | null
          id: string
          logement_id: string
          origine: string | null
          piece: string | null
          resultat: Json | null
          service_analyse_id: string | null
          statut: string
          type: string
          version_pipeline: string | null
        }
        Insert: {
          contrat_id?: string | null
          created_at?: string
          debut?: string | null
          entree_path?: string | null
          erreur?: string | null
          fin?: string | null
          id?: string
          logement_id: string
          origine?: string | null
          piece?: string | null
          resultat?: Json | null
          service_analyse_id?: string | null
          statut?: string
          type: string
          version_pipeline?: string | null
        }
        Update: {
          contrat_id?: string | null
          created_at?: string
          debut?: string | null
          entree_path?: string | null
          erreur?: string | null
          fin?: string | null
          id?: string
          logement_id?: string
          origine?: string | null
          piece?: string | null
          resultat?: Json | null
          service_analyse_id?: string | null
          statut?: string
          type?: string
          version_pipeline?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analyses_contrat_id_fkey"
            columns: ["contrat_id"]
            isOneToOne: false
            referencedRelation: "contrats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analyses_logement_id_fkey"
            columns: ["logement_id"]
            isOneToOne: false
            referencedRelation: "logements"
            referencedColumns: ["id"]
          },
        ]
      }
      assureurs: {
        Row: {
          created_at: string
          domaines: string[]
          id: string
          nom: string
          notes: string | null
          url_depart: string | null
          verifie_le: string | null
        }
        Insert: {
          created_at?: string
          domaines: string[]
          id?: string
          nom: string
          notes?: string | null
          url_depart?: string | null
          verifie_le?: string | null
        }
        Update: {
          created_at?: string
          domaines?: string[]
          id?: string
          nom?: string
          notes?: string | null
          url_depart?: string | null
          verifie_le?: string | null
        }
        Relationships: []
      }
      contrats: {
        Row: {
          assureur: string | null
          assureur_id: string | null
          cg_date_version: string | null
          cg_path: string | null
          cg_reference_trouvee: string | null
          cg_url: string | null
          conservation_jusqu_au: string | null
          created_at: string
          extrait_le: string | null
          fiche_information_url: string | null
          formule: string | null
          id: string
          logement_id: string
          pdf_path: string | null
          reference_cg: string | null
          statut_extraction: string
          titulaire_accord_le: string
          version_cg: string | null
          version_cg_verifiee: boolean
        }
        Insert: {
          assureur?: string | null
          assureur_id?: string | null
          cg_date_version?: string | null
          cg_path?: string | null
          cg_reference_trouvee?: string | null
          cg_url?: string | null
          conservation_jusqu_au?: string | null
          created_at?: string
          extrait_le?: string | null
          fiche_information_url?: string | null
          formule?: string | null
          id?: string
          logement_id: string
          pdf_path?: string | null
          reference_cg?: string | null
          statut_extraction?: string
          titulaire_accord_le: string
          version_cg?: string | null
          version_cg_verifiee?: boolean
        }
        Update: {
          assureur?: string | null
          assureur_id?: string | null
          cg_date_version?: string | null
          cg_path?: string | null
          cg_reference_trouvee?: string | null
          cg_url?: string | null
          conservation_jusqu_au?: string | null
          created_at?: string
          extrait_le?: string | null
          fiche_information_url?: string | null
          formule?: string | null
          id?: string
          logement_id?: string
          pdf_path?: string | null
          reference_cg?: string | null
          statut_extraction?: string
          titulaire_accord_le?: string
          version_cg?: string | null
          version_cg_verifiee?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "contrats_assureur_id_fkey"
            columns: ["assureur_id"]
            isOneToOne: false
            referencedRelation: "assureurs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrats_logement_id_fkey"
            columns: ["logement_id"]
            isOneToOne: false
            referencedRelation: "logements"
            referencedColumns: ["id"]
          },
        ]
      }
      declarations: {
        Row: {
          created_at: string
          declare_le: string
          element: string
          id: string
          logement_id: string
          valeur: string | null
        }
        Insert: {
          created_at?: string
          declare_le?: string
          element: string
          id?: string
          logement_id: string
          valeur?: string | null
        }
        Update: {
          created_at?: string
          declare_le?: string
          element?: string
          id?: string
          logement_id?: string
          valeur?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "declarations_logement_id_fkey"
            columns: ["logement_id"]
            isOneToOne: false
            referencedRelation: "logements"
            referencedColumns: ["id"]
          },
        ]
      }
      diagnostic_regles: {
        Row: {
          created_at: string
          evalue_le: string
          faille_id: string | null
          id: string
          logement_id: string
          regle_id: string
          regle_version: number
          verdict: string
        }
        Insert: {
          created_at?: string
          evalue_le?: string
          faille_id?: string | null
          id?: string
          logement_id: string
          regle_id: string
          regle_version: number
          verdict: string
        }
        Update: {
          created_at?: string
          evalue_le?: string
          faille_id?: string | null
          id?: string
          logement_id?: string
          regle_id?: string
          regle_version?: number
          verdict?: string
        }
        Relationships: [
          {
            foreignKeyName: "diagnostic_regles_faille_id_fkey"
            columns: ["faille_id"]
            isOneToOne: false
            referencedRelation: "failles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diagnostic_regles_logement_id_fkey"
            columns: ["logement_id"]
            isOneToOne: false
            referencedRelation: "logements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diagnostic_regles_regle_id_fkey"
            columns: ["regle_id"]
            isOneToOne: false
            referencedRelation: "regles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diagnostic_regles_regle_id_fkey"
            columns: ["regle_id"]
            isOneToOne: false
            referencedRelation: "regles_en_vigueur"
            referencedColumns: ["id"]
          },
        ]
      }
      elements: {
        Row: {
          code: string
          cote: string | null
          created_at: string
          libelle: string
          risque: Database["public"]["Enums"]["risque"] | null
        }
        Insert: {
          code: string
          cote?: string | null
          created_at?: string
          libelle: string
          risque?: Database["public"]["Enums"]["risque"] | null
        }
        Update: {
          code?: string
          cote?: string | null
          created_at?: string
          libelle?: string
          risque?: Database["public"]["Enums"]["risque"] | null
        }
        Relationships: []
      }
      failles: {
        Row: {
          cote_confirmee_cm: number | null
          cote_estimee_cm: number | null
          cotes_confirmees_le: string | null
          created_at: string
          element: string
          gravite: number | null
          hauteur_cm: number | null
          id: string
          largeur_cm: number | null
          logement_id: string
          longueur_cm: number | null
          marge_cm: number | null
          origine: string | null
          piece: string | null
          piece_id: string | null
          position_3d: Json | null
          priorite: number | null
          risque: Database["public"]["Enums"]["risque"]
          source: Database["public"]["Enums"]["source_faille"]
        }
        Insert: {
          cote_confirmee_cm?: number | null
          cote_estimee_cm?: number | null
          cotes_confirmees_le?: string | null
          created_at?: string
          element: string
          gravite?: number | null
          hauteur_cm?: number | null
          id?: string
          largeur_cm?: number | null
          logement_id: string
          longueur_cm?: number | null
          marge_cm?: number | null
          origine?: string | null
          piece?: string | null
          piece_id?: string | null
          position_3d?: Json | null
          priorite?: number | null
          risque: Database["public"]["Enums"]["risque"]
          source: Database["public"]["Enums"]["source_faille"]
        }
        Update: {
          cote_confirmee_cm?: number | null
          cote_estimee_cm?: number | null
          cotes_confirmees_le?: string | null
          created_at?: string
          element?: string
          gravite?: number | null
          hauteur_cm?: number | null
          id?: string
          largeur_cm?: number | null
          logement_id?: string
          longueur_cm?: number | null
          marge_cm?: number | null
          origine?: string | null
          piece?: string | null
          piece_id?: string | null
          position_3d?: Json | null
          priorite?: number | null
          risque?: Database["public"]["Enums"]["risque"]
          source?: Database["public"]["Enums"]["source_faille"]
        }
        Relationships: [
          {
            foreignKeyName: "failles_logement_id_fkey"
            columns: ["logement_id"]
            isOneToOne: false
            referencedRelation: "logements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "failles_piece_id_fkey"
            columns: ["piece_id"]
            isOneToOne: false
            referencedRelation: "pieces"
            referencedColumns: ["id"]
          },
        ]
      }
      graphe_aretes: {
        Row: {
          cible_id: string
          created_at: string
          id: string
          proprietes: Json
          relation: string
          source_id: string
        }
        Insert: {
          cible_id: string
          created_at?: string
          id?: string
          proprietes?: Json
          relation: string
          source_id: string
        }
        Update: {
          cible_id?: string
          created_at?: string
          id?: string
          proprietes?: Json
          relation?: string
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "graphe_aretes_cible_id_fkey"
            columns: ["cible_id"]
            isOneToOne: false
            referencedRelation: "graphe_noeuds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graphe_aretes_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "graphe_noeuds"
            referencedColumns: ["id"]
          },
        ]
      }
      graphe_noeuds: {
        Row: {
          contrat_id: string | null
          created_at: string
          embedding: string | null
          id: string
          libelle: string
          proprietes: Json
          regle_id: string | null
          type: string
        }
        Insert: {
          contrat_id?: string | null
          created_at?: string
          embedding?: string | null
          id?: string
          libelle: string
          proprietes?: Json
          regle_id?: string | null
          type: string
        }
        Update: {
          contrat_id?: string | null
          created_at?: string
          embedding?: string | null
          id?: string
          libelle?: string
          proprietes?: Json
          regle_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "graphe_noeuds_contrat_id_fkey"
            columns: ["contrat_id"]
            isOneToOne: false
            referencedRelation: "contrats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graphe_noeuds_regle_id_fkey"
            columns: ["regle_id"]
            isOneToOne: false
            referencedRelation: "regles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graphe_noeuds_regle_id_fkey"
            columns: ["regle_id"]
            isOneToOne: false
            referencedRelation: "regles_en_vigueur"
            referencedColumns: ["id"]
          },
        ]
      }
      logements: {
        Row: {
          annee_construction: number | null
          ascenseur: boolean | null
          conservation_jusqu_au: string | null
          created_at: string
          etage: number | null
          id: string
          modele_3d_path: string | null
          statut_occupation:
            | Database["public"]["Enums"]["statut_occupation"]
            | null
          type: string | null
          user_id: string
          video_path: string | null
          zone_otv: string | null
        }
        Insert: {
          annee_construction?: number | null
          ascenseur?: boolean | null
          conservation_jusqu_au?: string | null
          created_at?: string
          etage?: number | null
          id?: string
          modele_3d_path?: string | null
          statut_occupation?:
            | Database["public"]["Enums"]["statut_occupation"]
            | null
          type?: string | null
          user_id: string
          video_path?: string | null
          zone_otv?: string | null
        }
        Update: {
          annee_construction?: number | null
          ascenseur?: boolean | null
          conservation_jusqu_au?: string | null
          created_at?: string
          etage?: number | null
          id?: string
          modele_3d_path?: string | null
          statut_occupation?:
            | Database["public"]["Enums"]["statut_occupation"]
            | null
          type?: string | null
          user_id?: string
          video_path?: string | null
          zone_otv?: string | null
        }
        Relationships: []
      }
      messages_agent: {
        Row: {
          auteur: string
          contenu: string
          created_at: string
          envoye_le: string | null
          erreur: string | null
          id: string
          session_id: string
          statut_envoi: string | null
        }
        Insert: {
          auteur?: string
          contenu: string
          created_at?: string
          envoye_le?: string | null
          erreur?: string | null
          id?: string
          session_id: string
          statut_envoi?: string | null
        }
        Update: {
          auteur?: string
          contenu?: string
          created_at?: string
          envoye_le?: string | null
          erreur?: string | null
          id?: string
          session_id?: string
          statut_envoi?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_agent_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "runs_agent"
            referencedColumns: ["session_id"]
          },
        ]
      }
      obligations_contrat: {
        Row: {
          citation: string | null
          citation_retrouvee: boolean
          clause: string | null
          confirmee_le: string | null
          contrat_id: string
          created_at: string
          element: string | null
          id: string
          liee_absence: boolean
          page: number
          seuil: number | null
          source: string
          texte_court: string | null
          type: Database["public"]["Enums"]["type_obligation"]
          unite: string | null
        }
        Insert: {
          citation?: string | null
          citation_retrouvee?: boolean
          clause?: string | null
          confirmee_le?: string | null
          contrat_id: string
          created_at?: string
          element?: string | null
          id?: string
          liee_absence?: boolean
          page: number
          seuil?: number | null
          source?: string
          texte_court?: string | null
          type: Database["public"]["Enums"]["type_obligation"]
          unite?: string | null
        }
        Update: {
          citation?: string | null
          citation_retrouvee?: boolean
          clause?: string | null
          confirmee_le?: string | null
          contrat_id?: string
          created_at?: string
          element?: string | null
          id?: string
          liee_absence?: boolean
          page?: number
          seuil?: number | null
          source?: string
          texte_court?: string | null
          type?: Database["public"]["Enums"]["type_obligation"]
          unite?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "obligations_contrat_contrat_id_fkey"
            columns: ["contrat_id"]
            isOneToOne: false
            referencedRelation: "contrats"
            referencedColumns: ["id"]
          },
        ]
      }
      occupants: {
        Row: {
          audition_reduite: boolean
          consentement_art9_le: string
          created_at: string
          deplacement: number
          id: string
          libelle: string
          logement_id: string
          vigilance: Database["public"]["Enums"]["vigilance"]
          vue_reduite: boolean
        }
        Insert: {
          audition_reduite?: boolean
          consentement_art9_le: string
          created_at?: string
          deplacement: number
          id?: string
          libelle: string
          logement_id: string
          vigilance?: Database["public"]["Enums"]["vigilance"]
          vue_reduite?: boolean
        }
        Update: {
          audition_reduite?: boolean
          consentement_art9_le?: string
          created_at?: string
          deplacement?: number
          id?: string
          libelle?: string
          logement_id?: string
          vigilance?: Database["public"]["Enums"]["vigilance"]
          vue_reduite?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "occupants_logement_id_fkey"
            columns: ["logement_id"]
            isOneToOne: false
            referencedRelation: "logements"
            referencedColumns: ["id"]
          },
        ]
      }
      pieces: {
        Row: {
          created_at: string
          debut_s: number | null
          fin_s: number | null
          id: string
          logement_id: string
          nom: string
          qualite: string | null
          statut: string
        }
        Insert: {
          created_at?: string
          debut_s?: number | null
          fin_s?: number | null
          id?: string
          logement_id: string
          nom: string
          qualite?: string | null
          statut?: string
        }
        Update: {
          created_at?: string
          debut_s?: number | null
          fin_s?: number | null
          id?: string
          logement_id?: string
          nom?: string
          qualite?: string | null
          statut?: string
        }
        Relationships: [
          {
            foreignKeyName: "pieces_logement_id_fkey"
            columns: ["logement_id"]
            isOneToOne: false
            referencedRelation: "logements"
            referencedColumns: ["id"]
          },
        ]
      }
      regle_conditions: {
        Row: {
          axe: string
          created_at: string
          groupe: number
          id: string
          operateur: string
          regle_id: string
          valeur: string
        }
        Insert: {
          axe: string
          created_at?: string
          groupe?: number
          id?: string
          operateur: string
          regle_id: string
          valeur: string
        }
        Update: {
          axe?: string
          created_at?: string
          groupe?: number
          id?: string
          operateur?: string
          regle_id?: string
          valeur?: string
        }
        Relationships: [
          {
            foreignKeyName: "regle_conditions_regle_id_fkey"
            columns: ["regle_id"]
            isOneToOne: false
            referencedRelation: "regles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regle_conditions_regle_id_fkey"
            columns: ["regle_id"]
            isOneToOne: false
            referencedRelation: "regles_en_vigueur"
            referencedColumns: ["id"]
          },
        ]
      }
      regles: {
        Row: {
          code: string
          created_at: string
          element: string
          force: string
          id: string
          intitule: string
          parametres: Json
          relu_par: string | null
          source_id: string | null
          source_ref: string | null
          source_url: string | null
          statut_validation: string
          verdict_type: string | null
          verifie_le: string | null
          version: number
        }
        Insert: {
          code: string
          created_at?: string
          element: string
          force: string
          id?: string
          intitule: string
          parametres?: Json
          relu_par?: string | null
          source_id?: string | null
          source_ref?: string | null
          source_url?: string | null
          statut_validation?: string
          verdict_type?: string | null
          verifie_le?: string | null
          version?: number
        }
        Update: {
          code?: string
          created_at?: string
          element?: string
          force?: string
          id?: string
          intitule?: string
          parametres?: Json
          relu_par?: string | null
          source_id?: string | null
          source_ref?: string | null
          source_url?: string | null
          statut_validation?: string
          verdict_type?: string | null
          verifie_le?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "regles_element_fkey"
            columns: ["element"]
            isOneToOne: false
            referencedRelation: "elements"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "regles_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      runs_agent: {
        Row: {
          action_id: string | null
          actions_agent: Json | null
          agent: string
          agent_revision: number | null
          annulee_par_script: boolean
          appels_outils: Json | null
          capture_path: string | null
          cause_echec: string | null
          controle_document: Json | null
          coupe_circuit: Json | null
          cout: Json | null
          cout_usd: number | null
          created_at: string
          debut: string | null
          decision_validation: string | null
          duree_s: number | null
          ecarts_metier: string[] | null
          envoi_detecte: boolean
          erreur: string | null
          erreurs_schema: string[] | null
          error_code: string | null
          fin: string | null
          id: string
          logement_id: string | null
          motif_fin: string | null
          nb_etapes: number | null
          observations_api: Json | null
          outcome: string | null
          pages_vues: string[] | null
          produit_compatible: boolean | null
          schema_valide: boolean | null
          session_id: string
          site: string | null
          sortie_finale: Json | null
          statut_final: string | null
          tokens: Json | null
          url_finale: string | null
          usage: number
          verifie_par_humain: boolean
        }
        Insert: {
          action_id?: string | null
          actions_agent?: Json | null
          agent: string
          agent_revision?: number | null
          annulee_par_script?: boolean
          appels_outils?: Json | null
          capture_path?: string | null
          cause_echec?: string | null
          controle_document?: Json | null
          coupe_circuit?: Json | null
          cout?: Json | null
          cout_usd?: number | null
          created_at?: string
          debut?: string | null
          decision_validation?: string | null
          duree_s?: number | null
          ecarts_metier?: string[] | null
          envoi_detecte?: boolean
          erreur?: string | null
          erreurs_schema?: string[] | null
          error_code?: string | null
          fin?: string | null
          id?: string
          logement_id?: string | null
          motif_fin?: string | null
          nb_etapes?: number | null
          observations_api?: Json | null
          outcome?: string | null
          pages_vues?: string[] | null
          produit_compatible?: boolean | null
          schema_valide?: boolean | null
          session_id: string
          site?: string | null
          sortie_finale?: Json | null
          statut_final?: string | null
          tokens?: Json | null
          url_finale?: string | null
          usage: number
          verifie_par_humain?: boolean
        }
        Update: {
          action_id?: string | null
          actions_agent?: Json | null
          agent?: string
          agent_revision?: number | null
          annulee_par_script?: boolean
          appels_outils?: Json | null
          capture_path?: string | null
          cause_echec?: string | null
          controle_document?: Json | null
          coupe_circuit?: Json | null
          cout?: Json | null
          cout_usd?: number | null
          created_at?: string
          debut?: string | null
          decision_validation?: string | null
          duree_s?: number | null
          ecarts_metier?: string[] | null
          envoi_detecte?: boolean
          erreur?: string | null
          erreurs_schema?: string[] | null
          error_code?: string | null
          fin?: string | null
          id?: string
          logement_id?: string | null
          motif_fin?: string | null
          nb_etapes?: number | null
          observations_api?: Json | null
          outcome?: string | null
          pages_vues?: string[] | null
          produit_compatible?: boolean | null
          schema_valide?: boolean | null
          session_id?: string
          site?: string | null
          sortie_finale?: Json | null
          statut_final?: string | null
          tokens?: Json | null
          url_finale?: string | null
          usage?: number
          verifie_par_humain?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "runs_agent_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runs_agent_logement_id_fkey"
            columns: ["logement_id"]
            isOneToOne: false
            referencedRelation: "logements"
            referencedColumns: ["id"]
          },
        ]
      }
      sources: {
        Row: {
          created_at: string
          date_publication: string | null
          date_verification: string | null
          editeur: string | null
          force: string | null
          id: string
          nature: string | null
          priorite: string
          rang_registre: number | null
          reference_officielle: string | null
          statut: string
          theme: string | null
          titre: string
          type: string | null
          url: string | null
          version_texte: string | null
        }
        Insert: {
          created_at?: string
          date_publication?: string | null
          date_verification?: string | null
          editeur?: string | null
          force?: string | null
          id?: string
          nature?: string | null
          priorite: string
          rang_registre?: number | null
          reference_officielle?: string | null
          statut?: string
          theme?: string | null
          titre: string
          type?: string | null
          url?: string | null
          version_texte?: string | null
        }
        Update: {
          created_at?: string
          date_publication?: string | null
          date_verification?: string | null
          editeur?: string | null
          force?: string | null
          id?: string
          nature?: string | null
          priorite?: string
          rang_registre?: number | null
          reference_officielle?: string | null
          statut?: string
          theme?: string | null
          titre?: string
          type?: string | null
          url?: string | null
          version_texte?: string | null
        }
        Relationships: []
      }
      validations: {
        Row: {
          action_id: string
          call_id: string
          created_at: string
          decide_le: string | null
          decision: Database["public"]["Enums"]["decision"] | null
          id: string
          resume: string
          session_id: string
        }
        Insert: {
          action_id: string
          call_id: string
          created_at?: string
          decide_le?: string | null
          decision?: Database["public"]["Enums"]["decision"] | null
          id?: string
          resume: string
          session_id: string
        }
        Update: {
          action_id?: string
          call_id?: string
          created_at?: string
          decide_le?: string | null
          decision?: Database["public"]["Enums"]["decision"] | null
          id?: string
          resume?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "validations_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "actions"
            referencedColumns: ["id"]
          },
        ]
      }
      webhooks_recus: {
        Row: {
          erreur: string | null
          evenement_id: string | null
          id: string
          livraison_id: string
          recu_le: string
          session_id: string | null
          signature_valide: boolean
          traite_le: string | null
          type: string
        }
        Insert: {
          erreur?: string | null
          evenement_id?: string | null
          id?: string
          livraison_id: string
          recu_le?: string
          session_id?: string | null
          signature_valide: boolean
          traite_le?: string | null
          type: string
        }
        Update: {
          erreur?: string | null
          evenement_id?: string | null
          id?: string
          livraison_id?: string
          recu_le?: string
          session_id?: string | null
          signature_valide?: boolean
          traite_le?: string | null
          type?: string
        }
        Relationships: []
      }
    }
    Views: {
      elements_inconnus: {
        Row: {
          element: string | null
          occurrences: number | null
          origine: string | null
        }
        Relationships: []
      }
      regles_en_vigueur: {
        Row: {
          code: string | null
          created_at: string | null
          element: string | null
          force: string | null
          id: string | null
          intitule: string | null
          parametres: Json | null
          relu_par: string | null
          source_id: string | null
          source_ref: string | null
          source_url: string | null
          statut_validation: string | null
          verdict_type: string | null
          verifie_le: string | null
          version: number | null
        }
        Relationships: [
          {
            foreignKeyName: "regles_element_fkey"
            columns: ["element"]
            isOneToOne: false
            referencedRelation: "elements"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "regles_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      get_contrat_champs: {
        Args: { p_champs: string[]; p_logement_id: string }
        Returns: Json
      }
      match_noeuds: {
        Args: { k?: number; p_contrat_id?: string; query_embedding: string }
        Returns: {
          contrat_id: string
          id: string
          libelle: string
          proprietes: Json
          regle_id: string
          similarite: number
          type: string
        }[]
      }
      sous_graphe: {
        Args: {
          noeud_ids: string[]
          p_contrat_id?: string
          profondeur?: number
        }
        Returns: Json
      }
      videos_a_purger: {
        Args: { p_limite?: number }
        Returns: {
          chemin: string
          envoyee_le: string
        }[]
      }
      valider_regle: {
        Args: { p_code: string; p_relu_par: string; p_version: number }
        Returns: {
          code: string
          created_at: string
          element: string
          force: string
          id: string
          intitule: string
          parametres: Json
          relu_par: string | null
          source_id: string | null
          source_ref: string | null
          source_url: string | null
          statut_validation: string
          verdict_type: string | null
          verifie_le: string | null
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "regles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      decision: "approuve" | "refuse" | "modifier"
      risque: "chute" | "intrusion" | "incendie" | "autre"
      source_faille: "vision" | "declaration"
      statut_occupation: "proprietaire" | "locataire" | "heberge"
      type_obligation:
        | "prevention"
        | "inoccupation"
        | "exclusion"
        | "garantie"
        | "franchise"
        | "plafond"
      vigilance: "adulte" | "jeune_enfant" | "troubles_cognitifs"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      decision: ["approuve", "refuse", "modifier"],
      risque: ["chute", "intrusion", "incendie", "autre"],
      source_faille: ["vision", "declaration"],
      statut_occupation: ["proprietaire", "locataire", "heberge"],
      type_obligation: [
        "prevention",
        "inoccupation",
        "exclusion",
        "garantie",
        "franchise",
        "plafond",
      ],
      vigilance: ["adulte", "jeune_enfant", "troubles_cognitifs"],
    },
  },
} as const
