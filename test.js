const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./tareas.db');

const mesNum = 3;
const anioNum = 2026;
const fechaInicio = `2026-03-01`;
const fechaFin = `2026-03-31`;

const cuentasSql = `
  SELECT c.* FROM cuentas c WHERE c.user_id = ?
  UNION
  SELECT c.* FROM cuentas c JOIN cuenta_usuarios cu ON c.id = cu.cuenta_id WHERE cu.user_id = ?`;

db.all(cuentasSql, [3, 3], (err, cuentas) => {
  if (err) return console.error(err);
  if (cuentas.length === 0) return console.log('No cuentas');

  const cuentaIds = cuentas.map(c => c.id);
  const placeholders = cuentaIds.map(() => '?').join(',');

  db.all(
    `SELECT * FROM presupuestos_mensuales WHERE cuenta_id IN (${placeholders}) AND mes = ? AND anio = ?`,
    [...cuentaIds, mesNum, anioNum],
    (err2, presupuestos) => {
      if (err2) return console.error(err2);

      db.all(
        `SELECT g.*, cat.porcentaje_asignacion, cat.nombre as categoria_nombre, cat.color_hex,
                COALESCE(cat.tipo, 'EGRESO') as tipo_categoria
         FROM gastos g
         LEFT JOIN categorias cat ON g.categoria_id = cat.id
         WHERE g.cuenta_id IN (${placeholders}) AND g.fecha BETWEEN ? AND ?`,
        [...cuentaIds, fechaInicio, fechaFin],
        (err3, gastos) => {
          if (err3) return console.error(err3);
          console.log('Success! Cuentas:', cuentas.length, 'Presupuestos:', presupuestos.length, 'Gastos:', gastos.length);
        }
      );
    }
  );
});
