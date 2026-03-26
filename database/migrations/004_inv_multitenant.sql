-- 004_inv_multitenant.sql
-- Add per-user isolation for inversiones module.

ALTER TABLE inv_sectores ADD COLUMN user_id INTEGER;
ALTER TABLE inv_activos ADD COLUMN user_id INTEGER;
ALTER TABLE inv_transacciones ADD COLUMN user_id INTEGER;

-- Backfill legacy rows if the system only has one user.
UPDATE inv_sectores
SET user_id = (SELECT id FROM users ORDER BY id LIMIT 1)
WHERE user_id IS NULL
  AND (SELECT COUNT(*) FROM users) = 1;

UPDATE inv_activos
SET user_id = (SELECT id FROM users ORDER BY id LIMIT 1)
WHERE user_id IS NULL
  AND (SELECT COUNT(*) FROM users) = 1;

UPDATE inv_transacciones
SET user_id = (SELECT id FROM users ORDER BY id LIMIT 1)
WHERE user_id IS NULL
  AND (SELECT COUNT(*) FROM users) = 1;

CREATE INDEX IF NOT EXISTS idx_inv_sectores_user ON inv_sectores(user_id);
CREATE INDEX IF NOT EXISTS idx_inv_activos_user ON inv_activos(user_id);
CREATE INDEX IF NOT EXISTS idx_inv_transacciones_user ON inv_transacciones(user_id);
