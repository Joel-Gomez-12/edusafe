// Edge Function: POST /functions/v1/actas-generate
// Genera el PDF del acta server-side con pdf-lib, SHA-256 y CSV de verificacion.
// Requiere: Bearer JWT de mediador autenticado.

import { createClient }     from 'https://esm.sh/@supabase/supabase-js@2'
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1'
import { corsHeaders, handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

interface GenerateActaBody {
  report_id:     string
  type:          'borrador' | 'final'
  conclusiones?: string
}

// ─── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  try {
    // 1. Verificar JWT del mediador
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return errorResponse('Autenticacion requerida', 401)

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token)
    if (authErr || !user) return errorResponse('Token invalido', 401)

    const { data: mediator } = await supabaseAdmin
      .from('mediators')
      .select('id, full_name, tenant_id, centro_id')
      .eq('user_id', user.id)
      .single()
    if (!mediator) return errorResponse('Solo mediadores pueden generar actas', 403)

    // 2. Obtener el reporte con implicados
    const body: GenerateActaBody = await req.json()
    const { report_id, type, conclusiones } = body

    const { data: report } = await supabaseAdmin
      .from('reports')
      .select(`
        id, case_code, category, severity_level, status, previ_steps,
        created_at, closed_at,
        report_involved ( role, students ( full_name, curso, grupo ) )
      `)
      .eq('id', report_id)
      .eq('tenant_id', mediator.tenant_id)
      .eq('assigned_mediator', mediator.id)
      .single()
    if (!report) return errorResponse('Reporte no encontrado o no asignado', 404)

    // 3. Nombre del centro
    const { data: centro } = await supabaseAdmin
      .from('centros')
      .select('nombre, municipio, provincia')
      .eq('id', mediator.centro_id)
      .single()
    const centroLabel = centro
      ? [centro.nombre, centro.municipio, centro.provincia].filter(Boolean).join(', ')
      : 'Centro educativo'

    // 4. Generar PDF
    const csvCode  = generateCsvCode()
    const appUrl   = Deno.env.get('APP_URL') ?? 'https://edusafe.app'
    const verifyUrl = `${appUrl}/verificar/${csvCode}`

    const pdfBytes = await buildActaPdf({
      report,
      centroLabel,
      conclusiones: conclusiones?.trim() ?? '',
      mediatorName: mediator.full_name,
      generatedAt:  new Date().toISOString(),
      type,
      csvCode,
      verifyUrl,
    })

    // 5. SHA-256 del PDF binario
    const hashBuf  = await crypto.subtle.digest('SHA-256', pdfBytes)
    const sha256   = Array.from(new Uint8Array(hashBuf))
      .map(b => b.toString(16).padStart(2, '0')).join('')

    // 6. Subir PDF a Storage (bucket: actas — privado)
    const storagePath = `${mediator.tenant_id}/${report_id}/${csvCode}.pdf`
    const { error: uploadErr } = await supabaseAdmin.storage
      .from('actas')
      .upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: false })
    if (uploadErr) {
      console.error('Storage error:', uploadErr)
      return errorResponse('Error guardando el acta en Storage', 500)
    }

    // 7. INSERT en actas
    const { data: acta } = await supabaseAdmin
      .from('actas')
      .insert({
        tenant_id:        mediator.tenant_id,
        report_id,
        type,
        csv_code:         csvCode,
        sha256_hash:      sha256,
        pdf_storage_path: storagePath,
        generated_by:     mediator.id,
        snapshot: {
          case_code:     report.case_code,
          category:      report.category,
          centro:        centroLabel,
          severity:      report.severity_level,
          conclusiones:  conclusiones ?? '',
          mediatorName:  mediator.full_name,
          generatedAt:   new Date().toISOString(),
        },
      })
      .select('id')
      .single()

    // 8. URL de descarga firmada (1 hora)
    const { data: signed } = await supabaseAdmin.storage
      .from('actas')
      .createSignedUrl(storagePath, 3600)

    // 9. Cerrar el reporte si es acta final
    if (type === 'final') {
      await supabaseAdmin
        .from('reports')
        .update({ status: 'resuelto', closed_at: new Date().toISOString() })
        .eq('id', report_id)
    }

    // 10. Audit log
    await supabaseAdmin.from('audit_log').insert({
      tenant_id:    mediator.tenant_id,
      actor_type:   'mediador',
      actor_id:     mediator.id,
      action:       `acta.${type}.generated`,
      resource_type: 'acta',
      resource_id:  acta!.id,
      details:      { csv_code: csvCode, sha256_prefix: sha256.slice(0, 12) },
    })

    return jsonResponse({
      acta_id:      acta!.id,
      csv_code:     csvCode,
      download_url: signed?.signedUrl ?? '',
      verify_url:   verifyUrl,
    }, 201)

  } catch (err) {
    console.error('actas-generate error:', err)
    return errorResponse('Error interno del servidor', 500)
  }
})

// ─── CSV code ──────────────────────────────────────────────────────────────────

function generateCsvCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += '-'
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

function wrapText(text: string, font: Awaited<ReturnType<PDFDocument['embedFont']>>, size: number, maxW: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(' ')
    let line = ''
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(candidate, size) <= maxW) {
        line = candidate
      } else {
        if (line) lines.push(line)
        line = word
      }
    }
    if (line) lines.push(line)
  }
  return lines
}

function anonymize(fullName: string, curso: string, grupo: string): string {
  const parts = fullName.trim().split(' ').filter(Boolean)
  if (parts.length < 2) return `${fullName} (${curso}${grupo})`
  return `${parts[0][0].toUpperCase()}. ${parts[parts.length - 1][0].toUpperCase()}. (${curso}${grupo})`
}

const CAT_LABELS: Record<string, string> = {
  ciberacoso: 'Ciberacoso', exclusion: 'Exclusion social', fisico: 'Violencia fisica',
  verbal: 'Violencia verbal', sexual: 'Acoso sexual', otros: 'Otros',
}
const SEV_LABELS: Record<string, string> = {
  baja: 'BAJO', media: 'MEDIO', alta: 'ALTO', critica: 'CRITICO',
}
const ROLE_LABELS: Record<string, string> = {
  victima: 'Victima', agresor: 'Denunciado/a', testigo: 'Testigo',
}
const PREVI_STEPS = [
  'Recepcion y clasificacion del caso',
  'Contacto con denunciante',
  'Entrevista con victima',
  'Comunicacion a familias',
  'Generacion de acta final',
]

// ─── PDF builder ───────────────────────────────────────────────────────────────

interface PdfParams {
  report:       Record<string, unknown>
  centroLabel:  string
  conclusiones: string
  mediatorName: string
  generatedAt:  string
  type:         'borrador' | 'final'
  csvCode:      string
  verifyUrl:    string
}

async function buildActaPdf(p: PdfParams): Promise<Uint8Array> {
  const pdf    = await PDFDocument.create()
  const helvB  = await pdf.embedFont(StandardFonts.HelveticaBold)
  const helv   = await pdf.embedFont(StandardFonts.Helvetica)

  const A4_W = 595.28
  const A4_H = 841.89
  const M    = 50      // margin
  const CW   = A4_W - M * 2  // content width

  const page = pdf.addPage([A4_W, A4_H])

  // Colors (rgb 0-1)
  const NAVY  = rgb(0.05, 0.10, 0.18)
  const MUTED = rgb(0.45, 0.45, 0.50)
  const GREEN = rgb(0.15, 0.55, 0.30)
  const AMBER = rgb(0.75, 0.45, 0.05)
  const HAIR  = rgb(0.82, 0.82, 0.85)
  const BLUE  = rgb(0.10, 0.35, 0.75)

  let y = A4_H - 45

  // ── Logo / título ───────────────────────────────────────────────────────────
  page.drawText('EduSafe', { x: M, y, font: helvB, size: 20, color: NAVY })
  const typeTitle = p.type === 'final'
    ? 'ACTA FINAL DE RESOLUCION'
    : 'ACTA BORRADOR DE MEDIACION'
  page.drawText(typeTitle, {
    x: A4_W - M - helvB.widthOfTextAtSize(typeTitle, 11),
    y: y + 4,
    font: helvB, size: 11, color: p.type === 'final' ? NAVY : AMBER,
  })
  y -= 10
  page.drawLine({ start: { x: M, y }, end: { x: A4_W - M, y }, thickness: 1.5, color: NAVY })
  y -= 20

  // ── Datos del caso ──────────────────────────────────────────────────────────
  page.drawText('DATOS DEL CASO', { x: M, y, font: helvB, size: 10, color: NAVY })
  y -= 14

  const report = p.report as {
    case_code: string; category: string | null; severity_level: string | null
    previ_steps: number[]; created_at: string; closed_at: string | null
    report_involved: Array<{ role: string; students: { full_name: string; curso: string; grupo: string } | null }>
  }

  const dataRows: [string, string][] = [
    ['Codigo de caso',     report.case_code],
    ['Categoria',          CAT_LABELS[report.category ?? ''] ?? 'Otros'],
    ['Centro educativo',   p.centroLabel],
    ['Severidad',          SEV_LABELS[report.severity_level ?? ''] ?? 'No clasificado'],
    ['Fecha de apertura',  fmtDate(report.created_at)],
    ['Fecha de cierre',    p.generatedAt ? fmtDate(p.generatedAt) : '—'],
  ]

  for (const [label, value] of dataRows) {
    page.drawText(label + ':', { x: M + 8, y, font: helvB, size: 9, color: MUTED })
    page.drawText(value,        { x: M + 145, y, font: helv, size: 9, color: NAVY })
    y -= 13
  }

  y -= 5
  page.drawLine({ start: { x: M, y }, end: { x: A4_W - M, y }, thickness: 0.3, color: HAIR })
  y -= 16

  // ── Partes implicadas ───────────────────────────────────────────────────────
  const involved = report.report_involved ?? []
  if (involved.length > 0) {
    page.drawText('PARTES IMPLICADAS  (datos anonimizados, art. 5.1.c RGPD)', {
      x: M, y, font: helvB, size: 10, color: NAVY,
    })
    y -= 14

    for (const inv of involved) {
      const roleLabel = ROLE_LABELS[inv.role] ?? inv.role
      const name = inv.students
        ? anonymize(inv.students.full_name, inv.students.curso, inv.students.grupo)
        : 'Alumno/a no identificado/a'
      page.drawText(`${roleLabel}:`, { x: M + 8, y, font: helvB, size: 9, color: MUTED })
      page.drawText(name,            { x: M + 95, y, font: helv, size: 9, color: NAVY })
      y -= 13
    }

    y -= 5
    page.drawLine({ start: { x: M, y }, end: { x: A4_W - M, y }, thickness: 0.3, color: HAIR })
    y -= 16
  }

  // ── Protocolo PREVI ─────────────────────────────────────────────────────────
  const doneSteps = report.previ_steps ?? []
  const doneCount = doneSteps.length
  page.drawText(`PROTOCOLO PREVI  —  ${doneCount}/${PREVI_STEPS.length} pasos completados`, {
    x: M, y, font: helvB, size: 10, color: NAVY,
  })
  y -= 14

  for (let i = 0; i < PREVI_STEPS.length; i++) {
    const done = doneSteps.includes(i)
    page.drawText(done ? '[OK]' : '[  ]', {
      x: M + 8, y, font: helvB, size: 9, color: done ? GREEN : MUTED,
    })
    page.drawText(PREVI_STEPS[i], {
      x: M + 42, y, font: helv, size: 9, color: done ? NAVY : MUTED,
    })
    y -= 12
  }

  y -= 8
  page.drawLine({ start: { x: M, y }, end: { x: A4_W - M, y }, thickness: 0.3, color: HAIR })
  y -= 16

  // ── Conclusiones ────────────────────────────────────────────────────────────
  page.drawText('CONCLUSIONES DEL MEDIADOR/A', { x: M, y, font: helvB, size: 10, color: NAVY })
  y -= 14

  const concText  = p.conclusiones || 'Sin observaciones adicionales.'
  const concLines = wrapText(concText, helv, 9, CW - 16)
  const maxConc   = Math.min(concLines.length, 10)  // max 10 lineas en una pagina
  for (let i = 0; i < maxConc; i++) {
    page.drawText(concLines[i], { x: M + 8, y, font: helv, size: 9, color: NAVY })
    y -= 13
  }
  if (concLines.length > 10) {
    page.drawText('[...texto truncado — ver acta completa en sistema]', {
      x: M + 8, y, font: helv, size: 8, color: MUTED,
    })
    y -= 12
  }

  y -= 8
  page.drawLine({ start: { x: M, y }, end: { x: A4_W - M, y }, thickness: 0.3, color: HAIR })
  y -= 16

  // ── Verificacion ────────────────────────────────────────────────────────────
  page.drawText('VERIFICACION DE AUTENTICIDAD', { x: M, y, font: helvB, size: 10, color: NAVY })
  y -= 14

  page.drawText('Codigo CSV:', { x: M + 8, y, font: helvB, size: 9, color: MUTED })
  page.drawText(p.csvCode,    { x: M + 88, y, font: helvB, size: 11, color: NAVY })
  y -= 14

  page.drawText('Verificar en:', { x: M + 8, y, font: helvB, size: 9, color: MUTED })
  page.drawText(p.verifyUrl,     { x: M + 88, y, font: helv, size: 9, color: BLUE })
  y -= 18

  page.drawLine({ start: { x: M, y }, end: { x: A4_W - M, y }, thickness: 0.3, color: HAIR })
  y -= 14

  // ── Footer legal ────────────────────────────────────────────────────────────
  const legalLines = [
    'Documento generado automaticamente por EduSafe bajo RGPD + LOPDGDD (ES) + LOPIVI 8/2021.',
    'El contenido de los mensajes anonimos del canal seguro NO figura en este acta (proteccion de datos).',
    `Generada el ${fmtDate(p.generatedAt)}  |  Mediador/a: ${p.mediatorName}  |  EduSafe v2`,
  ]
  for (const line of legalLines) {
    page.drawText(line, { x: M, y, font: helv, size: 7.5, color: MUTED })
    y -= 11
  }

  // Segundo recuadro si el contenido desborda (no implementado en MVP)

  return pdf.save()
}
