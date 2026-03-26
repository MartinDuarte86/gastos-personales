-- ============================================================
-- Migración 002: Módulo de Presupuesto y Seguimiento de Gastos
-- ============================================================

-- Tabla de Cuentas (Ej: Personal, MyAnanda, Equipo, Familia)
CREATE TABLE IF NOT EXISTS cuentas (
  id TEXT PRIMARY KEY,          -- UUID generado en Node.js
  user_id INTEGER NOT NULL,     -- Dueño principal (FK a users)
  nombre TEXT NOT NULL,
  presupuesto_mensual_base REAL NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

-- Tabla de acceso compartido de cuentas (usuarios adicionales)
CREATE TABLE IF NOT EXISTS cuenta_usuarios (
  cuenta_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  PRIMARY KEY(cuenta_id, user_id),
  FOREIGN KEY(cuenta_id) REFERENCES cuentas(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

-- Tabla de Categorías (vinculadas a una cuenta)
CREATE TABLE IF NOT EXISTS categorias (
  id TEXT PRIMARY KEY,          -- UUID generado en Node.js
  cuenta_id TEXT NOT NULL,
  nombre TEXT NOT NULL,
  color_hex TEXT DEFAULT '#6C757D',
  porcentaje_asignacion REAL NOT NULL DEFAULT 0,  -- 0 a 100
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(cuenta_id) REFERENCES cuentas(id)
);

-- Tabla de Gastos
CREATE TABLE IF NOT EXISTS gastos (
  id TEXT PRIMARY KEY,                -- UUID generado en Node.js
  categoria_id TEXT NOT NULL,
  cuenta_id TEXT NOT NULL,
  descripcion TEXT,
  monto REAL NOT NULL,
  fecha TEXT NOT NULL,               -- ISO 8601: YYYY-MM-DD
  metodo_pago TEXT DEFAULT 'Efectivo', -- Efectivo, TC, Débito, etc.
  es_recurrente INTEGER DEFAULT 0,   -- 0 = no, 1 = sí
  cuota_actual INTEGER DEFAULT 1,    -- Nro de cuota actual
  total_cuotas INTEGER DEFAULT 1,    -- Total de cuotas (1 = pago único)
  proyeccion_id TEXT,               -- UUID compartido para serie recurrente/cuotas
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(categoria_id) REFERENCES categorias(id),
  FOREIGN KEY(cuenta_id) REFERENCES cuentas(id)
);

-- Índices para queries frecuentes
CREATE INDEX IF NOT EXISTS idx_gastos_cuenta_fecha ON gastos(cuenta_id, fecha);
CREATE INDEX IF NOT EXISTS idx_gastos_proyeccion ON gastos(proyeccion_id);
CREATE INDEX IF NOT EXISTS idx_categorias_cuenta ON categorias(cuenta_id);

-- Tabla de Presupuestos Mensuales
CREATE TABLE IF NOT EXISTS presupuestos_mensuales (
  id TEXT PRIMARY KEY,            -- UUID generado en Node.js
  cuenta_id TEXT NOT NULL,
  mes INTEGER NOT NULL,           -- 1-12
  anio INTEGER NOT NULL,
  monto_total REAL NOT NULL DEFAULT 0,
  estado TEXT DEFAULT 'manual',   -- 'clonado', 'manual', 'vacio'
  nota_origen TEXT,               -- Ej: "Copia de Febrero 2026"
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(cuenta_id, mes, anio),
  FOREIGN KEY(cuenta_id) REFERENCES cuentas(id)
);
