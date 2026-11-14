// ======================= 全服肉鸽：每条分线共享的肉鸽进程 =======================
// 一轮 5 劫：每劫全线一起斩够妖物 → 全线投票选一卷秘卷（人人都得到，服务器记着，中途进来、刷新、重连都还在）→ 第 5 劫斩够后开关键战。
// 关键战：线上真人够 3 个就打天道 Boss——每人在自己网页里打一场同袍肉鸽（自己 + 2 名天道同袍 vs 服务器指定的同一只融魂魔首），
// 魔首的血全线共享，以服务器为准。打赢后够资格的云端账号由服务器发星座皮肤（下次打开武库自动领），网页里不加任何东西。
const RG_JIE = 5;
const rgRun = () => WORLD.run || null;
function applySharedPerks(pks) {
  pks = Array.isArray(pks) ? pks : [];
  M.towerPerks = pks.slice();
  if (typeof scOn === 'function' && scOn()) {
    if (typeof allFighters === 'function') {
      for (const f of allFighters()) {
        if (!f || f === B) continue;
        if (!f.sc) f.sc = { lc: 0, markN: 0 };
        f.sc.key = '';
        if (typeof scFire === 'function' && typeof foeOf === 'function') {
          scFire(f, 'start', foeOf(f));
        }
      }
    }
  }
}
function rgFrame(r) {
  const W_ = WORLD; W_.run = r;
  if (r && Array.isArray(r.pk)) {
    const oldKey = (M.towerPerks || []).join(',');
    const newKey = r.pk.join(',');
    if (oldKey !== newKey || !A || !A.sc || !A.sc.key) {
      applySharedPerks(r.pk);
    }
  }
  rgVoteUI();
  const K = M.worldKey;
  if (r.k && r.k.s !== W_.keySeq && !K && W_.on && W_.deadT <= 0 && !paused) worldKeyEnter(r.k);   // 关键战开了（或进来时正在打）：进场
  if (K && K.kind === 'boss' && r.k && r.k.s === K.seq) {   // 魔首的血以服务器为准；自己刚打的还没交上去的先扣着
    if (B.hp < W_.kLastB) { W_.kPend += W_.kLastB - B.hp; W_.kHitAt = clock; }   // 上一步刚打掉的先记上，不然会被服务器的数盖掉
    const v = r.k.hp - W_.kPend;
    B.maxHp = r.k.mh;
    if (!K.won) B.hp = Math.max(1, clock - (W_.kHitAt || -9) < 0.6 ? Math.min(B.hp, v) : v);
    W_.kLastB = B.hp; M.timer = r.k.u;
  }
}
function rgEvent(e) {
  const W_ = WORLD;
  if (e.t === 'rv') { say('全线共选秘卷', 1.2, 'go', '本劫斩妖完成，15 秒内投票'); SFX.gong(); }
  else if (e.t === 'story_clear') {
    say(`剧情大捷 · 第 ${e.story} 回达成`, 1.5, 'big', e.name || '斩妖平乱，共筑江湖');
    SFX.gong();
  }
  else if (e.t === 'rp') {
    const s = SC_BY[e.pick];
    say(`全服共享秘卷「${s ? s.n : e.pick}」`, 1.5, 'big', `第 ${e.story || e.j} 回 · 全员已共享 ${e.perks.length} 卷秘卷`);
    if (e.perks) applySharedPerks(e.perks);
  } else if (e.t === 'ks') {
    if (e.kind === 'boss') say('天道 Boss 降世', 1.6, 'big', '全线侠客共讨融魂魔首');
    else say('天道车轮战', 1.6, 'big', '线上真人不足 3 位：各自迎战 3 位天道侠客');
    SFX.gong();
  }
  else if (e.t === 'ke') rgKeyOver(e);
}
// 投票：屏幕下方三张秘卷，点一下就投；不挡战斗，可以边打边投
function rgVoteUI() {
  const v = WORLD.on && !M.worldKey && rgRun() && rgRun().v;
  let el = $id('worldVote');
  if (!v) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement('div'); el.id = 'worldVote'; el.className = 'world-vote';
    el.addEventListener('click', e => { const b = e.target.closest('button[data-i]'); if (!b) return; worldSend({ t: 'v', i: +b.dataset.i }); SFX.slice(); refocusGame(); });
    document.body.appendChild(el);
  }
  const key = [v.o.join(), v.my, v.n.join(), v.u].join('|');
  if (el.dataset.k === key) return;
  el.dataset.k = key;
  el.innerHTML = `<div class="wv-h">全线共选秘卷 · 还剩 ${v.u} 秒</div><div class="wv-row">` + v.o.map((id, i) => {
    const s = SC_BY[id];
    return `<button type="button" data-i="${i}" class="${v.my === i ? 'sel' : ''}"><b>${s ? s.n : id}</b><span>${s ? s.d : ''}</span><i>${v.n[i]} 票</i></button>`;
  }).join('') + '</div>';
}
function rgHudRows() {
  const r = rgRun(); if (!r) return [];
  const st = r.k ? (r.k.kind === 'boss' ? `天道 Boss · 余 ${r.k.u} 秒` : `天道车轮 · 余 ${r.k.u} 秒`)
    : r.v ? '全线投票中' : `${r.g} / ${r.nd} 只`;
  const pks = r.pk || [];
  const counts = {};
  for (const id of pks) counts[id] = (counts[id] || 0) + 1;
  const perkCountStr = Object.entries(counts).map(([id, n]) => {
    const s = SC_BY[id];
    return (s ? s.n : id) + (n > 1 ? ` ×${n}` : '');
  }).join('、') || '暂无';
  const storyNum = r.story || 1;
  const totalStories = r.totalStories || 1080;
  const stName = r.stName ? ` · ${r.stName}` : '';
  return [
    ['全服剧情', `第 ${storyNum}/${totalStories} 回${stName}`],
    ['全服肉鸽', `第 ${r.c} 轮 · 第 ${r.j}/${RG_JIE} 劫`],
    [r.k ? '关键战' : '本回斩妖', st],
    ['共享秘卷', `${pks.length} 卷 (${Object.keys(counts).length} 种)`],
    ['队伍侠客', `${r.n || 1} 人在场 · 秘卷实时共享`],
    ['叠层增益', perkCountStr.length > 20 ? perkCountStr.slice(0, 19) + '…' : perkCountStr],
  ];
}
// 进关键战：天道 Boss = 同袍肉鸽（自己 + 2 名天道同袍）打服务器指定的融魂魔首，血量全线共享
function rgMates(me) { const out = []; for (let k = 2; out.length < 2; k += 2) { const i = (me + k) % CHARS.length; if (i !== me && !out.includes(i)) out.push(i); } return out; }
function worldKeyEnter(k) {
  const W_ = WORLD;
  W_.keySeq = k.s; W_.back = W_.back && W_.back.seq === k.s ? W_.back : { x: A.x, seq: k.s };
  W_.kPend = 0; W_.kSendT = 0; W_.kHitAt = -9; rgVoteUI();
  if (k.kind === 'boss') {
    const heroes = (k.h || []).map(id => CHAR_IDX[id]).filter(i => i !== undefined);
    pendingRaidBoss = rollRaidBoss(1, heroes);
    M.worldKey = { kind: 'boss', seq: k.s };
    B.worldProxy = false; B.hidden = false; B.invul = 0;   // B 不再是妖物的代理，换成真打的魔首
    startRaidMatch([W_.hero, ...rgMates(W_.hero)], 3);
    creditT = 0; creditPending = false;
    M.towerPerks = cqKeyPerks(); scRoundStart();
    B.maxHp = k.mh; B.hp = B.lagHp = Math.max(1, k.hp); W_.kLastB = B.hp; M.timer = k.u;
    say('天道 Boss · 全线共讨', 1.5, 'big', `融魂魔首【${M.raidBoss && M.raidBoss.heroNames ? M.raidBoss.heroNames.join('·') : ''}】· 共享 ${(rgRun().pk || []).length} 卷秘卷`);
  } else {   // 真人不够：自己 + 2 名同袍车轮战 3 位天道侠客，秘卷照样带着，对面不带
    const foes = (k.h || []).map(id => CHAR_IDX[id]).filter(i => i !== undefined);
    while (foes.length < 3) foes.push((W_.hero + 5 + foes.length * 3) % CHARS.length);
    M.worldKey = { kind: 'trio', seq: k.s };
    B.worldProxy = false; B.hidden = false; B.invul = 0;
    M.towerPerks = cqKeyPerks(); M.foeScrolls = []; M.scRun = {};
    startTag3Match([W_.hero, ...rgMates(W_.hero)], foes, 'god');
    creditT = 0; creditPending = false;
    say('天道车轮战', 1.5, 'big', `对阵【${foes.map(i => CHARS[i].name).join('·')}】· 带着 ${(rgRun().pk || []).length} 卷共享秘卷`);
  }
}
// 关键战里每一步：记下自己这边打掉魔首多少血，每 0.25 秒交一次；顺便报个平安，免得服务器以为掉线
function worldKeyStep() {
  const W_ = WORLD, K = M.worldKey; if (!K || !W_.on) return;
  if (K.kind === 'boss') {
    if (B.hp < W_.kLastB) { W_.kPend += W_.kLastB - B.hp; W_.kHitAt = clock; }
    if (!K.won && B.hp <= 0) B.hp = 1;   // 服务器说打空了才算倒
    W_.kLastB = B.hp;
  }
  if ((W_.kSendT -= STEP) <= 0) {
    W_.kSendT = 0.25;
    worldSend({ t: 's', x: Math.round((W_.back && W_.back.x) || A.x), y: 0, vx: 0, f: 1, st: 'idle', tt: 0, hp: Math.round(A.hp), mh: A.maxHp, kf: 1 });
    if (W_.kPend > 0) { worldSend({ t: 'kd', s: K.seq, d: Math.round(W_.kPend * 10) / 10 }); W_.kPend = 0; }
  }
}
// 本机这一场打完了（endRound / showEnd 交过来的）：赢了等服务器的结果，输了几秒后再进场
function worldKeyRound(w) {
  const K = M.worldKey; if (!K) return;
  M.phase = 'end';
  if (K.kind === 'boss') {
    if (K.won) { K.done = true; setTimeout(() => { if (M.worldKey === K) worldResume(); }, 2600); return; }
    say('同袍全倒', 1.2, 'big', '3 秒后重新入战，魔首的血不回');
    setTimeout(() => {
      if (M.worldKey !== K) return;
      const k = rgRun() && rgRun().k;
      if (k && k.s === K.seq) { M.worldKey = null; WORLD.keySeq = 0; worldKeyEnter(k); } else worldResume();
    }, 3000);
  } else if (!K.done) {   // 车轮战：报个输赢，回大地图等别人打完
    K.done = true;
    worldSend({ t: 'kr', s: K.seq, w: w === 0 ? 1 : 0 });
    say(w === 0 ? '车轮战告捷' : '车轮战落败', 1.4, 'big', '秘卷保留，回到江湖');
    setTimeout(() => { if (M.worldKey === K) worldResume(); }, 2600);
  }
}
function rgKeyOver(e) {
  const K = M.worldKey;
  const top = (e.top || []).map((r, i) => `${i + 1}. ${r[0]} ${r[1]}`).join('  ');
  const cloud = !!(window.CloudSave && CloudSave.worldToken && CloudSave.worldToken());
  if (e.kind === 'boss') {
    if (e.win) { toast(`天道 Boss 伏诛！${top}${cloud ? ' · 够资格的话，星座皮肤会在下次打开武库时到账' : ' · 登录云端账号才能领星座皮肤'}`); SFX.gong(); }
    else toast('天道 Boss 遁走，下一轮再战');
  } else toast(e.win ? `天道车轮战收场 · 告捷：${(e.top || []).map(r => r[0]).join('、')}` : '天道车轮战收场 · 这一轮没人赢下，秘卷照样保留');
  if (!K) return;
  if (K.kind === 'boss' && e.win && !K.won) { K.won = true; B.hp = 0; say('天道 Boss 伏诛', 1.8, 'big', top); return; }   // 本机的魔首这才倒下，走正常的击倒流程
  if (!(K.kind === 'boss' && e.win)) { say(e.kind === 'boss' ? '天道 Boss 遁走' : '关键战结束', 1.4, 'big'); setTimeout(() => { if (M.worldKey === K) worldResume(); }, 1800); }
}
// 打完关键战回大地图（回到进场前站的地方）
function worldResume() {
  const b = WORLD.back; M.worldKey = null; WORLD.back = null;
  if (!WORLD.on) return;
  worldEnterMode(WORLD.hero, b ? b.x : worldShrineX(3));
  say('回到江湖', 1, 'go', '秘卷保留，下一轮开始');
}

// ======================= 神行千里：传送至本线任意同道身旁 =======================
function worldTeleportTo(tx, ty, name, targetId) {
  tx = clamp(tx, 60, WORLD_W - 60);
  ty = ty || 0;
  if (!RESIM) {
    smoke(A.x, A.y - 60, 20); ring(A.x, A.y - 60, 140, '233,196,106', 0.6); SFX.dash();
  }
  A.x = tx; A.y = ty; A.vx = 0; A.vy = 0;
  if (!RESIM) {
    smoke(A.x, A.y - 60, 20); ring(A.x, A.y - 60, 180, '70,211,234', 0.8); SFX.parry();
  }
  cam.x = A.x; cam.y = A.y;
  say('神行千里', 1.2, 'go', '已瞬移至 ' + name + ' 身旁');
  worldSend({ t: 's', x: Math.round(A.x), y: Math.round(A.y), vx: 0, f: A.face, st: A.state, tt: A.t, hp: Math.round(A.hp), mh: A.maxHp });
  if (targetId) worldSend({ t: 'tp', to: targetId, x: Math.round(A.x) });
  closeTeleportModal();
}
function closeTeleportModal() {
  const el = $id('worldTeleport');
  if (el) el.remove();
}
function worldToggleTeleport() {
  let el = $id('worldTeleport');
  if (el) { el.remove(); return; }
  if (!WORLD.on || M.worldKey) return;
  el = document.createElement('div');
  el.id = 'worldTeleport';
  el.className = 'world-teleport';
  renderTeleportModal(el);
  document.body.appendChild(el);
}
function renderTeleportModal(el) {
  const W_ = WORLD;
  const others = [];
  for (const [id, meta] of W_.roster) {
    if (id === W_.id) continue;
    const pos = W_.rosterPos.get(id) || (W_.ghosts.get(id) ? { x: Math.round(W_.ghosts.get(id).x), y: 0, zi: worldZoneAt(W_.ghosts.get(id).x) } : null);
    const x = pos ? pos.x : 0;
    const zi = pos ? pos.zi : worldZoneAt(x);
    const z = WORLD_ZONES[zi] || WORLD_ZONES[0];
    const dist = pos ? Math.round(Math.abs(x - A.x)) : 0;
    others.push({ id, name: meta[1] || `游侠${id}`, ch: meta[2], x, zi, zName: z.n, dist });
  }
  others.sort((a, b) => a.dist - b.dist);

  let itemsHtml = '';
  if (others.length) {
    itemsHtml = others.map((p, idx) => {
      const num = idx < 9 ? idx + 1 : '';
      const keyTip = num ? `<span class="wt-key">[${num}]</span>` : '<span class="wt-key"></span>';
      const hero = CHARS[CHAR_IDX[p.ch]] || { name: p.ch };
      return `<div class="wt-item" data-act="tp-user" data-id="${p.id}" data-x="${p.x}" data-name="${p.name}">
        ${keyTip}
        <div class="wt-who"><span class="wt-name">${p.name}</span><span class="wt-sub">${hero.name} · 距你 ${p.dist}px</span></div>
        <span class="wt-loc">${p.zName} (x: ${p.x})</span>
        <button class="wt-btn" type="button" data-act="tp-btn" data-x="${p.x}" data-name="${p.name}" data-id="${p.id}">瞬移</button>
      </div>`;
    }).join('');
  } else {
    itemsHtml = `<p class="wt-tip" style="text-align:center;padding:10px 0;color:var(--dim)">当前分线暂无其他同道在线，可快捷神行至各区土地庙：</p>` +
      WORLD_ZONES.map((z, idx) => {
        const sx = worldShrineX(idx);
        const num = idx < 9 ? idx + 1 : '';
        const keyTip = num ? `<span class="wt-key">[${num}]</span>` : '';
        return `<div class="wt-item" data-act="tp-shrine" data-x="${sx}" data-name="${z.n} 土地庙">
          ${keyTip}
          <div class="wt-who"><span class="wt-name">${z.n} · 土地庙</span><span class="wt-sub">${z.d}</span></div>
          <span class="wt-loc">x: ${sx}</span>
          <button class="wt-btn" type="button" data-act="tp-btn" data-x="${sx}" data-name="${z.n} 土地庙">神行</button>
        </div>`;
      }).join('');
  }

  el.innerHTML = `
    <div class="wt-head">
      <h3 class="wt-title">神行千里 · 传送同道</h3>
      <button class="wt-close" type="button" data-act="close">✕</button>
    </div>
    <p class="wt-tip">快捷键 <b>[T]</b> 打开/关闭 · 按数字 <b>[1-9]</b> 或点击对应条目即可瞬间神行！</p>
    <div class="wt-list">${itemsHtml}</div>
  `;

  el.onclick = e => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'close') { closeTeleportModal(); refocusGame(); return; }
    const it = e.target.closest('.wt-item') || btn;
    const x = +it.dataset.x, name = it.dataset.name, id = it.dataset.id ? +it.dataset.id : 0;
    if (Number.isFinite(x) && name) {
      worldTeleportTo(x, 0, name, id);
      refocusGame();
    }
  };
}

window.addEventListener('keydown', e => {
  if (!WORLD.on || M.worldKey) return;
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  if (e.code === 'KeyT') {
    e.preventDefault();
    worldToggleTeleport();
    return;
  }
  const el = $id('worldTeleport');
  if (el) {
    if (e.code === 'Escape') {
      e.preventDefault();
      closeTeleportModal();
      refocusGame();
      return;
    }
    const m = /^Digit([1-9])$/.exec(e.code) || /^Numpad([1-9])$/.exec(e.code);
    if (m) {
      const idx = +m[1] - 1;
      const items = el.querySelectorAll('.wt-item');
      if (items[idx]) {
        e.preventDefault();
        const it = items[idx];
        const x = +it.dataset.x, name = it.dataset.name, id = it.dataset.id ? +it.dataset.id : 0;
        if (Number.isFinite(x) && name) {
          worldTeleportTo(x, 0, name, id);
          refocusGame();
        }
      }
    }
  }
});

// ======================= 全服肉鸽 · 江湖长卷：全服共享的剧情线 =======================
// 全服只有一份进度（服务器 D1 的 chron 表），所有分线一起往下推，只会往前走：刷新、换线、掉线重连、隔几天再来看到的都是同一份。
// 帧里的 q 是全服现在推到第几节、完成了多少（含本线还没报上去的）；推进了服务器全线播报一次（qa）。
// 奖励只在服务器上算：这一节出过力的云端账号调一次 /api/world/chron/claim 就把出过力、完成了、还没领的节一起领了（一个号一节只领一次），
// 墨锭下次打开武库时到账；每 CHRON.MJ_EVERY 节一卷个人秘卷，进关键战时在全线共享秘卷之外再带最近的 CHRON.PERS_MAX 卷。游客能推进度，不领奖。
const CQS = { q: null, mine: null, busy: false, at: 0, want: false };
const cqCloud = () => !OFFLINE_BUILD && !!(window.CloudSave && CloudSave.chron && CloudSave.worldToken && CloudSave.worldToken());
// 「竹林斩妖」「讨伐妖王」这类不带数的说法（HUD 上一行左边）
const CQ_ZONE_GOAL = ['竹林斩妖', '古道斩妖', '山寨斩妖', '魔窟斩妖'];   // 和 CHRON.ZONE 同一顺序
function cqGoalName(n) { return n.g === 'kill' ? '全服斩妖' : n.g === 'zone' ? CQ_ZONE_GOAL[n.z] : n.g === 'king' ? '讨伐妖王' : n.g === 'jie' ? '斩完劫数' : '关键战告捷'; }
function cqFrame(q) {
  const old = CQS.q;
  if (old && (q.v < old.v || (q.v === old.v && q.g < old.g))) return;   // 晚到的旧帧不认，数只往上走
  CQS.q = q;
}
function cqHudRows() {
  const q = CQS.q; if (!q) return [];
  if (q.i >= CHRON.N) return [['江湖长卷', '全卷完成']];
  const n = chronNode(q.i); if (!n) return [];
  return [['江湖长卷', `${CHRON.CH[n.ch].n} · 第 ${n.k + 1}/${n.len} 节`], [cqGoalName(n), `${q.g} / ${q.nd}`]];
}
// 全服推进了：开新章念章名，不然念下一节的剧情；登录了就去领
function cqAdvanced(e) {
  const n = chronNode(e.i), done = e.i - e.from;
  if (M.worldKey) { /* 关键战里不打断大字，只弹一行提示 */ }
  else if (!n) { say('江湖长卷 · 全卷完成', 2, 'big', '全服侠客一起写完了这一卷'); SFX.gong(); }
  else if (n.k === 0) { say(`第 ${n.ch + 1} 章 · ${CHRON.CH[n.ch].n}`, 1.8, 'big', CHRON.CH[n.ch].d); SFX.gong(); }
  else say(done > 1 ? `江湖长卷推进 ${done} 节` : `长卷第 ${e.from + 1} 节完成`, 1.3, 'go', n.line);
  if (n) toast(`下一节：${n.t}`);
  if (cqCloud()) cqClaim();
}
// 看全服进度（登录了附上自己的秘卷和能领几节），claim：有没领的就领
async function cqLoad(claim) {
  if (OFFLINE_BUILD || !window.CloudSave || !CloudSave.chron) return;
  try {
    const r = await CloudSave.chron();
    if (r && r.s) { cqFrame({ i: r.s.node, g: r.s.got, nd: r.s.need, v: r.s.v }); }
    if (r && r.mine) CQS.mine = r.mine;
    cqModalText();
    if (claim && cqCloud() && r && r.mine && r.mine.todo > 0) cqClaim();
  } catch (e) {}
}
// 领奖：同一时间只领一次，领的时候又有新完成的就领完再领一次（服务器那边重复领也只算一次）
async function cqClaim() {
  if (!cqCloud()) return;
  if (CQS.busy) { CQS.want = true; return; }
  CQS.busy = true;
  try {
    const r = await CloudSave.chron('claim');
    if (r && r.mine) CQS.mine = r.mine;
    if (r && r.got > 0) {
      const mj = (r.mj || []).map(id => SC_BY[id] ? `「${SC_BY[id].n}」` : '').filter(Boolean);
      toast(`江湖长卷：领到 ${r.got} 节的奖励 · +${r.ink} 墨锭（下次打开武库到账）${mj.length ? ` · 秘卷${mj.join('、')}` : ''}`, 4);
    }
    if (r && r.mine && r.mine.todo > 0) CQS.want = true;
  } catch (e) {}
  CQS.busy = false;
  if (CQS.want) { CQS.want = false; setTimeout(cqClaim, 1500); }
}
// 关键战带的秘卷：全线共享的，再加长卷里拿到的最近几卷个人秘卷（不重复）
function cqKeyPerks() {
  const shared = ((rgRun() && rgRun().pk) || []).slice();
  const mine = ((CQS.mine && CQS.mine.mj) || []).filter(id => SC_BY[id] && !shared.includes(id)).slice(0, CHRON.PERS_MAX);
  return shared.concat(mine);
}
// 首页「开放世界」弹窗里的一行：全服推到第几节
function cqModalText() {
  const el = $id('worldChron'), q = CQS.q; if (!el || !q) return;
  const n = chronNode(q.i);
  const mine = CQS.mine ? ` · 个人秘卷 ${CQS.mine.mj.length} 卷` : '';
  el.textContent = n ? `江湖长卷 · 全服第 ${q.i + 1} / ${CHRON.N} 节 · ${CHRON.CH[n.ch].n}${mine}` : `江湖长卷 · 全卷完成${mine}`;
}
