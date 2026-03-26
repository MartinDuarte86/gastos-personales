-- ============================================================
-- Migration 002: Financial Logic Engine
-- Adds:
--   1. `tipo` column to `categorias` (EGRESO | INGRESO | INVERSIÓN)
--   2. `resta_liquidez` column to `inv_transacciones`
--      for tracking which investment operations drew from the liquidity pool
-- ============================================================

-- 1. Extend categorias with transaction type
ALTER TABLE categorias ADD COLUMN tipo TEXT NOT NULL DEFAULT 'EGRESO';

-- 2. Extend inv_transacciones with liquidity flag
ALTER TABLE inv_transacciones ADD COLUMN resta_liquidez INTEGER NOT NULL DEFAULT 0;

-- (porcentaje_asignacion remains in categorias but is only required/validated
--  for tipo='EGRESO' — enforced at application layer, not DB constraint)
