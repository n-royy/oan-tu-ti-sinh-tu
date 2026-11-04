// Vẽ sơ đồ nhánh đấu kiểu giải bóng đá (dùng chung cho điện thoại và màn hình lớn)
(function () {
  const HE = { rock: '✊', paper: '✋', scissors: '✌️' };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function row(x, side, m, o) {
    if (!x) return `<div class="mr tbd"><span class="av"></span><span class="n">${m.bye && side === 'b' ? 'Vé vớt' : 'Chờ…'}</span><b class="s"></b></div>`;
    const st = m.w ? (m.w === side ? ' w' : ' l') : '';
    const me = o.me && x.id === o.me ? ' me' : '';
    const focus = o.focus && x.id === o.focus ? ' focus' : '';
    const h = o.hands && (side === 'a' ? m.ha : m.hb);
    const sc = m.bye ? '✓' : side === 'a' ? m.wa : m.wb;
    return `<div class="mr${st}${me}${focus}"><span class="av">${x.av}</span><span class="n">${esc(x.n)}</span>${h ? `<span class="hd">${HE[h]}</span>` : ''}<b class="s">${sc}</b></div>`;
  }

  function card(m, o) {
    if (!m) return '<div class="mc ghost"></div>';
    const has = id => (m.a && m.a.id === id) || (m.b && m.b.id === id);
    const cls = (m.live ? ' live' : '') + (m.done ? ' done' : '') + (o.focus && has(o.focus) ? ' mine' : '') + (m.bye ? ' bye' : '');
    return `<div class="mc${cls}">${row(m.a, 'a', m, o)}${row(m.b, 'b', m, o)}</div>`;
  }

  function slot(m, o, single) {
    const adv = m && m.done ? ' adv' : '';
    const fed = m && (m.a || m.b) ? ' fed' : '';
    return `<div class="bk-slot${single ? ' single' : ''}${adv}${fed}">${card(m, o)}</div>`;
  }

  function column(name, bo, matches, o, cls) {
    let body = '';
    if (matches.length === 1) body = slot(matches[0], o, true);
    else for (let i = 0; i < matches.length; i += 2) body += `<div class="bk-pair">${slot(matches[i], o)}${slot(matches[i + 1], o)}</div>`;
    return `<div class="bk-col ${cls}"><h4><span>${esc(name)}</span>${bo && bo !== 'BO1' ? `<em>${bo}</em>` : ''}</h4><div class="bk-slots">${body}</div></div>`;
  }

  function champCol(champ, cls) {
    const inner = champ
      ? `<div class="mc trophy"><div class="tr-ic">🏆</div><div class="tr-av">${champ.av}</div><div class="tr-n">${esc(champ.n)}</div></div>`
      : `<div class="mc trophy wait"><div class="tr-ic">🏆</div><div class="tr-n">Nhà vô địch</div></div>`;
    return `<div class="bk-col ${cls}"><h4><span>Vô địch</span></h4><div class="bk-slots"><div class="bk-slot single">${inner}</div></div></div>`;
  }

  // Một chiều, trái sang phải (điện thoại)
  function linear(cols, o) {
    const last = cols.length - 1;
    let html = cols.map((c, i) => column(c.name, c.bo, c.matches, o, (i ? 'in ' : '') + (i < last || o.champCol ? 'out' : ''))).join('');
    if (o.champCol) html += champCol(o.champ, 'in');
    return `<div class="bk">${html}</div>`;
  }

  // Hai nhánh đối xứng hội tụ về chung kết ở giữa (màn hình lớn)
  function mirror(tree, o) {
    const fin = tree[tree.length - 1];
    const early = tree.slice(0, -1);
    const half = side => early.map((c, i) => {
      const k = c.matches.length / 2;
      const ms = side === 'L' ? c.matches.slice(0, k) : c.matches.slice(k);
      return column(c.name, c.bo, ms, o, (i ? 'in ' : '') + 'out');
    }).join('');
    const f = fin.matches[0];
    const champ = o.champ;
    const center = `<div class="bk-center">
      <h4><span>Chung Kết</span>${fin.bo !== 'BO1' ? `<em>${fin.bo}</em>` : ''}</h4>
      <div class="bk-slots">
        <div class="bk-trophy">${champ ? `<div class="ch-av">${champ.av}</div>` : '<div class="cup">🏆</div>'}</div>
        <div class="bk-slot single final${f && f.done ? ' adv' : ''}">${card(f, o)}</div>
        <div class="bk-champ">${champ ? `<span>👑 ${esc(champ.n)}</span>` : '<span class="muted">Nhà vô địch?</span>'}</div>
      </div></div>`;
    if (!early.length) return `<div class="bkm">${center}</div>`;
    return `<div class="bkm"><div class="bk">${half('L')}</div>${center}<div class="bk rev">${half('R')}</div></div>`;
  }

  window.Bracket = { linear, mirror, card };
})();
