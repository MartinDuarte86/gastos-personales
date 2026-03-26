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
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
      }
    });

    db.all('PRAGMA table_info(expenses)', [], (err, columns) => {
      if (!err && !columns.some(c => c.name === 'user_id')) {
        db.run('ALTER TABLE expenses ADD COLUMN user_id INTEGER');
      }
    });

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
