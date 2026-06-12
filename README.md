# EduSafe — Fase 2

SaaS de gestión de convivencia escolar y canal ético anónimo para reportar bullying.

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | React 19 + Vite + React Router v7 |
| Estilos | Tailwind CSS v4 (design tokens EduSafe) |
| Backend | Supabase (Postgres + Edge Functions + Storage + Auth) |
| Edge Functions | Deno + TypeScript |
| Email | Resend |

## Setup — Pasos para empezar

### 1. Crear proyecto Supabase

1. Ir a [supabase.com](https://supabase.com) → New project
2. **Región:** `eu-central-1` (Frankfurt) — RGPD
3. Copiar `Project URL` y `anon key` de Settings → API

### 2. Configurar variables de entorno

```bash
cp .env.example .env
# Editar .env con los valores reales de Supabase
```

### 3. Aplicar el schema

En Supabase Dashboard → SQL Editor, ejecutar en orden:

```
supabase/migrations/20260603_001_initial_schema.sql
supabase/migrations/20260603_002_rls_policies.sql
supabase/migrations/20260603_003_auth_hook.sql
```

### 4. Crear buckets de Storage

Supabase Dashboard → Storage → New bucket:
- `actas` — privado
- `evidence` — privado

### 5. Arrancar

```bash
npm install
npm run dev   # http://localhost:5173
```

## Estructura

```
src/
├── routes/         # Páginas por rol (alumno / mediador / director)
├── components/     # Componentes de dominio y UI
├── context/        # Auth state (Supabase)
└── lib/edusafe/    # Cliente Supabase, tipos, helpers

supabase/
├── migrations/     # DDL + RLS + triggers
└── functions/      # Edge Functions Deno
```

## Sprints

| # | Contenido | Estado |
|---|-----------|--------|
| 0 | Setup proyecto, schema, Edge Functions base | ✅ |
| 1 | RLS completo + tests cross-tenant | 🔜 |
| 2 | Auth staff + JWT custom claims | 🔜 |
| 3 | Flujo alumno: wizard + chat + emojis | 🔜 |
| 4 | Flujo mediador: inbox + chat + checklist PREVI | 🔜 |
| 5 | Dashboard dirección: KPIs + heatmap | 🔜 |
| 6 | Actas PDF server-side + verificación pública | 🔜 |
| 7 | Triaje IA (GPT-4o-mini) + integración SIS | 🔜 |
| 8 | Compliance + observabilidad + go-live piloto | 🔜 |
