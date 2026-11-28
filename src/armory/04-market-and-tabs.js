  function pTerm() {
    const s = blankS(), tm = s.tm, O = C.TERM.odds, totalTerms = (s.term || 0) + (tm ? 1 : 0);
    const odds = `<div class="ar-todds">${C.TIERS.map(t => `<span style="--tc:${C.TIER[t].c}"><i></i>${C.TIER[t].n} ${pct(O[t])}</span>`).join('')}<span class="ar-st-chip">斩数版 ${pct(C.cv(CF(), 'stP'))}</span></div>`;
    let body;
    if (tm) {
      const o = tm.o, left = C.TERM.offers - tm.n, fx = NOW() - TERM_FX < 1500;
      body = `<div class="ar-term${fx ? ' scan' : ''}" style="--tc:${tc(o.k)}">
        <div class="ar-termart"><img src="${bigArt(o.k)}" alt="">${o.st >= 0 ? `<span class="ar-st">斩数 ${o.st}</span>` : ''}<i class="ar-scanline"></i></div>
        <div class="ar-terminfo"><span class="ar-k">货郎 · 第 ${tm.n} / ${C.TERM.offers} 件${s.term ? `（另有 ${s.term} 台未开封）` : ''}</span>
          <span class="ar-tier" style="--tc:${tc(o.k)}">${C.TIER[tierOf(o.k)].n}</span>
          <h3>${escapeHTML(itemName(o))}</h3>
          <p class="ar-note">${colName(o.k)}武器箱 · ${charName(o.k)}</p>
          <div class="ar-termprice"><span>报价</span>${ink(o.price)}</div>
          <p class="ar-note">玩家市场：${mkLine(o.k, o.st)}</p>
          <div class="ar-insbtns"><button type="button" class="go small" data-term="buy" ${live() ? '' : 'disabled'}>买下 ${ink(o.price)}</button><button type="button" class="ghost small" data-term="next" ${live() ? '' : 'disabled'}>${left ? `不要，换下一件（还能换 ${left} 次）` : '不要（这台货郎就没了）'}</button><button type="button" class="go small" data-term="openAll" ${totalTerms && live() ? '' : 'disabled'}>一键开启全部（${totalTerms}）</button></div>
          <p class="ar-note" id="arTermLeft"></p></div></div>`;
    } else {
      body = `<div class="ar-card ar-termseal"><span class="ar-termbox"><span>终</span></span><div><h3>货郎 <small>还有 ${s.term} 台没开封</small></h3>
        <p class="ar-note">${s.term ? '可逐台开封挑选报价，或直接一键开启全部货郎，一次性领取所有奖励。' : `货郎在商店按固定价格卖（一台 ${fmt(C.shopPrice('term', CF()))} 墨锭），每周补给、星章兑换也有，新手礼也送一台。`}</p></div>
        <div class="ar-termbtns"><button type="button" class="go small" data-term="openAll" ${totalTerms && live() ? '' : 'disabled'}>一键开启全部（${totalTerms}）</button><button type="button" class="ghost small" data-term="unseal" ${s.term && live() ? '' : 'disabled'}>逐台开封</button><button type="button" class="ghost small" data-buyg="term">买一台 ${ink(C.shopPrice('term', CF()))}</button></div></div>`;
    }
    return `${body}<h4 class="ar-h">货郎报价的概率 <small>每件都从全部武器箱饰品里抽取（含神兵与星座武器箱），支持逐台挑货或一键批量开启</small></h4>${odds}
      <p class="ar-note">一键开启全部会一次性打开所有可用货郎并直接将奖励收入库存；逐台开封时 5 件都不要或 ${C.TERM.days} 天内不处理会作废。</p>`;
  }
  let TERM_TM = 0;
  function termTick() {   // 开着的货郎：显示还剩多久作废
    clearTimeout(TERM_TM);
    const el = $id('arTermLeft'); if (!el || !ST || !ST.tm) return;
    const ms = ST.tm.t0 + C.TERM.days * 86400e3 - NOW();
    if (ms <= 0) { ST.tm = null; render(); return; }
    const h = Math.floor(ms / 3600e3), m = Math.floor(ms / 60e3) % 60;
    el.textContent = `还剩 ${h >= 24 ? `${Math.floor(h / 24)} 天 ${h % 24} 小时` : h ? `${h} 小时 ${m} 分` : `${Math.max(1, m)} 分钟`}作废`;
    TERM_TM = setTimeout(termTick, 30000);
  }
  async function openAllTerms() {
    if (bulkOpening || REEL.on || BUSY || !live()) return;
    bulkOpening = true;
    const wins = [], owner = UID;
    try {
      while (live() && UID === owner && ((ST.term || 0) > 0 || !!ST.tm) && !C.invFull(ST)) {
        const r = await act('termOpenAll', {});
        if (!r || !r.ok || !Array.isArray(r.items) || !r.items.length) break;
        wins.push(...r.items);
      }
    } finally {
      bulkOpening = false;
      render();
      if (wins.length && UID === owner && $id('armory').classList.contains('on')) {
        SFX.gong && SFX.gong();
        modal(`<h3>货郎批量开启结果（共 ${wins.length} 件）</h3><div class="ar-grid">${wins.map(it => tile(it)).join('')}</div><div class="row"><button class="go small" id="arTermBulkDone">全部收下</button></div>`, 'wide');
        $id('arTermBulkDone').addEventListener('click', () => { closeModal(); render(); });
      }
    }
  }
  async function termAct(a) {
    if (a === 'openAll') { await openAllTerms(); return; }
    if (a === 'unseal') { const r = await act('unseal', {}); if (r && r.ok) { TERM_FX = NOW(); SFX.chargeFull && SFX.chargeFull(); render(); } return; }
    const tm = ST && ST.tm; if (!tm) { render(); return; }
    if (a === 'buy') {
      const o = tm.o;
      confirmBox('买下这一件', `花 ${ink(o.price)} 买下「${escapeHTML(itemName(o))}」？买下以后这台货郎就用掉了。`, '买下', async () => {
        const r = await act('termBuy', { n: tm.n });
        if (r && r.ok) { render(); reveal(r.item); } else render();
      });
      return;
    }
    if (a === 'next') {
      const go = async () => {
        const r = await act('termNext', { n: tm.n });
        if (r && r.ok) { if (r.gone) toast('5 件都没要，这台货郎用完了'); else { TERM_FX = NOW(); SFX.slice && SFX.slice(); } }
        render();
      };
      if (tm.n >= C.TERM.offers) confirmBox('最后一件', '这是这台货郎的最后一件了。不要的话，货郎就没了。', '不要了', go);
      else go();
    }
  }

  // 玩家市场：只有饰品，只有玩家之间买卖，价格全由卖家定（系统不定价、不收购）
  const MK = { view: 'items', tier: '', char: '', sort: 'hot', only: false, msort: 'exp', mtier: '', mchar: '', mshow: 60 };   // m 开头的是「我的挂单」自己的排序、筛选和显示到第几件
  const goodCol = k => k === 'term' ? '120,220,200' : C.COLS[k].col;
  const goodIcon = k => k === 'term' ? '<span class="ar-termbox sm"><span>终</span></span>' : `<span class="ar-casebox sm${C.COLS[k].prem ? ' prem' : ''}" style="--cc:${C.COLS[k].col}"><span>${C.COLS[k].emblem}</span></span>`;
  function dealChart(deals) {   // 最近的成交价，横轴是时间
    const pts = deals.filter(x => x && x.price > 0 && x.at > 0).slice(0, 120).reverse();
    if (pts.length < 2) return empty(pts.length ? `只成交过一次：${fmt(pts[0].price)} 墨锭` : '这款还没有成交记录', 'ar-empty sm');
    const W = 520, H = 150, t0 = pts[0].at, ts = pts[pts.length - 1].at - t0 || 1;
    const ys = pts.map(x => x.price), lo = Math.min(...ys), hi = Math.max(...ys), sp = hi - lo || 1;
    const Y = p => (H - 14 - (p - lo) / sp * (H - 28)).toFixed(1);
    const line = pts.map(x => `${((x.at - t0) / ts * W).toFixed(1)},${Y(x.price)}`).join(' ');
    // 今日涨跌：今天最后一笔对比昨天及以前的最后一笔（收盘）；以前没成交过就对比今天第一笔
    const td = today(), tdy = pts.filter(x => C.day(x.at) === td), prev = pts.filter(x => C.day(x.at) < td);
    let chg = `<span class="ar-chg flat">今日 —<small>今天还没成交</small></span>`, base = 0;
    if (tdy.length) {
      base = prev.length ? prev[prev.length - 1].price : tdy[0].price;
      const now = tdy[tdy.length - 1].price, d = now - base, pc = base ? d / base * 100 : 0;
      const cls = d > 0 ? 'up' : d < 0 ? 'down' : 'flat', sign = d > 0 ? '+' : d < 0 ? '−' : '';
      chg = `<span class="ar-chg ${cls}">今日 ${sign}${Math.abs(pc).toFixed(2)}%<small>${sign}${fmt(Math.abs(d))} · 对比${prev.length ? '昨收' : '今天第一笔'} ${fmt(base)}</small></span>`;
    }
    const ref = base ? `<line x1="0" x2="${W}" y1="${Y(base)}" y2="${Y(base)}" class="ref"/>` : '';
    return `<div class="ar-chart">${chg}<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="最近的成交价"><polyline points="0,${H} ${line} ${W},${H}" class="fill"/>${ref}<polyline points="${line}" class="line"/></svg><div class="ar-chartlbl"><span>${new Date(t0).toLocaleDateString()}</span><span>最近 ${pts.length} 笔成交：最高 ${fmt(hi)} · 最低 ${fmt(lo)} · 最近一笔 ${fmt(ys[ys.length - 1])}</span><span>${new Date(pts[pts.length - 1].at).toLocaleDateString()}</span></div></div>`;
  }
  function pMarket() {
    const s = blankS(), on = MODE === 'server';
    const tabs = [['items', '在卖的饰品'], ['mine', `我的挂单${s.lst.length ? ` (${s.lst.length})` : ''}`], ['hist', '成交记录']].map(([k, n]) => `<button type="button" data-mkv="${k}" class="${MK.view === k ? 'sel' : ''}">${n}</button>`).join('');
    let body = '';
    if (MK.view === 'items') {
      const I = MKD.items || {}, Z = { n: 0, lo: 0, sn: 0, slo: 0, last: 0, slast: 0, d: 0 }, row = k => I[k] || Z;
      const cnt = k => row(k).n + row(k).sn, lo = k => { const a = [row(k).lo, row(k).slo].filter(v => v > 0); return a.length ? Math.min(...a) : 0; };
      let keys = Object.keys(C.ITEM).filter(k => (!MK.tier || tierOf(k) === MK.tier) && (!MK.char || C.charOf(k) === MK.char) && (!MK.only || cnt(k) > 0));
      const BIG = 1e12, sorts = {
        hot: (a, b) => C.TIERS.indexOf(tierOf(b)) - C.TIERS.indexOf(tierOf(a)) || cnt(b) - cnt(a),
        cheap: (a, b) => (lo(a) || BIG) - (lo(b) || BIG), dear: (a, b) => lo(b) - lo(a),
        deals: (a, b) => row(b).d - row(a).d || cnt(b) - cnt(a), many: (a, b) => cnt(b) - cnt(a) || C.TIERS.indexOf(tierOf(b)) - C.TIERS.indexOf(tierOf(a)),
      };
      keys = keys.sort(sorts[MK.sort] || sorts.hot);
      const status = !on ? `<p class="ar-banner soft">${noMkt()}</p>` : MKD.err ? uiState('error', MKD.err, 'ar-banner') : !MKD.items ? uiState('loading', '正在读取玩家市场…', 'ar-banner soft') : '';
      body = `${status}<div class="ar-filter"><select id="arMkTier" class="ar-sel"><option value="">全部品质</option>${C.TIERS.map(t => `<option value="${t}" ${MK.tier === t ? 'selected' : ''}>${C.TIER[t].n}</option>`).join('')}</select>
        <select id="arMkChar" class="ar-sel"><option value="">全部侠客</option>${CHARS.map(c => `<option value="${c.id}" ${MK.char === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}</select>
        <select id="arMkSort" class="ar-sel">${[['hot', '品质高的在前'], ['many', '在卖的多'], ['cheap', '最便宜'], ['dear', '最贵'], ['deals', '成交最多']].map(([k, n]) => `<option value="${k}" ${MK.sort === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
        <label class="ar-chk"><input type="checkbox" id="arMkOnly" ${MK.only ? 'checked' : ''}> 只看有人在卖的</label></div>
        ${keys.length ? `<div class="ar-mklist">${keys.map(k => { const x = row(k), p = lo(k), c = cnt(k); return `<button type="button" class="ar-mkrow" data-mk="${k}" style="--tc:${tc(k)}"><img src="${thumb(k)}" alt="" loading="lazy"><span class="ar-mkn"><b>${escapeHTML(itemName({ k, st: -1 }))}</b><small>${C.TIER[tierOf(k)].n} · ${colName(k)}武器箱</small></span><span class="ar-mkc">${c ? `在卖 ${c} 件${x.sn ? `（斩数版 ${x.sn}）` : ''}` : '没人在卖'}<small>${x.d ? `30 天成交 ${x.d} 笔` : '30 天没有成交'}${x.last ? ` · 最近 ${fmt(x.last)}` : ''}</small></span><span class="ar-mkp">${p ? `<small>最低</small>${ink(p)}` : '<small>—</small>'}</span></button>`; }).join('')}</div>` : empty('没有符合条件的饰品。')}`;
    } else if (MK.view === 'mine') {
      body = s.lst.length ? myListings(s) : empty('没有挂单。在库存里点一件饰品，选“挂到市场”，标价自己定，同时挂多少件都可以。');
    } else {
      const kind = h => h.kind === 'buy' ? (h.g ? '商店买入' : '玩家市场买入') : { sold: '卖给玩家', term: '货郎买入', sell: '卖出', upgrade: '升为斩数版' }[h.kind] || '';
      body = s.hist.length ? `<div class="ar-hist">${s.hist.map(h => `<div class="ar-hrow"><span>${new Date(h.t).toLocaleString()}</span><span>${kind(h)}</span><span>${h.g ? `${goodName(h.g)} ×${h.n}` : escapeHTML(itemName({ k: h.k, st: h.st }))}</span><span>${h.kind === 'buy' || h.kind === 'term' || h.kind === 'upgrade' ? '−' : '+'}${fmt(h.gain || h.price)}</span></div>`).join('')}</div>` : empty('还没有成交记录。');
    }
    return `<div class="ar-seg">${tabs}</div><p class="ar-note top">玩家市场只卖饰品：每一件都是别的玩家挂的，标价全由卖家自己定，系统不定价、也不收购；成交扣 ${Math.round(C.cv(CF(), 'fee') * 100)}% 手续费。武器箱和货郎在商店按固定价格买。</p>${body}`;
  }
  // 我的挂单：挂多少件都行，所以要能排序、筛选；一次先画 60 件，多的点“再显示”
  const MSORTS = [['exp', '快到期的在前'], ['new', '最新挂的在前'], ['dear', '标价从高到低'], ['cheap', '标价从低到高'], ['tier', '品质高的在前'], ['st', '斩数多的在前'], ['char', '按侠客']];
  function myListings(s) {
    const ttl = C.cv(CF(), 'mktDays') * 864e5, tr = L => C.TIERS.indexOf(tierOf(L.it.k));
    const ci = L => { const i = CHARS.findIndex(c => c.id === C.charOf(L.it.k)); return i < 0 ? 999 : i; };
    const sorts = {
      exp: (a, b) => a.t - b.t, new: (a, b) => b.t - a.t,
      dear: (a, b) => b.price - a.price || a.t - b.t, cheap: (a, b) => a.price - b.price || a.t - b.t,
      tier: (a, b) => tr(b) - tr(a) || b.price - a.price, st: (a, b) => b.it.st - a.it.st || tr(b) - tr(a),
      char: (a, b) => ci(a) - ci(b) || tr(b) - tr(a) || a.t - b.t,
    };
    const all = s.lst.filter(L => (!MK.mtier || tierOf(L.it.k) === MK.mtier) && (!MK.mchar || C.charOf(L.it.k) === MK.mchar)).sort(sorts[MK.msort] || sorts.exp);
    const shown = all.slice(0, MK.mshow), sum = all.reduce((a, L) => a + L.price, 0), net = all.reduce((a, L) => a + C.net(L.price, CF()), 0);
    const left = L => { const d = Math.ceil((L.t + ttl - Date.now()) / 864e5); return d <= 1 ? '今天或明天到期' : `还有 ${d} 天到期`; };
    const filter = `<div class="ar-filter"><select id="arMyTier" class="ar-sel"><option value="">全部品质</option>${C.TIERS.map(t => `<option value="${t}" ${MK.mtier === t ? 'selected' : ''}>${C.TIER[t].n}</option>`).join('')}</select>
        <select id="arMyChar" class="ar-sel"><option value="">全部侠客</option>${CHARS.map(c => `<option value="${c.id}" ${MK.mchar === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}</select>
        <select id="arMySort" class="ar-sel">${MSORTS.map(([k, n]) => `<option value="${k}" ${MK.msort === k ? 'selected' : ''}>${n}</option>`).join('')}</select></div>`;
    const head = `<div class="ar-sum"><span>${all.length === s.lst.length ? '挂着' : '符合条件的'} <b>${all.length}</b> 件</span><span>标价合计 ${ink(sum)}</span><span>全部卖掉到手 <b>${fmt(net)}</b></span></div>`;
    const rows = shown.map(L => `<div class="ar-mkrow static" style="--tc:${tc(L.it.k)}"><img src="${thumb(L.it.k)}" alt="" loading="lazy"><span class="ar-mkn"><b>${escapeHTML(itemName(L.it))}</b><small>${C.TIER[tierOf(L.it.k)].n} · 挂于 ${new Date(L.t).toLocaleString()} · ${left(L)}（${new Date(L.t + ttl).toLocaleDateString()} 前没人买就退回库存）</small></span><span class="ar-mkp">标价 ${ink(L.price)}<small>卖掉到手 ${fmt(C.net(L.price, CF()))}</small></span><span class="ar-mkbtns"><button type="button" class="ghost small" data-mk="${L.it.k}">行情</button><button type="button" class="ghost small" data-cancel="${L.l}">撤下</button></span></div>`).join('');
    const more = all.length > shown.length ? `<div class="row"><button type="button" class="ghost small" data-mymore>再显示 ${Math.min(60, all.length - shown.length)} 件（还有 ${all.length - shown.length} 件）</button></div>` : '';
    return `${filter}${head}${all.length ? `<div class="ar-mklist">${rows}</div>${more}` : empty('没有符合条件的挂单。')}`;
  }
  let MKI = { tok: 0, k: '' };   // 正在看的那一款：读回来时弹窗还开着、还是这一款才画
  async function marketItem(k, keep) {
    const tok = ++MKI.tok; MKI.k = k;
    const head = `<div class="ar-mkhead" style="--tc:${tc(k)}"><img src="${art(k)}" alt=""><div><span class="ar-tier" style="--tc:${tc(k)}">${C.TIER[tierOf(k)].n}</span><h3>${escapeHTML(itemName({ k, st: -1 }))}</h3><p class="ar-note">${colName(k)}武器箱 · ${charName(k)}</p></div></div>`;
    const mine = () => { const xs = blankS().inv.filter(x => x.k === k); return xs.length ? `<h4 class="ar-h">我库存里的这款</h4><div class="ar-lst">${xs.map(x => `<div class="ar-lrow"><span>${x.st >= 0 ? `<b class="ar-stn">斩数 ${x.st}</b>` : '普通版'}${x.n ? ` · ‘${escapeHTML(x.n)}’` : ''}</span><span></span><button type="button" class="ghost small" data-insp="${x.i}">挂到市场 / 检视</button></div>`).join('')}</div>` : ''; };
    const foot = '<div class="row"><button class="ghost small" data-ar-close>关闭</button></div>';
    if (MODE !== 'server') { modal(`${head}<p class="ar-banner soft">${noMkt()}</p>${mine()}${foot}`, 'wide'); return; }
    if (!keep) modal(`${head}${uiState('loading', '正在读取…', 'ar-empty sm')}${foot}`, 'wide');
    let d;
    try { d = await MKT(k); }
    catch (e) { if (tok === MKI.tok && !$id('arModal').hidden) modal(`${head}${uiState('error', e && e.status === 404 ? '服务器还没开玩家市场，等服务器更新以后就能用' : (e && e.message) || '读不到玩家市场', 'ar-banner')}${mine()}${foot}`, 'wide'); return; }
    if (tok !== MKI.tok || $id('arModal').hidden || REEL.on) return;
    const open = Array.isArray(d && d.open) ? d.open : [], deals = Array.isArray(d && d.deals) ? d.deals : [];
    const rows = open.map(x => `<div class="ar-lrow${x.mine ? ' mine' : ''}"><span>${x.st >= 0 ? `<b class="ar-stn">斩数 ${x.st}</b>` : '普通版'}<small>${new Date(x.at).toLocaleDateString()} 挂出</small></span><span>${ink(x.price)}</span>${x.mine ? `<button type="button" class="ghost small" data-cancel="${x.l}">撤下（我挂的）</button>` : `<button type="button" class="go small" data-buyl="${x.l}" data-price="${x.price}" data-st="${x.st}" ${live() ? '' : 'disabled'}>购买</button>`}</div>`).join('');
    modal(`${head}${dealChart(deals)}<h4 class="ar-h">在卖 <small>${open.length ? `${open.length} 件，便宜的在前` : ''}</small></h4>${open.length ? `<div class="ar-lst">${rows}</div>` : empty('现在没人在卖这款。', 'ar-empty sm')}${mine()}${foot}`, 'wide');
  }
  function buyListing(l, price, st) {
    const k = MKI.k, name = itemName({ k, st });
    confirmBox('从玩家市场买', `花 ${ink(price)} 买下「${escapeHTML(name)}」${st >= 0 ? `（斩数 ${st}）` : ''}？`, '买下', async () => {
      const r = await act('buy', { l, price });
      MKD.at = 0;
      if (r && r.ok) { SFX.wood && SFX.wood(); toast(`买到了：${itemName(r.item)}`); render(); reveal(r.item); }
      else marketItem(k);
    });
  }

  // 熔铸契
  const TR = { tier: 'mil', sel: [] };
  function pTrade() {
    const s = blankS(), up = C.UP[TR.tier], need = C.NEED[TR.tier];
    TR.sel = TR.sel.filter(id => s.inv.some(x => x.i === id && tierOf(x.k) === TR.tier));
    const chk = TR.sel.length ? C.tradeCheck(s, TR.sel) : null;
    const selItems = TR.sel.map(id => s.inv.find(x => x.i === id));
    const stMode = selItems.length ? selItems[0].st >= 0 : null;
    const usable = x => tierOf(x.k) === TR.tier && (C.COLS[C.ITEM[x.k].col][up] || []).length && (stMode === null || (x.st >= 0) === stMode);
    const pool = s.inv.filter(x => tierOf(x.k) === TR.tier && !TR.sel.includes(x.i));
    const slots = []; for (let i = 0; i < need; i++) { const it = selItems[i]; slots.push(it ? `<button type="button" class="ar-slot on" data-unsel="${it.i}" style="--tc:${tc(it.k)}"><img src="${thumb(it.k)}" alt=""><small>${it.st >= 0 ? '斩数' : escapeHTML(colName(it.k))}</small></button>` : '<span class="ar-slot"></span>'); }
    const outs = chk && chk.outs ? chk.outs.map(o => `<div class="ar-out" style="--tc:${tc(o.k)}"><img src="${thumb(o.k)}" alt=""><b>${escapeHTML(skinName(o.k))}</b><small>${charName(o.k)} · ${(o.p * 100).toFixed(1)}%</small></div>`).join('') : '';
    return `<div class="ar-seg">${['mil', 'res', 'cla', 'cov'].map(t => `<button type="button" data-trt="${t}" class="${TR.tier === t ? 'sel' : ''}">${C.TIER[t].n} → ${C.TIER[C.UP[t]].n}</button>`).join('')}</div>
      <p class="ar-note top">放进 ${need} 件${C.TIER[TR.tier].n}饰品，换 1 件${C.TIER[up].n}。出什么取决于材料来自哪个武器箱；斩数版只能和斩数版一起换，换出来的也是斩数版。</p>
      <div class="ar-slots">${slots.join('')}</div>
      <div class="ar-trbar"><span>${TR.sel.length} / ${need}</span>${chk && chk.err && chk.full === undefined ? `<span class="ar-err">${chk.err}</span>` : ''}<button type="button" class="go small" id="arTradeGo" ${chk && chk.ok ? '' : 'disabled'}>签订合同</button><button type="button" class="ghost small" id="arTradeClr" ${TR.sel.length ? '' : 'disabled'}>清空</button></div>
      ${outs ? `<h4 class="ar-h">可能换到</h4><div class="ar-outs">${outs}</div>` : ''}
      <h4 class="ar-h">库存里的${C.TIER[TR.tier].n}饰品 <small>点一下放进合同</small></h4>
      ${pool.length ? `<div class="ar-grid sm">${pool.map(x => tile(x, usable(x) && TR.sel.length < need ? 'data-sel="1"' : 'disabled')).join('')}</div>` : empty('库存里没有这一档的饰品。')}`;
  }

  // 江湖行动
  function supplyName(o) {
    if (o.t === 'case') return `${C.COLS[o.c].name}武器箱`;
    if (o.t === 'term') return '货郎';
    if (o.t === 'tag') return '改名标签';
    if (o.t === 'ink') return `${o.n} 墨锭`;
    return itemName({ k: o.k, st: -1 });
  }
  const SUP = { pick: [] };
  function pOp() {
    const s = blankS(), se = C.season(today()), left = se.end - today(), stars = s.op.earned - s.op.spent;
    const ms = s.op.ms.map((m, i) => {
      const prog = Math.min(m.n, s.op.prog[i] || 0), done = s.op.done.includes(i), D = C.MISSIONS[m.id];
      const name = D.t.replace('{n}', m.n).replace('{h}', m.h ? `「${CHARS[CHAR_IDX[m.h]].name}」` : '');
      return `<div class="trow"><span>${name}</span><div class="bar"><i style="width:${prog / m.n * 100}%"></i></div><span class="rw">${'★'.repeat(m.star)}</span><div><button data-mission="${i}" ${done || prog < m.n || !live() ? 'disabled' : ''}>${done ? '已领' : prog >= m.n ? '领星章' : `${prog}/${m.n}`}</button></div></div>`;
    }).join('');
    const opts = live() ? C.supplyOpts(UID, s.drop.w) : [];
    const ready = s.drop.g >= C.SUPPLY_GAMES;
    const sup = s.drop.sup ? '<p class="ar-note">这周的补给已经领了，下周一再来。</p>'
      : `<div class="ar-sup">${opts.map((o, i) => `<button type="button" class="ar-supo${SUP.pick.includes(i) ? ' sel' : ''}" data-sup="${i}" ${ready ? '' : 'disabled'} style="--tc:${o.t === 'item' ? tc(o.k) : o.t === 'term' ? '120,220,200' : '233,196,106'}">${o.t === 'item' ? `<img src="${thumb(o.k)}" alt="">` : `<span class="ar-supi">${{ case: '箱', term: '终', tag: '签', ink: '墨' }[o.t]}</span>`}<b>${escapeHTML(supplyName(o))}</b></button>`).join('')}</div>
        <div class="row"><button type="button" class="go small" id="arSupGo" ${ready && SUP.pick.length === 2 ? '' : 'disabled'}>领取这两样</button></div>`;
    const shop = C.STAR_SHOP.map(g => `<div class="ar-card ar-starg"><b>${g.name}</b><span class="ar-starc">${'★'.repeat(Math.min(g.cost, 5))}${g.cost > 5 ? ` ×${g.cost}` : ''}</span><button type="button" class="go small" data-star="${g.id}" ${stars >= g.cost && live() ? '' : 'disabled'}>${g.cost} 星章兑换</button></div>`).join('');
    return `<div class="ar-ophead"><div><span class="ar-k">江湖行动 · 第 ${se.k + 1} 季 · 剩 ${left} 天</span><h3>星章 <b>${stars}</b> <small>本季共得 ${s.op.earned}</small></h3></div><p class="ar-note">每周一换四个任务，完成拿星章，星章换武器箱、货郎、改名标签和饰品。</p></div>
      <h4 class="ar-h">本周任务</h4><div class="tlist">${ms || empty('登录之后才有任务。')}</div>
      <h4 class="ar-h">每周补给 <small>${ready ? '已解锁：四样里挑两样' : `这周再打 ${C.SUPPLY_GAMES - s.drop.g} 局解锁（${s.drop.g}/${C.SUPPLY_GAMES}）`}</small></h4>${live() ? sup : ''}
      <h4 class="ar-h">星章兑换 <small>饰品都从普通武器箱里出，神兵、星座武器箱的换不到</small></h4><div class="ar-grid3">${shop}</div>
      <p class="ar-note">对局掉落：每局 ${Math.round(C.cv(CF(), 'dropP') * 100)}% 机会掉一件饰品或武器箱，每周最多 ${C.cv(CF(), 'dropCap')} 次（本周已掉 ${s.drop.n} 次）。</p>`;
  }
  const BDG = { sub: 'badges', cat: 'all', rarity: 'all', state: 'all', sort: 'tier', page: 1, giftPick: 'flowing', petCat: 'all', petRarity: 'all', petState: 'all', petSort: 'rarity', petPage: 1, heroArch: 'all', heroPage: 1 };
  const pagerHtml = (kind, page, totalPages, totalItems) => totalPages <= 1 ? '' : `<div class="ar-pager" role="navigation" aria-label="分页"><button type="button" class="ghost small" data-page-${kind}="${Math.max(1, page - 1)}" ${page <= 1 ? 'disabled' : ''}>‹ ${cvT('上一页')}</button><span class="ar-pager-info">${page} / ${totalPages} (${cvT('总计')}: ${totalItems})</span><button type="button" class="ghost small" data-page-${kind}="${Math.min(totalPages, page + 1)}" ${page >= totalPages ? 'disabled' : ''}>${cvT('下一页')} ›</button></div>`;
  function pBadges() {
    const s = blankS(), ids = Object.keys(C.BADGES), owned = Object.entries(s.badgeOwned || {}), totalKOs = Object.values(s.heroKOs || {}).reduce((n, x) => n + x, 0);
    const petIds = Object.keys(C.PETS || {}), petOwned = s.petOwned || {}, ownedPetList = Object.entries(petOwned);
    const tierNames = ['银徽', '金徽', '紫金徽'];
    const tierRank = t => t === 'purpgold' ? 3 : t === 'gold' ? 2 : t === 'silver' ? 1 : 0;
    const rarityRank = r => r === 'legend' ? 3 : r === 'epic' ? 2 : 1;
    const catNames = C.BADGE_CATS || { all: '全部', offense: '进攻', defense: '防御', mobility: '身法', mastery: '绝技', team: '团队' };
    const rarNames = C.BADGE_RARITIES || { all: '全部品阶', legend: '绝世', epic: '奇珍', rare: '精良' };
    const petCatNames = C.PET_CATS || { all: '全部', attack: '攻伐', defense: '护御', support: '辅助', control: '控场' };
    const petRarNames = C.PET_RARITIES || { all: '全部品阶', legend: '神兽', epic: '灵兽', rare: '珍兽' };
    const petTierName = t => t === 'immortal' ? '仙阶' : t === 'spirit' ? '灵阶' : '初阶';
    const petTierRank = t => t === 'immortal' ? 3 : t === 'spirit' ? 2 : t === 'basic' ? 1 : 0;
    const previewButton = (id, tier) => `<button type="button" class="ghost small" data-badge-preview="${id}" data-badge-tier="${tier}">${cvT('试招')}</button>`;
    const badgeCard = (id, tier, giftCard = false) => {
      const b = C.BADGES[id], currentName = tier ? tierNames[tier === 'gold' ? 1 : tier === 'purpgold' ? 2 : 0] : '';
      const trigger = (window.COMBAT_BADGES && window.COMBAT_BADGES[id] && window.COMBAT_BADGES[id].trigger) || b.effect;
      const rarTag = `<span class="rar-pill rar-${b.rarity || 'rare'}">${cvT(rarNames[b.rarity] || '精良')}</span>`;
      const catTag = `<span class="badge-cat-tag">${cvT(catNames[b.cat] || '武学')}</span>`;
      const tierCls = tier === 'purpgold' ? ' tier-pg' : tier === 'gold' ? ' tier-gd' : tier === 'silver' ? ' tier-sv' : ' tier-lk';
      const up = (!giftCard && tier) ? C.BADGE_UPGRADE[tier] : null;
      const ready = up && totalKOs >= up.kos && s.badgeSigils >= up.sigils && PROF.ink >= up.ink;
      const requirements = up ? `<div class="ar-badge-req"><small class="${s.badgeSigils >= up.sigils ? 'met' : ''}">${cvT('碎片')} ${s.badgeSigils}/${up.sigils}</small><small class="${PROF.ink >= up.ink ? 'met' : ''}">${cvT('墨锭')} ${fmt(PROF.ink)}/${fmt(up.ink)}</small><small class="${totalKOs >= up.kos ? 'met' : ''}">${cvT('斩')} ${totalKOs}/${up.kos}</small></div>` : '';
      const actionBtn = giftCard
        ? `<button type="button" class="go small" data-badge-gift="${id}" ${live() ? '' : 'disabled'}>${cvT('领取银徽')}</button>`
        : !tier
          ? `<button type="button" class="go small" data-badge-unlock="${id}" ${live() ? '' : 'disabled'}>${cvT('解锁')} (${C.BADGE_UNLOCK_SIGILS} ${cvT('碎片')} / ${C.BADGE_UNLOCK_INK} ${cvT('墨锭')})</button>`
          : up
            ? `${requirements}<button type="button" class="go small" data-badge-upgrade="${id}" ${live() && ready ? '' : 'disabled'}>${cvT('升阶')} ${cvT(up.to === 'gold' ? '金徽' : '紫金徽')}</button>`
            : `<small style="color:#d9a6ff;font-weight:700">✦ ${cvT('紫金圆满')}</small>`;
      const holder = Object.entries(s.badgeEquip || {}).find(([, bid]) => bid === id);
      const holderTag = holder ? `<small style="color:#7fe0b0">${cvT('已佩戴')}: ${escapeHTML((CHARS.find(c => c.id === holder[0]) || { name: holder[0] }).name)}</small>` : '';
      return `<article class="ar-card ar-badge-card compact${tierCls}"><div class="row" style="justify-content:space-between;align-items:center;gap:4px"><b>${cvT(b.name)}${currentName ? ` · ${cvT(currentName)}` : ''}</b><span class="row" style="gap:4px;margin:0">${rarTag}${catTag}</span></div><p>${cvT(b.desc)}</p><small>${cvT('触发')}: ${cvT(trigger)}</small>${holderTag}<div class="ar-badge-actions">${actionBtn}${previewButton(id, tier || 'silver')}</div></article>`;
    };
    const appBanner = !s.appreciation2026 ? `<div class="ar-badge-gift" style="border-color:rgba(217,166,255,.55);background:linear-gradient(135deg,rgba(82,36,120,.28),rgba(233,196,106,.14))"><div><h3 style="color:#f4d88a">🎁 ${cvT('感恩盛典 · 全员豪礼 + 免费紫金徽记')}</h3><p>${cvT('立即领取：50,000 墨锭 + 全系列武器箱各 10 个 + 50 徽记碎片 + 全部灵宠与招式流派 + 任选 1 枚最高阶「紫金徽记」！')}</p></div><div class="row" style="gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px"><select id="arAppBadgePick" style="max-width:260px">${ids.map(id => `<option value="${id}" ${BDG.giftPick === id ? 'selected' : ''}>✦ ${cvT(C.BADGES[id].name)}（${cvT(catNames[C.BADGES[id].cat] || '')}）</option>`).join('')}</select><button type="button" class="go" data-claim-appreciation="1" ${live() ? '' : 'disabled'}>🎁 ${cvT('一键领取全部豪礼与紫金徽记')}</button></div></div>` : '';
    const gift = !s.badgeGift && s.appreciation2026 ? `<div class="ar-badge-gift"><div><h3>${cvT('初入武学 · 银徽赠礼')}</h3><p>${cvT('任选一枚银徽体验武学效果。徽记绑定账号，可在不同侠客之间调换。')}</p></div><div class="ar-grid3">${ids.slice(0, 6).map(id => badgeCard(id, 'silver', true)).join('')}</div></div>` : '';
    const subTabs = `<div class="ar-seg ar-subtabs" role="tablist"><button type="button" data-bdg-sub="badges" class="${BDG.sub === 'badges' ? 'sel' : ''}">${cvT('武学徽记')} (${owned.length}/${ids.length})</button><button type="button" data-bdg-sub="pets" class="${BDG.sub === 'pets' ? 'sel' : ''}">${cvT('水墨灵宠')} (${ownedPetList.length}/${petIds.length})</button><button type="button" data-bdg-sub="loadouts" class="${BDG.sub === 'loadouts' ? 'sel' : ''}">${cvT('侠客配装')} (${CHARS.length})</button></div>`;
    let bodyHtml = '';
    if (BDG.sub === 'badges') {
      const filteredIds = ids.filter(id => {
        const b = C.BADGES[id], t = s.badgeOwned[id] || '';
        if (BDG.cat !== 'all' && b.cat !== BDG.cat) return false;
        if (BDG.rarity !== 'all' && (b.rarity || 'rare') !== BDG.rarity) return false;
        if (BDG.state === 'owned' && !t) return false;
        if (BDG.state === 'unowned' && t) return false;
        if (BDG.state === 'purpgold' && t !== 'purpgold') return false;
        if (BDG.state === 'gold' && t !== 'gold') return false;
        if (BDG.state === 'silver' && t !== 'silver') return false;
        return true;
      }).sort((a, b) => {
        if (BDG.sort === 'name') return C.BADGES[a].name.localeCompare(C.BADGES[b].name, 'zh-CN');
        if (BDG.sort === 'rarity') return rarityRank(C.BADGES[b].rarity) - rarityRank(C.BADGES[a].rarity) || tierRank(s.badgeOwned[b]) - tierRank(s.badgeOwned[a]);
        if (BDG.sort === 'cat') return (C.BADGES[a].cat || '').localeCompare(C.BADGES[b].cat || '') || tierRank(s.badgeOwned[b]) - tierRank(s.badgeOwned[a]);
        return tierRank(s.badgeOwned[b]) - tierRank(s.badgeOwned[a]) || rarityRank(C.BADGES[b].rarity) - rarityRank(C.BADGES[a].rarity) || a.localeCompare(b);
      });
      const perPage = 12, totalPages = Math.max(1, Math.ceil(filteredIds.length / perPage));
      BDG.page = Math.max(1, Math.min(totalPages, BDG.page));
      const pageIds = filteredIds.slice((BDG.page - 1) * perPage, BDG.page * perPage);
      const catBar = `<div class="ar-filter-bar">${Object.entries(catNames).map(([k, lbl]) => `<button type="button" class="${BDG.cat === k ? 'go' : 'ghost'} small" data-bdg-cat="${k}">${cvT(lbl)}</button>`).join('')}<select id="arBdgRarity" class="ar-sel">${Object.entries(rarNames).map(([k, lbl]) => `<option value="${k}" ${BDG.rarity === k ? 'selected' : ''}>${cvT(lbl)}</option>`).join('')}</select><select id="arBdgState" class="ar-sel"><option value="all" ${BDG.state === 'all' ? 'selected' : ''}>${cvT('全部状态')}</option><option value="owned" ${BDG.state === 'owned' ? 'selected' : ''}>${cvT('已拥有')} (${owned.length})</option><option value="unowned" ${BDG.state === 'unowned' ? 'selected' : ''}>${cvT('未拥有')} (${ids.length - owned.length})</option><option value="purpgold" ${BDG.state === 'purpgold' ? 'selected' : ''}>${cvT('紫金徽')}</option><option value="gold" ${BDG.state === 'gold' ? 'selected' : ''}>${cvT('金徽')}</option><option value="silver" ${BDG.state === 'silver' ? 'selected' : ''}>${cvT('银徽')}</option></select><select id="arBdgSort" class="ar-sel"><option value="tier" ${BDG.sort === 'tier' ? 'selected' : ''}>${cvT('阶位优先')}</option><option value="rarity" ${BDG.sort === 'rarity' ? 'selected' : ''}>${cvT('品阶优先')}</option><option value="cat" ${BDG.sort === 'cat' ? 'selected' : ''}>${cvT('按类别')}</option><option value="name" ${BDG.sort === 'name' ? 'selected' : ''}>${cvT('按名称')}</option></select></div>`;
      bodyHtml = `${catBar}${pageIds.length ? `<div class="ar-grid3">${pageIds.map(id => badgeCard(id, s.badgeOwned[id] || '')).join('')}</div>` : `<p class="ar-note">${cvT('当前筛选条件下没有徽记')}</p>`}${pagerHtml('bdg', BDG.page, totalPages, filteredIds.length)}`;
    } else if (BDG.sub === 'pets') {
      const filteredPets = petIds.filter(id => {
        const p = C.PETS[id], t = petOwned[id] || '';
        if (BDG.petCat !== 'all' && p.cat !== BDG.petCat) return false;
        if (BDG.petRarity !== 'all' && (p.rarity || 'rare') !== BDG.petRarity) return false;
        if (BDG.petState === 'owned' && !t) return false;
        if (BDG.petState === 'unowned' && t) return false;
        return true;
      }).sort((a, b) => {
        if (BDG.petSort === 'name') return C.PETS[a].name.localeCompare(C.PETS[b].name, 'zh-CN');
        if (BDG.petSort === 'tier') return petTierRank(petOwned[b]) - petTierRank(petOwned[a]) || rarityRank(C.PETS[b].rarity) - rarityRank(C.PETS[a].rarity);
        return rarityRank(C.PETS[b].rarity) - rarityRank(C.PETS[a].rarity) || petTierRank(petOwned[b]) - petTierRank(petOwned[a]) || a.localeCompare(b);
      });
      const perPage = 8, totalPages = Math.max(1, Math.ceil(filteredPets.length / perPage));
      BDG.petPage = Math.max(1, Math.min(totalPages, BDG.petPage));
      const pagePets = filteredPets.slice((BDG.petPage - 1) * perPage, BDG.petPage * perPage);
      const petBar = `<div class="ar-filter-bar">${Object.entries(petCatNames).map(([k, lbl]) => `<button type="button" class="${BDG.petCat === k ? 'go' : 'ghost'} small" data-pet-cat="${k}">${cvT(lbl)}</button>`).join('')}<select id="arPetRarity" class="ar-sel">${Object.entries(petRarNames).map(([k, lbl]) => `<option value="${k}" ${BDG.petRarity === k ? 'selected' : ''}>${cvT(lbl)}</option>`).join('')}</select><select id="arPetState" class="ar-sel"><option value="all" ${BDG.petState === 'all' ? 'selected' : ''}>${cvT('全部状态')}</option><option value="owned" ${BDG.petState === 'owned' ? 'selected' : ''}>${cvT('已收养')} (${ownedPetList.length})</option><option value="unowned" ${BDG.petState === 'unowned' ? 'selected' : ''}>${cvT('未收养')} (${petIds.length - ownedPetList.length})</option></select><select id="arPetSort" class="ar-sel"><option value="rarity" ${BDG.petSort === 'rarity' ? 'selected' : ''}>${cvT('品阶优先')}</option><option value="tier" ${BDG.petSort === 'tier' ? 'selected' : ''}>${cvT('养成优先')}</option><option value="name" ${BDG.petSort === 'name' ? 'selected' : ''}>${cvT('按名称')}</option></select></div>`;
      const cards = pagePets.map(id => {
        const p = C.PETS[id], tier = petOwned[id], up = tier && C.PET_UPGRADE[tier];
        const rarTag = `<span class="rar-pill rar-${p.rarity || 'rare'}">${cvT(petRarNames[p.rarity] || '珍兽')}</span>`;
        const catTag = `<span class="badge-cat-tag">${cvT(petCatNames[p.cat] || '灵宠')}</span>`;
        const actBtn = !tier
          ? `<button type="button" class="go small" data-pet-buy="${id}" ${live() ? '' : 'disabled'}>${cvT('收养')} · ${C.PET_BUY_COST}${cvT('墨')}</button>`
          : up
            ? `<button type="button" class="go small" data-pet-up="${id}" ${live() && totalKOs >= up.kos ? '' : 'disabled'}>${cvT('进阶')}${cvT(petTierName(up.to))} (${up.ink}${cvT('墨')} · ${up.kos}${cvT('斩')})</button>`
            : `<small style="color:#d9a6ff;font-weight:700">✦ ${cvT('仙阶圆满')}</small>`;
        return `<article class="ar-card ar-badge-card compact" style="border-color:rgba(${p.rgb},.42)"><div class="row" style="justify-content:space-between;align-items:center;gap:4px"><b style="color:rgb(${p.rgb})">${cvT(p.name)}${tier ? ` · ${cvT(petTierName(tier))}` : ''}</b><span class="row" style="gap:4px;margin:0">${rarTag}${catTag}</span></div><p><b>${cvT('被动')}</b>：${cvT(p.passive)}</p><small><b>${cvT('主动 V')}</b>：${cvT(p.active)}</small><div class="ar-badge-actions">${actBtn}</div></article>`;
      }).join('');
      bodyHtml = `${petBar}${cards ? `<div class="ar-grid3">${cards}</div>` : `<p class="ar-note">${cvT('当前筛选条件下没有灵宠')}</p>`}${pagerHtml('pet', BDG.petPage, totalPages, filteredPets.length)}`;
    } else {
      const archList = [['all', '全部'], ['swordsman', '剑客'], ['assassin', '刺客'], ['tank', '重甲'], ['fighter', '格斗'], ['support', '辅助'], ['controller', '控场']];
      const filteredHeroes = CHARS.filter(ch => BDG.heroArch === 'all' || (typeof heroArchetypeOf === 'function' ? heroArchetypeOf(ch) === BDG.heroArch : true));
      const perPage = 12, totalPages = Math.max(1, Math.ceil(filteredHeroes.length / perPage));
      BDG.heroPage = Math.max(1, Math.min(totalPages, BDG.heroPage));
      const pageHeroes = filteredHeroes.slice((BDG.heroPage - 1) * perPage, BDG.heroPage * perPage);
      const heroBar = `<div class="ar-filter-bar">${archList.map(([k, lbl]) => `<button type="button" class="${BDG.heroArch === k ? 'go' : 'ghost'} small" data-hero-arch="${k}">${cvT(lbl)}</button>`).join('')}</div>`;
      const heroes = pageHeroes.map(ch => {
        const kos = s.heroKOs[ch.id] || 0, unlocked = kos >= 20, stance = s.stances[ch.id] === 1 ? 1 : 0, equipped = s.badgeEquip[ch.id] || '';
        const eqPet = (s.petEquip && s.petEquip[ch.id]) || '';
        const su = (s.skillUnlocks && s.skillUnlocks[ch.id]) || {};
        const sl = (s.skillLoadout && s.skillLoadout[ch.id]) || {};
        const options = [`<option value="">${cvT('不装备')}</option>`, ...owned.map(([id]) => `<option value="${id}" ${equipped === id ? 'selected' : ''}>${cvT(C.BADGES[id].name)} · ${cvT(s.badgeOwned[id] === 'silver' ? '银徽' : s.badgeOwned[id] === 'gold' ? '金徽' : '紫金徽')}</option>`)].join('');
        const petOpts = [`<option value="">${cvT('无灵宠')}</option>`, ...ownedPetList.map(([id, t]) => `<option value="${id}" ${eqPet === id ? 'selected' : ''}>${cvT(C.PETS[id].name)} · ${cvT(petTierName(t))}</option>`)].join('');
        const stanceTitle = window.HERO_STANCES && window.HERO_STANCES[ch.id] ? cvT(window.HERO_STANCES[ch.id].name) : cvT('第二架势');
        const skillRows = ['q', 'r', 'e'].map(slot => {
          const curV = sl[slot] || 'std', unl = su[slot] || [];
          return `<div class="row" style="gap:4px;margin-top:4px;align-items:center"><small style="min-width:18px;font-weight:700">${slot.toUpperCase()}</small>${['std', 'swift', 'heavy'].map(v => {
            const isUnl = v === 'std' || unl.includes(v), active = curV === v;
            const lbl = cvT(C.SKILL_VARIANTS[v].name);
            return isUnl
              ? `<button type="button" class="${active ? 'go' : 'ghost'} small" data-skill-set="${ch.id}:${slot}:${v}" ${live() ? '' : 'disabled'}>${lbl}</button>`
              : `<button type="button" class="ghost small" data-skill-unlock="${ch.id}:${slot}:${v}" ${live() ? '' : 'disabled'}>🔒${lbl}</button>`;
          }).join('')}</div>`;
        }).join('');
        return `<article class="ar-card ar-loadout compact"><div class="row" style="justify-content:space-between;align-items:center"><b>${escapeHTML(ch.name)}</b><small>${unlocked ? `${kos} ${cvT('斩')}` : `${kos}/20 ${cvT('斩')}`}</small></div><div class="row"><button type="button" class="${stance ? 'ghost' : 'go'} small" data-stance="${ch.id}" data-value="0" ${live() ? '' : 'disabled'}>${cvT('本式')}</button><button type="button" class="${stance ? 'go' : 'ghost'} small" data-stance="${ch.id}" data-value="1" ${live() && unlocked ? '' : 'disabled'}>${stanceTitle}</button></div><div class="row"><select data-badge-choice="${ch.id}" aria-label="${escapeHTML(cvT(ch.name))} ${cvT('徽记')}">${options}</select><button type="button" class="go small" data-badge-set="${ch.id}" ${live() ? '' : 'disabled'}>${cvT('装备')}</button></div><div class="row"><select data-pet-choice="${ch.id}" aria-label="${escapeHTML(cvT(ch.name))} ${cvT('灵宠')}">${petOpts}</select><button type="button" class="go small" data-pet-set="${ch.id}" ${live() ? '' : 'disabled'}>${cvT('携宠')}</button></div><div style="margin-top:4px">${skillRows}</div></article>`;
      }).join('');
      bodyHtml = `${heroBar}<div class="ar-grid3">${heroes}</div>${pagerHtml('hero', BDG.heroPage, totalPages, filteredHeroes.length)}`;
    }
    const shardProgress = totalKOs % C.BADGE_SIGIL_KOS;
    const shardBar = `<div class="ar-badge-progress"><label for="arBadgeShardProgress">${cvT('距离下一枚徽记碎片')}</label><progress id="arBadgeShardProgress" max="${C.BADGE_SIGIL_KOS}" value="${shardProgress}"></progress><small>${shardProgress} / ${C.BADGE_SIGIL_KOS} · ${C.BADGE_SIGIL_KOS - shardProgress} ${cvT('斩后获得')}</small></div>`;
    return `<div class="ar-ophead"><div><span class="ar-k">${cvT('武学与灵宠')}</span><h3>${cvT('徽记碎片')} <b>${s.badgeSigils || 0}</b> · ${cvT('累计斩获')} <b>${totalKOs}</b> · ${cvT('徽记')} <b>${owned.length}/${ids.length}</b> · ${cvT('灵宠')} <b>${ownedPetList.length}/${petIds.length}</b></h3>${shardBar}</div><p class="ar-note">${cvT('每累计斩获 40 次可得 1 枚徽记碎片。点击右上角 FULL AUTO 可一键全阵容最优装配。')}</p></div>
      ${appBanner}${gift}${subTabs}${bodyHtml}`;
  }
  function covPick() {
    const list = C.ofTierReg('cov');   // 神兵武器箱的不能拿星章换
    modal(`<h3>自选一件赤霄饰品</h3><div class="ar-grid sm">${list.map(k => `<button type="button" class="ar-it" style="--tc:${tc(k)}" data-opcov="${k}"><img src="${art(k)}" alt=""><b>${escapeHTML(skinName(k))}</b><small>${charName(k)} · ${colName(k)}</small><i class="ar-bar"></i></button>`).join('')}</div><div class="row"><button class="ghost small" data-ar-close>取消</button></div>`, 'wide');
  }

  /* ---------- 事件 ---------- */
  function bind() {
    $id('arTabs').addEventListener('click', e => { if (bulkOpening) return; const b = e.target.closest('[data-tab]'); if (!b) return; SFX.slice && SFX.slice(); TAB = b.dataset.tab; render(); $id('arMain').scrollTop = 0; });
    $id('arModal').addEventListener('click', async e => {
      if (e.target.closest('[data-ar-close]') || e.target === $id('arModal')) { if (!REEL.on) closeModal(); return; }
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      if (b.dataset.buyl) buyListing(b.dataset.buyl, +b.dataset.price, +b.dataset.st);
      else if (b.dataset.cancel) { const r = await act('cancel', { l: b.dataset.cancel }); MKD.at = 0; if (r && r.ok) { toast('已撤下，放回库存'); render(); } marketItem(MKI.k, true); }
      else if (b.dataset.insp) { const it = ST.inv.find(x => x.i === +b.dataset.insp); closeModal(); if (it) inspect(it, 'inv'); }
      else if (b.dataset.opcov) { const r = await act('star', { id: 'cov', k: b.dataset.opcov }); if (r && r.ok) { closeModal(); reveal(r.item); render(); } }
    });
    $id('arIns').addEventListener('click', e => { if (e.target === $id('arIns')) { closeIns(); return; } const b = e.target.closest('[data-ins]'); if (b && !b.disabled) insAction(b.dataset.ins); });
    const main = $id('arMain');
    main.addEventListener('change', e => {
      const id = e.target.id, v = e.target.value;
      if (id === 'arInvChar') INV.char = v; else if (id === 'arInvTier') INV.tier = v; else if (id === 'arInvStat') INV.stat = v; else if (id === 'arInvSort') INV.sort = v;
      else if (id === 'arCodexCol') CODEX.col = v; else if (id === 'arCodexChar') CODEX.char = v; else if (id === 'arCodexTier') CODEX.tier = v; else if (id === 'arCodexState') CODEX.state = v; else if (id === 'arCodexSort') CODEX.sort = v;
      else if (id === 'arMkTier') MK.tier = v; else if (id === 'arMkChar') MK.char = v; else if (id === 'arMkSort') MK.sort = v; else if (id === 'arMkOnly') MK.only = e.target.checked;
      else if (id === 'arMyTier') { MK.mtier = v; MK.mshow = 60; } else if (id === 'arMyChar') { MK.mchar = v; MK.mshow = 60; } else if (id === 'arMySort') { MK.msort = v; MK.mshow = 60; }
      else if (id === 'arBdgRarity') { BDG.rarity = v; BDG.page = 1; } else if (id === 'arBdgState') { BDG.state = v; BDG.page = 1; } else if (id === 'arBdgSort') { BDG.sort = v; BDG.page = 1; }
      else if (id === 'arPetRarity') { BDG.petRarity = v; BDG.petPage = 1; } else if (id === 'arPetState') { BDG.petState = v; BDG.petPage = 1; } else if (id === 'arPetSort') { BDG.petSort = v; BDG.petPage = 1; }
      else if (id === 'arAppBadgePick') { BDG.giftPick = v; return; } else return;
      render();
    });
    main.addEventListener('keydown', e => { if (e.key === 'Escape') return; e.stopPropagation(); });   // 打字时别触发游戏的快捷键
    main.addEventListener('click', async e => {
      if (bulkOpening) return;
      const pv = e.target.closest('[data-pv]');   // 武器箱里的饰品：点开预览
      if (pv) { inspect({ i: -1, k: pv.dataset.pv, st: -1, t: 0 }, 'pv'); return; }
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      const d = b.dataset;
      if (d.gotab) { TAB = d.gotab; if (d.mkv) MK.view = d.mkv; render(); return; }
      if (d.bdgSub) { BDG.sub = d.bdgSub; render(); return; }
      if (d.bdgCat) { BDG.cat = d.bdgCat; BDG.page = 1; render(); return; }
      if (d.pageBdg) { BDG.page = Math.max(1, +d.pageBdg || 1); render(); return; }
      if (d.petCat) { BDG.petCat = d.petCat; BDG.petPage = 1; render(); return; }
      if (d.pagePet) { BDG.petPage = Math.max(1, +d.pagePet || 1); render(); return; }
      if (d.heroArch) { BDG.heroArch = d.heroArch; BDG.heroPage = 1; render(); return; }
      if (d.pageHero) { BDG.heroPage = Math.max(1, +d.pageHero || 1); render(); return; }
      if (d.fullAuto) { await window.armoryFullAuto(); return; }
      if (d.claimAppreciation) {
        const pick = main.querySelector('#arAppBadgePick');
        const badgeId = (pick && pick.value) || BDG.giftPick || 'flowing';
        const r = await act('claimAppreciation', { badgeId });
        if (r && r.ok) { SFX.gong && SFX.gong(); toast(`🎁 感恩盛典大礼已到账！获得 50,000 墨锭、全武器箱与紫金徽「${cvT(C.BADGES[r.badgeId].name)}」`); render(); }
        return;
      }
      if (d.badgeAuto) { const r = await act('badgeAutoAssign', {}); if (r && r.ok) { toast(`已为 ${r.assigned} 位侠客自动装配最优徽记`); render(); } return; }
      if (d.badgePreview) { startBadgeTrainingPreview(d.badgePreview, d.badgeTier); return; }
      if (d.badgeGift) { const r = await act('badgeGift', { id: d.badgeGift }); if (r && r.ok) { toast(`获得银徽「${cvT(C.BADGES[r.id].name)}」`); render(); } return; }
      if (d.badgeUnlock) { const r = await act('badgeUnlock', { id: d.badgeUnlock }); if (r && r.ok) { toast(`已解锁徽记「${cvT(C.BADGES[r.id].name)}」`); render(); } return; }
      if (d.badgeUpgrade) { const r = await act('badgeUpgrade', { id: d.badgeUpgrade }); if (r && r.ok) { toast(`徽记已升阶：${cvT(C.BADGES[r.id].name)} · ${cvT(r.tier === 'gold' ? '金徽' : '紫金徽')}`); render(); } return; }
      if (d.petBuy) { const r = await act('petBuy', { id: d.petBuy }); if (r && r.ok) { toast(`已收养灵宠「${cvT(C.PETS[r.id].name)}」`); render(); } return; }
      if (d.petUp) { const r = await act('petUpgrade', { id: d.petUp }); if (r && r.ok) { toast(`灵宠已进阶：${cvT(C.PETS[r.id].name)}`); render(); } return; }
      if (d.petSet) { const sel = main.querySelector(`[data-pet-choice="${d.petSet}"]`); const r = await act('petEquip', { hero: d.petSet, id: sel ? sel.value : '' }); if (r && r.ok) { toast(r.id ? '灵宠已随行出战' : '已收回灵宠'); render(); } return; }
      if (d.skillUnlock) { const [hero, slot, variant] = d.skillUnlock.split(':'); const r = await act('skillUnlock', { hero, slot, variant }); if (r && r.ok) { toast('已解锁招式流派'); render(); } return; }
      if (d.skillSet) { const [hero, slot, variant] = d.skillSet.split(':'); const r = await act('skillSet', { hero, slot, variant }); if (r && r.ok) { toast('已切换招式流派'); render(); } return; }
      if (d.stance) { const r = await act('stanceSet', { hero: d.stance, stance: +d.value }); if (r && r.ok) { toast('已设置出战架势'); render(); } return; }
      if (d.badgeSet) { const sel = main.querySelector(`[data-badge-choice="${d.badgeSet}"]`); const r = await act('badgeEquip', { hero: d.badgeSet, id: sel ? sel.value : '' }); if (r && r.ok) { toast(r.id ? '徽记已装备；原佩戴者已卸下' : '徽记已卸下'); render(); } return; }
      if (d.it && !d.sel) { const it = ST && ST.inv.find(x => x.i === +d.it); if (it) inspect(it, 'inv'); return; }
      if (d.mk) { marketItem(d.mk); return; }
      if (d.mkv) { MK.view = d.mkv; render(); return; }
      if (d.mymore !== undefined) { MK.mshow += 60; render(); return; }
      if (d.trt) { TR.tier = d.trt; TR.sel = []; render(); return; }
      if (d.sel) { TR.sel.push(+d.it); render(); return; }
      if (d.unsel) { TR.sel = TR.sel.filter(x => x !== +d.unsel); render(); return; }
      if (d.sup !== undefined) { const i = +d.sup; SUP.pick = SUP.pick.includes(i) ? SUP.pick.filter(x => x !== i) : [...SUP.pick, i].slice(-2); render(); return; }
      if (!live() && (MODE === 'old' || MODE === 'offline')) {   // 再问一次服务器：联网了、或者服务器更新好了，就刷新页面让人再点一次
        await connect(true);
        if (live()) { render(); msg('连上了，可以用了'); return; }
      }
      if (!live()) { msg(MODE === 'wait' ? '正在连接服务器，稍等一下' : MODE === 'offline' ? '连不上服务器，等联网了再试' : MODE === 'old' ? OLD_MSG : '登录之后才能用武库'); return; }
      if (d.openAll !== undefined) { openAllCases(); return; }
      if (d.open) { openCase(d.open); return; }
      if (d.term) { termAct(d.term); return; }
      if (d.buyg) { buyBox(d.buyg); return; }
      if (d.cancel) { const r = await act('cancel', { l: d.cancel }); MKD.at = 0; if (r && r.ok) { toast('已撤下，放回库存'); render(); } return; }
      if (d.collect) { const r = await act('collect', { c: d.collect }); if (r && r.ok) { SFX.gong && SFX.gong(); toast(`集齐奖励：${C.COLS[d.collect].name}武器箱 +1，改名标签 +1`); render(); } return; }
      if (d.mission !== undefined) { const r = await act('mission', { m: +d.mission }); if (r && r.ok) { SFX.chargeFull && SFX.chargeFull(); toast(`星章 +${r.star}`); render(); } return; }
      if (d.star) {
        if (d.star === 'cov') { covPick(); return; }
        const r = await act('star', { id: d.star });
        if (r && r.ok) { if (r.item) reveal(r.item); else toast('兑换成功'); render(); }
        return;
      }
      if (d.store) { confirmBox('买改名标签', `花 ${ink(C.STORE[0].cost)} 买一张改名标签？每周最多买 ${C.STORE[0].lim} 张。`, '购买', buyTag); return; }
      if (d.upgradeAll !== undefined) { upgradeAllGo(); return; }
      if (d.sellAllDupes !== undefined) { sellAllDupesGo(); return; }
      if (d.sellDupes !== undefined || d.listDupes !== undefined) { listDupesGo(); return; }
      if (b.id === 'arGift') { const r = await act('gift', {}); if (r && r.ok) { SFX.gong && SFX.gong(); toast('新手礼：初刃武器箱 +1，货郎 +1'); render(); } return; }
      if (b.id === 'arTradeGo') { tradeGo(); return; }
      if (b.id === 'arTradeClr') { TR.sel = []; render(); return; }
      if (b.id === 'arSupGo') { const r = await act('supply', { picks: SUP.pick }); if (r && r.ok) { SUP.pick = []; SFX.gong && SFX.gong(); const it = r.got.find(x => x.t === 'item'); if (it) reveal(it.item); else toast('补给到手'); render(); } return; }
    });
  }
  function sellAllDupesGo() {
    const s = ST, plan = C.dupePlan(s);
    if (!plan.items.length) { msg('没有重复的饰品可出售'); return; }
    confirmBox('一键出售全部重复饰品', `将为您一次性出售全部 <b>${plan.items.length}</b> 件重复饰品（无数量上限），共得 <b>${fmt(plan.totalGain)}</b> 墨锭。<br><small>系统将严格保留每款饰品中斩数最高（或当前穿着）的一件。</small>`, '确认出售', async () => {
      const r = await act('sellDupes', {});
      if (r && r.ok) {
        SFX.wood && SFX.wood();
        toast(`已出售全部 ${r.count} 件重复饰品，获得 ${fmt(r.totalGain)} 墨锭！`);
        render();
      }
    });
  }
  function listDupesGo() {
    const s = ST, plan = C.dupePlan(s);
    if (!plan.items.length) { msg('没有重复的饰品可挂牌'); return; }
    confirmBox('自动挂牌市场', `将为您自动把全部 <b>${plan.items.length}</b> 件重复饰品挂到玩家市场出售（无 50 件上限）。<br><small>系统将为您严格保留每款饰品中斩数最高（或当前穿着）的一件。</small>`, '确认挂牌', async () => {
      const r = await act('listDupes', {});
      if (r && r.ok) {
        SFX.wood && SFX.wood();
        toast(`已成功将 ${r.count} 件重复饰品挂牌到玩家市场！${r.skipped ? `还有 ${r.skipped} 件，再点一次接着挂` : ''}`);
        render();
      }
    });
  }
  function sellDupesGo() { listDupesGo(); }
  function upgradeAllGo() {
    const quote = C.upgradeAllQuote(ST);
    if (!quote.count) { msg('库存里没有普通饰品可升级'); return; }
    confirmBox('批量升级为斩数版', `库存中有 ${quote.count} 件普通饰品可升级。原价 ${fmt(quote.basePrice)} 墨锭，20% 折扣省 ${fmt(quote.discount)} 墨锭，实付 ${fmt(quote.price)} 墨锭。升级后所有饰品从 0 斩开始，编号和名字保留，不能退回普通版。`, '确认批量升级', async () => {
      const r = await act('upgradeAllSt', { count: quote.count, price: quote.price });
      if (r && r.ok) { SFX.chargeFull && SFX.chargeFull(); toast(`已升级 ${r.count} 件斩数版，省下 ${fmt(r.discount)} 墨锭`); render(); }
    });
  }
  function tradeGo() {
    const s = ST, chk = C.tradeCheck(s, TR.sel); if (!chk.ok) { msg(chk.err); return; }
    confirmBox('签订熔铸契', `这 ${TR.sel.length} 件${C.TIER[chk.tier].n}饰品会被收走，换 1 件${C.TIER[chk.up].n}。确定吗？`, '签订', async () => {
      const r = await act('trade', { ids: TR.sel });
      if (r && r.ok) { TR.sel = []; reveal(r.item); render(); }
    });
  }

  /* ---------- 打开武库 ---------- */
  let POLL = 0;
