require('dotenv').config();

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { initDb } = require('./database/db');

const app = express();
const PORT = process.env.PORT || 3010;
const NODE_ENV = String(process.env.NODE_ENV || '').trim().toLowerCase();
const JWT_SECRET = String(process.env.JWT_SECRET || '').trim();
const IS_PROD = NODE_ENV === 'production';
const IS_SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const CRON_SECRET = String(process.env.CRON_SECRET || '').trim();
const APP_BASE_URL = String(process.env.APP_BASE_URL || '').trim() || `http://localhost:${PORT}`;
const RESEND_API_KEY = String(process.env.RESEND_API_KEY || '').trim();
const RESEND_FROM_EMAIL = String(process.env.RESEND_FROM_EMAIL || '').trim();
const IS_ENTRYPOINT = require.main === module;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('JWT_SECRET is required and must be at least 32 chars.');
  process.exit(1);
}

function parseCookies(cookieHeader = '') {
  const out = {};
  cookieHeader.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx <= 0) return;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    out[key] = decodeURIComponent(value);
  });
  return out;
}

function authCookie(token) {
  const maxAge = 7 * 24 * 60 * 60;
  const parts = [
    `auth_token=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAge}`
  ];
  if (IS_PROD) parts.push('Secure');
  return parts.join('; ');
}

function clearAuthCookie() {
  const parts = [
    'auth_token=',
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0'
  ];
  if (IS_PROD) parts.push('Secure');
  return parts.join('; ');
}

function sanitizeText(value, maxLen = 200) {
  const v = String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/[<>"'&]/g, '')
    .trim();
  return v.slice(0, maxLen);
}

function sanitizeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toOptionalPositiveInt(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function isValidHexColor(value) {
  return /^#[0-9a-fA-F]{6}$/.test(String(value || ''));
}

function normalizeUsername(username) {
  return String(username || '').trim().slice(0, 80);
}

function isValidUsername(username) {
  return /^[a-zA-Z0-9_.-]{3,80}$/.test(username);
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase().slice(0, 160);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ''));
}

function normalizeColorHex(color) {
  return String(color || '').trim().toUpperCase();
}

function closestAllowedColor(color) {
  const normalized = normalizeColorHex(color);
  if (ALLOWED_CATEGORY_COLORS.has(normalized)) return normalized;
  if (!isValidHexColor(normalized)) return '#808080';
  const toRgb = (hex) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16)
  ];
  const [r, g, b] = toRgb(normalized);
  let best = '#808080';
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const allowed of ALLOWED_CATEGORY_COLORS) {
    const [ar, ag, ab] = toRgb(allowed);
    const distance = ((r - ar) ** 2) + ((g - ag) ** 2) + ((b - ab) ** 2);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = allowed;
    }
  }
  return best;
}

function isUniqueViolation(err) {
  if (!err) return false;
  const msg = String(err.message || '').toLowerCase();
  return err.code === '23505' || msg.includes('unique');
}

const authAttempts = new Map();
const AUTH_WINDOW_MS = 15 * 60 * 1000;
const AUTH_MAX_ATTEMPTS = 12;
const IN_PROGRESS_QUADRANT = 'en_progreso';
const LEGACY_LOGIN_TOKEN_TTL = '20m';
const RESET_TOKEN_TTL_MS = 1000 * 60 * 30;
const ALLOWED_CATEGORY_COLORS = new Set([
  '#FF0000',
  '#0000FF',
  '#00FF00',
  '#FFFF00',
  '#00FFFF',
  '#FF00FF',
  '#FFFFFF',
  '#808080',
  '#FFA500'
]);

function nowIso() {
  return new Date().toISOString();
}

function elapsedSecondsSince(startedAt) {
  if (!startedAt) return 0;
  const startedMs = Date.parse(startedAt);
  if (!Number.isFinite(startedMs)) return 0;
  const diffMs = Date.now() - startedMs;
  if (!Number.isFinite(diffMs) || diffMs <= 0) return 0;
  return Math.floor(diffMs / 1000);
}

function authRateLimit(req, res, next) {
  const now = Date.now();
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const entry = authAttempts.get(ip) || { count: 0, first: now };
  if (now - entry.first > AUTH_WINDOW_MS) {
    authAttempts.set(ip, { count: 1, first: now });
    return next();
  }
  if (entry.count >= AUTH_MAX_ATTEMPTS) {
    return res.status(429).json({ error: 'Too many auth attempts, try again later' });
  }
  entry.count += 1;
  authAttempts.set(ip, entry);
  return next();
}

function authSuccess(req) {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  authAttempts.delete(ip);
}

function buildAuthResponse(user, token, extras = {}) {
  return {
    token,
    user_id: user.id,
    username: user.username,
    email: user.email || null,
    ...extras
  };
}

function signUserToken(user) {
  return jwt.sign(
    {
      user_id: user.id,
      username: user.username,
      password_version: Number(user.password_version || 0)
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function signLegacyCompletionToken(userId) {
  return jwt.sign(
    { user_id: userId, purpose: 'legacy-email-completion' },
    JWT_SECRET,
    { expiresIn: LEGACY_LOGIN_TOKEN_TTL }
  );
}

function hashOpaqueToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

async function sendPasswordResetEmail(email, resetUrl) {
  if (!RESEND_API_KEY || !RESEND_FROM_EMAIL) {
    console.warn('[password-reset] Missing RESEND config. Reset URL:', resetUrl);
    return;
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to: [email],
      subject: 'Recuperar contrasena',
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2>Recuperar contrasena</h2>
          <p>Recibimos una solicitud para cambiar la contrasena de tu cuenta.</p>
          <p><a href="${resetUrl}">Crear una nueva contrasena</a></p>
          <p>Este enlace vence en 30 minutos y solo puede usarse una vez.</p>
          <p>Si no solicitaste este cambio, podes ignorar este correo.</p>
        </div>
      `
    })
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Resend error: ${response.status} ${body}`);
  }
}

function getUserById(userId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE id = ?', [userId], (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

function getUserByEmail(email) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE LOWER(email) = LOWER(?)', [email], (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

function getUserByUsername(username) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

async function verifyPassword(user, password) {
  if (!user) return false;
  if (String(user.password_hash || '').startsWith('$2')) {
    return bcrypt.compare(password, user.password_hash);
  }
  const legacyHash = crypto.scryptSync(password, user.salt, 64).toString('hex');
  return legacyHash === user.password_hash;
}

function markResetTokenUsed(tokenHash) {
  return new Promise((resolve, reject) => {
    db.run('UPDATE password_reset_tokens SET used_at = ? WHERE token_hash = ?', [nowIso(), tokenHash], function(err) {
      if (err) return reject(err);
      resolve(this.changes || 0);
    });
  });
}

app.use(express.json({ limit: '256kb' }));

const { db, driver: DB_DRIVER, bootstrapPromise = Promise.resolve() } = initDb();
console.log(`Database driver active: ${DB_DRIVER}`);

app.use((req, res, next) => {
  Promise.resolve(bootstrapPromise)
    .then(() => next())
    .catch((err) => {
      console.error('[db-bootstrap]', err?.message || err);
      res.status(500).json({ error: 'Service temporarily unavailable' });
    });
});

app.use(express.static(path.join(__dirname, 'public')));

// AUTHENTICATION
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const bearer = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
  const cookies = parseCookies(req.headers.cookie || '');
  const token = cookies.auth_token || bearer;
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    db.get('SELECT id, username, email, password_version FROM users WHERE id = ?', [decoded.user_id], (err, user) => {
      if (err || !user) return res.status(401).json({ error: 'Invalid or expired session' });
      if (Number(decoded.password_version || 0) !== Number(user.password_version || 0)) {
        return res.status(401).json({ error: 'Invalid or expired session' });
      }
      req.userId = user.id;
      req.user = user;
      next();
    });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
};

app.post('/api/auth/register', authRateLimit, async (req, res) => {
  const { username, email, password } = req.body;
  const cleanUsername = normalizeUsername(username);
  const cleanEmail = normalizeEmail(email);
  if (!cleanUsername || !cleanEmail || !password) {
    return res.status(400).json({ error: 'username, email and password required' });
  }
  if (!isValidUsername(cleanUsername) || !isValidEmail(cleanEmail) || String(password).length < 8) {
    return res.status(400).json({ error: 'Invalid registration data' });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    db.run(
      'INSERT INTO users (username, email, password_hash, salt, password_version) VALUES (?, ?, ?, ?, 0)',
      [cleanUsername, cleanEmail, hash, ''],
      function(err) {
        if (err) {
          if (isUniqueViolation(err)) {
            const msg = String(err.message || '').toLowerCase();
            if (msg.includes('email')) return res.status(400).json({ error: 'Email already exists' });
            return res.status(400).json({ error: 'Username already exists' });
          }
          return res.status(500).json({ error: 'Internal server error' });
        }
        const user = {
          id: this.lastID,
          username: cleanUsername,
          email: cleanEmail,
          password_version: 0
        };
        const token = signUserToken(user);
        authSuccess(req);
        res.setHeader('Set-Cookie', authCookie(token));
        res.status(201).json(buildAuthResponse(user, token));
      }
    );
  } catch (_error) {
    res.status(500).json({ error: 'Internal server error while hashing password' });
  }
});

app.post('/api/auth/login', authRateLimit, async (req, res) => {
  const { email, password } = req.body;
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail || !password) return res.status(400).json({ error: 'email and password required' });
  try {
    const user = await getUserByEmail(cleanEmail);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const isMatch = await verifyPassword(user, password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signUserToken(user);
    authSuccess(req);
    res.setHeader('Set-Cookie', authCookie(token));
    res.json(buildAuthResponse(user, token));
  } catch (_err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/login-legacy', authRateLimit, async (req, res) => {
  const { username, password } = req.body;
  const cleanUsername = normalizeUsername(username);
  if (!cleanUsername || !password) return res.status(400).json({ error: 'username and password required' });
  try {
    const user = await getUserByUsername(cleanUsername);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const isMatch = await verifyPassword(user, password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });
    if (user.email && isValidEmail(user.email)) {
      return res.status(400).json({ error: 'This account already uses email login' });
    }
    authSuccess(req);
    return res.json({
      requires_email: true,
      legacy_token: signLegacyCompletionToken(user.id),
      username: user.username
    });
  } catch (_err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/complete-email', authRateLimit, async (req, res) => {
  const { legacy_token, email } = req.body;
  const cleanEmail = normalizeEmail(email);
  if (!legacy_token || !cleanEmail) return res.status(400).json({ error: 'legacy_token and email required' });
  if (!isValidEmail(cleanEmail)) return res.status(400).json({ error: 'Email invalido' });
  try {
    const decoded = jwt.verify(legacy_token, JWT_SECRET);
    if (decoded.purpose !== 'legacy-email-completion') {
      return res.status(401).json({ error: 'Invalid legacy token' });
    }
    const user = await getUserById(decoded.user_id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    db.run(
      'UPDATE users SET email = ? WHERE id = ?',
      [cleanEmail, user.id],
      async function(err) {
        if (err) {
          if (isUniqueViolation(err)) return res.status(400).json({ error: 'Email already exists' });
          return res.status(500).json({ error: 'Internal server error' });
        }
        const updatedUser = await getUserById(user.id);
        const token = signUserToken(updatedUser);
        res.setHeader('Set-Cookie', authCookie(token));
        return res.json(buildAuthResponse(updatedUser, token));
      }
    );
  } catch (_err) {
    return res.status(401).json({ error: 'Invalid or expired legacy token' });
  }
});

app.post('/api/auth/forgot-password', authRateLimit, async (req, res) => {
  const cleanEmail = normalizeEmail(req.body?.email);
  const generic = { success: true, message: 'Si existe una cuenta asociada, enviamos instrucciones al correo.' };
  if (!cleanEmail || !isValidEmail(cleanEmail)) return res.json(generic);
  try {
    const user = await getUserByEmail(cleanEmail);
    if (!user) return res.json(generic);
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashOpaqueToken(rawToken);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();
    db.run(
      'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
      [user.id, tokenHash, expiresAt],
      async (err) => {
        if (err) {
          console.error('[forgot-password]', err.message);
          return res.json(generic);
        }
        const resetUrl = `${APP_BASE_URL}/?reset_token=${encodeURIComponent(rawToken)}`;
        try {
          await sendPasswordResetEmail(cleanEmail, resetUrl);
        } catch (emailErr) {
          console.error('[forgot-password-email]', emailErr.message);
        }
        return res.json(generic);
      }
    );
  } catch (_err) {
    return res.json(generic);
  }
});

app.post('/api/auth/reset-password', authRateLimit, async (req, res) => {
  const { reset_token, password } = req.body;
  if (!reset_token || String(password || '').length < 8) {
    return res.status(400).json({ error: 'Invalid reset request' });
  }
  const tokenHash = hashOpaqueToken(reset_token);
  try {
    db.get(
      `SELECT prt.*, u.id as user_id, u.username, u.email, u.password_version
       FROM password_reset_tokens prt
       JOIN users u ON u.id = prt.user_id
       WHERE prt.token_hash = ? AND prt.used_at IS NULL AND prt.expires_at > ?
       LIMIT 1`,
      [tokenHash, nowIso()],
      async (err, row) => {
        if (err || !row) return res.status(400).json({ error: 'Reset link invalido o vencido' });
        const hash = await bcrypt.hash(password, 10);
        db.run(
          'UPDATE users SET password_hash = ?, salt = ?, password_version = COALESCE(password_version, 0) + 1 WHERE id = ?',
          [hash, '', row.user_id],
          async (updateErr) => {
            if (updateErr) return res.status(500).json({ error: 'Internal server error' });
            await markResetTokenUsed(tokenHash);
            const updatedUser = await getUserById(row.user_id);
            const token = signUserToken(updatedUser);
            res.setHeader('Set-Cookie', authCookie(token));
            return res.json(buildAuthResponse(updatedUser, token, { password_reset: true }));
          }
        );
      }
    );
  } catch (_err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/logout', authenticate, (req, res) => {
  res.setHeader('Set-Cookie', clearAuthCookie());
  res.json({ success: true });
});

app.get('/api/auth/me', authenticate, (req, res) => {
  db.get('SELECT id, username, email FROM users WHERE id = ?', [req.userId], (err, user) => {
    if (err || !user) return res.status(401).json({ error: 'Unauthorized' });
    return res.json({ user_id: user.id, username: user.username, email: user.email || null });
  });
});

function getAccessibleTeamIds(userId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT DISTINCT t.id
       FROM teams t
       LEFT JOIN team_memberships tm ON tm.team_id = t.id
       WHERE t.user_id = ? OR tm.member_user_id = ?`,
      [userId, userId],
      (err, rows) => {
        if (err) return reject(err);
        resolve((rows || []).map((row) => Number(row.id)));
      }
    );
  });
}

function userHasTeamAccess(userId, teamId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT t.id
       FROM teams t
       LEFT JOIN team_memberships tm ON tm.team_id = t.id AND tm.member_user_id = ?
       WHERE t.id = ? AND (t.user_id = ? OR tm.member_user_id = ?)
       LIMIT 1`,
      [userId, teamId, userId, userId],
      (err, row) => {
        if (err) return reject(err);
        resolve(Boolean(row));
      }
    );
  });
}

function userOwnsTeam(userId, teamId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT id FROM teams WHERE id = ? AND user_id = ?', [teamId, userId], (err, row) => {
      if (err) return reject(err);
      resolve(Boolean(row));
    });
  });
}

function getCuentaTeamIds(cuentaId) {
  return new Promise((resolve, reject) => {
    db.all('SELECT team_id FROM cuenta_equipos WHERE cuenta_id = ?', [cuentaId], (err, rows) => {
      if (err) return reject(err);
      resolve((rows || []).map((row) => Number(row.team_id)));
    });
  });
}

function syncCuentaTeams(cuentaId, teamIds) {
  const uniqueIds = [...new Set((teamIds || []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM cuenta_equipos WHERE cuenta_id = ?', [cuentaId], (deleteErr) => {
      if (deleteErr) return reject(deleteErr);
      if (!uniqueIds.length) return resolve([]);
      let index = 0;
      const insertNext = () => {
        if (index >= uniqueIds.length) return resolve(uniqueIds);
        db.run(
          'INSERT INTO cuenta_equipos (cuenta_id, team_id) VALUES (?, ?)',
          [cuentaId, uniqueIds[index]],
          (insertErr) => {
            if (insertErr) return reject(insertErr);
            index += 1;
            insertNext();
          }
        );
      };
      insertNext();
    });
  });
}

function getTeamMemberIds(teamId) {
  return new Promise((resolve, reject) => {
    db.all('SELECT member_user_id FROM team_memberships WHERE team_id = ?', [teamId], (err, rows) => {
      if (err) return reject(err);
      resolve((rows || []).map((row) => Number(row.member_user_id)));
    });
  });
}

function getTeamDependencyCounts(teamId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT
         (SELECT COUNT(*) FROM tasks WHERE team_id = ? AND COALESCE(completed, 0) = 0) AS open_tasks,
         (SELECT COUNT(*) FROM cuenta_equipos WHERE team_id = ?) AS linked_accounts,
         (SELECT COUNT(*) FROM inv_activos WHERE team_id = ?) AS linked_investments`,
      [teamId, teamId, teamId],
      (err, row) => {
        if (err) return reject(err);
        resolve({
          open_tasks: Number(row?.open_tasks || 0),
          linked_accounts: Number(row?.linked_accounts || 0),
          linked_investments: Number(row?.linked_investments || 0)
        });
      }
    );
  });
}

function cleanupTeamAssignments(teamId) {
  return new Promise((resolve, reject) => {
    db.run('UPDATE tasks SET team_id = NULL, assigned_user_id = NULL, assigned = ? WHERE team_id = ?', ['', teamId], (taskErr) => {
      if (taskErr) return reject(taskErr);
      db.run('DELETE FROM cuenta_equipos WHERE team_id = ?', [teamId], (accountErr) => {
        if (accountErr) return reject(accountErr);
        db.run('UPDATE inv_activos SET team_id = NULL WHERE team_id = ?', [teamId], (assetErr) => {
          if (assetErr) return reject(assetErr);
          db.run('UPDATE inv_transacciones SET team_id = NULL WHERE team_id = ?', [teamId], (txErr) => {
            if (txErr) return reject(txErr);
            resolve();
          });
        });
      });
    });
  });
}

function getInvestmentTeamAccessClause(alias = 'a') {
  return `(${alias}.user_id = ? OR EXISTS (
    SELECT 1
    FROM team_memberships tm
    WHERE tm.team_id = ${alias}.team_id AND tm.member_user_id = ?
  ))`;
}

app.get('/api/users/search', authenticate, (req, res) => {
  const rawQuery = String(req.query.q || '').trim();
  const normalizedQuery = rawQuery.replace(/^@+/, '').slice(0, 80);
  const sql = normalizedQuery
    ? `SELECT id, username
       FROM users
       WHERE LOWER(username) LIKE LOWER(?)
       ORDER BY username ASC
       LIMIT 10`
    : `SELECT id, username
       FROM users
       ORDER BY username ASC
       LIMIT 10`;
  const params = normalizedQuery ? [`${normalizedQuery}%`] : [];

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    return res.json(rows || []);
  });
});

app.get('/api/tasks', authenticate, (req, res) => {
  db.all(
    `SELECT t.*, tm.name AS team_name, au.username AS assigned_username
     FROM tasks t
     LEFT JOIN teams tm ON tm.id = t.team_id
     LEFT JOIN users au ON au.id = t.assigned_user_id
     WHERE t.user_id = ?
        OR t.assigned_user_id = ?
        OR EXISTS (
          SELECT 1 FROM team_memberships tmm
          WHERE tmm.team_id = t.team_id AND tmm.member_user_id = ?
        )
     ORDER BY t.position ASC, t.id DESC`,
    [req.userId, req.userId, req.userId],
    (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    return res.json(rows);
    }
  );
});

app.post('/api/tasks', authenticate, (req, res) => {
  const {
    title,
    description = '',
    quadrant,
    assigned = '',
    category = '',
    fecha = '',
    completed = 0,
    team_id,
    assigned_user_id
  } = req.body;

  if (!title || !quadrant) {
    return res.status(400).json({ error: 'title and quadrant are required' });
  }

  const normalizedTeamId = toOptionalPositiveInt(team_id);
  const normalizedAssignedUserId = toOptionalPositiveInt(assigned_user_id);
  if (assigned_user_id !== undefined && assigned_user_id !== null && assigned_user_id !== '' && !normalizedAssignedUserId) {
    return res.status(400).json({ error: 'assigned_user_id invalido' });
  }
  if (team_id !== undefined && team_id !== null && team_id !== '' && !normalizedTeamId) {
    return res.status(400).json({ error: 'team_id invalido' });
  }
  if (normalizedAssignedUserId && !normalizedTeamId) {
    return res.status(400).json({ error: 'Debe indicar team_id para asignar un usuario' });
  }

  const validateAndInsert = () => {
    const startedAt = quadrant === IN_PROGRESS_QUADRANT && !completed ? nowIso() : null;
    const everInProgress = quadrant === IN_PROGRESS_QUADRANT ? 1 : 0;
    const sql = `
      INSERT INTO tasks (
        title, description, quadrant, assigned, category, fecha, completed, user_id,
        in_progress_seconds, in_progress_started_at, ever_in_progress, team_id, assigned_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      title.trim(),
      description.trim(),
      quadrant,
      assigned.trim(),
      category.trim(),
      String(fecha || '').trim(),
      completed ? 1 : 0,
      req.userId,
      0,
      startedAt,
      everInProgress,
      normalizedTeamId,
      normalizedAssignedUserId
    ];

    db.run(sql, params, function runCallback(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      db.get(
        `SELECT t.*, tm.name AS team_name, au.username AS assigned_username
         FROM tasks t
         LEFT JOIN teams tm ON tm.id = t.team_id
         LEFT JOIN users au ON au.id = t.assigned_user_id
         WHERE t.id = ?`,
        [this.lastID],
        (selectErr, row) => {
          if (selectErr) {
            return res.status(500).json({ error: selectErr.message });
          }
          return res.status(201).json(row);
        }
      );
    });
  };

  if (normalizedTeamId) {
    userHasTeamAccess(req.userId, normalizedTeamId).then((hasAccess) => {
      if (!hasAccess) return res.status(400).json({ error: 'El equipo seleccionado no existe o no te pertenece' });
      if (!normalizedAssignedUserId) return validateAndInsert();
      db.get(
        'SELECT 1 FROM team_memberships WHERE team_id = ? AND member_user_id = ?',
        [normalizedTeamId, normalizedAssignedUserId],
        (memberErr, memberRow) => {
          if (memberErr) return res.status(500).json({ error: memberErr.message });
          if (!memberRow) return res.status(400).json({ error: 'El usuario asignado no pertenece al equipo seleccionado' });
          return validateAndInsert();
        }
      );
    }).catch((teamErr) => res.status(500).json({ error: teamErr.message }));
    return;
  }

  return validateAndInsert();
});

app.put('/api/tasks/reorder', authenticate, (req, res) => {
  const { tasks: orderedTasks } = req.body;
  if (!Array.isArray(orderedTasks)) {
    return res.status(400).json({ error: 'tasks array is required' });
  }

  const updateOne = (index) => {
    if (index >= orderedTasks.length) {
      return res.json({ success: true });
    }
    const task = orderedTasks[index];
    db.run(
      'UPDATE tasks SET position = ? WHERE id = ? AND user_id = ?',
      [index, task.id, req.userId],
      function(runErr) {
        if (runErr) return res.status(500).json({ error: runErr.message });
        return updateOne(index + 1);
      }
    );
  };

  return updateOne(0);
});

app.put('/api/tasks/:id', authenticate, (req, res) => {
  const { id } = req.params;
  const { quadrant } = req.body;

  if (!quadrant) {
    return res.status(400).json({ error: 'quadrant is required' });
  }

  db.get('SELECT * FROM tasks WHERE id = ? AND user_id = ?', [id, req.userId], (selectErr, task) => {
    if (selectErr) {
      return res.status(500).json({ error: selectErr.message });
    }
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    let inProgressSeconds = Number(task.in_progress_seconds || 0);
    let inProgressStartedAt = task.in_progress_started_at || null;
    let everInProgress = Number(task.ever_in_progress || 0);

    const wasInProgress = task.quadrant === IN_PROGRESS_QUADRANT;
    const willBeInProgress = quadrant === IN_PROGRESS_QUADRANT;

    if (wasInProgress && !willBeInProgress && inProgressStartedAt) {
      inProgressSeconds += elapsedSecondsSince(inProgressStartedAt);
      inProgressStartedAt = null;
    } else if (!wasInProgress && willBeInProgress) {
      inProgressStartedAt = nowIso();
      everInProgress = 1;
    }

    db.run(
      `UPDATE tasks
       SET quadrant = ?, in_progress_seconds = ?, in_progress_started_at = ?, ever_in_progress = ?
       WHERE id = ? AND user_id = ?`,
      [quadrant, Math.max(0, Math.floor(inProgressSeconds)), inProgressStartedAt, everInProgress ? 1 : 0, id, req.userId],
      function runCallback(err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }

        if (this.changes === 0) {
          return res.status(404).json({ error: 'Task not found' });
        }

        return res.json({ id: Number(id), quadrant, updated: true });
      }
    );
  });
});

app.patch('/api/tasks/:id', authenticate, (req, res) => {
  const { id } = req.params;
  const allowedFields = ['title', 'description', 'assigned', 'category', 'quadrant', 'fecha', 'completed', 'team_id', 'assigned_user_id'];
  db.get('SELECT * FROM tasks WHERE id = ? AND user_id = ?', [id, req.userId], (selectErr, task) => {
    if (selectErr) {
      return res.status(500).json({ error: selectErr.message });
    }
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const updates = [];
    const params = [];
    let nextQuadrant = task.quadrant;
    let nextCompleted = Number(task.completed || 0);
    let nextTeamId = task.team_id ? Number(task.team_id) : null;
    let nextAssignedUserId = task.assigned_user_id ? Number(task.assigned_user_id) : null;

    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        let value = req.body[field];
        if (typeof value === 'string') {
          value = value.trim();
        }

        if (field === 'title' && !value) {
          return res.status(400).json({ error: 'title cannot be empty' });
        }

        if (field === 'quadrant') nextQuadrant = value;
        if (field === 'completed') {
          const normalizedCompleted = value === true || value === 1 || value === '1' ? 1 : 0;
          nextCompleted = normalizedCompleted;
          value = normalizedCompleted;
        }
        if (field === 'team_id') {
          if (value === '' || value === null) {
            value = null;
          } else {
            value = toOptionalPositiveInt(value);
            if (!value) return res.status(400).json({ error: 'team_id invalido' });
          }
          nextTeamId = value;
        }
        if (field === 'assigned_user_id') {
          if (value === '' || value === null) {
            value = null;
          } else {
            value = toOptionalPositiveInt(value);
            if (!value) return res.status(400).json({ error: 'assigned_user_id invalido' });
          }
          nextAssignedUserId = value;
        }

        updates.push(`${field} = ?`);
        params.push(value);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    let inProgressSeconds = Number(task.in_progress_seconds || 0);
    let inProgressStartedAt = task.in_progress_started_at || null;
    let everInProgress = Number(task.ever_in_progress || 0);

    const wasInProgress = task.quadrant === IN_PROGRESS_QUADRANT;
    const willBeInProgress = nextQuadrant === IN_PROGRESS_QUADRANT;
    if (wasInProgress && !willBeInProgress && inProgressStartedAt) {
      inProgressSeconds += elapsedSecondsSince(inProgressStartedAt);
      inProgressStartedAt = null;
    } else if (!wasInProgress && willBeInProgress) {
      inProgressStartedAt = nowIso();
      everInProgress = 1;
    }

    if (nextCompleted && inProgressStartedAt) {
      inProgressSeconds += elapsedSecondsSince(inProgressStartedAt);
      inProgressStartedAt = null;
    }

    updates.push('in_progress_seconds = ?');
    params.push(Math.max(0, Math.floor(inProgressSeconds)));
    updates.push('in_progress_started_at = ?');
    params.push(inProgressStartedAt);
    updates.push('ever_in_progress = ?');
    params.push(everInProgress ? 1 : 0);

    if (nextAssignedUserId && !nextTeamId) {
      return res.status(400).json({ error: 'Debe indicar team_id para asignar un usuario' });
    }

    const persistTaskChanges = () => {
      params.push(id, req.userId);
      db.run(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`, params, function runCallback(err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }

        if (this.changes === 0) {
          return res.status(404).json({ error: 'Task not found' });
        }

        db.get(
          `SELECT t.*, tm.name AS team_name, au.username AS assigned_username
           FROM tasks t
           LEFT JOIN teams tm ON tm.id = t.team_id
           LEFT JOIN users au ON au.id = t.assigned_user_id
           WHERE t.id = ?`,
          [id],
          (selectUpdatedErr, row) => {
            if (selectUpdatedErr) {
              return res.status(500).json({ error: selectUpdatedErr.message });
            }
            return res.json(row);
          }
        );
      });
    };

    if (!nextTeamId) {
      return persistTaskChanges();
    }

    userHasTeamAccess(req.userId, nextTeamId).then((hasAccess) => {
      if (!hasAccess) return res.status(400).json({ error: 'El equipo seleccionado no existe o no te pertenece' });
      if (!nextAssignedUserId) return persistTaskChanges();
      db.get(
        'SELECT 1 FROM team_memberships WHERE team_id = ? AND member_user_id = ?',
        [nextTeamId, nextAssignedUserId],
        (memberErr, member) => {
          if (memberErr) return res.status(500).json({ error: memberErr.message });
          if (!member) return res.status(400).json({ error: 'El usuario asignado no pertenece al equipo seleccionado' });
          return persistTaskChanges();
        }
      );
    }).catch((teamErr) => res.status(500).json({ error: teamErr.message }));
  });
});

app.delete('/api/tasks/:id', authenticate, (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM tasks WHERE id = ? AND user_id = ?', [id, req.userId], function runCallback(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    return res.json({ id: Number(id), deleted: true });
  });
});

// Team API
app.get('/api/teams', authenticate, (req, res) => {
  db.all(
    `SELECT DISTINCT t.id, t.name, t.user_id, t.created_at
     FROM teams t
     LEFT JOIN team_memberships tm ON tm.team_id = t.id
     WHERE t.user_id = ? OR tm.member_user_id = ?
     ORDER BY t.name ASC`,
    [req.userId, req.userId],
    (err, teams) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (!teams.length) return res.json([]);

    const teamIds = teams.map((t) => t.id);
    const placeholders = teamIds.map(() => '?').join(', ');
    db.all(
      `SELECT tm.team_id, tm.member_user_id, u.username
       FROM team_memberships tm
       JOIN users u ON u.id = tm.member_user_id
       WHERE tm.team_id IN (${placeholders})
       ORDER BY u.username ASC`,
      teamIds,
      (membersErr, rows) => {
        if (membersErr) return res.status(500).json({ error: membersErr.message });
        const membersByTeam = new Map();
        rows.forEach((row) => {
          if (!membersByTeam.has(row.team_id)) membersByTeam.set(row.team_id, []);
          membersByTeam.get(row.team_id).push({
            user_id: row.member_user_id,
            username: row.username
          });
        });

        return res.json(
          teams.map((team) => ({
            ...team,
            is_owner: Number(team.user_id) === Number(req.userId),
            members: membersByTeam.get(team.id) || []
          }))
        );
      }
    );
    }
  );
});

app.post('/api/teams', authenticate, (req, res) => {
  const name = sanitizeText(req.body?.name, 120);
  if (!name) return res.status(400).json({ error: 'name is required' });
  db.run('INSERT INTO teams (name, user_id) VALUES (?, ?)', [name, req.userId], function(err) {
    if (err) {
      if (isUniqueViolation(err)) return res.status(400).json({ error: 'Team already exists' });
      return res.status(500).json({ error: err.message });
    }
    const teamId = this.lastID;
    db.run(
      'INSERT OR IGNORE INTO team_memberships (team_id, member_user_id) VALUES (?, ?)',
      [teamId, req.userId],
      (memberErr) => {
        if (memberErr) return res.status(500).json({ error: memberErr.message });
        return res.status(201).json({
          id: teamId,
          name,
          user_id: req.userId,
          is_owner: true,
          members: [{ user_id: req.userId, username: req.user.username }]
        });
      }
    );
  });
});

app.patch('/api/teams/:id', authenticate, (req, res) => {
  const teamId = toOptionalPositiveInt(req.params.id);
  if (!teamId) return res.status(400).json({ error: 'team id invalido' });
  const name = sanitizeText(req.body?.name, 120);
  if (!name) return res.status(400).json({ error: 'name is required' });

  db.run(
    'UPDATE teams SET name = ? WHERE id = ? AND user_id = ?',
    [name, teamId, req.userId],
    function(err) {
      if (err) {
        if (isUniqueViolation(err)) return res.status(400).json({ error: 'Team already exists' });
        return res.status(500).json({ error: err.message });
      }
      if (this.changes === 0) return res.status(404).json({ error: 'Team not found' });
      return res.json({ id: teamId, name, updated: true });
    }
  );
});

app.delete('/api/teams/:id', authenticate, (req, res) => {
  const teamId = toOptionalPositiveInt(req.params.id);
  if (!teamId) return res.status(400).json({ error: 'team id invalido' });
  const forceCleanup = req.body?.force_cleanup === true;
  userOwnsTeam(req.userId, teamId).then(async (isOwner) => {
    if (!isOwner) return res.status(404).json({ error: 'Team not found' });
    const deps = await getTeamDependencyCounts(teamId);
    const hasDeps = deps.open_tasks > 0 || deps.linked_accounts > 0 || deps.linked_investments > 0;
    if (hasDeps && !forceCleanup) {
      return res.status(409).json({
        error: 'El equipo tiene asignaciones activas',
        requires_cleanup: true,
        dependencies: deps
      });
    }
    await cleanupTeamAssignments(teamId);
    db.run('DELETE FROM teams WHERE id = ? AND user_id = ?', [teamId, req.userId], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Team not found' });
      return res.json({ id: teamId, deleted: true, cleaned_up: hasDeps });
    });
  }).catch((err) => res.status(500).json({ error: err.message }));
});

app.post('/api/teams/:id/members', authenticate, (req, res) => {
  const teamId = toOptionalPositiveInt(req.params.id);
  if (!teamId) return res.status(400).json({ error: 'team id invalido' });
  const username = sanitizeText(req.body?.username, 80);
  if (!username) return res.status(400).json({ error: 'username is required' });

  db.get('SELECT id FROM teams WHERE id = ? AND user_id = ?', [teamId, req.userId], (teamErr, team) => {
    if (teamErr) return res.status(500).json({ error: teamErr.message });
    if (!team) return res.status(404).json({ error: 'Team not found' });

    db.get('SELECT id, username FROM users WHERE username = ?', [username], (userErr, user) => {
      if (userErr) return res.status(500).json({ error: userErr.message });
      if (!user) return res.status(400).json({ error: 'El usuario no existe' });

      db.run(
        'INSERT INTO team_memberships (team_id, member_user_id) VALUES (?, ?)',
        [teamId, user.id],
        function(insertErr) {
          if (insertErr) {
            if (isUniqueViolation(insertErr)) return res.status(400).json({ error: 'El usuario ya pertenece a este equipo' });
            return res.status(500).json({ error: insertErr.message });
          }
          return res.status(201).json({ team_id: teamId, user_id: user.id, username: user.username });
        }
      );
    });
  });
});

app.delete('/api/teams/:id/members/:memberUserId', authenticate, (req, res) => {
  const teamId = toOptionalPositiveInt(req.params.id);
  const memberUserId = toOptionalPositiveInt(req.params.memberUserId);
  if (!teamId || !memberUserId) return res.status(400).json({ error: 'id invalido' });

  userOwnsTeam(req.userId, teamId).then((isOwner) => {
    if (!isOwner) return res.status(404).json({ error: 'Team not found' });
    if (Number(memberUserId) === Number(req.userId)) {
      return res.status(400).json({ error: 'El creador del equipo no puede quitarse del equipo' });
    }
    db.run(
      `DELETE FROM team_memberships
       WHERE team_id = ?
         AND member_user_id = ?`,
      [teamId, memberUserId],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Team member not found' });
        db.run(
          'UPDATE tasks SET assigned_user_id = NULL, assigned = ? WHERE team_id = ? AND assigned_user_id = ?',
          ['', teamId, memberUserId],
          (updateErr) => {
            if (updateErr) return res.status(500).json({ error: updateErr.message });
            return res.json({ team_id: teamId, user_id: memberUserId, deleted: true });
          }
        );
      }
    );
  }).catch((err) => res.status(500).json({ error: err.message }));
});

// Legacy endpoint compatibility
app.get('/api/team', authenticate, (req, res) => {
  db.all(
    `SELECT tm.id AS team_id, tm.name AS team_name, u.id AS id, u.username AS name
     FROM teams tm
     JOIN team_memberships tms ON tms.team_id = tm.id
     JOIN users u ON u.id = tms.member_user_id
     WHERE tm.user_id = ?
     ORDER BY tm.name ASC, u.username ASC`,
    [req.userId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      return res.json(rows);
    }
  );
});

// Gastos API

app.get('/api/expenses', authenticate, (req, res) => {
  db.all('SELECT * FROM expenses WHERE user_id = ? ORDER BY date DESC, id DESC', [req.userId], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    return res.json(rows);
  });
});

app.post('/api/expenses', authenticate, (req, res) => {
  const { description, amount, category = '', date = '' } = req.body;

  if (!description || amount === undefined) {
    return res.status(400).json({ error: 'description and amount are required' });
  }

  const sql = 'INSERT INTO expenses ("user", user_id, description, amount, category, date) VALUES (?, ?, ?, ?, ?, ?)';
  const params = ['legacy', req.userId, description.trim(), Number(amount), category.trim(), String(date || '').trim()];

  db.run(sql, params, function runCallback(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    db.get('SELECT * FROM expenses WHERE id = ?', [this.lastID], (selectErr, row) => {
      if (selectErr) {
        return res.status(500).json({ error: selectErr.message });
      }
      return res.status(201).json(row);
    });
  });
});

app.patch('/api/expenses/:id', authenticate, (req, res) => {
  const { id } = req.params;
  const allowedFields = ['description', 'amount', 'category', 'date'];
  const updates = [];
  const params = [];

  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) {
      let value = req.body[field];
      if (typeof value === 'string') {
        value = value.trim();
      }
      if (field === 'amount') {
        value = Number(value);
      }
      updates.push(`${field} = ?`);
      params.push(value);
    }
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  params.push(id, req.userId);
  db.run(`UPDATE expenses SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`, params, function runCallback(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Expense not found' });

    db.get('SELECT * FROM expenses WHERE id = ?', [id], (selectErr, row) => {
      if (selectErr) return res.status(500).json({ error: selectErr.message });
      return res.json(row);
    });
  });
});

app.delete('/api/expenses/:id', authenticate, (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM expenses WHERE id = ? AND user_id = ?', [id, req.userId], function runCallback(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Expense not found' });
    return res.json({ id: Number(id), deleted: true });
  });
});

// --- INVERSIONES API ---

app.get('/api/inv/sectores', authenticate, (req, res) => {
  db.all('SELECT * FROM inv_sectores WHERE user_id = ? ORDER BY nombre ASC', [req.userId], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Internal server error' });
    res.json(rows);
  });
});

app.post('/api/inv/sectores', authenticate, (req, res) => {
  const { nombre } = req.body;
  const cleanNombre = sanitizeText(nombre, 120);
  if (!cleanNombre) return res.status(400).json({ error: 'nombre is required' });
  db.run('INSERT INTO inv_sectores (nombre, user_id) VALUES (?, ?)', [cleanNombre, req.userId], function(err) {
    if (err) return res.status(500).json({ error: 'Internal server error' });
    res.status(201).json({ id_sector: this.lastID, nombre: cleanNombre });
  });
});

app.get('/api/inv/activos', authenticate, (req, res) => {
  db.all(`
    SELECT a.*, s.nombre as sector_nombre, tm.name as team_name
    FROM inv_activos a 
    LEFT JOIN inv_sectores s ON a.id_sector = s.id_sector
    LEFT JOIN teams tm ON tm.id = a.team_id
    WHERE ${getInvestmentTeamAccessClause('a')}
    ORDER BY a.ticker ASC
  `, [req.userId, req.userId], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Internal server error' });
    res.json(rows);
  });
});

app.post('/api/inv/activos', authenticate, async (req, res) => {
  const { ticker, nombre, id_sector, clase, api_provider, api_id, team_id = null } = req.body;
  const cleanTicker = sanitizeText(ticker, 30).toUpperCase();
  const cleanNombre = sanitizeText(nombre, 120);
  const cleanClase = sanitizeText(clase, 40);
  if (!cleanTicker || !cleanClase) return res.status(400).json({ error: 'ticker and clase are required' });
  const normalizedTeamId = team_id ? toOptionalPositiveInt(team_id) : null;
  if (team_id !== null && team_id !== undefined && team_id !== '' && !normalizedTeamId) {
    return res.status(400).json({ error: 'team_id invalido' });
  }
  if (normalizedTeamId) {
    const hasTeam = await userHasTeamAccess(req.userId, normalizedTeamId);
    if (!hasTeam) return res.status(400).json({ error: 'team_id invalido' });
  }

  const insertActivo = (sectorId) => {
    const sql = `INSERT INTO inv_activos (ticker, nombre, id_sector, clase, api_provider, api_id, precio_mercado, fecha_ultimo_precio, user_id, team_id)
                 VALUES (?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)`;
    const params = [cleanTicker, cleanNombre || '', sectorId || null, cleanClase, sanitizeText(api_provider || 'manual', 20), sanitizeText(api_id || '', 80) || null, req.userId, normalizedTeamId];

    db.run(sql, params, function(err) {
      if (err) return res.status(500).json({ error: 'Internal server error' });
      db.get('SELECT * FROM inv_activos WHERE id_activo = ?', [this.lastID], (selectErr, row) => {
        if (selectErr || !row) return res.status(500).json({ error: 'Internal server error' });
        res.status(201).json(row);
      });
    });
  };

  if (id_sector) {
    db.get('SELECT id_sector FROM inv_sectores WHERE id_sector = ? AND user_id = ?', [id_sector, req.userId], (err, sector) => {
      if (err) return res.status(500).json({ error: 'Internal server error' });
      if (!sector) return res.status(400).json({ error: 'id_sector invalido' });
      insertActivo(id_sector);
    });
  } else {
    insertActivo(null);
  }
});

app.patch('/api/inv/activos/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { precio_mercado, team_id } = req.body;
  const precio = sanitizeNumber(precio_mercado);
  const normalizedTeamId = team_id === undefined
    ? undefined
    : (team_id === null || team_id === '' ? null : toOptionalPositiveInt(team_id));
  if (team_id !== undefined && team_id !== null && team_id !== '' && !normalizedTeamId) {
    return res.status(400).json({ error: 'team_id invalido' });
  }
  if (precio === null && team_id === undefined) return res.status(400).json({ error: 'precio_mercado is required' });
  if (normalizedTeamId) {
    const hasTeam = await userHasTeamAccess(req.userId, normalizedTeamId);
    if (!hasTeam) return res.status(400).json({ error: 'team_id invalido' });
  }

  const updates = [];
  const params = [];
  if (precio !== null) {
    updates.push('precio_mercado = ?');
    params.push(precio);
    updates.push('fecha_ultimo_precio = CURRENT_TIMESTAMP');
  }
  if (team_id !== undefined) {
    updates.push('team_id = ?');
    params.push(normalizedTeamId);
  }
  params.push(id, req.userId, req.userId);
  db.run(`UPDATE inv_activos SET ${updates.join(', ')} WHERE id_activo = ? AND ${getInvestmentTeamAccessClause('inv_activos')}`, params, function(err) {
    if (err) return res.status(500).json({ error: 'Internal server error' });
    if (this.changes === 0) return res.status(404).json({ error: 'Activo not found' });
    res.json({ success: true, changes: this.changes });
  });
});

app.get('/api/inv/validate/:ticker', authenticate, async (req, res) => {
  const ticker = sanitizeText(req.params.ticker || '', 20).toUpperCase();
  if (!ticker) {
    return res.status(400).json({ valid: false, error: 'Ticker requerido' });
  }

  try {
    const fetchMod = await import('node-fetch').then(m => m.default).catch(() => global.fetch);
    if (!fetchMod) {
      return res.status(500).json({ valid: false, error: 'Fetch no disponible' });
    }

    const response = await fetchMod(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}`);
    if (!response.ok) {
      return res.status(404).json({ valid: false });
    }

    const data = await response.json();
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (typeof price === 'number' && Number.isFinite(price)) {
      return res.json({ valid: true, ticker, price });
    }

    return res.status(404).json({ valid: false });
  } catch (_err) {
    return res.status(404).json({ valid: false });
  }
});

app.get('/api/inv/transacciones', authenticate, (req, res) => {
  db.all(`
    SELECT t.*, a.ticker, a.team_id
    FROM inv_transacciones t 
    JOIN inv_activos a ON t.id_activo = a.id_activo 
    WHERE ${getInvestmentTeamAccessClause('a')}
    ORDER BY t.fecha_operacion DESC, t.id_transaccion DESC
  `, [req.userId, req.userId], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Internal server error' });
    res.json(rows);
  });
});

app.post('/api/inv/transacciones', authenticate, (req, res) => {
  const { fecha_operacion, id_activo, tipo_movimiento, cantidad, precio_operacion, moneda, resta_liquidez = false, tna = null } = req.body;
  if (!id_activo || !tipo_movimiento || cantidad === undefined || precio_operacion === undefined || !moneda) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const cantidadNum = sanitizeNumber(cantidad);
  const precioNum = sanitizeNumber(precio_operacion);
  if (cantidadNum === null || precioNum === null) return res.status(400).json({ error: 'cantidad/precio invalidos' });

  db.get(`SELECT id_activo, team_id FROM inv_activos WHERE id_activo = ? AND ${getInvestmentTeamAccessClause('inv_activos')}`, [id_activo, req.userId, req.userId], (activoErr, activo) => {
    if (activoErr) return res.status(500).json({ error: 'Internal server error' });
    if (!activo) return res.status(404).json({ error: 'Activo not found' });

    const sql = `INSERT INTO inv_transacciones (fecha_operacion, id_activo, tipo_movimiento, cantidad, precio_operacion, moneda, resta_liquidez, tna, user_id, team_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const params = [fecha_operacion || new Date().toISOString().split('T')[0], id_activo, sanitizeText(tipo_movimiento, 20), cantidadNum, precioNum, sanitizeText(moneda, 10), resta_liquidez ? 1 : 0, tna ? Number(tna) : null, req.userId, activo.team_id || null];

    db.run(sql, params, function(err) {
      if (err) return res.status(500).json({ error: 'Internal server error' });
      res.status(201).json({ id_transaccion: this.lastID });
    });
  });
});

app.get('/api/inv/portfolio', authenticate, (req, res) => {
  const query = `
    SELECT 
      a.id_activo, a.ticker, a.nombre, a.clase, a.precio_mercado, a.fecha_ultimo_precio, a.api_provider, a.team_id,
      s.nombre as sector, s.id_sector,
      SUM(CASE WHEN t.tipo_movimiento = 'INGRESO' THEN t.cantidad ELSE -t.cantidad END) as cantidad_total,
      SUM(CASE WHEN t.tipo_movimiento = 'INGRESO' THEN t.cantidad * t.precio_operacion WHEN t.tipo_movimiento = 'EGRESO' THEN -t.cantidad * t.precio_operacion ELSE 0 END) as costo_historico,
      MAX(t.moneda) as moneda_operacion
    FROM inv_activos a
    LEFT JOIN inv_sectores s ON a.id_sector = s.id_sector
    LEFT JOIN inv_transacciones t ON a.id_activo = t.id_activo
    WHERE ${getInvestmentTeamAccessClause('a')}
    GROUP BY a.id_activo
    HAVING cantidad_total > 0
  `;

  db.all(query, [req.userId, req.userId], (err, posiciones) => {
    if (err) return res.status(500).json({ error: 'Internal server error' });

    db.get("SELECT valor FROM inv_config WHERE clave = 'dolar_mep'", [], (configErr, config) => {
      if (configErr) console.error('[portfolio] Error fetching dolar_mep config:', configErr.message);
      const dolar_mep = config ? config.valor : 0;

      const now = new Date();
      posiciones.forEach(p => {
        p.alerta_frescura = false;
        if (p.fecha_ultimo_precio) {
          const lastUpdate = new Date(p.fecha_ultimo_precio + 'Z');
          const diffDays = (now - lastUpdate) / (1000 * 60 * 60 * 24);
          if (diffDays > 7 && p.api_provider !== 'manual') p.alerta_frescura = true;
        } else if (p.api_provider !== 'manual') {
          p.alerta_frescura = true;
        }
      });

      res.json({ posiciones, dolar_mep });
    });
  });
});

app.get('/api/inv/config', authenticate, (req, res) => {
  db.get("SELECT valor FROM inv_config WHERE clave = 'dolar_mep'", [], (err, row) => {
    if (err) return res.status(500).json({ error: 'Internal server error' });
    res.json({ dolar_mep: row ? row.valor : 0 });
  });
});

// --- AUTOMATIZACION API ---
async function updateDolarMep() {
  try {
    const fetchMod = await import('node-fetch').then(m => m.default).catch(() => global.fetch);
    if (!fetchMod) return;
    const response = await fetchMod('https://dolarapi.com/v1/dolares/mep');
    if (!response.ok) throw new Error('DolarApi res not ok');
    const data = await response.json();
    if (data && data.venta) {
      db.run("UPDATE inv_config SET valor = ? WHERE clave = 'dolar_mep'", [data.venta]);
      console.log('Dolar MEP actualizado a:', data.venta);
    }
  } catch (error) {
    console.error('Error actualizando Dolar MEP:', error.message);
  }
}

async function updateYahooFinance() {
  try {
    db.all("SELECT id_activo, api_id FROM inv_activos WHERE api_provider = 'yahoo' AND api_id IS NOT NULL", async (err, activos) => {
      if (err || !activos || activos.length === 0) return;
      const fetchMod = await import('node-fetch').then(m => m.default).catch(() => global.fetch);
      if (!fetchMod) return;
      
      for (const activo of activos) {
        try {
          const res = await fetchMod(`https://query1.finance.yahoo.com/v8/finance/chart/${activo.api_id}`);
          if (!res.ok) continue;
          const data = await res.json();
          const p = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
          if (p) {
            db.run("UPDATE inv_activos SET precio_mercado = ?, fecha_ultimo_precio = CURRENT_TIMESTAMP WHERE id_activo = ?", [p, activo.id_activo]);
          }
        } catch (e) {
          console.error(`Error actualizando ${activo.api_id}: `, e.message);
        }
      }
      console.log('Precios de Yahoo Finance actualizados.');
    });
  } catch (error) {
    console.error('Error general en Yahoo Finance Update:', error.message);
  }
}

// In serverless runtimes we should not rely on in-memory intervals.
if (!IS_SERVERLESS && IS_ENTRYPOINT) {
  setTimeout(() => {
    updateDolarMep();
    updateYahooFinance();
    setInterval(updateYahooFinance, 15 * 60 * 1000); // 15 mins
    setInterval(updateDolarMep, 60 * 60 * 1000); // 1 hr
  }, 5000);
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, serverless: IS_SERVERLESS });
});

app.get('/api/internal/refresh-prices', async (req, res) => {
  const vercelCronHeader = req.headers['x-vercel-cron'];
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  const isVercelCron = Boolean(vercelCronHeader);
  const hasValidBearer = CRON_SECRET && token === CRON_SECRET;

  if (!isVercelCron && !hasValidBearer) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  await updateDolarMep();
  await updateYahooFinance();
  return res.json({ ok: true, refreshed: true, at: new Date().toISOString() });
});

// ============================================================
// --- PRESUPUESTO API ---
// ============================================================

// Helper: add months to a YYYY-MM-DD date string
function addMonths(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setMonth(d.getMonth() + n);
  return d.toISOString().split('T')[0];
}

function normalizePaymentMethod(method) {
  const value = sanitizeText(method, 40) || 'Efectivo';
  if (value.toUpperCase() === 'TC') return 'Tarjeta credito';
  return value;
}

function roundCurrency(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function userHasCuentaAccess(userId, cuentaId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT c.id
       FROM cuentas c
       LEFT JOIN cuenta_usuarios cu ON c.id = cu.cuenta_id AND cu.user_id = ?
       WHERE c.id = ?
         AND (
           c.user_id = ?
           OR cu.user_id = ?
           OR EXISTS (
             SELECT 1
             FROM cuenta_equipos ce
             JOIN team_memberships tm ON tm.team_id = ce.team_id
             WHERE ce.cuenta_id = c.id AND tm.member_user_id = ?
           )
         )
       LIMIT 1`,
      [userId, cuentaId, userId, userId, userId],
      (err, row) => {
        if (err) return reject(err);
        resolve(Boolean(row));
      }
    );
  });
}

function getCategoriaOwnedByUser(userId, categoriaId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT cat.*
       FROM categorias cat
       JOIN cuentas c ON c.id = cat.cuenta_id
       LEFT JOIN cuenta_usuarios cu ON c.id = cu.cuenta_id AND cu.user_id = ?
       WHERE cat.id = ?
         AND (
           c.user_id = ?
           OR cu.user_id = ?
           OR EXISTS (
             SELECT 1
             FROM cuenta_equipos ce
             JOIN team_memberships tm ON tm.team_id = ce.team_id
             WHERE ce.cuenta_id = c.id AND tm.member_user_id = ?
           )
         )
       LIMIT 1`,
      [userId, categoriaId, userId, userId, userId],
      (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      }
    );
  });
}

function getGastoOwnedByUser(userId, gastoId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT g.*
       FROM gastos g
       JOIN cuentas c ON c.id = g.cuenta_id
       LEFT JOIN cuenta_usuarios cu ON c.id = cu.cuenta_id AND cu.user_id = ?
       WHERE g.id = ?
         AND (
           c.user_id = ?
           OR cu.user_id = ?
           OR EXISTS (
             SELECT 1
             FROM cuenta_equipos ce
             JOIN team_memberships tm ON tm.team_id = ce.team_id
             WHERE ce.cuenta_id = c.id AND tm.member_user_id = ?
           )
         )
       LIMIT 1`,
      [userId, gastoId, userId, userId, userId],
      (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      }
    );
  });
}

function getPresupuestoOwnedByUser(userId, presupuestoId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT pm.*
       FROM presupuestos_mensuales pm
       JOIN cuentas c ON c.id = pm.cuenta_id
       LEFT JOIN cuenta_usuarios cu ON c.id = cu.cuenta_id AND cu.user_id = ?
       WHERE pm.id = ?
         AND (
           c.user_id = ?
           OR cu.user_id = ?
           OR EXISTS (
             SELECT 1
             FROM cuenta_equipos ce
             JOIN team_memberships tm ON tm.team_id = ce.team_id
             WHERE ce.cuenta_id = c.id AND tm.member_user_id = ?
           )
         )
       LIMIT 1`,
      [userId, presupuestoId, userId, userId, userId],
      (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      }
    );
  });
}

// ---- CUENTAS ----

app.get('/api/presupuesto/cuentas', authenticate, (req, res) => {
  const sql = `
    SELECT DISTINCT c.* FROM cuentas c
    LEFT JOIN cuenta_usuarios cu ON c.id = cu.cuenta_id
    LEFT JOIN cuenta_equipos ce ON c.id = ce.cuenta_id
    LEFT JOIN team_memberships tm ON tm.team_id = ce.team_id
    WHERE c.user_id = ? OR cu.user_id = ? OR tm.member_user_id = ?
    ORDER BY nombre ASC`;
  db.all(sql, [req.userId, req.userId, req.userId], async (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    try {
      const enriched = await Promise.all((rows || []).map(async (row) => ({
        ...row,
        team_ids: await getCuentaTeamIds(row.id)
      })));
      res.json(enriched);
    } catch (metaErr) {
      res.status(500).json({ error: metaErr.message });
    }
  });
});

app.post('/api/presupuesto/cuentas', authenticate, async (req, res) => {
  const { nombre, presupuesto_mensual_base = 0, team_ids = [] } = req.body;
  const cleanNombre = sanitizeText(nombre, 100);
  if (!cleanNombre) return res.status(400).json({ error: 'nombre es requerido' });
  const montoBase = sanitizeNumber(presupuesto_mensual_base);
  if (montoBase === null) return res.status(400).json({ error: 'presupuesto_mensual_base invalido' });
  const normalizedTeamIds = [...new Set((Array.isArray(team_ids) ? team_ids : []).map((id) => toOptionalPositiveInt(id)).filter(Boolean))];
  for (const teamId of normalizedTeamIds) {
    const hasAccess = await userHasTeamAccess(req.userId, teamId);
    if (!hasAccess) return res.status(400).json({ error: 'Uno de los equipos seleccionados es invalido' });
  }
  const id = crypto.randomUUID();
  db.run(
    'INSERT INTO cuentas (id, user_id, nombre, presupuesto_mensual_base) VALUES (?, ?, ?, ?)',
    [id, req.userId, cleanNombre, montoBase],
    async function(err) {
      if (err) return res.status(500).json({ error: 'Internal server error' });
      try {
        await syncCuentaTeams(id, normalizedTeamIds);
        res.status(201).json({ id, user_id: req.userId, nombre: cleanNombre, presupuesto_mensual_base: montoBase, team_ids: normalizedTeamIds });
      } catch (syncErr) {
        res.status(500).json({ error: syncErr.message });
      }
    }
  );
});

app.patch('/api/presupuesto/cuentas/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { nombre, presupuesto_mensual_base, team_ids } = req.body;
  const hasAccess = await userHasCuentaAccess(req.userId, id);
  if (!hasAccess) return res.status(404).json({ error: 'Cuenta no encontrada o sin permiso' });
  const updates = [];
  const params = [];
  if (nombre !== undefined) {
    const cleanNombre = sanitizeText(nombre, 100);
    if (!cleanNombre) return res.status(400).json({ error: 'nombre invalido' });
    updates.push('nombre = ?');
    params.push(cleanNombre);
  }
  if (presupuesto_mensual_base !== undefined) {
    const montoBase = sanitizeNumber(presupuesto_mensual_base);
    if (montoBase === null) return res.status(400).json({ error: 'presupuesto_mensual_base invalido' });
    updates.push('presupuesto_mensual_base = ?');
    params.push(montoBase);
  }
  const normalizedTeamIds = team_ids === undefined
    ? null
    : [...new Set((Array.isArray(team_ids) ? team_ids : []).map((item) => toOptionalPositiveInt(item)).filter(Boolean))];
  if (normalizedTeamIds) {
    for (const teamId of normalizedTeamIds) {
      const teamAccess = await userHasTeamAccess(req.userId, teamId);
      if (!teamAccess) return res.status(400).json({ error: 'Uno de los equipos seleccionados es invalido' });
    }
  }
  const finish = async () => {
    try {
      if (normalizedTeamIds !== null) await syncCuentaTeams(id, normalizedTeamIds);
      res.json({ success: true, team_ids: normalizedTeamIds !== null ? normalizedTeamIds : await getCuentaTeamIds(id) });
    } catch (syncErr) {
      res.status(500).json({ error: syncErr.message });
    }
  };
  if (updates.length === 0) return finish();
  params.push(id);
  db.run(`UPDATE cuentas SET ${updates.join(', ')} WHERE id = ?`, params, function(err) {
    if (err) return res.status(500).json({ error: 'Internal server error' });
    if (this.changes === 0) return res.status(404).json({ error: 'Cuenta no encontrada o sin permiso' });
    finish();
  });
});

app.delete('/api/presupuesto/cuentas/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const hasAccess = await userHasCuentaAccess(req.userId, id);
  if (!hasAccess) return res.status(404).json({ error: 'Cuenta no encontrada o sin permiso' });
  // Guard: block deletion if there are future installments pending
  const today = new Date().toISOString().split('T')[0];
  db.get(
    `SELECT COUNT(*) as cnt FROM gastos WHERE cuenta_id = ? AND total_cuotas > 1 AND fecha > ?`,
    [id, today],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (row && row.cnt > 0) {
        return res.status(400).json({ error: `No se puede eliminar la cuenta: tiene ${row.cnt} cuota(s) pendiente(s) en meses futuros. Eliminá primero los gastos en cuotas proyectados.` });
      }
      db.run('DELETE FROM cuentas WHERE id = ?', [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Cuenta no encontrada o sin permiso' });
        res.json({ deleted: true });
      });
    }
  );
});
// ---- CATEGORIAS ----

app.get('/api/presupuesto/cuentas/:id/categorias', authenticate, async (req, res) => {
  const { id } = req.params;
  try {
    const hasAccess = await userHasCuentaAccess(req.userId, id);
    if (!hasAccess) return res.status(403).json({ error: 'Forbidden' });
    db.all('SELECT * FROM categorias WHERE cuenta_id = ? ORDER BY nombre ASC', [id], (err, rows) => {
      if (err) return res.status(500).json({ error: 'Internal server error' });
      res.json((rows || []).map((row) => ({ ...row, color_hex: closestAllowedColor(row.color_hex) })));
    });
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/presupuesto/cuentas/:cuentaId/categorias', authenticate, async (req, res) => {
  const { cuentaId } = req.params;
  const { nombre, color_hex = '#6C757D', porcentaje_asignacion = 0, tipo = 'EGRESO' } = req.body;
  const cleanNombre = sanitizeText(nombre, 100);
  if (!cleanNombre) return res.status(400).json({ error: 'nombre es requerido' });
  const tiposValidos = ['EGRESO', 'INGRESO', 'INVERSION', 'INVERSIÓN'];
  if (!tiposValidos.includes(tipo)) return res.status(400).json({ error: 'tipo debe ser EGRESO, INGRESO o INVERSION' });
  const normalizedTipo = (tipo === 'INVERSIÓN') ? 'INVERSION' : tipo;
  const normalizedColor = closestAllowedColor(color_hex);
  if (!ALLOWED_CATEGORY_COLORS.has(normalizedColor)) return res.status(400).json({ error: 'color_hex invalido' });
  const pct = sanitizeNumber(porcentaje_asignacion);
  if (pct === null || pct < 0 || pct > 100) return res.status(400).json({ error: 'porcentaje_asignacion invalido' });
  const id = crypto.randomUUID();
  try {
    const hasAccess = await userHasCuentaAccess(req.userId, cuentaId);
    if (!hasAccess) return res.status(403).json({ error: 'Forbidden' });
    db.run(
      'INSERT INTO categorias (id, cuenta_id, nombre, color_hex, porcentaje_asignacion, tipo) VALUES (?, ?, ?, ?, ?, ?)',
      [id, cuentaId, cleanNombre, normalizedColor, normalizedTipo === 'EGRESO' ? pct : 0, normalizedTipo],
      function(err) {
        if (err) return res.status(500).json({ error: 'Internal server error' });
        res.status(201).json({ id, cuenta_id: cuentaId, nombre: cleanNombre, color_hex: normalizedColor, porcentaje_asignacion: normalizedTipo === 'EGRESO' ? pct : 0, tipo: normalizedTipo });
      }
    );
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.patch('/api/presupuesto/categorias/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { nombre, color_hex, porcentaje_asignacion, tipo } = req.body;

  try {
    const existing = await getCategoriaOwnedByUser(req.userId, id);
    if (!existing) return res.status(404).json({ error: 'Categoria no encontrada' });

    const updates = [];
    const params = [];

    if (nombre !== undefined) {
      const clean = sanitizeText(nombre, 100);
      if (!clean) return res.status(400).json({ error: 'nombre invalido' });
      updates.push('nombre = ?');
      params.push(clean);
    }

    if (color_hex !== undefined) {
      const normalizedColor = closestAllowedColor(color_hex);
      if (!ALLOWED_CATEGORY_COLORS.has(normalizedColor)) return res.status(400).json({ error: 'color_hex invalido' });
      updates.push('color_hex = ?');
      params.push(normalizedColor);
    }

    if (porcentaje_asignacion !== undefined) {
      const pct = sanitizeNumber(porcentaje_asignacion);
      if (pct === null || pct < 0 || pct > 100) return res.status(400).json({ error: 'porcentaje_asignacion invalido' });
      updates.push('porcentaje_asignacion = ?');
      params.push(pct);
    }

    if (tipo !== undefined) {
      const tiposValidos = ['EGRESO', 'INGRESO', 'INVERSION', 'INVERSIÓN'];
      if (!tiposValidos.includes(tipo)) return res.status(400).json({ error: 'tipo invalido' });
      const normalizedTipo = (tipo === 'INVERSIÓN') ? 'INVERSION' : tipo;
      updates.push('tipo = ?');
      params.push(normalizedTipo);
      if (normalizedTipo !== 'EGRESO' && porcentaje_asignacion === undefined) {
        updates.push('porcentaje_asignacion = ?');
        params.push(0);
      }
    }

    if (updates.length === 0) return res.status(400).json({ error: 'Sin campos para actualizar' });

    params.push(id);
    db.run(`UPDATE categorias SET ${updates.join(', ')} WHERE id = ?`, params, function(err) {
      if (err) return res.status(500).json({ error: 'Internal server error' });
      if (this.changes === 0) return res.status(404).json({ error: 'Categoria no encontrada' });
      res.json({ success: true });
    });
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/presupuesto/categorias/:id', authenticate, async (req, res) => {
  try {
    const existing = await getCategoriaOwnedByUser(req.userId, req.params.id);
    if (!existing) return res.status(404).json({ error: 'Categoria no encontrada' });
    db.run('DELETE FROM categorias WHERE id = ?', [req.params.id], function(err) {
      if (err) return res.status(500).json({ error: 'Internal server error' });
      if (this.changes === 0) return res.status(404).json({ error: 'Categoria no encontrada' });
      res.json({ deleted: true });
    });
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---- GASTOS ----

app.get('/api/presupuesto/gastos', authenticate, (req, res) => {
  const { cuenta_id, mes, anio } = req.query;
  let sql = `
    SELECT g.*, cat.nombre as categoria_nombre, cat.color_hex
    FROM gastos g
    LEFT JOIN categorias cat ON g.categoria_id = cat.id
    LEFT JOIN cuentas c ON g.cuenta_id = c.id
    WHERE (
      c.user_id = ?
      OR g.cuenta_id IN (SELECT cuenta_id FROM cuenta_usuarios WHERE user_id = ?)
      OR EXISTS (
        SELECT 1
        FROM cuenta_equipos ce
        JOIN team_memberships tm ON tm.team_id = ce.team_id
        WHERE ce.cuenta_id = g.cuenta_id AND tm.member_user_id = ?
      )
    )`;
  const params = [req.userId, req.userId, req.userId];
  if (cuenta_id) { sql += ' AND g.cuenta_id = ?'; params.push(cuenta_id); }
  if (mes && anio) {
    const inicio = `${anio}-${String(mes).padStart(2,'0')}-01`;
    const fin = `${anio}-${String(mes).padStart(2,'0')}-31`;
    sql += ' AND g.fecha BETWEEN ? AND ?';
    params.push(inicio, fin);
  }
  sql += ' ORDER BY g.fecha DESC, g.created_at DESC';
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/presupuesto/gastos', authenticate, async (req, res) => {
  const {
    categoria_id, cuenta_id, descripcion = '',
    monto, fecha = new Date().toISOString().split('T')[0], metodo_pago = 'Efectivo',
    es_recurrente = false,
    total_cuotas = 1
  } = req.body;

  if (!categoria_id) return res.status(400).json({ error: 'categoria_id es requerido' });
  if (!cuenta_id || monto === undefined || !fecha) {
    return res.status(400).json({ error: 'cuenta_id, monto y fecha son requeridos' });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha))) {
    return res.status(400).json({ error: 'fecha invalida' });
  }

  const montoNum = sanitizeNumber(monto);
  if (montoNum === null) return res.status(400).json({ error: 'monto invalido' });

  const descripcionSafe = sanitizeText(descripcion, 240);
  const metodoSafe = normalizePaymentMethod(metodo_pago);

  try {
    const hasCuenta = await userHasCuentaAccess(req.userId, cuenta_id);
    if (!hasCuenta) return res.status(403).json({ error: 'Forbidden' });

    const cat = await getCategoriaOwnedByUser(req.userId, categoria_id);
    if (!cat) return res.status(400).json({ error: 'La categoria especificada no existe o no pertenece al usuario' });
    if (String(cat.cuenta_id) !== String(cuenta_id)) {
      return res.status(400).json({ error: 'La categoria no pertenece a la cuenta indicada' });
    }

    const isCreditCard = metodoSafe === 'Tarjeta credito';
    const totalCuotas = Math.max(1, Number(total_cuotas || 1));
    if (isCreditCard && cat.tipo !== 'EGRESO') {
      return res.status(400).json({ error: 'Tarjeta credito con cuotas solo aplica a categorias EGRESO' });
    }
    const esRec = isCreditCard ? 0 : (es_recurrente ? 1 : 0);
    const totalInstancias = isCreditCard
      ? totalCuotas
      : cat.tipo === 'EGRESO'
        ? (esRec ? 12 : totalCuotas)
        : cat.tipo === 'INGRESO'
          ? (esRec ? 12 : 1)
          : 1;
    const proyeccion_id = (esRec || totalInstancias > 1) ? crypto.randomUUID() : null;
    const montoPorInstancia = isCreditCard ? roundCurrency(montoNum / totalInstancias) : montoNum;

    const checkAndInsert = (warnFlag) => {
      const insertRow = (i, callback) => {
        const id = crypto.randomUUID();
        const fechaInstancia = addMonths(fecha, i);
        const cuotaNum = i + 1;
        db.run(
          'INSERT INTO gastos (id, categoria_id, cuenta_id, descripcion, monto, fecha, metodo_pago, es_recurrente, cuota_actual, total_cuotas, proyeccion_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [id, categoria_id, cuenta_id, descripcionSafe, montoPorInstancia, fechaInstancia, metodoSafe, esRec, cuotaNum, totalInstancias, proyeccion_id],
          callback
        );
      };

      let i = 0;
      const results = [];
      const insertNext = () => {
        if (i >= totalInstancias) {
          return res.status(201).json({ created: results.length, proyeccion_id, gastos: results, warning: warnFlag || null });
        }
        insertRow(i, function(err) {
          if (err) return res.status(500).json({ error: 'Internal server error' });
          results.push({ cuota: i + 1, fecha: addMonths(fecha, i) });
          i++;
          insertNext();
        });
      };
      insertNext();
    };

    if (cat.tipo === 'EGRESO' && cat.porcentaje_asignacion > 0) {
      const mesNum = Number(fecha.substring(5, 7));
      const anioNum = Number(fecha.substring(0, 4));
      db.get(
        'SELECT pm.monto_total FROM presupuestos_mensuales pm WHERE pm.cuenta_id = ? AND pm.mes = ? AND pm.anio = ?',
        [cuenta_id, mesNum, anioNum],
        (err2, pm) => {
          if (err2) return res.status(500).json({ error: 'Internal server error' });
          const montoBase = pm ? pm.monto_total : 0;
          const fInicio = `${fecha.substring(0,4)}-${String(mesNum).padStart(2,'0')}-01`;
          const fFin = `${fecha.substring(0,4)}-${String(mesNum).padStart(2,'0')}-31`;
          db.get(
            `SELECT COALESCE(SUM(g.monto),0) as total_ingresado FROM gastos g
             JOIN categorias c ON g.categoria_id = c.id
             WHERE g.cuenta_id = ? AND c.tipo = 'INGRESO' AND g.fecha BETWEEN ? AND ?`,
            [cuenta_id, fInicio, fFin],
            (err3, ingRow) => {
              if (err3) return res.status(500).json({ error: 'Internal server error' });
              const presupuestoDinamico = montoBase + (ingRow ? ingRow.total_ingresado : 0);
              const montoCat = (presupuestoDinamico * cat.porcentaje_asignacion) / 100;
              db.get(
                `SELECT COALESCE(SUM(g.monto),0) as gastado_cat FROM gastos g
                 WHERE g.categoria_id = ? AND g.fecha BETWEEN ? AND ?`,
                [categoria_id, fInicio, fFin],
                (err4, gRow) => {
                  if (err4) return res.status(500).json({ error: 'Internal server error' });
                  const gastadoCat = gRow ? gRow.gastado_cat : 0;
                  let warning = null;
                  if (montoCat > 0 && (gastadoCat + montoPorInstancia) > montoCat) {
                    warning = `Tope de categoria alcanzado: gastado ${(gastadoCat + montoPorInstancia).toLocaleString('es-AR')} de ${montoCat.toLocaleString('es-AR')} (${cat.porcentaje_asignacion}% asignado)`;
                  }
                  checkAndInsert(warning);
                }
              );
            }
          );
        }
      );
    } else {
      checkAndInsert(null);
    }
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Actualizar un gasto (y opcionalmente su proyección futura en cascada)
app.patch('/api/presupuesto/gastos/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { monto, descripcion, metodo_pago, fecha, categoria_id, cascade_future = false, total_cuotas } = req.body;

  try {
    const gasto = await getGastoOwnedByUser(req.userId, id);
    if (!gasto) return res.status(404).json({ error: 'Gasto no encontrado' });

    const nextCategoriaId = categoria_id !== undefined ? categoria_id : gasto.categoria_id;
    const cat = await getCategoriaOwnedByUser(req.userId, nextCategoriaId);
    if (!cat) return res.status(400).json({ error: 'categoria_id invalida' });
    if (String(cat.cuenta_id) !== String(gasto.cuenta_id)) {
      return res.status(400).json({ error: 'La categoria no pertenece a la cuenta del gasto' });
    }

    const nextMetodo = metodo_pago !== undefined ? normalizePaymentMethod(metodo_pago) : normalizePaymentMethod(gasto.metodo_pago);
    const isCreditCard = nextMetodo === 'Tarjeta credito';
    if (isCreditCard && cat.tipo !== 'EGRESO') {
      return res.status(400).json({ error: 'Tarjeta credito con cuotas solo aplica a categorias EGRESO' });
    }

    const nextFecha = fecha !== undefined ? String(fecha) : String(gasto.fecha);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextFecha)) return res.status(400).json({ error: 'fecha invalida' });
    const totalCuotas = total_cuotas !== undefined
      ? Math.max(1, Number(total_cuotas || 1))
      : Math.max(1, Number(gasto.total_cuotas || 1));
    const currentCuota = Math.max(1, Number(gasto.cuota_actual || 1));
    if (currentCuota > totalCuotas) {
      return res.status(400).json({ error: 'La cuota actual no puede ser mayor al total de cuotas' });
    }

    const sourceSeriesCount = Math.max(1, Number(gasto.total_cuotas || 1));
    const currentTotalAmount = gasto.proyeccion_id && sourceSeriesCount > 1
      ? Number(gasto.monto || 0) * sourceSeriesCount
      : Number(gasto.monto || 0);
    const nextTotalAmount = monto !== undefined ? Number(monto) : currentTotalAmount;
    if (!Number.isFinite(nextTotalAmount)) return res.status(400).json({ error: 'monto invalido' });

    const nextDescripcion = descripcion !== undefined ? sanitizeText(descripcion, 240) : sanitizeText(gasto.descripcion || '', 240);
    const nextProjectionNeeded = isCreditCard ? totalCuotas > 1 : Boolean(gasto.es_recurrente) || totalCuotas > 1;
    const nextProjectionId = nextProjectionNeeded ? (gasto.proyeccion_id || crypto.randomUUID()) : null;
    const perInstallmentAmount = isCreditCard ? roundCurrency(nextTotalAmount / totalCuotas) : roundCurrency(nextTotalAmount);

    const rebuildSeries = cascade_future || total_cuotas !== undefined || isCreditCard || Boolean(gasto.proyeccion_id);
    if (rebuildSeries && nextProjectionNeeded) {
      db.run(
        `UPDATE gastos
         SET categoria_id = ?, descripcion = ?, monto = ?, fecha = ?, metodo_pago = ?, cuota_actual = ?, total_cuotas = ?, proyeccion_id = ?, es_recurrente = 0
         WHERE id = ?`,
        [nextCategoriaId, nextDescripcion, perInstallmentAmount, nextFecha, nextMetodo, currentCuota, totalCuotas, nextProjectionId, id],
        (updateErr) => {
          if (updateErr) return res.status(500).json({ error: 'Internal server error' });
          db.run(
            'DELETE FROM gastos WHERE proyeccion_id = ? AND cuota_actual > ?',
            [nextProjectionId, currentCuota],
            (deleteErr) => {
              if (deleteErr) return res.status(500).json({ error: 'Internal server error' });
              let cuota = currentCuota + 1;
              const insertNext = () => {
                if (cuota > totalCuotas) return res.json({ success: true, cascaded: true, total_cuotas: totalCuotas });
                db.run(
                  'INSERT INTO gastos (id, categoria_id, cuenta_id, descripcion, monto, fecha, metodo_pago, es_recurrente, cuota_actual, total_cuotas, proyeccion_id) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)',
                  [
                    crypto.randomUUID(),
                    nextCategoriaId,
                    gasto.cuenta_id,
                    nextDescripcion,
                    perInstallmentAmount,
                    addMonths(nextFecha, cuota - currentCuota),
                    nextMetodo,
                    cuota,
                    totalCuotas,
                    nextProjectionId
                  ],
                  (insertErr) => {
                    if (insertErr) return res.status(500).json({ error: 'Internal server error' });
                    cuota += 1;
                    insertNext();
                  }
                );
              };
              insertNext();
            }
          );
        }
      );
      return;
    }

    const updates = [];
    const params = [];
    if (monto !== undefined) { updates.push('monto = ?'); params.push(roundCurrency(nextTotalAmount)); }
    if (descripcion !== undefined) { updates.push('descripcion = ?'); params.push(nextDescripcion); }
    if (metodo_pago !== undefined) { updates.push('metodo_pago = ?'); params.push(nextMetodo); }
    if (categoria_id !== undefined) { updates.push('categoria_id = ?'); params.push(nextCategoriaId); }
    if (fecha !== undefined) { updates.push('fecha = ?'); params.push(nextFecha); }
    if (total_cuotas !== undefined) { updates.push('total_cuotas = ?'); params.push(totalCuotas); }
    if (updates.length === 0) return res.status(400).json({ error: 'Sin campos para actualizar' });

    db.run(`UPDATE gastos SET ${updates.join(', ')} WHERE id = ?`, [...params, id], function(err) {
      if (err) return res.status(500).json({ error: 'Internal server error' });
      res.json({ success: true, cascaded: false });
    });
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/presupuesto/gastos/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { delete_future = false } = req.body;

  try {
    const gasto = await getGastoOwnedByUser(req.userId, id);
    if (!gasto) return res.status(404).json({ error: 'Gasto no encontrado' });

    if (delete_future && gasto.proyeccion_id) {
      db.run('DELETE FROM gastos WHERE proyeccion_id = ? AND fecha >= ?', [gasto.proyeccion_id, gasto.fecha], function(err) {
        if (err) return res.status(500).json({ error: 'Internal server error' });
        res.json({ deleted: this.changes, cascaded: true });
      });
    } else {
      db.run('DELETE FROM gastos WHERE id = ?', [id], function(err) {
        if (err) return res.status(500).json({ error: 'Internal server error' });
        res.json({ deleted: this.changes, cascaded: false });
      });
    }
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---- PRESUPUESTOS MENSUALES ----

app.get('/api/presupuesto/mensual/:cuentaId/:anio/:mes', authenticate, async (req, res) => {
  const { cuentaId, anio, mes } = req.params;
  try {
    const hasAccess = await userHasCuentaAccess(req.userId, cuentaId);
    if (!hasAccess) return res.status(403).json({ error: 'Forbidden' });
    db.get(
      'SELECT * FROM presupuestos_mensuales WHERE cuenta_id = ? AND anio = ? AND mes = ?',
      [cuentaId, Number(anio), Number(mes)],
      (err, row) => {
        if (err) return res.status(500).json({ error: 'Internal server error' });
        if (!row) return res.status(404).json({ existe: false, mensaje: `No hay presupuesto para el mes ${mes}/${anio}` });
        res.json({ existe: true, presupuesto: row });
      }
    );
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/presupuesto/mensual', authenticate, async (req, res) => {
  const { cuenta_id, mes, anio, monto_total, estado = 'manual', nota_origen } = req.body;
  if (!cuenta_id || !mes || !anio || monto_total === undefined) {
    return res.status(400).json({ error: 'cuenta_id, mes, anio y monto_total son requeridos' });
  }

  const monto = sanitizeNumber(monto_total);
  if (monto === null) return res.status(400).json({ error: 'monto_total invalido' });

  try {
    const hasAccess = await userHasCuentaAccess(req.userId, cuenta_id);
    if (!hasAccess) return res.status(403).json({ error: 'Forbidden' });

    const id = crypto.randomUUID();
    db.run(
      'INSERT INTO presupuestos_mensuales (id, cuenta_id, mes, anio, monto_total, estado, nota_origen) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, cuenta_id, Number(mes), Number(anio), monto, sanitizeText(estado, 20) || 'manual', sanitizeText(nota_origen, 160) || null],
      function(err) {
        if (err) {
          if (isUniqueViolation(err)) return res.status(409).json({ error: 'Ya existe presupuesto para ese mes/anio' });
          return res.status(500).json({ error: 'Internal server error' });
        }
        res.status(201).json({ id, cuenta_id, mes: Number(mes), anio: Number(anio), monto_total: monto, estado, nota_origen });
      }
    );
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Clonar presupuesto del mes anterior
app.post('/api/presupuesto/mensual/clonar', authenticate, async (req, res) => {
  const { cuenta_id, mes_destino, anio_destino } = req.body;
  if (!cuenta_id || !mes_destino || !anio_destino) {
    return res.status(400).json({ error: 'cuenta_id, mes_destino y anio_destino son requeridos' });
  }

  try {
    const hasAccess = await userHasCuentaAccess(req.userId, cuenta_id);
    if (!hasAccess) return res.status(403).json({ error: 'Forbidden' });

    let mesOrigen = Number(mes_destino) - 1;
    let anioOrigen = Number(anio_destino);
    if (mesOrigen < 1) { mesOrigen = 12; anioOrigen -= 1; }

    db.get(
      'SELECT * FROM presupuestos_mensuales WHERE cuenta_id = ? AND mes = ? AND anio = ?',
      [cuenta_id, mesOrigen, anioOrigen],
      (err, origen) => {
        if (err) return res.status(500).json({ error: 'Internal server error' });
        if (!origen) return res.status(404).json({ error: `No existe presupuesto para ${mesOrigen}/${anioOrigen}` });

        const nombresMes = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
        const nota = `Copia de ${nombresMes[mesOrigen - 1]} ${anioOrigen}`;
        const id = crypto.randomUUID();

        db.run(
          'INSERT INTO presupuestos_mensuales (id, cuenta_id, mes, anio, monto_total, estado, nota_origen) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [id, cuenta_id, Number(mes_destino), Number(anio_destino), origen.monto_total, 'clonado', nota],
          function(err2) {
            if (err2) {
              if (isUniqueViolation(err2)) return res.status(409).json({ error: 'Ya existe presupuesto para el mes destino' });
              return res.status(500).json({ error: 'Internal server error' });
            }
            res.status(201).json({
              id, cuenta_id,
              mes: Number(mes_destino), anio: Number(anio_destino),
              monto_total: origen.monto_total,
              estado: 'clonado', nota_origen: nota
            });
          }
        );
      }
    );
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Actualizar monto de presupuesto mensual existente
app.patch('/api/presupuesto/mensual', authenticate, async (req, res) => {
  const { id, monto_total, estado } = req.body;
  if (!id || monto_total === undefined) {
    return res.status(400).json({ error: 'id y monto_total son requeridos' });
  }

  const monto = sanitizeNumber(monto_total);
  if (monto === null) return res.status(400).json({ error: 'monto_total invalido' });

  try {
    const existing = await getPresupuestoOwnedByUser(req.userId, id);
    if (!existing) return res.status(404).json({ error: 'Presupuesto no encontrado' });

    const updates = ['monto_total = ?'];
    const params = [monto];
    if (estado) { updates.push('estado = ?'); params.push(sanitizeText(estado, 20)); }
    params.push(id);
    db.run(`UPDATE presupuestos_mensuales SET ${updates.join(', ')} WHERE id = ?`, params, function(err) {
      if (err) return res.status(500).json({ error: 'Internal server error' });
      if (this.changes === 0) return res.status(404).json({ error: 'Presupuesto no encontrado' });
      res.json({ success: true });
    });
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---- DASHBOARD ----

app.get('/api/presupuesto/dashboard', authenticate, (req, res) => {
  const { mes, anio } = req.query;
  if (!mes || !anio) return res.status(400).json({ error: 'mes y anio son requeridos' });

  const mesNum = Number(mes);
  const anioNum = Number(anio);
  const fechaInicio = `${anio}-${String(mesNum).padStart(2,'0')}-01`;
  const fechaFin = `${anio}-${String(mesNum).padStart(2,'0')}-31`;

  const cuentasSql = `
    SELECT DISTINCT c.* FROM cuentas c
    LEFT JOIN cuenta_usuarios cu ON c.id = cu.cuenta_id
    LEFT JOIN cuenta_equipos ce ON ce.cuenta_id = c.id
    LEFT JOIN team_memberships tm ON tm.team_id = ce.team_id
    WHERE c.user_id = ? OR cu.user_id = ? OR tm.member_user_id = ?`;

  db.all(cuentasSql, [req.userId, req.userId, req.userId], (err, cuentas) => {
    if (err) return res.status(500).json({ error: err.message });
    if (cuentas.length === 0) return res.json({ cuentas: [], total_global_disponible: 0, total_global_gastado: 0 });

    const cuentaIds = cuentas.map(c => c.id);
    const placeholders = cuentaIds.map(() => '?').join(',');

    db.all(
      `SELECT * FROM presupuestos_mensuales WHERE cuenta_id IN (${placeholders}) AND mes = ? AND anio = ?`,
      [...cuentaIds, mesNum, anioNum],
      (err, presupuestos) => {
        if (err) return res.status(500).json({ error: err.message });

        db.all(
          `SELECT g.*, cat.porcentaje_asignacion, cat.nombre as categoria_nombre, cat.color_hex,
                  COALESCE(cat.tipo, 'EGRESO') as tipo_categoria
           FROM gastos g
           LEFT JOIN categorias cat ON g.categoria_id = cat.id
           WHERE g.cuenta_id IN (${placeholders}) AND g.fecha BETWEEN ? AND ?`,
          [...cuentaIds, fechaInicio, fechaFin],
          (err, gastos) => {
            if (err) return res.status(500).json({ error: err.message });

            db.all(
              `SELECT * FROM categorias WHERE cuenta_id IN (${placeholders})`,
              [...cuentaIds],
              (err, categorias) => {
                if (err) return res.status(500).json({ error: err.message });

                const presupuestoMap = {};
                presupuestos.forEach(p => { presupuestoMap[p.cuenta_id] = p; });

                let totalGlobalDisponible = 0;
                let totalGlobalGastado = 0;

                const resultado = cuentas.map(cuenta => {
                  const presupuesto = presupuestoMap[cuenta.id];
                  const montoBase = presupuesto ? presupuesto.monto_total : cuenta.presupuesto_mensual_base;
                  const gastosDelMes = gastos.filter(g => String(g.cuenta_id) === String(cuenta.id));

                  // Separate by type
                  const gastosEgreso = gastosDelMes.filter(g => (g.tipo_categoria || 'EGRESO') === 'EGRESO');
                  const gastosIngreso = gastosDelMes.filter(g => g.tipo_categoria === 'INGRESO');
                  const gastosInversion = gastosDelMes.filter(g => ['INVERSION', 'INVERSIÓN'].includes(g.tipo_categoria));

                  const totalIngresado = gastosIngreso.reduce((s, g) => s + g.monto, 0);
                  const totalEgresado = gastosEgreso.reduce((s, g) => s + g.monto, 0);
                  const totalInvertido = gastosInversion.reduce((s, g) => s + g.monto, 0);

                  // Dynamic budget: base + income transactions
                  const presupuestoDinamico = montoBase + totalIngresado;
                  const disponibleOperativo = presupuestoDinamico - totalEgresado;
                  const porcentajeUsado = presupuestoDinamico > 0 ? (totalEgresado / presupuestoDinamico) * 100 : 0;

                  const categoriasDelMes = categorias.filter(c => String(c.cuenta_id) === String(cuenta.id)).map(cat => {
                    const tipo = cat.tipo || 'EGRESO';
                    let montoCategoria = 0;
                    if (tipo === 'EGRESO') montoCategoria = (presupuestoDinamico * cat.porcentaje_asignacion) / 100;
                    const gastadoCategoria = gastosDelMes
                      .filter(g => String(g.categoria_id) === String(cat.id))
                      .reduce((s, g) => s + g.monto, 0);
                    return {
                      ...cat,
                      tipo,
                      monto_estatico: montoCategoria,
                      gastado: gastadoCategoria,
                      disponible_categoria: montoCategoria - gastadoCategoria,
                      al_limite: tipo === 'EGRESO' && gastadoCategoria >= montoCategoria && montoCategoria > 0
                    };
                  });

                  totalGlobalDisponible += disponibleOperativo;
                  totalGlobalGastado += totalEgresado;

                  return {
                    cuenta,
                    presupuesto: presupuesto || null,
                    monto_total: montoBase,
                    presupuesto_dinamico: presupuestoDinamico,
                    total_ingresado: totalIngresado,
                    total_gastado: totalEgresado,
                    total_invertido: totalInvertido,
                    disponible: disponibleOperativo,
                    porcentaje_usado: porcentajeUsado,
                    presupuesto_comprometido: disponibleOperativo < 0,
                    categorias: categoriasDelMes,
                    gastos: gastosDelMes
                  };
                });

                res.json({
                  mes: mesNum, anio: anioNum,
                  total_global_disponible: totalGlobalDisponible,
                  total_global_gastado: totalGlobalGastado,
                  cuentas: resultado
                });
              }
            );
          }
        );
      }
    );
  });
});

// ---- RECURRENTES ANUALES ----

app.get('/api/presupuesto/recurrentes-anuales', authenticate, (req, res) => {
  const { anio, cuenta_id } = req.query;
  if (!anio) return res.status(400).json({ error: 'anio es requerido' });

  const anioNum = Number(anio);
  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  // Build where clause
  const cuentasSql = `
    SELECT DISTINCT c.id FROM cuentas c
    LEFT JOIN cuenta_usuarios cu ON c.id = cu.cuenta_id
    LEFT JOIN cuenta_equipos ce ON ce.cuenta_id = c.id
    LEFT JOIN team_memberships tm ON tm.team_id = ce.team_id
    WHERE c.user_id = ? OR cu.user_id = ? OR tm.member_user_id = ?`;

  db.all(cuentasSql, [req.userId, req.userId, req.userId], (err, cuentas) => {
    if (err) return res.status(500).json({ error: err.message });
    let cuentaIds = cuentas.map(c => c.id);
    if (cuenta_id) cuentaIds = cuentaIds.filter(id => String(id) === String(cuenta_id));
    if (cuentaIds.length === 0) return res.json({ anio: anioNum, meses: [] });

    const placeholders = cuentaIds.map(() => '?').join(',');
    const fechaInicio = `${anioNum}-01-01`;
    const fechaFin = `${anioNum}-12-31`;

    db.all(
      `SELECT g.*, cat.nombre as categoria_nombre, cat.color_hex, COALESCE(cat.tipo,'EGRESO') as tipo_categoria
       FROM gastos g
       LEFT JOIN categorias cat ON g.categoria_id = cat.id
       WHERE g.cuenta_id IN (${placeholders})
         AND g.es_recurrente = 1
         AND g.fecha BETWEEN ? AND ?
       ORDER BY g.fecha ASC`,
      [...cuentaIds, fechaInicio, fechaFin],
      (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

        // Group by month
        const meses = Array.from({ length: 12 }, (_, i) => {
          const mesNum = i + 1;
          const mesStr = String(mesNum).padStart(2, '0');
          const movs = rows.filter(r => r.fecha.startsWith(`${anioNum}-${mesStr}`));
          const totalRecurrente = movs.reduce((s, r) => s + r.monto, 0);
          return {
            mes: mesNum,
            nombre: MESES[i],
            total_recurrente: totalRecurrente,
            movimientos: movs.map(r => ({
              id: r.id,
              descripcion: r.descripcion,
              monto: r.monto,
              categoria_nombre: r.categoria_nombre,
              color_hex: r.color_hex,
              tipo_categoria: r.tipo_categoria,
              metodo_pago: r.metodo_pago,
              fecha: r.fecha
            }))
          };
        });

        res.json({ anio: anioNum, meses });
      }
    );
  });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (IS_ENTRYPOINT) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

module.exports = app;








