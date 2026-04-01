const fs = require('fs');
const path = require('path');

module.exports = function(db, callback) {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS _migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE)`);

    db.run(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        quadrant TEXT NOT NULL,
        assigned TEXT,
        team_id INTEGER,
        assigned_user_id INTEGER,
        category TEXT,
        fecha TEXT,
        completed INTEGER DEFAULT 0,
        position INTEGER DEFAULT 0,
        in_progress_seconds INTEGER DEFAULT 0,
        in_progress_started_at TEXT,
        ever_in_progress INTEGER DEFAULT 0,
        user_id INTEGER
      );
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user TEXT NOT NULL,
        user_id INTEGER,
        description TEXT NOT NULL,
        amount REAL NOT NULL,
        category TEXT,
        date TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        password_version INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at DATETIME NOT NULL,
        used_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
      );
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS teams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(name, user_id),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS team_memberships (
        team_id INTEGER NOT NULL,
        member_user_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(team_id, member_user_id),
        FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
        FOREIGN KEY(member_user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS cuenta_equipos (
        cuenta_id TEXT NOT NULL,
        team_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(cuenta_id, team_id),
        FOREIGN KEY(cuenta_id) REFERENCES cuentas(id) ON DELETE CASCADE,
        FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE
      );
    `);

    // Retro-compatibility: add user_id column if tasks or expenses were created before auth
    db.all('PRAGMA table_info(tasks)', [], (err, columns) => {
      if (!err) {
        if (!columns.some(c => c.name === 'user_id')) {
          db.run('ALTER TABLE tasks ADD COLUMN user_id INTEGER');
        }
        if (!columns.some(c => c.name === 'in_progress_seconds')) {
          db.run('ALTER TABLE tasks ADD COLUMN in_progress_seconds INTEGER DEFAULT 0');
        }
        if (!columns.some(c => c.name === 'in_progress_started_at')) {
          db.run('ALTER TABLE tasks ADD COLUMN in_progress_started_at TEXT');
        }
        if (!columns.some(c => c.name === 'ever_in_progress')) {
          db.run('ALTER TABLE tasks ADD COLUMN ever_in_progress INTEGER DEFAULT 0');
        }
        if (!columns.some(c => c.name === 'team_id')) {
          db.run('ALTER TABLE tasks ADD COLUMN team_id INTEGER');
        }
        if (!columns.some(c => c.name === 'assigned_user_id')) {
          db.run('ALTER TABLE tasks ADD COLUMN assigned_user_id INTEGER');
        }
      }
    });

    db.all('PRAGMA table_info(expenses)', [], (err, columns) => {
      if (!err && !columns.some(c => c.name === 'user_id')) {
        db.run('ALTER TABLE expenses ADD COLUMN user_id INTEGER');
      }
    });

    db.all('PRAGMA table_info(users)', [], (err, columns) => {
      if (!err) {
        if (!columns.some(c => c.name === 'email')) {
          db.run('ALTER TABLE users ADD COLUMN email TEXT');
        }
        if (!columns.some(c => c.name === 'password_version')) {
          db.run('ALTER TABLE users ADD COLUMN password_version INTEGER NOT NULL DEFAULT 0');
        }
      }
    });

    db.all('PRAGMA table_info(inv_activos)', [], (err, columns) => {
      if (!err && columns.length) {
        if (!columns.some(c => c.name === 'team_id')) {
          db.run('ALTER TABLE inv_activos ADD COLUMN team_id INTEGER');
        }
      }
    });

    db.all('PRAGMA table_info(inv_transacciones)', [], (err, columns) => {
      if (!err && columns.length) {
        if (!columns.some(c => c.name === 'team_id')) {
          db.run('ALTER TABLE inv_transacciones ADD COLUMN team_id INTEGER');
        }
      }
    });

    db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(LOWER(email)) WHERE email IS NOT NULL');
    db.run('CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_cuenta_equipos_team ON cuenta_equipos(team_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_inv_activos_team ON inv_activos(team_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_inv_transacciones_team ON inv_transacciones(team_id)');
    db.run(`
      INSERT OR IGNORE INTO team_memberships (team_id, member_user_id)
      SELECT id, user_id
      FROM teams
      WHERE user_id IS NOT NULL
    `);

    db.all(`SELECT name FROM _migrations`, [], (err, rows) => {
      if (err) return console.error(err);
      const applied = rows.map(r => r.name);
      
      const migrationsDir = path.join(__dirname, 'migrations');
      if (!fs.existsSync(migrationsDir)) fs.mkdirSync(migrationsDir);

      const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
      
      const runNext = (index) => {
        if (index >= files.length) {
          if (callback) callback();
          return;
        }
        const file = files[index];
        if (applied.includes(file)) {
          runNext(index + 1);
        } else {
          const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
          db.exec(sql, (err) => {
            if (err) {
              console.error(`Migration ${file} failed:`, err.message);
              process.exit(1);
            }
            db.run(`INSERT INTO _migrations (name) VALUES (?)`, [file], () => {
               console.log(`Applied migration: ${file}`);
               runNext(index + 1);
            });
          });
        }
      };
      
      runNext(0);
    });
  });
};
