const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const { Pool } = require('pg');

const PORT = parseInt(process.env.PORT, 10) || 3000;
const DATABASE_URL = process.env.DATABASE_URL;
const ADMIN_USERNAME = (process.env.ADMIN_USERNAME || '').toLowerCase();

if (!DATABASE_URL) {
  console.error('FATAL: DATABASE_URL не задан. Добавь Postgres-базу (рекомендую neon.tech — бесплатно), затем создай в Railway переменную DATABASE_URL с её connection string.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000
});

pool.on('error', (e) => console.error('PG pool error:', e.message));

async function initSchema() {
  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    bio TEXT DEFAULT '',
    is_public INTEGER DEFAULT 1,
    failed_count INTEGER DEFAULT 0,
    locked_until BIGINT DEFAULT 0,
    last_failed BIGINT DEFAULT 0,
    last_seen BIGINT DEFAULT 0,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS user_state (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data TEXT NOT NULL,
    updated_at BIGINT NOT NULL
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS mocks (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    subject TEXT NOT NULL,
    score INTEGER NOT NULL,
    max_score INTEGER NOT NULL,
    title TEXT DEFAULT '',
    weak_tasks TEXT DEFAULT '[]',
    notes TEXT DEFAULT '',
    created_at BIGINT NOT NULL
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_mocks_user ON mocks(user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_mocks_subject ON mocks(subject)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at BIGINT NOT NULL
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ip_attempts (
    ip TEXT PRIMARY KEY,
    count INTEGER DEFAULT 0,
    last_attempt BIGINT DEFAULT 0,
    blocked_until BIGINT DEFAULT 0
  )`);
  console.log('Schema OK');
}

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());

const uid = () => crypto.randomBytes(10).toString('hex');
const clientIp = (req) => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'unknown';
const validUser = (s) => typeof s === 'string' && /^[a-zA-Z0-9_]{3,20}$/.test(s);
const validPass = (s) => typeof s === 'string' && s.length >= 6 && s.length <= 100;
const validName = (s) => typeof s === 'string' && s.trim().length >= 1 && s.trim().length <= 40;

function defaultState() {
  const t = new Date();
  const ymd = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
  return {
    version: 2,
    meta: { startDate: ymd, examDates: { russian: '2026-06-04', math: '2026-06-08', informatics: '2026-06-18' } },
    events: [], tasks: {}, todos: [],
    problems: { russian: [], math: [], informatics: [] },
    goals: []
  };
}

function publicUser(u) {
  return {
    id: u.id, username: u.username, displayName: u.display_name, bio: u.bio || '',
    isPublic: !!u.is_public, lastSeen: Number(u.last_seen) || 0,
    createdAt: Number(u.created_at),
    isAdmin: !!(ADMIN_USERNAME && u.username === ADMIN_USERNAME)
  };
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await pool.query('INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)', [token, userId, Date.now() + 30 * 86400000]);
  return token;
}

async function userFromToken(token) {
  if (!token) return null;
  const r = await pool.query('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = $1 AND s.expires_at > $2', [token, Date.now()]);
  return r.rows[0] || null;
}

async function requireAuth(req, res, next) {
  try {
    const u = await userFromToken(req.cookies.token);
    if (!u) return res.status(401).json({ error: 'auth_required' });
    req.user = u;
    pool.query('UPDATE users SET last_seen = $1 WHERE id = $2', [Date.now(), u.id]).catch(() => {});
    next();
  } catch (e) {
    console.error('requireAuth:', e.message);
    res.status(500).json({ error: 'auth_error' });
  }
}

function setCookie(res, token) {
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax', maxAge: 30 * 86400000, path: '/' });
}

async function checkLogin(ip, username) {
  const now = Date.now();
  const ipR = await pool.query('SELECT * FROM ip_attempts WHERE ip = $1', [ip]);
  const ipRec = ipR.rows[0];
  if (ipRec && Number(ipRec.blocked_until) > now) {
    return { ok: false, status: 429, error: 'Слишком много попыток с этого адреса. Подожди ' + Math.ceil((Number(ipRec.blocked_until) - now) / 60000) + ' мин.' };
  }
  const uR = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
  const user = uR.rows[0];
  if (user && Number(user.locked_until) > now) {
    return { ok: false, status: 429, error: 'Аккаунт заблокирован после неудачных попыток. Жди ' + Math.ceil((Number(user.locked_until) - now) / 3600000) + ' ч.' };
  }
  return { ok: true, user };
}

async function recordFail(ip, username) {
  const now = Date.now();
  const ipR = await pool.query('SELECT * FROM ip_attempts WHERE ip = $1', [ip]);
  const ipRec = ipR.rows[0];
  if (ipRec) {
    const c = Number(ipRec.last_attempt) > now - 3600000 ? ipRec.count + 1 : 1;
    await pool.query('UPDATE ip_attempts SET count = $1, last_attempt = $2, blocked_until = $3 WHERE ip = $4', [c, now, c >= 20 ? now + 3600000 : 0, ip]);
  } else {
    await pool.query('INSERT INTO ip_attempts (ip, count, last_attempt) VALUES ($1, 1, $2)', [ip, now]);
  }
  const uR = await pool.query('SELECT id, failed_count, last_failed FROM users WHERE username = $1', [username]);
  const u = uR.rows[0];
  if (u) {
    const c = Number(u.last_failed) > now - 86400000 ? u.failed_count + 1 : 1;
    await pool.query('UPDATE users SET failed_count = $1, last_failed = $2, locked_until = $3 WHERE id = $4', [c, now, c >= 5 ? now + 86400000 : 0, u.id]);
  }
}

const clearFails = (id) => pool.query('UPDATE users SET failed_count = 0, locked_until = 0 WHERE id = $1', [id]);

app.get('/api/health', async (req, res) => {
  try {
    const r = await pool.query('SELECT 1 AS ok');
    const c = await pool.query('SELECT COUNT(*)::int AS n FROM users');
    res.json({ status: 'ok', db: r.rows[0].ok === 1, users: c.rows[0].n, admin: ADMIN_USERNAME || null });
  } catch (e) {
    res.status(500).json({ status: 'error', error: e.message });
  }
});

app.post('/api/register', async (req, res) => {
  try {
    const { username, password, displayName } = req.body || {};
    if (!validUser(username)) return res.status(400).json({ error: 'Логин: 3–20 символов, только латиница, цифры и _' });
    if (!validPass(password)) return res.status(400).json({ error: 'Пароль: от 6 до 100 символов' });
    const dn = (displayName && displayName.trim()) || username;
    if (!validName(dn)) return res.status(400).json({ error: 'Имя: 1–40 символов' });
    const uname = username.toLowerCase();
    const ex = await pool.query('SELECT 1 FROM users WHERE username = $1', [uname]);
    if (ex.rows[0]) return res.status(409).json({ error: 'Этот логин уже занят' });
    const now = Date.now();
    const hash = bcrypt.hashSync(password, 10);
    const r = await pool.query(
      'INSERT INTO users (username, display_name, password_hash, created_at, updated_at, last_seen) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [uname, dn.trim(), hash, now, now, now]
    );
    const user = r.rows[0];
    await pool.query('INSERT INTO user_state (user_id, data, updated_at) VALUES ($1, $2, $3)', [user.id, JSON.stringify(defaultState()), now]);
    const token = await createSession(user.id);
    setCookie(res, token);
    res.status(201).json({ user: publicUser(user) });
  } catch (e) {
    console.error('register:', e.message);
    res.status(500).json({ error: 'Ошибка сервера: ' + e.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Введи логин и пароль' });
    const uname = String(username).toLowerCase();
    const ip = clientIp(req);
    const ck = await checkLogin(ip, uname);
    if (!ck.ok) return res.status(ck.status).json({ error: ck.error });
    if (!ck.user || !bcrypt.compareSync(password, ck.user.password_hash)) {
      await recordFail(ip, uname);
      const r = await pool.query('SELECT failed_count FROM users WHERE username = $1', [uname]);
      const left = r.rows[0] ? Math.max(0, 5 - r.rows[0].failed_count) : null;
      return res.status(401).json({ error: 'Неверный логин или пароль' + (left !== null ? '. Осталось попыток: ' + left : '') });
    }
    await clearFails(ck.user.id);
    const token = await createSession(ck.user.id);
    setCookie(res, token);
    res.json({ user: publicUser(ck.user) });
  } catch (e) {
    console.error('login:', e.message);
    res.status(500).json({ error: 'Ошибка сервера: ' + e.message });
  }
});

app.post('/api/logout', async (req, res) => {
  if (req.cookies.token) await pool.query('DELETE FROM sessions WHERE token = $1', [req.cookies.token]).catch(() => {});
  res.clearCookie('token', { path: '/' });
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, async (req, res) => {
  try {
    const s = await pool.query('SELECT data FROM user_state WHERE user_id = $1', [req.user.id]);
    let state;
    try { state = s.rows[0] ? JSON.parse(s.rows[0].data) : defaultState(); } catch (e) { state = defaultState(); }
    const m = await pool.query('SELECT * FROM mocks WHERE user_id = $1 ORDER BY date DESC, created_at DESC', [req.user.id]);
    res.json({
      user: publicUser(req.user),
      state,
      mocks: m.rows.map(x => ({ id: x.id, date: x.date, subject: x.subject, score: x.score, maxScore: x.max_score, title: x.title || '', weakTasks: JSON.parse(x.weak_tasks || '[]'), notes: x.notes || '', createdAt: Number(x.created_at) }))
    });
  } catch (e) { console.error('me:', e.message); res.status(500).json({ error: e.message }); }
});

app.put('/api/state', requireAuth, async (req, res) => {
  try {
    const { data } = req.body || {};
    if (!data || typeof data !== 'object') return res.status(400).json({ error: 'invalid' });
    const json = JSON.stringify(data);
    if (json.length > 4 * 1024 * 1024) return res.status(413).json({ error: 'too_large' });
    await pool.query(`INSERT INTO user_state (user_id, data, updated_at) VALUES ($1, $2, $3)
      ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`, [req.user.id, json, Date.now()]);
    res.json({ ok: true });
  } catch (e) { console.error('state:', e.message); res.status(500).json({ error: e.message }); }
});

app.put('/api/profile', requireAuth, async (req, res) => {
  try {
    const { displayName, bio, isPublic } = req.body || {};
    const u = [], p = []; let i = 1;
    if (displayName !== undefined) { if (!validName(displayName)) return res.status(400).json({ error: 'name' }); u.push('display_name = $' + i++); p.push(displayName.trim()); }
    if (bio !== undefined) { if (typeof bio !== 'string' || bio.length > 200) return res.status(400).json({ error: 'bio' }); u.push('bio = $' + i++); p.push(bio.trim()); }
    if (isPublic !== undefined) { u.push('is_public = $' + i++); p.push(isPublic ? 1 : 0); }
    if (!u.length) return res.json({ ok: true });
    u.push('updated_at = $' + i++); p.push(Date.now());
    p.push(req.user.id);
    await pool.query('UPDATE users SET ' + u.join(', ') + ' WHERE id = $' + i, p);
    res.json({ ok: true });
  } catch (e) { console.error('profile:', e.message); res.status(500).json({ error: e.message }); }
});

app.post('/api/password', requireAuth, async (req, res) => {
  try {
    const { current, next: nw } = req.body || {};
    if (!validPass(nw)) return res.status(400).json({ error: 'Новый пароль: 6–100 символов' });
    const r = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!r.rows[0] || !bcrypt.compareSync(current || '', r.rows[0].password_hash)) return res.status(401).json({ error: 'Текущий пароль неверный' });
    await pool.query('UPDATE users SET password_hash = $1, updated_at = $2 WHERE id = $3', [bcrypt.hashSync(nw, 10), Date.now(), req.user.id]);
    await pool.query('DELETE FROM sessions WHERE user_id = $1 AND token <> $2', [req.user.id, req.cookies.token || '']);
    res.json({ ok: true });
  } catch (e) { console.error('password:', e.message); res.status(500).json({ error: e.message }); }
});

app.post('/api/mocks', requireAuth, async (req, res) => {
  try {
    const { date, subject, score, maxScore, title, weakTasks, notes } = req.body || {};
    if (!['russian','math','informatics'].includes(subject)) return res.status(400).json({ error: 'subject' });
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'date' });
    const s = parseInt(score, 10), m = parseInt(maxScore, 10);
    if (!Number.isFinite(s) || s < 0 || s > 200) return res.status(400).json({ error: 'score' });
    if (!Number.isFinite(m) || m < 1 || m > 200) return res.status(400).json({ error: 'maxScore' });
    if (s > m) return res.status(400).json({ error: 'too_high' });
    const id = uid(), now = Date.now();
    const weak = Array.isArray(weakTasks) ? weakTasks.map(String).slice(0, 50) : [];
    await pool.query('INSERT INTO mocks (id, user_id, date, subject, score, max_score, title, weak_tasks, notes, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
      [id, req.user.id, date, subject, s, m, (title || '').slice(0, 100), JSON.stringify(weak), (notes || '').slice(0, 1000), now]);
    res.status(201).json({ id, date, subject, score: s, maxScore: m, title: title || '', weakTasks: weak, notes: notes || '', createdAt: now });
  } catch (e) { console.error('mocks POST:', e.message); res.status(500).json({ error: e.message }); }
});

app.put('/api/mocks/:id', requireAuth, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM mocks WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    const cur = r.rows[0];
    if (!cur) return res.status(404).json({ error: 'not_found' });
    const { date, subject, score, maxScore, title, weakTasks, notes } = req.body || {};
    const nd = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : cur.date;
    const ns = ['russian','math','informatics'].includes(subject) ? subject : cur.subject;
    const s = parseInt(score, 10), m = parseInt(maxScore, 10);
    const nsc = Number.isFinite(s) && s >= 0 ? s : cur.score, nm = Number.isFinite(m) && m > 0 ? m : cur.max_score;
    if (nsc > nm) return res.status(400).json({ error: 'too_high' });
    await pool.query('UPDATE mocks SET date=$1, subject=$2, score=$3, max_score=$4, title=$5, weak_tasks=$6, notes=$7 WHERE id=$8 AND user_id=$9',
      [nd, ns, nsc, nm,
       title !== undefined ? String(title).slice(0, 100) : cur.title,
       Array.isArray(weakTasks) ? JSON.stringify(weakTasks.map(String).slice(0, 50)) : cur.weak_tasks,
       notes !== undefined ? String(notes).slice(0, 1000) : cur.notes,
       req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (e) { console.error('mocks PUT:', e.message); res.status(500).json({ error: e.message }); }
});

app.delete('/api/mocks/:id', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM mocks WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/leaderboard', async (req, res) => {
  try {
    const subject = req.query.subject || 'overall';
    const type = req.query.type || 'mocks';
    if (!['russian','math','informatics','overall'].includes(subject)) return res.status(400).json({ error: 'subject' });
    if (!['mocks','topics'].includes(type)) return res.status(400).json({ error: 'type' });
    if (type === 'mocks') {
      const where = subject === 'overall' ? '' : 'AND m.subject = $1';
      const params = subject === 'overall' ? [] : [subject];
      const sql = `SELECT u.id, u.username, u.display_name, u.bio, u.last_seen,
          AVG(m.score::float * 100.0 / m.max_score) AS avg_pct,
          MAX(m.score::float * 100.0 / m.max_score) AS best_pct,
          COUNT(m.id)::int AS cnt
        FROM users u JOIN mocks m ON m.user_id = u.id
        WHERE u.is_public = 1 ${where}
        GROUP BY u.id ORDER BY best_pct DESC, avg_pct DESC, cnt DESC LIMIT 100`;
      const r = await pool.query(sql, params);
      return res.json(r.rows.map(x => ({
        id: x.id, username: x.username, displayName: x.display_name, bio: x.bio || '',
        lastSeen: Number(x.last_seen) || 0,
        avgPct: Math.round(parseFloat(x.avg_pct) || 0),
        bestPct: Math.round(parseFloat(x.best_pct) || 0),
        count: x.cnt
      })));
    }
    const r = await pool.query(`SELECT u.id, u.username, u.display_name, u.bio, u.last_seen, us.data
      FROM users u LEFT JOIN user_state us ON us.user_id = u.id WHERE u.is_public = 1`);
    const out = [];
    for (const u of r.rows) {
      if (!u.data) continue;
      let st; try { st = JSON.parse(u.data); } catch (e) { continue; }
      if (!st.tasks) continue;
      let done = 0, total = 0;
      const subjs = subject === 'overall' ? ['russian','math','informatics'] : [subject];
      for (const s of subjs) {
        if (!st.tasks[s]) continue;
        const vals = Object.values(st.tasks[s]);
        done += vals.filter(x => x && x.status === 'done').length;
        total += vals.length;
      }
      if (total > 0) out.push({
        id: u.id, username: u.username, displayName: u.display_name, bio: u.bio || '',
        lastSeen: Number(u.last_seen) || 0,
        done, total, pct: Math.round(done * 100 / total)
      });
    }
    out.sort((a, b) => b.done - a.done || b.pct - a.pct);
    res.json(out.slice(0, 100));
  } catch (e) { console.error('leaderboard:', e.message); res.status(500).json({ error: e.message }); }
});

app.get('/api/users', async (req, res) => {
  try {
    const q = (req.query.q || '').toString().trim().toLowerCase();
    const where = q ? `WHERE u.is_public = 1 AND (u.username LIKE $1 OR LOWER(u.display_name) LIKE $1)` : `WHERE u.is_public = 1`;
    const params = q ? ['%' + q + '%'] : [];
    const r = await pool.query(`SELECT u.id, u.username, u.display_name, u.bio, u.created_at, u.last_seen,
        (SELECT COUNT(*) FROM mocks WHERE user_id = u.id)::int AS mc,
        (SELECT AVG(score::float * 100.0 / max_score) FROM mocks WHERE user_id = u.id) AS ap
      FROM users u ${where} ORDER BY u.last_seen DESC NULLS LAST, u.created_at DESC LIMIT 100`, params);
    res.json(r.rows.map(x => ({
      id: x.id, username: x.username, displayName: x.display_name, bio: x.bio || '',
      createdAt: Number(x.created_at), lastSeen: Number(x.last_seen) || 0,
      mockCount: x.mc,
      avgPct: x.ap == null ? null : Math.round(parseFloat(x.ap))
    })));
  } catch (e) { console.error('users:', e.message); res.status(500).json({ error: e.message }); }
});

app.get('/api/users/:username', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM users WHERE username = $1', [req.params.username.toLowerCase()]);
    const u = r.rows[0];
    if (!u) return res.status(404).json({ error: 'not_found' });
    if (!u.is_public) return res.status(403).json({ error: 'private' });
    const mR = await pool.query('SELECT id, date, subject, score, max_score, title, weak_tasks, created_at FROM mocks WHERE user_id = $1 ORDER BY date DESC, created_at DESC', [u.id]);
    const sR = await pool.query('SELECT data FROM user_state WHERE user_id = $1', [u.id]);
    let state = defaultState();
    try { if (sR.rows[0]) state = JSON.parse(sR.rows[0].data); } catch (e) {}
    const taskProgress = {};
    for (const subj of ['russian','math','informatics']) {
      if (state.tasks && state.tasks[subj]) {
        const ents = Object.entries(state.tasks[subj]);
        const done = ents.filter(([_, t]) => t && t.status === 'done').map(([n, t]) => ({ n: parseInt(n, 10), title: t.title }));
        const wip = ents.filter(([_, t]) => t && t.status === 'wip').map(([n, t]) => ({ n: parseInt(n, 10), title: t.title }));
        taskProgress[subj] = { done: done.length, wip: wip.length, total: ents.length, doneList: done, wipList: wip };
      } else taskProgress[subj] = { done: 0, wip: 0, total: 0, doneList: [], wipList: [] };
    }
    res.json({
      user: publicUser(u),
      mocks: mR.rows.map(m => ({ id: m.id, date: m.date, subject: m.subject, score: m.score, maxScore: m.max_score, title: m.title || '', weakTasks: JSON.parse(m.weak_tasks || '[]'), createdAt: Number(m.created_at) })),
      taskProgress,
      examDates: state.meta && state.meta.examDates ? state.meta.examDates : null
    });
  } catch (e) { console.error('user profile:', e.message); res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/users/:username', requireAuth, async (req, res) => {
  try {
    if (!ADMIN_USERNAME || req.user.username !== ADMIN_USERNAME) return res.status(403).json({ error: 'not_admin' });
    const target = req.params.username.toLowerCase();
    if (target === ADMIN_USERNAME) return res.status(400).json({ error: 'cant_delete_self' });
    const r = await pool.query('DELETE FROM users WHERE username = $1 RETURNING id', [target]);
    if (!r.rows[0]) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true });
  } catch (e) { console.error('admin delete:', e.message); res.status(500).json({ error: e.message }); }
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

setInterval(() => { pool.query('DELETE FROM sessions WHERE expires_at < $1', [Date.now()]).catch(() => {}); }, 3600000);

initSchema().then(() => {
  app.listen(PORT, '0.0.0.0', () => console.log('Marathon ЕГЭ server on :' + PORT + ' · ADMIN=' + (ADMIN_USERNAME || '(none)')));
}).catch(e => {
  console.error('Schema init failed:', e.message);
  process.exit(1);
});
