// Giả lập N người chơi thật kết nối qua mạng và tự chơi đến khi có nhà vô địch.
// Chạy: node test/simulate.js [URL] [số người] [duel|boss] [mật khẩu MC]
const { io } = require('socket.io-client');
const URL = process.argv[2] || 'http://localhost:3000';
const N = +(process.argv[3] || 500);
const TYPE = process.argv[4] || 'duel';
const KEY = process.argv[5] || 'admin';
const HANDS = ['rock', 'paper', 'scissors'];
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const host = io(URL, { transports: ['websocket'] });
  let H = null;
  host.on('host', h => { H = h; });
  await new Promise(r => host.emit('host:auth', KEY, r));
  host.emit('host:clear');
  await sleep(400);

  const clients = [];
  let joined = 0, rejected = 0;
  const t0 = Date.now();
  for (let i = 0; i < N + 3; i++) {
    const s = io(URL, { transports: ['websocket'], forceNew: true });
    s.on('state', st => {
      s._st = st;
      if (st.canChoose && !s._picked) { s._picked = true; setTimeout(() => s.emit('choose', HANDS[(Math.random() * 3) | 0]), 100 + Math.random() * 1500); }
      if (!st.canChoose) s._picked = false;
    });
    s.on('survivors', d => { s._sv = d; });
    s.emit('join', { name: `Người ${i + 1}`, dept: ['Kinh doanh', 'Kỹ thuật', 'Kế toán', 'Nhân sự'][i % 4], avatar: '🐼' }, r => { r.ok ? joined++ : rejected++; });
    clients.push(s);
    if (i % 50 === 49) await sleep(50);
  }
  await sleep(1500);
  console.log(`Đăng ký: ${joined} | Bị từ chối (vượt giới hạn): ${rejected} | ${Date.now() - t0}ms`);

  host.emit('host:setup', TYPE);
  while (!H || H.phase !== 'ready') await sleep(50);
  const late = io(URL, { transports: ['websocket'], forceNew: true });
  const lateRes = await new Promise(r => late.emit('join', { name: 'Đến muộn' }, r));
  console.log(`Đã chốt danh sách. Người đến muộn: ${lateRes.ok ? 'VẪN VÀO ĐƯỢC (lỗi!)' : lateRes.error}`);
  if (TYPE === 'duel') console.log('Lộ trình:', H.bracket.path.map(p => `${p.name}(${p.n} cặp, ${p.bo})`).join(' → '), `| vé vớt: ${H.bracket.byes}`);

  for (let k = 0; k < 60; k++) {
    if (H.phase === 'champion') break;
    const label = H.roundLabel, before = H.alive, rs = Date.now();
    host.emit('host:start');
    while (H.phase === 'ready' || H.phase === 'roundEnd') await sleep(50);
    let steps = 0;
    while (!['roundEnd', 'champion'].includes(H.phase)) { if (H.phase === 'reveal') steps = H.step; await sleep(80); }
    const pathNote = TYPE === 'duel' && H.bracket ? '' : '';
    console.log(`${label.padEnd(14)} ${String(before).padStart(3)} → ${String(H.alive).padStart(3)} còn lại · ${steps} lượt lật bài · ${((Date.now() - rs) / 1000).toFixed(1)}s${pathNote}`);
  }
  await sleep(400);
  const champSeen = clients.filter(c => c._st && c._st.phase === 'champion').length;
  const svSeen = clients.filter(c => c._sv).length;
  console.log(`🏆 Vô địch: ${H.champion?.name} · ${H.champion?.wins} thắng · fan club ${H.champion?.fans}`);
  console.log(`Máy nhận màn hình vô địch: ${champSeen}/${joined}` + (TYPE === 'boss' ? ` · máy nhận danh sách còn lại: ${svSeen}/${joined}` : ''));
  process.exit(0);
})();
