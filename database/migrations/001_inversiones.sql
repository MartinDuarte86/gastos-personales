CREATE TABLE IF NOT EXISTS inv_sectores (
    id_sector INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS inv_activos (
    id_activo INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL UNIQUE,
    nombre TEXT,
    id_sector INTEGER REFERENCES inv_sectores(id_sector),
    clase TEXT CHECK(clase IN ('Acción', 'Bono', 'Cripto', 'FCI', 'CEDEAR')),
    api_provider TEXT DEFAULT 'manual', -- 'yahoo', 'coingecko', 'manual'
    api_id TEXT, -- Ticker para la API (ej: AL30.BA o bitcoin)
    precio_mercado REAL DEFAULT 0,
    fecha_ultimo_precio DATETIME
);

CREATE TABLE IF NOT EXISTS inv_transacciones (
    id_transaccion INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha_operacion DATE DEFAULT CURRENT_DATE,
    id_activo INTEGER REFERENCES inv_activos(id_activo),
    tipo_movimiento TEXT CHECK(tipo_movimiento IN ('INGRESO', 'EGRESO')),
    cantidad REAL NOT NULL,
    precio_operacion REAL NOT NULL, -- Costo al momento de la compra
    moneda TEXT CHECK(moneda IN ('ARS', 'USD'))
);

CREATE TABLE IF NOT EXISTS inv_config (
    clave TEXT PRIMARY KEY,
    valor REAL
);

INSERT OR IGNORE INTO inv_config (clave, valor) VALUES ('dolar_mep', 0.0);
