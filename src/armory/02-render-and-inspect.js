  function itemName(it) {
    const heir = C.isHeirloom(it.k), star = heir ? '★ 传世 · ' : (tierOf(it.k) === 'gold' ? '★ ' : ''), stp = (it.st >= 0 || C.isStOnly(it.k)) ? '斩数 · ' : '';
    return `${star}${stp}${charName(it.k)} | ${skinName(it.k)}`;
  }
  const tc = k => C.TIER[tierOf(k)].c;
  const today = () => C.day(NOW());
  // 卡面按屏幕的像素密度画：格子和卡片用的那张在视网膜屏上也是一比一；货郎、开箱亮相这种一次只看一件的另画一张大的；
  // 一排小图（武器箱内容、市场列表、熔铸格子）只截人物那一块再一半一半地缩下来，比整张卡缩成邮票清楚
  const DPR = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const ART_W = Math.round(Math.min(640, Math.max(360, 210 * DPR))), BIG_W = Math.round(Math.min(900, Math.max(360, 300 * DPR))), TH_W = Math.round(Math.max(96, 80 * DPR));
  const ART = new Map(), BIG = new Map(), THUMB = new Map();
  const cardCanvas = (k, w) => makeCardArt(CHAR_IDX[C.charOf(k)], w, Math.round(w * 4 / 3), k);
  function shrink(src, x, y, w, h, ow, oh) {   // 每次最多缩一半，缩得再多也不起锯齿
    let cv = src;
    for (;;) {
      const last = w / 2 < ow, t = document.createElement('canvas'); t.width = last ? ow : Math.round(w / 2); t.height = last ? oh : Math.round(h / 2);
      const g = t.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(cv, x, y, w, h, 0, 0, t.width, t.height);
      if (last) return t;
      cv = t; x = 0; y = 0; w = t.width; h = t.height;
    }
  }
  function art(k) {
    if (ART.has(k)) return ART.get(k);
    let url = '', th = '';
    try {
      const cv = cardCanvas(k, ART_W); url = cv.toDataURL('image/jpeg', 0.92);
      th = shrink(cv, cv.width * 0.03, cv.height * 0.12, cv.width * 0.76, cv.height * 0.76, TH_W, Math.round(TH_W * 4 / 3)).toDataURL('image/jpeg', 0.9);
    } catch (e) {}
    ART.set(k, url); THUMB.set(k, th || url); return url;
  }
  const thumb = k => (art(k), THUMB.get(k));
  function bigArt(k) {
    if (BIG.has(k)) return BIG.get(k);
    let url = ''; try { url = cardCanvas(k, BIG_W).toDataURL('image/jpeg', 0.93); } catch (e) {}
    BIG.set(k, url || art(k)); return BIG.get(k);
  }
  const fmt = n => Math.round(n).toLocaleString();
  const ink = n => `<span class="ar-cur ar-ink"><i>墨</i>${fmt(n)}</span>`;
  const pct = x => `${+(x * 100).toFixed(2)}%`;
  function msg(t) { const el = $id('arMsg'); if (el && $id('armory').classList.contains('on')) { el.textContent = t; clearTimeout(msg.tm); msg.tm = setTimeout(() => { el.textContent = ''; }, 4500); } else toast(t); }
  function busyUi(on) { const m = $id('armory'); if (m) m.classList.toggle('ar-busy', on); }
  const seenKey = () => 'renying-arm-seen-' + UID;
  const seenAt = () => { try { return +localStorage.getItem(seenKey()) || 0; } catch (e) { return 0; } };
  const markSeen = () => { try { localStorage.setItem(seenKey(), String(NOW())); } catch (e) {} };
  const tagLeft = s => { const g = C.STORE[0], b = s.buys[g.id]; return Math.max(0, g.lim - (b && b.k === 'w' + C.week(today()) ? b.n : 0)); };

  /* ---------- 弹窗 ---------- */
  function modal(html, cls = '') { const m = $id('arModal'); m.innerHTML = `<div class="ar-box ${cls}">${html}</div>`; m.hidden = false; return m; }
  function closeModal() { const m = $id('arModal'); m.hidden = true; m.innerHTML = ''; REEL.on = false; }
  // 确认用通用确认框：Esc、点遮罩取消，焦点停在“取消”；取消时下面的弹窗还在，确定了才关掉再做
  function confirmBox(title, body, okText, fn) {
    uiConfirm('', { title, html: body, ok: okText }).then(async ok => { if (!ok) return; if (!$id('arModal').hidden) closeModal(); await fn(); });
  }
  // 空、出错、加载中：用通用的 uiState，样式类照旧（ar-empty 是虚线框，ar-banner 是左边一道色条）
  const empty = (t, cls = 'ar-empty') => uiState('empty', t, cls);
  function tile(it, extra = '') {
    const eq = ST && Object.values(ST.eq).includes(it.i), fresh = it.t && it.t > seenAt() && it.i;
    return `<button type="button" class="ar-it${eq ? ' eq' : ''}" style="--tc:${tc(it.k)}" ${it.i ? `data-it="${it.i}"` : ''} ${extra}>
      <img src="${art(it.k)}" alt="" loading="lazy">${it.st >= 0 ? `<span class="ar-st">斩数 ${it.st}</span>` : ''}${eq ? '<span class="ar-eq">穿着</span>' : ''}${fresh ? '<span class="ar-new">新</span>' : ''}
      <b>${tierOf(it.k) === 'gold' ? '★ ' : ''}${escapeHTML(skinName(it.k))}</b><small>${charName(it.k)}${it.n ? ` · ‘${escapeHTML(it.n)}’` : ''}</small><i class="ar-bar"></i></button>`;
  }

  /* ---------- 页面 ---------- */
  const TABS = [['inv', '库存'], ['codex', '皮肤图鉴'], ['badges', '武学'], ['cases', '武器箱'], ['term', '货郎'], ['market', '玩家市场'], ['trade', '熔铸契'], ['op', '江湖行动']];
  function dots() {
    if (!ST || MODE === 'none') return {};
    const d = {};
    d.inv = ST.inv.some(x => x.t > seenAt());
    d.op = (ST.drop.g >= C.SUPPLY_GAMES && !ST.drop.sup) || ST.op.ms.some((m, i) => !ST.op.done.includes(i) && (ST.op.prog[i] || 0) >= m.n);
    d.cases = !ST.gift || C.CASES.some(c => ST.cases[c] > 0 && C.openLeft(ST, c, CF()) > 0);   // 有箱子、今天（这周）还能开
    d.term = ST.term > 0 || !!ST.tm;
    d.any = d.inv || d.op || d.cases || d.term;
    return d;
  }
  function render() {
    try { renderArmoryPage(); }
    catch (error) { showArmoryRecovery(error); }
  }
  function renderArmoryPage() {
    if (!$id('armory')) return;
    const d = dots();
    for (const el of document.querySelectorAll('.gInk')) el.textContent = PROF.ink;
    $id('arTabs').innerHTML = TABS.map(([k, n]) => `<button type="button" data-tab="${k}" class="${k === TAB ? 'sel' : ''}">${n}${d[k] ? '<i class="ar-dot"></i>' : ''}</button>`).join('');
    const banner = MODE === 'none' ? '<p class="ar-banner">登录之后才能开箱、交易。先逛逛看吧。</p>'
      : MODE === 'wait' ? uiState('loading', '正在连接服务器…', 'ar-banner soft')
      : MODE === 'offline' ? uiState('error', '连不上服务器，武库暂时只能看。', 'ar-banner')
      : MODE === 'old' ? `<p class="ar-banner">服务器上还是旧版武库，现在只能看。等服务器更新到新版就能开箱、交易，你的饰品和武器箱都在${OLDV === 1 ? '，没用完的钥匙会一把换一台货郎' : ''}。</p>`
      : MODE === 'local' && cloudOn() ? '<p class="ar-banner soft">测试期：服务器还没开武库，现在开箱、交易都只记在你的存档里，用来试玩。服务器版上线以后武库从零开始（会重新发新手礼），测试期开出来的东西不会带过去。</p>' : '';
    const R = { inv: pInv, codex: pCodex, badges: pBadges, cases: pCases, term: pTerm, market: pMarket, trade: pTrade, op: pOp }[TAB] || pInv;
    $id('arMain').innerHTML = banner + R();
    if (TAB === 'market' || TAB === 'term') loadMarket().then(fresh => { if (fresh && (TAB === 'market' || TAB === 'term') && $id('armory').classList.contains('on') && $id('arModal').hidden) render(); });
    if (TAB === 'inv') markSeenSoon();
    if (TAB === 'term') termTick();
    renderTopNav();
  }
  let seenTm = 0;
  function markSeenSoon() { clearTimeout(seenTm); seenTm = setTimeout(() => { if (TAB === 'inv' && $id('armory').classList.contains('on')) markSeen(); }, 2500); }
  function blankS() { return ST || C.normalize(C.blank(), { now: NOW(), uid: '' }); }

  // 库存
  const INV = { char: '', tier: '', sort: 'new', stat: '' };
  const CODEX = { col: '', char: '', tier: '', state: '', sort: 'set' };
  function pInv() {
    const s = blankS();
    let list = s.inv.filter(x => (!INV.char || C.charOf(x.k) === INV.char) && (!INV.tier || tierOf(x.k) === INV.tier) && (!INV.stat || (INV.stat === 'st' ? x.st >= 0 : x.st < 0)));
    const tr = x => C.TIERS.indexOf(tierOf(x.k));
    const sorts = {
      new: (a, b) => b.i - a.i,
      old: (a, b) => a.i - b.i,
      tier: (a, b) => tr(b) - tr(a) || b.i - a.i,
      tier_asc: (a, b) => tr(a) - tr(b) || b.i - a.i,
      st: (a, b) => (b.st || 0) - (a.st || 0) || b.i - a.i,
      name: (a, b) => (itemName(a) || '').localeCompare(itemName(b) || '', 'zh-CN')
    };
    list = list.slice().sort(sorts[INV.sort] || sorts.new);
    const cases = C.CASES.filter(c => s.cases[c] > 0).map(c => `<button type="button" class="ar-caseitem" data-gotab="cases" style="--cc:${C.COLS[c].col}"><span class="ar-emb">${C.COLS[c].emblem}</span><b>${C.COLS[c].name}武器箱</b><small>×${s.cases[c]}</small></button>`).join('')
      + (s.term || s.tm ? `<button type="button" class="ar-caseitem" data-gotab="term" style="--cc:120,220,200"><span class="ar-emb">终</span><b>货郎</b><small>×${s.term + (s.tm ? 1 : 0)}</small></button>` : '');
    const tl = tagLeft(s);
    const dupeP = C.dupePlan(s), dupeCount = dupeP.items.length;
    const upgradeQuote = C.upgradeAllQuote(s), canUpgradeAll = live() && upgradeQuote.count > 0 && PROF.ink >= upgradeQuote.price;
    return `<div class="ar-sum"><span>饰品 <b>${s.inv.length}</b> 件（无限容量）</span>${dupeCount ? `<span>发现 <b>${dupeCount}</b> 件重复（点击右上角 FULL AUTO 自动变现）</span>` : ''}${s.lst.length ? `<span>挂在玩家市场 <b>${s.lst.length}</b> 件 <button type="button" class="ar-link" data-gotab="market" data-mkv="mine">去看看</button></span>` : ''}<span>改名标签 <b>${s.tags}</b>${live() ? ` <button type="button" class="ar-link" data-store="tag" ${tl ? '' : 'disabled'}>${tl ? `买一张（${C.STORE[0].cost} 墨锭）` : '本周买满了'}</button>` : ''}</span></div>
      ${upgradeQuote.count ? `<div class="ar-upgrade-all"><div class="ar-upgrade-copy"><b>批量升级为斩数版</b><small>库存中有 ${upgradeQuote.count} 件普通饰品可升级。</small></div><div class="ar-upgrade-price"><small>原价 ${fmt(upgradeQuote.basePrice)} 墨锭 · 省 ${fmt(upgradeQuote.discount)}（20% 折扣）</small><b>${fmt(upgradeQuote.price)} 墨锭</b></div><button type="button" class="go small" data-upgrade-all ${canUpgradeAll ? '' : 'disabled'}>全部升级</button>${live() && PROF.ink < upgradeQuote.price ? '<small class="ar-upgrade-short">墨锭不足</small>' : ''}</div>` : ''}
      ${cases ? `<div class="ar-caserow">${cases}</div>` : ''}
      <div class="ar-filter">
        <select id="arInvChar" class="ar-sel"><option value="">全部侠客</option>${CHARS.map(c => `<option value="${c.id}" ${INV.char === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}</select>
        <select id="arInvTier" class="ar-sel"><option value="">全部品质</option>${C.TIERS.map(t => `<option value="${t}" ${INV.tier === t ? 'selected' : ''}>${C.TIER[t].n}</option>`).join('')}</select>
        <select id="arInvStat" class="ar-sel"><option value="">全部类型</option><option value="st" ${INV.stat === 'st' ? 'selected' : ''}>仅看斩数饰品</option><option value="norm" ${INV.stat === 'norm' ? 'selected' : ''}>仅看普通饰品</option></select>
        <select id="arInvSort" class="ar-sel">${[['new', '最新获得'], ['old', '最早获得'], ['tier', '品质最高'], ['tier_asc', '品质最低'], ['st', '斩数最多'], ['name', '按名称排序']].map(([k, n]) => `<option value="${k}" ${INV.sort === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
      </div>
      ${list.length ? `<div class="ar-grid">${list.map(x => tile(x)).join('')}</div>` : `<div class="ar-empty">${uiState('empty', s.inv.length ? '没有符合条件的饰品。' : '武库的库存还是空的。去皮肤图鉴看看所有皮肤和获取方式。')}${s.inv.length ? '' : '<button type="button" class="go small" data-gotab="codex">看皮肤图鉴</button>'}</div>`}
      ${typeof freeSkinEvent === 'function' && freeSkinEvent() ? '<p class="ar-note">限免活动只包括游戏里原有的皮肤，活动结束就收回。从武库拿到的饰品永久拥有，能在市场卖掉，开出斩数版还会记击倒数。</p>' : ''}`;
  }

  function pCodex() {
    const s = blankS();
    const owned = new Set(s.inv.map(x => x.k));
    const counts = new Map();
    for (const it of s.inv) counts.set(it.k, (counts.get(it.k) || 0) + 1);
    for (const k of s.via || []) owned.add(k);
    for (const k of PROF.skins || []) if (C.isItem(k)) owned.add(k);
    let keys = Object.keys(C.ITEM).filter(k => (!CODEX.col || C.ITEM[k].col === CODEX.col) && (!CODEX.char || C.charOf(k) === CODEX.char) && (!CODEX.tier || tierOf(k) === CODEX.tier)
      && (!CODEX.state || (CODEX.state === 'missing' ? !owned.has(k) : owned.has(k))));
    const tierRank = k => C.TIERS.indexOf(tierOf(k));
    const byName = (a, b) => skinName(a).localeCompare(skinName(b), 'zh-CN') || a.localeCompare(b);
    const sorts = {
      set: (a, b) => C.CASES.indexOf(C.ITEM[a].col) - C.CASES.indexOf(C.ITEM[b].col) || tierRank(b) - tierRank(a) || charName(a).localeCompare(charName(b), 'zh-CN') || byName(a, b),
      tier: (a, b) => tierRank(b) - tierRank(a) || byName(a, b),
      tier_asc: (a, b) => tierRank(a) - tierRank(b) || byName(a, b),
      hero: (a, b) => charName(a).localeCompare(charName(b), 'zh-CN') || tierRank(b) - tierRank(a) || byName(a, b),
      name: byName
    };
    keys.sort(sorts[CODEX.sort] || sorts.set);
    const cards = keys.map(k => {
      const it = C.ITEM[k], have = owned.has(k), cnt = counts.get(k) || 0;
      return `<button type="button" class="ar-it ar-codex-it${have ? ' owned' : ''}" data-pv="${k}" style="--tc:${tc(k)}"><img src="${art(k)}" alt="" loading="lazy">${have ? '<span class="ar-owned">已拥有</span>' : ''}<b>${it.tier === 'gold' ? '★ ' : ''}${escapeHTML(skinName(k))}</b><small>${escapeHTML(charName(k))} · ${escapeHTML(C.COLS[it.col].name)} · ${have ? (cnt ? `库存 ${cnt}` : '已获得') : C.TIER[it.tier].n}</small><i class="ar-bar"></i></button>`;
    }).join('');
    return `<div class="ar-codex-head"><div><h3>皮肤图鉴</h3><p class="ar-note">收录全部 ${Object.keys(C.ITEM).length} 款皮肤。点选查看效果、所属套装和获取方式。</p></div><b>${keys.length} 款 · ${keys.filter(k => owned.has(k)).length} 款已拥有</b></div>
      <div class="ar-filter"><select id="arCodexCol" class="ar-sel"><option value="">全部套装</option>${C.CASES.map(c => `<option value="${c}" ${CODEX.col === c ? 'selected' : ''}>${C.COLS[c].name}套装</option>`).join('')}</select>
      <select id="arCodexChar" class="ar-sel"><option value="">全部侠客</option>${CHARS.map(c => `<option value="${c.id}" ${CODEX.char === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}</select>
      <select id="arCodexTier" class="ar-sel"><option value="">全部品质</option>${C.TIERS.map(t => `<option value="${t}" ${CODEX.tier === t ? 'selected' : ''}>${C.TIER[t].n}</option>`).join('')}</select>
      <select id="arCodexState" class="ar-sel"><option value="">全部皮肤</option><option value="owned" ${CODEX.state === 'owned' ? 'selected' : ''}>已获得</option><option value="missing" ${CODEX.state === 'missing' ? 'selected' : ''}>未获得</option></select>
      <select id="arCodexSort" class="ar-sel">${[['set', '按套装'], ['tier', '品质最高'], ['tier_asc', '品质最低'], ['hero', '按侠客'], ['name', '按名称']].map(([k, n]) => `<option value="${k}" ${CODEX.sort === k ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      ${cards ? `<div class="ar-grid">${cards}</div>` : empty('没有符合筛选条件的皮肤。')}`;
  }

  // 检视：左边是会动的侠客（穿着这一件），右边是详细信息
  let INS = null;
  function inspect(it, from) {
    INS = { it, from };
    const box = $id('arIns'); box.hidden = false;
    const cv = $id('arInsCv'); cv._w = 0; cv._h = 0;
    insInfo();
  }
  // 玩家市场上这一款现在的行情（打开过市场才有）：普通版和斩数版分开算
  function mkInfo(k, st) {
    const x = MKD.items && MKD.items[k]; if (!x) return null;
    return st >= 0 ? { n: x.sn, lo: x.slo, last: x.slast, d: x.d } : { n: x.n, lo: x.lo, last: x.last, d: x.d };
  }
  const noMkt = () => MODE === 'old' ? OLD_MSG : MODE === 'offline' ? '连不上服务器，玩家市场暂时用不了。' : '玩家市场要登录云端账号、连上服务器才能用：本机存档只能开箱、熔铸，不能和别的玩家买卖。';
  function mkLine(k, st) {
    if (MODE !== 'server') return '连上服务器才看得到';
    if (MKD.err) return escapeHTML(MKD.err);
    const m = mkInfo(k, st);
    if (!MKD.items) return '正在读取…';
    if (!m || !m.n) return `现在没人在卖${m && m.last ? ` · 最近成交 ${ink(m.last)}` : ''}`;
    return `在卖 ${m.n} 件，最低 ${ink(m.lo)}${m.last ? ` · 最近成交 ${ink(m.last)}` : ''}`;
  }
  function insInfo() {
    if (!INS || !INS.it) return;
    const it = INS.it, own = INS.from === 'inv' && ST && ST.inv.some(x => x.i === it.i);
    const worn = own && ST.eq[C.charOf(it.k)] === it.i, can = live(), mk = MODE === 'server';
    const upgradeCost = C.ST_UPGRADE_COST[tierOf(it.k)], heir = C.isHeirloom(it.k), stOnly = C.isStOnly(it.k);
    const relic = SKINS[it.k] && SKINS[it.k].relic;
    const src = { case: '开箱', drop: '对局掉落', market: '玩家市场买入', legacy: '以前的绑定皮肤', trade: '熔铸契', supply: '每周补给', op: '江湖行动', term: '货郎', promo: '典藏礼遇' }[it.src] || '';
    $id('arInsInfo').innerHTML = `<span class="ar-tier" style="--tc:${tc(it.k)}">${heir ? '★ 天工传世 · 仅存斩数版' : C.TIER[tierOf(it.k)].n}</span>
      <h3>${escapeHTML(itemName(it))}</h3>${it.n ? `<p class="ar-tagname">‘${escapeHTML(it.n)}’</p>` : ''}
      <dl class="ar-dl">${it.st >= 0 ? `<dt>斩数</dt><dd><b class="ar-stn">${it.st}</b>（穿着它每击倒一个对手 +1）</dd>` : (stOnly ? '<dt>版本</dt><dd><b class="ar-stn">仅存斩数版</b>（无普通版本）</dd>' : '')}${relic ? `<dt>器艺</dt><dd>${escapeHTML(relic.craft)} · ${escapeHTML(relic.title)}</dd><dt>专属双境</dt><dd>攻境「${escapeHTML(relic.stanceAtk)}」 / 守境「${escapeHTML(relic.stanceDef)}」（实战按器灵双境键切换）</dd>` : ''}<dt>收藏品</dt><dd>${colName(it.k)}${heir ? '典藏匣' : '武器箱'}</dd>
      ${src ? `<dt>来历</dt><dd>${src}${it.t ? ' · ' + new Date(it.t).toLocaleDateString() : ''}</dd>` : ''}<dt>玩家市场</dt><dd>${mkLine(it.k, stOnly ? 0 : it.st)}</dd></dl>
      <div class="ar-insbtns">${own ? `${worn ? `<button type="button" class="ghost small" data-ins="unequip">脱下</button>` : `<button type="button" class="go small" data-ins="equip" ${can ? '' : 'disabled'}>穿上</button>`}
        ${it.st < 0 && !stOnly ? `<button type="button" class="go small" data-ins="upgrade" ${can && PROF.ink >= upgradeCost ? '' : 'disabled'}>升为斩数版 · ${fmt(upgradeCost)}墨锭</button>` : ''}
        <button type="button" class="ghost small" data-ins="list" ${can && mk ? '' : 'disabled'}${mk ? '' : ' title="玩家市场要连上服务器才能用"'}>挂到市场</button>
        <button type="button" class="ghost small" data-ins="rename" ${can ? '' : 'disabled'}>改名${ST.tags ? `（标签 ${ST.tags}）` : ''}</button>` : ''}
        ${INS.from === 'pv' ? '<button type="button" class="go small" data-ins="cases">去所属套装</button>' : `<button type="button" class="ghost small" data-ins="market">这款的行情</button>`}<button type="button" class="ghost small" data-ins="close">关闭</button></div>
      <p class="ar-note">${INS.from === 'pv' ? (heir ? '《天工传世 · 器灵纪》至臻典藏，仅存斩数版，穿戴即解锁实战攻守双境。仅可由天工传世匣或玩家市场取得，货郎与熔铸契不产出。' : `属于「${colName(it.k)}」套装。可从对应武器箱获得，也能通过玩家市场、熔铸契或货郎取得。`) : `玩家市场只在玩家之间买卖：标价你自己定，卖给别的玩家，成交扣 ${Math.round(C.cv(CF(), 'fee') * 100)}% 手续费。武库不收购饰品。`}</p>`;
    if (mk && !MKD.items && !MKD.err) loadMarket().then(fresh => { if (fresh && INS && INS.it === it) insInfo(); });
  }
  function closeIns() { $id('arIns').hidden = true; INS = null; }
  async function insAction(a) {
    const it = INS && INS.it; if (!it) return;
    if (a === 'close') { closeIns(); return; }
    if (a === 'market') { closeIns(); marketItem(it.k); return; }
    if (a === 'cases') { closeIns(); TAB = 'cases'; render(); $id('arMain').scrollTop = 0; return; }
    if (a === 'equip') { const r = await act('equip', { i: it.i }); if (r && r.ok) { SFX.slice && SFX.slice(); toast(`已穿上「${skinName(it.k)}」`); if (INS) insInfo(); render(); } return; }
    if (a === 'unequip') { const r = await act('unequip', { char: C.charOf(it.k) }); if (r && r.ok) { if (INS) insInfo(); render(); } return; }
    if (a === 'upgrade') {
      const cost = C.ST_UPGRADE_COST[tierOf(it.k)];
      confirmBox('升级为斩数版', `花 ${ink(cost)} 把「${escapeHTML(itemName(it))}」升级成斩数版？升级后从 0 斩开始，保留这件饰品的编号和名字，不能退回普通版。`, '确认升级', async () => {
        const r = await act('upgradeSt', { i: it.i });
        if (r && r.ok) { SFX.chargeFull && SFX.chargeFull(); toast(`已升级为斩数版，花了 ${fmt(r.price)} 墨锭`); if (INS) INS.it = ST.inv.find(x => x.i === it.i) || it; render(); if (INS) insInfo(); }
      });
      return;
    }
    if (a === 'list') { listBox(it); return; }
    if (a === 'rename') renameBox(it);
  }
  function renameBox(it) {
    const tl = tagLeft(ST);
    modal(`<h3>改名标签</h3><p>给「${escapeHTML(itemName(it))}」起个名字（最多 12 个字），用掉 1 张改名标签。留空就是去掉名字（不用标签）。</p>
      <input id="arName" class="ar-input" maxlength="12" value="${escapeHTML(it.n || '')}" autocomplete="off" spellcheck="false">
      <div class="row">${ST.tags < 1 ? `<button class="ghost small" id="arTagBuy" ${tl ? '' : 'disabled'}>${tl ? `买一张标签 ${ink(C.STORE[0].cost)}` : '本周的标签买满了'}</button>` : ''}<button class="go small" id="arNameGo">确定</button><button class="ghost small" data-ar-close>取消</button></div>`);
    $id('arName').addEventListener('keydown', e => { if (e.key !== 'Escape') e.stopPropagation(); });
    if ($id('arTagBuy')) $id('arTagBuy').addEventListener('click', async () => { const name = $id('arName').value; if (await buyTag()) { renameBox(it); $id('arName').value = name; } });
    $id('arNameGo').addEventListener('click', async () => { const r = await act('rename', { i: it.i, name: $id('arName').value }); if (r && r.ok) { closeModal(); if (INS) { INS.it = ST.inv.find(x => x.i === it.i) || it; insInfo(); } render(); } });
  }
  async function buyTag() { const r = await act('store', { id: 'tag' }); if (r && r.ok) { SFX.wood && SFX.wood(); toast('改名标签 +1'); render(); return true; } return false; }
  function listBox(it) {   // 挂到玩家市场：卖多少自己定（默认比现在最低的便宜 1，没人卖就按最近成交价）
    const m = mkInfo(it.k, it.st), sug = m && m.n && m.lo ? Math.max(1, m.lo - 1) : m && m.last ? m.last : C.refVal(it);
    const now = m ? `${m.n ? `现在在卖 ${m.n} 件，最低 ${ink(m.lo)}` : '现在没人在卖这款'}${m.last ? `，最近一次成交 ${ink(m.last)}` : ''}${it.st >= 0 ? '（都只算斩数版）' : ''}。` : '这款还没人在玩家市场上卖过，标价可以参考同一档的其他饰品。';
    modal(`<h3>挂到玩家市场</h3><p>「${escapeHTML(itemName(it))}」卖多少由你定。别的玩家买走以后扣 ${Math.round(C.cv(CF(), 'fee') * 100)}% 手续费，剩下的自动到账；挂着的时候随时能撤下。</p>
      <p class="ar-note">${now}</p>
      <div class="ar-listrow"><input id="arPrice" class="ar-input" type="number" min="1" max="${C.PRICE_MAX}" step="1" value="${sug}"><span id="arEta" class="ar-note"></span></div>
      <div class="row"><button class="go small" id="arListGo">挂上去</button><button class="ghost small" data-ar-close>取消</button></div>`);
    const eta = () => {
      const v = Math.floor(+$id('arPrice').value || 0), ok = v >= 1 && v <= C.PRICE_MAX;
      $id('arEta').innerHTML = !ok ? `标价要在 1 到 ${fmt(C.PRICE_MAX)} 之间` : `卖掉到手 ${ink(C.net(v, CF()))}${m && m.n && m.lo && v > m.lo * 1.5 ? ' · 比在卖最便宜的贵不少，可能要等一阵' : ''}`;
      $id('arListGo').disabled = !ok;
    };
    $id('arPrice').addEventListener('input', eta); $id('arPrice').addEventListener('keydown', e => { if (e.key !== 'Escape') e.stopPropagation(); }); eta();
    $id('arListGo').addEventListener('click', async () => {
      const price = Math.floor(+$id('arPrice').value || 0), r = await act('list', { i: it.i, price });
      if (r && r.ok) { closeModal(); closeIns(); MKD.at = 0; SFX.wood && SFX.wood(); toast('已挂到玩家市场，有人买走会通知你'); render(); }
    });
  }
  function buyBox(k) {   // 商店：武器箱、货郎按固定价格买，一次 1~10 个
    const p = C.shopPrice(k, CF()); let n = 1;
    if (!p) return;
    modal(`<div class="ar-mkhead" style="--tc:${goodCol(k)}">${goodIcon(k).replace(' sm', '')}<div><h3>买${goodName(k)}</h3><p class="ar-note">商店价 ${ink(p)} 一个，不限量${k === 'term' ? '' : C.COLS[k].prem ? (C.COLS[k].daily ? ` · 每天能开 ${C.cv(CF(), C.COLS[k].lim)} 个` : ` · 每周能开 ${C.cv(CF(), C.COLS[k].lim)} 个`) : ` · 普通武器箱每天一共能开 ${C.cv(CF(), 'openDay')} 个`}。买来的不能转卖。</p></div></div>
      <div class="ar-qty"><button type="button" class="ghost small" data-q="-1" aria-label="少买一个">−</button><b id="arQty">1</b><button type="button" class="ghost small" data-q="1" aria-label="多买一个">+</button><span class="ar-qtot">合计 <span id="arTot"></span></span></div>
      <p class="ar-note">你现在有 ${ink(PROF.ink || 0)}</p>
      <div class="row"><button class="go small" id="arBuyGo">买下</button><button class="ghost small" data-ar-close>取消</button></div>`);
    const draw = () => {
      const tot = p * n, have = Math.floor(PROF.ink || 0);
      $id('arQty').textContent = n;
      $id('arTot').innerHTML = `${ink(tot)}${tot > have ? ' <span class="ar-err">墨锭不够</span>' : ''}`;
      $id('arBuyGo').disabled = tot > have;
    };
    for (const b of $id('arModal').querySelectorAll('[data-q]')) b.addEventListener('click', () => { n = Math.max(1, Math.min(10, n + +b.dataset.q)); draw(); });
    draw();
    $id('arBuyGo').addEventListener('click', async () => {
      const r = await act(k === 'term' ? 'buyTerm' : 'buyCase', k === 'term' ? { n } : { c: k, n });
      if (r && r.ok) { closeModal(); SFX.wood && SFX.wood(); toast(`买到了：${goodName(k)} ×${r.n}（${fmt(r.price)} 墨锭）`); render(); }
    });
  }

  // 武器箱
  const goodName = k => k === 'term' ? '货郎' : `${C.COLS[k].name}武器箱`;
  const goodHave = (s, k) => k === 'term' ? s.term : s.cases[k] || 0;
  const pips = (n, max) => Array.from({ length: Math.min(20, max) }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('');
