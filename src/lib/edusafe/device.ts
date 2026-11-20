// Helpers del dispositivo del alumno: centro activo y device_token.
// El alumno no tiene cuenta; todo su contexto vive en localStorage.

const SLUG_KEY   = 'edusafe_centro_slug'
const DEVICE_KEY = 'edusafe_device_token'

/**
 * Normaliza el slug del centro al formato que guarda la BD (camelCase, sin guiones).
 * Acepta también el formato antiguo con guiones: 'ceip-machado-sevilla' → 'ceipMachadoSevilla'.
 */
export function normalizeCentroSlug(raw: string | null | undefined): string {
  const s = (raw ?? '').trim()
  if (!s) return ''
  if (!/[-_\s]/.test(s)) return s
  return s
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part, i) => i === 0
      ? part.toLowerCase()
      : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('')
}

/** Slug del centro activo: el de la URL (?centro=) o, si no hay, el último guardado. */
export function resolveCentroSlug(searchParams: URLSearchParams): string {
  return normalizeCentroSlug(searchParams.get('centro') ?? localStorage.getItem(SLUG_KEY))
}

/**
 * Token único y estable del dispositivo. Se crea una sola vez: generar uno nuevo
 * por reporte dejaba sin acceso a los casos anteriores del mismo móvil.
 */
export function getDeviceToken(): string {
  let token = localStorage.getItem(DEVICE_KEY)
  if (!token) {
    token = crypto.randomUUID()
    localStorage.setItem(DEVICE_KEY, token)
  }
  return token
}

/**
 * Reescala y recodifica una imagen a JPEG antes de subirla.
 * Reduce el peso (fotos de móvil de varios MB) y elimina los metadatos EXIF
 * (GPS, modelo de dispositivo), que podrían identificar al denunciante.
 */
export async function prepareEvidenceImage(file: File, maxSide = 1600, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale  = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width  = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas no disponible')
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('No se pudo procesar la imagen')),
      'image/jpeg',
      quality,
    )
  })
}
