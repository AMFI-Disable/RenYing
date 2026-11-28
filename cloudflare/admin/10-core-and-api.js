'use strict';
const NAMES = /*@names*/null;   // 打包时填上：{ skins: { 皮肤 key: 名字 }, heroes: { 侠客 id: 名字 } }
const SKIN = (NAMES && NAMES.skins) || {}, HERO = (NAMES && NAMES.heroes) || {};
const $ = (sel, el = document) => el.querySelector(sel);

/* ---------- 拼网页：H`…${值}…` 里的值一律转义，只有 H 拼出来的才原样放进去 ---------- */
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = v => String(v === undefined || v === null ? '' : v).replace(/[&<>"']/g, c => ESC[c]);
class Raw { constructor(s) { this.s = s; } }
const put = v => v instanceof Raw ? v.s : Array.isArray(v) ? v.map(put).join('') : esc(v);
const H = (strs, ...vals) => new Raw(strs.reduce((o, s, i) => o + s + (i < vals.length ? put(vals[i]) : ''), ''));
const paint = (el, raw) => { el.innerHTML = put(raw); };

/* ---------- 数字和时间 ---------- */
const fmtN = n => Math.round(+n || 0).toLocaleString('zh-CN');
const sign = n => (n > 0 ? '+' : '') + fmtN(n);
const pad = n => String(n).padStart(2, '0');
function fmtT(ms) {
  if (!ms) return '—';
  const d = new Date(+ms);
  return (d.getFullYear() !== new Date().getFullYear() ? d.getFullYear() + '年' : '') + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}
function ago(ms) {
  if (!ms) return '—';
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return '刚刚';
  if (s < 3600) return Math.floor(s / 60) + ' 分钟前';
  if (s < 86400) return Math.floor(s / 3600) + ' 小时前';
  if (s < 30 * 86400) return Math.floor(s / 86400) + ' 天前';
  return fmtT(ms);
}
const parse = t => { try { const o = JSON.parse(t); return o && typeof o === 'object' ? o : null; } catch (e) { return null; } };

/* ---------- 登录令牌、请求 ---------- */
const SESS_KEY = 'renying_adm_s';
const S = {
  tok: '', who: '', role: '', exp: 0, expT: 0, timerT: 0, auto: false, autoT: 0,
  tab: 'home', uid: '', q: '', p: null, give: [], gifts: [], codes: [],
  giftSkins: [], codeSkins: [],
  pFilter: '', pSort: '', pDir: 'desc', pLimit: 20, pOffset: 0, pTotal: 0,
  auditAct: '', auditBy: '', auditBefore: 0, auditBeforeAt: 0, auditStack: [],
  flags: [], aq: '', aact: '', seq: 0, lostScan: null
};
const ROLE = { view: '只能看', econ: '经济', ban: '封禁和账号', all: '全部' };
try { sessionStorage.removeItem('renying-admin'); } catch (e) {}   // 以前的版本把口令存在这里，清掉

function saveSession() {
  try {
    if (S.tok && S.exp) {
      sessionStorage.setItem(SESS_KEY, JSON.stringify({ tok: S.tok, exp: S.exp }));
    } else {
      sessionStorage.removeItem(SESS_KEY);
    }
  } catch (e) {}
}
function clearSession() {
  try { sessionStorage.removeItem(SESS_KEY); } catch (e) {}
}
function updateTimer() {
  const el = $('#sessTimer');
  if (!el || !S.exp) return;
  const rem = Math.max(0, Math.floor((S.exp - Date.now()) / 1000));
  const m = Math.floor(rem / 60), s = rem % 60;
  el.textContent = '剩余 ' + m + '分' + pad(s) + '秒';
  el.className = 'badge' + (rem < 300 ? ' bad' : rem < 600 ? ' gold' : '');
  if (rem <= 0 && S.who) {
    logout('管理登录已过期，请重新登录');
  }
}

async function api(path, body) {
  const headers = { Authorization: 'Bearer ' + S.tok };
  if (body) headers['Content-Type'] = 'application/json';
  let r;
  try { r = await fetch('/api/admin/' + path, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' }); }
  catch (e) { throw new Error('连不上服务器，检查一下网络'); }
  let j = {};
  try { j = await r.json(); } catch (e) {}
  // 401：管理登录过期了（1 小时、被停用、改了密码），重新登录；403 只是这个角色不能做这件事，提示一下就行
  if (r.status === 401 && S.who) { logout('管理登录过期了，请重新登录'); throw new Error('管理登录过期了'); }
  if (!r.ok || !j.ok) throw new Error(j.error || '出错了（' + r.status + '）');
  return j;
}

/* ---------- 武器箱、饰品、品质（登录后从服务器读一次） ---------- */
const CAT = { items: {}, cols: {}, tiers: {}, order: [], caseIds: [], cfgInfo: [], heroes: [], badges: {}, pets: {}, skillVariants: {} };
function useCat(c) {
  CAT.order = c.tiers.map(t => t.id);
  for (const t of c.tiers) CAT.tiers[t.id] = t;
  for (const x of c.cols) CAT.cols[x.id] = x;
  for (const x of c.items) CAT.items[x.k] = x;
  CAT.caseIds = c.cols.map(x => x.id);
  CAT.cfgInfo = c.cfg || [];
  CAT.heroes = Array.isArray(c.heroes) ? c.heroes : Object.keys(HERO);
  CAT.badges = c.badges || {};
  CAT.pets = c.pets || {};
  CAT.skillVariants = c.skillVariants || { std: '原式', swift: '疾风式', heavy: '重岳式' };
}
const itemName = k => SKIN[k] || k;
const heroOf = k => HERO[(CAT.items[k] || {}).char] || '';
const caseName = c => CAT.cols[c] ? CAT.cols[c].name + '武器箱' : String(c || '—');
const tierTag = t => CAT.tiers[t] ? H`<span class="tier" style="--tc:${CAT.tiers[t].c}">${CAT.tiers[t].n}</span>` : '';
const itemTag = (k, st) => H`<span class="it"><b>${itemName(k)}</b><i>${heroOf(k)}</i>${st >= 0 ? H`<span class="st">斩数 ${st}</span>` : ''}</span>`;
const cfgName = k => { const x = CAT.cfgInfo.find(r => r[0] === k); return x ? x[5] + '：' + x[6] : k; };
const unit = (n, u) => H`${fmtN(n)}<small>${u}</small>`;
const tile = (label, v, sub) => H`<div class="tile"><span>${label}</span><b>${typeof v === 'number' ? fmtN(v) : v}</b>${sub ? H`<i>${sub}</i>` : ''}</div>`;
const SRC = { case: '开箱', term: '货郎', trade: '熔铸', supply: '补给', op: '星章兑换', admin: '管理员发的', restore: '找回的', market: '市场买的' };
const ACT = {
  open: '开箱', openAll: '批量开箱', store: '商店', buyCase: '买武器箱', buyTerm: '买货郎', list: '挂单', buy: '买下', cancel: '撤单', trade: '熔铸', rename: '改名',
  equip: '穿上', unequip: '脱下', unseal: '开封货郎', termNext: '货郎换一件', termBuy: '货郎买下', supply: '领补给', mission: '领任务奖励',
  star: '星章兑换', collect: '集齐奖励', matchEnd: '对局结束', matchStart: '开局', sync: '同步', gift: '新手礼',
  ledger: '本机收入', ink_spike: '大额上报', invariant: '数值异常', strike: '反作弊记过', open_account: '建武库存档',
  admin: '管理员调整', restore: '找回饰品', admin_ban: '封号', pardon: '解封', admin_pw: '重设密码', gift_got: '领到补偿', gift_new: '发补偿', gift_off: '停发补偿', cfg: '改经济数值',
  claimCode: '兑换', code_got: '兑换礼包码', code_new: '建兑换码', code_off: '停用兑换码', flag: '改功能开关',
  adm_login: '管理员登录', adm_acct: '改管理员账号', acct_del: '删除账号', acct_restore: '恢复账号', acct_export: '导出账号',
  err_export: '导出错误日志', err_clean: '清理错误日志', adm_digest: '智能归档摘要', maint_prune: '数据库清理', world_act: '世界进度调控',
  dev_drop: '强制下线设备', hist_clear: '清理玩家历史', mkt_cancel: '强制撤下挂单', audit_reason_reset: '恢复默认原因',
};
const FLAG_MODE = { off: '关', dev: '只开 Dev 账号', all: '所有人开' };

/* ---------- 流水里的详情写成人话 ---------- */
function stuff(d) {   // 墨锭、武器箱、货郎、改名标签、送的饰品（调整、补偿共用）
  const out = [];
  if (d.ink) out.push('墨锭 ' + sign(d.ink));
  for (const [c, n] of Object.entries(d.cases || {})) out.push(caseName(c) + ' ' + sign(n));
  if (d.term) out.push('货郎 ' + sign(d.term));
  if (d.tags) out.push('改名标签 ' + sign(d.tags));
  if (Array.isArray(d.skins) && itSkinList(d.skins)) {
    for (const s of d.skins) out.push(itemName(s.k) + (s.st >= 0 ? '（斩数版 ' + s.st + '）' : ''));
  }
  return out;
}
function itSkinList(arr) { return Array.isArray(arr) && arr.length > 0; }
function itemRef(s) {   // "qf_p1#12 st" → 竹影 #12（斩数版）
  const m = /^([a-z]{2}_[a-z0-9]+)#(\d+)( st)?$/.exec(String(s));
  return m ? itemName(m[1]) + ' #' + m[2] + (m[3] ? '（斩数版）' : '') : String(s);
}
const giftText = g => {
  const it = g.items || g, out = [];
  if (g.ink) out.push('墨锭 ' + fmtN(g.ink));
  for (const [c, n] of Object.entries(it.cases || {})) out.push(caseName(c) + ' ×' + n);
  if (it.term) out.push('货郎 ×' + it.term);
  if (it.tags) out.push('改名标签 ×' + it.tags);
  if (Array.isArray(it.skins) && it.skins.length) {
    for (const s of it.skins) out.push(itemName(s.k) + (s.st >= 0 ? '（斩数版 ' + s.st + '）' : ''));
  }
  return out.join('、') || '—';
};
const argText = (k, v) => k === 'c' ? caseName(v) : k === 'i' ? '#' + v : k === 'price' ? '标价 ' + fmtN(v) : k === 'l' ? '单号 ' + String(v).slice(0, 6) : k + ' ' + v;
function detailText(act, raw, withWho) {
  const d = parse(raw);
  if (!d) return raw || '';
  const who = withWho && d.by ? d.by + (d.why ? '：' + d.why : '') + '｜' : '';
  if (act === 'admin') {
    const extra = [];
    if (d.sigils) extra.push('徽记碎片 ' + sign(d.sigils));
    if (d.unlockAll) extra.push('一键全满配');
    if (d.badges) extra.push('徽记 ' + Object.entries(d.badges).map(([k, v]) => (CAT.badges[k] || k) + '→' + (v || '移除')).join('、'));
    if (d.pets) extra.push('灵宠 ' + Object.entries(d.pets).map(([k, v]) => (CAT.pets[k] || k) + '→' + (v || '移除')).join('、'));
    if (d.badgeEquip) extra.push('装备徽记 ' + Object.entries(d.badgeEquip).map(([h, k]) => (HERO[h] || h) + ':' + (CAT.badges[k] || k || '卸下')).join('、'));
    if (d.petEquip) extra.push('装备灵宠 ' + Object.entries(d.petEquip).map(([h, k]) => (HERO[h] || h) + ':' + (CAT.pets[k] || k || '卸下')).join('、'));
    if (d.stances) extra.push('架势 ' + Object.entries(d.stances).map(([h, v]) => (HERO[h] || h) + ':' + (+v ? '二式' : '原式')).join('、'));
    if (d.skills) extra.push('招式 ' + Object.entries(d.skills).map(([h, sl]) => (HERO[h] || h) + '(' + Object.entries(sl).map(([s, v]) => s.toUpperCase() + '=' + (CAT.skillVariants[v] || v)).join('/') + ')').join('、'));
    return who + [...stuff(d), ...extra, ...(d.give || []).map(x => '发 ' + itemRef(x)), ...(d.take || []).map(x => '收 ' + itemRef(x))].join('，');
  }
  if (act === 'restore') return who + '找回 ' + (d.items || []).map(x => itemRef(x.k + '#' + x.to + (x.st >= 0 ? ' st' : '')) + (x.to !== x.from ? '（原 #' + x.from + '）' : '')).join('、');
  if (act === 'admin_ban') return who + (d.days === 'perm' ? '永久封号' : '封 ' + d.days + ' 天');
  if (act === 'pardon') return who + '解封';
  if (act === 'admin_pw') return who + (d.created ? '建号，设好密码' : '重设密码，别处的登录都退出了');
  if (act === 'gift_new') return who + [...stuff(d), d.days + ' 天内有效', d.newToo ? '之后新注册的也能领' : ''].filter(Boolean).join('，');
  if (act === 'gift_off') return who + '停发 ' + d.id;
  if (act === 'gift_got') return (d.note || '') + '：' + stuff(d).join('，');
  if (act === 'code_new') return who + [d.code, ...stuff(d), '最多 ' + fmtN(d.uses) + ' 个号', d.days + ' 天内有效'].join('，');
  if (act === 'code_off') return who + '停用 ' + d.code;
  if (act === 'code_got') return d.code + '（' + (d.note || '') + '）：' + stuff(d).join('，');
  if (act === 'cfg') return who + (d.undo !== undefined ? (d.undo ? '退回到第 ' + d.undo + ' 版' : '全部回到默认值') + '（存成第 ' + d.id + ' 版）'
    : '第 ' + d.id + ' 版：' + Object.entries(d.set || {}).map(([k, v]) => cfgName(k) + (v === null ? ' 回到默认' : ' → ' + v)).join('，'));
  if (act === 'acct_del') return who + '删除（数据都留着）';
  if (act === 'acct_restore') return who + '恢复' + (d.since ? '（' + fmtT(d.since) + ' 删除的）' : '');
  if (act === 'acct_export') return who + '导出了 ' + d.n + ' 个号' + (d.q ? '（搜 “' + d.q + '”）' : '') + (d.del === '1' ? '（只要删除了的）' : '');
  if (act === 'err_export') return who + '导出了 ' + d.n + ' 条错误日志' + (d.kind ? '（' + (ERR_KIND[d.kind] || d.kind) + '）' : '') + (d.format ? ' [' + d.format + ']' : '');
  if (act === 'err_clean') return who + '清理了 ' + fmtN(d.deleted || 0) + ' 条错误记录' + (d.sig ? '（签名 ' + d.sig.slice(0, 8) + '）' : d.kind ? '（类别 ' + (ERR_KIND[d.kind] || d.kind) + '）' : d.all ? '（全部清空）' : '');
  if (act === 'adm_digest') {
    const actList = Object.entries(d.acts || {}).map(([k, n]) => (ACT[k] || k) + ' ×' + n).join('、');
    const actorList = Object.entries(d.actors || {}).map(([k, n]) => k + '(' + n + ')').join('、');
    return who + `[${d.day || ''} 智能归档 ${fmtN(d.n || 0)} 条] 管理员：${actorList || '—'}｜分布：${actList || '—'}${d.netInk !== undefined ? '｜净墨锭变动：' + sign(d.netInk) : ''}${d.highlights && d.highlights.length ? '｜重点：' + d.highlights.join('；') : ''}`;
  }
  if (act === 'maint_prune') return who + '清理数据表（' + d.target + '），移除 ' + fmtN(d.deleted || 0) + ' 行';
  if (act === 'world_act') return who + '世界调控：' + d.op + (d.gen ? '（第 ' + d.gen + ' 代天魔）' : '') + (d.hp ? ' 血量设为 ' + fmtN(d.hp) : '') + (d.affix ? ' 词缀设为 ' + d.affix : '') + (d.node ? ' 推进至第 ' + d.node + ' 节' : '');
  if (act === 'dev_drop') return who + '强制下线设备：' + (d.dev === 'all' ? '全部登录设备' : d.dev);
  if (act === 'hist_clear') return who + '清理历史记录：' + d.kind + '（移除 ' + fmtN(d.deleted || 0) + ' 条）';
  if (act === 'mkt_cancel') return who + '强制撤下市场挂单 #' + String(d.id || '').slice(0, 8) + '（' + itemName(d.k) + '，标价 ' + fmtN(d.price) + '）';
  if (act === 'adm_login') return (withWho && d.by ? d.by + '｜' : '') + (d.how === 'secret' ? '用 ADMIN_SECRET 口令' : '用管理员账号') + '，角色：' + (ROLE[d.role] || d.role);
  if (act === 'adm_acct') return who + (d.created ? '新建 ' : '改 ') + d.name + '：角色 ' + (d.from && d.from !== d.role ? (ROLE[d.from] || d.from) + ' → ' : '') + (ROLE[d.role] || d.role) + (d.pw ? '，' + (d.created ? '设了密码' : '改了密码') : '') + (d.disabled ? '，停用' : '');
  if (act === 'flag') return d.k === '__banner__' ? who + '启动更新横幅：' + (d.title || '恢复默认') : who + d.k + '：' + (FLAG_MODE[d.from] || d.from) + ' → ' + (FLAG_MODE[d.to] || d.to);
  // 玩家自己的操作：{ a: 参数, r: 结果, s: 这次结了几单 }
  const parts = [];
  if (d.r !== undefined && d.r !== '') parts.push(typeof d.r === 'number' ? fmtN(d.r) : itemRef(d.r));
  if (d.s) parts.push('结了 ' + d.s + ' 单');
  if (d.b) parts.push('到期退回 ' + d.b + ' 件');
  if (Array.isArray(d.rm) && d.rm.length) parts.push('出去：' + d.rm.map(itemRef).join('、') + (d.rmN > d.rm.length ? ' 等 ' + d.rmN + ' 件' : ''));
  if (Array.isArray(d.ad) && d.ad.length && d.ad.join() !== String(d.r)) parts.push('进来：' + d.ad.map(itemRef).join('、') + (d.adN > d.ad.length ? ' 等 ' + d.adN + ' 件' : ''));
  if (d.a && typeof d.a === 'object') {
    const a = Object.entries(d.a).filter(([, v]) => v !== '' && v !== null && typeof v !== 'object').map(([k, v]) => argText(k, v)).join(' ');
    if (a) parts.push(a);
  }
  return parts.join(' · ');
}
const inkCell = r => r.ink0 === null || r.ink0 === undefined || r.ink1 === null || r.ink1 === undefined ? ''
  : r.ink1 === r.ink0 ? fmtN(r.ink1) : H`${fmtN(r.ink0)} → <b class="${r.ink1 > r.ink0 ? 'up' : 'down'}">${fmtN(r.ink1)}</b>`;
const target = r => r.uid === '*' ? '全服' : r.username ? H`<button class="link" data-act="open" data-uid="${r.uid}">${r.username}</button>` : H`<span class="mono">${r.uid}</span>`;

/* ---------- 确认框：每一笔修改先给你看要改什么，再写原因 ---------- */
function ask({ title, lines = [], whyInit = '', ok = '确定', danger = false }) {
  whyInit = whyInit || ('管理操作：' + title).slice(0, 100);
  const d = $('#dlg');
  paint(d, H`<form>
    <div class="dlg-b"><h3>${title}</h3>${lines.length ? H`<ul>${lines.map(l => H`<li>${l}</li>`)}</ul>` : ''}
      <label class="f">原因（记进流水，至少 2 个字）<input name="why" maxlength="100" value="${whyInit}" autocomplete="off"></label></div>
    <div class="dlg-f"><button type="button" class="btn ghost" data-x="no">取消</button><button class="btn${danger ? ' danger' : ''}">${ok}</button></div>
  </form>`);
  return new Promise(res => {
    const f = $('form', d), inp = f.elements.why;
    const done = v => { d.oncancel = null; if (d.open) d.close(); res(v); };
    f.addEventListener('submit', e => {
      e.preventDefault();
      const why = inp.value.trim();
      if (why.length < 2) { inp.focus(); inp.placeholder = '要写原因'; return; }
      done({ why });
    });
    $('[data-x=no]', f).addEventListener('click', () => done(null));
    d.oncancel = e => { e.preventDefault(); done(null); };
    d.showModal();
    inp.focus();
  });
}
let toastT = 0;
function toast(msg, err) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'on' + (err ? ' err' : '');
  clearTimeout(toastT);
  toastT = setTimeout(() => { t.className = ''; }, err ? 5000 : 2800);
}
async function busy(btn, fn) {
  if (btn) btn.disabled = true;
  try { return await fn(); }
  catch (e) { toast(e.message, true); }
  finally { if (btn && btn.isConnected) btn.disabled = false; }
}
const numIn = (f, name) => { const el = f.elements[name], v = el ? el.value.trim() : ''; return v === '' ? 0 : Number(v); };
const submitBtn = f => $('button:not([type=button])', f);

function drawSparkline(data) {
  if (!Array.isArray(data) || !data.length) return '';
  const w = 240, h = 48, p = 6;
  const max = Math.max(...data, 1);
  const step = data.length > 1 ? (w - 2 * p) / (data.length - 1) : 0;
  const pts = data.map((v, i) => {
    const x = p + i * step;
    const y = h - p - (v / max) * (h - 2 * p);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = pts[pts.length - 1].split(',');
  return H`<div class="card" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
    <div>
      <h2>近 7 天新注册走势</h2>
      <p class="hint" style="margin:4px 0 0">最近 7 天每日新注册账号数：${data.map(v => fmtN(v)).join(' → ')}（今天：${fmtN(data[data.length - 1] || 0)}）</p>
    </div>
    <div style="background:rgba(255,255,255,.02);padding:6px 12px;border-radius:8px;border:1px solid var(--line)">
      <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="overflow:visible">
        <polyline fill="none" stroke="var(--gold)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="${pts.join(' ')}" />
        <circle cx="${last[0]}" cy="${last[1]}" r="4" fill="var(--gold2)" stroke="var(--bg)" stroke-width="2" />
      </svg>
    </div>
  </div>`;
}

function drawInkFlowChart(flow, cases) {
  const hasFlow = Array.isArray(flow) && flow.length > 0;
  const caseEntries = Object.entries(cases || {}).sort((a, b) => b[1] - a[1]);
  if (!hasFlow && !caseEntries.length) return '';
  let svg = '';
  if (hasFlow) {
    const w = 260, h = 54, p = 6;
    const max = Math.max(...flow.flatMap(x => [x.inkIn || 0, x.inkOut || 0]), 1);
    const step = flow.length > 1 ? (w - 2 * p) / (flow.length - 1) : 0;
    const ptsIn = flow.map((x, i) => `${(p + i * step).toFixed(1)},${(h - p - ((x.inkIn || 0) / max) * (h - 2 * p)).toFixed(1)}`);
    const ptsOut = flow.map((x, i) => `${(p + i * step).toFixed(1)},${(h - p - ((x.inkOut || 0) / max) * (h - 2 * p)).toFixed(1)}`);
    svg = H`<div style="background:rgba(255,255,255,.02);padding:6px 12px;border-radius:8px;border:1px solid var(--line)">
      <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="overflow:visible">
        <polyline fill="none" stroke="var(--ok)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" points="${ptsIn.join(' ')}" />
        <polyline fill="none" stroke="var(--red)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" points="${ptsOut.join(' ')}" />
      </svg>
    </div>`;
  }
  return H`<div class="card" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px">
    <div style="flex:1 1 280px">
      <h2>近 7 天经济流速 & 武器箱开启分布</h2>
      ${hasFlow ? H`<p class="hint" style="margin:4px 0 4px"><span class="up">绿线：流入</span>（${flow.map(x => fmtN(x.inkIn)).join(' → ')}）｜ <span class="down">红线：流出</span>（${flow.map(x => fmtN(x.inkOut)).join(' → ')}）</p>` : ''}
      ${caseEntries.length ? H`<div class="chips" style="margin-top:6px">${caseEntries.map(([c, n]) => H`<span class="badge gold">${caseName(c)}: ${fmtN(n)} 次</span>`)}</div>` : H`<p class="hint">近 7 天暂无开箱记录</p>`}
    </div>
    ${svg}
  </div>`;
}

