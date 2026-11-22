/**
 * TARIX TEST — SERVER (Node.js, tashqi paketlarsiz)
 * Ishga tushirish: node server.js  (PORT, HOST, ADMIN_PASSWORD env orqali ixtiyoriy)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = path.join(__dirname, 'data');
const PUBLIC_DIR = path.resolve(__dirname, 'public');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(PUBLIC_DIR, { recursive: true });

const FILES = {
  users: path.join(DATA_DIR, 'users.json'),
  questions: path.join(DATA_DIR, 'questions.json'),
  sessions: path.join(DATA_DIR, 'sessions.json'),
  materials: path.join(DATA_DIR, 'materials.json'),
  submissions: path.join(DATA_DIR, 'submissions.json'),
  admin: path.join(DATA_DIR, 'admin.json'),
};

// ---------- Sozlamalar ----------
const LEVELS = {
  oson: { label: 'Oson', seconds: 30, xp: 10 },
  orta: { label: "O'rta", seconds: 20, xp: 20 },
  qiyin: { label: 'Qiyin', seconds: 10, xp: 30 },
};
const TEST_SIZE = { topic: 6, certificate: 10 };
const GRACE_MS = 3000;            // tarmoq kechikishi uchun qo'shimcha vaqt
const SESSION_TTL = 30 * 24 * 3600 * 1000;
const ADMIN_TTL = 8 * 3600 * 1000;
const MAX_BODY = 1024 * 1024;
const NAME_RE = /^[\p{L}\p{N}ʼ’' .-]{3,40}$/u;

// ---------- Fayl yordamchilari ----------
function load(file, fallback) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`O'qishda xatolik (${path.basename(file)}):`, e.message);
  }
  return structuredClone(fallback);
}
function save(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file); // atomik yozish
}

// Birinchi ishga tushirishda namunaviy savollar (faqat questions.json yo'q bo'lsa)
const SEED_QUESTIONS = [
  { id: 'uz_q1', type: 'topic', level: 'qiyin', category: 'Amir Temur Saltanati', question: "1402-yil 20-iyuldagi Anqara jangida Amir Temur qaysi Usmonli sultonini asirga olgan?", options: ['Sulton Murod I', 'Sulton Boyazid I Yildirim', 'Sulton Mehmed II Fotih', 'Sulton Sulaymon Qonuniy'], correct: 1, image: '', explanation: "Anqara jangida Boyazid Yildirim yengilgan va asirga olingan." },
  { id: 'uz_q2', type: 'topic', level: 'qiyin', category: "Qadimgi O'zbekiston", question: "Miloddan avvalgi 530-yilda massagetlar malikasi To'maris qaysi shohni mag'lub etgan?", options: ['Doro I', 'Kserks I', 'Kir II (Kavush)', 'Kambiz II'], correct: 2, image: '', explanation: "Kir II O'rta Osiyoga bosqini vaqtida massagetlar tomonidan o'ldirilgan." },
  { id: 'uz_q3', type: 'topic', level: 'orta', category: 'Temuriylar Ilm-fani', question: "Mirzo Ulug'bek Samarqandda tuzgan va 1018 ta yulduz koordinatasi kiritilgan asar nomi qanday?", options: ["Ziji Jadidi Ko'ragoniy", "Al-Qonun al-Mas'udiy", 'Tarixi Rashidiy', 'Boburnoma'], correct: 0, image: '', explanation: "Ziji Jadidi Ko'ragoniy astronomiya tarixidagi eng aniq jadvallardan biri." },
  { id: 'uz_q4', type: 'topic', level: 'qiyin', category: 'Xorazmshohlar Davlati', question: "1221-yilda Sind daryosi bo'yida Chingizxon qo'shiniga qarshi jang qilib, uning tan olgan o'zbek sarkardasi kim?", options: ['Temur Malik', 'Jaloliddin Manguberdi', 'Mahmud Torobiy', 'Najmiddin Kubro'], correct: 1, image: '', explanation: "Jaloliddin jasoratidan lol qolgan Chingizxon: 'Otaning shunday o'g'li bo'lishi kerak!' degan." },
  { id: 'uz_q5', type: 'topic', level: 'oson', category: 'Boburiylar Davri', question: "1526-yil Panipat jangida Bobur qaysi Dehli sultonini mag'lub etgan?", options: ["Ibrohim Lo'diy", "Bahlul Lo'diy", 'Alouddin Xilji', 'Qutbiddin Oybek'], correct: 0, image: '', explanation: "Bobur o'tsochar qurollar va to'lg'ama usulidan foydalanib Ibrohim Lo'diyni yengan." },
  { id: 'uz_q6', type: 'topic', level: 'orta', category: "Qadimgi O'zbekiston", question: "Surxondaryoda joylashgan, Kushon davriga oid budda ibodatxonasi topilgan yodgorlik qaysi?", options: ['Dalvarzintepa', 'Fayoztepa', 'Afrosiyob', "Tuproqqal'a"], correct: 1, image: '', explanation: "Fayoztepa Kushon davri buddaviylik markazlaridan biri." },
  { id: 'uz_q7', type: 'topic', level: 'qiyin', category: "Jadidchilik va Milliy Uyg'onish", question: "Turkistonda birinchi yangi usul maktabini ochgan va 'Padarkush' dramasini yozgan jadid kim?", options: ["Mahmudxo'ja Behbudiy", 'Munavvarqori Abdurashidxonov', 'Abdurauf Fitrat', 'Abdulla Avloniy'], correct: 0, image: '', explanation: "Mahmudxo'ja Behbudiy 1911-yilda 'Padarkush' dramasini yozgan." },
  { id: 'uz_q8', type: 'topic', level: 'oson', category: 'Mustaqillik Davri', question: "O'zbekiston mustaqilligi qachon rasman e'lon qilingan?", options: ["1991-yil 31-avgustda", "1991-yil 1-sentabrda", "1992-yil 8-dekabrda", "1990-yil 20-iyunda"], correct: 0, image: '', explanation: "1991-yil 31-avgustda Davlat Mustaqilligi e'lon qilingan." },
  { id: 'uz_cert1', type: 'certificate', level: 'qiyin', category: 'Milliy Sertifikat', question: "1917-yil 27-noyabrda Qo'qonda e'lon qilingan va Turkiston xalqlarining ilk demokratik davlatchiligi sanalgan tuzilma qaysi?", options: ['Turkiston Muxtoriyati', 'Buxoro Xalq Sovet Respublikasi', 'Xorazm Xalq Sovet Respublikasi', 'Turkiston ASSR'], correct: 0, image: '', explanation: "Turkiston Muxtoriyati 1917-yilda Qo'qonda e'lon qilingan." },
  { id: 'uz_cert2', type: 'certificate', level: 'orta', category: 'Milliy Sertifikat', question: "Xronologik ketma-ketlikni aniqlang: 1) Spitamen qo'zg'oloni; 2) Mahmud Torobiy qo'zg'oloni; 3) Muqanna qo'zg'oloni; 4) Dukchi Eshon qo'zg'oloni.", options: ['1, 3, 2, 4', '1, 2, 3, 4', '3, 1, 2, 4', '2, 1, 3, 4'], correct: 0, image: '', explanation: "Spitamen (m.avv. IV asr), Muqanna (VIII asr), Mahmud Torobiy (1238), Dukchi Eshon (1898)." },
  { id: 'uz_cert3', type: 'certificate', level: 'oson', category: 'Milliy Sertifikat', question: "Amir Temur qo'shinida 10 000 kishilik qism boshlig'i qanday unvon bilan atalgan?", options: ['Amirul-umaro (Amiri tuman)', 'Yuzboshi', 'Mingboshi', 'Tavochi'], correct: 0, image: '', explanation: "10 000 kishilik qism tuman deb atalgan va unga amir rahbarlik qilgan." },
];

// ---------- Xotira ----------
const db = {
  users: load(FILES.users, []),
  questions: fs.existsSync(FILES.questions) ? load(FILES.questions, []) : structuredClone(SEED_QUESTIONS),
  sessions: load(FILES.sessions, {}),
  materials: load(FILES.materials, { videos: [], books: [] }),
  submissions: load(FILES.submissions, []),
};
// Eski (seed / parolsiz) akkauntlarni olib tashlash
db.users = db.users.filter(u => u.salt && u.passHash && u.nameKey);
const liveUserIds = new Set(db.users.map(u => u.id));
db.submissions = db.submissions.filter(s => liveUserIds.has(s.userId));
db.questions = db.questions.map(q => ({
  ...q,
  type: q.type === 'certificate' ? 'certificate' : 'topic',
  level: LEVELS[q.level] ? q.level : 'orta',
  category: q.category || "O'zbekiston tarixi",
}));

const saveUsers = () => save(FILES.users, db.users);
const saveSessions = () => save(FILES.sessions, db.sessions);
const saveQuestions = () => save(FILES.questions, db.questions);
const saveMaterials = () => save(FILES.materials, db.materials);
const saveSubmissions = () => save(FILES.submissions, db.submissions);
if (!fs.existsSync(FILES.questions)) saveQuestions();

// Ustoz paroli (birinchi ishga tushirishda yaratiladi)
let adminCfg = load(FILES.admin, null);
if (!adminCfg) {
  const initial = process.env.ADMIN_PASSWORD || crypto.randomBytes(6).toString('base64url');
  adminCfg = hashPassword(initial);
  save(FILES.admin, adminCfg);
  console.log(`\n⚠️  Ustoz paroli yaratildi: ${initial}\n   Uni darhol admin paneldan o'zgartiring.\n`);
}

const tests = new Map();          // faol testlar (xotirada)
const adminTokens = new Map();    // token -> muddati
const attempts = new Map();       // rate limit

setInterval(() => {
  const cutoff = Date.now() - 3 * 3600e3;
  for (const [id, t] of tests) if (t.createdAt < cutoff) tests.delete(id);
  for (const [t, exp] of adminTokens) if (exp < Date.now()) adminTokens.delete(t);
}, 10 * 60e3).unref();

// ---------- Umumiy yordamchilar ----------
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const httpError = (status, message) => new HttpError(status, message);

const pad2 = n => String(n).padStart(2, '0');
const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const monthKey = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
function weekKey(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // dushanba
  return dayKey(x);
}

const cleanStr = (v, max) => String(v ?? '').trim().slice(0, max);
const isHttp = u => { try { const x = new URL(u); return x.protocol === 'http:' || x.protocol === 'https:'; } catch { return false; } };
const tokenHash = t => crypto.createHash('sha256').update(t).digest('hex');
const bearer = req => (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return { salt, hash: scryptHex(pw, salt) };
}
function scryptHex(pw, salt) {
  return crypto.scryptSync(String(pw), salt, 64).toString('hex');
}
function verifyPassword(pw, salt, hash) {
  const a = Buffer.from(scryptHex(pw, salt), 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function tempPassword(n = 8) {
  const cs = 'abcdefghjkmnpqrstuvwxyz23456789'; // chalkashtiradigan belgilarsiz
  let s = '';
  for (let i = 0; i < n; i++) s += cs[crypto.randomInt(cs.length)];
  return s;
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function rateLimit(key, max = 10, windowMs = 15 * 60e3) {
  const now = Date.now();
  const rec = attempts.get(key) || { n: 0, start: now };
  if (now - rec.start > windowMs) { rec.n = 0; rec.start = now; }
  rec.n++;
  attempts.set(key, rec);
  if (rec.n > max) throw httpError(429, "Juda ko'p urinish. Keyinroq urinib ko'ring.");
}

function sendJSON(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) { req.destroy(); reject(httpError(413, "So'rov juda katta")); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(httpError(400, "Noto'g'ri JSON")); }
    });
    req.on('error', reject);
  });
}

// ---------- Auth ----------
function currentUser(req) {
  const t = bearer(req);
  if (!t) return null;
  const h = tokenHash(t);
  const s = db.sessions[h];
  if (!s) return null;
  if (s.exp < Date.now()) { delete db.sessions[h]; saveSessions(); return null; }
  return db.users.find(u => u.id === s.userId) || null;
}
function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions[tokenHash(token)] = { userId, exp: Date.now() + SESSION_TTL };
  saveSessions();
  return token;
}
function isAdmin(req) {
  const t = req.headers['x-admin-token'];
  if (!t) return false;
  const exp = adminTokens.get(String(t));
  if (!exp) return false;
  if (exp < Date.now()) { adminTokens.delete(String(t)); return false; }
  return true;
}
function requireAdmin(req) {
  if (!isAdmin(req)) throw httpError(401, "Avval ustoz sifatida kiring");
}

// ---------- Foydalanuvchi va reyting ----------
function publicUser(u) {
  return {
    id: u.id, name: u.name, weeklyXp: u.weeklyXp, monthlyXp: u.monthlyXp,
    streak: u.streak, testsCount: u.testsCount,
    mustChangePassword: !!u.mustChangePassword, createdAt: u.createdAt,
  };
}
function rollPeriods(u) {
  const wk = weekKey(), mk = monthKey();
  if (u.weekKey !== wk) { u.weekKey = wk; u.weeklyXp = 0; }
  if (u.monthKey !== mk) { u.monthKey = mk; u.monthlyXp = 0; }
}
function updateStreak(u) {
  const today = dayKey();
  if (u.lastActive === today) return;
  const yesterday = dayKey(new Date(Date.now() - 864e5));
  u.streak = u.lastActive === yesterday ? (u.streak || 0) + 1 : 1;
  u.lastActive = today;
}

// ---------- Savollar va testlar ----------
function questionById(id) {
  return db.questions.find(q => q.id === id);
}
function publicQuestion(t) {
  const q = questionById(t.questionIds[t.idx]);
  if (!q) throw httpError(410, "Savol o'zgargan. Testni qaytadan boshlang.");
  return {
    index: t.idx, total: t.questionIds.length,
    id: q.id, category: q.category, question: q.question,
    options: q.options, image: q.image || '',
  };
}
function getOwnTest(id, u) {
  const t = tests.get(String(id || ''));
  if (!t || t.userId !== u.id) throw httpError(404, "Test topilmadi yoki muddati tugagan");
  if (t.finished) throw httpError(400, "Test allaqachon yakunlangan");
  return t;
}
function finalize(t, u, cheated) {
  t.finished = true;
  tests.delete(t.id);

  // Javobsiz qolgan savollar vaqt tugagan deb hisoblanadi
  const answered = new Set(t.answers.map(a => a.questionId));
  for (const qid of t.questionIds) {
    if (answered.has(qid)) continue;
    const q = questionById(qid);
    t.answers.push({ questionId: qid, selectedIndex: -1, correctIndex: q ? q.correct : -1, isCorrect: false, timedOut: true });
  }

  const total = t.questionIds.length;
  const correct = t.answers.filter(a => a.isCorrect).length;
  const percentage = Math.round((correct / total) * 100);
  const xp = cheated ? 0 : correct * LEVELS[t.level].xp;

  const details = t.answers.map(a => {
    const q = questionById(a.questionId);
    return {
      question: q ? q.question : "(o'chirilgan savol)",
      options: q ? q.options : [],
      selectedIndex: a.selectedIndex,
      correctIndex: a.correctIndex,
      isCorrect: a.isCorrect,
      timedOut: a.timedOut,
      explanation: q ? (q.explanation || '') : '',
    };
  });

  const sub = {
    id: 's_' + crypto.randomBytes(10).toString('hex'),
    userId: u.id, userName: u.name,
    testTitle: t.topic, type: t.type,
    level: t.level, levelLabel: LEVELS[t.level].label,
    totalQuestions: total, correctCount: correct, percentage, xp,
    cheated: Boolean(cheated), createdAt: new Date().toISOString(),
    details,
  };
  db.submissions.unshift(sub);
  saveSubmissions();

  rollPeriods(u);
  if (!cheated) { u.weeklyXp += xp; u.monthlyXp += xp; }
  u.testsCount += 1;
  updateStreak(u);
  saveUsers();
  return { sub, xp };
}

// ---------- Savol va material validatsiyasi ----------
function cleanQuestion(b, prev) {
  const get = (k, max, def = '') => cleanStr(b[k] ?? prev?.[k] ?? def, max);
  const type = (b.type ?? prev?.type) === 'certificate' ? 'certificate' : 'topic';
  const levelRaw = b.level ?? prev?.level;
  if (!LEVELS[levelRaw]) throw httpError(400, "Qiyinlik darajasini tanlang (oson, orta, qiyin)");
  const question = get('question', 600);
  const category = get('category', 80);
  const explanation = get('explanation', 500);
  const image = get('image', 300);
  if (question.length < 5) throw httpError(400, "Savol matni kamida 5 belgi bo'lsin");
  if (category.length < 2) throw httpError(400, "Mavzu nomini kiriting");
  if (image && !isHttp(image)) throw httpError(400, "Rasm havolasi http yoki https bilan boshlansin");

  const options = Array.isArray(b.options) ? b.options : prev?.options;
  if (!Array.isArray(options) || options.length !== 4) throw httpError(400, "4 ta javob varianti bo'lishi shart");
  const clean = options.map(o => cleanStr(o, 300));
  if (clean.some(o => !o)) throw httpError(400, "Barcha variantlar to'ldirilsin");

  const correct = Number(b.correct ?? prev?.correct);
  if (!Number.isInteger(correct) || correct < 0 || correct > 3) throw httpError(400, "To'g'ri javob indeksi 0 dan 3 gacha bo'lsin");

  return { type, level: levelRaw, category, question, options: clean, correct, explanation, image };
}

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
function youtubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1, 12);
    if (/(^|\.)youtube\.com$/.test(u.hostname)) return u.searchParams.get('v') || '';
  } catch { /* noto'g'ri URL */ }
  return '';
}
function cleanMaterial(kind, b, prev) {
  const get = (k, max, def = '') => cleanStr(b[k] ?? prev?.[k] ?? def, max);
  if (kind === 'video') {
    const title = get('title', 120);
    const topic = get('topic', 80) || "O'zbekiston tarixi";
    const duration = get('duration', 8) || '00:00';
    const desc = get('desc', 400);
    const url = get('url', 300);
    if (title.length < 3) throw httpError(400, "Video nomi kamida 3 belgi bo'lsin");
    const embedId = youtubeId(url);
    if (!YT_ID.test(embedId)) throw httpError(400, "Faqat to'g'ri YouTube havolasi qabul qilinadi");
    if (!/^\d{1,2}:\d{2}(:\d{2})?$/.test(duration)) throw httpError(400, "Davomiylik ko'rinishi 12:34 bo'lsin");
    return { title, topic, duration, url, embedId, desc };
  }
  const title = get('title', 140);
  const author = get('author', 100) || "Muallif ko'rsatilmagan";
  const grade = get('grade', 60) || "Qo'llanma";
  const desc = get('desc', 400);
  const fileUrl = get('fileUrl', 500);
  const pages = parseInt(b.pages ?? prev?.pages ?? 0, 10) || 0;
  if (title.length < 3) throw httpError(400, "Kitob nomi kamida 3 belgi bo'lsin");
  if (fileUrl && !isHttp(fileUrl)) throw httpError(400, "Fayl havolasi http yoki https bilan boshlansin");
  if (pages < 1 || pages > 5000) throw httpError(400, "Sahifalar soni 1 dan 5000 gacha bo'lsin");
  return { title, author, grade, desc, fileUrl, pages };
}

// ---------- API yo'nalishlari ----------
async function handleApi(req, res, url) {
  const p = url.pathname;
  const m = req.method;
  const ip = req.socket.remoteAddress || 'ip';
  const sp = url.searchParams;
  const send = (code, data) => sendJSON(res, code, data);

  // ===== 1. AUTH =====
  if (m === 'POST' && p === '/api/auth/register') {
    rateLimit(`reg:${ip}`, 10);
    const b = await readBody(req);
    const name = cleanStr(b.name, 40).replace(/\s+/g, ' ');
    const pw = String(b.password ?? '');
    if (!NAME_RE.test(name)) throw httpError(400, "Ism 3–40 belgi bo'lsin (harf, bo'sh joy yoki apostrof)");
    if (pw.length < 6 || pw.length > 128) throw httpError(400, "Parol 6–128 belgidan iborat bo'lsin");
    const key = name.toLowerCase();
    if (db.users.some(u => u.nameKey === key)) throw httpError(409, "Bu ism band. Boshqa ism tanlang.");
    const { salt, hash } = hashPassword(pw);
    const user = {
      id: 'u_' + crypto.randomBytes(8).toString('hex'),
      name, nameKey: key, salt, passHash: hash,
      weeklyXp: 0, monthlyXp: 0, streak: 0, testsCount: 0, lastActive: null,
      weekKey: weekKey(), monthKey: monthKey(),
      mustChangePassword: false, createdAt: new Date().toISOString(),
    };
    db.users.push(user);
    saveUsers();
    const token = createSession(user.id);
    return send(201, { success: true, token, user: publicUser(user) });
  }

  if (m === 'POST' && p === '/api/auth/login') {
    rateLimit(`login:${ip}`, 10);
    const b = await readBody(req);
    const key = cleanStr(b.name, 40).replace(/\s+/g, ' ').toLowerCase();
    const pw = String(b.password ?? '');
    const u = db.users.find(x => x.nameKey === key);
    if (!u) scryptHex(pw, '00000000000000000000000000000000'); // vaqt farqini yashirish
    if (!u || !verifyPassword(pw, u.salt, u.passHash)) throw httpError(401, "Ism yoki parol noto'g'ri");
    const token = createSession(u.id);
    return send(200, { success: true, token, user: publicUser(u) });
  }

  if (m === 'POST' && p === '/api/auth/logout') {
    const t = bearer(req);
    if (t) { delete db.sessions[tokenHash(t)]; saveSessions(); }
    return send(200, { success: true });
  }

  if (m === 'GET' && p === '/api/auth/me') {
    const u = currentUser(req);
    if (!u) throw httpError(401, 'Avtorizatsiya muddati tugagan');
    return send(200, { success: true, user: publicUser(u) });
  }

  if (m === 'POST' && p === '/api/auth/change-password') {
    const u = currentUser(req);
    if (!u) throw httpError(401, "Avval tizimga kiring");
    const b = await readBody(req);
    if (!verifyPassword(String(b.oldPassword ?? ''), u.salt, u.passHash)) throw httpError(400, "Eski parol noto'g'ri");
    const np = String(b.newPassword ?? '');
    if (np.length < 6 || np.length > 128) throw httpError(400, "Yangi parol 6–128 belgidan iborat bo'lsin");
    const { salt, hash } = hashPassword(np);
    u.salt = salt; u.passHash = hash; u.mustChangePassword = false;
    saveUsers();
    return send(200, { success: true });
  }

  // ===== 2. REYTING =====
  if (m === 'GET' && p === '/api/leaderboard') {
    const period = sp.get('period') === 'monthly' ? 'monthly' : 'weekly';
    const field = period === 'monthly' ? 'monthlyXp' : 'weeklyXp';
    db.users.forEach(rollPeriods);
    saveUsers();
    const list = db.users
      .slice()
      .sort((a, b) => b[field] - a[field] || a.name.localeCompare(b.name))
      .map(u => ({ id: u.id, name: u.name, xp: u[field], tests: u.testsCount, streak: u.streak }));
    return send(200, { success: true, period, leaderboard: list });
  }

  // ===== 3. TESTLAR =====
  if (m === 'GET' && p === '/api/tests/levels') {
    return send(200, { success: true, levels: LEVELS, testSize: TEST_SIZE });
  }

  if (m === 'POST' && p === '/api/tests/start') {
    const u = currentUser(req);
    if (!u) throw httpError(401, "Test yechish uchun tizimga kiring");
    const b = await readBody(req);
    const level = LEVELS[b.level] ? b.level : null;
    if (!level) throw httpError(400, "Qiyinlik darajasini tanlang");
    const type = b.type === 'certificate' ? 'certificate' : 'topic';
    const topic = cleanStr(b.topic, 80);

    let pool = db.questions.filter(q => q.type === type && q.level === level);
    if (topic && topic.toLowerCase() !== 'all') {
      pool = pool.filter(q => q.category.toLowerCase().includes(topic.toLowerCase()));
    }
    if (pool.length === 0) {
      throw httpError(400, "Bu sozlamalar bo'yicha savollar yo'q. Boshqa daraja yoki mavzuni tanlang.");
    }
    const need = Math.min(TEST_SIZE[type], pool.length);

    const t = {
      id: 't_' + crypto.randomBytes(12).toString('hex'),
      userId: u.id, type, level,
      topic: topic || 'Aralash',
      questionIds: shuffle(pool).slice(0, need).map(q => q.id),
      idx: 0, qStartedAt: Date.now(), answers: [],
      finished: false, createdAt: Date.now(),
    };
    tests.set(t.id, t);
    return send(201, {
      success: true, testId: t.id,
      level, levelLabel: LEVELS[level].label,
      seconds: LEVELS[level].seconds, xp: LEVELS[level].xp,
      total: need, question: publicQuestion(t),
    });
  }

  if (m === 'POST' && p === '/api/tests/answer') {
    const u = currentUser(req);
    if (!u) throw httpError(401, "Tizimga kiring");
    const b = await readBody(req);
    const t = getOwnTest(b.testId, u);
    const q = questionById(t.questionIds[t.idx]);
    if (!q) throw httpError(410, "Savol o'zgargan. Testni qaytadan boshlang.");

    const limitMs = LEVELS[t.level].seconds * 1000;
    const late = Date.now() - t.qStartedAt > limitMs + GRACE_MS;
    const sel = Number.isInteger(b.selectedIndex) && b.selectedIndex >= 0 && b.selectedIndex <= 3 ? b.selectedIndex : -1;
    const timedOut = late || sel === -1;
    const chosen = timedOut ? -1 : sel;
    const isCorrect = chosen === q.correct;

    t.answers.push({ questionId: q.id, selectedIndex: chosen, correctIndex: q.correct, isCorrect, timedOut });
    t.idx++;
    t.qStartedAt = Date.now();

    const done = t.idx >= t.questionIds.length;
    const resp = {
      success: true, isCorrect, timedOut,
      correctIndex: q.correct, explanation: q.explanation || '', done,
    };
    if (done) resp.submission = finalize(t, u, false).sub;
    else resp.next = publicQuestion(t);
    return send(200, resp);
  }

  if (m === 'POST' && p === '/api/tests/finish') {
    const u = currentUser(req);
    if (!u) throw httpError(401, "Tizimga kiring");
    const b = await readBody(req);
    const t = getOwnTest(b.testId, u);
    const { sub } = finalize(t, u, Boolean(b.cheated));
    return send(200, { success: true, submission: sub });
  }

  if (m === 'GET' && p === '/api/user/history') {
    const u = currentUser(req);
    if (!u) throw httpError(401, "Tizimga kiring");
    const list = db.submissions.filter(s => s.userId === u.id).slice(0, 300);
    return send(200, { success: true, history: list });
  }

  // ===== 4. RESURSLAR =====
  if (m === 'GET' && p === '/api/materials') {
    return send(200, { success: true, materials: db.materials });
  }

  // ===== 5. USTOZ =====
  if (p.startsWith('/api/admin/')) return handleAdmin(req, res, url);

  throw httpError(404, 'Topilmadi');
}

async function handleAdmin(req, res, url) {
  const p = url.pathname;
  const m = req.method;
  const send = (code, data) => sendJSON(res, code, data);
  const ip = req.socket.remoteAddress || 'ip';

  if (m === 'POST' && p === '/api/admin/login') {
    rateLimit(`admin:${ip}`, 8);
    const b = await readBody(req);
    if (!verifyPassword(String(b.password ?? ''), adminCfg.salt, adminCfg.hash)) {
      throw httpError(401, "Ustoz paroli noto'g'ri!");
    }
    const token = crypto.randomBytes(24).toString('hex');
    adminTokens.set(token, Date.now() + ADMIN_TTL);
    return send(200, { success: true, adminToken: token });
  }

  requireAdmin(req);

  if (m === 'POST' && p === '/api/admin/change-password') {
    const b = await readBody(req);
    const np = String(b.newPassword ?? '');
    if (np.length < 6 || np.length > 128) throw httpError(400, "Yangi parol 6–128 belgidan iborat bo'lsin");
    adminCfg = hashPassword(np);
    save(FILES.admin, adminCfg);
    adminTokens.clear();
    return send(200, { success: true, message: "Ustoz paroli yangilandi. Qayta kiring." });
  }

  if (m === 'GET' && p === '/api/admin/info') {
    const ip4 = getLocalIP();
    return send(200, { success: true, localIP: ip4, mobileUrl: `http://${ip4}:${PORT}` });
  }

  // O'quvchilar
  if (m === 'GET' && p === '/api/admin/users') {
    const list = db.users
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(u => ({ ...publicUser(u), tests: u.testsCount }));
    return send(200, { success: true, users: list });
  }

  const resetMatch = p.match(/^\/api\/admin\/users\/(u_[a-f0-9]+)\/reset-password$/);
  if (m === 'POST' && resetMatch) {
    const u = db.users.find(x => x.id === resetMatch[1]);
    if (!u) throw httpError(404, "O'quvchi topilmadi");
    const temp = tempPassword(8);
    const { salt, hash } = hashPassword(temp);
    u.salt = salt; u.passHash = hash; u.mustChangePassword = true;
    for (const k of Object.keys(db.sessions)) if (db.sessions[k].userId === u.id) delete db.sessions[k];
    saveUsers(); saveSessions();
    return send(200, { success: true, name: u.name, tempPassword: temp });
  }

  const userDelMatch = p.match(/^\/api\/admin\/users\/(u_[a-f0-9]+)$/);
  if (m === 'DELETE' && userDelMatch) {
    const id = userDelMatch[1];
    const before = db.users.length;
    db.users = db.users.filter(u => u.id !== id);
    if (db.users.length === before) throw httpError(404, "O'quvchi topilmadi");
    for (const k of Object.keys(db.sessions)) if (db.sessions[k].userId === id) delete db.sessions[k];
    db.submissions = db.submissions.filter(s => s.userId !== id);
    saveUsers(); saveSessions(); saveSubmissions();
    return send(200, { success: true });
  }

  // Natijalar (monitoring)
  if (m === 'GET' && p === '/api/admin/submissions') {
    const list = db.submissions.slice(0, 500).map(({ details, ...rest }) => rest);
    return send(200, { success: true, submissions: list });
  }

  // Savollar
  if (m === 'GET' && p === '/api/admin/questions') {
    return send(200, { success: true, questions: db.questions });
  }
  if (m === 'POST' && p === '/api/admin/questions') {
    const b = await readBody(req);
    const item = { id: 'q_' + crypto.randomBytes(8).toString('hex'), ...cleanQuestion(b, null) };
    db.questions.unshift(item);
    saveQuestions();
    return send(201, { success: true, question: item });
  }
  const qMatch = p.match(/^\/api\/admin\/questions\/(q_[a-f0-9]+|uz_[A-Za-z0-9_]+)$/);
  if (qMatch && (m === 'PUT' || m === 'DELETE')) {
    const idx = db.questions.findIndex(q => q.id === qMatch[1]);
    if (idx < 0) throw httpError(404, 'Savol topilmadi');
    if (m === 'DELETE') {
      db.questions.splice(idx, 1);
      saveQuestions();
      return send(200, { success: true });
    }
    const b = await readBody(req);
    db.questions[idx] = { ...db.questions[idx], ...cleanQuestion(b, db.questions[idx]) };
    saveQuestions();
    return send(200, { success: true, question: db.questions[idx] });
  }

  // Materiallar
  if (m === 'POST' && p === '/api/admin/materials') {
    const b = await readBody(req);
    const kind = b.kind === 'video' ? 'video' : b.kind === 'book' ? 'book' : null;
    if (!kind) throw httpError(400, "Tur: video yoki book bo'lishi kerak");
    const item = {
      id: (kind === 'video' ? 'v_' : 'b_') + crypto.randomBytes(6).toString('hex'),
      kind, ...cleanMaterial(kind, b, null),
    };
    (kind === 'video' ? db.materials.videos : db.materials.books).unshift(item);
    saveMaterials();
    return send(201, { success: true, item });
  }
  const matMatch = p.match(/^\/api\/admin\/materials\/([vb]_[a-f0-9]+)$/);
  if (matMatch && (m === 'PUT' || m === 'DELETE')) {
    const id = matMatch[1];
    const vi = db.materials.videos.findIndex(x => x.id === id);
    const bi = db.materials.books.findIndex(x => x.id === id);
    if (vi < 0 && bi < 0) throw httpError(404, 'Material topilmadi');
    const list = vi >= 0 ? db.materials.videos : db.materials.books;
    const idx = vi >= 0 ? vi : bi;
    if (m === 'DELETE') {
      list.splice(idx, 1);
      saveMaterials();
      return send(200, { success: true });
    }
    const b = await readBody(req);
    const kind = vi >= 0 ? 'video' : 'book';
    list[idx] = { ...list[idx], ...cleanMaterial(kind, b, list[idx]) };
    saveMaterials();
    return send(200, { success: true, item: list[idx] });
  }

  throw httpError(404, 'Topilmadi');
}

// ---------- Statik fayllar ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp',
  '.mp4': 'video/mp4', '.pdf': 'application/pdf',
};

function serveStatic(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); }
  catch { res.writeHead(400); return res.end("Noto'g'ri so'rov"); }
  if (rel === '/') rel = '/index.html';

  const target = path.resolve(PUBLIC_DIR, '.' + path.posix.normalize('/' + rel));
  if (target !== PUBLIC_DIR && !target.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403); return res.end('Taqiqlangan');
  }

  fs.stat(target, (err, st) => {
    const file = !err && st.isFile() ? target : path.join(PUBLIC_DIR, 'index.html');
    fs.stat(file, (e2, st2) => {
      if (e2 || !st2.isFile()) { res.writeHead(404); return res.end('Fayl topilmadi'); }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-cache',
      });
      fs.createReadStream(file).pipe(res);
    });
  });
}

// ---------- Server ----------
function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const i of nets[name]) {
      if (i.family === 'IPv4' && !i.internal) return i.address;
    }
  }
  return '127.0.0.1';
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendJSON(res, 405, { success: false, message: "Ruxsat yo'q" });
    return serveStatic(req, res, url.pathname);
  } catch (e) {
    if (e instanceof HttpError) return sendJSON(res, e.status, { success: false, message: e.message });
    console.error('Xatolik:', e);
    return sendJSON(res, 500, { success: false, message: 'Server xatoligi' });
  }
});

server.listen(PORT, HOST, () => {
  const ip = getLocalIP();
  console.log('\n=======================================================');
  console.log('   🏛️  TARIX TEST — SERVER ISHGA TUSHDI');
  console.log('=======================================================');
  console.log(`💻 Kompyuterda:  http://localhost:${PORT}`);
  console.log(`📱 Telefonda:    http://${ip}:${PORT}`);
  console.log('=======================================================\n');
});