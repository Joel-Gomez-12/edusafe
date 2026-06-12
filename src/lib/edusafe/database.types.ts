// Auto-generado por Supabase CLI: supabase gen types typescript --local
// Este archivo se regenera automáticamente — no editar manualmente.
// Para regenerar: npx supabase gen types typescript --local > src/lib/edusafe/database.types.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      tenants: {
        Row: {
          id: string
          slug: string
          display_name: string
          type: 'centro_individual' | 'grupo_escolar' | 'ayuntamiento'
          plan: 'pilot' | 'basic' | 'pro' | 'premium'
          contact_email: string
          created_at: string
          active: boolean
        }
        Insert: Omit<Database['public']['Tables']['tenants']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['tenants']['Insert']>
      }
      centros: {
        Row: {
          id: string
          tenant_id: string
          nombre: string
          codigo_oficial: string | null
          direccion: string | null
          municipio: string | null
          provincia: string | null
          tipo: 'publico' | 'concertado' | 'privado' | null
          num_alumnos: number | null
          zona_horaria: string
          csv_uploaded_at: string | null
          active: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['centros']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['centros']['Insert']>
      }
      students: {
        Row: {
          id: string
          tenant_id: string
          centro_id: string
          external_id: string | null
          full_name: string
          curso: string
          grupo: string
          nacido_en: string | null
          active: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['students']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['students']['Insert']>
      }
      mediators: {
        Row: {
          id: string
          tenant_id: string
          centro_id: string
          user_id: string
          full_name: string
          email: string
          phone: string | null
          active: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['mediators']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['mediators']['Insert']>
      }
      directors: {
        Row: {
          id: string
          tenant_id: string
          centro_id: string
          user_id: string
          full_name: string
          email: string
          active: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['directors']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['directors']['Insert']>
      }
      reports: {
        Row: {
          id: string
          tenant_id: string
          centro_id: string
          case_code: string
          device_token: string
          emoji_pattern_hash: string
          category: 'verbal' | 'fisico' | 'exclusion' | 'ciberacoso' | 'sexual' | 'otros' | null
          zone: string | null
          severity_score: number | null
          severity_level: 'baja' | 'media' | 'alta' | 'critica' | null
          status: 'nuevo' | 'asignado' | 'en_investigacion' | 'resuelto' | 'derivado' | 'archivado'
          assigned_mediator: string | null
          description: string | null
          previ_steps: number[]
          flagged_as_crime: boolean
          text_verification: Json | null
          created_at: string
          last_activity_at: string
          closed_at: string | null
        }
        Insert: Omit<Database['public']['Tables']['reports']['Row'], 'id' | 'created_at' | 'last_activity_at'>
        Update: Partial<Database['public']['Tables']['reports']['Insert']>
      }
      report_involved: {
        Row: {
          id: string
          report_id: string
          student_id: string
          role: 'victima' | 'agresor' | 'testigo'
          added_at: string
        }
        Insert: Omit<Database['public']['Tables']['report_involved']['Row'], 'id' | 'added_at'>
        Update: Partial<Database['public']['Tables']['report_involved']['Insert']>
      }
      messages: {
        Row: {
          id: string
          report_id: string
          sender_type: 'alumno' | 'mediador' | 'sistema'
          sender_id: string | null
          content_encrypted: string  // Base64 del BYTEA cifrado
          created_at: string
          read_at: string | null
        }
        Insert: Omit<Database['public']['Tables']['messages']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['messages']['Insert']>
      }
      actas: {
        Row: {
          id: string
          tenant_id: string
          report_id: string
          type: 'borrador' | 'final'
          csv_code: string
          sha256_hash: string
          pdf_storage_path: string
          generated_by: string
          generated_at: string
          snapshot: Json
        }
        Insert: Omit<Database['public']['Tables']['actas']['Row'], 'id' | 'generated_at'>
        Update: Partial<Database['public']['Tables']['actas']['Insert']>
      }
      audit_log: {
        Row: {
          id: string
          tenant_id: string
          actor_type: 'mediador' | 'director' | 'sistema' | 'alumno'
          actor_id: string | null
          action: string
          resource_type: string
          resource_id: string
          details: Json | null
          ip_address: string | null
          user_agent: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['audit_log']['Row'], 'id' | 'created_at'>
        Update: never  // append-only
      }
      evidence_files: {
        Row: {
          id: string
          tenant_id: string
          report_id: string
          storage_path: string
          file_name: string
          mime_type: string
          size_bytes: number
          sha256_hash: string
          uploaded_by: string | null
          verification: Json | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['evidence_files']['Row'], 'id' | 'created_at'>
        Update: never
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
