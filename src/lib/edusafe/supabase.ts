import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Faltan variables de entorno de Supabase. Copia .env.example a .env y completa los valores.')
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
})

// Helper para Edge Functions — incluye el JWT del usuario autenticado
export function edgeFunctionUrl(name: string): string {
  return `${supabaseUrl}/functions/v1/${name}`
}

// Helper para llamadas a Edge Functions con autenticación
export async function callEdgeFunction<T>(
  name: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
    body?: unknown
    headers?: Record<string, string>
    sessionToken?: string
    centroSlug?: string
  } = {}
): Promise<T> {
  const { method = 'POST', body, headers = {}, sessionToken, centroSlug } = options

  const reqHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  }

  if (sessionToken) {
    reqHeaders['Authorization'] = `Bearer ${sessionToken}`
  } else {
    const { data: { session } } = await supabase.auth.getSession()
    reqHeaders['Authorization'] = `Bearer ${session?.access_token ?? supabaseAnonKey}`
  }

  if (centroSlug) {
    reqHeaders['X-Centro-Slug'] = centroSlug
  }

  const response = await fetch(edgeFunctionUrl(name), {
    method,
    headers: reqHeaders,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }))
    throw new Error(error.message || `Error ${response.status} en ${name}`)
  }

  return response.json() as Promise<T>
}
