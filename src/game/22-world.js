// ======================= 江湖共斗 · 开放世界（一张大地图，谁都能随时进出，分线不限人数） =======================
// 服务器（cloudflare/worker.js 的 WorldLine）模拟妖物和妖王、转发附近侠客的位置；本机只模拟自己的侠客，手感和单机一样。
// 别的侠客画成「同道」，按服务器每秒 10 帧插值；妖物出招时服务器广播一次，打没打中自己由本机判定（能格挡、能闪）。
// 自己打中妖物：本机先显示伤害，再跟着下一次上报一起交给服务器（服务器按距离和每秒上限封顶）。
// 每线 40 人，满了自动去下一线；可以在弹窗里输入线号去找朋友。
// 全服肉鸽：每条线一份共享进程（第几轮、第几劫、全线投票选出的秘卷、关键战），都以服务器为准，见文件末尾那一节。
const WORLD_W = 8000;
const WORLD_ZONES = [
  { n: '竹林', a: 0, b: 2000, tint: '60,120,80', d: '刀鬼、弓妖、夜枭出没' },
  { n: '古道', a: 2000, b: 4000, tint: '150,120,70', d: '缚灵夜行，妖物更凶' },
  { n: '山寨', a: 4000, b: 6000, tint: '160,80,50', d: '咒师聚众，火柱连天' },
  { n: '魔窟', a: 6000, b: 8000, tint: '150,40,60', d: '妖王盘踞之地' },
];
const WORLD_SEND = 1 / 8;          // 每秒上报 8 次（免费额度按发上去的消息算）
const WORLD_RESPAWN = 3;           // 倒下后几秒在这一段的土地庙复活
const WORLD_DMG = { blade: 7, shot: 5, trap: 4, fire: 9, dive: 6, slam: 18, charge: 16, bfire: 12 };
const WORLD = {
  on: false, ws: null, sess: 0, line: 1, id: 0, n: 0, kills: 0, nb: 40, myKills: 0, status: '', sendT: 0, hits: [],
  roster: new Map(), ghosts: new Map(), mons: new Map(), boss: null, shots: [], deadT: 0, hurtT: 9, zone: -1, calm: 0, tries: 0,
};
const worldZoneAt = x => Math.max(0, Math.min(WORLD_ZONES.length - 1, WORLD_ZONES.findIndex(z => x < z.b)));
const worldShrineX = zi => WORLD_ZONES[zi].a + 160;
function worldUrl(line) {
  const base = (window.CloudSave && CloudSave.getEndpoint ? CloudSave.getEndpoint() : '') || '';
  return base.replace(/^http/, 'ws') + '/api/world/line/' + line;
}
function worldSend(o) { const ws = WORLD.ws; if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(o)); } catch (e) {} } }
function worldHello() {
  const tk = window.CloudSave && CloudSave.worldToken ? CloudSave.worldToken() : '';   // 云端账号的登录令牌：服务器用它认人发奖励，游客不带
  worldSend({ t: 'hi', v: VERSION, name: rkOwner() || '', ch: CHARS[WORLD.hero] ? CHARS[WORLD.hero].id : A.ch.id, skin: WORLD.skin || A.skinKey || '', tk });
}
function worldConnect(line) {
  worldClose();
  const sess = ++WORLD.sess;
  WORLD.line = line; WORLD.status = `正在进入 ${line} 线…`;
  let ws;
  try { ws = new WebSocket(worldUrl(line)); } catch (e) { WORLD.status = '连不上服务器'; return; }
  WORLD.ws = ws;
  let opened = false;
  ws.onopen = () => { if (sess !== WORLD.sess) return; opened = true; worldHello(); };
  ws.onmessage = ev => { if (sess !== WORLD.sess) return; let o; try { o = JSON.parse(ev.data); } catch (e) { return; } worldMsg(o); };
  ws.onclose = () => {
    if (sess !== WORLD.sess || !WORLD.on) return;
    WORLD.ws = null; WORLD.id = 0;
    if (!opened) { worldProbe(); return; }
    if (WORLD.full) { WORLD.full = false; worldConnect(WORLD.line + 1); return; }
    // 掉线了：几秒后回原来那条线（满了会自动顺延）
    WORLD.status = '与江湖失联，正在重连…';
    if (++WORLD.tries <= 6) setTimeout(() => { if (sess === WORLD.sess && WORLD.on) worldConnect(WORLD.line); }, 1500 * WORLD.tries);
    else WORLD.status = '连不上服务器，退出后再进试试';
  };
}
// 一开始就连不上：看看是服务器还没更新（没有这个接口）还是网络不通
async function worldProbe() {
  try {
    const base = (window.CloudSave && CloudSave.getEndpoint ? CloudSave.getEndpoint() : '') || '';
    const r = await fetch(base + '/api/world/line/' + WORLD.line);
    WORLD.status = r.ok ? '进不去分线，过一会儿再试' : '服务器还没更新开放世界，请等开发者部署';
  } catch (e) { WORLD.status = '连不上服务器，检查一下网络'; }
}
function worldClose() {
  WORLD.sess++;
  const ws = WORLD.ws; WORLD.ws = null; WORLD.id = 0;
  if (ws) { try { ws.onclose = null; ws.close(); } catch (e) {} }
  WORLD.ghosts.clear(); WORLD.mons.clear(); WORLD.roster.clear(); WORLD.boss = null; WORLD.hits = [];
}
function worldMsg(o) {
  const W_ = WORLD;
  if (o.t === 'w') {
    W_.id = o.id; W_.line = o.line; W_.tries = 0; W_.status = '';
    W_.roster.clear(); for (const p of o.roster || []) W_.roster.set(p[0], p);
    try { localStorage.setItem('renying-world-line', String(o.line)); } catch (e) {}
    say(`江湖共斗 · ${o.line} 线`, 1.4, 'big', `已有 ${W_.roster.size} 位侠客在这条线上`);
  } else if (o.t === 'full') {
    W_.full = true; W_.status = `${o.line} 线已满，去 ${o.line + 1} 线…`;
  } else if (o.t === 're') worldHello();
  else if (o.t === 'k') worldFrame(o);
}
function worldEvent(e) {
  const W_ = WORLD;
  if (e.t === 'j') {
    const old = W_.roster.get(e.p[0]); W_.roster.set(e.p[0], e.p);
    if (old && old[2] !== e.p[2]) W_.ghosts.delete(e.p[0]);
  } else if (e.t === 'l') { W_.roster.delete(e.id); W_.ghosts.delete(e.id); }
  else if (e.t === 'x') {
    const m = W_.mons.get(e.m);
    if (m) { smoke(m.x, m.y - m.T.h / 2, 14); ring(m.x, m.y - 50, 70, m.T.eye, 0.35); SFX.poof(); W_.mons.delete(e.m); }
    if (e.by === W_.id) W_.myKills++;
  } else if (e.t === 'a') worldAttack(e);
  else if (e.t === 'bs') { say('妖王现世', 1.6, 'big', '魔窟深处妖气冲天，全线侠客速去讨伐！'); SFX.gong(); }
  else if (e.t === 'bk') {
    const top = (e.top || []).map((r, i) => `${i + 1}. ${r[0]} ${r[1]}`).join('  ');
    say('妖王伏诛', 1.8, 'big', `最后一击：${e.by}`); toast(`妖王伏诛！输出榜 ${top}`); SFX.gong();
    if (W_.boss) { smoke(W_.boss.x, -100, 30); ring(W_.boss.x, -90, 160, '255,80,80', 0.6); }
    W_.boss = null;
  } else if (e.t === 'bg') { say('妖王遁走', 1.4, 'big', '没能在时限内拿下，下回再战'); W_.boss = null; }
  else if (e.t === 'bw' && W_.boss) { W_.boss.warn = e.w; W_.boss.act = e.a; }
  else rgEvent(e);
}
// 服务器的血量减去自己还没交上去的伤害；刚打过的 0.6 秒内只降不升，免得血条来回跳（服务器没认的伤害之后会补回来）
function worldHp(m, srv) {
  const h = WORLD.hits.find(q => q[0] === m.id), pend = h ? h[1] : 0;
  const v = srv - pend;
  return m.hp !== undefined && clock - (m.lastHit || -9) < 0.6 ? Math.min(m.hp, v) : v;
}
function worldFrame(o) {
  const W_ = WORLD;
  W_.n = o.n; W_.kills = o.kills; W_.nb = o.nb;
  const seen = new Set();
  for (const r of o.p || []) {
    const [id, x, y, vx, f, st, tt, mv, sk, sp, ph, hp, mh] = r;
    const meta = W_.roster.get(id); if (!meta) continue;
    seen.add(id);
    let g = W_.ghosts.get(id);
    if (!g) {
      g = new Fighter(2); g.setChar(CHAR_IDX[meta[2]] !== undefined ? CHAR_IDX[meta[2]] : 0);
      try { const lk = meta[3] && SKINS[meta[3]] && skinLook(g.chIdx, meta[3]); g.skinKey = lk ? meta[3] : ''; g.look = lk || { ...g.ch.look, name: g.ch.name }; } catch (e) {}
      g.reset(x); g.name = meta[1]; g.breakCD = 99; g.ctrl = new Ctrl();
      W_.ghosts.set(id, g);
    }
    g.tx = x; g.ty = y; g.vx = vx; g.face = f; g.hp = hp; g.maxHp = mh;
    if (g.state !== st || Math.abs(g.t - tt) > 0.15) g.t = tt;
    g.state = st; g.moveName = mv; g.move = st === 'attack' && mv && g.moves[mv] ? g.moves[mv] : null;
    g.skill = sk || null; g.sp = sp || null; g.skPh = ph;
  }
  for (const id of [...W_.ghosts.keys()]) if (!seen.has(id)) W_.ghosts.delete(id);   // 走出视野
  const ms = new Set();
  for (const r of o.m || []) {
    const [id, key, x, y, hp, mh, f, warn, zi] = r;
    ms.add(id);
    let m = W_.mons.get(id);
    if (!m) { m = { id, key, T: MON_TYPES[key] || MON_TYPES.blade, x, y, ph: Math.random() * 6, flash: 0, act: null }; W_.mons.set(id, m); }
    m.tx = x; m.ty = y; m.hp = worldHp(m, hp); m.maxHp = mh; m.face = f; m.wind = warn ? 1 : 0; m.zi = zi;
  }
  for (const id of [...W_.mons.keys()]) if (!ms.has(id)) W_.mons.delete(id);
  if (o.b) {
    const [id, x, hp, mh, f, act, life] = o.b;
    if (!W_.boss || W_.boss.id !== id) W_.boss = { id, x, y: 0, hp, ph: 0, flash: 0, warn: 0 };
    const b = W_.boss; b.tx = x; b.hp = worldHp(b, hp); b.maxHp = mh; b.face = f; b.act = act; b.life = life;
  } else W_.boss = null;
  if (o.r) rgFrame(o.r);
  for (const e of o.e || []) worldEvent(e);
}
// 服务器说某只妖物出招了：本机把这一招放出来，只判定会不会打到自己
function worldAttack(e) {
  const S = WORLD.shots, dk = e.dk || 1;
  const m = WORLD.mons.get(e.m);
  if (m) { m.wind = 0; m.x = e.x; }
  if (e.k === 'blade') {
    const hb = [e.x + (e.f > 0 ? 0 : -86), e.y - 100, e.x + (e.f > 0 ? 86 : 0), e.y - 10];
    slashLine(e.x + e.f * 50, e.y - 60, e.f > 0 ? -0.3 : 3.44, (m ? m.T.eye : '255,70,60')); SFX.swing();
    if (overlap(hb, hurtbox(A))) worldHurt(e.x, WORLD_DMG.blade * dk, 220, 0.35, false, false, '255,70,60');
  } else if (e.k === 'shot') S.push({ x: e.x + e.f * 20, y: e.y - 70, vx: e.vx, life: 1.6, dmg: WORLD_DMG.shot * dk });
  else if (e.k === 'trap') S.push({ trap: true, x: e.at, y: 0, t: e.delay, r: 60, dmg: WORLD_DMG.trap * dk });
  else if (e.k === 'fire') S.push({ fire: true, x: e.at, y: 0, t: e.delay, r: e.m === (WORLD.boss && WORLD.boss.id) ? 70 : 52, dmg: (e.m === (WORLD.boss && WORLD.boss.id) ? WORLD_DMG.bfire : WORLD_DMG.fire) * dk });
  else if (e.k === 'dive') S.push({ dive: true, x: e.x, y: e.y, vx: e.vx, vy: e.vy, life: 0.5, dmg: WORLD_DMG.dive * dk });
  else if (e.k === 'slam') {
    shake = Math.max(shake, 14); ring(e.x, -10, e.r, '255,90,70', 0.5); dust(e.x, 0, 24); SFX.thud();
    if (Math.abs(A.x - e.x) < e.r && A.y > -60) worldHurt(e.x, WORLD_DMG.slam * dk, 0, 0.5, true, false, '255,90,70');
  } else if (e.k === 'charge') S.push({ charge: true, x: e.x, vx: e.vx, life: e.len, dmg: WORLD_DMG.charge * dk });
}
// 妖物打到自己（和斩妖列传一样能格挡、能腾空闪躲开，只是这里真的会倒下）
function worldHurt(fromX, dmg, kb, stun, launch, root, rgb) {
  const tf = A;
  if (paused || tf.invul > 0 || tf.escInvul || tf.hp <= 0 || WORLD.hurtT < 0.25) return;
  const dir = tf.x >= fromX ? 1 : -1;
  const holding = !!(tf.ctrl && tf.ctrl.held && tf.ctrl.held.down);
  const blocking = !launch && ((tf.state === 'block' || tf.state === 'blockstun') || (holding && ['idle', 'walk'].includes(tf.state)));
  hitFX(tf.x, tf.y - 60, blocking ? 0.5 : 0.9, rgb, dir);
  WORLD.calm = 0;
  if (blocking) { tf.face = -dir; tf.state = 'blockstun'; tf.t = 0; tf.stun = 0.12; tf.vx = dir * 160; WORLD.hurtT = 0.2; SFX.block(); return; }
  tf.hp = Math.max(0, tf.hp - dmg); WORLD.hurtT = 0; tf.flash = 0.1; tf.sinceHit = 0;
  toNeutral(tf);
  if (launch || tf.hp <= 0) { tf.state = 'launched'; tf.t = 0; tf.vy = -560; tf.vx = dir * Math.max(kb, 200) * 0.6; tf.y = Math.min(tf.y, -1); tf.juggle = 1; }
  else { tf.state = 'hitstun'; tf.t = 0; tf.stun = stun; tf.vx = root ? 0 : dir * kb; tf.rooted = !!root; }
  hitstop = Math.max(hitstop, 0.05); shake = Math.max(shake, 6); SFX.hit(1);
  if (tf.hp <= 0) { WORLD.deadT = WORLD_RESPAWN; tf.invul = 99; say('力竭', 1.2, 'big', `${WORLD_RESPAWN} 秒后在土地庙复活`); }
}
// 自己的招式打中「代理」B：伤害算到离出手的人最近的那只妖物（或妖王）身上
function worldTargets() {
  const out = [...WORLD.mons.values()].filter(m => m.hp > 0);
  if (WORLD.boss && WORLD.boss.hp > 0) out.push(WORLD.boss);
  return out;
}
const worldBox = m => m.T ? [m.x - m.T.w, m.y - m.T.h, m.x + m.T.w, m.y] : [m.x - 70, -210, m.x + 70, 0];
function worldHit(att, mv, pt, target) {
  const mon = target || worldTargets().sort((a, b) => Math.abs(a.x - att.x) + Math.abs(a.y - att.y) - Math.abs(b.x - att.x) - Math.abs(b.y - att.y))[0];
  if (!mon || att !== A) return;
  const dir = mv.dir || (mon.x >= att.x ? 1 : -1);
  const dmg = Math.min(160, mv.dmg || 0); if (!(dmg > 0)) return;
  mon.hp -= dmg; mon.flash = 0.1; mon.lastHit = clock;
  if (mon.T) { mon.x += dir * 24; }
  const h = WORLD.hits.find(q => q[0] === mon.id); if (h) h[1] += dmg; else WORLD.hits.push([mon.id, dmg]);
  att.hitConfirmed = true; att.meter = Math.min(100, att.meter + dmg * 0.35);
  const x = pt ? pt[0] : mon.x, y = pt ? pt[1] : mon.y - 60;
  hitFX(x, y, clamp(dmg / 8, 0.5, 1.6), att.look.slash, dir); hitstop = Math.max(hitstop, (mv.hs || 0.06) * 0.8); shake = Math.max(shake, 4); SFX.hit(1);
  addP({ type: 'text', text: String(Math.round(dmg * 10) / 10), x: mon.x, y: (mon.T ? mon.y - mon.T.h : -230) - 20, life: 0.5, max: 0.5, rgb: '255,240,220' });
  comboUI[0].n++; comboUI[0].dmg += dmg; comboUI[0].t = 1.6;
}
// 进大地图（刚进来，或打完关键战回来）：本机的对局换成开放世界，B 当妖物的代理
function worldEnterMode(heroIdx, x) {
  FOREST.on = false; B.forestProxy = false; M.worldKey = null;
  initAudio(); paused = false; showScreen(null);
  startMatch('world', 'normal', [heroIdx, 0]);
  M.phase = 'fight'; M.t = 0; creditT = 0; creditPending = false;
  B.ctrl = new Ctrl(); B.worldProxy = true; B.hidden = true; B.invul = 99; B.look = { ...B.look, name: '妖物' };
  Object.assign(WORLD, { shots: [], deadT: 0, hurtT: 9, zone: -1, calm: 0, sendT: 0 });
  A.x = x; A.face = 1; cam.x = A.x;
}
function worldStart(heroIdx) {
  if (OFFLINE_BUILD) { toast('离线版没有江湖共斗，请用联网版'); return; }
  if (typeof heroIdx !== 'number' || heroIdx < 0 || heroIdx >= CHARS.length) heroIdx = 0;
  WORLD.hero = heroIdx; WORLD.on = true;
  worldEnterMode(heroIdx, worldShrineX(0) + 80);
  WORLD.skin = A.skinKey || '';
  Object.assign(WORLD, { n: 0, kills: 0, myKills: 0, tries: 0, full: false, run: null, keySeq: 0 });
  let line = 1;
  try { line = Math.max(1, Math.min(9999, +localStorage.getItem('renying-world-line') || 1)); } catch (e) {}
  if (WORLD.wantLine) { line = WORLD.wantLine; WORLD.wantLine = 0; }
  worldConnect(line);
}
function worldLeave() {
  if (!WORLD.on) return;
  WORLD.on = false; worldClose(); M.worldKey = null; rgVoteUI();
  B.worldProxy = false; B.hidden = false; B.invul = 0;
}
// 每个逻辑步（1/120 秒）：插值同道和妖物、处理本机这边的妖物攻击、复活、上报
function worldUpdate() {
  const W_ = WORLD;
  M.t += STEP; W_.hurtT += STEP; W_.calm += STEP;
  const k = 1 - Math.exp(-12 * STEP);
  for (const g of W_.ghosts.values()) {
    g.x += (g.tx - g.x) * k; g.y += (g.ty - g.y) * k; g.t += STEP;
    if (!RESIM) animFighter(g);
  }
  for (const m of W_.mons.values()) {
    m.x += (m.tx - m.x) * k; m.y += (m.ty - m.y) * k; m.ph += STEP; m.flash = Math.max(0, m.flash - STEP);
  }
  const b = W_.boss;
  if (b) { b.x += (b.tx - b.x) * k; b.ph += STEP; b.flash = Math.max(0, b.flash - STEP); b.warn = Math.max(0, (b.warn || 0) - STEP); }
  // 自己的近身招式扫过哪只妖物就算哪只（和斩妖列传一样）
  if (A.state === 'attack' && A.move && !A.hitDone && A.t >= A.move.su && A.t < A.move.su + A.move.ac) {
    const hb = hitbox(A, A.move.box), hit = worldTargets().find(m => overlap(hb, worldBox(m)));
    if (hit) { A.hitDone = true; worldHit(A, A.move, [hit.x, (hit.T ? hit.y : -50) - 50], hit); }
  }
  // 代理 B 放在离自己最近的妖物身上，技能、飞行道具、大招都能自动瞄准它
  const near = worldTargets().sort((p, q) => Math.abs(p.x - A.x) - Math.abs(q.x - A.x))[0];
  if (near && Math.abs(near.x - A.x) < 900) { B.x = near.x; B.y = near.T ? near.y : 0; B.vx = B.vy = 0; B.invul = 0; B.hp = B.maxHp; B.state = near.T && near.T.fly ? 'launched' : 'idle'; }
  else { B.x = clamp(A.x + A.face * 600, WALL, STAGE_W - WALL); B.y = 0; B.invul = 99; }
  worldShots();
  // 倒下：几秒后在这一段的土地庙满血站起来；不挨打 5 秒后慢慢回血
  if (W_.deadT > 0) {
    W_.deadT -= STEP; human[0].clear();
    if (A.onGround() && A.state !== 'knockdown' && A.state !== 'launched') { A.state = 'knockdown'; A.t = 0; A.vx *= 0.5; A.move = null; A.skill = null; }
    if (W_.deadT <= 0) {
      const zi = worldZoneAt(A.x); A.reset(worldShrineX(zi) + 60); A.face = 1; A.invul = 1.2;
      ring(A.x, -60, 90, '233,196,106', 0.5); say('土地庙 · 重整旗鼓', 0.9);
    }
  } else if (W_.calm > 5 && A.hp > 0 && A.hp < A.maxHp) A.hp = Math.min(A.maxHp, A.hp + 4 * STEP);
  const zi = worldZoneAt(A.x);
  if (zi !== W_.zone) { if (W_.zone >= 0) say(WORLD_ZONES[zi].n, 1, 'go', WORLD_ZONES[zi].d); W_.zone = zi; }
  W_.sendT -= STEP;
  if (W_.sendT <= 0 && W_.id) {
    W_.sendT = WORLD_SEND;
    const o = { t: 's', x: r2(A.x), y: r2(A.y), vx: r2(A.vx), f: A.face, st: A.state, tt: r2(A.t), mv: A.state === 'attack' ? (A.moveName || '') : '', sk: A.skill || '', sp: A.sp || '', ph: A.skPh || 0, hp: Math.round(A.hp), mh: A.maxHp };
    if (W_.hits.length) { o.h = W_.hits.map(h => [h[0], Math.round(h[1] * 10) / 10]); W_.hits = []; }
    worldSend(o);
  }
}
function worldShots() {
  const S = WORLD.shots;
  for (const q of S) {
    if (q.trap || q.fire) {
      q.t -= STEP;
      if (q.t <= 0 && !q.done) {
        q.done = true; q.life = 0.35;
        if (q.fire) { flashA = Math.max(flashA, 0.06); flashRGB = '255,170,90'; SFX.thud(); for (let i = 0; i < 12; i++) addP({ type: 'spark', x: q.x + rand(-30, 30), y: -rand(0, 200), vx: rand(-60, 60), vy: -rand(100, 400), life: 0.5, max: 0.5, rgb: '255,160,70', w: 2 }); }
        else { ring(q.x, -10, 70, '200,120,255', 0.4); SFX.poof(); }
        if (Math.abs(A.x - q.x) < q.r && A.y > -60) worldHurt(q.x, q.dmg, 0, q.fire ? 0.4 : 0.6, q.fire, !q.fire, q.fire ? '255,160,70' : '200,120,255');
      }
      if (q.done) q.life -= STEP;
    } else if (q.dive) {
      q.x += q.vx * STEP; q.y += q.vy * STEP; q.life -= STEP;
      if (!q.hitDone && overlap([q.x - 30, q.y - 20, q.x + 30, q.y + 20], hurtbox(A))) { q.hitDone = true; worldHurt(q.x, q.dmg, 260, 0.35, false, false, '255,230,90'); }
    } else if (q.charge) {
      q.x += q.vx * STEP; q.life -= STEP; dust(q.x, 0, 1);
      if (!q.hitDone && overlap([q.x - 80, -190, q.x + 80, 0], hurtbox(A))) { q.hitDone = true; worldHurt(q.x - Math.sign(q.vx) * 40, q.dmg, 420, 0.5, true, false, '255,90,70'); }
    } else {
      q.x += q.vx * STEP; q.life -= STEP;
      if (overlap([q.x - 14, q.y - 5, q.x + 14, q.y + 5], hurtbox(A))) { q.life = 0; worldHurt(q.x - Math.sign(q.vx) * 10, q.dmg, 180, 0.3, false, false, '120,255,140'); }
      else if (A.state === 'attack' && A.move && A.t >= A.move.su && A.t < A.move.su + A.move.ac && overlap(hitbox(A, A.move.box), [q.x - 14, q.y - 5, q.x + 14, q.y + 5])) { q.life = 0; blockFX(q.x, q.y, A.face); SFX.block(); }
    }
  }
  WORLD.shots = S.filter(q => (q.trap || q.fire) ? !(q.done && q.life <= 0) : q.life > 0);
}
// 镜头：跟着自己，把附近的妖物框进来
function worldCamera(dt) {
  const near = worldTargets().filter(m => Math.abs(m.x - A.x) < 700).map(m => m.x);
  const xs = [A.x, ...near], lo = Math.min(...xs), hi = Math.max(...xs);
  const fx = clamp((lo + hi) / 2, A.x - 300, A.x + 300);
  cam.x = damp(cam.x, fx, 6, dt); cam.zoom = damp(cam.zoom, clamp(1.1 - (hi - lo) / 1700, 0.62, 1.02), 3, dt);
  cam.y = damp(cam.y, Math.min(0, A.y * 0.4), 6, dt);
}
// 地面上的东西：每段的颜色、界碑、土地庙、妖物、飞行物、妖王（在侠客后面画）
function drawWorld() {
  const vw = W / worldScale(), l = cam.x - vw / 2 - 200, r = cam.x + vw / 2 + 200;
  for (const [i, z] of WORLD_ZONES.entries()) {
    if (z.b < l || z.a > r) continue;
    ctx.fillStyle = `rgba(${z.tint},0.12)`; ctx.fillRect(z.a, 0, z.b - z.a, 120);
    const sx = worldShrineX(i);   // 土地庙：复活点
    ctx.fillStyle = '#2a1e18'; ctx.fillRect(sx - 34, -62, 68, 62);
    ctx.fillStyle = '#5a2a1e'; ctx.beginPath(); ctx.moveTo(sx - 50, -60); ctx.lineTo(sx, -96); ctx.lineTo(sx + 50, -60); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,190,110,0.75)'; ctx.fillRect(sx - 9, -40, 18, 26);
    ctx.font = `16px ${TITLE_FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(233,196,106,0.85)'; ctx.fillText('土地庙', sx, -106);
    if (i > 0) {   // 界碑
      ctx.fillStyle = '#3a3a44'; ctx.fillRect(z.a - 12, -120, 24, 120);
      ctx.save(); ctx.font = `20px ${TITLE_FONT}`; ctx.fillStyle = 'rgba(239,232,216,0.9)'; ctx.textAlign = 'center';
      [...z.n].forEach((c, k) => ctx.fillText(c, z.a, -94 + k * 24)); ctx.restore();
    }
  }
  const S = WORLD.shots;
  drawMons([...WORLD.mons.values()].filter(m => m.x > l && m.x < r), S.filter(q => !q.dive && !q.charge));
  for (const q of S) if (q.dive) { ctx.strokeStyle = 'rgba(255,230,90,0.6)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x - q.vx * 0.05, q.y - q.vy * 0.05); ctx.stroke(); }
  if (WORLD.boss) drawWorldBoss(WORLD.boss);
}
function drawWorldBoss(b) {
  const x = b.x, f = b.face || -1, bob = Math.sin(b.ph * 2.4) * 4, warn = b.warn > 0 || b.act === 'charge';
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(x, 3, 90, 12, 0, 0, Math.PI * 2); ctx.fill();
  if (warn) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,60,60,0.22)'; circle([x, -110], 150); ctx.globalCompositeOperation = 'source-over'; }
  ctx.fillStyle = b.flash > 0 ? '#f0e0e0' : '#120a10'; ctx.strokeStyle = 'rgba(255,80,80,0.6)'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 66, 0); ctx.lineTo(x - 76, -120 + bob); ctx.quadraticCurveTo(x - 40, -200 + bob, x, -206 + bob);
  ctx.quadraticCurveTo(x + 40, -200 + bob, x + 76, -120 + bob); ctx.lineTo(x + 66, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - 30, -196 + bob); ctx.lineTo(x - 52, -246 + bob); ctx.lineTo(x - 14, -204 + bob); ctx.moveTo(x + 30, -196 + bob); ctx.lineTo(x + 52, -246 + bob); ctx.lineTo(x + 14, -204 + bob); ctx.fill();
  ctx.fillStyle = warn ? '#ffd0a0' : '#ff3c3c'; circle([x + f * 8 - 14, -168 + bob], 5); circle([x + f * 8 + 14, -168 + bob], 5);
  ctx.strokeStyle = b.flash > 0 ? '#fff' : '#8a6070'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(x + f * 60, -120 + bob); ctx.quadraticCurveTo(x + f * 130, -160 - (warn ? 50 : 0), x + f * 150, -60); ctx.stroke();
  ctx.font = `18px ${TITLE_FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,170,170,0.9)'; ctx.fillText(cvT('妖王'), x, -262 + bob);
  ctx.restore();
}
// 同道：别的侠客，头顶写名字（在自己身后画）
function drawWorldGhosts() {
  const vw = W / worldScale(), l = cam.x - vw / 2 - 200, r = cam.x + vw / 2 + 200;
  for (const g of WORLD.ghosts.values()) {
    if (g.x < l || g.x > r) continue;
    if (g.hp > 0) { ctx.save(); ctx.strokeStyle = `rgba(${ID_ALLY},0.55)`; ctx.lineWidth = 1.4 / worldScale(); ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.ellipse(g.x, 2, 36, 7, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }   // 同道：脚下一道淡淡的虚线圈，和自己的金圈分开
    drawFighter(g);
    if (!g.sk) continue;
    ctx.save(); ctx.font = `15px ${BODY_FONT}`; ctx.textAlign = 'center';
    const y = g.sk.head[1] - 34;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(g.x - 46, y - 14, 92, 4);
    ctx.fillStyle = g.hp > 0 ? '#46d3ea' : 'rgba(255,255,255,0.3)'; ctx.fillRect(g.x - 46, y - 14, 92 * clamp(g.hp / (g.maxHp || 1), 0, 1), 4);
    ctx.fillStyle = 'rgba(200,240,255,0.9)'; ctx.fillText(g.name || '侠客', g.x, y - 20);
    ctx.restore();
  }
}
function drawWorldHUD() {
  const key = !!M.worldKey, fs = Math.max(13, Math.round(H * 0.019)), x = W - Math.max(24, W * 0.04), y = Math.max(22, H * 0.04) + (key ? 150 : 84), w = fs * 13;
  const zi = worldZoneAt(A.x), z = WORLD_ZONES[zi];
  const rows = WORLD.status ? [['状态', WORLD.status]] : key ? rgHudRows() : [
    ['所在', `${WORLD.line} 线 · ${z.n}`],
    ['本线侠客', `${WORLD.n} 人`],
    ['本线斩妖', `${WORLD.kills} 只（你 ${WORLD.myKills}）`],
    [WORLD.boss ? '妖王' : '妖王现世', WORLD.boss ? `魔窟 · 余 ${WORLD.boss.life || 0} 秒` : `还差 ${WORLD.nb} 只`],
    ...rgHudRows(),
  ];
  ctx.save(); ctx.textBaseline = 'top'; ctx.font = `${fs}px ${BODY_FONT}`;
  const hh = (rows.length + 1) * fs * 1.65 + 12;
  ctx.fillStyle = 'rgba(8,8,20,0.72)'; ctx.fillRect(x - w - 12, y - 10, w + 24, hh);
  ctx.strokeStyle = 'rgba(233,196,106,0.45)'; ctx.lineWidth = 1; ctx.strokeRect(x - w - 12, y - 10, w + 24, hh);
  ctx.textAlign = 'left'; ctx.fillStyle = '#e9c46a'; ctx.fillText(key ? '全服肉鸽 · 关键战' : '江湖共斗 · 开放世界', x - w, y);
  rows.forEach(([kk, v], i) => {
    const yy = y + (i + 1) * fs * 1.65;
    ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(239,232,216,0.65)'; ctx.fillText(kk, x - w, yy);
    ctx.textAlign = 'right'; ctx.fillStyle = '#efe8d8'; ctx.fillText(v, x, yy);
  });
  if (key) { ctx.restore(); return; }   // 关键战里只留肉鸽这几行，挪到血条下面，不挡技能栏
  // 山河小图：四段地图、自己、附近的同道、妖王
  const my = y + hh + 6, mw = w + 24, mx = x - w - 12;
  ctx.fillStyle = 'rgba(8,8,20,0.72)'; ctx.fillRect(mx, my, mw, 14);
  for (const zz of WORLD_ZONES) { ctx.fillStyle = `rgba(${zz.tint},0.45)`; ctx.fillRect(mx + mw * zz.a / WORLD_W, my + 4, mw * (zz.b - zz.a) / WORLD_W - 1, 6); }
  ctx.fillStyle = '#46d3ea'; for (const g of WORLD.ghosts.values()) ctx.fillRect(mx + mw * g.x / WORLD_W - 1, my + 2, 2, 10);
  if (WORLD.boss) { ctx.fillStyle = '#ff4d4d'; ctx.fillRect(mx + mw * WORLD.boss.x / WORLD_W - 2, my, 4, 14); }
  ctx.fillStyle = '#38d976'; ctx.fillRect(mx + mw * A.x / WORLD_W - 2, my, 4, 14);
  ctx.restore();
  if (WORLD.boss) {   // 妖王血条：全线共用
    const b = WORLD.boss, bw = Math.min(W * 0.5, 640), bx = (W - bw) / 2, by = H - Math.max(70, H * 0.1);
    ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx - 3, by - 3, bw + 6, 16);
    ctx.fillStyle = '#c42a45'; ctx.fillRect(bx, by, bw * clamp(b.hp / (b.maxHp || 1), 0, 1), 10);
    ctx.font = `${fs}px ${TITLE_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillStyle = '#ffd0c0';
    ctx.fillText(`${cvT('妖王 · 全线共讨')}  ${Math.max(0, Math.ceil(b.hp))} / ${b.maxHp}`, W / 2, by - 6); ctx.restore();
  }
}
// 入口：首页「开放世界」打开一个小弹窗，直接进或者填线号找朋友；肉鸽弹窗里的「全服肉鸽」直接进（自动分线）。都先在点将台选侠客
function worldEnter(line) {
  WORLD.wantLine = line >= 1 && line <= 9999 ? Math.floor(line) : 0;
  bpStart('world');
}
function openWorldModal() { const m = $id('modalWorld'); if (m) m.classList.remove('hidden'); }
function closeWorldModal() { const m = $id('modalWorld'); if (m) m.classList.add('hidden'); }
if ($id('mWorld')) $id('mWorld').addEventListener('click', () => { SFX.slice(); openWorldModal(); });
if ($id('modalWorldClose')) $id('modalWorldClose').addEventListener('click', closeWorldModal);
if ($id('btnWorldGo')) $id('btnWorldGo').addEventListener('click', () => { closeWorldModal(); worldEnter(0); });
if ($id('btnWorldLine')) {
  const goLine = () => {
    const n = +(($id('worldLineIn') && $id('worldLineIn').value) || 0);
    if (!(n >= 1 && n <= 9999)) { toast('线号是 1 到 9999 的数字'); return; }
    closeWorldModal(); worldEnter(n);
  };
  $id('btnWorldLine').addEventListener('click', goLine);
  $id('worldLineIn').addEventListener('keydown', e => { if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); goLine(); } });
}
if ($id('btnRougeGoWorld')) {
  $id('btnRougeGoWorld').addEventListener('click', () => {
    if (typeof closeRougeModal === 'function') closeRougeModal();
    worldEnter(0);
  });
}

// ======================= 全服肉鸽：每条分线共享的肉鸽进程 =======================
// 一轮 5 劫：每劫全线一起斩够妖物 → 全线投票选一卷秘卷（人人都得到，服务器记着，中途进来、刷新、重连都还在）→ 第 5 劫斩够后开关键战。
// 关键战：线上真人够 3 个就打天道 Boss——每人在自己网页里打一场同袍肉鸽（自己 + 2 名天道同袍 vs 服务器指定的同一只融魂魔首），
// 魔首的血全线共享，以服务器为准。打赢后够资格的云端账号由服务器发星座皮肤（下次打开武库自动领），网页里不加任何东西。
const RG_JIE = 5;
const rgRun = () => WORLD.run || null;
function rgFrame(r) {
  const W_ = WORLD; W_.run = r;
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
  else if (e.t === 'rp') {
    const s = SC_BY[e.pick];
    say(`全线共享「${s ? s.n : e.pick}」`, 1.4, 'big', `第 ${e.j} / ${RG_JIE} 劫 · 已有 ${e.perks.length} 卷秘卷`);
  } else if (e.t === 'ks') { if (e.kind === 'boss') say('天道 Boss 降世', 1.6, 'big', '全线侠客共讨融魂魔首'); else say('天道车轮战', 1.6, 'big', '线上真人不足 3 位：各自迎战 3 位天道侠客'); SFX.gong(); }
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
  return [['全服肉鸽', `第 ${r.c} 轮 · 第 ${r.j}/${RG_JIE} 劫`], [r.k ? '关键战' : '本劫斩妖', st], ['共享秘卷', `${(r.pk || []).length} 卷`]];
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
    M.towerPerks = (rgRun().pk || []).slice(); scRoundStart();
    B.maxHp = k.mh; B.hp = B.lagHp = Math.max(1, k.hp); W_.kLastB = B.hp; M.timer = k.u;
    say('天道 Boss · 全线共讨', 1.5, 'big', `融魂魔首【${M.raidBoss && M.raidBoss.heroNames ? M.raidBoss.heroNames.join('·') : ''}】· 共享 ${M.towerPerks.length} 卷秘卷`);
  } else {   // 真人不够：自己 + 2 名同袍车轮战 3 位天道侠客，秘卷照样带着，对面不带
    const foes = (k.h || []).map(id => CHAR_IDX[id]).filter(i => i !== undefined);
    while (foes.length < 3) foes.push((W_.hero + 5 + foes.length * 3) % CHARS.length);
    M.worldKey = { kind: 'trio', seq: k.s };
    B.worldProxy = false; B.hidden = false; B.invul = 0;
    M.towerPerks = (rgRun().pk || []).slice(); M.foeScrolls = []; M.scRun = {};
    startTag3Match([W_.hero, ...rgMates(W_.hero)], foes, 'god');
    creditT = 0; creditPending = false;
    say('天道车轮战', 1.5, 'big', `对阵【${foes.map(i => CHARS[i].name).join('·')}】· 带着 ${M.towerPerks.length} 卷共享秘卷`);
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
