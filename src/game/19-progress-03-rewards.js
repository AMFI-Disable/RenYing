// Compensation, welfare, daily tasks, and redemption.
// ---------- 补偿：任务能刷新重复领奖，给每位玩家补一位自选侠客（活动期内领） ----------
let compAsked = false;
function compKey() { return 'renying-comp1022-' + curName(); }
function compState() {
  if (OFFLINE_BUILD || Date.now() >= FREE_SKIN_EVENT.end) return null;
  let claimed = false; try { claimed = !!curName() && localStorage.getItem(compKey()) === '1'; } catch (e) {}
  const rw = rwServer() && typeof window.armoryRw === 'function' ? window.armoryRw() : null;
  if (rw) claimed = !!rw.comp;   // 云端账号以服务器为准：本机标记清掉了也领不到第二次
  return { claimed };
}
function compMaybe() {   // 登录后回到首页时弹一次，点了稍后再选就不再追着弹
  const st = compState();
  if (st && !st.claimed && !compAsked && !PROF.guest && curName()) { compAsked = true; setTimeout(compClaim, 400); }
}
function compMark() { try { localStorage.setItem(compKey(), '1'); } catch (e) {} }
function compClaim() {
  const st = compState(); if (!st || st.claimed || PROF.guest || !curName()) return;
  if (CHARS.every(c => ownsHero(c.id))) {   // 侠客都能直接用了：改发墨锭
    if (rwServer()) {
      compAsked = true;
      rwClaim('comp', null, true).then(g => { if (g >= 0 || g === -2) compMark(); if (g >= 0) { SFX.chargeFull(); toast(`侠客现在都能直接用，补偿改发 ${g} 墨锭`); } if ($id('tEvt')) renderTasks(); });
      return;
    }
    compMark(); PROF.ink = (PROF.ink || 0) + 500; saveProfile(); SFX.chargeFull(); toast('侠客现在都能直接用，补偿改发 500 墨锭'); return;
  }
  openWelfare('comp');
}
// ---------- 新手福利 ----------
let wSel = -1;
let wMode = 'new';
function openWelfare(mode = 'new') {
  ensurePortraits(); wSel = -1; wMode = mode;
  const comp = mode === 'comp';
  $id('wTitle').textContent = comp ? '补偿 · 自选侠客' : '新手福利';
  $id('wSub').textContent = comp ? '之前任务刷新后能重复领奖，现在已经修好。给每位大侠补一位自选侠客，永久拥有。' : '人人开局都有青锋。再从下面挑一位角色，免费相赠，永久拥有。';
  $id('wLater').classList.toggle('hidden', !comp);
  $id('wGrid').innerHTML = CHARS.map((c, i) => PROF.owned.includes(c.id) ? '' : `<button data-i="${i}"><img src="${PORTRAITS[i] || ''}" alt=""><div class="wn" style="color:rgb(${c.look.slash})">${c.name}</div><div class="wr">${c.role} · ${RAR_NAME[CHAR_RARITY[c.id]]}</div></button>`).join('');
  $id('wGo').disabled = true; $id('wMsg').textContent = '';
  showScreen('welfare');
}
$id('wGrid').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; wSel = +b.dataset.i; for (const x of $id('wGrid').children) x.classList.toggle('sel', x === b); $id('wGo').disabled = false; });
$id('wLater').addEventListener('click', () => backToMenu());
$id('wGo').addEventListener('click', async () => {
  if (wSel < 0) return;
  const picked = CHARS[wSel].id;
  PROF.owned = Array.from(new Set([...(PROF.owned || ['qingfeng']), picked]));
  if (wMode === 'comp') compMark(); else PROF.welfare = 1;
  if (window.CloudSave) CloudSave.saveProfile(PROF, true);
  applyProfile(PROF);
  toast(`新得角色：${CHARS[wSel].name}`);
  backToMenu();
});
// ---------- 任务 ----------
function taskDest(name) {
  if (/排位|匹配|联机|好友/.test(name)) return 'netp';
  if (/青锋行|秘境|竹林/.test(name)) return 'stage';   // 竹林秘境在主线的闯关模式里
  if (/人机|关卡/.test(name)) return 'cpu';
  if (/试炼|木人/.test(name)) return 'train';
  if (/图鉴|招式/.test(name)) return 'codex';
  return 'cpu';
}
// GitHub 站没有服务器：任务进度按账号存在本机，北京时间 0 点换日、周一换周
const TASK_DEFS = {
  daily: [['d1', '习武精进：进行 1 局对战', 'games', 1, 30], ['d2', '招式纯熟：一局里打出 5 连击', 'combo', 5, 40], ['d3', '破敌致胜：击败 1 名对手', 'wins', 1, 50]],
  weekly: [['w1', '百炼成钢：进行 5 局对战', 'games', 5, 120], ['w2', '名扬四海：赢得 3 场胜利', 'wins', 3, 180], ['w3', '融会贯通：施展 5 次终极奥义', 'ults', 5, 200]],
};
const EVT_TASK = { id: 'e1000', name: '打满 3 局人机（输赢都算）', target: 3, reward: 1000 };
function bjDay(t = Date.now()) { return Math.floor((t + 8 * 3600e3) / 86400e3); }
function taskKey(name) { return 'renying-tasks-' + (name || 'guest'); }
function loadTasks() {
  const name = curName(); let s = null;
  try { s = JSON.parse(localStorage.getItem(taskKey(name)) || 'null'); } catch (e) {}
  if (!s || typeof s !== 'object') s = {};
  const day = bjDay(), week = Math.floor((day + 3) / 7);
  if (s.day !== day) Object.assign(s, { day, d: {}, dc: [] });
  if (s.week !== week) Object.assign(s, { week, w: {}, wc: [] });
  s.evt = s.evt || { cpu: 0, claimed: false };
  if (name && !s.evt.claimed) {   // 没登录时打的人机局，登录后接着算
    try { const g = JSON.parse(localStorage.getItem(taskKey('')) || 'null'); if (g && g.evt) s.evt.cpu = Math.max(s.evt.cpu, g.evt.cpu || 0); } catch (e) {}
  }
  return s;
}
function saveTasks(s) { try { localStorage.setItem(taskKey(curName()), JSON.stringify(s)); } catch (e) {} }
function taskBump(s, stat, v, max) { for (const per of [s.d, s.w]) per[stat] = max ? Math.max(per[stat] || 0, v) : (per[stat] || 0) + v; }
// 一局打完记进度：观战、回放、木人桩不算；本地双人只算对战局数
function taskMatchEnd(w) {
  if (isAiVsAi() || M.watchAi || ['replay', 'demo', 'train', 'watch2v2'].includes(M.mode)) return;
  const s = loadTasks(), pvp = M.mode === 'pvp';
  taskBump(s, 'games', 1);
  if (!pvp && w >= 0 && w === localTeam()) taskBump(s, 'wins', 1);
  if (!pvp && MSTAT.maxcombo) taskBump(s, 'combo', MSTAT.maxcombo, true);
  if (!pvp && MSTAT.ults) taskBump(s, 'ults', MSTAT.ults);
  if (!pvp && M.mode !== 'net' && freeSkinEvent()) s.evt.cpu++;
  saveTasks(s);
}
function taskMarkClaimed(ids) {
  const s = loadTasks();
  for (const id of ids) {
    if (id === EVT_TASK.id) s.evt.claimed = true;
    else if (TASK_DEFS.daily.some(x => x[0] === id)) s.dc.push(id);
    else s.wc.push(id);
  }
  saveTasks(s);
}
// 云端账号：任务、补偿找服务器领（armory.js 的 armoryReward），进度和领没领过以服务器为准；离线版、本机账号照旧本机算
const rwServer = () => typeof window.armoryRewardServer === 'function' && window.armoryRewardServer();
async function rwClaim(name, args, quietDup) {   // 领到返回墨锭数；已经领过返回 -2；别的错返回 -1（都会提示，quietDup 时领过的不提示）
  const r = await window.armoryReward(name, args);
  if (r && r.ok) return r.gain || 0;
  const dup = !!(r && r.err === '已经领过了');
  if (r && r.err && !(dup && quietDup)) toast(r.err);
  return dup ? -2 : -1;
}
function ensureClientTasks() {
  const s = loadTasks(), row = (x, per, cl) => ({ id: x[0], name: x[1], target: x[3], prog: Math.min(x[3], per[x[2]] || 0), reward: x[4], claimed: cl.includes(x[0]) });
  PROF.daily = TASK_DEFS.daily.map(x => row(x, s.d, s.dc));
  PROF.weekly = TASK_DEFS.weekly.map(x => row(x, s.w, s.wc));
  PROF.evtTask = freeSkinEvent() ? Object.assign({}, EVT_TASK, { prog: Math.min(EVT_TASK.target, s.evt.cpu), claimed: !!s.evt.claimed }) : null;
  const sv = rwServer() && typeof window.armoryTasks === 'function' ? window.armoryTasks() : null;
  if (sv) {   // 服务器上的进度（只算服务器认的对局）和领取记录
    const put = t => { const v = sv.find(x => x.id === t.id); if (v) Object.assign(t, { prog: v.prog, target: v.target, reward: v.reward, claimed: v.claimed }); };
    PROF.daily.forEach(put); PROF.weekly.forEach(put);
    if (PROF.evtTask) { const v = sv.find(x => x.id === EVT_TASK.id); if (v) put(PROF.evtTask); else PROF.evtTask = null; }
  }
}
function allTasks() { return [...(PROF.evtTask ? [PROF.evtTask] : []), ...(PROF.daily || []), ...(PROF.weekly || [])]; }
function renderTasks() {
  ensureClientTasks();
  for (const el of document.querySelectorAll('.gInk')) el.textContent = PROF.ink;
  const row = t => {
    const dest = taskDest(t.name);
    const goBtn = (!t.claimed && t.prog < t.target) ? `<button class="ghost task-go" data-go="${dest}" style="margin-left:6px;padding:3px 8px;font-size:12px;">前往</button>` : '';
    return `<div class="trow"><span>${t.name}</span><div class="bar"><i style="width:${Math.min(100, t.prog / t.target * 100)}%"></i></div><span class="rw">+${t.reward}</span><div style="display:flex;align-items:center;"><button data-t="${t.id}" ${t.claimed || t.prog < t.target || PROF.guest ? 'disabled' : ''}>${t.claimed ? '已领取' : t.prog >= t.target ? '领取' : `${Math.floor(t.prog)}/${t.target}`}</button>${goBtn}</div></div>`;
  };
  $id('tDaily').innerHTML = PROF.guest ? '<p class="netnote">登录之后，方可领任务</p>' : (PROF.daily || []).map(row).join('');
  $id('tWeekly').innerHTML = PROF.guest ? '' : (PROF.weekly || []).map(row).join('');
  const ev = PROF.evtTask, comp = compState();
  $id('tEvtCard').hidden = !ev && !comp;
  if (ev || comp) {
    $id('tEvtLeft').textContent = `全皮肤限免 · 剩 ${freeSkinDaysLeft()} 天`;
    const compRow = comp ? `<div class="trow"><span>系统补偿：500 墨锭（侠客现在都能直接用）</span><div class="bar"><i style="width:${comp.claimed ? 100 : 0}%"></i></div><span class="rw">+500</span><div style="display:flex;align-items:center;"><button id="compBtn" ${comp.claimed || PROF.guest ? 'disabled' : ''}>${comp.claimed ? '已领取' : '领取'}</button></div></div>` : '';
    $id('tEvt').innerHTML = compRow + (ev ? row(ev) : '') + (PROF.guest ? '<p class="netnote">进度先替你记着，登录之后就能领</p>' : '');
  }
  const canClaimAny = !PROF.guest && allTasks().some(t => !t.claimed && t.prog >= t.target);
  if ($id('claimAllBtn')) {
    $id('claimAllBtn').classList.toggle('hidden', PROF.guest || !canClaimAny);
    $id('claimAllBtn').disabled = !canClaimAny;
  }
}
for (const id of ['tEvt', 'tDaily', 'tWeekly']) $id(id).addEventListener('click', async e => {
  if (e.target.closest('#compBtn')) { compClaim(); renderTasks(); return; }   // 领完马上把按钮变成「已领取」
  const go = e.target.closest('.task-go');
  if (go && go.dataset.go) {
    const dest = go.dataset.go;
    if (dest === 'forest') { if (typeof startForest === 'function') startForest(); else openScreen('stage'); }   // 旧存档里的任务还可能指到森林
    else if (dest === 'cpu') openScreen('cpu');
    else if (dest === 'train') openScreen('train');
    else menuGo(dest);
    return;
  }
  const b = e.target.closest('button[data-t]'); if (!b || b.disabled) return;
  const tid = b.dataset.t;
  if (PROF.guest) return;
  const t = allTasks().find(x => x.id === tid);
  if (!t || t.claimed || t.prog < t.target) return;
  if (rwServer()) {
    b.disabled = true;
    const gain = await rwClaim('task', { id: tid });
    if (gain >= 0 || gain === -2) taskMarkClaimed([tid]);
    if (gain >= 0) { SFX.chargeFull(); toast(`+${gain} 墨锭`); }
    renderTasks();
    return;
  }
  t.claimed = true; taskMarkClaimed([tid]);
  const gain = t.reward || 50;
  PROF.ink = (PROF.ink || 0) + gain;
  if (window.CloudSave) CloudSave.saveProfile(PROF);
  applyProfile(PROF);
  SFX.chargeFull();
  toast(`+${gain} 墨锭`);
  renderTasks();
});
if ($id('claimAllBtn')) {
  $id('claimAllBtn').addEventListener('click', async () => {
    if (PROF.guest) return;
    const all = allTasks().filter(t => !t.claimed && t.prog >= t.target);
    if (!all.length) return;
    if (rwServer()) {
      let totalGain = 0, n = 0;
      for (const t of all) { const g = await rwClaim('task', { id: t.id }, true); if (g >= 0 || g === -2) taskMarkClaimed([t.id]); if (g >= 0) { totalGain += g; n++; } }
      if (n) { SFX.chargeFull(); toast(`一键领取完成：+${totalGain} 墨锭`); }
      renderTasks();
      return;
    }
    taskMarkClaimed(all.map(t => t.id));
    let totalGain = 0;
    for (const t of all) {
      t.claimed = true;
      totalGain += (t.reward || 50);
    }
    PROF.ink = (PROF.ink || 0) + totalGain;
    if (window.CloudSave) CloudSave.saveProfile(PROF);
    applyProfile(PROF);
    SFX.chargeFull();
    toast(`一键领取完成：+${totalGain} 墨锭`);
    renderTasks();
  });
}
function getZodiacSkinKeys() {
  const zodSkins = [];
  if (typeof ArmoryCore !== 'undefined' && ArmoryCore.ZOD_OF) {
    for (const [pre, zs] of Object.entries(ArmoryCore.ZOD_OF)) {
      zs.forEach(code => zodSkins.push(`${pre}_z${code}`));
    }
  } else {
    zodSkins.push(
      'qf_zpis', 'qf_zsag', 'qf_zleo', 'fy_ztau', 'fy_zaqu', 'fy_zsco',
      'ts_zcap', 'ts_zleo', 'ts_ztau', 'ls_zgem', 'ls_zsco', 'ls_zsag',
      'ly_zvir', 'ly_zpis', 'ly_zlib', 'lm_zleo', 'lm_zcap', 'lm_zari',
      'my_zaqu', 'my_zlib', 'my_zvir', 'yh_zlib', 'yh_zvir', 'yh_zcan',
      'yl_zsag', 'yl_zari', 'yl_zgem', 'yx_zcan', 'yx_zgem', 'yx_zpis',
      'zx_zsco', 'zx_zcan', 'zx_zaqu', 'gc_zari', 'gc_ztau', 'gc_zcap'
    );
  }
  return zodSkins;
}
const VOID_CODES = ['ZODIAC2026STAR', 'RENYING666', 'RENYING888', 'SWORD2026', 'MOYUGIFT'];
async function redeemCode(rawCode) {
  const code = (rawCode !== undefined ? String(rawCode) : ($id('rdCode') ? $id('rdCode').value : '')).trim();
  if (!code) return;
  const up = code.toUpperCase();
  // 写在源码里的兑换码（源码公开，等于人人都能领）已全部作废；以前领到的星座装束也收回，见 applyProfile 和武库
  if (VOID_CODES.includes(up)) {
    toast('该兑换码已作废');
    if ($id('tMsg')) $id('tMsg').textContent = '该兑换码已作废';
    return;
  }
  // 管理后台建的礼包码：拿去服务器核对（armory.js 里的 armoryRedeem），领到的东西直接进存档；离线版没有服务器
  if (!OFFLINE_BUILD && /^[A-Z0-9]{4,20}$/.test(up) && typeof window.armoryRedeem === 'function') {
    const btn = $id('rdBtn');
    if (btn) btn.disabled = true;
    if ($id('tMsg')) $id('tMsg').textContent = '正在兑换…';
    let r;
    try { r = await window.armoryRedeem(up); } finally { if (btn) btn.disabled = false; }
    const text = r.ok ? `兑换成功：${r.note}（${r.text}）` : r.err;
    if (r.ok) { SFX.chargeFull(); if ($id('rdCode')) $id('rdCode').value = ''; }
    toast(text);
    if ($id('tMsg')) $id('tMsg').textContent = text;
    renderTasks();
    return;
  }
  toast('兑换码无效或已过期');
  if ($id('tMsg')) $id('tMsg').textContent = '兑换码无效或已过期';
}
$id('rdBtn').addEventListener('click', () => redeemCode());
$id('rdCode').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') redeemCode(); });
window.redeemCode = redeemCode;
