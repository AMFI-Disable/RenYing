// ======================= 演示动画（不跑对战，只按顺序摆招式） =======================
// 本文件：图鉴和点将台用的演示动画（Puppet：按脚本摆姿势，不跑真正的对战）、侠客立绘卡面（makeCardArt），
// 以及点将台的几个公共小工具（bpModeDef / isLocalBp / bpSideName …）。
const DEMO_SEQ = [['idle', 0.55, 0], ['l1s', 0.09, 0], ['l1a', 0.15, 16], ['l2s', 0.08, 0], ['l2a', 0.15, 16], ['lcs', 0.08, 0], ['lca', 0.15, 16],
  ['lds', 0.1, 0], ['lda', 0.18, 18], ['l3s', 0.1, 0], ['l3a', 0.2, 30], ['idle', 0.4, 0], ['hvs', 0.14, 0], ['hva', 0.24, 0], ['jump', 0.22, 0],
  ['a1s', 0.08, 0], ['a1a', 0.18, 0], ['fall', 0.3, 0], ['charge', 0.7, 0], ['spa', 0.32, 34], ['idle', 0.5, 0], ['sps', 0.4, 0], ['spa', 0.18, 40],
  ['l1a', 0.12, 0], ['l2a', 0.12, 0], ['l1a', 0.12, 0], ['hva', 0.3, 0], ['victory', 0.9, 0]];
const DEMO_SWING = new Set(['l1a', 'l2a', 'lca', 'lda', 'l3a', 'hva', 'a1a', 'a2a', 'spa', 'qf_thrust', 'fy_xslash', 'ts_slam', 'ts_shoulder', 'ls_thrust', 'ly_fanswipe', 'lm_jab', 'lm_kick', 'my_stroke', 'my_paint', 'yl_dive', 'sp_l1a', 'sp_l2a', 'du_l1a', 'du_l2a', 'gs_l1a', 'fn_l1a', 'yx_push', 'zx_upper', 'gc_throw', 'gc_sweep']);
class Puppet {
  constructor(i, skin) { this.set(i, skin); }
  playSeq(seq, lab, loop = false) {
    this.customSeq = seq;
    this.customLab = lab;
    this.loopCustom = loop;
    this.k = -1;
    this.t = 99;
    this.ox = 0;
    this.x = 0;
    this.y = 0;
    this.oyY = 0;
    this.badges = [];
    this.projs = [];
    this.rings = [];
    this.fx = [];
    this.puddles = [];
    this.hitQ = [];
  }
  setDemoRange(gap) {
    // The fighter stands at x=-60 in the preview stage; place the target at
    // the selected move's approximate reach so every card has its own spacing.
    this.demoTargetX = -60 + gap;
  }
  setDemoOpponent(idx, skin) {
    this.demoTargetPup = new Puppet(idx, skin);
    this.demoTargetPup.face = -1;
    this.demoTargetPose = 'idle';
    this.demoTargetPoseT = 0;
    this.demoTargetDownT = 0;
    this.demoTargetDx = 0;
    this.demoTargetDxGoal = 0;
  }
  set(i, skin) {
    const ch = CHARS[i];
    this.skin = skin === undefined ? mySkin(ch.id) : skin;
    Object.assign(this, { chIdx: i, ch, look: skinLook(i, this.skin), wlen: WEAPON_LEN[ch.look.weapon] || 54, size: ch.size || 1,
      j: {}, k: 0, t: 0, ox: 0, x: 0, y: 0, oyY: 0, face: 1, rot: 0, trail: [], scarf: [], idx: 0, state: 'idle', flying: false,
      badges: [], projs: [], rings: [], fx: [], puddles: [], hitQ: [], dummyY: 0, dummyVy: 0, dummyShake: 0, flashT: 0, dimT: 0,
      sandwichT: 0, shanshuiT: 0, inkT: 0, netT: 0 });
    for (const k of JOINTS) this.j[k] = [...POSES.idle[k]]; this.j.sw = POSES.idle.sw;
    this.sk = skeleton(this);
  }
  update(dt) {
    const defaultSeq = (HERO_FULL_DEMO && HERO_FULL_DEMO[this.ch.id]) ? HERO_FULL_DEMO[this.ch.id] : DEMO2;
    let steps = this.customSeq || defaultSeq;
    const targetX = this.demoTargetX === undefined ? 60 : this.demoTargetX;
    this.t += dt;
    this.hitQ = this.hitQ || [];
    if (this.fx === undefined) {
      this.fx = []; this.flashT = 0; this.proj = null; this.projs = []; this.lab = '';
      this.hitQ = []; this.rings = []; this.badges = []; this.puddles = [];
      this.dummyY = 0; this.dummyVy = 0; this.dummyShake = 0;
      this.k = -1; this.t = 99;
    }
    if (this.k < 0 || this.t >= steps[this.k].d) {
      this.t = 0; this.k++;
      if (this.k >= steps.length) {
        if (this.loopCustom) {
          this.k = 0;
          this.ox = 0; this.x = 0; this.oyY = 0;
          this.demoTargetDxGoal = 0;
        } else if (this.customSeq) {
          this.customSeq = null;
          this.customLab = null;
          steps = defaultSeq;
          for (const el of document.querySelectorAll('#cxMoves .active-demo')) el.classList.remove('active-demo');
          this.k = 0;
        } else {
          this.k = 0;
        }
      }
      const st = steps[this.k], ch = this.ch;
      if (st.reset) { this.ox = 0; this.x = 0; this.oyY = 0; }
      this.ox += st.dx || 0;
      if (st.dy !== undefined) this.oyY = st.dy;
      if (this.customLab) this.lab = this.customLab;
      else if (st.lab) this.lab = { L: '左键 · 连击', Q: `Q · ${SKILLS[ch.skill].name}`, R: `左键+右键 · ${SKILLS[ch.skill2].name}`, E: `E · ${ULTS[ch.ult].name}`, '按住蓄力': '按住左键 · 蓄力', '空中': '空中斩', '腾空闪': '右键 · 腾空闪' }[st.lab] || st.lab;
      if (st.hit) this.hitQ.push({ t: 0.045, n: st.hit, launch: st.launch, badge: st.badge });

        // 各种招式实体与大招全屏特效
      if (st.fx === 'proj') this.projs.push({ kind: 'proj', x: this.x + 34, y: -62, vx: 880, life: 0.5, col: this.look.slash });
      else if (st.fx === 'swordqi') { this.projs.push({ kind: 'swordqi', x: this.x + 30, y: -62, vx: 920, life: 0.5, col: '120,230,255' }); this.rings.push({ x: this.x + 30, y: -62, r: 14, life: 0.3 }); }
      else if (st.fx === 'gale') { this.rings.push({ x: this.x + 20, y: -62, r: 18, life: 0.4 }, { x: 60, y: -62, r: 24, life: 0.4 }); this.fx.push({ x: this.x + 20, y: -62, vx: 700, vy: 0, life: 0.2, c: '120,230,255' }); }
      else if (st.fx === 'quake') { this.projs.push({ kind: 'quake', x: this.x + 20, y: 0, vx: 560, life: 0.45, col: '255,200,120' }); for (let k = 0; k < 6; k++) this.fx.push({ x: this.x + 20 + rand(-10, 10), y: 0, vx: rand(100, 300), vy: -rand(150, 350), life: 0.35, c: '200,160,100' }); }
      else if (st.fx === 'ironwall') { this.rings.push({ x: this.x + 10, y: -60, r: 30, life: 0.45 }); this.flashT = 0.15; }
      else if (st.fx === 'crescent') { this.flashT = 0.25; this.dimT = 0.6; this.rings.push({ x: this.x + 30, y: -60, r: 45, life: 0.45, col: this.look.slash }, { x: targetX, y: -60, r: 32, life: 0.4, col: '255,255,255' }); }
      else if (st.fx === 'avalanche') { this.flashT = 0.3; this.dimT = 0.7; this.rings.push({ x: this.x, y: 0, r: 50, life: 0.55, col: '255,210,140' }, { x: this.x, y: 0, r: 35, life: 0.45 }); for (let k = 0; k < 12; k++) this.fx.push({ x: this.x + rand(-25, 25), y: 0, vx: rand(-240, 240), vy: -rand(200, 480), life: 0.48, c: '220,180,120' }); }
      else if (st.fx === 'blink') { for (let k = 0; k < 10; k++) this.fx.push({ x: this.x, y: -60 + rand(-20, 20), vx: rand(-80, 80), vy: rand(-80, 80), life: 0.3, c: '40,30,50' }); for (let k = 0; k < 8; k++) this.fx.push({ x: 60, y: -62 + rand(-20, 20), vx: rand(-120, 120), vy: rand(-120, 120), life: 0.3, c: '255,95,115' }); }
      else if (st.fx === 'kunai') { for (const a of [-0.15, 0, 0.15]) this.projs.push({ kind: 'kunai', x: this.x + 25, y: -65, vx: 1100 * Math.cos(a), vy: 1100 * Math.sin(a), life: 0.4, col: '200,200,220' }); }
      else if (st.fx === 'shadows') { this.flashT = 0.28; this.dimT = 0.65; this.rings.push({ x: targetX, y: -62, r: 42, life: 0.5, col: '255,60,80' }); for (let k = 0; k < 8; k++) this.fx.push({ x: targetX + rand(-20, 20), y: -60 + rand(-20, 20), vx: rand(-160, 160), vy: rand(-160, 160), life: 0.35, c: '255,80,100' }); }
      else if (st.fx === 'windblade') { this.projs.push({ kind: 'wind', x: this.x + 30, y: -62, vx: 1000, life: 0.45, col: '150,255,200' }); }
      else if (st.fx === 'windstep') { this.rings.push({ x: this.x + 20, y: -60, r: 32, life: 0.35 }); for (let k = 0; k < 8; k++) this.fx.push({ x: this.x + 10, y: -60 + rand(-20, 20), vx: rand(-150, 150), vy: rand(-100, 100), life: 0.25, c: '150,255,200' }); }
      else if (st.fx === 'tornado') { this.dimT = 0.6; this.projs.push({ kind: 'tornado', x: this.x + 30, y: -70, vx: 360, life: 0.85, col: '150,255,200' }, { kind: 'tornado', x: this.x + 75, y: -70, vx: 420, life: 0.95, col: '180,255,230' }); }
      else if (st.fx === 'thunderfist') { this.rings.push({ x: this.x + 20, y: -62, r: 24, life: 0.35 }); for (let k = 0; k < 10; k++) this.fx.push({ x: this.x + rand(-10, 30), y: -62 + rand(-25, 25), vx: rand(-180, 180), vy: rand(-180, 180), life: 0.25, c: '255,230,120' }); }
      else if (st.fx === 'stomp') { this.projs.push({ kind: 'bolt', x: 60, y: -200, vx: 0, life: 0.35, col: '255,240,150' }); this.rings.push({ x: 60, y: 0, r: 25, life: 0.3 }); }
      else if (st.fx === 'thunder') { this.flashT = 0.32; this.dimT = 0.7; const count = st.count || 1; for (let k = 0; k < count; k++) this.projs.push({ kind: 'bolt', x: targetX + k * 14, y: -220, vx: 0, life: 0.55, col: k % 2 ? '255,255,200' : '255,240,150' }); this.rings.push({ x: targetX, y: 0, r: 42, life: 0.45, col: '255,230,120' }); }
      else if (st.fx === 'backthrust') { this.rings.push({ x: 60, y: -68, r: 20, life: 0.3 }); for (let k = 0; k < 8; k++) this.fx.push({ x: 60, y: -68, vx: rand(100, 300), vy: rand(-120, 120), life: 0.25, c: '170,220,255' }); }
      else if (st.fx === 'spin') { this.rings.push({ x: this.x + 25, y: -65, r: 28, life: 0.35 }); }
      else if (st.fx === 'timestop') { this.flashT = 0.35; this.dimT = 0.75; this.rings.push({ x: targetX, y: -65, r: 45, life: 0.45, col: '180,230,255' }, { x: this.x + 30, y: -65, r: 30, life: 0.35 }); }
      else if (st.fx === 'inktrap') { this.puddles.push({ x: 60, life: 2.5 }); }
      else if (st.fx === 'inkblob') { this.projs.push({ kind: 'inkblob', x: this.x + 25, y: -80, vx: 450, vy: -380, g: 1400, life: 0.6, col: '40,40,55' }); }
      else if (st.fx === 'inkdragon') { this.dimT = 0.8; this.inkT = 1.0; this.flashT = 0.25; this.rings.push({ x: targetX, y: -65, r: 45, life: 0.5, col: '230,70,50' }); }
      else if (st.fx === 'mist') { this.rings.push({ x: this.x, y: -60, r: 22, life: 0.5, col: '127,214,224' }); for (let k = 0; k < 8; k++) this.fx.push({ x: this.x + rand(-12, 12), y: -60 + rand(-30, 30), vx: rand(-40, 40), vy: -rand(20, 80), life: 0.5, c: '127,214,224' }); }
      else if (st.fx === 'mistswap') { this.rings.push({ x: this.x, y: -60, r: 26, life: 0.35, col: '127,214,224' }); for (let k = 0; k < 10; k++) this.fx.push({ x: this.x + rand(-10, 10), y: -60 + rand(-25, 25), vx: rand(-120, 120), vy: rand(-120, 120), life: 0.3, c: '127,214,224' }); }
      else if (st.fx === 'mistarray') { this.flashT = 0.25; this.dimT = 0.65; for (const dx of [-120, -60]) this.projs.push({ kind: 'wind', x: this.x + dx, y: -62, vx: 1100, life: 0.4, col: '127,214,224' }); this.rings.push({ x: 60, y: -62, r: 40, life: 0.5, col: '127,214,224' }); }
      else if (st.fx === 'mirror') { this.rings.push({ x: this.x + 25, y: -65, r: 24, life: 0.4, col: '215,195,255' }); }
      else if (st.fx === 'moonring') { this.projs.push({ kind: 'moonring', x: this.x + 30, y: -65, vx: 650, life: 0.7, col: '215,195,255' }); }
      else if (st.fx === 'moonflow') { this.dimT = 0.65; this.flashT = 0.25; this.rings.push({ x: this.x, y: -60, r: 48, life: 0.55, col: '215,195,255' }, { x: this.x, y: -60, r: 28, life: 0.45, col: '180,255,200' }); this.badges.push({ text: '+60', x: this.x, y: -105, life: 0.85, max: 0.85 }); }
      else if (st.fx === 'dive') { this.rings.push({ x: 60, y: -40, r: 22, life: 0.3, col: '140,190,255' }); }
      else if (st.fx === 'feather') { for (const dy of [-12, 0, 12]) this.projs.push({ kind: 'feather', x: this.x + 25, y: -68 + dy, vx: 950, life: 0.45, col: '160,205,255' }); }
      else if (st.fx === 'featherstorm') { this.flashT = 0.25; this.dimT = 0.65; const count = st.count || 8; for (let k = 0; k < count; k++) this.projs.push({ kind: 'feather', x: targetX + rand(-35, 35), y: -220 - k * 28, vx: rand(-30, 30), vy: 980, life: 0.42, col: '160,205,255' }); }
      else if (st.fx === 'shanshui') { this.flashT = 0.25; this.dimT = 0.8; this.shanshuiT = 2.2; this.rings.push({ x: targetX, y: -60, r: 45, life: 0.55, col: '233,196,106' }); for (let k = 0; k < 8; k++) this.fx.push({ x: targetX + rand(-30, 30), y: -60 + rand(-30, 30), vx: rand(-120, 120), vy: rand(-120, 120), life: 0.4, c: '20,20,30' }); }
      else if (st.fx === 'skynet') { this.flashT = 0.28; this.dimT = 0.7; this.netT = 0.7; this.rings.push({ x: targetX, y: 0, r: 50, life: 0.55, col: '235,205,130' }); for (let k = 0; k < 8; k++) this.fx.push({ x: targetX + rand(-20, 20), y: 0, vx: rand(-150, 150), vy: -rand(120, 360), life: 0.4, c: '200,160,100' }); }
      else if (st.fx === 'geartriple') { this.flashT = 0.18; this.rings.push({ x: targetX, y: -55, r: 34, life: 0.4, col: '255,225,120' }); for (let k = 0; k < 3; k++) this.projs.push({ kind: 'ironball', x: 60 + (k % 2 ? 50 : -50), y: -58 + k * 8, vx: k % 2 ? -2200 : 2200, life: 0.62, col: '255,205,90', badge: k === 2 ? st.badge : null }); }
      else if (st.fx === 'magnet') { this.rings.push({ x: targetX, y: -60, r: 35, life: 0.55, col: '110,170,255' }, { x: targetX, y: -60, r: 18, life: 0.45, col: '255,100,90' }); for (let k = 0; k < 10; k++) this.fx.push({ x: targetX + rand(-32, 32), y: -100 + k * 8, vx: rand(-40, 40), vy: rand(70, 150), life: 0.45, c: k % 2 ? '110,170,255' : '255,100,90' }); }
      else if (st.fx === 'sandwich') { this.sandwichT = 0.72; this.rings.push({ x: targetX, y: -20, r: 40, life: 0.65, col: '110,170,255' }); }
      else if (st.fx === 'needlestorm') { this.flashT = 0.12; for (let k = 0; k < 12; k++) this.projs.push({ kind: 'spindle', x: targetX + rand(-55, 55), y: -190 - k * 8, vx: rand(-35, 35), vy: 420 + k * 24, life: 0.48, col: '235,110,210' }); this.rings.push({ x: targetX, y: -60, r: 55, life: 0.35, col: '235,110,210' }); }
      else if (st.fx === 'note') { this.rings.push({ x: this.x + 25, y: -65, r: 24, life: 0.4, col: '150,240,200' }); this.projs.push({ kind: 'proj', x: this.x + 30, y: -65, vx: 800, life: 0.45, col: '150,240,200' }); }
      else if (st.fx === 'guangling') { this.flashT = 0.28; this.dimT = 0.7; this.rings.push({ x: targetX, y: -65, r: 42, life: 0.5, col: '150,240,200' }, { x: targetX, y: 0, r: 35, life: 0.45, col: '233,196,106' }); for (let k = 0; k < 6; k++) this.fx.push({ x: targetX + rand(-20, 20), y: -60 + rand(-20, 20), vx: rand(-140, 140), vy: rand(-140, 140), life: 0.35, c: '150,240,200' }); }
    }
    const st = steps[this.k], name = st.p, p = POSES[name] || POSES.idle, a = 1 - Math.exp(-(DEMO_SWING.has(name) ? 55 : 22) * dt);
    for (const k of JOINTS) { this.j[k][0] += (p[k][0] - this.j[k][0]) * a; this.j[k][1] += (p[k][1] - this.j[k][1]) * a; }
    this.j.sw += (p.sw - this.j.sw) * a;
    this.flying = false; this.state = 'idle';
    this.y = damp(this.y, this.oyY || 0, 9, dt); this.x = damp(this.x, this.ox - 60, 10, dt);
    this.sk = skeleton(this);
    if (DEMO_SWING.has(name) && this.t < 0.14) this.trail.push({ b: this.sk.bladeMid, t: this.sk.tip, life: 1 });
    for (const e of this.trail) e.life -= dt / 0.18;
    while (this.trail.length && this.trail[0].life <= 0) this.trail.shift();

    // 命中稻草人反馈：火花、晃动、浮空、控制徽标
    const hit = (n, launch, badge) => {
      this.dummyShake = Math.min(0.7, this.dummyShake + 0.22 * n);
      if (launch) {
        this.dummyVy = -320 * Math.min(1.5, Math.sqrt(n));
        this.demoTargetPose = 'hurtAir';
        this.demoTargetDownT = 0.58;
        this.demoTargetPoseT = 0.22;
        this.demoTargetDxGoal = Math.min(58, (this.demoTargetDxGoal || 0) + 30);
      } else if (this.demoTargetPup) {
        this.demoTargetPose = 'hurt';
        this.demoTargetPoseT = 0.26;
      }
      for (let k = 0; k < 8 * n; k++) {
        const an = rand(-2.4, 0.6), v = rand(120, 400);
        this.fx.push({ x: targetX, y: -62 + this.dummyY + rand(-16, 16), vx: Math.cos(an) * v, vy: Math.sin(an) * v, life: rand(0.18, 0.35), c: Math.random() < 0.35 ? '255,255,255' : this.look.slash });
      }
      this.rings.push({ x: targetX, y: -62 + this.dummyY, r: 8, life: 0.25 });
      if (badge) this.badges.push({ text: badge, x: targetX, y: -95 + this.dummyY, life: 0.75, max: 0.75 });
    };
    for (const q of this.hitQ) { q.t -= dt; if (q.t <= 0) { hit(q.n, q.launch, q.badge); q.done = true; } }
    this.hitQ = this.hitQ.filter(q => !q.done);

    // 飞行物更新与碰撞
    for (const p of this.projs) {
      const prevX = p.x;
      p.x += (p.vx || 0) * dt;
      p.y = (p.y || -62) + (p.vy || 0) * dt;
      if (p.g) p.vy += p.g * dt;
      p.life -= dt;
      if (p.kind === 'moonring' && p.life < 0.35 && p.vx > 0) p.vx = -p.vx;
      if (!p.hitDone && ((p.vx > 0 && prevX <= targetX && p.x >= targetX) || (p.vx < 0 && prevX >= targetX && p.x <= targetX))) {
        p.hitDone = true;
        hit(1.2, p.kind === 'tornado' || p.kind === 'bolt' || p.kind === 'dragon' || p.kind === 'ironball', p.badge);
      }
    }
    this.projs = this.projs.filter(p => p.life > 0);

    // 稻草人物理
    this.dummyY += this.dummyVy * dt;
    this.dummyVy += 1300 * dt;
    if (this.dummyY >= 0) { this.dummyY = 0; this.dummyVy = 0; }
    this.dummyShake = Math.max(0, this.dummyShake - dt * 2.2);

    if (this.demoTargetPup) {
      this.demoTargetPoseT = Math.max(0, (this.demoTargetPoseT || 0) - dt);
      this.demoTargetDownT = Math.max(0, (this.demoTargetDownT || 0) - dt);
      this.demoTargetDx = damp(this.demoTargetDx || 0, this.demoTargetDxGoal || 0, 5, dt);
      if (this.demoTargetDownT <= 0 && this.demoTargetPoseT <= 0) this.demoTargetPose = 'idle';
      const targetPose = this.demoTargetPoseT > 0 ? (this.demoTargetPose || 'hurt') : this.demoTargetDownT > 0 ? 'lying' : 'idle';
      const targetDef = POSES[targetPose] || POSES.idle, targetPup = this.demoTargetPup;
      for (const k of JOINTS) {
        targetPup.j[k][0] += (targetDef[k][0] - targetPup.j[k][0]) * (1 - Math.exp(-32 * dt));
        targetPup.j[k][1] += (targetDef[k][1] - targetPup.j[k][1]) * (1 - Math.exp(-32 * dt));
      }
      targetPup.j.sw += (targetDef.sw - targetPup.j.sw) * (1 - Math.exp(-32 * dt));
      targetPup.sk = skeleton(targetPup);
      updateScarf(targetPup);
    }

    for (const b of this.badges) { b.y -= 25 * dt; b.life -= dt; }
    this.badges = this.badges.filter(b => b.life > 0);
    for (const pud of this.puddles) pud.life -= dt;
    this.puddles = this.puddles.filter(pud => pud.life > 0);

    for (const f of this.fx) { f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 600 * dt; f.life -= dt; }
    this.fx = this.fx.filter(f => f.life > 0);
    for (const r of this.rings) { r.r += 260 * dt; r.life -= dt; }
    this.rings = this.rings.filter(r => r.life > 0);
    this.flashT = Math.max(0, this.flashT - dt);
    this.dimT = Math.max(0, (this.dimT || 0) - dt);
    this.sandwichT = Math.max(0, (this.sandwichT || 0) - dt);
    this.shanshuiT = Math.max(0, (this.shanshuiT || 0) - dt);
    this.inkT = Math.max(0, (this.inkT || 0) - dt);
    this.netT = Math.max(0, (this.netT || 0) - dt);
    updateScarf(this);
  }
  draw(g, w, h, scale, hideLabel = false) {
    withCtx(g, () => {
      if (this.dimT > 0) {
        ctx.fillStyle = `rgba(3,3,10,${Math.min(0.65, this.dimT * 0.85)})`;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.save(); ctx.translate(w / 2, h * 0.84); ctx.scale(scale, scale);
      // 墨水池等地面特效
      for (const pud of this.puddles) {
        ctx.fillStyle = 'rgba(15,15,22,0.85)';
        ctx.beginPath(); ctx.ellipse(pud.x, 0, 34, 9, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(40,40,65,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
      }
      // 对手木偶（卡片演示）或木人桩（选招大画面）。
      const tilt = Math.sin(performance.now() / 25) * this.dummyShake;
      const targetX = this.demoTargetX === undefined ? 60 : this.demoTargetX;
      if (this.demoTargetPup) {
        const foe = this.demoTargetPup, fx = targetX + (this.demoTargetDx || 0);
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(fx, 2, 34, 7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.save(); ctx.translate(fx, -60 + this.dummyY); ctx.rotate(tilt); ctx.scale(-1, 1);
        if (foe.size !== 1) ctx.scale(foe.size, foe.size);
        if (foe.ch.fly) drawWings(foe.sk, foe);
        drawScarf(foe); drawBody(foe.sk, foe, { flash: this.dummyShake > 0.2 });
        ctx.restore();
      } else {
        ctx.save(); ctx.translate(targetX, -60 + this.dummyY); ctx.rotate(tilt); ctx.translate(0, 60);
        ctx.fillStyle = '#4a3322'; ctx.fillRect(-3, -118, 6, 118); ctx.fillRect(-30, -88, 60, 5);
        ctx.fillStyle = this.dummyShake > 0.2 ? '#f5e6c4' : '#b08a5a'; ctx.beginPath(); ctx.ellipse(0, -76, 18, 27, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(0, -114, 12, 0, 7); ctx.fill();
        ctx.strokeStyle = '#6b4f30'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-16, -86); ctx.lineTo(16, -86); ctx.moveTo(-16, -64); ctx.lineTo(16, -64); ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(this.x, 2, 36, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.save();
      if (this.size !== 1) { ctx.translate(this.x, 0); ctx.scale(this.size, this.size); ctx.translate(-this.x, 0); }
      if (this.ch.fly) drawWings(this.sk, this);
      drawScarf(this); drawBody(this.sk, this, {});
      ctx.restore();
      drawTrail(this);
      if (this.sandwichT > 0) {
        const x = targetX + (this.demoTargetDx || 0), k = 1 - this.sandwichT / 0.72;
        const gap = 180 - 115 * k;
        ctx.fillStyle = `rgba(90,155,255,${0.25 + k * 0.35})`; ctx.fillRect(x - 28, -60 - gap, 56, 12);
        ctx.fillStyle = `rgba(255,95,90,${0.25 + k * 0.35})`; ctx.fillRect(x - 28, -48 + gap, 56, 12);
        ctx.strokeStyle = 'rgba(230,230,255,0.65)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x - 20, -60 - gap + 12); ctx.lineTo(x - 8, -45); ctx.moveTo(x + 20, -60 - gap + 12); ctx.lineTo(x + 8, -45); ctx.stroke();
      }
      if (this.netT > 0) {
        const x = targetX + (this.demoTargetDx || 0), t = this.netT / 0.7;
        ctx.strokeStyle = `rgba(235,205,130,${t * 0.8})`; ctx.lineWidth = 2;
        for (let k = -2; k <= 2; k++) {
          ctx.beginPath(); ctx.moveTo(x + k * 12, -176); ctx.lineTo(x + k * 12, -8); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x - 34, -100 + k * 18); ctx.lineTo(x + 34, -100 + k * 18); ctx.stroke();
        }
      }
      ctx.globalCompositeOperation = 'lighter';
      for (const r of this.rings) {
        const rc = r.col || this.look.slash;
        ctx.strokeStyle = `rgba(${rc},${r.life * 2})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(r.x, r.y || -62, r.r, 0, 7); ctx.stroke();
      }
      for (const f of this.fx) {
        ctx.strokeStyle = `rgba(${f.c},${Math.min(1, f.life * 4)})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x - f.vx * 0.03, f.y - f.vy * 0.03); ctx.stroke();
      }
      for (const p of this.projs) {
        const col = p.col || this.look.slash;
        ctx.fillStyle = `rgba(${col},0.85)`;
        if (p.kind === 'swordqi') {
          ctx.beginPath(); ctx.arc(p.x, p.y, 24, -1.2, 1.2); ctx.lineWidth = 5; ctx.strokeStyle = `rgba(${col},0.9)`; ctx.stroke();
        } else if (p.kind === 'wind') {
          ctx.save();
          ctx.strokeStyle = `rgba(${col},0.95)`; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.arc(p.x, p.y, 20, -1.15, 1.15); ctx.stroke();
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(p.x - 3, p.y, 15, -0.9, 0.9); ctx.stroke();
          ctx.restore();
        } else if (p.kind === 'inkblob') {
          ctx.save();
          ctx.fillStyle = 'rgba(25,25,35,0.95)';
          ctx.beginPath(); ctx.ellipse(p.x, p.y, 11, 9, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = 'rgba(70,70,95,0.7)';
          ctx.beginPath(); ctx.arc(p.x - 2, p.y - 2, 4, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        } else if (p.kind === 'quake') {
          ctx.fillStyle = `rgba(${col},0.75)`;
          for (let q = -12; q <= 12; q += 8) { ctx.beginPath(); ctx.moveTo(p.x + q, 0); ctx.lineTo(p.x + q + 4, -16); ctx.lineTo(p.x + q + 8, 0); ctx.fill(); }
        } else if (p.kind === 'bolt') {
          ctx.strokeStyle = `rgba(${col},0.9)`; ctx.lineWidth = 8;
          ctx.beginPath(); ctx.moveTo(p.x, -260); ctx.lineTo(p.x - 6, -140); ctx.lineTo(p.x + 8, -130); ctx.lineTo(p.x, 0); ctx.stroke();
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
        } else if (p.kind === 'tornado') {
          ctx.strokeStyle = `rgba(${col},0.8)`; ctx.lineWidth = 3;
          for (let rk = 8; rk <= 32; rk += 8) { ctx.beginPath(); ctx.ellipse(p.x, p.y - rk * 1.5, rk, rk * 0.4, 0, 0, Math.PI * 2); ctx.stroke(); }
        } else if (p.kind === 'dragon') {
          ctx.strokeStyle = 'rgba(25,25,35,0.95)'; ctx.lineWidth = 14; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(p.x - 30, p.y); ctx.quadraticCurveTo(p.x, p.y - 28, p.x + 30, p.y); ctx.stroke();
          ctx.fillStyle = '#ff4a5f'; ctx.beginPath(); ctx.arc(p.x + 24, p.y - 6, 2.5, 0, 7); ctx.fill();
        } else if (p.kind === 'moonring') {
          ctx.strokeStyle = `rgba(${col},0.9)`; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(p.x, p.y, 14, 0, Math.PI * 1.5); ctx.stroke();
        } else if (p.kind === 'feather') {
          ctx.strokeStyle = `rgba(${col},0.9)`; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(p.x - 8, p.y); ctx.lineTo(p.x + 8, p.y); ctx.stroke();
        } else if (p.kind === 'spindle') {
          ctx.fillStyle = `rgba(${col},0.95)`; ctx.beginPath(); ctx.ellipse(p.x, p.y, 14, 4, 0, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p.x - 14, p.y); ctx.lineTo(p.x + 14, p.y); ctx.stroke();
        } else if (p.kind === 'ironball') {
          ctx.fillStyle = `rgba(${col},0.95)`; ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(255,250,210,0.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, 13, -1.1, 1.1); ctx.stroke();
        } else if (p.kind === 'kunai') {
          ctx.fillStyle = '#eee'; ctx.beginPath(); ctx.moveTo(p.x + 8, p.y); ctx.lineTo(p.x - 6, p.y - 4); ctx.lineTo(p.x - 6, p.y + 4); ctx.fill();
        } else {
          ctx.beginPath(); ctx.ellipse(p.x, p.y, 14, 6, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(p.x + 3, p.y, 6, 3, 0, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();
      if (this.shanshuiT > 0) {
        const progress = 1 - this.shanshuiT / 2.2, cover = h * clamp(progress, 0, 1);
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, cover); ctx.clip();
        ctx.fillStyle = 'rgba(226,215,184,0.94)'; ctx.fillRect(0, 0, w, cover);
        ctx.fillStyle = 'rgba(35,39,48,0.92)'; ctx.beginPath(); ctx.moveTo(0, h * 0.72); ctx.lineTo(w * 0.22, h * 0.34); ctx.lineTo(w * 0.36, h * 0.62); ctx.lineTo(w * 0.57, h * 0.22); ctx.lineTo(w * 0.78, h * 0.58); ctx.lineTo(w, h * 0.30); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.fill();
        ctx.fillStyle = 'rgba(15,20,28,0.9)'; ctx.fillRect(0, cover - 3, w, 4);
        ctx.restore();
      }
      if (this.inkT > 0) {
        const alpha = Math.min(0.7, this.inkT * 0.72), sx = w / 2 + (targetX + (this.demoTargetDx || 0)) * scale, sy = h * 0.84 - 154 * scale;
        ctx.fillStyle = `rgba(235,220,190,${alpha * 0.72})`; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = `rgba(190,45,45,${alpha})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(sx, sy, 17 * scale, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = `rgba(190,45,45,${alpha})`; ctx.fillRect(sx - 4 * scale, sy - 11 * scale, 8 * scale, 22 * scale);
        ctx.beginPath(); ctx.moveTo(sx - 9 * scale, sy); ctx.lineTo(sx + 9 * scale, sy); ctx.stroke();
      }
      if (this.flashT > 0) { ctx.fillStyle = `rgba(${this.look.slash},${this.flashT})`; ctx.fillRect(0, 0, w, h); }
      for (const b of this.badges) {
        const alpha = Math.min(1, b.life * 2.5);
        ctx.save(); ctx.translate(w / 2, h * 0.84); ctx.scale(scale, scale);
        ctx.font = `bold 12px ${BODY_FONT}`;
        const bt = window.I18N ? I18N.t(b.text) : b.text, bw = ctx.measureText(bt).width;   // 英文界面换成英文再量宽度
        ctx.fillStyle = `rgba(10,12,24,${alpha * 0.85})`;
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(b.x - bw / 2 - 6, b.y - 10, bw + 12, 20, 4) : ctx.rect(b.x - bw / 2 - 6, b.y - 10, bw + 12, 20); ctx.fill();
        ctx.strokeStyle = `rgba(${this.look.slash},${alpha * 0.8})`; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(bt, b.x, b.y);
        ctx.restore();
      }
      if (!hideLabel && this.lab) {
        const lab = window.I18N ? I18N.t(this.lab) : this.lab;
        ctx.font = `600 12px ${BODY_FONT}`; const tw = ctx.measureText(lab).width;
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(8, 8, tw + 18, 22, 11) : ctx.rect(8, 8, tw + 18, 22); ctx.fill();
        ctx.fillStyle = `rgb(${this.look.slash})`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(lab, 17, 19.5);
      }
    });
  }
}
const DEMO2 = HERO_FULL_DEMO.qingfeng;
// 演示画布：在一个 canvas 上循环播放某个角色（支持指定招式与变速）
function demoLoop(canvas, getIdx, isOn, getSkin, getMoveKey) {
  const g = canvas.getContext && canvas.getContext('2d'); if (!g) return;
  let pup = null, lastT = performance.now(), curMv = undefined;
  const tick = now => {
    if (!isOn()) {
      setTimeout(() => requestAnimationFrame(tick), 350);
      return;
    }
    const spd = (canvas === $id('cxDemo')) ? cxDemoSpeed : 1.0;
    const dt = Math.min(0.05, (now - lastT) / 1000) * spd; lastT = now;
    const i = getIdx();
    if (i >= 0 && CHARS[i]) {
      const sk = getSkin ? getSkin() : mySkin(CHARS[i].id);
      const mv = getMoveKey ? getMoveKey() : null;
      if (!pup || pup.chIdx !== i || pup.skin !== sk) {
        pup = new Puppet(i, sk);
        curMv = undefined;
      }
      if (mv !== curMv) {
        curMv = mv;
        const seq = mv === 'ult' && HERO_ULT_REPLAYS[CHARS[i].id]
          ? HERO_ULT_REPLAYS[CHARS[i].id]
          : HERO_MOVE_SEQS[CHARS[i].id] && HERO_MOVE_SEQS[CHARS[i].id][mv];
        if (mv && seq) {
          pup.playSeq(seq, null, true);
          if (mv === 'ult') {
            pup.setDemoRange(({ melee: 118, mid: 160, ranged: 205, screen: 220 })[(HERO_MOVE_TYPES[CHARS[i].id] || {}).ult?.rng] || 160);
            pup.setDemoOpponent((i + 1) % CHARS.length);
          }
        } else {
          pup.playSeq(HERO_FULL_DEMO[CHARS[i].id] || DEMO2, null, true);
        }
      }
      canvas._pup = pup;
      pup.update(dt);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cw = canvas._w || (canvas._w = canvas.clientWidth || 280);
      const chh = canvas._h || (canvas._h = canvas.clientHeight || 200);
      if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(chh * dpr)) {
        canvas.width = Math.round(cw * dpr); canvas.height = Math.round(chh * dpr);
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const ST = sk ? sceneOf(sk) : null;
      if (ST) withCtx(g, () => paintSceneCard(cw, chh, ST, now / 1000, chh / 300));
      else {
        const bg = g.createLinearGradient(0, 0, 0, chh); bg.addColorStop(0, '#15163a'); bg.addColorStop(1, '#0b0b1c'); g.fillStyle = bg; g.fillRect(0, 0, cw, chh);
      }
      g.fillStyle = 'rgba(200,180,255,0.12)'; g.fillRect(0, chh * 0.84, cw, 1.5);
      pup.draw(g, cw, chh, chh / 190);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
// ======================= 立绘卡面 =======================
const CARD_POSE = { yuxiao: 'yx_play', zuixian: 'zx_drink', gouchen: 'gc_throw', lingque: 'du_l1a', cixian: 'yx_push', qianji: 'qf_charge', qingfeng: 'hva', feiying: 'dash', tieshan: 'lda', lingshuang: 'l3a', liuyun: 'l2a', leiming: 'l3a', moyu: 'a2s', yuehua: 'victory', yanling: 'a1a', liying: 'fy_seal' };
function makeCardArt(i, CW, CH, skin) {
  const c = document.createElement('canvas'); c.width = CW; c.height = CH;
  const g = c.getContext && c.getContext('2d'); if (!g) return c;
  const ch = CHARS[i], L = skin ? skinLook(i, skin) : ch.look, rgb = L.slash, seed = i * 13.7;
  withCtx(g, () => {
    const u = CW / 300;   // 卡面按 300 宽设计，再按实际大小缩放
    // 背景：夜色 + 角色主色晕染
    let bg = ctx.createLinearGradient(0, 0, 0, CH); bg.addColorStop(0, '#0d0e24'); bg.addColorStop(0.6, '#191634'); bg.addColorStop(1, '#0a0918');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, CW, CH);
    const ST = skin ? sceneOf(skin) : null;
    let rg;
    if (ST) paintSceneCard(CW, CH, ST, 0.8, u);   // 皮肤：画出它自己的场景
    else {
      rg = ctx.createRadialGradient(CW * 0.55, CH * 0.38, 10 * u, CW * 0.55, CH * 0.38, CW * 0.8);
      rg.addColorStop(0, `rgba(${rgb},0.35)`); rg.addColorStop(1, `rgba(${rgb},0)`); ctx.fillStyle = rg; ctx.fillRect(0, 0, CW, CH);
      // 月亮
      ctx.fillStyle = 'rgba(247,236,216,0.9)'; ctx.beginPath(); ctx.arc(CW * 0.64, CH * 0.28, 62 * u, 0, 7); ctx.fill();
      rg = ctx.createRadialGradient(CW * 0.64, CH * 0.28, 55 * u, CW * 0.64, CH * 0.28, 150 * u);
      rg.addColorStop(0, 'rgba(255,236,210,0.35)'); rg.addColorStop(1, 'rgba(255,236,210,0)'); ctx.fillStyle = rg; ctx.fillRect(0, 0, CW, CH);
      // 远山
      ctx.fillStyle = 'rgba(30,26,60,0.9)'; ctx.beginPath(); ctx.moveTo(0, CH);
      for (let x = 0; x <= CW; x += 6 * u) ctx.lineTo(x, CH * 0.66 - Math.sin(x / (40 * u) + seed) * 18 * u - Math.sin(x / (17 * u) + seed * 2) * 7 * u);
      ctx.lineTo(CW, CH); ctx.fill();
    }
    // 竹影
    ctx.strokeStyle = 'rgba(8,8,20,0.8)';
    for (let k = 0; k < 5; k++) { const x = (hash(seed + k) * 0.9 + 0.05) * CW, w = (3 + hash(seed + k + 9) * 4) * u; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x, CH); ctx.lineTo(x + 6 * u, 0); ctx.stroke(); }
    // 墨点飞溅
    for (let k = 0; k < 26; k++) { ctx.fillStyle = k % 3 ? 'rgba(10,10,20,0.55)' : `rgba(${rgb},0.35)`; ctx.beginPath(); ctx.arc(hash(seed + k * 3) * CW, CH * 0.55 + hash(seed + k * 7) * CH * 0.4, (1 + hash(seed + k) * 5) * u, 0, 7); ctx.fill(); }
    // 角色（大尺寸、招式姿势，围巾先模拟一会儿让它飘起来）
    const pose = POSES[CARD_POSE[ch.id] || 'l1a'];
    const f = { x: CW * 0.42, y: CH * 0.86, face: 1, rot: 0, j: {}, look: { ...L, name: ch.name }, ch, wlen: WEAPON_LEN[L.weapon] || 54, size: ch.size || 1, idx: i, scarf: [], flying: !!ch.fly, state: ch.fly ? 'air' : 'idle' };
    for (const k of JOINTS) f.j[k] = [...pose[k]]; f.j.sw = pose.sw;
    const S = 2.25 * u * (ch.size || 1);
    ctx.save(); ctx.translate(f.x, f.y); ctx.scale(S, S); ctx.translate(-f.x, -f.y);
    f.sk = skeleton(f);
    for (let k = 0; k < 90; k++) { updateScarf(f); for (const p of f.scarf) p.x -= 0.25; }
    const gl = ctx.createRadialGradient(f.x, f.y - 60, 4, f.x, f.y - 60, 90); gl.addColorStop(0, `rgba(${rgb},0.35)`); gl.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = gl; ctx.fillRect(f.x - 100, f.y - 160, 200, 200);
    if (ch.fly) drawWings(f.sk, f);
    drawScarf(f); drawBody(f.sk, f, {});
    // 刀光
    ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(${rgb},0.55)`; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(f.x + 10, f.y - 70, 62, -1.9, 0.5); ctx.stroke(); ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
    // 竖排书法名字 + 印章
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `${Math.round(54 * u)}px ${TITLE_FONT}`;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; [...ch.name].forEach((t, k) => ctx.fillText(t, CW - 38 * u + 2 * u, 70 * u + k * 58 * u + 2 * u));
    ctx.fillStyle = '#f4ead5'; [...ch.name].forEach((t, k) => ctx.fillText(t, CW - 38 * u, 70 * u + k * 58 * u));
    ctx.translate(CW - 38 * u, 70 * u + ch.name.length * 58 * u + 16 * u); ctx.rotate(-0.06);
    ctx.fillStyle = '#b8392e'; ctx.fillRect(-16 * u, -16 * u, 32 * u, 32 * u);
    ctx.strokeStyle = 'rgba(255,240,225,0.6)'; ctx.lineWidth = 1.2 * u; ctx.strokeRect(-13 * u, -13 * u, 26 * u, 26 * u);
    ctx.fillStyle = '#fbeee0'; ctx.font = `${Math.round(15 * u)}px ${TITLE_FONT}`; ctx.fillText(ch.role.slice(0, 2), 0, 1 * u);
    ctx.restore();
    // 金色双线边框和角花
    // 皮肤卡：稀有度的字和边框照它自己的颜色（武库的五档：精铁、碧玉、灵犀、赤霄、绝世；不在武器箱里的照稀有 / 传说），提亮一点免得在夜色里发闷
    const GR = skin && SKINS[skin] ? skinGrade(skin) : null, gc = GR ? rgbMix(GR.c, '255,255,255', 0.28) : '233,196,106';
    if (ST) {   // 皮肤名：竖排名字下面的小字
      ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const sy = 70 * u + ch.name.length * 58 * u + 58 * u;
      ctx.font = `${Math.round(13 * u)}px ${BODY_FONT}`; ctx.fillStyle = `rgb(${gc})`;
      ctx.fillText(GR ? GR.n.replace('★ ', '') : ST.legend ? '传说' : '稀有', CW - 38 * u, sy);
      ctx.font = `${Math.round(24 * u)}px ${TITLE_FONT}`;
      [...ST.name].forEach((t, k) => ctx.fillText(t, CW - 38 * u, sy + 26 * u + k * 27 * u));
      ctx.restore();
    }
    const fc = gc;
    ctx.strokeStyle = `rgba(${fc},0.85)`; ctx.lineWidth = 2 * u; ctx.strokeRect(7 * u, 7 * u, CW - 14 * u, CH - 14 * u);
    ctx.strokeStyle = `rgba(${fc},0.4)`; ctx.lineWidth = 1 * u; ctx.strokeRect(12 * u, 12 * u, CW - 24 * u, CH - 24 * u);
    if (ST && ST.legend) {   // 传说卡面：四角云纹 + 底部的主题图案
      ctx.strokeStyle = 'rgba(255,225,150,0.9)'; ctx.lineWidth = 1.6 * u;
      for (const [cx, cy, sx, sy] of [[7, 7, 1, 1], [CW / u - 7, 7, -1, 1], [7, CH / u - 7, 1, -1], [CW / u - 7, CH / u - 7, -1, -1]]) {
        ctx.save(); ctx.translate(cx * u, cy * u); ctx.scale(sx * u, sy * u);
        ctx.beginPath(); ctx.moveTo(0, 34); ctx.lineTo(0, 0); ctx.lineTo(34, 0); ctx.moveTo(6, 26); ctx.quadraticCurveTo(6, 6, 26, 6); ctx.stroke();
        ctx.beginPath(); ctx.arc(14, 14, 4, 0, 7); ctx.stroke(); ctx.restore();
      }
      ctx.save(); ctx.translate(CW / 2, CH - 34 * u); ctx.globalCompositeOperation = 'lighter'; drawGlyph(ST.hit, 18 * u, ST.hitC, 0.7); ctx.restore();
    }
    for (const [cx, cy, sx, sy] of [[12, 12, 1, 1], [CW / u - 12, 12, -1, 1], [12, CH / u - 12, 1, -1], [CW / u - 12, CH / u - 12, -1, -1]]) {
      ctx.save(); ctx.translate(cx * u, cy * u); ctx.scale(sx * u, sy * u);
      ctx.strokeStyle = 'rgba(233,196,106,0.9)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(10, 10, 8, Math.PI, Math.PI * 1.5); ctx.moveTo(0, 22); ctx.lineTo(0, 0); ctx.lineTo(22, 0); ctx.stroke();
      ctx.restore();
    }
    // 底部渐隐和定位文字
    const fade = ctx.createLinearGradient(0, CH * 0.8, 0, CH); fade.addColorStop(0, 'rgba(10,9,24,0)'); fade.addColorStop(1, 'rgba(10,9,24,0.85)');
    ctx.fillStyle = fade; ctx.fillRect(0, CH * 0.8, CW, CH * 0.2);
    ctx.fillStyle = `rgb(${rgb})`; ctx.font = `${Math.round(13 * u)}px ${BODY_FONT}`; ctx.textAlign = 'left';
    ctx.fillText(ch.role, 20 * u, CH - 22 * u);
  });
  return c;
}
function makePortrait(i) { try { return makeCardArt(i, 240, 320, typeof mySkin === 'function' ? mySkin(CHARS[i].id) : '').toDataURL(); } catch (e) { return ''; } }
function ensurePortraits() { if (!PORTRAITS.length) for (let i = 0; i < CHARS.length; i++) PORTRAITS.push(makePortrait(i)); }
const bpMySide = () => bpMode === 'net' ? (NET.role === 'host' ? 0 : 1) : 0;
// 点将台模式的设定：联机看房间规则，本机看模式表（都在 src/data/10-modes.js）
const bpModeDef = (mode = bpMode) => mode === 'net' ? roomDef() : (MODES[mode] || MODE_DEFAULT);
const isLocalBp = mode => !!bpModeDef(mode).local;   // 不联机的点将台：本机自己推进每一步
const bpAuth = () => isLocalBp(bpMode) || NET.role === 'host';
const bpSideName = side => {
  const md = bpModeDef();
  if (md.sides) return md.sides[side];
  if (bpCustomOpts && bpCustomOpts.isWatch) return side === 0 ? '苍龙 (AI)' : '赤凤 (AI)';
  if (bpMode === 'cuju' && bpCustomOpts && bpCustomOpts.pvp) return side === 0 ? '1P' : '2P';
  if (isLocalBothHumanBP()) return side === 0 ? '苍龙队 (1P/2P)' : '赤凤队 (3P/4P)';
  if (side === bpMySide()) return md.us || '你';
  if (md.foe) return md.foe;
  const n = NET.names && NET.names[side === 0 ? 'host' : 'client'];
  return n ? String(n) : '对手';
};
let bpFinishTimer = null;
let currentPreMatch = null;
// JSON-only pre-match data can be sent to a peer and saved in a replay.
// Hero indices are stored by side and slot, even in a one-hero draft.
