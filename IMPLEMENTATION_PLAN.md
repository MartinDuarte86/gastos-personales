# Plan de Implementacion End-to-End

Estado: En ejecucion (backend migrado y smoke tests Neon OK; falta publicacion GitHub/Vercel en cuenta del usuario).

## Fase 1 - Base tecnica (completada)

1. Adaptar backend a serverless Vercel.
2. Preparar conectividad Neon/PostgreSQL.
3. Mantener compatibilidad local SQLite opcional.
4. Preparar bootstrap de schema PostgreSQL.

Resultado:
- `server.js`, `api/index.js`, `vercel.json`, `database/db.js`, `prisma/schema.prisma`, `database/postgres/001_bootstrap.sql`.

## Fase 2 - Integracion GitHub (pendiente de push)

1. Commit de cambios.
2. Push a rama `main` (o rama release).
3. Verificacion de CI (si aplica).

## Fase 3 - Deploy Vercel (pendiente de ejecucion en cuenta)

1. Conectar repo en Vercel.
2. Definir Build/Runtime (Other, Node 20).
3. Cargar env vars de produccion:
   - `NODE_ENV=production`
   - `DB_DRIVER=postgres`
   - `DATABASE_URL`
   - `DATABASE_URL_UNPOOLED`
   - `JWT_SECRET`
   - `CRON_SECRET`
   - `AUTO_DB_BOOTSTRAP=true` (opcional)

## Fase 4 - Bootstrap y validacion DB (completada localmente)

1. Ejecutado:
   - `npm install`
   - `npm run db:neon:bootstrap`
   - `npm run db:neon:check`
2. Validado que `/api/health` responde OK con `DB_DRIVER=postgres`.
3. Validado smoke test real:
   - Registro de usuario
   - Lectura de tareas
   - Alta de tarea y lectura posterior

## Fase 5 - Smoke tests funcionales (parcial completado)

1. Registro/login. (OK)
2. CRUD tareas. (OK en alta + lectura)
3. CRUD gastos. (OK en alta + lectura)
4. Modulo inversiones. (pendiente)
5. Modulo presupuesto. (pendiente)
6. Cron interno `/api/internal/refresh-prices`. (pendiente validacion en Vercel)

## Fase 6 - Go-live (pendiente)

1. Abrir uso productivo.
2. Monitorear logs Vercel y Neon por 24-48h.
3. Corregir incidencias P1/P2.
