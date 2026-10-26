// ======================= 天魔讨伐：全服一起打同一只天魔 =======================
// 天魔的血量、谁打了多少、谁斩杀的都只在服务器上（cloudflare/worker.js 的 /api/gboss），这里不编人也不编进度：
// 页面上的名单、正在出战的人数、最近战报全是服务器回来的真实记录，连不上就直说连不上。
// 一次出战：先领票 → 抽三次秘卷（三选一）→ 和天魔打 90 秒（天魔倒下会再站起来，越打越凶）→ 交上打出的伤害。
// 伤害每秒存一份到本机（GB_PENDING_KEY）：打到一半刷新、断网、关掉网页，下次打开会把已经打出的伤害补交上去，
// 同一张票服务器只认一次，所以重交不会多算。
const GB_PENDING_KEY = 'renying-gboss-pending', GB_KILLS_KEY = 'renying-gboss-kills';
const GB_FIGHT = 90, GB_HP_MUL = 4, GB_DRAFT = 3;
const GB = { st: null, at: 0, err: '', loading: false, ticket: null, dmg: 0, lastHp: 0, phase: 1, saveT: 0, picks: [], result: null, sending: false, retry: null };

// 全服击败过几代天魔（解锁几卷天书）：以服务器为准，本机留一份，离线时也能用上次的数
function gbossKills() {
  if (GB.st) return GB.st.kills | 0;
  try { return Math.max(0, parseInt(localStorage.getItem(GB_KILLS_KEY) || '0', 10) || 0); } catch (e) { return 0; }
}
const gbCloud = () => !OFFLINE_BUILD && !!(window.CloudSave && CloudSave.getUser && CloudSave.getUser() && CloudSave.getUser().isCloud);
const gbUid = () => { const u = gbCloud() && CloudSave.getUser(); return (u && u.uid) || ''; };
const gbHeroIdx = id => Math.max(0, CHARS.findIndex(c => c.id === id));
const gbAffix = st => ((st && st.boss && st.boss.affix) || []).filter(id => SC_BY[id]);
function gbAgo(t, now) {
  const s = Math.max(0, Math.round((now - t) / 1000));
  return s < 60 ? '刚刚' : s < 3600 ? `${Math.floor(s / 60)} 分钟前` : s < 86400 ? `${Math.floor(s / 3600)} 小时前` : `${Math.floor(s / 86400)} 天前`;
}
function gbLeft(ms) {
  const h = Math.max(0, Math.floor(ms / 3600e3));
  return h >= 24 ? `${Math.floor(h / 24)} 天 ${h % 24} 小时` : h >= 1 ? `${h} 小时` : `${Math.max(1, Math.ceil(ms / 60e3))} 分钟`;
}
function gbAdopt(st) {
  if (!st || !st.boss) return;
  GB.st = st; GB.at = Date.now(); GB.err = '';
  try { localStorage.setItem(GB_KILLS_KEY, String(st.kills | 0)); } catch (e) {}
  gbHome();
  if (currentScreen === 'gboss') renderGboss();
}
async function gbLoad() {
  if (OFFLINE_BUILD || !window.CloudSave || !CloudSave.gboss || GB.loading) return;
  GB.loading = true;
  try { gbAdopt(await CloudSave.gboss()); }
  catch (e) { GB.err = e.status === 429 ? '刷新太快了，稍后再看' : '连不上服务器，天魔的情况暂时看不到'; if (currentScreen === 'gboss') renderGboss(); }
  GB.loading = false;
}

// ---------- 首页的小卡片 ----------
function gbHome() {
  const el = $id('homeGboss'); if (!el) return;
  const st = GB.st;
  if (!st || OFFLINE_BUILD) { el.hidden = true; return; }
  const b = st.boss, pct = Math.ceil(b.hp / b.maxHp * 100);
  el.hidden = false;
  $id('homeGbossT').textContent = `第 ${b.gen} 代天魔 · ${CHARS[gbHeroIdx(b.hero)].name}`;
  $id('homeGbossS').textContent = `剩 ${pct}% 血 · ${st.players} 人参战` + (st.fighting ? ` · ${st.fighting} 人正在出战` : '');
  $id('homeGbossBar').style.width = pct + '%';
}

// ---------- 讨伐页 ----------
function openGboss() { showScreen('gboss'); renderGboss(); gbLoad(); gbFlush(); }
function renderGboss() {
  const body = $id('gbBody'); if (!body) return;
  const st = GB.st, now = Date.now(), esc = escapeHTML;
  const pend = gbPending();
  $id('gbMsg').textContent = pend && pend.uid === gbUid() ? (GB.sending ? '正在补交上次出战的伤害…' : '上次出战的伤害还没交上去，联网后会自动补交') : '';
  if (!st) { body.innerHTML = `<p class="sub">${esc(GB.err || '正在查看天魔的情况…')}</p>`; $id('gbGo').disabled = true; return; }
  const b = st.boss, hero = CHARS[gbHeroIdx(b.hero)], pct = b.hp / b.maxHp * 100;
  const off = now - GB.at;   // 服务器时间换成本机时间
  const affix = gbAffix(st).map(id => `<span class="gb-affix" title="${esc(SC_BY[id].d)}"><b>${esc(SC_BY[id].n)}</b>${esc(SC_BY[id].d)}</span>`).join('');
  const top = st.top.length ? st.top.map((r, i) => `<tr><td class="n">${i + 1}</td><td>${esc(r.name)}</td><td class="n">${r.dmg.toLocaleString()}</td><td class="n">${r.runs} 次</td></tr>`).join('')
    : '<tr><td colspan="4" class="gb-none">这一代还没有人出战，第一刀等你来砍</td></tr>';
  const feed = st.feed.length ? st.feed.map(r => `<li><b>${esc(r.name)}</b> 造成 ${r.dmg.toLocaleString()} 伤害${r.killed ? ' · <em>斩杀</em>' : ''}<small>${gbAgo(r.at, st.now)}</small></li>`).join('') : '<li class="gb-none">还没有战报</li>';
  const last = st.last ? `上一代（${esc(CHARS[gbHeroIdx(st.last.hero)].name)}）${st.last.killed ? `被 <b>${esc(st.last.killer)}</b> 斩杀` : '没被打死，遁走了'}` : '';
  const me = !gbCloud() ? '登录云端账号才能出战（游客和本机存档只能观战）'
    : st.me && st.me.runs ? `你这一代造成 ${st.me.dmg.toLocaleString()} 伤害（出战 ${st.me.runs} 次）` : '你这一代还没出战';
  body.innerHTML = `
    <div class="gb-boss" style="--hc:${hero.look.slash}">
      <div class="gb-name">第 ${b.gen} 代天魔 · <span>${esc(hero.name)}</span></div>
      <div class="gb-bar"><i style="width:${pct.toFixed(2)}%"></i><span>${b.hp.toLocaleString()} / ${b.maxHp.toLocaleString()}</span></div>
      <div class="gb-meta">${st.players} 人参战${st.fighting ? ` · <b>${st.fighting} 人正在出战</b>` : ''} · ${gbLeft(b.until - st.now - off)}后遁走 · 全服已斩杀 ${st.kills} 代（解锁 ${Math.min(st.kills, 10)} 卷天书）</div>
      <div class="gb-affixes">${affix}</div>
    </div>
    <div class="gb-cols">
      <div><h3>伤害榜</h3><table class="lbt gb-top">${top}</table></div>
      <div><h3>最近战报</h3><ul class="gb-feed">${feed}</ul>${last ? `<p class="gb-last">${last}</p>` : ''}</div>
    </div>
    <p class="gb-me">${me}</p>
    <p class="gb-rule">大家各自出战（不是同场联机），伤害都扣在这一只天魔身上。一次出战先抽三卷秘卷，再打 ${GB_FIGHT} 秒，天魔倒下会再站起来。天魔被斩杀或遁走后，按伤害发墨锭，伤害前三和斩杀者另得一个武器箱，下次打开武库自动领取。</p>`;
  $id('gbGo').disabled = !gbCloud() || !!(pend && pend.uid === gbUid());
}

// ---------- 交伤害：本机先存一份，交上了才删 ----------
function gbPending() { try { const p = JSON.parse(localStorage.getItem(GB_PENDING_KEY) || 'null'); return p && /^[0-9a-f]{20}$/.test(p.id) ? p : null; } catch (e) { return null; } }
function gbSavePending(p) { try { if (p) localStorage.setItem(GB_PENDING_KEY, JSON.stringify(p)); else localStorage.removeItem(GB_PENDING_KEY); } catch (e) {} }
async function gbFlush(n = 0) {
  const p = gbPending();
  if (!p || GB.sending || !gbCloud() || p.uid !== gbUid()) return null;
  if (GB.ticket && GB.ticket.id === p.id && M.mode === 'boss' && M.phase !== 'end') return null;   // 还在打这一场
  GB.sending = true; clearTimeout(GB.retry);
  let res = null;
  try {
    res = await CloudSave.gboss('hit', { id: p.id, dmg: Math.max(0, Math.round(p.dmg || 0)) });
    gbSavePending(null);
    GB.result = res; gbAdopt(res);
  } catch (e) {
    if (e.status >= 400 && e.status < 500 && e.status !== 429 && e.status !== 401) gbSavePending(null);   // 票不对、找不到：交不上了
    else if (n < 4) GB.retry = setTimeout(() => gbFlush(n + 1), [2e3, 5e3, 10e3, 20e3][n]);
    res = { err: e };
  }
  GB.sending = false; GB.res = res;
  if (currentScreen === 'gboss') renderGboss();
  if (M.mode === 'boss' && M.phase === 'end') gbEndText();
  return res;
}

// ---------- 出战 ----------
async function gbossGo() {
  if (!gbCloud()) { $id('gbMsg').textContent = '登录云端账号才能出战'; return; }
  if (menuHeroId < 0) setMenuHero(menuHeroPick());
  $id('gbGo').disabled = true; $id('gbMsg').textContent = '正在领出战令…';
  let st;
  try { st = await CloudSave.gboss('start'); }
  catch (e) { $id('gbMsg').textContent = e.message || '出战失败'; $id('gbGo').disabled = false; return; }
  gbAdopt(st);
  initAudio(); paused = false;
  GB.ticket = { id: st.ticket, gen: st.boss.gen, hero: st.boss.hero, maxHp: st.boss.maxHp };
  GB.dmg = 0; GB.phase = 1; GB.picks = []; GB.result = null; GB.res = null; GB.saveT = 0;
  gbSavePending({ id: st.ticket, uid: gbUid(), gen: st.boss.gen, dmg: 0, at: Date.now() });
  M.mode = 'boss'; M.round = 1; M.wins = [0, 0]; M.level = 'hard'; M.stage = null; M.watchAi = false; M.duo = null; M.carry = null; M.quick = false;
  M.towerPerks = []; M.foeScrolls = gbAffix(st); M.scRun = {};
  setChars(menuHeroId, gbHeroIdx(st.boss.hero));
  A.ctrl = human[0]; B.ctrl = new AICtrl('hard');
  A.meter = B.meter = 0;
  human[0].clear(); human[1].clear();
  showScreen(null);
  startRound();
  M.phase = 'draft'; paused = true;
  gbDraft();
}
function gbDraft() {
  const picked = scDraw(A.ch.id, M.towerPerks, 3);
  if (GB.picks.length >= GB_DRAFT || !picked.length) { gbFight(); return; }
  const reso = scResoLines(M.towerPerks);
  $id('towerTitle').textContent = '天魔讨伐 · 出战前抽秘卷';
  $id('towerFloorBadge').textContent = `第 ${GB.picks.length + 1} / ${GB_DRAFT} 卷 · 天魔词缀：${M.foeScrolls.map(id => SC_BY[id].n).join('、') || '无'}`;
  const el = $id('towerChoices');
  el.innerHTML = picked.map(p => `<div class="tower-perk-card${p.r === 'x' ? ' cursed' : p.r === 'l' ? ' legend' : ''}" data-perk="${p.id}">
      <div class="tp-icon">${scIcon(p)}</div>
      <div class="tp-name">「${p.n}」</div>
      ${scTag(p)}
      <div class="tp-desc">${p.d}</div>
      <button class="go small tp-pick" type="button">带上这卷</button>
    </div>`).join('') + (M.towerPerks.length ? `<p class="tp-owned">已带 ${M.towerPerks.length} 卷${reso.length ? ' · ' + reso.join(' · ') : ''}</p>` : '');
  el.querySelectorAll('.tower-perk-card').forEach(card => card.addEventListener('click', () => gbPick(card.dataset.perk)));
  showScreen('towerModal');
}
function gbPick(id) {
  if (M.mode !== 'boss' || M.phase !== 'draft' || !SC_BY[id] || M.towerPerks.includes(id)) return;
  M.towerPerks.push(id); GB.picks.push(id);
  gbDraft();
}
function gbFight() {
  showScreen(null);
  paused = false;
  startRound();   // 秘卷和天魔词缀的开局效果在这里生效
  B.maxHp = Math.round(B.maxHp * GB_HP_MUL); B.hp = B.lagHp = B.maxHp;
  GB.lastHp = B.hp;
  M.timer = GB_FIGHT;
  say(`天魔讨伐 · 第 ${GB.ticket.gen} 代`, 1.4);
}
// 每帧（对战中）：记下天魔掉了多少血；天魔倒下就再站起来，越打越凶
function gbossStep() {
  const d = GB.lastHp - Math.max(0, B.hp);
  if (d > 0) GB.dmg += d;
  if (B.hp <= 0 && A.hp > 0) {
    GB.phase++;
    B.hp = B.lagHp = B.maxHp; B.invul = 1.2; B.st = {};
    B.ctrl = new AICtrl(GB.phase >= 4 ? 'god' : GB.phase >= 3 ? 'impossible' : 'hard');
    if (!RESIM) ring(B.x, B.y - 60, 260, '200,60,80', 0.7);
    say(`天魔 · 第${CN[GB.phase] || GB.phase}重`, 1.2);
  }
  GB.lastHp = Math.max(0, B.hp);
  GB.saveT += STEP;
  if (GB.saveT >= 1) { GB.saveT = 0; gbKeep(); }
}
function gbKeep() {
  const p = gbPending();
  if (p && GB.ticket && p.id === GB.ticket.id) { p.dmg = Math.round(GB.dmg); gbSavePending(p); }
}
// 打完了（倒下、时间到、中途退出）：存好伤害，交上去
function gbossFinish(why) {
  if (!GB.ticket) return;
  M.phase = 'end';
  gbKeep();
  GB.why = why;
  if (why !== 'quit') {
    playSting(why === 'time' ? 'victory' : 'defeat');
    const again = $id('againBtn');
    again.style.display = ''; again.disabled = false; again.textContent = '回到天魔讨伐';
    $id('netRepickBtn').classList.add('hidden');
    $id('endTitle').textContent = why === 'time' ? '时辰已到 · 撑满全场' : '力竭倒下';
    $id('endTitle').className = ''; $id('endTitle').style.color = 'var(--gold)';
    gbEndText();
    setTimeout(() => showScreen('end'), 300);
  }
  gbFlush();
}
function gbEndText() {
  const res = GB.res;
  const dmg = Math.round(GB.dmg);
  $id('endSub').textContent = `这一战对天魔造成 ${dmg.toLocaleString()} 伤害，打倒它 ${GB.phase - 1} 次`;
  let t = '正在把伤害交给服务器…';
  if (res && res.err) t = res.err.status >= 400 && res.err.status < 500 && res.err.status !== 429 ? `交不上：${res.err.message}` : '网络断了：伤害已存在本机，联网后自动补交';
  else if (res && res.credited !== undefined) {
    const lateGen = res.tryGen && res.boss && res.tryGen !== res.boss.gen;
    t = res.killed ? `计入全服 ${res.credited.toLocaleString()} 伤害，最后一击斩杀了第 ${res.tryGen} 代天魔！奖励下次打开武库自动领取`
      : res.late ? '出战太久没交，这次不计入'
      : res.credited <= 0 && lateGen ? `你出战时第 ${res.tryGen} 代天魔已被别人斩杀，这次伤害没有计入`
      : `已计入全服：${res.credited.toLocaleString()} 伤害${res.capped ? '（超过这次出战时长能打出的上限，按上限算）' : ''}`;
  }
  $id('endRank').textContent = t;
}
// 中途退出（暂停菜单里的「返回菜单」）：已经打出的伤害照样交
function gbossQuit() { if (M.mode === 'boss' && M.phase !== 'end') gbossFinish('quit'); }

$id('gbGo').addEventListener('click', () => { SFX.slice && SFX.slice(); gbossGo(); });
$id('homeGboss').addEventListener('click', () => { SFX.slice && SFX.slice(); navTo('gboss'); });
setTimeout(() => { gbLoad(); gbFlush(); }, 1500);
window.addEventListener('pagehide', () => { if (M.mode === 'boss' && M.phase !== 'end') gbKeep(); });   // 关网页、刷新前把最后这一秒的伤害也存上
setInterval(() => { if (currentScreen === 'gboss' || currentScreen === 'menu') gbLoad(); }, 30000);
