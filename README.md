# Gastos Personales - Guia de Go-Live (Neon + Vercel)

Actualizado el 2026-03-26.

## Objetivo

Dejar la plataforma 100% online en Vercel usando Neon PostgreSQL en produccion.

## Implementacion realizada

1. Serverless listo para Vercel:
   - `api/index.js` exporta la app Express.
   - `vercel.json` con runtime Node 20, rewrites y cron.
2. Endpoints operativos agregados:
   - `GET /api/health`
   - `GET /api/internal/refresh-prices` (con `CRON_SECRET`)
   - `GET /api/inv/validate/:ticker`
3. Capa de DB unificada:
   - `database/db.js` agrega adaptador dual (`postgres` y `sqlite`).
   - Produccion por defecto usa Postgres.
   - Local puede seguir con SQLite.
4. Prisma + schema PostgreSQL:
   - `prisma/schema.prisma`
   - `database/postgres/001_bootstrap.sql`
5. Seguridad y config:
   - `.env.example` ampliado.
   - `.gitignore` bloquea `.env.local` y secretos.

## Variables de entorno

- `JWT_SECRET` (obligatoria, >=32 chars)
- `NODE_ENV=production`
- `DB_DRIVER=postgres`
- `DATABASE_URL` (Neon pooled)
- `DATABASE_URL_UNPOOLED` (Neon direct)
- `CRON_SECRET` (obligatoria para cron seguro)
- `AUTO_DB_BOOTSTRAP=true` (opcional para autochequeo de schema en arranque)

## Scripts utiles

- `npm start`
- `npm run prisma:generate`
- `npm run prisma:push`
- `npm run prisma:studio`
- `npm run db:neon:bootstrap`

## Flujo de despliegue end-to-end

1. Instalar dependencias:
   - `npm install`
2. Crear estructura en Neon:
   - `psql "$DATABASE_URL" -f database/postgres/001_bootstrap.sql`
3. Conectar repo a Vercel.
4. Cargar env vars en Vercel (Production/Preview).
5. Deploy de `main`.
6. Validar:
   - `/api/health` devuelve `ok: true`
   - login/registro
   - CRUD tareas, gastos, inversiones, presupuesto
   - cron `/api/internal/refresh-prices`

## Nota de compatibilidad

La API conserva firmas y rutas actuales. El objetivo fue migrar backend a Neon en produccion minimizando cambios en frontend.

## Seguridad

Si credenciales de Neon fueron compartidas en texto plano, rotarlas inmediatamente.
