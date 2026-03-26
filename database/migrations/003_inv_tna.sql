-- 003_inv_tna.sql
-- Add Plazo Fijo and Caución to clase CHECK constraint, remove FCI. Add tna column to inv_transacciones.

PRAGMA foreign_keys=off;

BEGIN TRANSACTION;

CREATE TABLE inv_activos_new (
    id_activo INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL UNIQUE,
    nombre TEXT,
    id_sector INTEGER REFERENCES inv_sectores(id_sector),
    clase TEXT CHECK(clase IN ('Acción', 'Bono', 'Cripto', 'CEDEAR', 'Plazo Fijo', 'Caución')),
    api_provider TEXT DEFAULT 'manual',
    api_id TEXT,
    precio_mercado REAL DEFAULT 0,
    fecha_ultimo_precio DATETIME
);

INSERT INTO inv_activos_new SELECT * FROM inv_activos;
DROP TABLE inv_activos;
ALTER TABLE inv_activos_new RENAME TO inv_activos;

ALTER TABLE inv_transacciones ADD COLUMN tna REAL DEFAULT NULL;

COMMIT;

PRAGMA foreign_keys=on;
