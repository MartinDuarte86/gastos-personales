-- Bootstrap schema for Neon/PostgreSQL
-- Source of truth: aligned with current SQLite structure used by server.js.
-- This script creates structure only (no data migration).

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(80) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  quadrant TEXT NOT NULL,
  assigned TEXT,
  team_id BIGINT,
  assigned_user_id BIGINT,
  category TEXT,
  fecha TEXT,
  completed INTEGER DEFAULT 0,
  position INTEGER DEFAULT 0,
  in_progress_seconds INTEGER DEFAULT 0,
  in_progress_started_at TEXT,
  ever_in_progress INTEGER DEFAULT 0,
  user_id BIGINT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS expenses (
  id BIGSERIAL PRIMARY KEY,
  "user" TEXT NOT NULL,
  user_id BIGINT REFERENCES users(id),
  description TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  category TEXT,
  date TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS team_members (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(name, user_id)
);

CREATE TABLE IF NOT EXISTS teams (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(name, user_id)
);

CREATE TABLE IF NOT EXISTS team_memberships (
  team_id BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  member_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY(team_id, member_user_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'team_id'
  ) THEN
    ALTER TABLE tasks ADD COLUMN team_id BIGINT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'assigned_user_id'
  ) THEN
    ALTER TABLE tasks ADD COLUMN assigned_user_id BIGINT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_tasks_team'
  ) THEN
    ALTER TABLE tasks
      ADD CONSTRAINT fk_tasks_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_tasks_assigned_user'
  ) THEN
    ALTER TABLE tasks
      ADD CONSTRAINT fk_tasks_assigned_user FOREIGN KEY (assigned_user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tasks_team_id ON tasks(team_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_user_id ON tasks(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_team_memberships_team_id ON team_memberships(team_id);

CREATE TABLE IF NOT EXISTS inv_sectores (
  id_sector BIGSERIAL PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,
  user_id BIGINT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS inv_activos (
  id_activo BIGSERIAL PRIMARY KEY,
  ticker TEXT NOT NULL UNIQUE,
  nombre TEXT,
  id_sector BIGINT REFERENCES inv_sectores(id_sector),
  clase TEXT,
  api_provider TEXT DEFAULT 'manual',
  api_id TEXT,
  precio_mercado DOUBLE PRECISION DEFAULT 0,
  fecha_ultimo_precio TIMESTAMPTZ,
  user_id BIGINT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS inv_transacciones (
  id_transaccion BIGSERIAL PRIMARY KEY,
  fecha_operacion DATE DEFAULT CURRENT_DATE,
  id_activo BIGINT NOT NULL REFERENCES inv_activos(id_activo),
  tipo_movimiento TEXT NOT NULL,
  cantidad DOUBLE PRECISION NOT NULL,
  precio_operacion DOUBLE PRECISION NOT NULL,
  moneda TEXT NOT NULL,
  resta_liquidez INTEGER NOT NULL DEFAULT 0,
  tna DOUBLE PRECISION,
  user_id BIGINT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS inv_config (
  clave TEXT PRIMARY KEY,
  valor DOUBLE PRECISION
);

INSERT INTO inv_config (clave, valor)
VALUES ('dolar_mep', 0.0)
ON CONFLICT (clave) DO NOTHING;

CREATE TABLE IF NOT EXISTS cuentas (
  id TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  nombre TEXT NOT NULL,
  presupuesto_mensual_base DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cuenta_usuarios (
  cuenta_id TEXT NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY(cuenta_id, user_id)
);

CREATE TABLE IF NOT EXISTS categorias (
  id TEXT PRIMARY KEY,
  cuenta_id TEXT NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  color_hex TEXT DEFAULT '#6C757D',
  porcentaje_asignacion DOUBLE PRECISION NOT NULL DEFAULT 0,
  tipo TEXT NOT NULL DEFAULT 'EGRESO',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gastos (
  id TEXT PRIMARY KEY,
  categoria_id TEXT NOT NULL REFERENCES categorias(id),
  cuenta_id TEXT NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  descripcion TEXT,
  monto DOUBLE PRECISION NOT NULL,
  fecha TEXT NOT NULL,
  metodo_pago TEXT DEFAULT 'Efectivo',
  es_recurrente INTEGER DEFAULT 0,
  cuota_actual INTEGER DEFAULT 1,
  total_cuotas INTEGER DEFAULT 1,
  proyeccion_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gastos_cuenta_fecha ON gastos(cuenta_id, fecha);
CREATE INDEX IF NOT EXISTS idx_gastos_proyeccion ON gastos(proyeccion_id);
CREATE INDEX IF NOT EXISTS idx_categorias_cuenta ON categorias(cuenta_id);

CREATE TABLE IF NOT EXISTS presupuestos_mensuales (
  id TEXT PRIMARY KEY,
  cuenta_id TEXT NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  mes INTEGER NOT NULL,
  anio INTEGER NOT NULL,
  monto_total DOUBLE PRECISION NOT NULL DEFAULT 0,
  estado TEXT DEFAULT 'manual',
  nota_origen TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(cuenta_id, mes, anio)
);
