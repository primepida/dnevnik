const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const PORT = parseInt(process.env.PORT, 10) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const IS_PROD = process.env.NODE_ENV === 'production';

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, 'marathon.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    bio TEXT DEFAULT '',
    is_public INTEGER DEFAULT 1,
    failed_count INTEGER DEFAULT 0,
    locked_until INTEGER DEFAULT 0,
    last_failed INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS user_state (
    user_id INTEGER PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS mocks (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    subject TEXT NOT NULL,
    score INTEGER NOT NULL,
    max_score INTEGER NOT NULL,
    title TEXT DEFAULT '',
    weak_tasks TEXT DEFAULT '[]',
    notes TEXT DEFAULT '',
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_mocks_user ON mocks(user_id);
  CREATE INDEX IF NOT EXISTS idx_mocks_subject ON mocks(subject);
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS ip_attempts (
    ip TEXT PRIMARY KEY,
    count INTEGER DEFAULT 0,
    last_attempt INTEGER DEFAULT 0,
    blocked_until INTEGER DEFAULT 0
  );
`);

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
  const today = new Date();
  const ymd = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
  return {
    version: 2,
    meta: {
      startDate: ymd,
      examDates: { russian: '2026-06-04', math: '2026-06-08', informatics: '2026-06-18' }
    },
    events: [], tasks: {}, todos: [],
    problems: { russian: [], math: [], informatics: [] },
    goals: []
  };
}

function publicUser(u) {
  return { id: u.id, username: u.username, displayName: u.display_name, bio: u.bio || '', isPublic: !!u.is_public, createdAt: u.created_at };
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, Date.now() + 30 * 86400000);
  return token;
}

function userFromToken(token) {
  if (!token) return null;
  const s = db.prepare('SELECT user_id FROM sessions WHERE token = ? AND expires_at > ?').get(token, Date.now());
  if (!s) return null;
  return db.prepare('SELECT id, username, display_name, bio, is_public, created_at FROM users WHERE id = ?').get(s.user_id);
}

function requireAuth(req, res, next) {
  const u = userFromToken(req.cookies.token);
  if (!u) return res.status(401).json({ error: 'auth_required' });
  req.user = u;
  next();
}

function setCookie(res, token) {
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax', maxAge: 30 * 86400000, secure: IS_PROD, path: '/' });
}

function checkLogin(ip, username) {
  const now = Date.now();
  const ipRec = db.prepare('SELECT * FROM ip_attempts WHERE ip = ?').get(ip);
  if (ipRec && ipRec.blocked_until > now) {
    return { ok: false, status: 429, error: 'Слишком много попыток с этого адреса. Подожди ' + Math.ceil((ipRec.blocked_until - now) / 60000) + ' мин.' };
  }
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (user && user.locked_until > now) {
    return { ok: false, status: 429, error: 'Аккаунт заблокирован после неудачных попыток. Жди ' + Math.ceil((user.locked_until - now) / 3600000) + ' ч.' };
  }
  return { ok: true, user };
}

function recordFail(ip, username) {
  const now = Date.now();
  const ipRec = db.prepare('SELECT * FROM ip_attempts WHERE ip = ?').get(ip);
  if (ipRec) {
    const c = ipRec.last_attempt > now - 3600000 ? ipRec.count + 1 : 1;
    db.prepare('UPDATE ip_attempts SET count = ?, last_attempt = ?, blocked_until = ? WHERE ip = ?').run(c, now, c >= 20 ? now + 3600000 : 0, ip);
  } else {
    db.prepare('INSERT INTO ip_attempts (ip, count, last_attempt) VALUES (?, 1, ?)').run(ip, now);
  }
  const u = db.prepare('SELECT id, failed_count, last_failed FROM users WHERE username = ?').get(username);
  if (u) {
    const c = u.last_failed > now - 86400000 ? u.failed_count + 1 : 1;
    db.prepare('UPDATE users SET failed_count = ?, last_failed = ?, locked_until = ? WHERE id = ?').run(c, now, c >= 5 ? now + 86400000 : 0, u.id);
  }
}

function clearFails(id) {
  db.prepare('UPDATE users SET failed_count = 0, locked_until = 0 WHERE id = ?').run(id);
}

app.post('/api/register', (req, res) => {
  try {
    const { username, password, displayName } = req.body || {};
    if (!validUser(username)) return res.status(400).json({ error: 'Логин: 3–20 символов, латиница, цифры и _' });
    if (!validPass(password)) return res.status(400).json({ error: 'Пароль: от 6 до 100 символов' });
    if (!validName(displayName)) return res.status(400).json({ error: 'Имя: 1–40 символов' });
    const uname = username.toLowerCase();
    if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(uname)) return res.status(409).json({ error: 'Этот логин уже занят' });
    const now = Date.now();
    const info = db.prepare('INSERT INTO users (username, display_name, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(uname, displayName.trim(), bcrypt.hashSync(password, 10), now, now);
    db.prepare('INSERT INTO user_state (user_id, data, updated_at) VALUES (?, ?, ?)').run(info.lastInsertRowid, JSON.stringify(defaultState()), now);
    setCookie(res, createSession(info.lastInsertRowid));
    res.status(201).json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid)) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.post('/api/login', (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Введи логин и пароль' });
    const uname = String(username).toLowerCase();
    const ip = clientIp(req);
    const ck = checkLogin(ip, uname);
    if (!ck.ok) return res.status(ck.status).json({ error: ck.error });
    if (!ck.user || !bcrypt.compareSync(password, ck.user.password_hash)) {
      recordFail(ip, uname);
      const u = db.prepare('SELECT failed_count FROM users WHERE username = ?').get(uname);
      const left = u ? Math.max(0, 5 - u.failed_count) : null;
      return res.status(401).json({ error: 'Неверный логин или пароль' + (left !== null ? '. Осталось попыток: ' + left : '') });
    }
    clearFails(ck.user.id);
    setCookie(res, createSession(ck.user.id));
    res.json({ user: publicUser(ck.user) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.post('/api/logout', (req, res) => {
  if (req.cookies.token) db.prepare('DELETE FROM sessions WHERE token = ?').run(req.cookies.token);
  res.clearCookie('token', { path: '/' });
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  const s = db.prepare('SELECT data FROM user_state WHERE user_id = ?').get(req.user.id);
  let state; try { state = s ? JSON.parse(s.data) : defaultState(); } catch (e) { state = defaultState(); }
  const mocks = db.prepare('SELECT * FROM mocks WHERE user_id = ? ORDER BY date DESC, created_at DESC').all(req.user.id);
  res.json({
    user: publicUser(req.user),
    state,
    mocks: mocks.map(m => ({ id: m.id, date: m.date, subject: m.subject, score: m.score, maxScore: m.max_score, title: m.title, weakTasks: JSON.parse(m.weak_tasks || '[]'), notes: m.notes, createdAt: m.created_at }))
  });
});

app.put('/api/state', requireAuth, (req, res) => {
  const { data } = req.body || {};
  if (!data || typeof data !== 'object') return res.status(400).json({ error: 'invalid' });
  const json = JSON.stringify(data);
  if (json.length > 4 * 1024 * 1024) return res.status(413).json({ error: 'too_large' });
  const has = db.prepare('SELECT 1 FROM user_state WHERE user_id = ?').get(req.user.id);
  if (has) db.prepare('UPDATE user_state SET data = ?, updated_at = ? WHERE user_id = ?').run(json, Date.now(), req.user.id);
  else db.prepare('INSERT INTO user_state (user_id, data, updated_at) VALUES (?, ?, ?)').run(req.user.id, json, Date.now());
  res.json({ ok: true });
});

app.put('/api/profile', requireAuth, (req, res) => {
  const { displayName, bio, isPublic } = req.body || {};
  const u = [], p = [];
  if (displayName !== undefined) { if (!validName(displayName)) return res.status(400).json({ error: 'name' }); u.push('display_name = ?'); p.push(displayName.trim()); }
  if (bio !== undefined) { if (typeof bio !== 'string' || bio.length > 200) return res.status(400).json({ error: 'bio' }); u.push('bio = ?'); p.push(bio.trim()); }
  if (isPublic !== undefined) { u.push('is_public = ?'); p.push(isPublic ? 1 : 0); }
  if (!u.length) return res.json({ ok: true });
  u.push('updated_at = ?'); p.push(Date.now()); p.push(req.user.id);
  db.prepare('UPDATE users SET ' + u.join(', ') + ' WHERE id = ?').run(...p);
  res.json({ ok: true });
});

app.post('/api/password', requireAuth, (req, res) => {
  const { current, next } = req.body || {};
  if (!validPass(next)) return res.status(400).json({ error: 'Новый пароль: 6–100 символов' });
  const r = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!r || !bcrypt.compareSync(current || '', r.password_hash)) return res.status(401).json({ error: 'Текущий пароль неверный' });
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(bcrypt.hashSync(next, 10), Date.now(), req.user.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(req.user.id, req.cookies.token || '');
  res.json({ ok: true });
});

app.post('/api/mocks', requireAuth, (req, res) => {
  const { date, subject, score, maxScore, title, weakTasks, notes } = req.body || {};
  if (!['russian','math','informatics'].includes(subject)) return res.status(400).json({ error: 'subject' });
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'date' });
  const s = parseInt(score, 10), m = parseInt(maxScore, 10);
  if (!Number.isFinite(s) || s < 0 || s > 200) return res.status(400).json({ error: 'score' });
  if (!Number.isFinite(m) || m < 1 || m > 200) return res.status(400).json({ error: 'maxScore' });
  if (s > m) return res.status(400).json({ error: 'too_high' });
  const id = uid(), now = Date.now();
  const weak = Array.isArray(weakTasks) ? weakTasks.map(String).slice(0, 50) : [];
  db.prepare('INSERT INTO mocks (id, user_id, date, subject, score, max_score, title, weak_tasks, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, req.user.id, date, subject, s, m, (title || '').slice(0, 100), JSON.stringify(weak), (notes || '').slice(0, 1000), now);
  res.status(201).json({ id, date, subject, score: s, maxScore: m, title: title || '', weakTasks: weak, notes: notes || '', createdAt: now });
});

app.put('/api/mocks/:id', requireAuth, (req, res) => {
  const r = db.prepare('SELECT * FROM mocks WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!r) return res.status(404).json({ error: 'not_found' });
  const { date, subject, score, maxScore, title, weakTasks, notes } = req.body || {};
  const nd = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : r.date;
  const ns = ['russian','math','informatics'].includes(subject) ? subject : r.subject;
  const s = parseInt(score, 10), m = parseInt(maxScore, 10);
  const nsc = Number.isFinite(s) && s >= 0 ? s : r.score, nm = Number.isFinite(m) && m > 0 ? m : r.max_score;
  if (nsc > nm) return res.status(400).json({ error: 'too_high' });
  db.prepare('UPDATE mocks SET date=?, subject=?, score=?, max_score=?, title=?, weak_tasks=?, notes=? WHERE id=? AND user_id=?').run(nd, ns, nsc, nm, title !== undefined ? String(title).slice(0, 100) : r.title, Array.isArray(weakTasks) ? JSON.stringify(weakTasks.map(String).slice(0, 50)) : r.weak_tasks, notes !== undefined ? String(notes).slice(0, 1000) : r.notes, req.params.id, req.user.id);
  res.json({ ok: true });
});

app.delete('/api/mocks/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM mocks WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

app.get('/api/leaderboard', (req, res) => {
  const subject = req.query.subject || 'overall';
  if (!['russian','math','informatics','overall'].includes(subject)) return res.status(400).json({ error: 'subject' });
  const sql = `
    SELECT u.id, u.username, u.display_name, u.bio,
      AVG(CAST(m.score AS REAL) * 100.0 / m.max_score) AS avg_pct,
      MAX(CAST(m.score AS REAL) * 100.0 / m.max_score) AS best_pct,
      COUNT(m.id) AS cnt
    FROM users u JOIN mocks m ON m.user_id = u.id
    WHERE u.is_public = 1 ${subject !== 'overall' ? 'AND m.subject = ?' : ''}
    GROUP BY u.id ORDER BY best_pct DESC, avg_pct DESC, cnt DESC LIMIT 100`;
  const rows = subject === 'overall' ? db.prepare(sql).all() : db.prepare(sql).all(subject);
  res.json(rows.map(r => ({ id: r.id, username: r.username, displayName: r.display_name, bio: r.bio || '', avgPct: Math.round(r.avg_pct || 0), bestPct: Math.round(r.best_pct || 0), count: r.cnt })));
});

app.get('/api/users', (req, res) => {
  const q = (req.query.q || '').toString().trim().toLowerCase();
  const where = q ? "WHERE u.is_public = 1 AND (u.username LIKE ? OR LOWER(u.display_name) LIKE ?)" : "WHERE u.is_public = 1";
  const params = q ? ['%' + q + '%', '%' + q + '%'] : [];
  const rows = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.bio, u.created_at,
      (SELECT COUNT(*) FROM mocks WHERE user_id = u.id) AS mc,
      (SELECT AVG(CAST(score AS REAL) * 100.0 / max_score) FROM mocks WHERE user_id = u.id) AS ap
    FROM users u ${where} ORDER BY mc DESC, u.created_at DESC LIMIT 100`).all(...params);
  res.json(rows.map(r => ({ id: r.id, username: r.username, displayName: r.display_name, bio: r.bio || '', createdAt: r.created_at, mockCount: r.mc, avgPct: r.ap == null ? null : Math.round(r.ap) })));
});

app.get('/api/users/:username', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE username = ?').get(req.params.username.toLowerCase());
  if (!u) return res.status(404).json({ error: 'not_found' });
  if (!u.is_public) return res.status(403).json({ error: 'private' });
  const mocks = db.prepare('SELECT id, date, subject, score, max_score, title, weak_tasks, created_at FROM mocks WHERE user_id = ? ORDER BY date DESC, created_at DESC').all(u.id);
  const s = db.prepare('SELECT data FROM user_state WHERE user_id = ?').get(u.id);
  let state = defaultState(); try { if (s) state = JSON.parse(s.data); } catch (e) {}
  const taskProgress = {};
  for (const subj of ['russian','math','informatics']) {
    if (state.tasks && state.tasks[subj]) {
      const t = Object.values(state.tasks[subj]);
      taskProgress[subj] = { done: t.filter(x => x && x.status === 'done').length, wip: t.filter(x => x && x.status === 'wip').length, total: t.length };
    } else taskProgress[subj] = { done: 0, wip: 0, total: 0 };
  }
  res.json({
    user: publicUser(u),
    mocks: mocks.map(m => ({ id: m.id, date: m.date, subject: m.subject, score: m.score, maxScore: m.max_score, title: m.title || '', weakTasks: JSON.parse(m.weak_tasks || '[]'), createdAt: m.created_at })),
    taskProgress,
    examDates: state.meta && state.meta.examDates ? state.meta.examDates : null
  });
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

setInterval(() => { try { db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now()); } catch (e) {} }, 3600000);

app.listen(PORT, '0.0.0.0', () => console.log('Marathon ЕГЭ server on :' + PORT + ' · data in ' + DATA_DIR));
