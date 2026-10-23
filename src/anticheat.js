'use strict';
/* =====================================================================
   刃影 —— 反作弊（本机这一层）
   ---------------------------------------------------------------------
   真正管钱的是服务器（cloudflare/worker.js）：武库全在服务器上算，墨锭由服务器记账、每天有上限。
   本机这一层抓两类挂：
     刷墨锭：每秒看一眼墨锭。正常一次最多进账一两千（兑换码、任务、补偿），
             一下子涨过 5000，或者 10 分钟里累计进账超过 12000，就算作弊，凭空多出来的墨锭退回去。
             从云端或别的设备载入存档时不算（那是真实进度）；服务器确认的、武库结算的入账也不算
             （云端模块记一笔，这里对账，对得上才放过；记账入口只交给武库，控制台拿不到）。
     改伤害：开局时记下招式表、平衡表、技能表的指纹，之后每 3 秒对一次，被改过就算作弊；
             伤害函数被换掉也算；自己打出去的一下伤害远超这一招可能的最大值（两次）也算。
   处罚（按账号记，开发者账号不管）：
     第一次警告；第二次封 1 天；第三次永久封号，要联系作者解封。
   记录存两份：本机（带校验，改了也认得出来）和服务器（/api/ac，客户端只能往上加，被封期间服务器
   不让写存档、不让交易）。作者用 node tools/econ-admin.mjs unban <昵称> 解封。
   ===================================================================== */
const AC_CONTACT = '如有异议，请联系作者申请解封。';
const AC_BAN_MS = 24 * 3600 * 1000, AC_JUMP = 5000, AC_WIN_MS = 10 * 60 * 1000, AC_WIN_MAX = 12000;
const ACH = { base: null, baseT: 0, gains: [], loadT: 0, sig: '', fns: null, hits: 0, hitSeq: -1, busy: false, rec: null, recKey: '', tick: 0, test: false };
// 网页一打开就记下云端接口：之后控制台里把它们换掉也骗不过这里
const AC_TAKE = window.CloudSave && CloudSave.inkGrantTake, AC_GET = window.CloudSave && CloudSave.acGet, AC_REPORT = window.CloudSave && CloudSave.acReport;
const AC_REVERT = window.CloudSave && CloudSave.ledgerRevert, AC_BEFORE_SYNC = window.CloudSave && CloudSave.onBeforeSync;

function acUser() { try { return (window.CloudSave && CloudSave.getUser && CloudSave.getUser()) || null; } catch (e) { return null; } }
function acExempt() { const u = acUser(); return !!(u && (u.isDevMaster || u.uid === 'dev_master' || String(u.name || '').toLowerCase() === 'dev')); }
function acKey() { const u = acUser(); return 'renying-ac-' + (u && u.uid ? u.uid : 'device'); }
function acHash(s) {
  let a = 0x811c9dc5, b = 0x9e3779b9;
  s = 'ry-ac|' + s;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 0x01000193); b = Math.imul(b ^ c, 0x5bd1e995) ^ (b >>> 13); }
  return (a >>> 0).toString(36) + (b >>> 0).toString(36);
}
const acBlank = () => ({ strikes: 0, banUntil: 0, perm: false, log: [], at: 0, pardon: 0 });
function acPack(r) { return JSON.stringify({ s: r.strikes, b: r.banUntil, p: r.perm ? 1 : 0, l: r.log, a: r.at, d: r.pardon || 0 }); }
function acLoadLocal() {
  let raw = null; try { raw = JSON.parse(localStorage.getItem(acKey()) || 'null'); } catch (e) {}
  if (!raw || !raw.d) return acBlank();
  const r = { strikes: +raw.d.s || 0, banUntil: +raw.d.b || 0, perm: !!raw.d.p, log: Array.isArray(raw.d.l) ? raw.d.l.slice(-20) : [], at: +raw.d.a || 0, pardon: +raw.d.d || 0 };
  if (raw.h !== acHash(acPack(r))) { r.strikes = Math.max(r.strikes, 3); r.perm = true; r.log.push({ r: '改动封禁记录', at: Date.now() }); }   // 记录被手改过
  return r;
}
function acSaveLocal(r) { try { localStorage.setItem(acKey(), JSON.stringify({ d: JSON.parse(acPack(r)), h: acHash(acPack(r)) })); } catch (e) {} }
const acCloud = () => { const u = acUser(); return !!(u && u.isCloud && AC_GET); };
async function acLoadCloud() {
  if (!acCloud()) return null;
  try { const r = await AC_GET(); return r && r.rec ? Object.assign(acBlank(), r.rec) : null; } catch (e) { return null; }   // 老服务器没有这个接口：只看本机记录
}
async function acSaveCloud(r, reason) {
  if (!acCloud() || !AC_REPORT) return;
  try {
    const res = await AC_REPORT(reason);
    if (res && res.rec) { ACH.rec = acMerge(ACH.rec || r, res.rec); acSaveLocal(ACH.rec); }   // 服务器记的次数可能更多
  } catch (e) {}
}
// 本机和云端取更重的那份；作者在云端解封过（pardon 比本机记录新），就以云端为准
function acMerge(a, b) {
  if (!b) return a;
  if ((b.pardon || 0) > (a.at || 0) && (b.pardon || 0) >= (a.pardon || 0)) return Object.assign(acBlank(), b);
  return { strikes: Math.max(a.strikes, b.strikes || 0), banUntil: Math.max(a.banUntil, b.banUntil || 0), perm: a.perm || !!b.perm, log: (a.log.length >= (b.log || []).length ? a.log : b.log).slice(-20), at: Math.max(a.at, b.at || 0), pardon: Math.max(a.pardon || 0, b.pardon || 0) };
}
const acBanned = r => !!r && (r.perm || r.banUntil > Date.now());
async function acRefresh() {
  ACH.recKey = acKey();
  let r = acLoadLocal();
  r = acMerge(r, await acLoadCloud());
  ACH.rec = r; acSaveLocal(r);
  if (acBanned(r) && !acExempt()) acShow(r); else acHide();
}

/* ---------- 处罚 ---------- */
async function acStrike(reason) {
  if (acExempt() || ACH.busy) return;
  ACH.busy = true;
  const r = ACH.rec || acLoadLocal(), now = Date.now();
  r.strikes += 1; r.at = now; r.log = (r.log || []).concat({ r: reason, at: now }).slice(-20);
  if (r.strikes === 2) r.banUntil = Math.max(r.banUntil, now + AC_BAN_MS);
  if (r.strikes >= 3) r.perm = true;
  ACH.rec = r; acSaveLocal(r); acSaveCloud(r, reason);
  if (typeof M !== 'undefined' && M.phase && M.phase !== 'end' && typeof backToMenu === 'function' && typeof showScreen === 'function' && !$id('menu').classList.contains('on')) {
    try { paused = false; backToMenu(); } catch (e) {}   // 正在打的这局作废，不发奖励
  }
  acShow(r, reason);
  ACH.hits = 0; ACH.gains = []; ACH.base = null;
}
function acFmt(ms) { const d = new Date(ms), p = n => String(n).padStart(2, '0'); return `${d.getMonth() + 1} 月 ${d.getDate()} 日 ${p(d.getHours())}:${p(d.getMinutes())}`; }
function acShow(r, reason) {
  let el = $id('acMask');
  if (!el) { el = document.createElement('div'); el.id = 'acMask'; el.className = 'ac-mask'; document.body.appendChild(el); }
  const banned = acBanned(r);
  const why = reason || (r.log && r.log.length ? r.log[r.log.length - 1].r : '');
  let title, body, btn = '';
  if (!banned) { title = '检测到作弊'; body = `${escapeHTML(why)}。<br>这是第一次警告，相关收益已经撤回。<br>再次被检测到会封号 1 天，第三次永久封号。`; btn = '<button type="button" class="go small" id="acOk">我知道了</button>'; }
  else if (r.perm) { title = '账号已被永久封禁'; body = `原因：${escapeHTML(why)}。<br>已累计 ${r.strikes} 次作弊。<br>${AC_CONTACT}`; }
  else { title = '账号已被封禁 1 天'; body = `原因：${escapeHTML(why)}。<br>解封时间：${acFmt(r.banUntil)}（还剩 <b id="acLeft"></b>）。<br>再被检测到一次将永久封号。${AC_CONTACT}`; }
  el.innerHTML = `<div class="ac-box"><div class="ac-seal">${banned ? '封' : '警'}</div><h2>${title}</h2><p>${body}</p>${btn}</div>`;
  el.hidden = false; el.classList.toggle('ban', banned);
  if (!banned) $id('acOk').addEventListener('click', () => { acHide(); ACH.busy = false; if (ACH.reload) location.reload(); });
  else { ACH.busy = false; if (ACH.reload) setTimeout(() => location.reload(), 4000); }
  acTickLeft();
}
function acHide() { const el = $id('acMask'); if (el) el.hidden = true; }
function acTickLeft() {
  const r = ACH.rec, el = $id('acLeft');
  if (!r || r.perm || !el) return;
  const ms = r.banUntil - Date.now();
  if (ms <= 0) { acHide(); return; }
  const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60;
  el.textContent = h ? `${h} 小时 ${m} 分` : `${m + 1} 分钟`;
}
// 被封时挡住所有键盘输入（遮罩已经挡住了鼠标）
window.addEventListener('keydown', e => { if (ACH.rec && acBanned(ACH.rec) && !acExempt()) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);

/* ---------- 刷墨锭 ---------- */
const acLoading = () => Date.now() < ACH.loadT;
function acInkTick() {
  if (typeof PROF === 'undefined') return;
  const ink = +PROF.ink || 0, now = Date.now(), since = ACH.baseT;
  ACH.baseT = now;
  if (ACH.base === null || acLoading() || acExempt()) { ACH.base = ink; return; }
  let d = ink - ACH.base;
  if (d <= 0) { ACH.base = ink; return; }
  if (typeof AC_TAKE === 'function') d -= AC_TAKE(d);   // 服务器确认的、武库结算的入账：对得上的部分不算
  if (d <= 0) { ACH.base = ink; return; }
  ACH.gains = ACH.gains.filter(g => now - g[0] < AC_WIN_MS);
  const total = ACH.gains.reduce((s, g) => s + g[1], 0) + d;
  if (d > AC_JUMP || total > AC_WIN_MAX) {
    // 只退凭空多出来的那部分。云端账号：上次检查以后记进账本的收入，从最新的往前整条作废、够数就停
    // （同步前一定先检查一遍，所以这几条还没报上去；万一已经报了，服务器按它当时认的数扣回）。以前的余额一分不动
    let back = ink - d;
    if (typeof AC_REVERT === 'function') { const v = AC_REVERT(d, since - 50); if (v !== null) back = v; }
    PROF.ink = back; try { saveProfile(); } catch (e) {}
    acStrike(d > AC_JUMP ? `墨锭一下子多了 ${Math.round(d)}` : `10 分钟内墨锭异常增加 ${Math.round(total)}`);
    return;
  }
  ACH.gains.push([now, d]); ACH.base = ink;
}
// 载入存档（登录、云端同步、导入）时墨锭会正常跳一下：这几秒不算
function acHookLoads() {
  const mark = () => { ACH.loadT = Date.now() + 4000; ACH.base = null; };
  if (typeof applyProfile === 'function') {
    const ap = applyProfile;
    applyProfile = function (p) { if (p && p !== PROF) mark(); const r = ap.apply(this, arguments); if (p && p !== PROF) mark(); return r; };
  }
  if (typeof claimLegacyAccount === 'function') {
    const cl = claimLegacyAccount;
    claimLegacyAccount = function () { mark(); const r = cl.apply(this, arguments); mark(); return r; };
  }
  if (window.CloudSave) for (const k of ['login', 'register', 'loadProfile', 'pullNow', 'importAccountData', 'promoteLocalToCloud', 'logout']) {
    const f = CloudSave[k]; if (typeof f !== 'function') continue;
    CloudSave[k] = function () {
      mark(); const r = f.apply(this, arguments);
      if (r && typeof r.then === 'function') r.then(() => { mark(); setTimeout(acRefresh, 500); }, () => mark()); else { mark(); setTimeout(acRefresh, 500); }
      return r;
    };
  }
}

/* ---------- 改伤害 ---------- */
function acTableSig() {
  try {
    return acHash(JSON.stringify([MOVES, FINAL, SP_SLASH, BAL, SKILLS, CHARS.map(c => c.stat), CHAR_MOVES.map(o => Object.keys(o).map(k => o[k].dmg))]));
  } catch (e) { return ''; }
}
function acLocalAttacker(att) {
  if (ACH.test) return true;
  if (!att || REPLAY.on || (typeof TUT !== 'undefined' && TUT) || M.watchAi || M.mode === 'demo' || M.mode === 'watch2v2' || M.mode === 'replay') return false;
  if (typeof isAiVsAi === 'function' && isAiVsAi()) return false;
  return M.mode === 'net' ? att.idx === localIdx() : att.ctrl === human[0];
}
function acCheckHit(att, def, m, before) {
  if (!def || !m || typeof before !== 'number' || typeof def.hp !== 'number' || !acLocalAttacker(att)) return;
  const dealt = before - def.hp, base = m.dmgAbs !== undefined ? m.dmgAbs : (m.dmg || 0);
  const wild = M.mode === 'mayhem' || M.mode === 'chaos' ? 6 : 1;
  if (dealt <= 150 || dealt <= Math.max(base, 20) * 12 * wild) return;
  if (ACH.hitSeq !== M.rseq) { ACH.hitSeq = M.rseq; ACH.hits = 0; }
  if (++ACH.hits >= 2) acStrike(`一下打出 ${Math.round(dealt)} 伤害，远超招式上限`);
}
function acHookHits() {
  const orig = applyHit;
  const wrapped = function (att, def, m, pt) {
    const before = def && def.hp;
    const r = orig.apply(this, arguments);
    try { acCheckHit(att, def, m, before); } catch (e) {}
    return r;
  };
  applyHit = wrapped;
  ACH.fns = { applyHit: wrapped, balDmg };
  ACH.sig = acTableSig();
}
function acCodeTick() {
  if (!ACH.fns || acExempt()) return;
  if (applyHit !== ACH.fns.applyHit || balDmg !== ACH.fns.balDmg) {
    applyHit = ACH.fns.applyHit; balDmg = ACH.fns.balDmg;   // 换回原来的函数
    acStrike('伤害计算被篡改');
    return;
  }
  const s = acTableSig();
  if (s && ACH.sig && s !== ACH.sig) { ACH.sig = s; ACH.reload = true; acStrike('招式伤害数值被篡改'); }   // 改过的数值没法一项项换回来：确认后重新载入网页
}

/* ---------- 启动 ---------- */
function acStart() {
  acHookLoads(); acHookHits();
  if (typeof AC_BEFORE_SYNC === 'function') AC_BEFORE_SYNC(acInkTick);   // 存档上传前先对一遍墨锭
  acRefresh();
  setInterval(() => {
    ACH.tick++;
    acInkTick();
    if (ACH.tick % 3 === 0) acCodeTick();
    if (ACH.rec && acBanned(ACH.rec) && !acExempt()) { const el = $id('acMask'); if (!el || el.hidden) acShow(ACH.rec); else acTickLeft(); }
    else if (ACH.rec && $id('acMask') && !$id('acMask').hidden && $id('acMask').classList.contains('ban')) acHide();
    if (acKey() !== ACH.recKey) acRefresh();   // 换了账号
  }, 1000);
}
acStart();
