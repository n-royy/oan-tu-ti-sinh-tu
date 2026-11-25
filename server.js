// Oẳn Tù Tì Sinh Tử — game server
// 2 chế độ: Đấu Tay Đôi (nhánh loại trực tiếp, bán kết BO3, chung kết BO5) và Đại Chiến Boss
const path = require('path');
const os = require('os');
const http = require('http');
const express = require('express');
const QRCode = require('qrcode');
const { Server } = require('socket.io');
const CFG = require('./config');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingInterval: 20000,
  pingTimeout: 25000,
  maxHttpBufferSize: 1e4,
  perMessageDeflate: false,
});

// ---------- Địa chỉ vào game ----------
function lanIp() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) return i.address;
  }
  return 'localhost';
}
const JOIN_URL = (CFG.PUBLIC_URL || `http://${lanIp()}:${CFG.PORT}`).replace(/\/$/, '') + '/';

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
// Font đóng gói sẵn để chạy được cả khi mạng công ty chặn Google Fonts
app.use('/fonts/baloo', express.static(path.join(__dirname, 'node_modules/@fontsource/baloo-2'), { maxAge: '7d' }));
app.use('/fonts/bvp', express.static(path.join(__dirname, 'node_modules/@fontsource/be-vietnam-pro'), { maxAge: '7d' }));
app.get('/', (_, res) => res.sendFile(path.join(__dirname, 'public', 'play.html')));
app.get('/host', (_, res) => res.sendFile(path.join(__dirname, 'public', 'host.html')));
app.get('/slides', (_, res) => res.sendFile(path.join(__dirname, 'public', 'slides.html')));
app.get('/qr.svg', async (_, res) => {
  const svg = await QRCode.toString(JOIN_URL, { type: 'svg', margin: 1, color: { dark: '#14102a', light: '#ffffff' } });
  res.type('image/svg+xml').send(svg);
});
app.get('/config.json', (_, res) => res.json({
  departments: CFG.DEPARTMENTS,
  max: CFG.MAX_PLAYERS,
  bossTieSurvives: CFG.BOSS_TIE_SURVIVES,
  suspenseMs: CFG.SUSPENSE_MS,
}));

// ---------- Luật cơ bản ----------
const HANDS = ['rock', 'paper', 'scissors'];
const BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
const randHand = () => HANDS[(Math.random() * 3) | 0];
const duel = (a, b) => (a === b ? 0 : BEATS[a] === b ? 1 : -1); // 1 = a thắng
const shuffle = arr => { for (let i = arr.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
const TYPE_LABEL = { duel: 'Đấu Tay Đôi', boss: 'Đại Chiến Boss' };
const CHEERS = ['🔥', '👏', '😱', '⚡', '❤️'];
const TAUNTS = [
  'Ván này tôi ra Búa đó ✊',
  'Cẩn thận cái Bao của tôi ✋',
  'Kéo sắc lắm, dám không? ✌️',
  'Đọc vị xong hết rồi 😎',
  'Hòa nữa đi cho căng! ⚡',
  'Lần này chơi tâm lý nha 😏',
];
const BOSS_CHOOSE_QUIPS = [
  'Hệ thống đang nóng máy với BÚA ✊… hay là tôi đang lừa bạn?',
  'Cảm biến báo 60% hội trường sắp ra BAO ✋ đấy!',
  'Vòng này tôi nhắm mắt chọn đại, cẩn thận KÉO ✌️ nhé!',
  'Đừng nhìn người bên cạnh, họ cũng sắp bị loại thôi 😏',
  'Tôi đã phân tích dữ liệu vòng trước của các bạn rồi…',
  'Ai đang run tay nào? Còn vài giây cuối thôi đấy!',
];

// ---------- Trạng thái ----------
const players = new Map(); // pid -> player
let G;
function freshGame() {
  G = {
    phase: 'lobby',     // lobby | ready | choosing | suspense | reveal | roundEnd | champion
    type: null,         // 'duel' | 'boss'
    locked: false,
    cur: 0,             // vòng đang/sắp đấu (index)
    step: 0,
    stepStartAt: 0,
    deadline: 0, stepMs: 0,
    suspenseEnds: 0,
    participants: new Set(),
    rounds: [],         // nhánh đấu: rounds[r] = [match]
    reveal: null,
    bossHand: null,
    bossQuip: '',
    bossLog: [],        // [{round, hand, before, after, mercy}]
    lastSurvivors: null, // { round, list: [[id, name, avatar, dept]] }
    taunts: new Map(),      // pid -> { text, at }
    crowdVotes: new Map(),  // matchIdx -> Map<pid, 'a' | 'b'>
    auto: CFG.BOSS_NEXT_SECONDS > 0,
    nextAt: 0,
    championId: null,
    startCount: 0,
  };
}
freshGame();

let seq = 0;
const newId = () => (Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 6));
const clean = (s, n) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);

function resetPlayer(p) {
  Object.assign(p, {
    alive: true, fanOf: null, wins: 0, choice: null, choiceAt: 0, last: null, path: [], elimRound: null,
    manualHands: { rock: 0, paper: 0, scissors: 0 }, manualCount: 0,
    reactSum: 0, reactCnt: 0, tiesSurvived: 0, luckWins: 0, maxMatchGames: 0, cheersSent: 0,
  });
}
function makePlayer({ name, dept, avatar, bot }) {
  const p = { id: newId(), name, dept, avatar, bot: !!bot, socketId: null, connected: !!bot };
  resetPlayer(p);
  return p;
}
const alivePlayers = () => [...players.values()].filter(p => p.alive);

// Gốc chuỗi fan: thua ai thì thành fan người đó; người đó thua tiếp thì cả fan club chuyển theo
function fanRoots() {
  const root = new Map();
  const find = p => {
    if (root.has(p.id)) return root.get(p.id);
    let r;
    if (p.alive) r = p.id;
    else if (p.fanOf === 'BOSS') r = 'BOSS';
    else if (!p.fanOf || !players.has(p.fanOf)) r = null;
    else { root.set(p.id, null); r = find(players.get(p.fanOf)); }
    root.set(p.id, r);
    return r;
  };
  for (const p of players.values()) find(p);
  return root;
}

// ---------- Nhánh đấu ----------
function roundName(r) {
  const n = G.rounds[r] ? G.rounds[r].length : 0;
  if (n === 1) return 'Chung Kết';
  if (n === 2) return 'Bán Kết';
  if (n === 4) return 'Tứ Kết';
  if (n === 8) return 'Vòng 1/8';
  if (n === 16) return 'Vòng 1/16';
  return `Vòng ${r + 1}`;
}
function winsNeeded(r) {
  const n = G.rounds[r].length;
  if (n === 1) return CFG.FINAL_WINS;
  if (n === 2) return CFG.SEMI_WINS;
  return CFG.EARLY_WINS;
}
const boLabel = w => `BO${w * 2 - 1}`;

function buildBracket() {
  const ids = shuffle(alivePlayers().map(p => p.id));
  let size = 2; while (size < ids.length) size *= 2;
  const pairs = size / 2, byes = size - ids.length;
  const byeIdx = new Set(shuffle([...Array(pairs).keys()]).slice(0, byes));
  const mk = (r, i, a, b) => ({ r, i, a, b, wa: 0, wb: 0, ties: 0, done: false, winner: null, loser: null, bye: false, luck: false, hist: [] });
  G.rounds = [];
  let k = 0;
  const r0 = [];
  for (let i = 0; i < pairs; i++) {
    const a = ids[k++];
    const b = byeIdx.has(i) ? null : ids[k++];
    r0.push(mk(0, i, a, b));
  }
  G.rounds.push(r0);
  for (let cnt = pairs / 2, r = 1; cnt >= 1; cnt /= 2, r++) G.rounds.push(Array.from({ length: cnt }, (_, i) => mk(r, i, null, null)));
  for (const m of r0) {
    players.get(m.a).path[0] = m.i;
    if (m.b) players.get(m.b).path[0] = m.i;
    else { m.bye = true; m.done = true; m.winner = m.a; advance(m); }
  }
}

function advance(m) {
  const next = G.rounds[m.r + 1];
  if (!next) return;
  const nm = next[m.i >> 1];
  if (m.i % 2 === 0) nm.a = m.winner; else nm.b = m.winner;
  players.get(m.winner).path[m.r + 1] = nm.i;
}

// ---------- Vòng chơi ----------
let stepTimer = null, suspenseTimer = null, revealTimer = null, nextTimer = null;
const botTimers = [];
function clearTimers() {
  clearTimeout(stepTimer); clearTimeout(suspenseTimer); clearTimeout(revealTimer); clearTimeout(nextTimer);
  while (botTimers.length) clearTimeout(botTimers.pop());
}

function setup(type) {
  if (G.phase !== 'lobby' || !TYPE_LABEL[type] || players.size < 2) return;
  G.type = type;
  G.locked = true;
  G.startCount = players.size;
  G.taunts.clear();
  G.crowdVotes.clear();
  for (const p of players.values()) resetPlayer(p);
  if (type === 'duel') buildBracket();
  G.bossQuip = type === 'boss' ? 'Chào mừng tới đấu trường sinh tử! Ai đủ bản lĩnh sống sót qua tay ta?' : '';
  G.cur = 0;
  G.phase = 'ready';
  dirty();
}

function startRound() {
  if (G.phase !== 'ready' && G.phase !== 'roundEnd') return;
  clearTimers();
  G.step = 0;
  G.reveal = null;
  G.nextAt = 0;
  G.taunts.clear();
  for (const p of players.values()) { p.choice = null; p.last = null; }
  if (G.phase === 'roundEnd' && G.type === 'boss') G.cur += 1;
  beginStep();
}

function beginStep() {
  G.phase = 'choosing';
  G.bossHand = null;
  G.suspenseEnds = 0;
  G.taunts.clear();
  G.participants = new Set();
  if (G.type === 'duel') {
    for (const m of G.rounds[G.cur]) if (!m.done) { G.participants.add(m.a); G.participants.add(m.b); }
  } else {
    for (const p of alivePlayers()) G.participants.add(p.id);
    G.bossQuip = BOSS_CHOOSE_QUIPS[(G.cur + G.step + ((Math.random() * BOSS_CHOOSE_QUIPS.length) | 0)) % BOSS_CHOOSE_QUIPS.length];
  }
  for (const id of G.participants) { const p = players.get(id); p.choice = null; p.choiceAt = 0; }
  const secs = G.step === 0 ? CFG.CHOICE_SECONDS : CFG.NEXT_GAME_SECONDS;
  G.stepStartAt = Date.now();
  G.stepMs = secs * 1000;
  G.deadline = G.stepStartAt + G.stepMs;
  stepTimer = setTimeout(triggerReveal, G.stepMs + 400);
  for (const id of G.participants) {
    const p = players.get(id);
    if (!p.bot) continue;
    botTimers.push(setTimeout(() => {
      if (G.phase === 'choosing' && !p.choice) {
        const now = Date.now();
        p.choice = randHand();
        p.choiceAt = now;
        if (G.stepStartAt > 0) {
          p.reactSum += Math.max(50, Math.min(now - G.stepStartAt, G.stepMs || 15000));
          p.reactCnt += 1;
        }
        dirtyHost();
        maybeEarlyResolve();
      }
    }, 300 + Math.random() * secs * 800));
  }
  dirty();
}

function maybeEarlyResolve() {
  if (G.phase !== 'choosing') return;
  // Chỉ tự kết thúc sớm khi TẤT CẢ người tham gia (kể cả người tạm rớt mạng) đã ra tay
  for (const id of G.participants) {
    const p = players.get(id);
    if (!p.choice) return;
  }
  clearTimeout(stepTimer);
  stepTimer = setTimeout(triggerReveal, 500);
}

function triggerReveal() {
  if (G.phase !== 'choosing') return;
  clearTimers();
  if (CFG.SUSPENSE_MS > 0) {
    G.phase = 'suspense';
    G.suspenseEnds = Date.now() + CFG.SUSPENSE_MS;
    suspenseTimer = setTimeout(resolveStep, CFG.SUSPENSE_MS);
    dirty();
  } else {
    resolveStep();
  }
}

function eliminate(p, byId) { p.alive = false; p.fanOf = byId; p.elimRound = G.cur; }
const pick = p => (p.choice ? { hand: p.choice, auto: false } : { hand: randHand(), auto: true });

function resolveStep() {
  if (G.phase !== 'choosing' && G.phase !== 'suspense') return;
  clearTimers();
  G.suspenseEnds = 0;
  const dist = { rock: 0, paper: 0, scissors: 0 };
  const rev = { step: G.step, dist, eliminated: 0, ties: 0, highlights: [], bossHand: null, mercy: false, matchesDone: 0 };

  if (G.type === 'duel') {
    const need = winsNeeded(G.cur);
    const hl = [];
    for (const m of G.rounds[G.cur]) {
      if (m.done) continue;
      const A = players.get(m.a), B = players.get(m.b);
      const ca = pick(A), cb = pick(B);
      if (!ca.auto) { A.manualHands[ca.hand]++; A.manualCount++; }
      if (!cb.auto) { B.manualHands[cb.hand]++; B.manualCount++; }
      dist[ca.hand]++; dist[cb.hand]++;
      let r = duel(ca.hand, cb.hand), luck = false;
      if (r === 0) {
        m.ties += 1; rev.ties++;
        A.tiesSurvived++; B.tiesSurvived++;
        if (m.ties >= CFG.TIE_LIMIT) { r = Math.random() < 0.5 ? 1 : -1; luck = true; }
      }
      if (r !== 0) {
        m.ties = 0;
        if (r === 1) { m.wa++; if (luck) A.luckWins++; }
        else { m.wb++; if (luck) B.luckWins++; }
      }
      m.hist.push({ a: ca.hand, b: cb.hand, r, luck });
      if (m.wa >= need || m.wb >= need) {
        m.done = true; m.luck = luck;
        const W = m.wa >= need ? A : B, L = W === A ? B : A;
        m.winner = W.id; m.loser = L.id;
        W.wins++;
        if (m.hist.length > W.maxMatchGames) W.maxMatchGames = m.hist.length;
        eliminate(L, W.id); advance(m);
        rev.eliminated++; rev.matchesDone++;
        hl.push({ w: W.id, l: L.id, wh: W === A ? ca.hand : cb.hand, lh: W === A ? cb.hand : ca.hand, luck, sw: Math.max(m.wa, m.wb), sl: Math.min(m.wa, m.wb) });
      }
      const res = s => (r === 0 ? 'tie' : r === s ? 'win' : 'lose');
      const over = m.done;
      A.last = { my: ca.hand, opp: cb.hand, auto: ca.auto, oppAuto: cb.auto, outcome: res(1), luck, matchOver: over, matchWon: over && m.winner === A.id, me: m.wa, op: m.wb, need };
      B.last = { my: cb.hand, opp: ca.hand, auto: cb.auto, oppAuto: ca.auto, outcome: res(-1), luck, matchOver: over, matchWon: over && m.winner === B.id, me: m.wb, op: m.wa, need };
    }
    rev.highlights = shuffle(hl).slice(0, 8).map(h => ({ ...h, w: pubP(players.get(h.w)), l: pubP(players.get(h.l)) }));
  } else {
    const boss = randHand();
    G.bossHand = boss; rev.bossHand = boss;
    const before = G.participants.size;
    const res = [...G.participants].map(id => {
      const p = players.get(id);
      const c = pick(p);
      if (!c.auto) { p.manualHands[c.hand]++; p.manualCount++; }
      dist[c.hand]++;
      return { p, c, r: duel(c.hand, boss) };
    });
    const dies = x => x.r === -1 || (x.r === 0 && !CFG.BOSS_TIE_SURVIVES);
    if (res.every(dies)) rev.mercy = true; // ai cũng thua thì Boss tha, đấu lại
    for (const x of res) {
      const outcome = rev.mercy ? 'mercy' : x.r === 1 ? 'win' : dies(x) ? 'lose' : 'tie';
      x.p.last = { my: x.c.hand, opp: boss, auto: x.c.auto, outcome, boss: true };
      if (x.r === 1) x.p.wins++;
      if (outcome === 'tie') x.p.tiesSurvived++;
      if (outcome === 'lose') { eliminate(x.p, 'BOSS'); rev.eliminated++; }
    }
    const afterAlive = alivePlayers().length;
    if (rev.mercy) G.bossQuip = 'Quá phũ! Cả hội trường cùng sập bẫy — Boss tha cho đấu lại ngay!';
    else if (rev.eliminated === 0) G.bossQuip = 'Không loại được ai luôn?! Các bạn đọc bài tôi rồi à! 😤';
    else if (before > 0 && rev.eliminated / before >= 0.45) G.bossQuip = `Càn quét! ${rev.eliminated} chiến binh vừa lên bảng đếm số! 💥`;
    else if (afterAlive <= 3) G.bossQuip = `Chỉ còn ${afterAlive} người! Trận sinh tử thực sự bắt đầu! 🔥`;
    else G.bossQuip = `${rev.eliminated} người rời cuộc chơi. ${afterAlive} chiến binh còn lại khá lắm!`;
    G.bossLog.push({ round: G.cur + 1, hand: boss, before, after: afterAlive, mercy: rev.mercy });
  }

  G.reveal = rev;
  G.phase = 'reveal';
  G.step += 1;
  const more = (G.type === 'duel' && G.rounds[G.cur].some(m => !m.done)) || (G.type === 'boss' && rev.mercy);
  revealTimer = setTimeout(() => (more ? beginStep() : finishRound()), CFG.REVEAL_SECONDS * 1000);
  dirty();
}

function finishRound() {
  const alive = alivePlayers();
  if (alive.length === 1) {
    G.phase = 'champion';
    G.championId = alive[0].id;
    G.taunts.clear();
    dirty();
    return;
  }
  G.phase = 'roundEnd';
  G.taunts.clear();
  if (G.type === 'duel') {
    G.cur += 1;
    G.crowdVotes.clear();
  } else {
    // Lưu danh sách người còn lại để người F5 / kết nối lại vẫn nhận được
    G.lastSurvivors = { round: G.cur + 1, list: alive.map(p => [p.id, p.name, p.avatar, p.dept]) };
    io.emit('survivors', G.lastSurvivors);
    scheduleBossNext();
  }
  dirty();
}

function scheduleBossNext() {
  clearTimeout(nextTimer);
  G.nextAt = 0;
  if (G.type !== 'boss' || G.phase !== 'roundEnd' || !G.auto || CFG.BOSS_NEXT_SECONDS <= 0) return;
  G.nextAt = Date.now() + CFG.BOSS_NEXT_SECONDS * 1000;
  nextTimer = setTimeout(startRound, CFG.BOSS_NEXT_SECONDS * 1000);
}

// ---------- Dữ liệu gửi đi ----------
const pubP = p => p && ({ id: p.id, name: p.name, dept: p.dept, avatar: p.avatar });
const mini = (id, fc) => {
  const p = id && players.get(id);
  if (!p) return null;
  const o = { n: p.name, av: p.avatar, id: p.id, dp: p.dept };
  if (fc) { o.fans = fc.cnt.get(p.id) || 0; o.wins = p.wins; }
  return o;
};

function matchVotes(mi) {
  const vm = G.crowdVotes.get(mi);
  let a = 0, b = 0;
  if (vm) for (const s of vm.values()) { if (s === 'a') a++; else if (s === 'b') b++; }
  return { a, b };
}

function matchView(m, withHist = false, fc = null) {
  const live = !m.done && m.r === G.cur && (G.phase === 'choosing' || G.phase === 'suspense' || G.phase === 'reveal');
  const v = {
    i: m.i,
    a: mini(m.a, withHist ? fc : null),
    b: mini(m.b, withHist ? fc : null),
    wa: m.wa, wb: m.wb,
    w: m.winner ? (m.winner === m.a ? 'a' : 'b') : null,
    done: m.done, live, bye: m.bye,
  };
  if (G.phase === 'reveal' && m.r === G.cur && m.a && m.b) { v.ha = players.get(m.a).last?.my; v.hb = players.get(m.b).last?.my; }
  if (withHist) {
    v.hist = m.hist.slice(-12);
    v.votes = matchVotes(m.i);
    v.tauntA = m.a ? (G.taunts.get(m.a)?.text || null) : null;
    v.tauntB = m.b ? (G.taunts.get(m.b)?.text || null) : null;
  }
  return v;
}
function roundView(r, from, count, withHist = false, fc = null) {
  const list = G.rounds[r].slice(from, from + count);
  const need = winsNeeded(r);
  return { r, name: roundName(r), bo: boLabel(need), need, total: G.rounds[r].length, done: G.rounds[r].filter(m => m.done).length, from, matches: list.map(m => matchView(m, withHist, fc)) };
}

// Sơ đồ nhỏ quanh vị trí của người chơi (tối đa 3 vòng, 4 trận đầu)
// Sơ đồ nhánh cho điện thoại: tối đa 4 vòng, bắt đầu từ khối 8 trận chứa người chơi.
// Người đã bị loại sẽ theo dõi nhánh của thần tượng (người đang giữ fan club của họ).
function myBracket(p, roots) {
  if (G.type !== 'duel' || !G.rounds.length) return null;
  let t = p;
  if (!p.alive) { const r = roots.get(p.id); if (r && r !== 'BOSS' && players.has(r)) t = players.get(r); }
  if (!t.path.length) return null;
  const R = G.rounds.length;
  let s;
  if (G.phase === 'champion') s = Math.max(0, R - 3);
  else { const fr = t.path.length - 1; s = t.alive ? Math.min(fr, G.cur) : fr; }
  s = Math.max(0, Math.min(s, R - 3));
  const is = t.path[s] ?? 0;
  let cnt = Math.min(8, G.rounds[s].length);
  let start = Math.floor(is / cnt) * cnt;
  const cols = [];
  for (let r = s; r < R && cols.length < 4; r++) {
    cols.push(roundView(r, start, cnt));
    start >>= 1; cnt = Math.max(1, cnt >> 1);
  }
  const hasFinal = cols[cols.length - 1].r === R - 1;
  return { focus: t.id, following: t !== p ? pubP(t) : null, cols, hasFinal, champ: hasFinal && G.championId ? mini(G.championId) : null };
}

function tourPath() {
  return G.rounds.map((r, i) => ({ name: roundName(i), bo: boLabel(winsNeeded(i)), n: r.length, done: r.every(m => m.done), cur: i === G.cur && G.phase !== 'champion' }));
}

function deptStats() {
  const d = new Map();
  for (const p of players.values()) {
    const k = p.dept || 'Khác';
    if (!d.has(k)) d.set(k, { dept: k, total: 0, alive: 0, wins: 0, bestRound: -1 });
    const x = d.get(k);
    x.total++;
    if (p.alive) x.alive++;
    x.wins += p.wins;
    const reach = p.alive ? (G.type === 'duel' ? G.rounds.length : G.cur + 1) : (p.elimRound ?? 0);
    if (reach > x.bestRound) x.bestRound = reach;
  }
  return [...d.values()]
    .map(x => ({ ...x, rate: x.total ? Math.round((x.alive / x.total) * 100) : 0 }))
    .sort((a, b) => b.alive - a.alive || b.rate - a.rate || b.wins - a.wins || b.total - a.total);
}

function fanClubs(roots) {
  const cnt = new Map();
  for (const [id, r] of roots) if (r && r !== id) cnt.set(r, (cnt.get(r) || 0) + 1);
  return { cnt, top: [...cnt.entries()].filter(([id]) => id !== 'BOSS').sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, n]) => ({ who: pubP(players.get(id)), fans: n })) };
}

function buildFunAwards() {
  const all = [...players.values()];
  if (!all.length) return [];
  const awards = [];
  const handTitle = { rock: ['✊', 'Tín Đồ Búa', 'Búa'], paper: ['✋', 'Trùm Bao', 'Bao'], scissors: ['✌️', 'Sát Thủ Kéo', 'Kéo'] };

  // 1. Phản xạ tia chớp (ưu tiên người thật có bấm tay)
  const realFast = all.filter(p => !p.bot && p.reactCnt > 0);
  const fastPool = realFast.length ? realFast : all.filter(p => p.reactCnt > 0);
  if (fastPool.length) {
    fastPool.sort((a, b) => (a.reactSum / a.reactCnt) - (b.reactSum / b.reactCnt) || b.reactCnt - a.reactCnt);
    const p = fastPool[0];
    const avg = (p.reactSum / p.reactCnt / 1000).toFixed(2);
    awards.push({ icon: '⚡', title: 'Phản Xạ Tia Chớp', who: pubP(p), detail: `TB ${avg}s / lượt (${p.reactCnt} lượt)` });
  }

  // 2. Thánh Nhân Phẩm (đồng xu may mắn + lượt hòa thoát hiểm)
  const lucky = all.filter(p => p.luckWins > 0 || p.tiesSurvived > 0)
    .sort((a, b) => (b.luckWins * 3 + b.tiesSurvived) - (a.luckWins * 3 + a.tiesSurvived) || b.wins - a.wins);
  if (lucky.length) {
    const p = lucky[0];
    const parts = [];
    if (p.luckWins) parts.push(`${p.luckWins} đồng xu 🍀`);
    if (p.tiesSurvived) parts.push(`${p.tiesSurvived} lượt hòa`);
    awards.push({ icon: '🍀', title: 'Thánh Nhân Phẩm', who: pubP(p), detail: parts.join(' · ') });
  }

  // 3. Kẻ Kiên Định (trung thành với 1 chiêu nhất)
  const loyal = all.filter(p => p.manualCount >= 2).map(p => {
    let bestH = 'rock', bestC = 0;
    for (const h of HANDS) if (p.manualHands[h] > bestC) { bestC = p.manualHands[h]; bestH = h; }
    return { p, bestH, bestC, ratio: bestC / p.manualCount };
  }).sort((a, b) => b.ratio - a.ratio || b.bestC - a.bestC || b.p.wins - a.p.wins);
  if (loyal.length && loyal[0].bestC >= 2) {
    const x = loyal[0];
    const [ic, label, hName] = handTitle[x.bestH];
    awards.push({ icon: ic, title: label, who: pubP(x.p), detail: `${Math.round(x.ratio * 100)}% ra ${hName} (${x.bestC}/${x.p.manualCount} lượt)` });
  }

  // 4. Vua Cổ Vũ (nếu có người cổ vũ nhiệt tình) hoặc Chiến Thần Đấu Trí (trận dài hơi nhất)
  const cheerers = all.filter(p => p.cheersSent >= 2).sort((a, b) => b.cheersSent - a.cheersSent);
  if (cheerers.length) {
    const p = cheerers[0];
    awards.push({ icon: '📣', title: 'Vua Cổ Vũ', who: pubP(p), detail: `${p.cheersSent} lượt tiếp lửa sân khấu` });
  } else {
    const marathon = all.filter(p => p.maxMatchGames >= 3).sort((a, b) => b.maxMatchGames - a.maxMatchGames || b.wins - a.wins);
    if (marathon.length) {
      const p = marathon[0];
      awards.push({ icon: '🧠', title: 'Vua Đấu Trí', who: pubP(p), detail: `Thắng trận căng ${p.maxMatchGames} ván` });
    }
  }
  return awards.slice(0, 4);
}

function buildPodium(fc) {
  if (G.phase !== 'champion' || !G.championId) return null;
  const champ = players.get(G.championId);
  let runnerUp = null;
  let thirds = [];
  if (G.type === 'duel' && G.rounds.length) {
    const fin = G.rounds[G.rounds.length - 1][0];
    if (fin?.loser && players.has(fin.loser)) {
      const ru = players.get(fin.loser);
      runnerUp = { ...pubP(ru), wins: ru.wins };
    }
    if (G.rounds.length >= 2) {
      const semis = G.rounds[G.rounds.length - 2];
      thirds = semis
        .map(m => m.loser && players.get(m.loser))
        .filter(Boolean)
        .map(p => ({ ...pubP(p), wins: p.wins }));
    }
  } else if (G.type === 'boss') {
    const eliminated = [...players.values()]
      .filter(p => p.id !== G.championId)
      .sort((a, b) => (b.elimRound ?? -1) - (a.elimRound ?? -1) || b.wins - a.wins);
    if (eliminated.length) {
      const topR = eliminated[0].elimRound;
      const lastBatch = eliminated.filter(p => p.elimRound === topR);
      runnerUp = { ...pubP(lastBatch[0]), wins: lastBatch[0].wins, elimRound: (topR ?? 0) + 1, tiedCount: lastBatch.length };
      thirds = eliminated.slice(1, 3).map(p => ({ ...pubP(p), wins: p.wins, elimRound: (p.elimRound ?? 0) + 1 }));
    }
  }
  return {
    champion: { ...pubP(champ), wins: champ.wins, fans: fc.cnt.get(champ.id) || 0 },
    runnerUp,
    thirds,
    topDepts: deptStats().slice(0, 5),
    topFans: fc.top.slice(0, 3),
    awards: buildFunAwards(),
  };
}

function roundLabel() {
  if (!G.type) return null;
  if (G.type === 'boss') return `Vòng ${G.cur + 1}`;
  if (!G.rounds[G.cur]) return null;
  return roundName(G.cur);
}

function hostState(cached) {
  const all = [...players.values()];
  const roots = cached ? cached.roots : fanRoots();
  const fc = cached ? cached.fc : fanClubs(roots);
  const now = cached ? cached.now : Date.now();
  let chosen = 0;
  for (const id of G.participants) if (players.get(id)?.choice) chosen++;
  let bracket = null;
  if (G.type === 'duel' && G.rounds.length) {
    const ci = Math.min(G.cur, G.rounds.length - 1);
    const n = G.rounds[ci].length;
    let t0 = G.rounds.findIndex(r => r.length <= 8); if (t0 < 0) t0 = 0;
    bracket = {
      cur: roundView(ci, 0, n, n <= 2, fc),
      tree: G.rounds.slice(t0).map((r, k) => roundView(t0 + k, 0, r.length)),
      treeMode: n <= 8,
      path: cached ? cached.tpath : tourPath(),
      byes: G.rounds[0].filter(m => m.bye).length,
      champ: G.championId ? mini(G.championId) : null,
    };
  }
  let aliveList = null;
  if (G.type === 'boss' && G.phase !== 'lobby') aliveList = all.filter(p => p.alive).slice(0, 240).map(p => [p.name, p.avatar]);
  return {
    phase: G.phase, type: G.type, typeLabel: TYPE_LABEL[G.type] || null, locked: G.locked,
    roundNo: G.cur + 1, roundLabel: roundLabel(), bo: G.type === 'duel' && G.rounds[G.cur] ? boLabel(winsNeeded(G.cur)) : null,
    step: G.step, deadline: G.deadline, stepMs: G.stepMs, suspenseEnds: G.suspenseEnds, suspenseMs: CFG.SUSPENSE_MS, serverNow: now,
    total: all.length, alive: all.filter(p => p.alive).length, startCount: G.startCount,
    bots: all.filter(p => p.bot).length, max: CFG.MAX_PLAYERS, joinUrl: JOIN_URL,
    bossTieSurvives: CFG.BOSS_TIE_SURVIVES,
    bossQuip: G.bossQuip,
    chosen, participants: G.participants.size,
    recent: all.slice(-80).reverse().map(p => ({ id: p.id, name: p.name, avatar: p.avatar, dept: p.dept, bot: p.bot })),
    depts: deptStats().slice(0, 8),
    reveal: G.reveal,
    fanClubs: fc.top,
    bracket, aliveList, bossLog: G.bossLog.slice(-12),
    auto: G.auto, nextAt: G.nextAt, bossNext: CFG.BOSS_NEXT_SECONDS,
    champion: G.championId ? { ...pubP(players.get(G.championId)), wins: players.get(G.championId).wins, fans: fc.cnt.get(G.championId) || 0 } : null,
    podium: buildPodium(fc),
  };
}

function playerState(p, shared) {
  const { roots, fc, aliveCount, tpath, roundProgress, now } = shared;
  let role = 'idle', opponent = null, score = null;
  const inStep = G.participants.has(p.id);
  const isSpotlightRound = G.type === 'duel' && G.rounds[G.cur] && G.rounds[G.cur].length <= 2 && G.phase !== 'lobby' && G.phase !== 'champion';
  if (G.type === 'duel' && p.path.length) {
    const r = p.path.length - 1, m = G.rounds[r][p.path[r]];
    const isA = m.a === p.id;
    const oid = isA ? m.b : m.a;
    opponent = oid && players.has(oid) ? pubP(players.get(oid)) : null;
    const hist = m.hist.slice(-10).map(h => ({
      my: isA ? h.a : h.b,
      opp: isA ? h.b : h.a,
      outcome: h.r === 0 ? 'tie' : ((isA && h.r === 1) || (!isA && h.r === -1)) ? 'win' : 'lose',
      luck: h.luck,
    }));
    score = { me: isA ? m.wa : m.wb, opp: isA ? m.wb : m.wa, need: winsNeeded(r), bo: boLabel(winsNeeded(r)), round: roundName(r), bye: m.bye, done: m.done, hist };
  }
  if (!p.alive) role = 'out';
  else if (G.phase === 'choosing' || G.phase === 'suspense' || G.phase === 'reveal') {
    if (inStep) role = G.type === 'boss' ? 'boss' : 'duel';
    else role = 'waiting';
  }
  const root = roots.get(p.id);
  const idol = !p.alive && root && root !== 'BOSS' ? pubP(players.get(root)) : null;
  const killer = !p.alive && p.fanOf ? (p.fanOf === 'BOSS' ? { name: 'BOSS', avatar: '🤖' } : pubP(players.get(p.fanOf))) : null;
  const showLast = G.phase === 'reveal' || ((G.phase === 'choosing' || G.phase === 'suspense') && G.step > 0 && inStep);

  let spotlight = null;
  if (isSpotlightRound && !inStep) {
    spotlight = G.rounds[G.cur].filter(m => m.a && m.b).map(m => ({
      i: m.i,
      a: mini(m.a, fc),
      b: mini(m.b, fc),
      wa: m.wa, wb: m.wb, done: m.done, w: m.winner ? (m.winner === m.a ? 'a' : 'b') : null,
      votes: matchVotes(m.i),
      myVote: G.crowdVotes.get(m.i)?.get(p.id) || null,
      tauntA: G.taunts.get(m.a)?.text || null,
      tauntB: G.taunts.get(m.b)?.text || null,
    }));
  }
  const canTaunt = isSpotlightRound && inStep && G.phase === 'choosing';
  const myTaunt = G.taunts.get(p.id)?.text || null;
  const oppTaunt = opponent ? (G.taunts.get(opponent.id)?.text || null) : null;

  return {
    me: { id: p.id, name: p.name, dept: p.dept, avatar: p.avatar, alive: p.alive, wins: p.wins },
    phase: G.phase, type: G.type, locked: G.locked, roundLabel: roundLabel(), roundNo: G.cur + 1, step: G.step,
    deadline: G.deadline, stepMs: G.stepMs, suspenseEnds: G.suspenseEnds, suspenseMs: CFG.SUSPENSE_MS, serverNow: now, nextAt: G.nextAt,
    bossTieSurvives: CFG.BOSS_TIE_SURVIVES,
    bossQuip: G.type === 'boss' ? G.bossQuip : '',
    inStep, byeR1: G.type === 'duel' && p.path[0] !== undefined && G.rounds[0][p.path[0]].bye,
    role, canChoose: G.phase === 'choosing' && inStep && !p.choice, choice: inStep ? p.choice : null,
    opponent, score,
    canTaunt, taunts: canTaunt ? TAUNTS : null, myTaunt, oppTaunt,
    spotlight,
    canCheer: G.phase !== 'lobby' && (!inStep || G.phase === 'roundEnd' || G.phase === 'ready' || G.phase === 'champion'),
    last: showLast ? p.last : (G.phase === 'roundEnd' || G.phase === 'champion' ? p.last : null),
    bossHand: G.phase === 'reveal' ? G.bossHand : null,
    killer, idol, myFans: fc.cnt.get(p.id) || 0,
    aliveCount, total: players.size,
    bracket: myBracket(p, roots),
    tpath, reach: p.path.length - 1,
    roundProgress,
    nextRound: G.type === 'duel' && p.alive && G.rounds[p.path.length - 1] ? roundName(p.path.length - 1) : null,
    champion: G.championId ? pubP(players.get(G.championId)) : null,
    championIsIdol: !!G.championId && root === G.championId,
  };
}

// ---------- Phát trạng thái (tách luồng MC & người chơi để không nghẽn khi 500 người) ----------
let allDirty = false;
let hostDirty = false;
const dirtyPlayers = new Set();
const lastSent = new Map();

function dirty() { allDirty = true; hostDirty = true; }
function dirtyHost() { hostDirty = true; }
function dirtyOne(pid) { dirtyPlayers.add(pid); hostDirty = true; }

function buildShared() {
  const roots = fanRoots();
  const fc = fanClubs(roots);
  const aliveCount = alivePlayers().length;
  const tpath = G.type === 'duel' && G.rounds.length ? tourPath() : null;
  const roundProgress = G.type === 'duel' && G.rounds[G.cur]
    ? { done: G.rounds[G.cur].filter(m => m.done).length, total: G.rounds[G.cur].length }
    : null;
  return { roots, fc, aliveCount, tpath, roundProgress, now: Date.now() };
}

setInterval(() => {
  if (!allDirty && !hostDirty && dirtyPlayers.size === 0) return;
  const doAll = allDirty;
  const doHost = hostDirty;
  allDirty = false;
  hostDirty = false;

  const shared = buildShared();

  if (doAll) {
    dirtyPlayers.clear();
    for (const p of players.values()) {
      if (!p.socketId) continue;
      const s = playerState(p, shared);
      const key = JSON.stringify({ ...s, serverNow: 0 });
      if (lastSent.get(p.id) === key) continue;
      lastSent.set(p.id, key);
      io.to(p.socketId).emit('state', s);
    }
  } else if (dirtyPlayers.size > 0) {
    for (const id of dirtyPlayers) {
      const p = players.get(id);
      if (!p || !p.socketId) continue;
      const s = playerState(p, shared);
      const key = JSON.stringify({ ...s, serverNow: 0 });
      if (lastSent.get(p.id) === key) continue;
      lastSent.set(p.id, key);
      io.to(p.socketId).emit('state', s);
    }
    dirtyPlayers.clear();
  }

  if (doHost) {
    io.to('hosts').emit('host', hostState(shared));
  }
}, 150);

// Gom cổ vũ từ tối đa 500 người chơi, phát theo nhịp 200ms để màn hình LED không giật
let cheerQueue = [];
setInterval(() => {
  if (!cheerQueue.length) return;
  const batch = cheerQueue.slice(0, 28);
  cheerQueue = [];
  io.to('hosts').emit('cheers', batch);
}, 200);

// ---------- Socket ----------
const AVATARS = ['🦊', '🐼', '🐯', '🐸', '🐵', '🦁', '🐨', '🐷', '🐙', '🦄', '🐝', '🐲', '🦖', '🐧', '🦉', '🐳'];
const BOT_NAMES = ['Tí', 'Tèo', 'Bé Na', 'Su', 'Bin', 'Mít', 'Bơ', 'Cốm', 'Na', 'Xoài', 'Đậu', 'Bông', 'Sóc', 'Bắp', 'Kem', 'Mochi'];

io.on('connection', socket => {
  let pid = null;
  let isHost = false;
  let lastCheerAt = 0;
  let lastTauntAt = 0;

  socket.on('join', (data, ack) => {
    if (typeof ack !== 'function') ack = () => {};
    data = data || {};
    if (data.pid && players.has(data.pid)) {
      const p = players.get(data.pid);
      p.socketId = socket.id; p.connected = true; pid = p.id;
      lastSent.delete(p.id);
      dirtyOne(p.id);
      if (G.type === 'boss' && G.lastSurvivors) socket.emit('survivors', G.lastSurvivors);
      return ack({ ok: true, pid: p.id });
    }
    if (data.pid && !data.name) return ack({ ok: false, error: '' });
    const name = clean(data.name, 20);
    if (!name) return ack({ ok: false, error: 'Bạn chưa nhập tên' });
    if (G.locked) return ack({ ok: false, error: 'Đã chốt danh sách đăng ký. Chờ ván sau nhé!' });
    if (players.size >= CFG.MAX_PLAYERS) return ack({ ok: false, error: `Đã đủ ${CFG.MAX_PLAYERS} người đăng ký rồi!` });
    const norm = name.toLowerCase();
    for (const existing of players.values()) {
      if (existing.name.toLowerCase() === norm) {
        return ack({ ok: false, error: 'Tên/Account này đã có người đăng ký. Hãy thêm số hoặc biệt danh!' });
      }
    }
    const p = makePlayer({ name, dept: clean(data.dept, 24) || 'Khác', avatar: AVATARS.includes(data.avatar) ? data.avatar : AVATARS[0] });
    p.socketId = socket.id; p.connected = true;
    players.set(p.id, p); pid = p.id;
    dirty();
    ack({ ok: true, pid: p.id });
  });

  socket.on('choose', (hand, ack) => {
    if (typeof ack !== 'function') ack = () => {};
    if (!pid || !HANDS.includes(hand)) return ack({ ok: false, error: 'Lựa chọn không hợp lệ' });
    if (G.phase !== 'choosing') return ack({ ok: false, error: 'Đã hết thời gian ra tay' });
    const p = players.get(pid);
    if (!p || !G.participants.has(pid)) return ack({ ok: false, error: 'Bạn không thi đấu lượt này' });
    if (p.choice) return ack({ ok: true, hand: p.choice });
    const now = Date.now();
    p.choice = hand; p.choiceAt = now;
    if (G.stepStartAt > 0) {
      p.reactSum += Math.max(50, Math.min(now - G.stepStartAt, G.stepMs || 15000));
      p.reactCnt += 1;
    }
    dirtyOne(pid);
    ack({ ok: true, hand });
    maybeEarlyResolve();
  });

  // Khán giả thả cảm xúc bay lên màn hình LED (throttle 400ms/người)
  socket.on('cheer', (data) => {
    if (!pid || G.phase === 'lobby') return;
    const now = Date.now();
    if (now - lastCheerAt < 400) return;
    lastCheerAt = now;
    const p = players.get(pid);
    if (!p) return;
    const emoji = typeof data === 'string' ? data : data?.emoji;
    if (!CHEERS.includes(emoji)) return;
    const side = (data && (data.side === 'a' || data.side === 'b')) ? data.side : null;
    p.cheersSent++;
    if (cheerQueue.length < 40) cheerQueue.push({ e: emoji, side, av: p.avatar });
  });

  // Khán giả bình chọn phe ở Bán kết / Chung kết
  socket.on('vote', (data, ack) => {
    if (typeof ack !== 'function') ack = () => {};
    if (!pid || G.type !== 'duel' || !G.rounds[G.cur] || G.rounds[G.cur].length > 2) return ack({ ok: false });
    if (G.phase === 'lobby' || G.phase === 'champion') return ack({ ok: false });
    if (G.participants.has(pid)) return ack({ ok: false });
    const mi = Number(data?.matchIdx);
    const side = data?.side;
    const m = G.rounds[G.cur][mi];
    if (!m || m.done || (side !== 'a' && side !== 'b')) return ack({ ok: false });
    if (!G.crowdVotes.has(mi)) G.crowdVotes.set(mi, new Map());
    G.crowdVotes.get(mi).set(pid, side);
    const p = players.get(pid);
    if (p && cheerQueue.length < 40) cheerQueue.push({ e: side === 'a' ? '💙' : '❤️', side, av: p.avatar });
    dirty();
    ack({ ok: true, votes: matchVotes(mi) });
  });

  // Đấu thủ Bán kết / Chung kết tung hỏa mù tâm lý (preset an toàn)
  socket.on('taunt', (idx, ack) => {
    if (typeof ack !== 'function') ack = () => {};
    if (!pid || G.type !== 'duel' || G.phase !== 'choosing' || !G.rounds[G.cur] || G.rounds[G.cur].length > 2) return ack({ ok: false });
    if (!G.participants.has(pid)) return ack({ ok: false });
    const now = Date.now();
    if (now - lastTauntAt < 1200) return ack({ ok: false });
    const i = Number(idx);
    if (!Number.isInteger(i) || i < 0 || i >= TAUNTS.length) return ack({ ok: false });
    lastTauntAt = now;
    G.taunts.set(pid, { text: TAUNTS[i], at: now });
    dirty();
    ack({ ok: true, text: TAUNTS[i] });
  });

  socket.on('leave', () => {
    if (!pid) return;
    if (!G.locked) { players.delete(pid); lastSent.delete(pid); dirty(); }
    pid = null;
  });

  // ----- MC -----
  socket.on('host:auth', (key, ack) => {
    if (typeof ack !== 'function') return;
    if (key !== CFG.HOST_KEY) return ack({ ok: false });
    isHost = true; socket.join('hosts');
    socket.emit('host', hostState());
    ack({ ok: true });
  });
  const hostOnly = fn => (...args) => { if (isHost) fn(...args); };
  socket.on('host:setup', hostOnly(type => setup(type)));
  socket.on('host:start', hostOnly(() => startRound()));
  socket.on('host:skip', hostOnly(() => {
    if (G.phase === 'choosing') { clearTimeout(stepTimer); triggerReveal(); }
    else if (G.phase === 'suspense') { clearTimeout(suspenseTimer); resolveStep(); }
  }));
  socket.on('host:auto', hostOnly(() => { G.auto = !G.auto; scheduleBossNext(); dirtyHost(); }));
  socket.on('host:bots', hostOnly(n => {
    if (G.locked) return;
    n = Math.max(0, Math.min(+n || 0, CFG.MAX_PLAYERS - players.size));
    const depts = CFG.DEPARTMENTS.length ? CFG.DEPARTMENTS : ['Khác'];
    let added = 0, tries = 0;
    while (added < n && tries < n * 3) {
      tries++;
      const candidate = `${BOT_NAMES[(players.size + tries) % BOT_NAMES.length]} Bot ${players.size + 1}`;
      const p = makePlayer({ name: candidate, dept: depts[(Math.random() * depts.length) | 0], avatar: AVATARS[(Math.random() * AVATARS.length) | 0], bot: true });
      players.set(p.id, p);
      added++;
    }
    dirty();
  }));
  socket.on('host:removeBots', hostOnly(() => {
    if (G.locked) return;
    for (const [id, p] of players) if (p.bot) { players.delete(id); lastSent.delete(id); }
    dirty();
  }));
  socket.on('host:listPlayers', hostOnly((ack) => {
    if (typeof ack !== 'function') return;
    const list = [...players.values()].map(p => ({
      id: p.id, name: p.name, dept: p.dept, avatar: p.avatar, bot: p.bot, alive: p.alive, wins: p.wins, connected: p.connected,
    }));
    ack({ ok: true, list });
  }));
  socket.on('host:kick', hostOnly((targetId, ack) => {
    if (typeof ack !== 'function') ack = () => {};
    if (G.locked) return ack({ ok: false, error: 'Chỉ xóa được từng người ở phòng chờ' });
    const p = players.get(targetId);
    if (!p) return ack({ ok: false, error: 'Không tìm thấy người chơi' });
    const sid = p.socketId;
    players.delete(targetId);
    lastSent.delete(targetId);
    if (sid) io.to(sid).emit('kicked', { reason: 'MC đã xóa bạn khỏi danh sách phòng chờ.' });
    dirty();
    ack({ ok: true });
  }));
  socket.on('host:export', hostOnly((ack) => {
    if (typeof ack !== 'function') return;
    const roots = fanRoots();
    const fc = fanClubs(roots);
    const list = [...players.values()].map(p => ({
      name: p.name,
      dept: p.dept,
      avatar: p.avatar,
      bot: p.bot,
      alive: p.alive,
      wins: p.wins,
      elimRound: p.alive ? 'Vô địch / Đang sống' : (p.elimRound !== null ? (G.type === 'duel' && G.rounds[p.elimRound] ? roundName(p.elimRound) : `Vòng ${p.elimRound + 1}`) : ''),
      fans: fc.cnt.get(p.id) || 0,
    }));
    ack({
      ok: true,
      mode: TYPE_LABEL[G.type] || 'Phòng chờ',
      exportedAt: new Date().toISOString(),
      podium: buildPodium(fc),
      depts: deptStats(),
      players: list,
    });
  }));
  // Về phòng chờ, giữ danh sách người chơi, mở lại đăng ký
  socket.on('host:reset', hostOnly(() => {
    clearTimers(); freshGame();
    for (const p of players.values()) resetPlayer(p);
    lastSent.clear();
    dirty();
  }));
  socket.on('host:clear', hostOnly(() => {
    clearTimers(); freshGame(); players.clear(); lastSent.clear();
    io.emit('cleared');
    dirty();
  }));

  socket.on('disconnect', () => {
    if (pid && players.has(pid)) {
      const p = players.get(pid);
      if (p.socketId === socket.id) { p.connected = false; p.socketId = null; }
      dirtyHost();
    }
  });
});

server.listen(CFG.PORT, () => {
  console.log('\n  ✊✋✌️  OẲN TÙ TÌ SINH TỬ đã chạy!');
  console.log(`  • Người chơi vào:   ${JOIN_URL}`);
  const adminBase = CFG.PUBLIC_URL ? CFG.PUBLIC_URL.replace(/\/$/, '') : `http://localhost:${CFG.PORT}`;
  console.log(`  • Màn hình MC:      ${adminBase}/host   (mật khẩu: ${process.env.HOST_KEY ? 'đã đặt trong biến HOST_KEY' : CFG.HOST_KEY})`);
  console.log(`  • Tối đa ${CFG.MAX_PLAYERS} người chơi\n`);
});

module.exports = { server };
