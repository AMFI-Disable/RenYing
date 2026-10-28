/* ---------------- 试剑：第一次开局时在山门前走一遍，走完再看路线图 ---------------- */
const K = (pc, tc) => Input.touch ? tc : pc;
/* 每一步：id、提示 t、开始时 init、做到了 done；fail 返回 null（没失败）或 { retryTo: 退回哪一步的 id, hint?: 提示 } */
const TUT = [
  { id: 'move', t: () => K('<kbd>W A S D</kbd> 走动，<kbd>鼠标</kbd> 转视角', '拖动左下摇杆走动，滑动屏幕转视角'), init() { Tut.p0 = Pl.pos.clone(); }, done: () => Pl.pos.distanceTo(Tut.p0) > 7 },
  { id: 'combo', t: () => K('<kbd>左键</kbd> 或 <kbd>J</kbd> 连砍木人', '连点「斩」砍木人') + ` · ${Math.min(5, Tut.hits)}/5`, init() { Tut.hits = 0; Tut.foe = tutFoe('dummy'); }, done: () => Tut.hits >= 5 },
  { id: 'dodge', t: () => K('<kbd>空格</kbd> 闪避，闪避时刀枪不入', '点「闪」闪避，闪避时刀枪不入'), init() { Tut.dodged = false; }, done: () => Tut.dodged },
  { id: 'parry', t: () => K('陪练出手前刀上一闪寒光，此时按 <kbd>F</kbd> 弹反', '陪练刀上一闪寒光时点「格」弹反'), init() { tutDrop(); Tut.foe = tutFoe('spar'); Tut.p0n = Pl.parries; }, done: () => Pl.parries > Tut.p0n,
    fail: () => Pl.parries <= Tut.p0n && Tut.foe && Tut.foe.state === 'dead' ? { retryTo: 'parry', hint: '先等他出手，寒光一闪再按格' } : null },
  { id: 'exec', t: () => K('弹开后陪练露出破绽，靠近按 <kbd>F</kbd> 处决', '弹开后陪练露出破绽，靠近点「决」处决'), init() { }, done: () => !Tut.foe || Tut.foe.state === 'dead', fail: () => Tut.foe && Tut.foe.state !== 'dead' && Tut.foe.stun <= 0 && Tut.foe.state !== 'stagger' ? { retryTo: 'parry' } : null },
  { id: 'charge', t: () => K('按住 <kbd>K</kbd> 或右键蓄满再松开，使出「破山」', '按住「旋」蓄满再松开，使出「破山」'), init() { tutDrop(); Tut.foe = tutFoe('dummy'); }, done: () => Pl.state === 'attack' && Pl.atkDef === PISHAN },
];
const Tut = { on: false, i: 0, t: 0 };
function tutFoe(kind) {
  const a = Pl.yaw, p = new V3(Pl.pos.x + Math.sin(a) * 4, 0, Pl.pos.z + Math.cos(a) * 4); collide(p, .5);
  const e = spawnEnemy('bandit', p.x, p.z); e.tut = kind; e.name = kind === 'dummy' ? '木人' : '陪练'; e.xpK = 0;
  if (kind === 'dummy') { e.maxHp = e.hp = 99999; } else { e.dmgK = 0; e.windK = 1.7; e.maxHp = e.hp = 400; } Pl.lock = e; return e;
}
function tutDrop() { for (const e of G.enemies) if (e.tut && e.state !== 'dead') { e.state = 'dead'; e.deadT = .9; FX.smoke(e.pos, 10, 1, .08); } }
Tut.begin = function () { this.on = true; this.i = -1; this.next(); $('tut').hidden = false; };
Tut.next = function () {
  this.i++; this.t = 0; if (this.i > 0) { Snd.pick(); FX.ring(Pl.pos, .4, 2.5, 0x62cdb9, .35); }
  if (this.i >= TUT.length) { this.end(true); return; } TUT[this.i].init();
};
Tut.end = function (done, quiet) {
  this.on = false; tutDrop(); $('tut').hidden = true; Save.load().tut = 1; Save.write(); Pl.lock = null; Pl.hp = Pl.maxHp; Pl.mp = Pl.maxMp;
  if (quiet) return;
  if (done) { UI.banner('试剑已毕', '黑风寨的人到了', 'gold'); Snd.level(); }
  setTimeout(() => { if (G.state === 'playing' && !Run.node) Run.showMap(); }, done ? 1600 : 300);
};
Tut.update = function (dt) {
  const s = TUT[this.i]; if (!s) return; this.t += dt; const f = s.fail ? s.fail() : null;
  if (f) { const to = TUT.findIndex(x => x.id === f.retryTo); if (f.hint) UI.toast(f.hint, 2.4); this.i = (to >= 0 ? to : this.i) - 1; this.next(); return; }
  if (this.t > .4 && s.done()) { this.next(); return; }
  const h = s.t(); if (this.html !== h) { this.html = h; $('tutT').innerHTML = h; } UI.set('tutN', `试剑 ${cnNum(this.i + 1)} / ${cnNum(TUT.length)}`);
};
