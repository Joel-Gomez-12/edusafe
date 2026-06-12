// ─── Tenant & Centro ────────────────────────────────────────────────────────

export type TenantPlan = 'pilot' | 'basic' | 'pro' | 'premium'
export type TenantType = 'centro_individual' | 'grupo_escolar' | 'ayuntamiento'

export interface Tenant {
  id: string
  slug: string
  display_name: string
  type: TenantType
  plan: TenantPlan
  contact_email: string
  created_at: string
  active: boolean
}

export interface Centro {
  id: string
  tenant_id: string
  nombre: string
  codigo_oficial?: string
  direccion?: string
  municipio?: string
  provincia?: string
  tipo?: 'publico' | 'concertado' | 'privado'
  num_alumnos?: number
  zona_horaria: string
  csv_uploaded_at?: string
  active: boolean
  created_at: string
}

// ─── Usuarios staff ──────────────────────────────────────────────────────────

export interface Mediator {
  id: string
  tenant_id: string
  centro_id: string
  user_id: string          // Supabase Auth user_id
  full_name: string
  email: string
  phone?: string
  active: boolean
  created_at: string
}

export interface Director {
  id: string
  tenant_id: string
  centro_id: string
  user_id: string
  full_name: string
  email: string
  active: boolean
  created_at: string
}

// ─── Alumnos ─────────────────────────────────────────────────────────────────

export interface Student {
  id: string
  tenant_id: string
  centro_id: string
  external_id?: string
  full_name: string
  curso: string
  grupo: string
  nacido_en?: string
  active: boolean
  created_at: string
}

export type StudentSuggestion = Pick<Student, 'id' | 'full_name' | 'curso' | 'grupo'>

// ─── Reportes ────────────────────────────────────────────────────────────────

export type ReportCategory = 'verbal' | 'fisico' | 'exclusion' | 'ciberacoso' | 'sexual' | 'otros'
export type ReportZone = 'Patio' | 'Comedor' | 'Baños' | 'Aula' | 'Pasillo' | 'Entrada' | 'Redes sociales' | 'Otro'
export type SeverityLevel = 'baja' | 'media' | 'alta' | 'critica'
export type ReportStatus = 'nuevo' | 'asignado' | 'en_investigacion' | 'resuelto' | 'derivado' | 'archivado'

export interface Report {
  id: string
  tenant_id: string
  centro_id: string
  case_code: string
  device_token: string       // hashed, opaque — nunca en claro
  emoji_pattern_hash: string // bcrypt de los 3 emojis
  category?: ReportCategory
  zone?: string
  severity_score?: number    // 0-100
  severity_level?: SeverityLevel
  status: ReportStatus
  assigned_mediator?: string
  description?: string
  created_at: string
  last_activity_at: string
  closed_at?: string
}

export type InvolvedRole = 'victima' | 'agresor' | 'testigo'

export interface ReportInvolved {
  id: string
  report_id: string
  student_id: string
  role: InvolvedRole
  added_at: string
  student?: StudentSuggestion
}

// ─── Mensajes ────────────────────────────────────────────────────────────────

export type MessageSender = 'alumno' | 'mediador' | 'sistema'

export interface Message {
  id: string
  report_id: string
  sender_type: MessageSender
  sender_id?: string         // NULL si alumno (anonimato)
  content: string            // descifrado en cliente
  created_at: string
  read_at?: string
}

// ─── Actas ───────────────────────────────────────────────────────────────────

export type ActaType = 'borrador' | 'final'

export interface Acta {
  id: string
  tenant_id: string
  report_id: string
  type: ActaType
  csv_code: string           // Código Seguro de Verificación (8 chars)
  sha256_hash: string
  pdf_storage_path: string
  generated_by: string       // mediator id
  generated_at: string
  snapshot: Record<string, unknown>
}

// ─── Audit Log ───────────────────────────────────────────────────────────────

export type ActorType = 'mediador' | 'director' | 'sistema' | 'alumno'

export interface AuditLogEntry {
  id: string
  tenant_id: string
  actor_type: ActorType
  actor_id?: string
  action: string             // 'report.created' | 'case.assigned' | ...
  resource_type: string
  resource_id: string
  details?: Record<string, unknown>
  ip_address?: string
  user_agent?: string
  created_at: string
}

// ─── API Response types ───────────────────────────────────────────────────────

export interface CreateReportResponse {
  case_code: string
  next_step: string
}

export interface ChatAccessResponse {
  session_token: string
  messages: Message[]
}

export interface VerifyActaResponse {
  valid: boolean
  centro?: string
  type?: string
  generated_at?: string
  case_code?: string
  sha256_hash?: string
}

export interface GenerateActaResponse {
  acta_id: string
  csv_code: string
  download_url: string
  verify_url: string
}

// ─── UI / App types ───────────────────────────────────────────────────────────

export type UserRole = 'alumno' | 'mediador' | 'director'

export interface EmojiPattern {
  emojis: string[]  // exactamente 3
}

// Contexto de sesión del alumno (guardado en sessionStorage, nunca en localStorage)
export interface AlumnoSession {
  case_code: string
  session_token: string
  expires_at: number
  centro_slug: string
}
