/* =====================================================================
   刃影武库：CS 那样的皮肤系统
   ---------------------------------------------------------------------
   库存（磨损度、图案模板、斩数计数、改名标签）、武器箱开箱、江湖市场（每天浮动的价格、挂单）、
   汰换合同、对局掉落、每周补给、江湖行动。规则都在 armory-core.js，这里只管页面和接到游戏里。
   两种模式：
     云端账号 + 新版服务器：开箱、买卖、汰换都交给服务器算，随机数也在服务器上取，本机只显示结果。
     其他情况（本机账号、服务器还没升级）：在本机按同一套规则算，存档带校验，被改过就作废。
   只卖外观和便利：皮肤只换样子和特效，侠客强度不变。
   ===================================================================== */
(function () {
  'use strict';
  const C = window.ArmoryCore;
  if (!C || typeof PROF === 'undefined' || typeof SKINS === 'undefined') return;
  if (typeof OFFLINE_BUILD !== 'undefined' && OFFLINE_BUILD) return;   // 离线版没有武库（也不把武库皮肤放进图鉴）
  // 开局就记下原生的取时间、取随机数、云端接口，后面有人在控制台换掉也不影响这里
  const NOW = Date.now.bind(Date);
  const GRV = crypto.getRandomValues.bind(crypto);
  const CS = window.CloudSave || null;
  const ECON = CS && CS.econ, LSYNC = CS && CS.ledgerSync, FLUSH = CS && CS.flushNow;
  const GRANT = CS && CS.inkGrantKey ? CS.inkGrantKey() || (() => {}) : () => {};   // 反作弊认的入账：只有这里能记
  const rnd = () => { const a = new Uint32Array(2); GRV(a); return (a[0] * 2097152 + (a[1] >>> 11)) / 9007199254740992; };
  const LOCAL_SANDBOX = true;   // 本机模式的模拟充值（服务器模式由服务器的 ECON_SANDBOX 决定）

  /* ---------- 新皮肤：20 款涂装、3 款 ★ ---------- */
  for (const [k, char, name, look] of C.PAINTS) SKINS[k] = { char, rarity: 'rare', name, cs: 'paint', look: { ...look } };
  for (const [k, d] of Object.entries(C.STARS)) {
    SKINS[k] = { char: d.char, rarity: 'legend', name: d.name, cs: 'star', look: { ...d.look }, deco: JSON.parse(JSON.stringify(d.deco)), fx: { ...d.fx } };
    SCENES[k] = JSON.parse(JSON.stringify(d.scene));
  }
  HAMMER_LOOK.frost_hammer = { chain: ['#3a5a7a', '#cfeaff'], head: '#e4f2ff', band: '#7fd4ff', crack: '150,220,255', spikes: '#9fc8e8' };
  SKIN_WEAP.moon_gourd = W => {   // 醉月：银白葫芦，腰上一弯新月，口上冒一缕月光
    const G = gourdParts(W); if (!G) return;
    const { top, bot, mid } = G;
    const fillG = (c, r) => { const q = ctx.createRadialGradient(c[0] - r * 0.3, c[1] - r * 0.3, 1, c[0], c[1], r); q.addColorStop(0, '#ffffff'); q.addColorStop(0.6, '#b8c4ff'); q.addColorStop(1, '#4a5694'); ctx.fillStyle = W.flash ? '#fff' : q; circle(c, r); };
    fillG(bot, 8.5); fillG(top, 5.5);
    if (!W.live) return;
    ctx.fillStyle = '#2a3460'; ctx.fillRect(mid[0] - 3.5, mid[1] - 1.2, 7, 2.4);
    ctx.fillStyle = '#f4f6ff'; ctx.beginPath(); ctx.arc(bot[0] + 1, bot[1], 4.2, 0.6, 5.2); ctx.arc(bot[0] + 2.6, bot[1] - 0.6, 3.4, 5.0, 0.8, true); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    const ph = (W.T * 0.7) % 1;
    W.glow([top[0], top[1] - 6 - ph * 10], 6, '190,205,255', 0.55 * (1 - ph));
  };
  SKIN_WEAP.renying_blade = W => {   // 刃影：乌钢长刀，刃口一线朱红，刀尖滴墨
    const { P, poly, bar, live, t, T, hl } = W;
    bar(hl, W.g, 4.5, '#120c0c');
    poly([P(0, -2.6), P(0.86, -3), t, P(0.9, 1.4), P(0, 2.4)], W.lg(W.g, t, [[0, '#1a1416'], [0.7, '#2c2224'], [1, '#463638']]));
    poly([P(0.02, -6), P(-0.04, -7.2), P(-0.04, 7.2), P(0.02, 6)], '#3a1a1c');
    if (!live) return;
    ctx.strokeStyle = `rgba(255,70,60,${0.7 + Math.sin(T * 6) * 0.2})`; ctx.lineWidth = 1.2; line(P(0.05, -2.4), P(0.86, -2.8));
    ctx.globalCompositeOperation = 'lighter'; W.glow(t, 8, '255,70,60', 0.45);
    ctx.globalCompositeOperation = 'source-over';
    const ph = (T * 0.9) % 1; ctx.fillStyle = `rgba(10,6,6,${0.9 - ph * 0.6})`; circle([t[0], t[1] + ph * 16], 1.6 - ph * 0.6);
  };

  /* ---------- 磨损：越旧颜色越灰暗；涂装的图案模板会让色调偏一点 ---------- */
  let FORCE = null;   // 画某一件的卡面时临时指定用哪一件的磨损
  const wearAmt = f => f < 0.07 ? 0 : 0.1 + 0.62 * Math.pow((f - 0.07) / 0.93, 0.85);
  const hueOf = (k, p) => SKINS[k] && SKINS[k].cs === 'paint' ? (((p * 37) % 41) - 20) * 1.1 : 0;
  function rgbOf(c) {
    if (typeof c !== 'string') return null;
    let m = c.match(/^#([0-9a-f]{6})$/i); if (m) { const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255, 'hex']; }
    m = c.match(/^(\d+),\s*(\d+),\s*(\d+)$/); if (m) return [+m[1], +m[2], +m[3], 'rgb'];
    return null;
  }
  function hueRot(r, g, b, deg) {
    const a = deg * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a);
    const m = [0.213 + cs * 0.787 - sn * 0.213, 0.715 - cs * 0.715 - sn * 0.715, 0.072 - cs * 0.072 + sn * 0.928,
      0.213 - cs * 0.213 + sn * 0.143, 0.715 + cs * 0.285 + sn * 0.140, 0.072 - cs * 0.072 - sn * 0.283,
      0.213 - cs * 0.213 - sn * 0.787, 0.715 - cs * 0.715 + sn * 0.715, 0.072 + cs * 0.928 + sn * 0.072];
    return [r * m[0] + g * m[1] + b * m[2], r * m[3] + g * m[4] + b * m[5], r * m[6] + g * m[7] + b * m[8]];
  }
  function tint(c, w, hue) {
    const v = rgbOf(c); if (!v) return c;
    let [r, g, b] = v;
    if (hue) [r, g, b] = hueRot(r, g, b, hue);
    if (w) {
      const y = 0.3 * r + 0.59 * g + 0.11 * b;
      r += (y - r) * w * 0.65; g += (y - g) * w * 0.65; b += (y - b) * w * 0.65;
      r += (96 - r) * w * 0.3; g += (86 - g) * w * 0.3; b += (72 - b) * w * 0.3;
      const k = 1 - w * 0.16; r *= k; g *= k; b *= k;
    }
    const q = x => Math.max(0, Math.min(255, Math.round(x)));
    return v[3] === 'hex' ? '#' + ((1 << 24) | (q(r) << 16) | (q(g) << 8) | q(b)).toString(16).slice(1) : `${q(r)},${q(g)},${q(b)}`;
  }
  const deepTint = (o, w) => Array.isArray(o) ? o.map(x => deepTint(x, w)) : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, deepTint(v, w)])) : tint(o, w, 0);
  function wearOf(ci, k) {
    if (!k || !C.isItem(k)) return null;
    if (FORCE && FORCE.k === k) return FORCE;
    if (!ST || !CHARS[ci]) return null;
    const eqId = ST.eq[CHARS[ci].id];
    let it = eqId ? ST.inv.find(x => x.i === eqId && x.k === k) : null;
    if (!it) for (const x of ST.inv) if (x.k === k && (!it || x.f < it.f)) it = x;
    return it;
  }
  const baseSkinLook = skinLook;
  skinLook = function (ci, skin) {
    const L = baseSkinLook(ci, skin), it = wearOf(ci, skin);
    if (!it) return L;
    const w = wearAmt(it.f), hue = hueOf(it.k, it.p);
    if (!w && !hue) return L;
    const out = { ...L };
    for (const key of ['body', 'shade', 'scarf']) out[key] = tint(L[key], w, hue);
    for (const key of ['slash', 'blade']) out[key] = tint(L[key], w * 0.5, hue);
    if (L.deco) out.deco = deepTint(L.deco, w);
    return out;
  };
  window.skinLook = skinLook;

  /* ---------- 状态 ---------- */
  let ST = null, MODE = 'none', UID = '', BUSY = false, TAB = 'inv', SIG = '', TK = 0, LOADING = null;
  const SALT = 'ry-armory|v1|';
  const sigOf = s => C.hash32(SALT + UID + '|' + JSON.stringify(s)).toString(36) + C.hash32(JSON.stringify(s) + '|' + UID + SALT).toString(36);
  const user = () => (window.CloudSave && CloudSave.getUser && CloudSave.getUser()) || null;
  const cloudOn = () => { const u = user(); return !!(u && u.isCloud && ECON); };
  const live = () => !!ST && (MODE === 'server' || MODE === 'local');   // 现在能不能开箱、买卖
  const envBase = () => ({ now: NOW(), rnd, uid: UID, ink: Math.max(0, Math.floor(PROF.ink || 0)), skins: (PROF.skins || []).slice(), equip: { ...(PROF.equip || {}) }, owned: (PROF.owned || []).slice(), sandbox: LOCAL_SANDBOX, server: false });
  function strike(reason) { try { if (typeof acStrike === 'function') acStrike(reason); } catch (e) {} }
  // 存档里的武库数据只能通过这里读写：读出去的是一份副本（改了也没用），写进来要过校验
  Object.defineProperty(PROF, 'armory', {
    configurable: false, enumerable: true,
    get() { return ST && MODE === 'local' ? Object.assign(JSON.parse(JSON.stringify(ST)), { sig: SIG }) : undefined; },
    set(v) { loadLocal(v); },
  });
  let LOCAL_V;   // 云端账号存档里带的武库数据：只在服务器还没升级（不认武库）时才用
  function loadLocal(v, force) {
    const u = user(); UID = u ? String(u.uid || u.name || '') : '';
    if (!u || PROF.guest) { ST = null; MODE = 'none'; return; }
    if (cloudOn() && !force && MODE !== 'local') {   // 云端账号先等服务器回话（connect），这期间什么都不能做，免得本机和服务器各记一笔
      LOCAL_V = v;
      if (MODE !== 'server') { ST = null; MODE = 'wait'; }
      return;
    }
    let s = null;
    if (v && typeof v === 'object') {
      const { sig, ...rest } = v;
      if (sig && sig === sigOf(rest)) s = rest;
      else if (Object.keys(rest).length) { console.warn('武库存档校验不过，已作废'); strike('武库存档被改过'); }
    }
    ST = C.normalize(s || C.blank(), envBase());
    SIG = sigOf(ST);
    MODE = 'local';
  }
  async function connect(force) {   // 云端账号先问服务器支不支持武库；支持就由服务器管
    const u = user();
    if (!u || PROF.guest) { ST = null; MODE = 'none'; return; }
    UID = String(u.uid || u.name || '');
    if (!cloudOn()) { if (!ST) loadLocal(undefined); MODE = 'local'; return; }
    if (MODE === 'server' && !force) return;
    if (LOADING) return LOADING;
    LOADING = (async () => {
      try {
        const out = await ECON('sync', {});
        MODE = 'server'; ECON_INFO = out.info || ECON_INFO; apply(out, true);
      } catch (e) {
        if (e && e.status === 404) { if (MODE !== 'local') loadLocal(LOCAL_V, true); }   // 服务器还是旧版：先用本机规则
        else if (e && e.status === 409) { /* 账号刚切换，等新账号的存档 */ }
        else { if (MODE !== 'server') { ST = null; MODE = 'offline'; } msg('连不上服务器，武库暂时只能看'); }
      } finally { LOADING = null; }
    })();
    return LOADING;
  }
  // 动作结果落地：存档、墨锭、可穿的皮肤、穿着
  // 穿着的那几件磨损变了（第一次拿到库存、换穿、汰换）就把首页角色、头像、场上侠客重画一遍
  let LOOK = '';
  function refreshLooks(force) {
    const sig = ST ? Object.values(ST.eq).map(id => { const it = ST.inv.find(x => x.i === id); return it ? `${it.k}|${it.f}|${it.p}` : ''; }).join(',') : '';
    if (!force && sig === LOOK) return;
    LOOK = sig;
    try {
      if (PORTRAITS.length) { PORTRAITS.length = 0; ensurePortraits(); }
      if (menuHeroId >= 0) { MENU_HERO = null; setMenuHero(menuHeroId); }
      applySkins();
    } catch (e) {}
  }
  function apply(out, quiet) {
    if (!out) return;
    if (out.state) { ST = C.normalize(out.state, envBase()); SIG = sigOf(ST); }
    const ink0 = Math.floor(PROF.ink || 0);
    let ink1 = ink0;
    if (MODE === 'server' && out.ledger && LSYNC) ink1 = LSYNC(out.ledger, ink0);   // 服务器的账 + 本机还没报上去的
    else if (MODE !== 'server' && typeof out.ink === 'number') ink1 = out.ink;
    if (ink1 > ink0) GRANT(ink1 - ink0);
    PROF.ink = ink1;
    let own = false;
    if (Array.isArray(out.skins)) { PROF.skins = out.skins.slice(); own = true; }
    if (out.skinsAdd || out.skinsDel) { const set = new Set(PROF.skins || []); for (const k of out.skinsAdd || []) set.add(k); for (const k of out.skinsDel || []) set.delete(k); PROF.skins = Array.from(set); own = true; }
    if (out.equip && typeof out.equip === 'object') { PROF.equip = PROF.equip || {}; for (const [c, k] of Object.entries(out.equip)) { if (k === null) delete PROF.equip[c]; else PROF.equip[c] = k; } own = true; }
    if (out.sold && out.sold.length && !quiet) for (const x of out.sold) toast(`挂单卖出：${itemName({ k: x.k, st: -1 })}，到账 ${x.gain} 墨锭`);
    if (own && PORTRAITS.length) { PORTRAITS.length = 0; ensurePortraits(); }
    try { localStorage.setItem('renying-equip', JSON.stringify(PROF.equip || {})); } catch (e) {}
    if (window.CloudSave) CloudSave.saveProfile(PROF);
    baseApply(PROF);
    refreshLooks(false);
    for (const el of document.querySelectorAll('.gInk')) el.textContent = PROF.ink;
  }
  const patchOf = (env, skins0, equip0) => {
    const a = new Set(skins0), b = new Set(env.skins), eq = {};
    for (const k of new Set([...Object.keys(equip0), ...Object.keys(env.equip)])) if (equip0[k] !== env.equip[k]) eq[k] = env.equip[k] === undefined ? null : env.equip[k];
    return { skinsAdd: [...b].filter(k => !a.has(k)), skinsDel: [...a].filter(k => !b.has(k)), equip: eq };
  };
  async function act(name, args, opt = {}) {
    if (!opt.bg && BUSY) return null;
    if (MODE === 'wait') { msg('正在连接服务器，稍等一下'); return null; }
    if (MODE === 'offline') { msg('连不上服务器，等联网了再试'); await connect(true); if (MODE !== 'server') return null; }
    if (MODE === 'none' || !ST) { msg('登录之后才能用武库'); return null; }
    if (!opt.bg) { BUSY = true; busyUi(true); }
    try {
      let out;
      if (MODE === 'server') {
        try {
          if (FLUSH && !opt.bg) await Promise.race([FLUSH().catch(() => {}), new Promise(r => setTimeout(r, 3000))]);   // 先把本机的存档变化报上去，免得两边对不上
          out = await ECON(name, args || {});
        } catch (e) {
          if (!opt.bg) msg(e && e.message ? e.message : '服务器出错了');
          if (e && e.ban && typeof acRefresh === 'function') acRefresh();
          return null;
        }
      } else {
        const env = envBase(), skins0 = env.skins.slice(), equip0 = { ...env.equip };
        const r = C.run(ST, name, args || {}, env);
        out = { res: r.res, state: r.state, ink: env.ink, sold: r.sold, ...patchOf(env, skins0, equip0) };
      }
      apply(out, opt.bg);
      const res = out.res || {};
      if (res.err && !opt.bg) msg(res.err);
      return res;
    } finally { if (!opt.bg) { BUSY = false; busyUi(false); } }
  }

  /* ---------- 名字、价格、卡面 ---------- */
  const tierOf = k => C.ITEM[k] ? C.ITEM[k].tier : 'mil';
  const charName = k => { const c = CHARS[CHAR_IDX[C.charOf(k)]]; return c ? c.name : ''; };
  const skinName = k => (SKINS[k] && SKINS[k].name) || k;
  function itemName(it, plain) {
    const star = tierOf(it.k) === 'gold' ? '★ ' : '', stp = it.st >= 0 ? '斩数 · ' : '';
    return `${star}${stp}${charName(it.k)} | ${skinName(it.k)}${plain || it.f === undefined ? '' : `（${C.wearName(it.f)}）`}`;
  }
  const tc = k => C.TIER[tierOf(k)].c;
  const today = () => C.day(NOW());
  const ART = new Map();
  function art(it) {
    const w = Math.round(wearAmt(it.f || 0) * 10), h = Math.round(hueOf(it.k, it.p || 0)), key = `${it.k}|${w}|${h}`;
    if (ART.has(key)) return ART.get(key);
    let url = '';
    try { FORCE = { k: it.k, f: it.f || 0, p: it.p || 0 }; url = makeCardArt(CHAR_IDX[C.charOf(it.k)], 150, 200, it.k).toDataURL('image/jpeg', 0.86); }
    catch (e) {} finally { FORCE = null; }
    ART.set(key, url); return url;
  }
  const fmt = n => Math.round(n).toLocaleString();
  const ink = n => `<span class="ar-cur ar-ink"><i>墨</i>${fmt(n)}</span>`;
  const jadeC = n => `<span class="ar-cur ar-jade"><i>玉</i>${fmt(n)}</span>`;
  function msg(t) { const el = $id('arMsg'); if (el && $id('armory').classList.contains('on')) { el.textContent = t; clearTimeout(msg.tm); msg.tm = setTimeout(() => { el.textContent = ''; }, 4500); } else toast(t); }
  function busyUi(on) { const m = $id('armory'); if (m) m.classList.toggle('ar-busy', on); }
  const seenKey = () => 'renying-arm-seen-' + UID;
  const seenAt = () => { try { return +localStorage.getItem(seenKey()) || 0; } catch (e) { return 0; } };
  const markSeen = () => { try { localStorage.setItem(seenKey(), String(NOW())); } catch (e) {} };

  /* ---------- 弹窗 ---------- */
  function modal(html, cls = '') { const m = $id('arModal'); m.innerHTML = `<div class="ar-box ${cls}">${html}</div>`; m.hidden = false; return m; }
  function closeModal() { const m = $id('arModal'); m.hidden = true; m.innerHTML = ''; REEL.on = false; }
  function confirmBox(title, body, okText, fn) {
    modal(`<h3>${title}</h3><p>${body}</p><div class="row"><button class="go small" id="arOk">${okText}</button><button class="ghost small" data-ar-close>取消</button></div>`);
    $id('arOk').addEventListener('click', async () => { closeModal(); await fn(); });
  }
  function tile(it, extra = '') {
    const eq = ST && Object.values(ST.eq).includes(it.i), fresh = it.t && it.t > seenAt() && it.i;
    return `<button type="button" class="ar-it${eq ? ' eq' : ''}" style="--tc:${tc(it.k)}" ${it.i ? `data-it="${it.i}"` : ''} ${extra}>
      <img src="${art(it)}" alt="" loading="lazy">${it.st >= 0 ? `<span class="ar-st">斩数 ${it.st}</span>` : ''}${eq ? '<span class="ar-eq">穿着</span>' : ''}${fresh ? '<span class="ar-new">新</span>' : ''}
      <b>${tierOf(it.k) === 'gold' ? '★ ' : ''}${escapeHTML(skinName(it.k))}</b><small>${charName(it.k)}${it.f !== undefined ? ' · ' + C.wearShort(it.f) : ''}${it.n ? ` · ‘${escapeHTML(it.n)}’` : ''}</small><i class="ar-bar"></i></button>`;
  }

  /* ---------- 页面 ---------- */
  const TABS = [['inv', '库存'], ['cases', '武器箱'], ['market', '江湖市场'], ['trade', '汰换合同'], ['op', '江湖行动'], ['store', '商店']];
  function dots() {
    if (!ST || MODE === 'none') return {};
    const d = {};
    d.inv = ST.inv.some(x => x.t > seenAt());
    d.op = (ST.drop.g >= C.SUPPLY_GAMES && !ST.drop.sup) || ST.op.ms.some((m, i) => !ST.op.done.includes(i) && (ST.op.prog[i] || 0) >= m.n);
    d.cases = !ST.gift || (ST.keys > 0 && C.CASES.some(c => ST.cases[c] > 0));
    d.any = d.inv || d.op || d.cases;
    return d;
  }
  function render() {
    if (!$id('armory')) return;
    const d = dots();
    $id('arJade').textContent = ST ? fmt(ST.jade) : 0; $id('arKeys').textContent = ST ? ST.keys : 0;
    for (const el of document.querySelectorAll('.gInk')) el.textContent = PROF.ink;
    $id('arTabs').innerHTML = TABS.map(([k, n]) => `<button type="button" data-tab="${k}" class="${k === TAB ? 'sel' : ''}">${n}${d[k] ? '<i class="ar-dot"></i>' : ''}</button>`).join('');
    const banner = MODE === 'none' ? '<p class="ar-banner">登录之后才能开箱、交易。先逛逛看吧。</p>'
      : MODE === 'wait' ? '<p class="ar-banner soft">正在连接服务器…</p>'
      : MODE === 'offline' ? '<p class="ar-banner">连不上服务器，武库暂时只能看。</p>'
      : MODE === 'local' && cloudOn() ? '<p class="ar-banner soft">测试期：武库数据先存在你的存档里，服务器版上线后由服务器统一保管（到时会重新发新手礼）。</p>' : '';
    const R = { inv: pInv, cases: pCases, market: pMarket, trade: pTrade, op: pOp, store: pStore }[TAB] || pInv;
    $id('arMain').innerHTML = banner + R();
    if (TAB === 'inv') markSeenSoon();
    renderTopNav();
  }
  let seenTm = 0;
  function markSeenSoon() { clearTimeout(seenTm); seenTm = setTimeout(() => { if (TAB === 'inv' && $id('armory').classList.contains('on')) markSeen(); }, 2500); }
  function blankS() { return ST || C.normalize(C.blank(), { now: NOW(), uid: '', owned: [] }); }

  // 库存
  const INV = { char: '', tier: '', sort: 'new' };
  function invValue(s) { const d = today(); return s.inv.reduce((a, x) => a + C.price(x, d), 0); }
  function legacySkins(s) { return (PROF.skins || []).filter(k => SKINS[k] && !s.via.includes(k) && !s.inv.some(x => x.k === k) && !(OFFLINE_BUILD || DEV_SESSION_UNLOCKED)); }
  function pInv() {
    const s = blankS(), d = today();
    let list = s.inv.filter(x => (!INV.char || C.charOf(x.k) === INV.char) && (!INV.tier || tierOf(x.k) === INV.tier));
    const tr = x => C.TIERS.indexOf(tierOf(x.k));
    const sorts = { new: (a, b) => b.i - a.i, tier: (a, b) => tr(b) - tr(a) || b.i - a.i, price: (a, b) => C.price(b, d) - C.price(a, d), wear: (a, b) => a.f - b.f };
    list = list.slice().sort(sorts[INV.sort] || sorts.new);
    const cases = C.CASES.filter(c => s.cases[c] > 0).map(c => `<button type="button" class="ar-caseitem" data-gotab="cases" style="--cc:${C.COLS[c].col}"><span class="ar-emb">${C.COLS[c].emblem}</span><b>${C.COLS[c].name}武器箱</b><small>×${s.cases[c]}</small></button>`).join('');
    const legacy = legacySkins(s);
    return `<div class="ar-sum"><span>饰品 <b>${s.inv.length}</b> / ${C.INV_MAX}</span><span>库存估值 ${ink(invValue(s))}</span><span>钥匙 <b>${s.keys}</b></span><span>改名标签 <b>${s.tags}</b></span></div>
      ${cases ? `<div class="ar-caserow">${cases}</div>` : ''}
      <div class="ar-filter">
        <select id="arInvChar" class="ar-sel"><option value="">全部侠客</option>${CHARS.map(c => `<option value="${c.id}" ${INV.char === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}</select>
        <select id="arInvTier" class="ar-sel"><option value="">全部品质</option>${C.TIERS.map(t => `<option value="${t}" ${INV.tier === t ? 'selected' : ''}>${C.TIER[t].n}</option>`).join('')}</select>
        <select id="arInvSort" class="ar-sel">${[['new', '最新获得'], ['tier', '品质最高'], ['price', '最值钱'], ['wear', '磨损最低']].map(([k, n]) => `<option value="${k}" ${INV.sort === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
      </div>
      ${list.length ? `<div class="ar-grid">${list.map(x => tile(x)).join('')}</div>` : `<div class="ar-empty"><p>${s.inv.length ? '没有符合条件的饰品。' : '库存还是空的。打对局有机会掉落，或者去开箱、逛市场。'}</p>${s.inv.length ? '' : '<button type="button" class="go small" data-gotab="cases">去开箱</button>'}</div>`}
      ${legacy.length ? `<h4 class="ar-h">问剑阁得到的皮肤 <small>绑定账号，不能出售和汰换</small></h4><div class="ar-grid sm">${legacy.map(k => `<div class="ar-it bound" style="--tc:${SKINS[k].rarity === 'legend' ? '235,75,75' : '136,71,255'}"><img src="${art({ k, f: 0, p: 0 })}" alt="" loading="lazy"><b>${escapeHTML(SKINS[k].name)}</b><small>${charName(k)} · 绑定</small><i class="ar-bar"></i></div>`).join('')}</div>` : ''}
      ${typeof freeSkinEvent === 'function' && freeSkinEvent() ? '<p class="ar-note">限免活动只包括原来的皮肤。武库里的饰品要开箱、掉落或在市场买到，永久拥有，带磨损和斩数，能在市场卖掉。</p>' : ''}`;
  }

  // 检视：左边是会动的侠客（穿着这一件），右边是详细信息
  let INS = null;
  function inspect(it, from) {
    INS = { it, from };
    const box = $id('arIns'); box.hidden = false;
    const cv = $id('arInsCv'); cv._w = 0; cv._h = 0;
    insInfo();
  }
  function insInfo() {
    const it = INS.it, own = INS.from === 'inv' && ST && ST.inv.some(x => x.i === it.i), d = today(), price = C.price(it, d), ci = CHAR_IDX[C.charOf(it.k)];
    const worn = own && ST.eq[C.charOf(it.k)] === it.i, idx = C.wearIdx(it.f), lucky = C.LUCKY.includes(it.p), col = C.COLS[C.ITEM[it.k].col];
    const can = live();
    const src = { case: '开箱', drop: '对局掉落', market: '市场买入', trade: '汰换合同', supply: '每周补给', op: '江湖行动' }[it.src] || '';
    $id('arInsInfo').innerHTML = `<span class="ar-tier" style="--tc:${tc(it.k)}">${C.TIER[tierOf(it.k)].n}</span>
      <h3>${escapeHTML(itemName(it, true))}</h3>${it.n ? `<p class="ar-tagname">‘${escapeHTML(it.n)}’</p>` : ''}
      <div class="ar-wearbar"><i style="left:${it.f * 100}%"></i></div>
      <dl class="ar-dl"><dt>磨损</dt><dd>${C.WEAR[idx][1]} · ${it.f.toFixed(9)}</dd><dt>图案模板</dt><dd>#${it.p}${lucky ? ' <b class="ar-lucky">稀有图案</b>' : ''}</dd>
      ${it.st >= 0 ? `<dt>斩数计数</dt><dd>${it.st}（穿着它每拿下一回合 +1）</dd>` : ''}<dt>收藏品</dt><dd>${col.name}收藏品</dd>
      ${src ? `<dt>来历</dt><dd>${src}${it.t ? ' · ' + new Date(it.t).toLocaleDateString() : ''}</dd>` : ''}<dt>市场价</dt><dd>${ink(price)}</dd></dl>
      <div class="ar-insbtns">${own ? `${worn ? `<button type="button" class="ghost small" data-ins="unequip">脱下</button>` : `<button type="button" class="go small" data-ins="equip" ${can ? '' : 'disabled'}>穿上</button>`}
        <button type="button" class="ghost small" data-ins="quick" ${can ? '' : 'disabled'}>直接卖出 ${ink(C.quick(price))}</button>
        <button type="button" class="ghost small" data-ins="list" ${can ? '' : 'disabled'}>挂单</button>
        <button type="button" class="ghost small" data-ins="rename" ${can ? '' : 'disabled'}>改名${ST.tags ? `（标签 ${ST.tags}）` : ''}</button>` : ''}
        <button type="button" class="ghost small" data-ins="close">关闭</button></div>
      <p class="ar-note">直接卖出是卖给收购商（市场价的 ${Math.round(C.BID * 100)}%），挂单能多卖一点；成交都扣 ${Math.round(C.FEE * 100)}% 手续费。${ci === undefined ? '' : '左边是穿上后的样子（磨损越高越旧）。'}</p>`;
  }
  function closeIns() { $id('arIns').hidden = true; INS = null; }
  async function insAction(a) {
    const it = INS && INS.it; if (!it) return;
    if (a === 'close') { closeIns(); return; }
    if (a === 'equip') { const r = await act('equip', { i: it.i }); if (r && r.ok) { SFX.slice && SFX.slice(); toast(`已穿上「${skinName(it.k)}」`); insInfo(); render(); } return; }
    if (a === 'unequip') { const r = await act('unequip', { char: C.charOf(it.k) }); if (r && r.ok) { insInfo(); render(); } return; }
    if (a === 'quick') {
      const p = C.quick(C.price(it, today()));
      confirmBox('直接卖出', `把「${escapeHTML(itemName(it))}」卖给收购的人，到手 ${ink(p)}（已扣手续费）。`, '卖出', async () => {
        const r = await act('quick', { i: it.i }); if (r && r.ok) { closeIns(); SFX.wood && SFX.wood(); toast(`卖出到账 ${r.gain} 墨锭`); render(); }
      });
      return;
    }
    if (a === 'list') { listBox(it); return; }
    if (a === 'rename') {
      modal(`<h3>改名标签</h3><p>给「${escapeHTML(itemName(it))}」起个名字（最多 12 个字），用掉 1 张改名标签。留空就是去掉名字（不用标签）。</p>
        <input id="arName" class="ar-input" maxlength="12" value="${escapeHTML(it.n || '')}" autocomplete="off" spellcheck="false">
        <div class="row"><button class="go small" id="arNameGo" ${ST.tags < 1 ? 'disabled' : ''}>确定</button><button class="ghost small" data-ar-close>取消</button></div>${ST.tags < 1 ? '<p class="ar-note">没有改名标签，可以在商店或江湖行动里换。</p>' : ''}`);
      $id('arName').addEventListener('keydown', e => { if (e.key !== 'Escape') e.stopPropagation(); });
      $id('arNameGo').addEventListener('click', async () => { const r = await act('rename', { i: it.i, name: $id('arName').value }); if (r && r.ok) { closeModal(); INS.it = ST.inv.find(x => x.i === it.i) || it; insInfo(); render(); } });
    }
  }
  function listBox(it) {
    const mk = C.price(it, today()), top = Math.floor(mk * C.LIST_MAX_R);
    modal(`<h3>挂单出售</h3><p>「${escapeHTML(itemName(it))}」现在的市场价是 ${ink(mk)}，最高能标到 ${ink(top)}。标得越低卖得越快，成交后扣 ${Math.round(C.FEE * 100)}% 手续费再到账。</p>
      <div class="ar-listrow"><input id="arPrice" class="ar-input" type="number" min="1" max="${top}" step="1" value="${top}"><span id="arEta" class="ar-note"></span></div>
      <div class="row"><button class="go small" id="arListGo">挂上去</button><button class="ghost small" data-ar-close>取消</button></div>`);
    const eta = () => {
      const v = Math.floor(+$id('arPrice').value || 0), r = C.sellRate(v / mk);
      $id('arEta').innerHTML = v < 1 ? '' : v > top ? `最高标 ${fmt(top)}，再高没人买` : `到手 ${ink(C.net(v))} · ${r >= 2 ? '很快就能卖掉' : `大约 ${Math.max(1, Math.round(1 / r))} 小时卖掉`}`;
    };
    $id('arPrice').addEventListener('input', eta); $id('arPrice').addEventListener('keydown', e => { if (e.key !== 'Escape') e.stopPropagation(); }); eta();
    $id('arListGo').addEventListener('click', async () => {
      const r = await act('list', { i: it.i, price: Math.floor(+$id('arPrice').value || 0) });
      if (r && r.ok) { closeModal(); closeIns(); toast('已挂到江湖市场，卖掉了会通知你'); render(); }
    });
  }

  // 武器箱
  function pCases() {
    const s = blankS(), d = today();
    const gift = live() && !ST.gift ? `<div class="ar-card ar-gift"><span><b>新手礼</b> 送你一个初刃武器箱和一把钥匙，先开一个试试手气。</span><button type="button" class="go small" id="arGift">领取</button></div>` : '';
    const cards = C.CASES.map(cid => {
      const col = C.COLS[cid], n = s.cases[cid], have = col.mil.filter(k => s.inv.some(x => x.k === k)).length, claimed = s.cc.includes(cid);
      const tiers = C.TIERS.filter(t => (col[t] || []).length).map(t => `<div class="ar-ctier" style="--tc:${C.TIER[t].c}"><span>${C.TIER[t].n} · ${(C.ODDS[t] * 100).toFixed(2)}%</span><div class="ar-minis">${col[t].map(k => `<img src="${art({ k, f: 0.1, p: 0 })}" alt="" title="${escapeHTML(itemName({ k, st: -1 }, true))}" loading="lazy">`).join('')}</div></div>`).join('');
      return `<div class="ar-casecard" style="--cc:${col.col}">
        <div class="ar-casehead"><div class="ar-casebox"><span>${col.emblem}</span></div><div><h3>${col.name}武器箱</h3><p>拥有 <b>${n}</b> 个 · 市场价 ${ink(C.casePrice(cid, d))}</p>
          <div class="row"><button type="button" class="go small" data-open="${cid}" ${n && s.keys ? '' : 'disabled'}>开启（用 1 把钥匙）</button><button type="button" class="ghost small" data-buycase="${cid}">买一个 ${ink(C.casePrice(cid, d))}</button></div>
          ${!s.keys && n ? '<p class="ar-note">没有钥匙了：商店、江湖行动、每周补给都能拿到。</p>' : ''}</div></div>
        ${tiers}
        <div class="ar-col"><span>集齐本收藏品 5 款军规级：${have}/5，送 1 把钥匙 + 1 张改名标签</span><button type="button" class="${have >= 5 && !claimed ? 'go' : 'ghost'} small" data-collect="${cid}" ${have >= 5 && !claimed ? '' : 'disabled'}>${claimed ? '已领取' : have >= 5 ? '领取' : '未集齐'}</button></div>
      </div>`;
    }).join('');
    return `${gift}<p class="ar-note top">开箱概率（和 CS 一样）：军规级 79.92%、受限 15.98%、保密 3.20%、隐秘 0.64%、★ 非凡 0.26%。每件都有 10% 是斩数版。磨损度和图案模板随机。</p><div class="ar-cases">${cards}</div>`;
  }
  // 开箱滚轮：结果已经由服务器（或本机）定好了，滚轮只是把它转出来
  const REEL = { on: false };
  const CW = 132;   // 每格宽 + 间隔
  function reelFill(cid, win) {
    const col = C.COLS[cid], out = [];
    for (let i = 0; i < 56; i++) {
      let r = Math.random(), t = 'mil'; for (const x of C.TIERS) { if (r < C.ODDS[x] * (x === 'mil' ? 1 : 3)) { t = x; break; } r -= C.ODDS[x] * (x === 'mil' ? 1 : 3); }
      if (!(col[t] || []).length) t = 'mil';
      out.push({ k: col[t][Math.floor(Math.random() * col[t].length)], f: 0.1, p: 0, st: -1 });
    }
    out[48] = win;
    return out;
  }
  function skipAnim() { try { return localStorage.getItem('renying-arm-fast') === '1'; } catch (e) { return false; } }
  async function openCase(cid) {
    if (REEL.on) return;
    const r = await act('open', { c: cid });
    if (!r || !r.ok) { render(); return; }
    const win = r.item;
    render();
    const strip = reelFill(cid, win);
    REEL.on = true;
    modal(`<h3>${C.COLS[cid].name}武器箱</h3><div class="ar-reel"><div class="ar-strip" id="arStrip">${strip.map(x => `<div class="ar-rt" style="--tc:${tc(x.k)}"><img src="${art(x)}" alt=""><b>${escapeHTML(skinName(x.k))}</b></div>`).join('')}</div><i class="ar-mark"></i></div>
      <div class="row"><button class="ghost small" id="arSkip">跳过</button><label class="ar-fast"><input type="checkbox" id="arFast" ${skipAnim() ? 'checked' : ''}> 以后直接出结果</label></div>`, 'wide');
    $id('arFast').addEventListener('change', e => { try { localStorage.setItem('renying-arm-fast', e.target.checked ? '1' : '0'); } catch (err) {} });
    const el = $id('arStrip'), box = el.parentElement, mid = box.clientWidth / 2;
    const target = -(48 * CW + CW / 2 - mid) + Math.round((Math.random() - 0.5) * (CW - 24));
    let done = false, lastI = -1, raf = 0;
    const finish = () => { if (done) return; done = true; cancelAnimationFrame(raf); REEL.on = false; reveal(win, cid); };
    const tick = () => {
      if (done) return;
      const m = getComputedStyle(el).transform, x = m && m !== 'none' ? +m.split(',')[4] : 0, i = Math.floor((mid - x) / CW);
      if (i !== lastI) { lastI = i; try { sNoise(0.012, 7000, 4000, 1, 0.1, 'highpass'); } catch (e) {} }
      raf = requestAnimationFrame(tick);
    };
    $id('arSkip').addEventListener('click', finish);
    if (skipAnim()) { finish(); return; }
    requestAnimationFrame(() => { el.style.transition = 'transform 6.2s cubic-bezier(0.06, 0.62, 0.1, 1)'; el.style.transform = `translateX(${target}px)`; raf = requestAnimationFrame(tick); });
    el.addEventListener('transitionend', () => setTimeout(finish, 450), { once: true });
  }
  function reveal(it, cid) {
    const t = tierOf(it.k);
    if (t === 'cov' || t === 'gold') playSting('legendary', true); else if (t === 'cla') SFX.gong && SFX.gong(); else SFX.chargeFull && SFX.chargeFull();
    const again = cid && ST.cases[cid] > 0 && ST.keys > 0;
    modal(`<div class="ar-reveal" style="--tc:${tc(it.k)}"><span class="ar-tier" style="--tc:${tc(it.k)}">${C.TIER[t].n}</span><img src="${art(it)}" alt=""><h3>${escapeHTML(itemName(it, true))}</h3>
      <p>${C.wearName(it.f)} · 磨损 ${it.f.toFixed(6)} · 图案 #${it.p}${C.LUCKY.includes(it.p) ? ' · 稀有图案' : ''}</p><p>市场价 ${ink(C.price(it, today()))}</p></div>
      <div class="row"><button class="go small" id="arKeep">收下</button><button class="ghost small" id="arSee">检视</button>${again ? `<button class="ghost small" id="arAgain">再开一个</button>` : ''}</div>`);
    $id('arKeep').addEventListener('click', () => { closeModal(); render(); });
    $id('arSee').addEventListener('click', () => { closeModal(); const x = ST.inv.find(y => y.i === it.i); if (x) inspect(x, 'inv'); });
    if (again) $id('arAgain').addEventListener('click', () => { closeModal(); openCase(cid); });
  }

  // 江湖市场
  const MK = { view: 'items', tier: '', char: '', sort: 'hot' };
  function spark(k, w = 120, h = 34, days = 30, price = C.refPrice) {
    const d = today(), ys = []; for (let i = days - 1; i >= 0; i--) ys.push(price(k, d - i));
    const lo = Math.min(...ys), hi = Math.max(...ys), sp = hi - lo || 1;
    const pts = ys.map((y, i) => `${(i / (ys.length - 1) * w).toFixed(1)},${(h - 3 - (y - lo) / sp * (h - 6)).toFixed(1)}`).join(' ');
    const up = ys[ys.length - 1] >= ys[ys.length - 8];
    return `<svg class="ar-spark ${up ? 'up' : 'down'}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke-width="1.6"/></svg>`;
  }
  const chg = (k, price = C.refPrice) => { const d = today(), a = price(k, d - 7), b = price(k, d); return (b - a) / a; };
  function pMarket() {
    const s = blankS(), d = today();
    const tabs = [['items', '饰品'], ['cases', '武器箱'], ['mine', `我的挂单${s.lst.length ? ` (${s.lst.length})` : ''}`], ['hist', '成交记录']].map(([k, n]) => `<button type="button" data-mkv="${k}" class="${MK.view === k ? 'sel' : ''}">${n}</button>`).join('');
    let body = '';
    if (MK.view === 'items') {
      let keys = Object.keys(C.ITEM).filter(k => (!MK.tier || tierOf(k) === MK.tier) && (!MK.char || C.charOf(k) === MK.char));
      const lo = k => { const L = C.listings(k, d).filter(x => !s.bought.ids.includes(x.l)); return L.length ? L[0].price : 0; };
      const sorts = { hot: (a, b) => C.TIERS.indexOf(tierOf(b)) - C.TIERS.indexOf(tierOf(a)) || lo(b) - lo(a), up: (a, b) => chg(b) - chg(a), down: (a, b) => chg(a) - chg(b), cheap: (a, b) => lo(a) - lo(b) };
      keys = keys.sort(sorts[MK.sort] || sorts.hot);
      body = `<div class="ar-filter"><select id="arMkTier" class="ar-sel"><option value="">全部品质</option>${C.TIERS.map(t => `<option value="${t}" ${MK.tier === t ? 'selected' : ''}>${C.TIER[t].n}</option>`).join('')}</select>
        <select id="arMkChar" class="ar-sel"><option value="">全部侠客</option>${CHARS.map(c => `<option value="${c.id}" ${MK.char === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}</select>
        <select id="arMkSort" class="ar-sel">${[['hot', '品质高的在前'], ['up', '这周涨得多'], ['down', '这周跌得多'], ['cheap', '最便宜']].map(([k, n]) => `<option value="${k}" ${MK.sort === k ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        <div class="ar-mklist">${keys.map(k => { const c = chg(k), p = lo(k); return `<button type="button" class="ar-mkrow" data-mk="${k}" style="--tc:${tc(k)}"><img src="${art({ k, f: 0.26, p: 0 })}" alt="" loading="lazy"><span class="ar-mkn"><b>${escapeHTML(itemName({ k, st: -1 }, true))}</b><small>${C.TIER[tierOf(k)].n} · ${C.COLS[C.ITEM[k].col].name}收藏品</small></span>${spark(k)}<span class="ar-chg ${c >= 0 ? 'up' : 'down'}">${c >= 0 ? '+' : ''}${(c * 100).toFixed(1)}%</span><span class="ar-mkp">${p ? `最低 ${ink(p)}` : '暂无在售'}</span></button>`; }).join('')}</div>`;
    } else if (MK.view === 'cases') {
      body = `<div class="ar-mklist">${C.CASES.map(cid => { const cp = (k, day) => C.casePrice(k, day), c = chg(cid, cp); return `<div class="ar-mkrow static" style="--tc:${C.COLS[cid].col}"><span class="ar-casebox sm" style="--cc:${C.COLS[cid].col}"><span>${C.COLS[cid].emblem}</span></span><span class="ar-mkn"><b>${C.COLS[cid].name}武器箱</b><small>拥有 ${s.cases[cid]} 个</small></span>${spark(cid, 120, 34, 30, cp)}<span class="ar-chg ${c >= 0 ? 'up' : 'down'}">${c >= 0 ? '+' : ''}${(c * 100).toFixed(1)}%</span><span class="ar-mkp">${ink(C.casePrice(cid, d))}</span><span class="ar-mkbtns"><button type="button" class="go small" data-buycase="${cid}">买入</button><button type="button" class="ghost small" data-sellcase="${cid}" ${s.cases[cid] ? '' : 'disabled'}>卖出 ${ink(C.quick(C.casePrice(cid, d)))}</button></span></div>`; }).join('')}</div>`;
    } else if (MK.view === 'mine') {
      body = s.lst.length ? `<div class="ar-mklist">${s.lst.map(L => { const r = C.sellRate(L.price / C.price(L.it, d)); return `<div class="ar-mkrow static" style="--tc:${tc(L.it.k)}"><img src="${art(L.it)}" alt=""><span class="ar-mkn"><b>${escapeHTML(itemName(L.it))}</b><small>挂于 ${new Date(L.t).toLocaleString()} · ${r <= 0 ? '标价太高，基本卖不掉' : '等人来买'}</small></span><span class="ar-mkp">标价 ${ink(L.price)}<small>到手 ${fmt(C.net(L.price))}</small></span><span class="ar-mkbtns"><button type="button" class="ghost small" data-cancel="${L.l}">撤下</button></span></div>`; }).join('')}</div>`
        : '<p class="ar-empty">没有挂单。在库存里点一件饰品，选“挂单”就能自己定价卖。</p>';
    } else {
      body = s.hist.length ? `<div class="ar-hist">${s.hist.map(h => `<div class="ar-hrow"><span>${new Date(h.t).toLocaleString()}</span><span>${{ buy: '买入', sell: '卖出', sold: '挂单成交' }[h.kind] || ''}</span><span>${h.c ? `${C.COLS[h.c].name}武器箱 ×${h.n}` : escapeHTML(itemName({ k: h.k, f: h.f, st: h.st }))}</span><span>${h.kind === 'buy' ? '−' : '+'}${fmt(h.gain || h.price)}</span></div>`).join('')}</div>` : '<p class="ar-empty">还没有成交记录。</p>';
    }
    return `<div class="ar-seg">${tabs}</div><p class="ar-note top">价格每天小幅浮动。在售的比市场价贵一点；直接卖出按市场价的 ${Math.round(C.BID * 100)}% 收，自己挂单最高标到 ${Math.round(C.LIST_MAX_R * 100)}%；成交扣 ${Math.round(C.FEE * 100)}% 手续费。</p>${body}`;
  }
  function marketItem(k) {
    const s = blankS(), d = today(), L = C.listings(k, d);
    const mine = s.inv.filter(x => x.k === k);
    const ys = []; for (let i = 29; i >= 0; i--) ys.push(C.refPrice(k, d - i));
    const W = 520, H = 150, lo = Math.min(...ys), hi = Math.max(...ys), sp = hi - lo || 1;
    const pts = ys.map((y, i) => `${(i / 29 * W).toFixed(1)},${(H - 14 - (y - lo) / sp * (H - 28)).toFixed(1)}`).join(' ');
    modal(`<div class="ar-mkhead" style="--tc:${tc(k)}"><img src="${art({ k, f: 0.1, p: 0 })}" alt=""><div><span class="ar-tier" style="--tc:${tc(k)}">${C.TIER[tierOf(k)].n}</span><h3>${escapeHTML(itemName({ k, st: -1 }, true))}</h3><p class="ar-note">${C.COLS[C.ITEM[k].col].name}收藏品 · 磨损范围 ${C.ITEM[k].fmin.toFixed(2)} – ${C.ITEM[k].fmax.toFixed(2)}</p></div></div>
      <div class="ar-chart"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="近 30 天参考价"><polyline points="0,${H} ${pts} ${W},${H}" class="fill"/><polyline points="${pts}" class="line"/></svg><div class="ar-chartlbl"><span>30 天前</span><span>参考价（久经沙场）：最高 ${fmt(hi)} · 最低 ${fmt(lo)} · 今天 ${fmt(ys[29])}</span><span>今天</span></div></div>
      <h4 class="ar-h">在售</h4><div class="ar-lst">${L.map(x => { const sold = s.bought.ids.includes(x.l); return `<div class="ar-lrow${sold ? ' gone' : ''}"><span>${C.wearName(x.f)}</span><span>${x.f.toFixed(6)}</span><span>#${x.p}${C.LUCKY.includes(x.p) ? ' 稀有' : ''}</span><span>${x.st >= 0 ? `斩数 ${x.st}` : ''}</span><span>${ink(x.price)}</span><button type="button" class="go small" data-buyl="${x.l}" ${sold || !live() ? 'disabled' : ''}>${sold ? '已买' : '购买'}</button></div>`; }).join('')}</div>
      ${mine.length ? `<h4 class="ar-h">我库存里的这款</h4><div class="ar-lst">${mine.map(x => `<div class="ar-lrow"><span>${C.wearName(x.f)}</span><span>${x.f.toFixed(6)}</span><span>#${x.p}</span><span>${x.st >= 0 ? `斩数 ${x.st}` : ''}</span><span>${ink(C.price(x, d))}</span><button type="button" class="ghost small" data-insp="${x.i}">卖出 / 检视</button></div>`).join('')}</div>` : ''}
      <div class="row"><button class="ghost small" data-ar-close>关闭</button></div>`, 'wide');
  }

  // 汰换合同
  const TR = { tier: 'mil', sel: [] };
  function pTrade() {
    const s = blankS(), up = C.UP[TR.tier], need = C.NEED[TR.tier];
    TR.sel = TR.sel.filter(id => s.inv.some(x => x.i === id && tierOf(x.k) === TR.tier));
    const chk = TR.sel.length ? C.tradeCheck(s, TR.sel) : null;
    const selItems = TR.sel.map(id => s.inv.find(x => x.i === id));
    const stMode = selItems.length ? selItems[0].st >= 0 : null;
    const usable = x => tierOf(x.k) === TR.tier && (C.COLS[C.ITEM[x.k].col][up] || []).length && (stMode === null || (x.st >= 0) === stMode);
    const pool = s.inv.filter(x => tierOf(x.k) === TR.tier && !TR.sel.includes(x.i));
    const slots = []; for (let i = 0; i < need; i++) { const it = selItems[i]; slots.push(it ? `<button type="button" class="ar-slot on" data-unsel="${it.i}" style="--tc:${tc(it.k)}"><img src="${art(it)}" alt=""><small>${C.wearShort(it.f)}</small></button>` : '<span class="ar-slot"></span>'); }
    const outs = chk && chk.outs ? chk.outs.map(o => `<div class="ar-out" style="--tc:${tc(o.k)}"><img src="${art({ k: o.k, f: o.f, p: 0 })}" alt=""><b>${escapeHTML(skinName(o.k))}</b><small>${charName(o.k)} · ${(o.p * 100).toFixed(1)}%</small><small>${C.wearName(o.f)} ${o.f.toFixed(4)}</small></div>`).join('') : '';
    return `<div class="ar-seg">${['mil', 'res', 'cla', 'cov'].map(t => `<button type="button" data-trt="${t}" class="${TR.tier === t ? 'sel' : ''}">${C.TIER[t].n} → ${C.TIER[C.UP[t]].n}</button>`).join('')}</div>
      <p class="ar-note top">放进 ${need} 件${C.TIER[TR.tier].n}饰品，换 1 件${C.TIER[up].n}。出什么取决于材料来自哪套收藏品；新饰品的磨损是材料磨损的平均。斩数版只能和斩数版一起换。</p>
      <div class="ar-slots">${slots.join('')}</div>
      <div class="ar-trbar"><span>${TR.sel.length} / ${need}</span>${chk && chk.err && !chk.partial && chk.full === undefined ? `<span class="ar-err">${chk.err}</span>` : ''}<button type="button" class="go small" id="arTradeGo" ${chk && chk.ok ? '' : 'disabled'}>签订合同</button><button type="button" class="ghost small" id="arTradeClr" ${TR.sel.length ? '' : 'disabled'}>清空</button></div>
      ${outs ? `<h4 class="ar-h">可能换到</h4><div class="ar-outs">${outs}</div>` : ''}
      <h4 class="ar-h">库存里的${C.TIER[TR.tier].n}饰品 <small>点一下放进合同</small></h4>
      ${pool.length ? `<div class="ar-grid sm">${pool.map(x => tile(x, usable(x) && TR.sel.length < need ? 'data-sel="1"' : 'disabled')).join('')}</div>` : '<p class="ar-empty">库存里没有这一档的饰品。</p>'}`;
  }

  // 江湖行动
  function supplyName(o) {
    if (o.t === 'case') return `${C.COLS[o.c].name}武器箱`;
    if (o.t === 'key') return '武器箱钥匙';
    if (o.t === 'tag') return '改名标签';
    if (o.t === 'ink') return `${o.n} 墨锭`;
    return itemName({ k: o.k, st: -1 }, true);
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
      : `<div class="ar-sup">${opts.map((o, i) => `<button type="button" class="ar-supo${SUP.pick.includes(i) ? ' sel' : ''}" data-sup="${i}" ${ready ? '' : 'disabled'} style="--tc:${o.t === 'item' ? tc(o.k) : '233,196,106'}">${o.t === 'item' ? `<img src="${art({ k: o.k, f: 0.2, p: 0 })}" alt="">` : `<span class="ar-supi">${{ case: '箱', key: '钥', tag: '签', ink: '墨' }[o.t]}</span>`}<b>${escapeHTML(supplyName(o))}</b></button>`).join('')}</div>
        <div class="row"><button type="button" class="go small" id="arSupGo" ${ready && SUP.pick.length === 2 ? '' : 'disabled'}>领取这两样</button></div>`;
    const shop = C.STAR_SHOP.map(g => `<div class="ar-card ar-starg"><b>${g.name}</b><span class="ar-starc">${'★'.repeat(Math.min(g.cost, 5))}${g.cost > 5 ? ` ×${g.cost}` : ''}</span><button type="button" class="go small" data-star="${g.id}" ${stars >= g.cost && live() ? '' : 'disabled'}>${g.cost} 星章兑换</button></div>`).join('');
    return `<div class="ar-ophead"><div><span class="ar-k">江湖行动 · 第 ${se.k + 1} 季 · 剩 ${left} 天</span><h3>星章 <b>${stars}</b> <small>本季共得 ${s.op.earned}</small></h3></div><p class="ar-note">每周一换四个任务，完成拿星章，星章换钥匙、武器箱和只在这里出的行动收藏品。</p></div>
      <h4 class="ar-h">本周任务</h4><div class="tlist">${ms || '<p class="ar-empty">登录之后才有任务。</p>'}</div>
      <h4 class="ar-h">每周补给 <small>${ready ? '已解锁：四样里挑两样' : `这周再打 ${C.SUPPLY_GAMES - s.drop.g} 局解锁（${s.drop.g}/${C.SUPPLY_GAMES}）`}</small></h4>${live() ? sup : ''}
      <h4 class="ar-h">星章兑换</h4><div class="ar-grid3">${shop}</div>
      <p class="ar-note">对局掉落：每局 ${Math.round(C.DROP_P * 100)}% 机会掉一件饰品或武器箱，每周最多 ${C.DROP_CAP} 次（本周已掉 ${s.drop.n} 次）。</p>`;
  }
  function opCovPick() {
    const list = C.COLS.op.cov;
    modal(`<h3>自选一件行动收藏品 · 隐秘</h3><div class="ar-grid sm">${list.map(k => `<button type="button" class="ar-it" style="--tc:${tc(k)}" data-opcov="${k}"><img src="${art({ k, f: 0.1, p: 0 })}" alt=""><b>${escapeHTML(skinName(k))}</b><small>${charName(k)}</small><i class="ar-bar"></i></button>`).join('')}</div><div class="row"><button class="ghost small" data-ar-close>取消</button></div>`, 'wide');
  }

  // 商店
  function pStore() {
    const s = blankS(), d = today(), sandbox = MODE === 'server' ? !!(ECON_INFO && ECON_INFO.sandbox) : LOCAL_SANDBOX;
    const goods = C.STORE.map(g => {
      const n = g.lim && s.buys[g.id] && s.buys[g.id].k === 'w' + C.week(d) ? s.buys[g.id].n : 0, out = g.lim && n >= g.lim;
      return `<div class="ar-card ar-good"><b>${g.name}</b>${g.lim ? `<small>每周 ${g.lim} 次 · 已买 ${n}</small>` : '<small>&nbsp;</small>'}<button type="button" class="go small" data-store="${g.id}" ${out || !live() ? 'disabled' : ''}>${out ? '本周买完了' : g.cost[0] === 'jade' ? jadeC(g.cost[1]) : ink(g.cost[1])}</button></div>`;
    }).join('');
    const a = C.AGE[s.age];
    const tiers = C.TOPUP.map(([yuan, jd], i) => `<button type="button" class="ar-tier-btn" data-topup="${i}" ${sandbox && live() ? '' : 'disabled'}>${jadeC(jd)}<b>¥ ${yuan}</b></button>`).join('');
    const orders = s.orders.length ? s.orders.slice(0, 8).map(o => `<div class="ar-hrow"><span>${new Date(o.t).toLocaleString()}</span><span>${escapeHTML(o.name)}</span><span>¥ ${o.yuan}${o.sb ? ' · 模拟' : ''}</span><span class="ar-oid">${o.id}</span></div>`).join('') : '<p class="ar-note">还没有充值记录。</p>';
    return `<h4 class="ar-h">道具 <small>只卖便利，不卖属性</small></h4><div class="ar-grid3">${goods}</div>
      <h4 class="ar-h">玉珏 <small>${sandbox ? '测试版：模拟支付，不扣真钱' : '充值暂未开放'}</small></h4>
      <p class="ar-note">1 元 = 10 玉珏，玉珏只用来买钥匙和改名标签。${sandbox ? '' : '正式支付接通前，可以用兑换码领取玉珏。'}${a ? `消费保护：${a.name}${a.free ? '，不限额' : a.one ? `，单笔 ≤ ${a.one} 元，每月 ≤ ${a.month} 元（本月已充 ${C.monthSpend(s, d)} 元）` : '，不能充值'}。` : '第一次充值前会请你确认年龄。'}</p>
      <div class="ar-tiers">${tiers}</div>
      <div class="ar-card ar-redeem"><span>玉珏兑换码</span><input id="arCode" class="ar-input" maxlength="32" placeholder="YJ-数额-XXXX-XXXXXX" autocomplete="off" spellcheck="false"><button type="button" class="go small" id="arCodeGo" ${MODE === 'server' ? '' : 'disabled'}>兑换</button>${MODE === 'server' ? '' : '<small>兑换码要登录云端账号才能用</small>'}</div>
      <h4 class="ar-h">充值记录 <small>${a ? a.name : '未选年龄段'} · <button type="button" class="ar-link" id="arAgeRe">重新选择年龄段</button></small></h4><div class="ar-hist">${orders}</div>`;
  }
  function ageAsk(then) {
    modal(`<h3>先确认一下年龄</h3><p>按照未成年人网络游戏消费的规定，不同年龄能充值的额度不一样。请如实选择。</p>
      <div class="ar-age">${Object.entries(C.AGE).map(([k, a]) => `<button type="button" class="ghost" data-age="${k}"><b>${a.name}</b><small>${a.free ? '不限额' : a.one ? `单笔 ≤ ${a.one} 元 · 每月 ≤ ${a.month} 元` : '不能充值'}</small></button>`).join('')}</div>
      <div class="row"><button class="ghost small" data-ar-close>取消</button></div>`);
    for (const b of document.querySelectorAll('#arModal [data-age]')) b.addEventListener('click', async () => { closeModal(); const r = await act('age', { age: b.dataset.age }); if (r && r.ok) { render(); then && then(); } });
  }
  function topup(i) {
    const s = blankS(), t = C.TOPUP[i], chk = C.payCheck(s, t[0], today());
    if (chk.need) { ageAsk(() => topup(i)); return; }
    if (chk.err) { modal(`<h3>超出消费限额</h3><p>${escapeHTML(chk.err)}</p><p class="ar-note">这是为了保护未成年人。年龄选错了可以在下面重新选择。</p><div class="row"><button class="go small" data-ar-close>知道了</button></div>`); return; }
    modal(`<div class="ar-pay"><span class="ar-k">收银台 · 测试版</span><h3>${t[1]} 玉珏</h3><div class="ar-payamt">¥ ${t[0]}</div><label class="ar-paym"><input type="radio" checked> 模拟支付（测试用，不扣真钱）</label>
      <p class="ar-note">正式上线后会接入需要家长同意的支付渠道，到账以服务器收到支付平台的通知为准。</p>
      <div class="row"><button class="go small" id="arPayGo">确认支付</button><button class="ghost small" data-ar-close>取消</button></div></div>`);
    $id('arPayGo').addEventListener('click', async () => {
      const b = $id('arPayGo'); b.disabled = true; b.textContent = '支付中…';
      const r = await act('topup', { t: i });
      if (r && r.ok) { modal(`<h3>支付成功</h3><p>到账 ${jadeC(r.jade)}</p><p class="ar-note">订单号 ${r.id}</p><div class="row"><button class="go small" data-ar-close>好的</button></div>`); SFX.gong && SFX.gong(); render(); }
      else closeModal();
    });
  }

  /* ---------- 事件 ---------- */
  function bind() {
    $id('arTabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (!b) return; SFX.slice && SFX.slice(); TAB = b.dataset.tab; render(); $id('arMain').scrollTop = 0; });
    $id('arModal').addEventListener('click', async e => {
      if (e.target.closest('[data-ar-close]') || e.target === $id('arModal')) { if (!REEL.on) closeModal(); return; }
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      if (b.dataset.buyl) { const r = await act('buy', { l: b.dataset.buyl }); if (r && r.ok) { SFX.wood && SFX.wood(); toast(`买到了：${itemName(r.item)}`); marketItem(r.item.k); render(); } }
      else if (b.dataset.insp) { const it = ST.inv.find(x => x.i === +b.dataset.insp); closeModal(); if (it) inspect(it, 'inv'); }
      else if (b.dataset.opcov) { const r = await act('star', { id: 'opcov', k: b.dataset.opcov }); if (r && r.ok) { closeModal(); reveal(r.item); render(); } }
    });
    $id('arIns').addEventListener('click', e => { if (e.target === $id('arIns')) { closeIns(); return; } const b = e.target.closest('[data-ins]'); if (b && !b.disabled) insAction(b.dataset.ins); });
    const main = $id('arMain');
    main.addEventListener('change', e => {
      const id = e.target.id, v = e.target.value;
      if (id === 'arInvChar') INV.char = v; else if (id === 'arInvTier') INV.tier = v; else if (id === 'arInvSort') INV.sort = v;
      else if (id === 'arMkTier') MK.tier = v; else if (id === 'arMkChar') MK.char = v; else if (id === 'arMkSort') MK.sort = v; else return;
      render();
    });
    main.addEventListener('keydown', e => { if (e.key === 'Escape') return; e.stopPropagation(); if (e.key === 'Enter' && e.target.id === 'arCode') redeem(); });   // 打字时别触发游戏的快捷键
    main.addEventListener('click', async e => {
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      const d = b.dataset;
      if (d.gotab) { TAB = d.gotab; render(); return; }
      if (d.it && !d.sel) { const it = ST && ST.inv.find(x => x.i === +d.it); if (it) inspect(it, 'inv'); return; }
      if (d.mk) { marketItem(d.mk); return; }
      if (d.mkv) { MK.view = d.mkv; render(); return; }
      if (d.trt) { TR.tier = d.trt; TR.sel = []; render(); return; }
      if (d.sel) { TR.sel.push(+d.it); render(); return; }
      if (d.unsel) { TR.sel = TR.sel.filter(x => x !== +d.unsel); render(); return; }
      if (d.sup !== undefined) { const i = +d.sup; SUP.pick = SUP.pick.includes(i) ? SUP.pick.filter(x => x !== i) : [...SUP.pick, i].slice(-2); render(); return; }
      if (!live()) { msg(MODE === 'wait' ? '正在连接服务器，稍等一下' : MODE === 'offline' ? '连不上服务器，等联网了再试' : '登录之后才能用武库'); return; }
      if (d.open) { openCase(d.open); return; }
      if (d.buycase) { const p = C.casePrice(d.buycase, today()); confirmBox('买武器箱', `花 ${ink(p)} 买一个${C.COLS[d.buycase].name}武器箱？开箱还要一把钥匙。`, '买入', async () => { const r = await act('buyCase', { c: d.buycase, n: 1 }); if (r && r.ok) { SFX.wood && SFX.wood(); render(); } }); return; }
      if (d.sellcase) { const r = await act('sellCase', { c: d.sellcase, n: 1 }); if (r && r.ok) { toast(`卖出到账 ${r.gain} 墨锭`); render(); } return; }
      if (d.cancel) { const r = await act('cancel', { l: d.cancel }); if (r && r.ok) { toast('已撤下，放回库存'); render(); } return; }
      if (d.collect) { const r = await act('collect', { c: d.collect }); if (r && r.ok) { SFX.gong && SFX.gong(); toast('集齐奖励：钥匙 +1，改名标签 +1'); render(); } return; }
      if (d.mission !== undefined) { const r = await act('mission', { m: +d.mission }); if (r && r.ok) { SFX.chargeFull && SFX.chargeFull(); toast(`星章 +${r.star}`); render(); } return; }
      if (d.star) {
        if (d.star === 'opcov') { opCovPick(); return; }
        const r = await act('star', { id: d.star });
        if (r && r.ok) { if (r.item) reveal(r.item); else toast('兑换成功'); render(); }
        return;
      }
      if (d.store) { const g = C.STORE.find(x => x.id === d.store); confirmBox('确认购买', `${g.name}，花 ${g.cost[0] === 'jade' ? jadeC(g.cost[1]) : ink(g.cost[1])}。`, '购买', async () => { const r = await act('store', { id: g.id }); if (r && r.ok) { SFX.wood && SFX.wood(); toast('买好了'); render(); } }); return; }
      if (d.topup !== undefined) { topup(+d.topup); return; }
      if (b.id === 'arGift') { const r = await act('gift', {}); if (r && r.ok) { SFX.gong && SFX.gong(); toast('新手礼：初刃武器箱 +1，钥匙 +1'); render(); } return; }
      if (b.id === 'arTradeGo') { tradeGo(); return; }
      if (b.id === 'arTradeClr') { TR.sel = []; render(); return; }
      if (b.id === 'arSupGo') { const r = await act('supply', { picks: SUP.pick }); if (r && r.ok) { SUP.pick = []; SFX.gong && SFX.gong(); const it = r.got.find(x => x.t === 'item'); if (it) reveal(it.item); else toast('补给到手'); render(); } return; }
      if (b.id === 'arCodeGo') { redeem(); return; }
      if (b.id === 'arAgeRe') { ageAsk(); return; }
    });
  }
  async function redeem() {
    const code = $id('arCode') ? $id('arCode').value.trim() : ''; if (!code) return;
    const r = await act('redeem', { code });
    if (r && r.ok) { SFX.gong && SFX.gong(); toast(`兑换成功：玉珏 +${r.jade}`); render(); }
  }
  function tradeGo() {
    const s = ST, chk = C.tradeCheck(s, TR.sel); if (!chk.ok) { msg(chk.err); return; }
    confirmBox('签订汰换合同', `这 ${TR.sel.length} 件${C.TIER[chk.tier].n}饰品会被收走，换 1 件${C.TIER[chk.up].n}。确定吗？`, '签订', async () => {
      const r = await act('trade', { ids: TR.sel });
      if (r && r.ok) { TR.sel = []; reveal(r.item); render(); }
    });
  }

  /* ---------- 打开武库 ---------- */
  let ECON_INFO = null, POLL = 0;
  async function openArmory(tab) {
    if (tab) TAB = tab;
    ensurePortraits();
    render();
    await connect(false);
    if (MODE === 'server') { try { const out = await ECON('sync', {}); ECON_INFO = out.info || ECON_INFO; apply(out); } catch (e) {} }
    else if (MODE === 'local' && ST) { const env = envBase(), sold = C.settle(ST, env); if (sold.length) apply({ state: ST, ink: env.ink, sold }); }
    render();
    clearInterval(POLL);
    POLL = setInterval(() => { if (!$id('armory').classList.contains('on')) { clearInterval(POLL); return; } if (!BUSY && !REEL.on) act('sync', {}, { bg: true }).then(() => { if (!BUSY && !REEL.on && $id('arModal').hidden && $id('arIns').hidden) render(); }); }, 60000);
  }
  window.openArmory = openArmory;
  bind();
  document.addEventListener('keydown', e => {   // Esc 关掉弹窗 / 检视
    if (e.key !== 'Escape' || !$id('armory').classList.contains('on')) return;
    if (!$id('arModal').hidden) { if (!REEL.on) closeModal(); }
    else if (INS) closeIns();
  });
  // 检视用的小舞台：一直在，打开检视时才画
  demoLoop($id('arInsCv'), () => INS ? CHARS.findIndex(c => c.id === C.charOf(INS.it.k)) : -1, () => !$id('arIns').hidden && !!INS, () => INS ? INS.it.k : '', () => null);
  (function insWear() {   // 舞台上那位侠客的磨损跟着正在检视的这一件
    if (!$id('armory').classList.contains('on')) {   // 离开武库就收起检视和弹窗（开箱滚轮转完再收）
      if (INS) closeIns();
      if (!REEL.on && !$id('arModal').hidden) closeModal();
    }
    const cv = $id('arInsCv'), p = cv && cv._pup;
    if (p && INS) { const sig = `${INS.it.i}|${INS.it.k}|${INS.it.f}|${INS.it.p}`; if (p._ar !== sig) { FORCE = { k: INS.it.k, f: INS.it.f, p: INS.it.p }; try { p.look = skinLook(p.chIdx, p.skin); } finally { FORCE = null; } p._ar = sig; } }
    requestAnimationFrame(insWear);
  })();

  /* ---------- 接到游戏里 ---------- */
  // 存档同步的回执：墨锭按服务器的账走；服务器拿掉 / 补上的皮肤照着改
  let CAP_TOAST = 0;
  if (CS && CS.onLedger) CS.onLedger((L, fix, capped, owed) => {
    const before = Math.floor(PROF.ink || 0), v = LSYNC(L, before);
    if (v > before) GRANT(v - before);
    PROF.ink = v;
    if (fix) {
      const set = new Set(PROF.skins || []);
      for (const k of fix.skinsAdd || []) set.add(k);
      for (const k of fix.skinsDel || []) { set.delete(k); for (const [c, x] of Object.entries(PROF.equip || {})) if (x === k) delete PROF.equip[c]; }
      PROF.skins = Array.from(set);
      if (PORTRAITS.length) { PORTRAITS.length = 0; ensurePortraits(); }
      try { applySkins(); } catch (e) {}
    }
    if (capped > 0 && NOW() - CAP_TOAST > 10 * 60000) {   // 十分钟最多提醒一次
      CAP_TOAST = NOW();
      toast(owed > 0 ? `墨锭收入超过今天的额度，${capped} 先记着，之后补上` : `墨锭收入超过今天的额度，${capped} 没有计入`);   // 额度：每天 1500 + 每局对战 80
    }
    for (const el of document.querySelectorAll('.gInk')) el.textContent = PROF.ink;
    try { renderTopNav(); } catch (e) {}
  });
  const baseApply = applyProfile;
  applyProfile = function (p) {
    if (p && p !== PROF && typeof p === 'object') {
      const u = user(), uid = u ? String(u.uid || u.name || '') : '';
      if (uid !== UID || p.guest) { ST = null; MODE = 'none'; UID = uid; }
      if (!p.guest && !('armory' in p) && MODE !== 'server') loadLocal(undefined);
    }
    const r = baseApply.apply(this, arguments);
    refreshLooks(false);
    if (p && p !== PROF && !PROF.guest && cloudOn() && MODE !== 'server') connect(false).then(() => { if ($id('armory').classList.contains('on')) render(); });
    try { if (p && p !== PROF && $id('armory').classList.contains('on')) render(); } catch (e) {}
    return r;
  };
  window.applyProfile = applyProfile;
  // 开局领一张票（服务器用来判断这局是不是真打了）
  const baseStartRound = startRound;
  startRound = function () {
    const r = baseStartRound.apply(this, arguments);
    try {
      const mode = M.mode;
      if (MODE === 'server' && C.MODES.includes(mode) && !M.watchAi && !(typeof isAiVsAi === 'function' && isAiVsAi()) && (!TK || NOW() - TK > 40 * 60000)) { TK = NOW(); ECON('matchStart', { mode }).catch(() => { TK = 0; }); }
    } catch (e) {}
    return r;
  };
  // 一局打完：斩数、行动任务、每周补给进度、掉落
  const baseTaskEnd = taskMatchEnd;
  taskMatchEnd = function (w) {
    const r = baseTaskEnd.apply(this, arguments);
    try { matchEnd(w); } catch (e) { console.warn('armory match end', e); }
    return r;
  };
  async function matchEnd(w) {
    const el = $id('endArm'); if (el) el.innerHTML = '';
    if (!live() || PROF.guest || OFFLINE_BUILD || REPLAY.on) return;
    if (!C.MODES.includes(M.mode) || M.watchAi || (typeof isAiVsAi === 'function' && isAiVsAi())) return;
    const me = typeof localTeam === 'function' ? localTeam() : 0, f = M.mode === 'net' ? [A, B][localIdx()] : A;
    const wins = M.wins || [0, 0], win = w >= 0 && w === me;
    const ctx = { mode: M.mode, level: M.level || '', char: f && f.ch ? f.ch.id : '', win, rounds: wins[me] || 0, flawless: win && !(wins[1 - me] || 0), combo: MSTAT.maxcombo || 0, ults: MSTAT.ults || 0 };
    TK = 0;
    const res = await act('matchEnd', { ctx }, { bg: true });
    if (!res || !res.ok) return;
    const notes = [];
    if (res.st) notes.push(`斩数 +${res.st.add}（共 ${res.st.total}）`);
    if (res.drop) notes.push(res.drop.t === 'case' ? `掉落：${C.COLS[res.drop.c].name}武器箱` : `<span style="color:rgb(${tc(res.drop.item.k)})">掉落：${escapeHTML(itemName(res.drop.item))}</span>`);
    if (ST.drop.g === C.SUPPLY_GAMES && !ST.drop.sup) notes.push('每周补给已解锁，去武库领');
    if (res.drop) { SFX.chargeFull && SFX.chargeFull(); }
    if (el && notes.length) el.innerHTML = notes.join(' · ');
  }
  const baseTopNav = renderTopNav;
  renderTopNav = function () {
    const r = baseTopNav.apply(this, arguments);
    try { const b = document.querySelector('#topNav [data-nav="armory"]'); if (b) b.classList.toggle('tn-dot', !!dots().any); } catch (e) {}
    return r;
  };
  // game.js 先载入，那时首页角色和头像是按不认识武库皮肤画的：这里重画一次
  refreshLooks(true);
  // 本机模式：存档每秒对一次校验，绕过这里直接改的会被发现
  setInterval(() => {
    if (MODE !== 'local' || !ST) return;
    if (sigOf(ST) !== SIG) { strike('武库数据被篡改'); loadLocal(undefined); render(); }
  }, 1000);
})();
