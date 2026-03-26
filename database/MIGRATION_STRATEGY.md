# Migration Strategy: Neon production (SQLite optional local)

Goal:
- Use Neon PostgreSQL as the production database.
- Optionally keep SQLite only for local development.
- Keep schema evolution controlled and reproducible.

## Rule 1: versioned migrations only

Every schema change must be created as a new migration file.
Do not modify old migrations.

## Rule 2: two migration folders

- SQLite migrations: `database/migrations/*.sql`
- PostgreSQL migrations: `database/postgres/*.sql`

Use the same numeric prefix for equivalent changes:
- `005_add_x.sql` (SQLite)
- `005_add_x.sql` (PostgreSQL)

## Rule 3: apply in CI before deploy

Before deploying, run:
1. PostgreSQL migration set on Neon staging/production.
2. (Optional) SQLite migration set on local/test DB.

If either fails, stop deploy.

## Rule 4: schema-only sync, not data sync

This strategy synchronizes structure only.
Data migration must be a separate explicit process.

## Rule 5: rollback policy

Prefer forward-fix migrations.
Avoid destructive rollback in production.
