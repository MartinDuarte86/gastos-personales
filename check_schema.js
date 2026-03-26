const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./tareas.db');

db.all(`SELECT type, name, sql FROM sqlite_master WHERE name='inv_activos' OR name='inv_transacciones'`, [], (err, rows) => {
  console.log(rows);
});
