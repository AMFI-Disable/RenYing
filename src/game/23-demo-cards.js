// ======================= 演示动画（不跑对战，只按顺序摆招式） =======================
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
    this.badges = [];
    this.projs = [];
    this.rings = [];
    this.fx = [];
    this.puddles = [];
    this.hitQ = [];
  }
  set(i, skin) {
    const ch = CHARS[i];
    this.skin = skin === undefined ? mySkin(ch.id) : skin;
    Object.assign(this, { chIdx: i, ch, look: skinLook(i, this.skin), wlen: WEAPON_LEN[ch.look.weapon] || 54, size: ch.size || 1,
      j: {}, k: 0, t: 0, ox: 0, x: 0, y: 0, face: 1, rot: 0, trail: [], scarf: [], idx: 0, state: 'idle', flying: false,
      badges: [], projs: [], rings: [], fx: [], puddles: [], hitQ: [], dummyY: 0, dummyVy: 0, dummyShake: 0, flashT: 0, dimT: 0 });
    for (const k of JOINTS) this.j[k] = [...POSES.idle[k]]; this.j.sw = POSES.idle.sw;
    this.sk = skeleton(this);
  }
  update(dt) {
    const defaultSeq = (HERO_FULL_DEMO && HERO_FULL_DEMO[this.ch.id]) ? HERO_FULL_DEMO[this.ch.id] : DEMO2;
    let steps = this.customSeq || defaultSeq;
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
      if (st.reset) { this.ox = 0; this.x = 0; }
      this.ox += st.dx || 0;
      if (this.customLab) this.lab = this.customLab;
      else if (st.lab) this.lab = { L: '左键 · 连击', Q: `Q · ${SKILLS[ch.skill].name}`, R: `左键+右键 · ${SKILLS[ch.skill2].name}`, E: `E · ${ULTS[ch.ult].name}`, '按住蓄力': '按住左键 · 蓄力', '空中': '空中斩', '腾空闪': '右键 · 腾空闪' }[st.lab] || st.lab;
      if (st.hit) this.hitQ.push({ t: 0.045, n: st.hit, launch: st.launch, badge: st.badge });

        // 各种招式实体与大招全屏特效
      if (st.fx === 'proj') this.projs.push({ kind: 'proj', x: this.x + 34, y: -62, vx: 880, life: 0.5, col: this.look.slash });
      else if (st.fx === 'swordqi') { this.projs.push({ kind: 'swordqi', x: this.x + 30, y: -62, vx: 920, life: 0.5, col: '120,230,255' }); this.rings.push({ x: this.x + 30, y: -62, r: 14, life: 0.3 }); }
      else if (st.fx === 'gale') { this.rings.push({ x: this.x + 20, y: -62, r: 18, life: 0.4 }, { x: 60, y: -62, r: 24, life: 0.4 }); this.fx.push({ x: this.x + 20, y: -62, vx: 700, vy: 0, life: 0.2, c: '120,230,255' }); }
      else if (st.fx === 'quake') { this.projs.push({ kind: 'quake', x: this.x + 20, y: 0, vx: 560, life: 0.45, col: '255,200,120' }); for (let k = 0; k < 6; k++) this.fx.push({ x: this.x + 20 + rand(-10, 10), y: 0, vx: rand(100, 300), vy: -rand(150, 350), life: 0.35, c: '200,160,100' }); }
      else if (st.fx === 'ironwall') { this.rings.push({ x: this.x + 10, y: -60, r: 30, life: 0.45 }); this.flashT = 0.15; }
      else if (st.fx === 'crescent') { this.flashT = 0.25; this.dimT = 0.6; this.rings.push({ x: this.x + 30, y: -60, r: 45, life: 0.45, col: this.look.slash }, { x: 60, y: -60, r: 32, life: 0.4, col: '255,255,255' }); }
      else if (st.fx === 'avalanche') { this.flashT = 0.3; this.dimT = 0.7; this.rings.push({ x: 60, y: 0, r: 50, life: 0.55, col: '255,210,140' }, { x: this.x, y: 0, r: 35, life: 0.45 }); for (let k = 0; k < 12; k++) this.fx.push({ x: 60 + rand(-25, 25), y: 0, vx: rand(-240, 240), vy: -rand(200, 480), life: 0.48, c: '220,180,120' }); }
      else if (st.fx === 'blink') { for (let k = 0; k < 10; k++) this.fx.push({ x: this.x, y: -60 + rand(-20, 20), vx: rand(-80, 80), vy: rand(-80, 80), life: 0.3, c: '40,30,50' }); for (let k = 0; k < 8; k++) this.fx.push({ x: 60, y: -62 + rand(-20, 20), vx: rand(-120, 120), vy: rand(-120, 120), life: 0.3, c: '255,95,115' }); }
      else if (st.fx === 'kunai') { for (const a of [-0.15, 0, 0.15]) this.projs.push({ kind: 'kunai', x: this.x + 25, y: -65, vx: 1100 * Math.cos(a), vy: 1100 * Math.sin(a), life: 0.4, col: '200,200,220' }); }
      else if (st.fx === 'shadows') { this.flashT = 0.28; this.dimT = 0.65; this.rings.push({ x: 60, y: -62, r: 42, life: 0.5, col: '255,60,80' }); for (let k = 0; k < 8; k++) this.fx.push({ x: 60 + rand(-20, 20), y: -60 + rand(-20, 20), vx: rand(-160, 160), vy: rand(-160, 160), life: 0.35, c: '255,80,100' }); }
      else if (st.fx === 'windblade') { this.projs.push({ kind: 'wind', x: this.x + 30, y: -62, vx: 1000, life: 0.45, col: '150,255,200' }); }
      else if (st.fx === 'windstep') { this.rings.push({ x: this.x + 20, y: -60, r: 32, life: 0.35 }); for (let k = 0; k < 8; k++) this.fx.push({ x: this.x + 10, y: -60 + rand(-20, 20), vx: rand(-150, 150), vy: rand(-100, 100), life: 0.25, c: '150,255,200' }); }
      else if (st.fx === 'tornado') { this.dimT = 0.6; this.projs.push({ kind: 'tornado', x: this.x + 30, y: -70, vx: 360, life: 0.85, col: '150,255,200' }, { kind: 'tornado', x: this.x + 75, y: -70, vx: 420, life: 0.95, col: '180,255,230' }); }
      else if (st.fx === 'thunderfist') { this.rings.push({ x: this.x + 20, y: -62, r: 24, life: 0.35 }); for (let k = 0; k < 10; k++) this.fx.push({ x: this.x + rand(-10, 30), y: -62 + rand(-25, 25), vx: rand(-180, 180), vy: rand(-180, 180), life: 0.25, c: '255,230,120' }); }
      else if (st.fx === 'stomp') { this.projs.push({ kind: 'bolt', x: 60, y: -200, vx: 0, life: 0.35, col: '255,240,150' }); this.rings.push({ x: 60, y: 0, r: 25, life: 0.3 }); }
      else if (st.fx === 'thunder') { this.flashT = 0.32; this.dimT = 0.7; this.projs.push({ kind: 'bolt', x: 60, y: -220, vx: 0, life: 0.55, col: '255,240,150' }, { kind: 'bolt', x: 45, y: -220, vx: 0, life: 0.45, col: '255,255,200' }); this.rings.push({ x: 60, y: 0, r: 42, life: 0.45, col: '255,230,120' }); }
      else if (st.fx === 'backthrust') { this.rings.push({ x: 60, y: -68, r: 20, life: 0.3 }); for (let k = 0; k < 8; k++) this.fx.push({ x: 60, y: -68, vx: rand(100, 300), vy: rand(-120, 120), life: 0.25, c: '170,220,255' }); }
      else if (st.fx === 'spin') { this.rings.push({ x: this.x + 25, y: -65, r: 28, life: 0.35 }); }
      else if (st.fx === 'timestop') { this.flashT = 0.35; this.dimT = 0.75; this.rings.push({ x: 60, y: -65, r: 45, life: 0.45, col: '180,230,255' }, { x: this.x + 30, y: -65, r: 30, life: 0.35 }); }
      else if (st.fx === 'inktrap') { this.puddles.push({ x: 60, life: 2.5 }); }
      else if (st.fx === 'inkblob') { this.projs.push({ kind: 'inkblob', x: this.x + 25, y: -80, vx: 450, vy: -380, g: 1400, life: 0.6, col: '40,40,55' }); }
      else if (st.fx === 'inkdragon') { this.dimT = 0.8; this.projs.push({ kind: 'dragon', x: this.x + 30, y: -65, vx: 620, life: 0.85, col: '25,25,35' }); this.flashT = 0.25; this.rings.push({ x: 60, y: -65, r: 45, life: 0.5, col: '230,70,50' }); }
      else if (st.fx === 'mirror') { this.rings.push({ x: this.x + 25, y: -65, r: 24, life: 0.4, col: '215,195,255' }); }
      else if (st.fx === 'moonring') { this.projs.push({ kind: 'moonring', x: this.x + 30, y: -65, vx: 650, life: 0.7, col: '215,195,255' }); }
      else if (st.fx === 'moonflow') { this.dimT = 0.65; this.flashT = 0.25; this.rings.push({ x: this.x, y: -60, r: 48, life: 0.55, col: '215,195,255' }, { x: this.x, y: -60, r: 28, life: 0.45, col: '180,255,200' }); this.badges.push({ text: '+60', x: this.x, y: -105, life: 0.85, max: 0.85 }); }
      else if (st.fx === 'dive') { this.rings.push({ x: 60, y: -40, r: 22, life: 0.3, col: '140,190,255' }); }
      else if (st.fx === 'feather') { for (const dy of [-12, 0, 12]) this.projs.push({ kind: 'feather', x: this.x + 25, y: -68 + dy, vx: 950, life: 0.45, col: '160,205,255' }); }
      else if (st.fx === 'featherstorm') { this.flashT = 0.25; this.dimT = 0.65; for (let k = 0; k < 8; k++) this.projs.push({ kind: 'feather', x: 60 + rand(-35, 35), y: -220 - k * 28, vx: rand(-30, 30), vy: 980, life: 0.42, col: '160,205,255' }); }
      else if (st.fx === 'shanshui') { this.flashT = 0.25; this.dimT = 0.8; this.rings.push({ x: 60, y: -60, r: 45, life: 0.55, col: '233,196,106' }); for (let k = 0; k < 8; k++) this.fx.push({ x: 60 + rand(-30, 30), y: -60 + rand(-30, 30), vx: rand(-120, 120), vy: rand(-120, 120), life: 0.4, c: '20,20,30' }); }
      else if (st.fx === 'skynet') { this.flashT = 0.28; this.dimT = 0.7; this.rings.push({ x: 60, y: 0, r: 50, life: 0.55, col: '235,205,130' }); for (let k = 0; k < 8; k++) this.fx.push({ x: 60 + rand(-20, 20), y: 0, vx: rand(-150, 150), vy: -rand(120, 360), life: 0.4, c: '200,160,100' }); }
      else if (st.fx === 'note') { this.rings.push({ x: this.x + 25, y: -65, r: 24, life: 0.4, col: '150,240,200' }); this.projs.push({ kind: 'proj', x: this.x + 30, y: -65, vx: 800, life: 0.45, col: '150,240,200' }); }
      else if (st.fx === 'guangling') { this.flashT = 0.28; this.dimT = 0.7; this.rings.push({ x: 60, y: -65, r: 42, life: 0.5, col: '150,240,200' }, { x: 60, y: 0, r: 35, life: 0.45, col: '233,196,106' }); for (let k = 0; k < 6; k++) this.fx.push({ x: 60 + rand(-20, 20), y: -60 + rand(-20, 20), vx: rand(-140, 140), vy: rand(-140, 140), life: 0.35, c: '150,240,200' }); }
    }
    const st = steps[this.k], name = st.p, p = POSES[name] || POSES.idle, a = 1 - Math.exp(-(DEMO_SWING.has(name) ? 55 : 22) * dt);
    for (const k of JOINTS) { this.j[k][0] += (p[k][0] - this.j[k][0]) * a; this.j[k][1] += (p[k][1] - this.j[k][1]) * a; }
    this.j.sw += (p.sw - this.j.sw) * a;
    this.flying = false; this.state = 'idle';
    this.y = damp(this.y, 0, 9, dt); this.x = damp(this.x, this.ox - 60, 10, dt);
    this.sk = skeleton(this);
    if (DEMO_SWING.has(name) && this.t < 0.14) this.trail.push({ b: this.sk.bladeMid, t: this.sk.tip, life: 1 });
    for (const e of this.trail) e.life -= dt / 0.18;
    while (this.trail.length && this.trail[0].life <= 0) this.trail.shift();

    // 命中稻草人反馈：火花、晃动、浮空、控制徽标
    const hit = (n, launch, badge) => {
      this.dummyShake = Math.min(0.7, this.dummyShake + 0.22 * n);
      if (launch) this.dummyVy = -320 * Math.min(1.5, Math.sqrt(n));
      for (let k = 0; k < 8 * n; k++) {
        const an = rand(-2.4, 0.6), v = rand(120, 400);
        this.fx.push({ x: 60, y: -62 + this.dummyY + rand(-16, 16), vx: Math.cos(an) * v, vy: Math.sin(an) * v, life: rand(0.18, 0.35), c: Math.random() < 0.35 ? '255,255,255' : this.look.slash });
      }
      this.rings.push({ x: 60, y: -62 + this.dummyY, r: 8, life: 0.25 });
      if (badge) this.badges.push({ text: badge, x: 60, y: -95 + this.dummyY, life: 0.75, max: 0.75 });
    };
    for (const q of this.hitQ) { q.t -= dt; if (q.t <= 0) { hit(q.n, q.launch, q.badge); q.done = true; } }
    this.hitQ = this.hitQ.filter(q => !q.done);

    // 飞行物更新与碰撞
    for (const p of this.projs) {
      p.x += (p.vx || 0) * dt;
      p.y = (p.y || -62) + (p.vy || 0) * dt;
      if (p.g) p.vy += p.g * dt;
      p.life -= dt;
      if (p.kind === 'moonring' && p.life < 0.35 && p.vx > 0) p.vx = -p.vx;
      if (!p.hitDone && p.vx > 0 && p.x >= 50 && p.x <= 75) {
        p.hitDone = true;
        hit(1.2, p.kind === 'tornado' || p.kind === 'bolt' || p.kind === 'dragon');
      }
    }
    this.projs = this.projs.filter(p => p.life > 0);

    // 稻草人物理
    this.dummyY += this.dummyVy * dt;
    this.dummyVy += 1300 * dt;
    if (this.dummyY >= 0) { this.dummyY = 0; this.dummyVy = 0; }
    this.dummyShake = Math.max(0, this.dummyShake - dt * 2.2);

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
      // 稻草人靶子（带浮空与晃动）
      const tilt = Math.sin(performance.now() / 25) * this.dummyShake;
      ctx.save(); ctx.translate(60, -60 + this.dummyY); ctx.rotate(tilt); ctx.translate(0, 60);
      ctx.fillStyle = '#4a3322'; ctx.fillRect(-3, -118, 6, 118); ctx.fillRect(-30, -88, 60, 5);
      ctx.fillStyle = this.dummyShake > 0.2 ? '#f5e6c4' : '#b08a5a'; ctx.beginPath(); ctx.ellipse(0, -76, 18, 27, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(0, -114, 12, 0, 7); ctx.fill();
      ctx.strokeStyle = '#6b4f30'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-16, -86); ctx.lineTo(16, -86); ctx.moveTo(-16, -64); ctx.lineTo(16, -64); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(this.x, 2, 36, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.save();
      if (this.size !== 1) { ctx.translate(this.x, 0); ctx.scale(this.size, this.size); ctx.translate(-this.x, 0); }
      if (this.ch.fly) drawWings(this.sk, this);
      drawScarf(this); drawBody(this.sk, this, {});
      ctx.restore();
      drawTrail(this);
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
        } else if (p.kind === 'kunai') {
          ctx.fillStyle = '#eee'; ctx.beginPath(); ctx.moveTo(p.x + 8, p.y); ctx.lineTo(p.x - 6, p.y - 4); ctx.lineTo(p.x - 6, p.y + 4); ctx.fill();
        } else {
          ctx.beginPath(); ctx.ellipse(p.x, p.y, 14, 6, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(p.x + 3, p.y, 6, 3, 0, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();
      if (this.flashT > 0) { ctx.fillStyle = `rgba(${this.look.slash},${this.flashT})`; ctx.fillRect(0, 0, w, h); }
      for (const b of this.badges) {
        const alpha = Math.min(1, b.life * 2.5);
        ctx.save(); ctx.translate(w / 2, h * 0.84); ctx.scale(scale, scale);
        ctx.font = `bold 12px ${BODY_FONT}`;
        const bw = ctx.measureText(b.text).width;
        ctx.fillStyle = `rgba(10,12,24,${alpha * 0.85})`;
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(b.x - bw / 2 - 6, b.y - 10, bw + 12, 20, 4) : ctx.rect(b.x - bw / 2 - 6, b.y - 10, bw + 12, 20); ctx.fill();
        ctx.strokeStyle = `rgba(${this.look.slash},${alpha * 0.8})`; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(b.text, b.x, b.y);
        ctx.restore();
      }
      if (!hideLabel && this.lab) {
        ctx.font = `600 12px ${BODY_FONT}`; const tw = ctx.measureText(this.lab).width;
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(8, 8, tw + 18, 22, 11) : ctx.rect(8, 8, tw + 18, 22); ctx.fill();
        ctx.fillStyle = `rgb(${this.look.slash})`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(this.lab, 17, 19.5);
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
        if (mv && HERO_MOVE_SEQS[CHARS[i].id] && HERO_MOVE_SEQS[CHARS[i].id][mv]) {
          pup.playSeq(HERO_MOVE_SEQS[CHARS[i].id][mv], null, true);
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
const CARD_POSE = { yuxiao: 'yx_play', zuixian: 'zx_drink', gouchen: 'gc_throw', qingfeng: 'hva', feiying: 'dash', tieshan: 'lda', lingshuang: 'l3a', liuyun: 'l2a', leiming: 'l3a', moyu: 'a2s', yuehua: 'victory', yanling: 'a1a' };
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
    // 皮肤卡：稀有度的字和边框照它自己的颜色（武库的五档：军规级、受限、保密、隐秘、非凡；不在武器箱里的照稀有 / 传说），提亮一点免得在夜色里发闷
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
const bpAuth = () => bpMode === 'cpu' || bpMode === 'cpuWatch' || bpMode === 'chaos' || bpMode === 'mayhem' || bpMode === 'tag3' || bpMode === 'tower' || bpMode === 'stage' || bpMode === 'train' || bpMode === '2v2' || NET.role === 'host';
const bpSideName = side => {
  if (bpMode === 'cpuWatch') return side === 0 ? '苍龙 (AI)' : '赤凤 (AI)';
  if (bpCustomOpts && bpCustomOpts.isWatch) return side === 0 ? '苍龙 (AI)' : '赤凤 (AI)';
  if (isLocalBothHumanBP()) return side === 0 ? '苍龙队 (1P/2P)' : '赤凤队 (3P/4P)';
  if (side === bpMySide()) return (bpMode === '2v2' || (bpMode === 'net' && (netRoomMode === 'pp_cc' || netRoomMode === 'pp_pp'))) ? '我方战队' : '你';
  if (bpMode === 'cpu' || bpMode === 'chaos' || bpMode === 'mayhem') return '电脑';
  if (bpMode === 'tag3' || bpMode === '2v2') return '敌方战队';
  const n = NET.names && NET.names[side === 0 ? 'host' : 'client'];
  return n ? String(n) : '对手';
};
let bpFinishTimer = null;
function bpStart(mode, customOpts = null) {
  if (bpFinishTimer) { clearTimeout(bpFinishTimer); bpFinishTimer = null; }
  if (mode === 'cpu' || mode === 'cpuWatch' || mode === 'chaos' || mode === 'mayhem' || mode === 'tag3' || mode === 'tower' || mode === 'stage' || mode === 'train' || mode === '2v2') netDropWaiting();
  watch2v2Bp = null;   // 进入任何常规禁选都先取消可能残留的 2v2 禁选
  ensurePortraits(); chatClear();
  bpMode = mode;
  bpCustomOpts = customOpts;
  let steps = BP_STEPS;
  let bans = [-1, -1];
  let picks = [-1, -1];

  if (mode === 'tag3') {
    // 3v3 门派车轮战：双方各禁 1 人 + 轮流选 3 人 (共 8 步)
    steps = [[0, 'ban'], [1, 'ban'], [0, 'pick'], [1, 'pick'], [0, 'pick'], [1, 'pick'], [0, 'pick'], [1, 'pick']];
    bans = [-1, -1];
    picks = [[-1, -1, -1], [-1, -1, -1]];
  } else if (mode === 'tower' || mode === 'stage' || mode === 'train') {
    // 单人闯塔 / 守关挑战 / 木人试剑：免禁用直接自选出战角色 (1 步)
    steps = [[0, 'pick']];
    bans = [];
    picks = [-1];
  } else if (mode === 'chaos' || mode === 'mayhem') {
    // 乱斗 / 神决：娱乐异变免禁用直选 (玩家先选，电脑后选)
    steps = [[0, 'pick'], [1, 'pick']];
    bans = [];
    picks = [-1, -1];
  } else if (mode === '2v2') {
    // 2v2 演武 / 同屏合作或对决：双方各禁 1 人 + 蛇形轮选 4 将 (共 6 步: 0禁 -> 1禁 -> 0选1 -> 1选1 -> 1选2 -> 0选2)
    steps = [[0, 'ban'], [1, 'ban'], [0, 'pick'], [1, 'pick'], [1, 'pick'], [0, 'pick']];
    bans = [-1, -1];
    picks = [[-1, -1], [-1, -1]];
  } else if (mode === 'net') {
    if (netRoomMode === 'pp_cc' || netRoomMode === 'pp_pp') {
      steps = [[0, 'ban'], [1, 'ban'], [0, 'pick'], [1, 'pick'], [1, 'pick'], [0, 'pick']];
      bans = [-1, -1];
      picks = [[-1, -1], [-1, -1]];
    } else if (netRoomMode === 'chaos') {
      steps = [[0, 'pick'], [1, 'pick']];
      bans = [];
      picks = [-1, -1];
    } else {
      steps = BP_STEPS;
      bans = [-1, -1];
      picks = [-1, -1];
    }
  }

  BP = {
    step: 0,
    steps,
    bans,
    picks,
    t: BP_TIME,
    avail: [availList(), mode === 'net' ? (NET.peerAvail || null) : null]
  };
  bpSel = -1; bpCpuT = 0.85;
  showScreen('bp'); renderBP();
  if (mode === 'net') send({ bps: BP });
}
function bpValid(i) {
  if (!BP || BP.step >= bpSteps().length || i < 0 || i >= CHARS.length) return false;
  if (Array.isArray(BP.bans) && BP.bans.includes(i)) return false;
  const stepDef = bpSteps()[BP.step];
  if (!stepDef) return false;
  if (stepDef[1] === 'pick') {
    if (isMultiPickBP()) {
      const allPicked = [...(BP.picks[0] || []), ...(BP.picks[1] || [])];
      if (allPicked.includes(i)) return false;
    } else if (Array.isArray(BP.picks) && BP.picks.includes(i)) {
      return false;
    }
  }
  if (stepDef[1] === 'pick') {
    const av = BP.avail && BP.avail[stepDef[0]];
    const currentBans = Array.isArray(BP.bans) ? BP.bans : [];
    const currentPicks = isMultiPickBP() ? [...(BP.picks[0] || []), ...(BP.picks[1] || [])] : (Array.isArray(BP.picks) ? BP.picks : []);
    if (av && av.length && av.some(k => !currentBans.includes(k) && !currentPicks.includes(k)) && !av.includes(i)) return false;
  }
  return true;
}
function bpApply(i) {
  if (!BP || BP.step >= bpSteps().length) return;
  if (!bpValid(i)) {
    const fallback = CHARS.map((c, idx) => idx).find(bpValid);
    if (fallback !== undefined) i = fallback;
    else return;
  }
  const [side, type] = bpSteps()[BP.step];
  if (type === 'ban') {
    BP.bans[side] = i;
  } else {
    if (isMultiPickBP()) {
      const slots = BP.picks[side];
      const emptyIdx = slots.findIndex(v => v < 0);
      if (emptyIdx >= 0) slots[emptyIdx] = i;
      else slots[slots.length - 1] = i;
    } else if (Array.isArray(BP.picks)) {
      BP.picks[side] = i;
    }
  }
  BP.step++; BP.t = BP_TIME; bpSel = -1; bpCpuT = 0.85;
  if (type === 'ban') SFX.thud(); else { SFX.block(); }
  if (bpMode === 'net') send({ bps: BP });
  renderBP();
  if (BP.step >= bpSteps().length) {
    if (bpFinishTimer) clearTimeout(bpFinishTimer);
    bpFinishTimer = setTimeout(bpFinish, 1100);
  }
}
function bpFinish() {
  bpFinishTimer = null;
  if (currentScreen !== 'bp' || !BP || BP.step < bpSteps().length) return;
  showPop(null);
  const picks = JSON.parse(JSON.stringify(BP.picks));
  const bans = Array.isArray(BP.bans) ? BP.bans.filter(x => x >= 0) : [];
  const mode = bpMode;
  const opts = bpCustomOpts || {};
  BP = null;
  bpCustomOpts = null;
  showScreen(null);
  MSTAT.maxcombo = 0; MSTAT.ults = 0;

  if (mode === 'cpu') {
    startMatch('cpu', pickLevel, picks);
  } else if (mode === 'cpuWatch') {
    startMatch('cpu', pickLevel || 'god', picks, true);
  } else if (mode === 'net') {
    if (NET.role === 'host') {
      const seed = (Math.random() * 2147483647) | 0;
      const flatCh = Array.isArray(picks[0]) ? [picks[0][0], picks[1][0], picks[0][1], picks[1][1]] : picks;
      send({ rstart: { ch: flatCh, seed } });
      rollStart(flatCh, seed);
    }
  } else if (mode === 'chaos') {
    startChaos(picks[0], picks[1], opts.level || chaosLevel, !!opts.isWatch);
  } else if (mode === 'mayhem') {
    startMayhem(picks[0], picks[1], opts.level || mayhemLevel, !!opts.isWatch);
  } else if (mode === 'tag3') {
    startTag3Match(picks[0], picks[1], opts.level || tag3Level, !!opts.isWatch);
    M.bans = bans;
  } else if (mode === 'tower') {
    startTower(picks[0], !!opts.isWatch);
  } else if (mode === 'stage') {
    startStage(opts.stageCh !== undefined ? opts.stageCh : stageCh, opts.stageL !== undefined ? opts.stageL : (STAGE ? STAGE.l : 1), !!opts.isWatch, picks[0]);
  } else if (mode === 'train') {
    trainChar = picks[0];
    startTraining(opts.targetMode || trainTargetMode, !!opts.isWatch);
  } else if (mode === '2v2') {
    const sub = opts.subMode || 'pc_cc';
    if (sub === 'pp_cc') {
      start2v2LocalCoop(picks[0][0], picks[0][1], picks[1][0], picks[1][1], opts.level || 'normal');
    } else if (sub === 'pp_pp') {
      start2v2LocalVs(picks[0][0], picks[0][1], picks[1][0], picks[1][1]);
    } else {
      start2v2PlayerMatch(picks[0][0], picks[0][1], picks[1][0], picks[1][1], opts.level || 'normal');
    }
    M.bans = bans;
  }
  applySkins();
}
// 电脑选人：禁掉一个随机角色；选人时六成概率挑能克制你的角色
function bpCpuChoice() {
  const valid = CHARS.map((c, i) => i).filter(bpValid);
  if (!valid.length) {
    // 终极保底：任何未禁未选的角色
    for (let i = 0; i < CHARS.length; i++) {
      if (bpValid(i)) return i;
    }
    return 0;
  }
  if (pickLevel === 'adaptive') {
    const fav = adaptFav(), type = bpSteps()[BP.step][1];
    if (type === 'ban' && fav.best >= 0 && valid.includes(fav.best)) return fav.best;       // 禁你胜率最高的
    if (type === 'pick' && fav.most >= 0 && valid.includes(fav.most)) return fav.most;      // 用你最常用的
  }
  if (bpSteps()[BP.step][1] === 'pick') {
    let enemyHero = -1;
    if (Array.isArray(BP.picks)) {
      if (typeof BP.picks[0] === 'number' && BP.picks[0] >= 0) enemyHero = BP.picks[0];
      else if (Array.isArray(BP.picks[0]) && BP.picks[0].length) enemyHero = BP.picks[0][0];
    }
    if (enemyHero >= 0 && Math.random() < 0.6) {
      const mine = CHARS[enemyHero] && CHARS[enemyHero].id;
      if (mine) {
        const counters = valid.filter(i => CHARS[i] && CHARS[i].beats && CHARS[i].beats.includes(mine));
        if (counters.length) return counters[Math.random() * counters.length | 0];
      }
    }
  }
  return valid[Math.random() * valid.length | 0];
}
function bpTick(dt) {
  if (bpMode === 'watch2v2') { bpTickWatch2v2(dt); return; }
  if (!BP || BP.step >= bpSteps().length || !document.getElementById('bp').classList.contains('on') || NET.hold) return;
  BP.t = Math.max(0, BP.t - dt);
  document.getElementById('bpTime').textContent = `${Math.ceil(BP.t)} 秒`;
  document.getElementById('bpTime').classList.toggle('urgent', BP.t <= 8);
  if (!bpAuth()) return;
  const side = bpSteps()[BP.step][0];
  const isWatch = bpMode === 'cpuWatch' || (bpCustomOpts && bpCustomOpts.isWatch);
  if (isWatch || (side !== bpMySide() && bpMode !== 'net' && !isLocalBothHumanBP())) {
    bpCpuT -= dt;
    if (bpCpuT <= 0 || BP.t <= 0) {
      const choice = bpCpuChoice();
      bpApply(choice);
    }
    return;
  }
  if (BP.t <= 0) {
    const v = CHARS.map((c, i) => i).filter(bpValid);
    const chosen = bpSel >= 0 && bpValid(bpSel) && isMyTurnBP() ? bpSel : (v.length ? v[Math.random() * v.length | 0] : 0);
    bpApply(chosen);
  }
}
function bpDetailHTML(i) {
  if (i < 0) return '<p style="color:var(--dim);grid-column:1/-1;margin:0">把鼠标移到角色上，可查看招式与克制关系。</p>';
  const c = CHARS[i], S = SKILLS[c.skill], U = ULTS[c.ult];
  const curSkin = mySkin(c.id);
  const L = skinLook(i, curSkin);
  const col = `rgb(${L.slash})`;
  const nm = ids => (ids || []).map(id => (CHARS[CHAR_IDX[id]] ? CHARS[CHAR_IDX[id]].name : id)).filter(Boolean).join('、') || '无';
  const restr = HERO_RESTRAINTS_EXPLAIN[c.id];
  const restrHtml = restr
    ? `<div class="bp-restr-box" style="margin-top:6px;font-size:12px;line-height:1.45;color:var(--dim);text-align:left"><div style="color:#7fe0b0;margin-bottom:2px">${restr.beatsWhy}</div><div style="color:#ff8a8a">${restr.weakWhy}</div></div>`
    : `<p class="ctr">克制 <b>${nm(c.beats)}</b>　怕 <b>${nm(c.weakTo)}</b></p>`;
  const st = c.stat || {};
  const guardTxt = `耐力 ${st.guardMax || 100} · 稳定 ${Math.round((st.guardStab || 1) * 100)}% · 透伤 ${Math.round((st.guardChip || 0.1) * 100)}% · 回涌 ${st.guardRegen || 28}/秒`;
  const hits = HERO_HIT_DETAILS[c.id] || {};
  const comboFlow = hits.light ? `${hits.light.name}（${hits.light.badge || '连击'}） · 蓄力：${hits.charge ? hits.charge.name : '蓄力重斩'}` : '';
  const S2 = SKILLS[c.skill2];
  const specialMove = S2 ? `${S2.name} · ${S2.desc || ''}` : '';

  return `<img src="${PORTRAITS[i] || makePortrait(i)}" alt="" style="border:1px solid ${col};border-radius:6px">
    <div><h3 style="color:${col};display:flex;align-items:center;gap:8px;margin:0 0 4px">${c.name}${curSkin ? `<span class="pill" style="font-size:12px;color:${col};border-color:${col}">皮肤 · ${SKINS[curSkin].name}</span>` : ''}</h3>
    <!-- 皮肤改在角色图鉴里装配：选人是有时限的，这里只显示当前装束 -->
    <div class="meta"><span>${c.role}</span><span>难度 ${'★'.repeat(c.diff)}${'☆'.repeat(3 - c.diff)}</span><span>生命 ${Math.round((st.hp || 500) * ((BAL[c.id] || {}).hp || 1))}</span><span>体量 ${(st.weight || 1).toFixed(2)}</span><span>移速 ${(st.walk || 1).toFixed(2)}</span></div>
    <dl><dt>被动 ${c.passiveName}</dt><dd>${c.passiveDesc}</dd>
    <dt>门派架势</dt><dd>${guardTxt}</dd>
    ${comboFlow ? `<dt>连招流向</dt><dd>${comboFlow}</dd>` : ''}
    <dt>技能 ${S.name}</dt><dd>${S.desc}（冷却 ${S.cd} 秒）</dd>
    ${specialMove ? `<dt>绝技 ${S2.name}</dt><dd>${specialMove}</dd>` : ''}
    <dt>大招 ${U.name}</dt><dd>${U.desc}<div style="margin-top:2px;font-size:12px;color:#ffe8a3">${HERO_METER_EXPLAIN[c.id] || ''}</div></dd>${ADV[c.id] ? `<dt>进阶</dt><dd>${ADV[c.id]}</dd>` : ''}</dl>
    ${restrHtml}</div>`;
}
function buildDetails(force) {
  const box = document.getElementById('bpDetail');
  if (!force && box.dataset.built === String(PORTRAITS.length)) return;
  box.innerHTML = [-1, ...CHARS.map((c, i) => i)].map(i => `<div class="bpd" data-i="${i}">${bpDetailHTML(i)}</div>`).join('');
  box.dataset.built = String(PORTRAITS.length);
}
let bpDeckMove = 'light';
function updateBPDeck(i) {
  const idx = i >= 0 ? i : (bpSel >= 0 ? bpSel : 0);
  const ch = CHARS[idx];
  if (!ch) return;
  const curSkin = mySkin(ch.id);
  const L = skinLook(idx, curSkin);
  const col = `rgb(${L.slash})`;
  const mTypes = HERO_MOVE_TYPES[ch.id] || {};
  const qType = mTypes.skill || { label: '技能', type: 'melee' };
  const rType = mTypes.ranged || { label: '远程', type: 'ranged' };
  const tabs = [
    { k: 'light', lab: '普攻连击 [近战]' },
    { k: 'charge', lab: '蓄力重斩 [近战]' },
    { k: 'skill', lab: `Q · ${SKILLS[ch.skill].name} [${qType.label}]` },
    { k: 'ranged', lab: `R · ${SKILLS[ch.skill2].name} [${rType.label}]` },
    { k: 'ult', lab: `E · ${ULTS[ch.ult].name}` },
  ];
  const tabsEl = $id('bpDeckTabs');
  if (tabsEl) {
    tabsEl.innerHTML = tabs.map(t => `<button class="${t.k === bpDeckMove ? 'sel' : ''}" data-m="${t.k}">${t.lab}</button>`).join('');
    requestAnimationFrame(() => tabsEl.classList.toggle('overflowing', tabsEl.scrollWidth > tabsEl.clientWidth + 2));
  }
  const hit = (HERO_HIT_DETAILS[ch.id] && HERO_HIT_DETAILS[ch.id][bpDeckMove]) || { name: '', badge: '', badgeCls: 'badge-buff', dmg: '', desc: '' };
  const curType = mTypes[bpDeckMove] || { label: '近战', type: 'melee' };
  const nameEl = $id('bpdHitName');
  if (nameEl) {
    nameEl.innerHTML = `<span style="color:${col}">${hit.name}</span> <span class="type-tag ${curType.type || 'melee'}">${curType.label}</span>${hit.dmg ? ` <span style="font-size:12px;color:var(--gold);font-weight:600">· 伤害 ${hit.dmg}</span>` : ''}`;
  }
  const badgeEl = $id('bpdHitBadge');
  if (badgeEl) {
    badgeEl.innerHTML = hit.badge ? `<span class="${hit.badgeCls}">${hit.badge}</span>` : '';
  }
  const descEl = $id('bpdHitDesc');
  if (descEl) {
    descEl.textContent = hit.desc;
  }
}

const bpDeckTabsEl = $id('bpDeckTabs');
if (bpDeckTabsEl) {
  bpDeckTabsEl.addEventListener('click', e => {
    const b = e.target.closest('button[data-m]');
    if (!b) return;
    bpDeckMove = b.dataset.m;
    const idx = bpHover >= 0 ? bpHover : (bpSel >= 0 ? bpSel : 0);
    updateBPDeck(idx);
    const cv = $id('bpDeckCanvas');
    if (cv && cv._pup && HERO_MOVE_SEQS[CHARS[idx].id] && HERO_MOVE_SEQS[CHARS[idx].id][bpDeckMove]) {
      cv._pup.playSeq(HERO_MOVE_SEQS[CHARS[idx].id][bpDeckMove], null, true);
    }
    SFX.slice();
  });
}
demoLoop($id('bpDeckCanvas'), () => (bpHover >= 0 ? bpHover : (bpSel >= 0 ? bpSel : 0)), () => $id('bp') && $id('bp').classList.contains('on'), () => mySkin(CHARS[(bpHover >= 0 ? bpHover : (bpSel >= 0 ? bpSel : 0))].id), () => bpDeckMove);

const bpDetailEl = $id('bpDetail');
if (bpDetailEl) {
  bpDetailEl.addEventListener('click', e => {
    const b = e.target.closest('.bp-skin-btn');
    if (!b) return;
    const idx = +b.dataset.i;
    const sk = b.dataset.sk || '';
    const ch = CHARS[idx];
    if (!ch) return;
    const has = skinOwned(sk);
    if (!has) {
      SFX.slice();
      toast('尚未解锁该皮肤');
      return;
    }
    PROF.equip = PROF.equip || {};
    PROF.equip[ch.id] = sk;
    try { localStorage.setItem('renying-equip', JSON.stringify(PROF.equip)); } catch (err) {}
    if (window.CloudSave) CloudSave.saveProfile(PROF);
    PORTRAITS.length = 0;
    ensurePortraits();
    applyProfile(PROF);
    buildDetails(true);
    setDetail(idx);
    updateBPDeck(idx);
    renderBP();
    if (M.mode === 'net' || bpMode === 'net') {
      send({ pskin: mySkinMap() });
    }
    const cv = $id('bpDeckCanvas');
    if (cv && cv._pup) {
      cv._pup = new Puppet(idx, sk);
      if (HERO_MOVE_SEQS[ch.id] && HERO_MOVE_SEQS[ch.id][bpDeckMove]) {
        cv._pup.playSeq(HERO_MOVE_SEQS[ch.id][bpDeckMove], null, true);
      }
    }
    SFX.slice();
    toast(sk ? `已装配「${SKINS[sk].name}」` : '已换回原本装束');
  });
}

function setDetail(i) {
  buildDetails();
  for (const el of document.querySelectorAll('#bpDetail .bpd')) el.classList.toggle('show', +el.dataset.i === i);
  updateBPDeck(i);
}

function renderBP() {
  // 2v2 专属天道演武禁选走独立状态与独立渲染
  if (bpMode === 'watch2v2') { if (watch2v2Bp) renderBPWatch2v2(); return; }
  if (!BP) return;
  $id('bpChat').classList.toggle('hidden', bpMode !== 'net');
  const my = bpMySide(), done = BP.step >= bpSteps().length;
  const [side, type] = done ? [-1, ''] : bpSteps()[BP.step];
  const isWatch = bpMode === 'cpuWatch' || (bpCustomOpts && bpCustomOpts.isWatch);
  const myTurn = !done && isMyTurnBP();
  const multiPick = isMultiPickBP();
  const hasBans = bpSteps().some(x => x[1] === 'ban');

  let modePrefix = '';
  if (bpMode === 'net' && NET.isRanked) modePrefix = '排位赛 · ';
  else if (bpMode === 'net' && (netRoomMode === 'pp_cc' || netRoomMode === 'pp_pp')) modePrefix = '联机2v2 · ';
  else if (bpMode === 'cpu' || bpMode === 'cpuWatch') modePrefix = '论剑点将 · ';
  else if (bpMode === 'chaos') modePrefix = '天机乱斗 · ';
  else if (bpMode === 'mayhem') modePrefix = '通天神决 · ';
  else if (bpMode === 'tag3') modePrefix = '3v3车轮 · ';
  else if (bpMode === 'tower') modePrefix = '问剑密卷 · ';
  else if (bpMode === 'stage') modePrefix = '守关挑战 · ';
  else if (bpMode === 'train') modePrefix = '木人试剑 · ';
  else if (bpMode === '2v2') modePrefix = '2v2演武 · ';

  const TAG3_ROLES = ['先锋', '中坚', '大将'];
  const TEAM2_ROLES = ['先锋', '次锋'];

  let stepTitle = '';
  if (done) {
    stepTitle = isWatch ? '点将完成 · 演武即将开战' : '点将完成 · 准备开战';
  } else if (type === 'ban') {
    stepTitle = `${bpSideName(side)}禁用一名侠客`;
  } else if (bpMode === 'tag3') {
    const idxNum = (BP.picks[side] || []).filter(x => x >= 0).length;
    stepTitle = `${bpSideName(side)}钦点【${TAG3_ROLES[idxNum] || '大将'}】出战`;
  } else if (multiPick) {
    const idxNum = (BP.picks[side] || []).filter(x => x >= 0).length;
    stepTitle = `${bpSideName(side)}钦点【${TEAM2_ROLES[idxNum] || '次锋'}】出战`;
  } else if (bpMode === 'tower' || bpMode === 'stage' || bpMode === 'train') {
    stepTitle = '挑选你的本命首发出战侠客（免禁用直选）';
  } else {
    stepTitle = `${bpSideName(side)}选择出战侠客`;
  }

  document.getElementById('bpStep').innerHTML = modePrefix + stepTitle
    + (done ? '' : `<span class="bpcount">第 ${BP.step + 1} / ${bpSteps().length} 步</span>`);
  document.getElementById('bpStep').style.color = myTurn ? '#e9c46a' : 'var(--ink)';
  document.getElementById('bpTime').textContent = done ? '' : `${Math.ceil(BP.t)} 秒`;

  // 左右双方席位槽位渲染
  for (const sd of [0, 1]) {
    const el = document.getElementById('bpS' + sd);
    if (!el) continue;
    const keep = [...el.querySelectorAll('.bubble')];
    const banSlotHtml = hasBans
      ? (() => {
          const bIdx = Array.isArray(BP.bans) ? BP.bans[sd] : -1;
          const bActive = !done && side === sd && type === 'ban';
          return `<div class="slot2 ban${bActive ? ' on' : ''}">${bIdx >= 0 ? `<img src="${PORTRAITS[bIdx] || ''}" alt=""><span class="lab">禁 ${CHARS[bIdx].name}</span>` : '禁用'}</div>`;
        })()
      : '';
    if (bpMode === 'tower' || bpMode === 'stage' || bpMode === 'train') {
      if (sd === 1) {
        // 单人模式右侧显示对位/关卡信息
        let rightInfo = '木人桩试剑';
        if (bpMode === 'tower') rightInfo = '万仞剑阁守关者';
        else if (bpMode === 'stage') rightInfo = (STAGE && STAGE.C ? STAGE.C.name : '守关宗师');
        el.innerHTML = `<div class="who" style="color:var(--p2)">敌阵挑战</div>
          <div class="slots"><div class="slot2">${rightInfo}</div></div>`;
      } else {
        const pIdx = Array.isArray(BP.picks) ? BP.picks[0] : -1;
        const slot = `<div class="slot2 pick${!done ? ' on' : ''}">${pIdx >= 0 ? `<img src="${PORTRAITS[pIdx] || ''}" alt=""><span class="lab">${CHARS[pIdx].name}</span>` : '选择出战'}</div>`;
        el.innerHTML = `<div class="who" style="color:var(--p1)">出战大侠</div>
          <div class="slots">${slot}</div>`;
      }
    } else if (bpMode === 'tag3') {
      const picks = BP.picks[sd] || [-1, -1, -1];
      const slotsHtml = [0, 1, 2].map(slotIdx => {
        const idx = picks[slotIdx];
        const isActive = !done && side === sd && type === 'pick' && (BP.picks[sd].filter(x => x >= 0).length === slotIdx);
        return `<div class="slot2 pick${isActive ? ' on' : ''}">${idx >= 0 ? `<img src="${PORTRAITS[idx] || ''}" alt=""><span class="lab">${TAG3_ROLES[slotIdx]} ${CHARS[idx].name}</span>` : TAG3_ROLES[slotIdx]}</div>`;
      }).join('');
      el.innerHTML = `<div class="who" style="color:${sd === 0 ? 'var(--p1)' : 'var(--p2)'}">${escapeHTML(bpSideName(sd))}阵线</div>
        <div class="slots">${banSlotHtml}${slotsHtml}</div>`;
    } else if (multiPick) {
      const picks = BP.picks[sd] || [-1, -1];
      const slotsHtml = [0, 1].map(slotIdx => {
        const idx = picks[slotIdx];
        const isActive = !done && side === sd && type === 'pick' && (BP.picks[sd].filter(x => x >= 0).length === slotIdx);
        return `<div class="slot2 pick${isActive ? ' on' : ''}">${idx >= 0 ? `<img src="${PORTRAITS[idx] || ''}" alt=""><span class="lab">${TEAM2_ROLES[slotIdx]} ${CHARS[idx].name}</span>` : TEAM2_ROLES[slotIdx]}</div>`;
      }).join('');
      el.innerHTML = `<div class="who" style="color:${sd === 0 ? 'var(--p1)' : 'var(--p2)'}">${escapeHTML(bpSideName(sd))}</div>
        <div class="slots">${banSlotHtml}${slotsHtml}</div>`;
    } else {
      const slot = (idx, kind, active) => `<div class="slot2 ${kind}${active ? ' on' : ''}">${idx >= 0 ? `<img src="${PORTRAITS[idx] || ''}" alt=""><span class="lab">${kind === 'ban' ? '禁 ' : ''}${CHARS[idx].name}</span>` : (kind === 'ban' ? '禁用' : '选择')}</div>`;
      el.innerHTML = `<div class="who" style="color:${sd === 0 ? 'var(--p1)' : 'var(--p2)'}">${escapeHTML(bpSideName(sd))}</div>
        <div class="slots">${banSlotHtml}${slot(BP.picks[sd], 'pick', !done && side === sd && type === 'pick')}</div>`;
    }
    for (const b of keep) el.appendChild(b);
  }

  document.getElementById('bpGrid').innerHTML = CHARS.map((c, i) => {
    let banned = false, pickedBy = -1;
    if (Array.isArray(BP.bans)) banned = BP.bans.includes(i);
    if (multiPick) {
      if (BP.picks[0] && BP.picks[0].includes(i)) pickedBy = 0;
      else if (BP.picks[1] && BP.picks[1].includes(i)) pickedBy = 1;
    } else if (Array.isArray(BP.picks)) {
      pickedBy = BP.picks.indexOf(i);
    }
    const can = myTurn && bpValid(i);
    const myAv = BP.avail && BP.avail[my];
    const lock = !OFFLINE_BUILD && !DEV_SESSION_UNLOCKED && myAv && !myAv.includes(i);
    const free = !OFFLINE_BUILD && !DEV_SESSION_UNLOCKED && !heroesFree() && !ownsHero(c.id) && (PROF.rotation || []).includes(c.id);
    const tag = banned ? '<span class="tag">禁</span>' : pickedBy >= 0 ? `<span class="tag p">${escapeHTML(bpSideName(pickedBy))}</span>` : lock ? '<span class="tag lk">未拥有</span>' : free ? '<span class="tag free">限免</span>' : '';
    const state = banned ? '，已禁用' : pickedBy >= 0 ? '，已被选择' : lock ? '，未拥有' : free ? '，本周限免' : '';
    const aria = `${c.name}，${c.role}${state}${bpSel === i ? '，已选中' : ''}${can ? '' : '，当前不可选'}`;
    return `<button class="bpcard${lock ? ' lock' : ''}${banned ? ' banned' : ''}${pickedBy >= 0 ? ' picked' : ''}${bpSel === i ? ' sel' : ''}" data-i="${i}" aria-label="${aria}" ${can ? '' : 'aria-disabled="true"'}>
      <span class="bp-shortcut">${i + 1}</span>${tag}<img src="${PORTRAITS[i] || ''}" alt=""><div class="nm" style="color:rgb(${c.look.slash})">${c.name}</div><div class="rl">${c.role}</div></button>`;
  }).join('');
  const show = bpHover >= 0 ? bpHover : (bpSel >= 0 ? bpSel : 0);
  setDetail(show);
  const goB = document.getElementById('bpGo');
  if (isWatch) {
    goB.disabled = true;
    goB.textContent = done ? '即将开战 · 演武观战' : 'AI 演武禁选中…';
  } else {
    goB.disabled = !(myTurn && bpValid(bpSel));
    goB.textContent = myTurn ? (bpSel >= 0 ? `${type === 'ban' ? '禁用' : '选择'} ${CHARS[bpSel].name}` : (type === 'ban' ? '选一个禁用' : '选一个角色')) : (done ? '开战在即' : '等待对方');
  }
}
document.getElementById('bpGrid').addEventListener('click', e => {
  const b = e.target.closest('.bpcard'); if (!b || !BP || BP.step >= bpSteps().length) return;
  const i = +b.dataset.i;
  if (!isMyTurnBP() || !bpValid(i)) return;
  bpSel = i; SFX.slice(); renderBP();
});
let lastCardClick = { i: -1, t: 0 };
document.getElementById('bpGrid').addEventListener('click', e => {
  const b = e.target.closest('.bpcard'); if (!b) return;
  const i = +b.dataset.i, now = performance.now();
  if (lastCardClick.i === i && now - lastCardClick.t < 400) {
    lastCardClick.i = -1;
    if (BP && BP.step < bpSteps().length && isMyTurnBP() && bpValid(i)) { bpSel = i; bpConfirm(); }
    return;
  }
  lastCardClick = { i, t: now };
});
document.getElementById('bpGrid').addEventListener('dblclick', e => {
  const b = e.target.closest('.bpcard'); if (!b || !BP || BP.step >= bpSteps().length) return;
  const i = +b.dataset.i;
  if (!isMyTurnBP() || !bpValid(i)) return;
  bpSel = i; bpConfirm();
});
// 方向键在角色卡之间移动焦点（Enter 触发 click：第一次选中，400 毫秒内再按一次即确认），
// 按实际行分组，窄屏换成多行时上下键依然正确
document.getElementById('bpGrid').addEventListener('keydown', e => {
  if (!BP) return;   // 2v2 观战禁选没有玩家操作，按键不参与
  const k = e.key;
  const cards = [...document.querySelectorAll('#bpGrid .bpcard')];
  if (k >= '1' && k <= '9') {
    const pickNum = parseInt(k, 10) - 1;
    if (pickNum >= 0 && pickNum < CHARS.length && cards[pickNum]) {
      e.preventDefault();
      cards[pickNum].focus();
      if (isMyTurnBP() && bpValid(pickNum)) {
        bpSel = pickNum;
        SFX.slice();
        renderBP();
      }
      return;
    }
  }
  if (k !== 'ArrowLeft' && k !== 'ArrowRight' && k !== 'ArrowUp' && k !== 'ArrowDown') return;
  if (!BP || BP.step >= bpSteps().length) return;
  if (!cards.length) return;
  const rows = new Map();
  cards.forEach((c, i) => { const t = Math.round(c.getBoundingClientRect().top); if (!rows.has(t)) rows.set(t, []); rows.get(t).push(i); });
  const rowList = [...rows.values()];
  const cur = cards.indexOf(document.activeElement);
  let idx = cur < 0 ? 0 : cur;
  const r = Math.max(0, rowList.findIndex(list => list.includes(idx)));
  const row = rowList[r], pos = row.indexOf(idx);
  if (k === 'ArrowLeft') idx = row[Math.max(0, pos - 1)];
  else if (k === 'ArrowRight') idx = row[Math.min(row.length - 1, pos + 1)];
  else if (k === 'ArrowUp' && r > 0) idx = rowList[r - 1][Math.min(pos, rowList[r - 1].length - 1)];
  else if (k === 'ArrowDown' && r < rowList.length - 1) idx = rowList[r + 1][Math.min(pos, rowList[r + 1].length - 1)];
  if (idx !== cur) { e.preventDefault(); cards[idx].focus(); }
});
// 悬停：更新下部检视视窗
let popIdx = -1;
function showPop(card) {
  const pop = $id('bpPop');
  if (!card) { if (pop) pop.classList.remove('on'); popIdx = -1; return; }
  const i = +card.dataset.i;
  popIdx = i;
  updateBPDeck(i);
  if (pop) pop.classList.remove('on');
}
demoLoop($id('bpPopCv'), () => popIdx, () => false);
document.getElementById('bpGrid').addEventListener('pointerover', e => {
  const b = e.target.closest('.bpcard'); const i = b ? +b.dataset.i : -1;
  if (i !== bpHover) { bpHover = i; setDetail(i >= 0 ? i : bpSel); showPop(b); }
});
document.getElementById('bpGrid').addEventListener('pointerleave', () => { bpHover = -1; setDetail(bpSel); showPop(null); });
function bpConfirm() {
  if (!BP || BP.step >= bpSteps().length || !isMyTurnBP() || !bpValid(bpSel)) return;
  if (bpAuth()) bpApply(bpSel); else { send({ bp: bpSel }); document.getElementById('bpGo').disabled = true; }
}
document.getElementById('bpGo').addEventListener('click', bpConfirm);
document.getElementById('bpQuit').addEventListener('click', () => toMenu());

