

class WorldSim {
  constructor(rnd = Math.random) {
    this.rnd = rnd; this.t = 0; this.players = new Map(); this.mons = []; this.nid = 1; this.mid = 1;
    this.kills = 0; this.sinceBoss = 0; this.boss = null; this.spawnT = 0; this.events = [];
    this.run = rgNew(); this.rewards = []; this.dirty = false; this.line = 0;
    this.cq = { v: cqVec(), by: {} }; this.chron = null;   // 江湖长卷：还没报上去的出力；全服进度（分线从 D1 读来的）
  }
  get count() { return this.players.size; }
  join(meta) {
    if (this.line > 0 && this.players.size >= WL.CAP) return 0;
    const id = this.nid++;
    const ch = C.HERO_IDS.includes(meta && meta.ch) ? meta.ch : 'qingfeng';
    const skin = typeof (meta && meta.skin) === 'string' && /^[a-z]{2}_[a-z0-9]{1,20}$/.test(meta.skin) ? meta.skin : '';
    this.players.set(id, { id, name: wlName(meta && meta.name, id), ch, skin, x: 200 + this.rnd() * 400, y: 0, vx: 0, f: 1, st: 'idle', tt: 0, mv: '', sk: '', sp: '', ph: 0,
      hp: 100, mh: 100, seen: this.t, budget: WL.BURST, bt: this.t, uid: '', born: 0, jies: 0, inKey: false, keyIn: 0, keyDmg: 0 });
    return id;
  }
  // 登录令牌核对成云端账号以后：记下 uid 和注册时间（发奖励用）。同一个号开两个网页只算一个真人
  setAuth(id, uid, born) { const p = this.players.get(id); if (p) { p.uid = String(uid || ''); p.born = +born || 0; } }
  leave(id) {
    this.players.delete(id); if (this.boss && this.boss.dmg) delete this.boss.dmg[id];
    const v = this.run.vote; if (v) delete v.votes[id];
  }
  meta(p) { return [p.id, p.name, p.ch, p.skin]; }
  state(id, s) {
    const p = this.players.get(id); if (!p || !s) return false;
    p.x = wlNum(s.x, 0, WL.W, p.x); p.y = wlNum(s.y, -3000, 0, 0); p.vx = wlNum(s.vx, -3000, 3000); p.f = s.f < 0 ? -1 : 1;
    p.st = wlStr(s.st) || 'idle'; p.tt = wlNum(s.tt, 0, 60); p.mv = wlStr(s.mv); p.sk = wlStr(s.sk); p.sp = wlStr(s.sp); p.ph = wlNum(s.ph, 0, 9) | 0;
    p.mh = wlNum(s.mh, 1, 9999, 100); p.hp = wlNum(s.hp, 0, p.mh, p.mh);
    p.inKey = !!(s.kf && this.run.key);   // 在打关键战：妖物不追他
    if (p.inKey) this.run.key.in[id] = 1;
    if (C.HERO_IDS.includes(s.ch) && s.ch !== p.ch) { p.ch = s.ch; p.skin = ''; this.events.push({ t: 'j', p: this.meta(p), x: p.x }); }
    p.seen = this.t;
    return true;
  }
  // 侠客说自己打中了哪只妖物：要离得够近，伤害单次封顶，再按每秒上限扣掉攒着的额度
  hit(id, mid, d) {
    const p = this.players.get(id); d = +d;
    if (!p || !(d > 0)) return 0;
    const m = (this.boss && this.boss.id === mid) ? this.boss : this.mons.find(q => q.id === mid);
    if (!m || m.hp <= 0 || Math.abs(p.x - m.x) > WL.HIT_RANGE + (m.boss ? 160 : 0)) return 0;
    p.budget = Math.min(WL.BURST, p.budget + (this.t - p.bt) * WL.DPS); p.bt = this.t;
    d = Math.min(d, WL.HIT_MAX, p.budget); if (d <= 0) return 0;
    p.budget -= d; m.hp -= d;
    if (m.boss) m.dmg[id] = (m.dmg[id] || 0) + d;
    else { m.stag = Math.max(m.stag, 0.3); m.wind = 0; m.act = null; m.vx = (m.x >= p.x ? 1 : -1) * 140; }
    if (m.hp <= 0) this.kill(m, p);
    return d;
  }
  kill(m, p) {
    m.hp = 0; this.kills++;
    if (m.boss) {
      const top = Object.entries(m.dmg).sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([pid, n]) => [(this.players.get(+pid) || { name: '已离开的侠客' }).name, Math.round(n)]);
      this.events.push({ t: 'bk', by: p.name, top, all: true });
      this.cqAdd('king', Object.keys(m.dmg).map(pid => (this.players.get(+pid) || {}).uid));
      this.boss = null; this.sinceBoss = 0;
    } else {
      this.sinceBoss++;
      this.events.push({ t: 'x', m: m.id, by: p.id, x: m.x });
      this.cqAdd('kill', [p.uid]); this.cqAdd('z' + m.zi, [p.uid]);
      const R = this.run;
      if (!R.vote && !R.key && R.got < R.need) { R.got++; if (R.got >= R.need) this.jieDone(); }
    }
  }
  zoneOf(x) { const i = WL.ZONES.findIndex(z => x < z.b); return i < 0 ? WL.ZONES.length - 1 : i; }
  spawn() {
    const want = Math.min(70, 10 + 3 * this.players.size);
    if (this.mons.length >= want) return;
    // 哪一段有人就多刷在哪一段，没人的地方也留几只
    const w = WL.ZONES.map(() => 1);
    for (const p of this.players.values()) w[this.zoneOf(p.x)] += 2;
    let r = this.rnd() * w.reduce((s, v) => s + v, 0), zi = 0;
    while (zi < w.length - 1 && r >= w[zi]) { r -= w[zi]; zi++; }
    const z = WL.ZONES[zi], key = z.keys[(this.rnd() * z.keys.length) | 0], T = WL.MON[key];
    let x = 0;
    for (let k = 0; k < 5; k++) {   // 别刷在侠客脸上
      x = z.a + 80 + this.rnd() * (z.b - z.a - 160);
      let near = false; for (const p of this.players.values()) if (Math.abs(p.x - x) < 450) near = true;
      if (!near) break;
    }
    const hp = Math.round(T.hp * z.hp * Math.min(RG.CYC_HP_MAX, 1 + RG.CYC_HP * (this.run.cyc - 1)));
    this.mons.push({ id: this.mid++, key, x, y: key === 'owl' ? -230 : 0, vx: 0, vy: 0, hp, mh: hp, f: 1, cd: 1 + this.rnd(), wind: 0, act: null, stag: 0,
      home: x, ph: this.rnd() * 6, zi, dk: z.dk, spd: T.spd, keep: T.keep });
  }
  spawnBoss() {
    const hp = 1500 + 600 * this.players.size, x = 6970;
    this.boss = { id: this.mid++, key: 'king', boss: true, x, y: 0, vx: 0, hp, mh: hp, f: -1, cd: 2.5, wind: 0, act: null, life: WL.BOSS_LIFE, dmg: {}, dk: 2, zi: 3 };
    this.events.push({ t: 'bs', all: true });
  }
  target(x, range) {
    let best = null, bd = range;
    for (const p of this.players.values()) { const d = Math.abs(p.x - x); if (p.hp > 0 && !p.inKey && d < bd) { bd = d; best = p; } }
    return best;
  }
  step(dt) {
    this.t += dt;
    for (const p of [...this.players.values()]) if (this.t - p.seen > WL.IDLE / 1000) this.leave(p.id);
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.players.size && !this.run.key) { this.spawn(); this.spawnT = 0.5; }
    this.rgStep();
    if (!this.boss && this.sinceBoss >= WL.BOSS_EVERY && this.players.size) this.spawnBoss();
    for (const m of this.mons) this.monStep(m, dt);
    this.mons = this.mons.filter(m => m.hp > 0);
    if (this.boss) this.bossStep(this.boss, dt);
  }
  monStep(m, dt) {
    m.ph += dt;
    const tgt = this.target(m.x, WL.AGGRO), dx = tgt ? tgt.x - m.x : m.home - m.x, d = Math.abs(dx), dir = Math.sign(dx) || m.f;
    if (m.stag > 0) { m.stag -= dt; m.vx *= 0.7; }
    else if (m.key === 'owl') {
      if (m.act === 'dive') { m.x += m.vx * dt; m.y += m.vy * dt; if (m.y > -30 || m.y < -320) { m.act = null; m.vx = 0; m.vy = 0; m.y = Math.min(-40, m.y); } }
      else {
        const tx = (tgt ? tgt.x : m.home) + Math.sin(m.ph * 0.8) * 200;
        m.vx = Math.max(-m.spd, Math.min(m.spd, (tx - m.x) * 2)); m.y += (-230 - m.y) * Math.min(1, 3 * dt); m.f = dir;
        if (m.wind > 0) { m.wind -= dt; m.vx *= 0.3; if (m.wind <= 0 && tgt) { const ty = tgt.y - 60 - m.y, l = Math.hypot(dx, ty) || 1; m.vx = dx / l * 760; m.vy = ty / l * 760; m.act = 'dive'; this.attack(m, { k: 'dive', vx: r1(m.vx), vy: r1(m.vy) }); } }
        else if (tgt && (m.cd -= dt) <= 0) { m.wind = 0.45; m.cd = 2.6 + this.rnd(); }
      }
    } else if (m.wind > 0) {
      m.wind -= dt; m.vx *= 0.5;
      if (m.wind <= 0) {
        if (m.key === 'blade') this.attack(m, { k: 'blade' });
        if (m.key === 'archer') this.attack(m, { k: 'shot', vx: m.f * 620 });
        if (m.key === 'binder') this.attack(m, { k: 'trap', at: r1(m.mark), delay: 0.8 });
        if (m.key === 'caster') this.attack(m, { k: 'fire', at: r1(m.mark), delay: 0.9 });
      }
    } else {
      m.f = dir;
      const want = !tgt ? (d > 60 ? dir * 0.35 : 0) : m.key === 'blade' ? (d > m.keep ? dir : 0) : (d > m.keep + 60 ? dir : d < m.keep - 60 ? -dir : 0);
      m.vx += (want * m.spd - m.vx) * Math.min(1, 6 * dt);
      if (tgt && (m.cd -= dt) <= 0 && (m.key !== 'blade' || d < 110) && d < 600) {
        m.wind = { blade: 0.5, archer: 0.4, binder: 0.5, caster: 0.5 }[m.key]; m.cd = { blade: 2.2, archer: 2.8, binder: 4.5, caster: 4.5 }[m.key] * (0.8 + 0.4 * this.rnd());
        m.mark = tgt.x;
      }
    }
    if (m.act !== 'dive') m.x += m.vx * dt;
    const z = WL.ZONES[m.zi];   // 妖物守着自己那一段，不会追出去
    m.x = Math.max(z.a, Math.min(z.b, m.x));
  }
  bossStep(b, dt) {
    b.life -= dt;
    if (b.life <= 0) { this.boss = null; this.sinceBoss = 0; this.events.push({ t: 'bg', all: true }); return; }
    const tgt = this.target(b.x, 1400);
    if (b.act === 'charge') {
      b.x += b.vx * dt; b.ct -= dt;
      if (b.ct <= 0 || b.x < 6000 || b.x > 7940) { b.act = null; b.vx = 0; b.x = Math.max(6000, Math.min(7940, b.x)); }
      return;
    }
    if (b.wind > 0) {
      b.wind -= dt;
      if (b.wind <= 0) {
        if (b.act === 'slam') this.attack(b, { k: 'slam', r: 300 });
        if (b.act === 'rain') for (const p of this.players.values()) if (p.hp > 0 && Math.abs(p.x - b.x) < 1400) this.attack(b, { k: 'fire', at: r1(p.x), delay: 0.9 });
        if (b.act === 'chargeW') { b.act = 'charge'; b.ct = 0.7; b.vx = b.f * 900; this.attack(b, { k: 'charge', vx: b.vx, len: 0.7 }); return; }
        b.act = null;
      }
      return;
    }
    if (!tgt) { b.vx = 0; return; }
    const dx = tgt.x - b.x; b.f = Math.sign(dx) || b.f;
    b.vx = Math.abs(dx) > 200 ? b.f * 110 : 0; b.x = Math.max(6000, Math.min(7940, b.x + b.vx * dt));
    if ((b.cd -= dt) <= 0) {
      const r = this.rnd();
      if (Math.abs(dx) < 320 && r < 0.5) { b.act = 'slam'; b.wind = 0.9; }
      else if (r < 0.75) { b.act = 'chargeW'; b.wind = 0.6; }
      else { b.act = 'rain'; b.wind = 0.7; }
      b.cd = 2.6 + this.rnd() * 1.2;
      this.events.push({ t: 'bw', a: b.act, x: r1(b.x), f: b.f, w: b.wind });
    }
  }
  attack(m, o) { this.events.push({ t: 'a', m: m.id, x: r1(m.x), y: r1(m.y), f: m.f, dk: m.dk, ...o }); }
  // 发给一位侠客的一帧：附近的侠客、附近的妖物、妖王（全线都看得到血条）
  frameFor(id) {
    const me = this.players.get(id); if (!me) return null;
    const ps = [];
    for (const p of this.players.values()) if (p.id !== id && Math.abs(p.x - me.x) <= WL.AOI) ps.push(p);
    if (ps.length > WL.NEAR) { ps.sort((a, b) => Math.abs(a.x - me.x) - Math.abs(b.x - me.x)); ps.length = WL.NEAR; }
    const b = this.boss;
    return {
      t: 'k', n: this.players.size, kills: this.kills, nb: Math.max(0, WL.BOSS_EVERY - this.sinceBoss),
      p: ps.map(p => [p.id, r1(p.x), r1(p.y), r1(p.vx), p.f, p.st, r1(p.tt), p.mv, p.sk, p.sp, p.ph, Math.round(p.hp), Math.round(p.mh)]),
      m: this.mons.filter(m => Math.abs(m.x - me.x) <= WL.AOI + 300).map(m => [m.id, m.key, r1(m.x), r1(m.y), Math.ceil(m.hp), m.mh, m.f, m.wind > 0 || m.act === 'dive' ? 1 : 0, m.zi]),
      b: b ? [b.id, r1(b.x), Math.ceil(b.hp), b.mh, b.f, b.act || '', Math.round(b.life)] : null,
      r: this.rgView(id),
      u: [...this.players.values()].filter(p => p.id !== id).map(p => [p.id, Math.round(p.x), Math.round(p.y), this.zoneOf(p.x)]),
      q: this.cqView(),
    };
  }
  /* ---------- 全服肉鸽的共享进程 ---------- */
  real() { return new Set([...this.players.values()].map(p => p.uid || 'g' + p.id)).size; }
  needOf() { return Math.min(RG.NEED_MAX, RG.NEED0 + RG.NEED_PER * this.players.size); }
  rgView(id) {
    const R = this.run, v = R.vote, k = R.key, me = this.players.get(id);
    const st = rgStory(R.story || 1);
    return {
      c: R.cyc, j: R.jie, g: R.got, nd: R.need, pk: R.perks, n: this.real(),
      story: R.story || 1, totalStories: R.totalStories || RG.TOTAL_STORIES,
      stName: st.name, stLore: st.lore,
      v: v ? { o: v.opts, u: Math.max(0, Math.ceil(v.until - this.t)), n: v.opts.map((_, i) => Object.values(v.votes).filter(x => x === i).length), my: v.votes[id] === undefined ? -1 : v.votes[id] } : null,
      k: k ? { kind: k.kind, s: k.seq, h: k.heroes, hp: Math.ceil(k.hp), mh: k.mh, u: Math.max(0, Math.ceil(k.until - this.t)), my: me ? Math.round(me.keyDmg) : 0 } : null,
    };
  }
  // 这一劫斩够了：在场的人都记一劫；还没到最后一劫就投票选秘卷，到了就开关键战
  jieDone() {
    const R = this.run;
    for (const p of this.players.values()) p.jies++;
    this.cqAdd('jie', [...this.players.values()].map(p => p.uid));
    const st = rgStory(R.story || 1);
    this.events.push({ t: 'story_clear', story: R.story || 1, name: st.name, all: true });
    if (R.jie < RG.JIE) this.startVote(); else this.startKey();
    this.dirty = true;
  }
  startVote() {
    const pool = RG.PERKS.filter(id => !this.run.perks.includes(id)), opts = [];
    const source = pool.length >= 3 ? pool : RG.PERKS.slice();
    while (opts.length < 3 && source.length) opts.push(source.splice((this.rnd() * source.length) | 0, 1)[0]);
    this.run.vote = { opts, until: this.t + RG.VOTE_T, votes: {} };
    this.events.push({ t: 'rv', all: true });
  }
  vote(id, i) {
    const v = this.run.vote; i = +i;
    if (!v || !this.players.has(id) || !(i >= 0 && i < v.opts.length) || (i | 0) !== i) return false;
    v.votes[id] = i;
    if (Object.keys(v.votes).length >= this.players.size) v.until = Math.min(v.until, this.t);   // 人都投了就不用等
    return true;
  }
  endVote() {
    const R = this.run, v = R.vote, cnt = v.opts.map((_, i) => Object.values(v.votes).filter(x => x === i).length);
    const top = Math.max(...cnt), best = cnt.map((n, i) => n === top ? i : -1).filter(i => i >= 0);
    const pick = v.opts[best[(this.rnd() * best.length) | 0]];
    if (R.perks.length >= RG.PERK_MAX) R.perks.shift();   // 满了：最早的那卷让位
    R.perks.push(pick);
    R.vote = null; R.jie++; R.got = 0; R.need = this.needOf();
    R.story = (R.story || 1) + 1;
    if (R.story > (R.totalStories || RG.TOTAL_STORIES)) R.story = 1;
    const nextSt = rgStory(R.story);
    this.events.push({ t: 'rp', pick, perks: R.perks, j: R.jie, story: R.story, stName: nextSt.name, all: true });
    this.dirty = true;
  }
  // 最后一劫斩完开关键战：线上真人够 RG.BOSS_MIN 位打天道 Boss（血量全线共享，赢了发星座皮肤）；
  // 不够就各自打一场 3v3 车轮战，对面是 3 位天道 AI（不发皮肤）。两种打完秘卷都保留，进下一轮
  startKey() {
    const R = this.run, n = this.real(), boss = n >= RG.BOSS_MIN;
    const bag = C.HERO_IDS.slice(), heroes = [];
    while (heroes.length < 3) heroes.push(bag.splice((this.rnd() * bag.length) | 0, 1)[0]);
    const mh = boss ? RG.BOSS_HP * n : 0, T = boss ? RG.BOSS_T : RG.TRIO_T;
    R.key = { kind: boss ? 'boss' : 'trio', seq: ++R.seq, heroes, mh, hp: mh, t0: this.t, until: this.t + T, dmg: {}, in: {}, rep: {}, uids: {} };
    for (const p of this.players.values()) { p.keyDmg = 0; p.keyIn = this.t; }
    this.mons.length = 0; this.boss = null;
    this.events.push({ t: 'ks', kind: R.key.kind, all: true });
    this.dirty = true;
  }
  // 车轮战打完了：网页报输赢。进过场的人都报了（走了的不等）就收场，有一个人赢了就算赢
  keyReport(id, seq, w) {
    const k = this.run.key;
    if (!k || k.kind !== 'trio' || k.seq !== +seq || !this.players.has(id) || id in k.rep) return false;
    k.rep[id] = w ? 1 : 0; k.in[id] = 1;
    if (w && this.players.get(id).uid) k.uids[this.players.get(id).uid] = 1;   // 车轮战：赢下来的人算出力
    const left = Object.keys(k.in).filter(x => this.players.has(+x) && !(x in k.rep));
    if (!left.length) this.endKey(Object.values(k.rep).some(Boolean));
    return true;
  }
  // 关键战里交伤害：要是这一场、开战（或进场）三秒后才算，总数不超过 (进场秒数 - 3) × 每秒上限
  keyHit(id, seq, d) {
    const k = this.run.key, p = this.players.get(id); d = +d;
    if (!k || k.kind !== 'boss' || k.seq !== +seq || !p || !(d > 0) || k.hp <= 0) return 0;
    if (!p.keyIn || p.keyIn < k.t0) { p.keyIn = this.t; p.keyDmg = 0; }   // 中途进来的从进来那一刻算
    const cap = Math.max(0, (this.t - p.keyIn - 3) * RG.KEY_DPS) - p.keyDmg;
    d = Math.min(d, RG.KEY_HIT_MAX, cap); if (d <= 0) return 0;
    p.keyDmg += d; k.hp -= d;
    const who = p.uid || 'g' + p.id; k.dmg[who] = (k.dmg[who] || 0) + d;
    if (p.uid) k.uids[p.uid] = 1;
    if (k.hp <= 0) this.endKey(true);
    return d;
  }
  endKey(win) {
    const R = this.run, k = R.key; if (!k) return;
    k.hp = Math.max(0, k.hp);
    let top = [];
    if (k.kind === 'boss') {
      top = Object.entries(k.dmg).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([w, n]) => {
        const p = [...this.players.values()].find(q => (q.uid || 'g' + q.id) === w); return [p ? p.name : '已离开的侠客', Math.round(n)];
      });
      if (win) this.payout(k);
    } else top = Object.entries(k.rep).filter(([, w]) => w).slice(0, 5).map(([id]) => { const p = this.players.get(+id); return [p ? p.name : '已离开的侠客', 1]; });
    this.events.push({ t: 'ke', kind: k.kind, win: !!win, top, all: true });
    if (win) this.cqAdd('key', Object.keys(k.uids || {}));
    R.key = null; R.cyc++; R.jie = 1; R.got = 0; R.need = this.needOf();   // 秘卷保留，下一轮
    R.story = (R.story || 1) + 1;
    if (R.story > (R.totalStories || RG.TOTAL_STORIES)) R.story = 1;
    for (const p of this.players.values()) { p.jies = 0; p.keyDmg = 0; }
    this.dirty = true;
  }
  // 谁能拿星座皮肤：云端账号、注册满 RG.MIN_AGE_H 小时、这一轮在场至少 RG.MIN_JIE 劫、伤害至少平均份额的 RG.MIN_SHARE。
  // 每号每天只发 RG.ZOD_PER_DAY 件由写 gift 表时的编号保证（见 rgPay）
  payout(k) {
    const now = Date.now(), parts = Object.keys(k.dmg).length || 1, fair = k.mh / parts, seen = new Set();
    for (const p of this.players.values()) {
      if (!p.uid || seen.has(p.uid)) continue;
      const dmg = k.dmg[p.uid] || 0;
      if (now - p.born < RG.MIN_AGE_H * 3600e3 || p.jies < RG.MIN_JIE || dmg < fair * RG.MIN_SHARE) continue;
      seen.add(p.uid); this.rewards.push({ uid: p.uid, dmg: Math.round(dmg), cyc: this.run.cyc });
    }
  }
  rgStep() {
    const R = this.run;
    if (R.vote && this.t >= R.vote.until) this.endVote();
    const k = R.key;
    if (k && k.kind === 'trio' && Object.keys(k.rep).length && Object.keys(k.in).every(x => x in k.rep || !this.players.has(+x))) this.endKey(Object.values(k.rep).some(Boolean));   // 没报的人走了
    else if (k && this.t >= k.until) this.endKey(false);
  }
  // 存进 Durable Object 存储 / 从存储读回来（关键战不存：重启就算这一场没打完）
  saveRun() { const R = this.run; return { cyc: R.cyc, jie: R.jie, got: R.got, need: R.need, perks: R.perks.slice(), seq: R.seq, story: R.story || 1, totalStories: R.totalStories || RG.TOTAL_STORIES, at: Date.now() }; }
  loadRun(o) {
    if (!o || typeof o !== 'object') return;   // 空了多久都接着上次的进度（以前空了 10 分钟会清零，新来的人不该把进度打回去）
    const R = this.run;
    R.cyc = wlNum(o.cyc, 1, 1e6, 1) | 0; R.jie = wlNum(o.jie, 1, RG.JIE, 1) | 0; R.got = wlNum(o.got, 0, RG.NEED_MAX, 0) | 0; R.need = wlNum(o.need, 1, RG.NEED_MAX, RG.NEED0) | 0;
    R.story = wlNum(o.story, 1, RG.TOTAL_STORIES, 1) | 0;
    R.totalStories = RG.TOTAL_STORIES;
    if (R.got >= R.need) R.got = R.need - 1;   // 存档时正在打关键战（关键战不存）：再斩一只就重开
    R.perks = Array.isArray(o.perks) ? o.perks.filter(id => RG.PERKS.includes(id)).slice(-RG.PERK_MAX) : []; R.seq = wlNum(o.seq, 0, 1e9, 0) | 0;
  }
  /* ---------- 江湖长卷：这条线的出力 ---------- */
  // 记一笔出力：全线 +1，在场出过力的每个云端账号各 +1（同一个号只算一次；游客推进度，不领奖）
  cqAdd(key, uids) {
    const i = CQ_KEYS.indexOf(key); if (i < 0) return;
    this.cq.v[i]++;
    for (const u of new Set(uids)) if (u) (this.cq.by[u] || (this.cq.by[u] = cqVec()))[i]++;
  }
  cqPending() { return this.cq.v.some(n => n > 0); }
  // 拿走攒着的出力去上报（报失败了由 WorldLine 留着原样重报，见 cqSync）
  cqTake() { const o = this.cq; this.cq = { v: cqVec(), by: {} }; return o; }
  // 这条线攒着的出力里，算进全服当前这一节的有多少
  cqMine(s) { const i = s ? CQ_KEYS.indexOf(s.g) : -1; return i < 0 ? 0 : this.cq.v[i] + (this.cqFly ? this.cqFly.v[i] : 0); }
  // 加上这条线还没报上去的，够这一节了就该马上报
  cqDue() { const s = this.chron; return !!s && s.node < CQ.N && this.cqMine(s) > 0 && s.got + this.cqMine(s) >= s.need; }
  // 新的全服进度（从 D1 读到的）：往前走了就全线播报，旧的（比手上的还早）不认
  cqSet(s) {
    if (!s || !(s.node >= 0)) return;
    const old = this.chron;
    if (old && (s.v < old.v || (s.v === old.v && s.got < old.got))) return;   // 进度只会往前走
    this.chron = { node: s.node | 0, got: s.got | 0, need: s.need | 0, g: String(s.g || ''), v: s.v | 0 };
    if (old && s.node > old.node) this.events.push({ t: 'qa', from: old.node, i: s.node, all: true });
  }
  // 帧里的全服进度：第几节、完成了多少（加上本线还没报上去的，不超过要的数）
  cqView() {
    const s = this.chron; if (!s) return null;
    return { i: s.node, g: Math.min(s.need, s.got + this.cqMine(s)), nd: s.need, v: s.v };
  }
  // 这一拍的事件谁该收到：全线播报的人人都收，其余只发给附近的侠客
  takeEvents() { const e = this.events; this.events = []; return e; }
  wants(id, ev) { const me = this.players.get(id); return !!me && (ev.all || ev.x === undefined || Math.abs(ev.x - me.x) <= WL.AOI + 300); }
}

export class WorldLine {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env; this.sim = new WorldSim(); this.timer = 0; this.line = 0;
    this.cqAt = 0; this.cqReadAt = 0; this.cqBusy = null;   // 江湖长卷：上次报出力、上次读全服进度的时间（毫秒），正在跑的那一次
    if (ctx.storage && ctx.blockConcurrencyWhile) ctx.blockConcurrencyWhile(async () => { try { this.sim.loadRun(await ctx.storage.get('run')); } catch (e) {} });
  }
  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const line = wlNum(new URL(request.url).pathname.split('/').pop(), 0, 9999, 0) | 0;
    const pair = new WebSocketPair(), client = pair[0], server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ line, id: 0 }); this.line = line; this.sim.line = line;
    if (line > 0 && this.ctx.getWebSockets().length > WL.CAP) { this.send(server, { t: 'full', line }); server.close(4001, 'full'); }
    return new Response(null, { status: 101, webSocket: client });
  }
  send(ws, o) { try { ws.send(JSON.stringify(o)); } catch (e) {} }
  sockOf(id) { for (const ws of this.ctx.getWebSockets()) { const a = ws.deserializeAttachment(); if (a && a.id === id) return ws; } return null; }
  async webSocketMessage(ws, data) {
    if (typeof data !== 'string' || data.length > 2000) return;
    let o; try { o = JSON.parse(data); } catch (e) { return; }
    if (!o || typeof o !== 'object') return;
    const a = ws.deserializeAttachment() || { line: 1, id: 0 }, sim = this.sim;
    const now = Date.now();   // 一个连接每秒最多认 25 条，多的直接丢
    if (now - (a.rt || 0) > 1000) { a.rt = now; a.rn = 0; }
    if (++a.rn > 25) { ws.serializeAttachment(a); return; }
    if (o.t === 'hi') {
      this.sim.line = a.line;
      if (a.id && sim.players.has(a.id)) { ws.serializeAttachment(a); return; }
      const id = sim.join(o);
      if (!id) { this.send(ws, { t: 'full', line: a.line }); ws.close(4001, 'full'); return; }
      a.id = id; ws.serializeAttachment(a);
      if (o.tk && this.env && this.env.DB) this.auth(id, String(o.tk).slice(0, 200));
      const roster = [...sim.players.values()].map(p => sim.meta(p));
      this.send(ws, { t: 'w', id, line: a.line, cap: WL.CAP, w: WL.W, roster });
      sim.events.push({ t: 'j', p: sim.meta(sim.players.get(id)), all: true });
      this.ensureTimer();
      this.cqSync(false);   // 有人进来：读一次全服进度，新来的、重连的人马上看到现在推到哪了
      return;
    }
    ws.serializeAttachment(a);
    if (!a.id || !sim.players.has(a.id)) { this.send(ws, { t: 're' }); return; }   // 服务器重启过：请网页重新打个招呼
    if (o.t === 's') sim.state(a.id, o);   // 位置和这一拍打出的伤害一起上报（h: [[妖物编号, 伤害], ...]），省一半消息
    if ((o.t === 's' || o.t === 'h') && Array.isArray(o.h)) for (const h of o.h.slice(0, 12)) if (Array.isArray(h)) sim.hit(a.id, +h[0], +h[1]);
    if (o.t === 'tp') {
      const me = sim.players.get(a.id);
      if (me) {
        if (o.to) {
          const tgt = sim.players.get(+o.to);
          if (tgt) { me.x = wlNum(tgt.x + (tgt.f > 0 ? -60 : 60), 60, WL.W - 60, me.x); me.y = tgt.y; sim.events.push({ t: 'tp', id: a.id, to: +o.to, x: me.x }); }
        } else if (Number.isFinite(o.x)) {
          me.x = wlNum(o.x, 60, WL.W - 60, me.x);
        }
      }
    }
    if (o.t === 'v') sim.vote(a.id, o.i);
    if (o.t === 'kd') sim.keyHit(a.id, o.s, o.d);
    if (o.t === 'kr') sim.keyReport(a.id, o.s, o.w);
  }
  // 登录令牌 → 云端账号（和 HTTP 接口同一张 sessions 表）；被封的号不认
  async auth(id, tk) {
    try {
      const now = Date.now();
      const r = await sessionOf(this.env, String(tk || ''), 'u.id AS id, u.username AS username, u.created_at AS created_at', now);
      if (r && !(await banOf(this.env, r.id, now))) this.sim.setAuth(id, r.id, r.created_at);
    } catch (e) {}
  }
  // 发星座皮肤：写进 gift 表（玩家下次动武库时自动领，走 C.addItem，和开箱拿到的一样）。
  // 编号是「rz + 北京日期 + 第几件 + uid」，INSERT OR IGNORE：同一天重复写、并发写都只有 RG.ZOD_PER_DAY 件
  async pay(list) {
    const env = this.env; if (!env || !env.DB) return;
    const now = Date.now(), day = C.day(now), all = ZOD_KEYS();
    for (const w of list) {
      try {
        const have = await env.DB.prepare("SELECT COUNT(*) AS n FROM gift WHERE uid = ? AND id LIKE ?").bind(w.uid, `rz${day}_%`).first();
        const n = (have && have.n) || 0; if (n >= RG.ZOD_PER_DAY) continue;
        const e = await env.DB.prepare('SELECT state_json FROM econ WHERE uid = ?').bind(w.uid).first();
        const own = new Set(((parseObj(e && e.state_json) || {}).inv || []).map(x => x && x.k));
        const fresh = all.filter(k => !own.has(k)), pool = fresh.length ? fresh : all, k = pool[Math.floor(rnd() * pool.length)];
        await env.DB.batch([
          env.DB.prepare('INSERT OR IGNORE INTO gift (id, uid, ink, items_json, note, by, at, until, born) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .bind(`rz${day}_${n}_${w.uid}`, w.uid, RG.INK, JSON.stringify({ skin: k }), `全服肉鸽 · 天道 Boss 讨伐大捷`, 'rouge', now, now + 30 * DAY_MS, now),
          logStmt(env, w.uid, now, 'rouge_zod', 1, null, null, JSON.stringify({ k, dmg: w.dmg, cyc: w.cyc })),
        ]);
      } catch (e) { console.error('rouge pay', e); }
    }
  }
  async webSocketClose(ws) { this.drop(ws); }
  async webSocketError(ws) { this.drop(ws); }
  drop(ws) {
    const a = ws.deserializeAttachment();
    if (a && a.id && this.sim.players.has(a.id)) { this.sim.leave(a.id); this.sim.events.push({ t: 'l', id: a.id, all: true }); }
  }
  ensureTimer() { if (!this.timer) this.timer = setInterval(() => this.tick(), WL.TICK); }
  tick() {
    const sim = this.sim;
    sim.step(WL.TICK / 1000);
    const evs = sim.takeEvents();
    if (sim.rewards.length) { const list = sim.rewards; sim.rewards = []; this.paying = this.pay(list); }
    if (sim.dirty && this.ctx.storage) { sim.dirty = false; this.ctx.storage.put('run', sim.saveRun()).catch(() => {}); }
    const now = Date.now();   // 江湖长卷：有出力每 CQ_T.REP 秒报一次（够这一节了马上报），没有就每 CQ_T.READ 秒看一次全服进度
    if ((sim.cqPending() || this.cqRetry) && (sim.cqDue() || now - this.cqAt >= CQ_T.REP * 1000)) this.cqSync(true);
    else if (now - this.cqReadAt >= CQ_T.READ * 1000) this.cqSync(false);
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment(); if (!a || !a.id) continue;
      if (!sim.players.has(a.id)) { this.send(ws, { t: 're' }); continue; }
      const fr = sim.frameFor(a.id), mine = evs.filter(e => sim.wants(a.id, e));
      if (mine.length) fr.e = mine;
      this.send(ws, fr);
    }
    if (!sim.players.size) {   // 没人了：停表，让它休眠；攒着的出力先报上去
      clearInterval(this.timer); this.timer = 0;
      if (this.ctx.storage) this.ctx.storage.put('run', sim.saveRun()).catch(() => {});
      if (sim.cqPending() || this.cqRetry) this.cqSync(true);
    }
  }
  // 江湖长卷：报出力（report）或者只读全服进度。同一时间只跑一次；报失败了出力放回去，下次用同一个编号重报（服务器只认一次）
  cqSync(report) {
    const env = this.env, sim = this.sim;
    if (this.cqBusy || !env || !env.DB) return this.cqBusy;
    const now = Date.now(); this.cqReadAt = now;
    let out = null;
    if (report) { this.cqAt = now; out = sim.cqFly = this.cqRetry || { ...sim.cqTake(), rid: `l${this.line}_${now.toString(36)}_${randHex(4)}` }; this.cqRetry = null; }
    this.cqBusy = (async () => {
      try {
        sim.cqSet(out ? await chronReport(env, this.line, out, now) : await chronRead(env));
        if (out) sim.cqFly = null;
      } catch (e) {
        if (out) { this.cqRetry = out; sim.cqFly = out; }   // 不知道成没成：留着同一个编号下次重报
        console.error('chron sync', e);
      } finally { this.cqBusy = null; }
      if (!sim.players.size && sim.cqPending() && !this.cqRetry) this.cqSync(true);   // 人走光的时候正好在报：剩下的也报掉（失败了就不再追，免得空转）
    })();
    return this.cqBusy;
  }
}
globalThis.RenyingWorldSim = { WorldSim, WL, RG, rgStory };

export default {
  fetch: withCors,
};