const http = require('http');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:3010';
const DB_PATH = path.join(__dirname, 'tareas.db');
const suffix = Date.now().toString();

function fail(message) {
  throw new Error(message);
}

function requestJson(method, route, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const url = new URL(route, BASE_URL);
    const req = http.request({
      hostname: url.hostname,
      port: Number(url.port || 80),
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    }, (res) => {
      let raw = '';
      res.on('data', (chunk) => {
        raw += chunk;
      });
      res.on('end', () => {
        let data = null;
        try {
          data = raw ? JSON.parse(raw) : null;
        } catch (e) {
          return reject(new Error(`Invalid JSON response from ${method} ${route}: ${raw}`));
        }
        resolve({ status: res.statusCode, data });
      });
    });

    req.on('error', (err) => reject(err));
    if (payload) req.write(payload);
    req.end();
  });
}

async function registerAndGetToken(username, password) {
  const res = await requestJson('POST', '/api/auth/register', { username, password });
  if (!((res.status === 200 || res.status === 201) && res.data && res.data.token && res.data.user_id)) {
    fail(`Failed to register ${username}: HTTP ${res.status} ${JSON.stringify(res.data)}`);
  }
  return { token: res.data.token, userId: Number(res.data.user_id) };
}

function insertLegacyTaskWithoutOwner(title) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, (openErr) => {
      if (openErr) return reject(openErr);

      db.run(
        'INSERT INTO tasks (title, description, quadrant, completed, user_id) VALUES (?, ?, ?, ?, NULL)',
        [title, 'legacy null-owner task', 'hacer', 0],
        function onInsert(err) {
          if (err) {
            db.close(() => reject(err));
            return;
          }
          const insertedId = this.lastID;
          db.close((closeErr) => {
            if (closeErr) return reject(closeErr);
            resolve(insertedId);
          });
        }
      );
    });
  });
}

(async () => {
  const userA = `tenant_a_${suffix}`;
  const userB = `tenant_b_${suffix}`;
  const password = 'P@ssword12345';

  const { token: tokenA, userId: userAId } = await registerAndGetToken(userA, password);
  const { token: tokenB, userId: userBId } = await registerAndGetToken(userB, password);

  const taskA = await requestJson('POST', '/api/tasks', {
    title: `Task A ${suffix}`,
    description: 'belongs to user A',
    quadrant: 'hacer',
    fecha: '2026-03-26'
  }, tokenA);
  if (taskA.status !== 201 || !taskA.data || Number(taskA.data.user_id) !== userAId) {
    fail(`Failed creating task for user A: HTTP ${taskA.status} ${JSON.stringify(taskA.data)}`);
  }

  const taskB = await requestJson('POST', '/api/tasks', {
    title: `Task B ${suffix}`,
    description: 'belongs to user B',
    quadrant: 'hacer',
    fecha: '2026-03-26'
  }, tokenB);
  if (taskB.status !== 201 || !taskB.data || Number(taskB.data.user_id) !== userBId) {
    fail(`Failed creating task for user B: HTTP ${taskB.status} ${JSON.stringify(taskB.data)}`);
  }

  const legacyTaskId = await insertLegacyTaskWithoutOwner(`Legacy ${suffix}`);

  const tasksForA = await requestJson('GET', '/api/tasks', null, tokenA);
  if (tasksForA.status !== 200 || !Array.isArray(tasksForA.data)) {
    fail(`Failed fetching tasks for user A: HTTP ${tasksForA.status} ${JSON.stringify(tasksForA.data)}`);
  }

  const userATasks = tasksForA.data;
  if (userATasks.some((t) => Number(t.user_id) !== userAId)) {
    fail(`Data leak detected for user A: found task not owned by user A`);
  }
  if (!userATasks.some((t) => Number(t.id) === Number(taskA.data.id))) {
    fail('User A cannot see their own task');
  }
  if (userATasks.some((t) => Number(t.id) === Number(taskB.data.id))) {
    fail('User A can see user B task');
  }
  if (userATasks.some((t) => Number(t.id) === Number(legacyTaskId))) {
    fail('User A can see legacy NULL-owner task');
  }

  const tasksForB = await requestJson('GET', '/api/tasks', null, tokenB);
  if (tasksForB.status !== 200 || !Array.isArray(tasksForB.data)) {
    fail(`Failed fetching tasks for user B: HTTP ${tasksForB.status} ${JSON.stringify(tasksForB.data)}`);
  }

  const userBTasks = tasksForB.data;
  if (userBTasks.some((t) => Number(t.user_id) !== userBId)) {
    fail('Data leak detected for user B: found task not owned by user B');
  }
  if (!userBTasks.some((t) => Number(t.id) === Number(taskB.data.id))) {
    fail('User B cannot see their own task');
  }
  if (userBTasks.some((t) => Number(t.id) === Number(taskA.data.id))) {
    fail('User B can see user A task');
  }
  if (userBTasks.some((t) => Number(t.id) === Number(legacyTaskId))) {
    fail('User B can see legacy NULL-owner task');
  }

  console.log('PASS: /api/tasks is tenant-isolated and excludes NULL-owner legacy tasks.');
})().catch((err) => {
  console.error('FAIL:', err.message);
  process.exitCode = 1;
});
