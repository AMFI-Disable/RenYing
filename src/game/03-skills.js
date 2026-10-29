// ======================= 技能（Q） =======================
// 每个技能：cd 冷却，start 开始时，update 每一帧，pose 用哪个姿势，ai 电脑什么时候用
// 凌雀「移形换影」的追踪：大幅提升飞行速度、漂移回拉最大距离与转向灵敏度
const SD_SPD = 2350, SD_TURN = 20, SD_DRIFT_MAX = 360, SD_DRIFT_SPD = 1900;
function sdTarget(f, foe) {   // 2v2 追最近的那个还站着的对手
  if (typeof is2v2 === 'function' && is2v2()) {
    let best = null, bd = Infinity;
    for (const o of foesOf(f)) { if (o.hp <= 0) continue; const d = Math.hypot(o.x - f.x, o.y - f.y); if (d < bd) { bd = d; best = o; } }
    if (best) return best;
  }
  return foe || (typeof foeOf === 'function' ? foeOf(f) : null);
}
const sdAim = (f, t) => Math.atan2(t.y - f.y, t.x - f.x);   // 两人都按身体中间（脚下往上 50）算，高度差就是 y 差
// 磁仙的磁极（极性 f.pol：1 正极 ⊕，-1 负极 ⊖；每回合开局由 magRoll 用对局随机数抽）
// 吸和弹都按真磁铁来：离得越近力越大（力 ∝ 1 / 距离²，再夹在上下限之间）。
//   普攻   正极：伤害 ×plusDmg，地上轻攻击每下都击飞；负极：伤害 ×minusDmg，每下把对手往身边吸一下
//          负极四段循环能一直连，但负极普攻连中 chainCap 下就「消磁」：之后的负极普攻不再吸、硬直只剩 capStun 倍，还把人推开，连段就断了。
//          消磁只管负极普攻（不是角色状态，Q、R、大招不受影响）；停手 demagRest 秒没再用负极普攻打中人，或者按 Q 换极性，就恢复
//   R      正极：身边一圈磁石炸开，把半径 rPlusR 里的敌人用力弹走，离得越近弹得越远；rPlusDir = 1 弹开、-1 改成吸到身边（只改这一个数）
//          负极：把 rMinusRange 以内的对手吸过来，越近吸得越快，到身前定住 rMinusStun 秒（不倒地）
const MAG = { plusDmg: 1.35, plusKb: [300, -620], minusDmg: 0.55, pullK: 2.6e6, pullMax: 320, chainCap: 15, capStun: 0.3, demagRest: 1.0,
  rPlusDir: 1, rPlusR: 175, rPlusDmg: 48, rPlusKb: [360, 900], rMinusRange: 560, rMinusDmg: 16, rMinusStun: 0.5, rMinusK: 6.4e7, rMinusV: [1100, 2600], rMinusTime: 0.4 };
const magRGB = pol => pol > 0 ? '255,96,84' : '96,156,255';
const magName = pol => pol > 0 ? '⊕ 正极' : '⊖ 负极';
const magForce = (k, d, lo, hi) => clamp(k / Math.max(40, d) ** 2, lo, hi);   // 磁力：离得越近越大
// 普攻打中时按极性改这一下（applyHit 一开头调用；只管普攻，技能、大招、飞行道具不走这里）
function magHit(att, def, m) {
  if (att.pol > 0) {
    const light = /^l\d/.test(m.name || '');
    return light ? { ...m, dmg: m.dmg * MAG.plusDmg, launch: true, kb: MAG.plusKb, big: true } : { ...m, dmg: m.dmg * MAG.plusDmg };
  }
  if (m.launch || m.spike || m.knock) return { ...m, dmg: m.dmg * MAG.minusDmg };
  att.mT = 0;
  if (att.mChain >= MAG.chainCap) return { ...m, dmg: m.dmg * MAG.minusDmg, kb: [220, 0], stun: m.stun * MAG.capStun };   // 消磁了：不吸，推开
  att.mChain = (att.mChain || 0) + 1;
  if (att.mChain === MAG.chainCap) {
    addP({ type: 'text', text: '消磁', x: att.x, y: att.y - 125, life: 0.8, max: 0.8, rgb: '200,210,230' });
    ring(att.x, att.y - 60, 70, '200,210,230', 0.3);
    return { ...m, dmg: m.dmg * MAG.minusDmg, kb: [220, 0], stun: m.stun * MAG.capStun };
  }
  const dist = Math.abs(att.x - def.x);
  for (let k = 0; k < 3; k++) addP({ type: 'spark', x: def.x, y: def.y - 60 + rand(-25, 25), vx: Math.sign(att.x - def.x) * rand(160, 320), vy: rand(-30, 30), rgb: magRGB(-1), life: 0.22, max: 0.22, w: 1.6 });
  return { ...m, dmg: m.dmg * MAG.minusDmg, kb: [dist > 58 ? -magForce(MAG.pullK, dist, 60, MAG.pullMax) : 0, 0] };
}
// 磁力直接把人挪到 x（负极 R、大招）：断崖台上走 mapEdge，吸不穿崖边；别的场地夹在两边墙里。普攻和正极 R 是给速度，物理那边已经按 mapGrip / mapEdge 算
function magMove(tg, x) {
  const cl = (mapNow() || {}).cliff;
  tg.x = x;
  if (cl) mapEdge(tg, cl); else tg.x = clamp(tg.x, WALL, STAGE_W - WALL);
}
// 大招收尾：磁石收掉，还被吸着的人放开
function magRelease(f) {
  const S = f.sw; f.sw = null;
  if (S && S.hit) { const v = fighterByIdx(S.v); if (v.state === 'held') toNeutral(v); }
}
// 每帧：消磁计时、Q 圆圈的计时
function magTick(f) {
  if (f.magTg >= 0 && !(f.state === 'skill' && f.skill === 'magfield')) {   // 吸人吸到一半被打断：把人放开
    const tg = fighterByIdx(f.magTg); f.magTg = -1;
    if (tg.state === 'held') toNeutral(tg);
  }
  if (f.sw && f.state !== 'special') magRelease(f);   // 大招被打断（回合结束之类）：磁石收掉，夹住的人放开
  if (f.polT > 0) f.polT = Math.max(0, f.polT - STEP);
  if (f.mChain > 0) { f.mT = (f.mT || 0) + STEP; if (f.mT >= MAG.demagRest) { f.mChain = 0; f.mT = 0; } }
}
const SKILLS = {
  gale: { name: '疾风斩', cd: 6, pass: true, nofric: true, desc: '一步居合，身随刀走，直穿敌身；锋刃掠过处施加【居合斩穴】强定身（0.65 秒），并立即重置瞬步冲刺冷却。途中若遇墨阵，一刀两断。',
    start(f) { f.vx = 0; },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.08) { f.skPh = 1; f.t = 0; f.vx = 1500 * f.face; f.invul = 0.12; f.hitDone = false; SFX.dash(); }
      if (f.skPh === 1) {
        // 破墨阵克制逻辑：穿过墨阵直接净化
        for (const p of projs) {
          if (p.kind === 'trap' && p.owner === foe.idx && Math.abs(p.x - f.x) < 80) {
            p.dead = true; smoke(p.x, -10, 8); SFX.slice();
            addP({ type: 'text', text: '破阵', x: p.x, y: -45, life: 0.6, max: 0.6, rgb: '120,230,255' });
          }
        }
        if (strike(f, foe, { box: [-10, -112, 92, 0], dmg: 55, kb: [180, 0], stun: 0.65, hs: 0.12 })) {
          f.dashCD = 0;
          f.skill2CD = 0;
          addP({ type: 'text', text: '居合斩穴 · 剑气重置', x: f.x, y: f.y - 110, life: 0.8, max: 0.8, rgb: '120,230,255' });
        }
        if (f.t >= 0.18) { f.skPh = 2; f.t = 0; f.vx *= 0.2; }
      }
      if (f.skPh === 2 && f.t >= 0.22) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['qf_charge', 26] : f.skPh === 1 ? ['qf_thrust', 60] : ['idle', 14],
    ai: (me, foe, d) => d > 140 && d < 330 },
  blink: { name: '影遁', cd: 11, pass: true, desc: '结印 0.3 秒后入影（结印时站着不动），影子 0.15 秒掠到对手背后施展十字绞杀（只伤血，不让对手僵直）。此后 1.5 秒内，下一击威力暴涨 50%。',
    start() {},
    update(f, foe) {
      const behind = () => { let nx = foe.x - foe.face * 70; if (nx < WALL || nx > STAGE_W - WALL) nx = foe.x + foe.face * 70; return clamp(nx, WALL, STAGE_W - WALL); };
      if (f.skPh === 0 && f.t >= 0.3) {   // 结印 0.3 秒，入影
        smoke(f.x, f.y - 50, 12);
        f.bbX = f.x; f.bbT = 1.5; f.blinkX0 = f.x; f.vx = 0; f.vy = 0;
        f.skPh = 2; f.t = 0;
      }
      if (f.skPh === 2) {   // 影子贴地飞过去，0.15 秒才到对手背后（对手这时还能走开）
        const k = Math.min(1, f.t / 0.15);
        f.x = f.blinkX0 + (behind() - f.blinkX0) * k; f.vx = 0; f.vy = 0;
        if (Math.random() < 0.7) smoke(f.x, f.y - 40, 2);
      }
      if (f.skPh === 2 && f.t >= 0.15) {
        f.x = behind(); f.y = Math.min(0, foe.y); f.vy = 0; f.vx = 0;
        f.face = foe.x >= f.x ? 1 : -1; f.buffT = 1.5;
        f.skPh = 1; f.t = 0; f.snap = true; f.trail.length = 0; f.scarf = [];
        smoke(f.x, f.y - 50, 10); SFX.poof();
        slashLine(foe.x, foe.y - 60, 0.5, '255,95,115'); slashLine(foe.x, foe.y - 60, -0.5, '255,95,115'); SFX.slice();
        if (foe.invul <= 0 && foe.hp > 0) {
          applyHit(f, foe, { dmg: 45, kb: [0, 0], stun: 0, hs: 0.06, noScale: true, noStun: true, dir: foe.x >= f.x ? 1 : -1 }, [foe.x, foe.y - 60]);   // 只掉血，不让对手僵直
        }
      }
      if (f.skPh === 1 && f.t >= 0.12) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['fy_seal', 36] : f.skPh === 2 ? ['dash', 60] : ['fy_xslash', 40],
    ai: (me, foe, d) => d > 120 },
  quake: { name: '震地', cd: 8, breakout: true, desc: '双手擎刀，怒砸大地，地裂冲击波范围大增（扩大35%）。起手带霸体（抵挡1次攻击），砸地直击施加【撼地重震】（0.45 秒脑震荡），把人掀上云霄。唯腾空者不受地裂所侵。',
    start(f) { f.armorT = 0.28; f.armorHits = 1; f.vx = 0; if (f.y < 0) f.vy = Math.min(f.vy, 0); },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.24) {
        f.skPh = 1; f.t = 0; f.hitDone = false;
        shake = Math.max(shake, 14); dust(f.x, 0, 24); ring(f.x, 0, 140, '255,200,120', 0.35); SFX.thud(); SFX.heavy();
        for (const sd of [-1, 1]) spawnProj(f, { kind: 'quake', x: f.x + sd * 30, y: -22, vx: sd * 680, w: 84, h: 48, life: 0.8, dmg: 40, kb: [200, -740], stun: 0.40, hs: 0.08, launch: true, groundOnly: true, unbreakable: true });
        if (strike(f, foe, { box: [-40, -80, 100, 4], dmg: 45, kb: [220, -800], stun: 0.45, hs: 0.12, launch: true })) {
          f.guard = Math.min(f.maxGuard, (f.guard || f.maxGuard) + 30);
          f.skill2CD = Math.max(0, f.skill2CD - 2.5);
          addP({ type: 'text', text: '💥 撼地重震 · 固若金汤', x: f.x, y: f.y - 120, life: 0.9, max: 0.9, rgb: '255,200,120' });
        }
      }
      if (f.skPh === 1 && f.t >= 0.40) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['ts_lift', 20] : ['ts_slam', 60],
    ai: (me, foe, d) => d < 420 && foe.onGround() },
  backthrust: { name: '回马枪', cd: 6, desc: '先退一步让开身位，再回身一枪极远距离直取咽喉（判定延伸至 235 像素）。枪尖极远端挑中触发【枪尖穿心】（同一目标最多连挑 3 次，第 4 记强力震飞脱离）；枪旋余劲立时回转。',
    start(f) { f.vx = -f.face * 540; f.vy = -420; f.y = Math.min(f.y, -1); },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.24) { f.skPh = 1; f.t = 0; f.vx = f.face * 180; f.hitDone = false; SFX.heavy(); }
      if (f.skPh === 1) {
        if (f.t < 0.12) {
          const curHits = foe.huiMaHits || 0;
          if (curHits >= 3) {
            if (strike(f, foe, { box: [20, -104, 235, -44], dmg: 45, kb: [680, -320], stun: 0.4, hs: 0.16, launch: true, big: true })) {
              foe.huiMaHits = 0;
              foe.invul = 0.65;
              foe.airRecover = true;
              f.skill2CD *= 0.5;
              shake = Math.max(shake, 14);
              ring(foe.x, foe.y - 60, 160, '170,220,255', 0.45);
              addP({ type: 'text', text: '💨 枪劲震退 · 浮空脱离', x: foe.x, y: foe.y - 110, life: 1.0, max: 1.0, rgb: '170,220,255' });
              SFX.heavy();
            }
          } else {
            if (strike(f, foe, { box: [20, -104, 235, -44], dmg: 60, kb: [340, -800], stun: 0.48, hs: 0.12, launch: true })) {
              foe.huiMaHits = curHits + 1;
              f.skill2CD *= 0.5;
              addP({ type: 'text', text: '枪尖穿心 (' + foe.huiMaHits + '/3)', x: foe.x, y: foe.y - 100, life: 0.8, max: 0.8, rgb: '170,220,255' });
            }
          }
        }
        if (f.t >= 0.34) toNeutral(f);
      }
    },
    pose: f => f.skPh === 0 ? ['ls_stance', 24] : ['ls_thrust', 60],
    ai: (me, foe, d) => d < 120 },
  windblade: { name: '风刃', cd: 4.0, air: true, desc: '挥扇生风，一次扇出上下两道风刃（每道 28 伤害）。此招【无长硬直】，附带风暴推力（360 像素击退）；连飞羽轻镖也一并吹散。',
    start() {},
    update(f) {
      if (f.skPh === 0 && f.t >= 0.04) {
        f.skPh = 1; SFX.swing();
        for (const vy of [-110, 110]) spawnProj(f, { kind: 'wind', x: f.x + f.face * 40, y: f.y - 62, vx: f.face * 1100, vy, w: 70, h: 58, life: 1.1, dmg: 28, kb: [360, -80], stun: 0.18, hs: 0.03 });
      }
      if (f.skPh === 1 && f.t >= 0.11) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['ly_fanswipe', 32] : ['idle', 20],
    ai: () => true },
  thunderfist: { name: '雷闪', cd: 5, nofric: true, pass: true, desc: '身化雷光贴地疾冲。一拳贯穿附带【触电麻痹】（0.38 秒电击瘫痪硬直），起手片刻后化为雷光霸体。',
    start(f) { f.armorT = 0; f.armorHits = 0; f.vx = 0; },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.12) { f.skPh = 1; f.t = 0; f.vx = f.face * 1350; f.armorT = 0.28; f.armorHits = 1; f.hitDone = false; SFX.dash(); SFX.thunder(); }
      if (f.skPh === 1) {
        if (strike(f, foe, { box: [-20, -110, 75, -10], dmg: 40, kb: [80, 0], stun: 0.38, hs: 0.08 })) {
          f.skill2CD = 0;
          addP({ type: 'text', text: '⚡ 触电麻痹 · 雷铠重置', x: foe.x, y: foe.y - 100, life: 1.0, max: 1.0, rgb: '255,240,120' });
        }
        if (Math.random() < 0.6) addP({ type: 'spark', x: f.x - f.face * 10, y: f.y - rand(20, 110), vx: -f.face * rand(100, 300), vy: rand(-100, 100), life: 0.2, max: 0.2, rgb: '255,240,150', w: 2 });
        const through = f.hitDone && foe && (f.x - foe.x) * f.face > 45;   // 一拳贯穿、穿过对手身后就收住，不再继续往前冲
        if (f.t >= 0.26 || through) { f.skPh = 2; f.t = 0; f.vx *= 0.15; f.armorT = 0; }
      }
      if (f.skPh === 2 && f.t >= 0.25) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['lm_boxer', 28] : f.skPh === 1 ? ['lm_jab', 60] : ['idle', 14],
    ai: (me, foe, d) => d > 110 && d < 360 },
  inktrap: { name: '墨阵', cd: 5.2, desc: '提笔画出一池宽 115 像素的墨阵。踏入者陷入【深墨禁锢】（0.48 秒定身 + 2.8 秒迟缓）；再按 Q 可随时引爆。',
    start(f) { f.vx = 0; },
    update(f) {
      if (f.skPh === 0 && f.t >= 0.16) {
        f.skPh = 1; SFX.poof();
        for (const p of projs) if (p.kind === 'trap' && p.owner === f.idx) p.dead = true;
        spawnProj(f, { kind: 'trap', x: clamp(f.x + f.face * clamp(Math.abs(foeOf(f).x - f.x), 80, 260), WALL, STAGE_W - WALL), y: -6, vx: 0, w: 115, h: 28, life: 5.0, delay: 0.22, dmg: 35, kb: [0, 0], stun: 0.48, hs: 0.07, root: true, groundOnly: true });
      }
      if (f.skPh === 1 && f.t >= 0.22) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['my_stroke', 24] : ['my_paint', 40],
    ai: (me, foe, d) => d > 80 && d < 340 && !projs.some(p => p.kind === 'trap' && p.owner === me.idx) },
  dive: { name: '俯冲', cd: 4.5, air: true, desc: '猎鹰收翼斜下俯冲。命中施加【鹰击钉地】（0.40 秒压制硬直）；自空中出手可借力回升并刷新技能。',
    start(f) { f.diveAir = !f.onGround(); if (f.onGround()) { f.vy = -700; f.vx = f.face * 200; f.y = -1; } else f.skPh = 1; },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.2) { f.skPh = 1; f.t = 0; }
      if (f.skPh === 1) {
        if (f.t < 0.02) { f.hitDone = false; SFX.dash(); }
        f.vx = f.face * 840; f.vy = 780;
        if (strike(f, foe, { box: [-16, -90, 88, 20], dmg: 46, kb: [220, 0], stun: 0.40, hs: 0.09 })) {
          addP({ type: 'text', text: '鹰击钉地', x: foe.x, y: foe.y - 80, life: 0.8, max: 0.8, rgb: '140,200,255' });
          f.vx *= 0.2; f.vy = -380;
          if (f.diveAir && !f.diveChained) { f.skillCD = 0; f.diveChained = true; }
        }
        if ((f.onGround() && f.t > 0.04) || f.t > 0.4) { f.skPh = 2; f.t = 0; f.vx *= 0.2; dust(f.x, 0, 10); }
      }
      if (f.skPh === 2 && f.t >= 0.22) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['jump', 20] : f.skPh === 1 ? ['yl_dive', 50] : ['getup', 16],
    ai: (me, foe, d) => d > 110 && d < 360 },
  // ---------- 右键招式 ----------
  swordqi: { name: '剑气', cd: 5, desc: '沉步拔刀，横扫出一道宏大弧月剑气。中距离直接【掀天挑空】（无地面硬直，直接送上半空），暗器更不在话下。',
    start(f) { f.vx = 0; },
    update(f) {
      if (f.skPh === 0 && f.t >= 0.1) { f.skPh = 1; SFX.swing(); spawnProj(f, { kind: 'qi', x: f.x + f.face * 40, y: f.y - 65, vx: f.face * 880, w: 92, h: 96, life: 0.46, dmg: 52, kb: [180, -700], stun: 0.3, hs: 0.08, launch: true }); }
      if (f.skPh === 1 && f.t >= 0.32) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['qf_charge', 30] : ['qf_thrust', 60], ai: (m, o, d) => d > 120 && d < 380 },
  kunai: { name: '飞镖', cd: 5, air: true, desc: '侧身一甩，四枚黑铁手里剑呈扇形激射。【无硬直击飞】，纯粹以极速密雨截断对手起手，穿透轻型投掷物。',
    start() {},
    update(f) {
      if (f.skPh === 0 && f.t >= 0.08) {
        f.skPh = 1; SFX.slice();
        for (const a of [-0.18, -0.06, 0.06, 0.18]) spawnProj(f, { kind: 'kunai', x: f.x + f.face * 30, y: f.y - 70, vx: f.face * 1250 * Math.cos(a), vy: 1250 * Math.sin(a), w: 26, h: 14, life: 0.55, dmg: 25, kb: [80, 0], stun: 0.18, hs: 0.03, launch: false });
      }
      if (f.skPh === 1 && f.t >= 0.25) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['fy_seal', 28] : ['fy_crouch', 50], ai: (m, o, d) => d > 140 },
  ironwall: { name: '铁壁冲', cd: 6, nofric: true, desc: '狂暴冲锋掀起通天巨浪（通天判定，彻底封锁空中跳跃与腾空位移）。携千钧重势巨浪拍岸，对空中敌人强行下砸截落，双倍瓦解一切格挡！',
    start(f) { f.armorT = 0.38; f.armorHits = 1; f.vx = 0; },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.16) {
        f.skPh = 1; f.t = 0; f.vx = f.face * 720; f.hitDone = false; SFX.dash(); SFX.thud();
        shake = Math.max(shake, 12);
      }
      if (f.skPh === 1) {
        const attWeight = (f.ch.stat && f.ch.stat.weight) || 1.50;
        const defWeight = (foe.ch.stat && foe.ch.stat.weight) || 1.0;
        const wRatio = attWeight / defWeight;
        const foeInAir = !foe.onGround() || airH(foe) > 2;
        const isCrimson = f.skinKey === 'ts_crimson';
        const waveRGB = isCrimson ? '255,60,70' : '255,200,100';

        // 巨浪推进视觉：多层直插云霄的狂涛气浪粒子
        if (!RESIM) {
          const wx = f.x + f.face * 55;
          for (let h = 0; h < 6; h++) {
            const wy = -h * 170 - rand(10, 60);
            ring(wx + rand(-20, 20), wy, 60 + h * 16, waveRGB, 0.25);
            if (Math.random() < 0.5) {
              addP({ type: 'spark', x: wx, y: wy, vx: f.face * rand(140, 360), vy: rand(-180, 180), rgb: waveRGB, w: 3, life: 0.2, max: 0.2 });
            }
          }
          dust(f.x + f.face * 35, 0, 4);
        }

        // 通天巨浪判定：高度直贯云霄（-2200px），封杀一切空中与腾空位移
        if (strike(f, foe, {
          box: [-10, -2200, 135, 0],
          dmg: 56,
          kb: foeInAir ? [Math.round(260 * wRatio), Math.round(520 * wRatio)] : [Math.round(420 * wRatio), -180],
          stun: 0.45,
          hs: 0.12,
          spike: foeInAir,
          launch: true,
          big: true,
          guardBreakMul: 1.5
        })) {
          shake = Math.max(shake, 18);
          SFX.heavy(); SFX.thud();
          for (let h = 0; h < 7; h++) {
            ring(f.x + f.face * 65, -h * 180 - 40, 90 + h * 18, waveRGB, 0.4);
          }
          const waveTxt = foeInAir ? '🌊 巨浪翻江 · 撼坠' : '🌊 巨浪裂空 · 崩山';
          addP({ type: 'text', text: waveTxt, x: f.x + f.face * 60, y: f.y - 140, life: 1.0, max: 1.0, rgb: waveRGB });
          f.vx *= 0.2;
        }
        if (f.t >= 0.25) { f.skPh = 2; f.t = 0; f.vx *= 0.2; f.armorT = 0; }
      }
      if (f.skPh === 2 && f.t >= 0.28) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['ts_shoulder', 26] : ['ts_shoulder', 40], ai: (m, o, d) => d < 260 },
  spin: { name: '枪旋', cd: 6, nofric: true, desc: '长枪急旋如风车，弹开半径扩大至 125 像素。旋转前段【无强控硬直】，末了第 8 记以乾坤大横扫（48 伤害）扫飞贴身之敌（对地面敌人仅平推硬直，仅浮空敌人会被击落地面）！',
    start(f) { f.vx = 0; f.spinN = 0; },
    update(f, foe) {
      const c = f.ctrl, dir = (c.held.right ? 1 : 0) - (c.held.left ? 1 : 0);
      f.vx = damp(f.vx, dir * wk(f) * 0.6, 10, STEP);
      if (dir !== 0) f.face = dir;
      // 弹开前方常规飞行道具
      for (const p of projs) {
        if (p.owner === foe.idx && !p.dead && !p.unbreakable) {
          if (Math.abs(p.x - f.x) < 125 && Math.abs(p.y - (f.y - 65)) < 85) {
            p.dead = true; blockFX(p.x, p.y, f.face); SFX.block();
            addP({ type: 'text', text: '破', x: p.x, y: p.y - 25, life: 0.45, max: 0.45, rgb: '170,220,255' });
          }
        }
      }
      const n = Math.floor(f.t / 0.25);
      if (n >= f.spinN && f.spinN < 8) {
        f.spinN++; f.hitDone = false; SFX.swing();
        const last = f.spinN === 8;
        const foeInAir = !foe.onGround() || airH(foe) > 2;
        strike(f, foe, last ? { box: [10, -135, 175, -10], dmg: 48, kb: foeInAir ? [420, -640] : [440, 0], stun: 0.50, hs: 0.12, launch: foeInAir, big: true }
                            : { box: [20, -126, 142, -14], dmg: 15, kb: [40, 0], stun: 0.18, hs: 0.03, launch: false, noScale: true });
      }
      if (f.t >= 2) toNeutral(f);
    },
    pose: () => ['ls_stance', 20], ai: (m, o, d) => d < 150 },
  windstep: { name: '开扇', cd: 4, air: true, nofric: true, desc: '唰地张开折扇，朝面前方向疾冲过去，一路撒下 5 颗爆米花。爆米花落下半秒后噼啪炸开（每颗 8 伤害，轻微击退）。在空中开扇会斜着俯冲下去，落地炸开一圈风爆（24 伤害，挑起），再崩出 5 颗爆米花。',
    start(f) { f.vx = 0; f.invul = Math.max(f.invul, 0.1); SFX.dash(); if (airH(f) > 40) { f.skPh = 10; f.vy = Math.max(f.vy, 600); } },
    update(f, foe) {
      if (f.skPh >= 10) { windDive(f, foe); return; }
      if (f.skPh < 5 && f.t >= f.skPh * 0.07) {   // 冲的路上每隔一小段撒一颗
        f.skPh++;
        spawnProj(f, { kind: 'popcorn', x: f.x, y: -12, vx: 0, delay: 0.5, life: 0.62, w: 84, h: 76, dmg: 8, kb: [70, -140], stun: 0.22, hs: 0.03, unbreakable: true, noScale: true, seed: (clock * 7.3 + f.x * 0.013) % 6 });   // 只管画面的花样，但存进回滚存档里，两边要一样
      }
      f.vx = f.face * 1450 * Math.max(0, 1 - f.t / 0.38);
      if (Math.random() < 0.7) addP({ type: 'spark', x: f.x - f.face * 20, y: f.y - rand(20, 100), vx: -f.face * 200, vy: rand(-40, 40), life: 0.25, max: 0.25, rgb: f.look.slash, w: 1.4 });
      if (f.t >= 0.4) toNeutral(f);
    },
    pose: f => f.skPh === 10 ? ['a2', 50] : ['ly_fanswipe', 40], ai: (m, o, d) => d > 90 && d < 420 && Math.sign(o.x - m.x) === m.face },
  stomp: { name: '金刚雷铠', cd: 5.5, breakout: true, desc: '运转金刚雷体，架起防守雷铠（持续 0.55 秒，受创大减75%并霸体）。期间若遭近战肉搏或暗器飞投，立刻消解攻击并引动九天玄雷直击敌首（50 伤害，高空挑飞），转守为攻。',
    start(f) {
      f.vx = 0; if (f.y < 0) f.vy = Math.min(f.vy, 0);
      f.thunderGuardT = 0.55; f.skPh = 0; f.armorT = 0.55; f.armorHits = 99;
      dust(f.x, 0, 10); SFX.block();
      ring(f.x, f.y - 60, 75, '255,230,120', 0.35);
    },
    update(f, foe) {
      if (f.skPh === 0) {
        f.vx = 0;
        if (Math.random() < 0.4) addP({ type: 'spark', x: f.x + rand(-25, 25), y: f.y - rand(20, 90), vx: rand(-40, 40), vy: rand(-50, 20), life: 0.22, max: 0.22, rgb: '255,230,120', w: 1.6 });
        if (f.t >= 0.55) {
          f.thunderGuardT = 0; f.armorT = 0; f.skPh = 2; f.t = 0;
        }
      } else if (f.skPh === 1) {
        if (f.t >= 0.24) toNeutral(f);
      } else if (f.skPh === 2) {
        if (f.t >= 0.20) toNeutral(f);
      }
    },
    pose: f => f.skPh === 0 ? ['lm_boxer', 26] : f.skPh === 1 ? ['ts_slam', 48] : ['idle', 18],
    ai: (m, o, d) => projs.some(p => p.owner !== m.idx && p.dmg > 0 && Math.abs(p.x - m.x) < 260) || (d < 150 && Math.random() < 0.75) },
  inksplash: { name: '画符', cd: 2.5, can: f => (f.ink || 0) >= INK_COST * FU_INK && (f.fu || 0) < FU_MAX, lack: f => (f.fu || 0) >= FU_MAX ? '符已画满' : '墨不够', desc: `提笔画一张符，花 ${FU_INK} 格墨水，符条 +1（最多 ${FU_MAX} 张）。符攒着给大招用，攒得越多大招越痛。`,
    start(f) { f.vx = 0; },
    update(f) {
      if (f.skPh === 0 && f.t >= 0.2) {
        f.skPh = 1; f.ink -= INK_COST * FU_INK; f.fu = Math.min(FU_MAX, (f.fu || 0) + 1); SFX.swing();
        ring(f.x + f.face * 30, f.y - 120, 40, '235,200,90', 0.35);
        addP({ type: 'text', text: `画符 · ${f.fu}/${FU_MAX}`, x: f.x, y: f.y - 140, life: 0.8, max: 0.8, rgb: '235,200,90' });
      }
      if (f.skPh === 1 && f.t >= 0.4) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['my_stroke', 26] : ['my_paint', 50], ai: (m, o, d) => d > 260 && (m.fu || 0) < FU_MAX && (m.ink || 0) >= INK_COST * (FU_INK + 1) },   // 电脑留一格墨甩墨团，墨不够就不去画
  moonring: { name: '月轮', cd: 4.5, desc: '双月刃体积增大，脱手去程仅为快速轻削（无挑空）；自背后折返的一记附带【背袭破防】（0.78 秒强力击飞与晕眩），专破死守前方的架势。',
    start(f) { f.vx = 0; },
    update(f) {
      if (f.skPh === 0 && f.t >= 0.1) { f.skPh = 1; SFX.swing(); spawnProj(f, { kind: 'moonring', x: f.x + f.face * 40, y: f.y - 65, vx: f.face * 740, w: 56, h: 56, life: 1.8, dmg: 28, kb: [100, 0], stun: 0.25, launch: false, hs: 0.04, pierce: true, rehit: 0.3, maxHits: 2, boomer: true, turn: 0.38 }); }
      if (f.skPh === 1 && f.t >= 0.28) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['yh_mirror', 28] : ['l2a', 50], ai: (m, o, d) => d > 120 && d < 400 },
  darts: { name: '翎羽', cd: 2.5, air: true, desc: '振翅激射三道极速破甲翎羽，贯穿全场。此技【不击飞、无长硬直】，专精于全屏连续穿刺牵制与打断，破尽突进节奏。',
    start() {},
    update(f) {
      if (f.skPh === 0 && f.t >= 0.08) {
        f.skPh = 1; SFX.slice();
        const air = airH(f) > 30;
        for (const k of [-1, 0, 1]) spawnProj(f, { kind: 'feather', x: f.x + f.face * 30, y: f.y - 70 + k * 14, vx: f.face * (air ? 880 : 1100), vy: air ? 580 + k * 90 : k * 45, w: 24, h: 36, life: 3, dmg: 22, kb: [100, 0], stun: 0.20, hs: 0.03, launch: false });
      }
      if (f.skPh === 1 && f.t >= 0.24) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['yl_wings', 30] : ['a1a', 60], ai: (m, o, d) => d > 120 },
  mirror: { name: '月镜', cd: 7, nofric: true, desc: '举月轮如镜护胸，凝立 0.45 秒。近身来犯者被格开，随之而来的反斩施加【太阴绝罚】（95 伤害、1.05 秒超长硬直）与【禁身锁定】，无从闪避！',
    start(f) { f.parryT = 0.45; },
    update(f, foe) {
      if (f.skPh === 0) { const c = f.ctrl, dir = (c.held.right ? 1 : 0) - (c.held.left ? 1 : 0); f.vx = damp(f.vx, dir * wk(f), 14, STEP); } else f.vx = damp(f.vx, 0, 10, STEP);
      if (f.skPh === 0 && f.t >= 0.45) { f.skPh = 1; f.t = 0; f.parryT = 0; }
      if (f.skPh === 1 && f.t >= 0.35) toNeutral(f);
      if (f.skPh === 2) {
        if (f.t >= 0.06 && !f.hitDone) {
          f.hitDone = true;
          applyHit(f, foe, COUNTER, [foe.x, foe.y - 60]);
          foe.breakCD = Math.max(foe.breakCD, 0.75);
          addP({ type: 'text', text: '🌙 太阴绝罚 · 禁身锁定', x: foe.x, y: foe.y - 110, life: 1.1, max: 1.1, rgb: '220,190,255' });
        }
        if (f.t >= 0.42) toNeutral(f);
      }
    },
    pose: f => f.skPh === 0 ? ['yh_mirror', 40] : f.skPh === 2 ? ['hva', 60] : ['idle', 10],
    ai: () => false },
  soundwave: { name: '清音', cd: 3.2, air: true, desc: '横箫一吹，放出一道音波。普攻攒下的音律会一次吹尽：每枚音律让音波更大、更快、伤害 +20；三律齐鸣时音波穿透、挑空、不可斩散，并让对手陷入【绕梁 · 失律】（2.2 秒迟缓）。',
    start(f) { f.vx *= 0.3; },
    update(f) {
      if (f.skPh === 0 && f.t >= 0.12) {
        f.skPh = 1; const n = Math.min(3, f.notes || 0); f.notes = 0;
        SFX.note(n);
        spawnProj(f, { kind: 'note', x: f.x + f.face * 40, y: f.y - 70, vx: f.face * (620 + 60 * n), w: 54 + 16 * n, h: 54 + 16 * n, grow: 40 + 14 * n, life: 0.95,
          dmg: 22 + 20 * n, kb: [200 + 40 * n, n >= 3 ? -420 : 0], stun: 0.3 + 0.06 * n, hs: 0.05 + 0.015 * n, launch: n >= 3, unbreakable: n >= 3, maxHits: 1, notes: n });
        if (n >= 3) addP({ type: 'text', text: '三律齐鸣', x: f.x, y: f.y - 120, life: 0.8, max: 0.8, rgb: '150,240,200' });
      }
      if (f.skPh === 1 && f.t >= 0.2) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['yx_play', 30] : ['yx_push', 50],
    ai: (me, foe, d) => d > 110 && d < 700 && ((me.notes || 0) >= 2 || d > 240) },
  echowall: { name: '回音壁', cd: 6, breakout: true, desc: '以箫声筑起一道回音壁（0.6 秒）：贴身之敌被音浪推开（身上每枚音律 +8 伤害）；期间飞来的暗器、剑气、风刃会原路弹回，归玉箫所有，每弹回一次再得一枚音律。起手自带一次霸体。大招与地面陷阱无法弹回。',
    start(f) { f.vx = 0; if (f.y < 0) f.vy = Math.min(f.vy, 0); f.reflectT = 0.6; f.armorT = 0.6; f.armorHits = 1; ring(f.x, f.y - 60, 90, f.look.slash, 0.3); SFX.note(1); },
    update(f, foe) {
      f.vx = damp(f.vx, 0, 12, STEP);
      if (f.skPh === 0 && f.t >= 0.08) {
        f.skPh = 1; f.hitDone = false;
        if (strike(f, foe, { box: [-10, -130, 110, 0], dmg: 18 + 8 * (f.notes || 0), kb: [520, -120], stun: 0.35, hs: 0.06 })) {
          f.notes = Math.min(3, (f.notes || 0) + 1);
          addP({ type: 'text', text: '音浪', x: foe.x, y: foe.y - 100, life: 0.6, max: 0.6, rgb: '150,240,200' });
        }
      }
      if (f.t >= 0.45) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['yx_play', 40] : ['yx_play', 20],
    ai: (me, foe, d) => d < 120 || projs.some(p => p.owner === foe.idx && !p.ult && Math.abs(p.x - me.x) < 260) },
  pavilion: { name: '亭中留客', cd: 16, desc: '把对手当作客人留下：一座醉翁亭从对手头顶砸落（出手约 0.4 秒落地，射程约 720），罩住了就把人禁锢在亭中 1.5 秒，期间动弹不得、腾空闪也用不出，但可以随便打（被打不会飞出亭子）。落地前走开就罩不住。霸体能硬扛。',
    start(f) { f.vx = 0; },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.05) {
        f.skPh = 1; SFX.swing();
        const towardFoe = Math.sign(foe.x - f.x) === f.face;
        const tx = clamp(towardFoe ? foe.x : f.x + f.face * 260, WALL + 40, STAGE_W - WALL - 40);
        if (Math.abs(tx - f.x) <= 720) spawnProj(f, { kind: 'pavilion', vx: 0, x: tx, y: -260, delay: 0.35, w: 150, h: 560, life: 0.85, dmg: 20, kb: [0, 0], stun: 0.3, hs: 0.08, jail: true, unblockable: true, unbreakable: true });
        else addP({ type: 'text', text: '客在远方', x: f.x, y: f.y - 120, life: 0.7, max: 0.7, rgb: '255,190,90' });
      }
      if (f.t >= 0.27) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['zx_sway', 30] : ['gc_wind', 40],
    ai: (me, foe, d) => d < 650 },
  feast: { name: '与民同乐', cd: 16, can: f => (f.drunk || 0) >= 50, lack: () => '酒不够', desc: '至少半壶酒才能用，一次把酒全部倒光：先朝对手丢去一瓶酒，砸中就得陪他喝——对手回 85 血，捧着酒瓶僵直 1.5 秒；醉翁自己也灌一口回 135 血，僵直 0.7 秒。自己先喝完，中间这一小段空当可以过去揍他。',
    start(f) { f.vx = 0; f.drunk = 0; },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.18) {
        f.skPh = 1; SFX.swing();
        spawnProj(f, { kind: 'bottle', x: f.x + f.face * 40, y: f.y - 92, vx: f.face * 950, vy: -60, g: 260, w: 40, h: 46, life: 0.9, dmg: 1, kb: [0, 0], stun: 0, hs: 0, feast: true, unblockable: true, unbreakable: true });
      }
      if (f.skPh === 1 && f.t >= 0.35) {
        f.skPh = 2; f.hp = Math.min(f.maxHp, f.hp + 135); SFX.drink();
        addP({ type: 'text', text: '+135', x: f.x, y: f.y - 120, life: 0.8, max: 0.8, rgb: '130,230,140' });
      }
      if (f.t >= 1.05) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['gc_wind', 30] : f.skPh === 1 ? ['gc_throw', 60] : ['zx_drink', 24],
    ai: (me, foe, d) => (me.drunk || 0) >= 50 && d > 120 && d < 800 && me.hp < me.maxHp * 0.85 },
  drink: { name: '豪饮', cd: 2.6, desc: '仰头灌一大口酒，醉意 +50。', start(f){ f.vx = 0; }, update(f){ if (f.t >= 0.3) toNeutral(f); }, pose: () => ['zx_drink', 24], ai: () => false },
  drunkstep: { name: '醉步', cd: 4.5, desc: '东倒西歪一个滚翻。', start(f){ f.vx = 0; }, update(f){ if (f.t >= 0.36) toNeutral(f); }, pose: () => ['zx_roll', 40], ai: () => false },
  hook: { name: '飞锤', cd: 4, air: true, desc: '把链锤朝对手甩出去（射程约 495），锤头砸中就扯链把对手拽到身前，并施加【震魄】：1.2 秒内对手受到的伤害提高 25%。被格挡或被霸体吃掉时带不动。',
    start(f) { f.vx *= 0.2; },
    update(f) {
      if (f.skPh === 0 && f.t >= 0.12) { f.skPh = 1; SFX.heavy(); spawnProj(f, { kind: 'hook', x: f.x + f.face * 40, y: f.y - 72, vx: f.face * 1500, w: 44, h: 40, life: 0.33, dmg: 18, kb: [0, 0], stun: 0.35, hs: 0.06, hook: true }); }
      if (f.skPh === 1 && f.t >= 0.36) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['gc_wind', 30] : f.t < 0.18 ? ['gc_throw', 60] : ['gc_pull', 40],
    ai: (me, foe, d) => d > 160 && d < 500 },
  whirl: { name: '旋锤', cd: 5, nofric: true, desc: '把链锤拎过头顶抡圆了转（约 1 秒，半径约 150），转圈时能慢慢挪步：前四圈每圈砸一下（每下 7 伤害），第五圈松手一甩把人砸飞（30 伤害）。锤风还能砸碎飞来的暗器。',
    start(f) { f.vx = 0; f.spN = 0; f.hitDone = false; },
    update(f, foe) {
      const c = f.ctrl, dir = (c.held.right ? 1 : 0) - (c.held.left ? 1 : 0);
      f.vx = damp(f.vx, dir * wk(f) * 0.45, 10, STEP);
      if (dir !== 0) f.face = dir;
      if (f.t > 0.1 && f.t < 1.0) for (const p of projs) {
        if (p.owner === foe.idx && !p.dead && !p.unbreakable && !p.ult && Math.abs(p.x - f.x) < 150 && Math.abs(p.y - (f.y - 90)) < 100) { p.dead = true; blockFX(p.x, p.y, f.face); SFX.block(); }
      }
      const n = f.t < 0.15 ? 0 : Math.min(5, 1 + Math.floor((f.t - 0.15) / 0.2));
      if (n > f.spN) {
        f.spN = n; f.hitDone = false; SFX.swing();
        const last = n === 5;
        if (strike(f, foe, last ? { box: [-160, -190, 160, 0], dmg: 30, kb: [560, -380], stun: 0.55, hs: 0.12, launch: true, big: true }
                                : { box: [-150, -180, 150, 0], dmg: 7, kb: [40, 0], stun: 0.28, hs: 0.03, noScale: true }) && last)
          addP({ type: 'text', text: '脱手一甩', x: foe.x, y: foe.y - 100, life: 0.7, max: 0.7, rgb: '235,205,130' });
      }
      if (f.t >= 1.2) toNeutral(f);
    },
    pose: f => f.spN >= 5 ? ['gc_throw', 50] : ['gc_spin', 30],
    ai: (me, foe, d) => d < 170 },
  spindle: { name: '穿叶飞梭', cd: 5, nofric: true, desc: '凌雀掷出牵丝子母飞梭，飞梭破风向前穿刺（贯穿前方敌人与墨阵），命中附加 3.5 秒【雀芒】印记并造成 30 伤害。',
    start(f) { f.vx = 0; },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.12) {
        f.skPh = 1; f.t = 0;
        SFX.slice(); SFX.dash();
        spawnProj(f, { kind: 'spindle', x: f.x + f.face * 40, y: f.y - 55, vx: f.face * 1050, vy: 0, w: 46, h: 26, life: 0.65, dmg: 30, kb: [150, 0], stun: 0.30, hs: 0.05, mark: true, pierce: true, maxHits: 2 });
      }
      if (f.skPh === 1 && f.t >= 0.16) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['du_l1s', 24] : ['du_l1a', 40],
    ai: (me, foe, d) => d > 110 && d < 460 },
  shadowdash: { name: '移形换影', cd: 7.5, pass: true, air: true, nofric: true, desc: '踏悬丝化作极速流光扑向对手，初次近身不命中而是凌空漂移回拉（大幅提升最大漂移距离），随后不绝追踪直刺直至命中。对手无法精准招架；唯有正确格挡方可减免伤害并终结突进，但仍会被强袭震晕（不倒地）。穿刺已带【雀芒】之敌，引爆悬丝真气造成 38 爆炸伤害与挑空，并立即清零移形换影冷却！',
    start(f, foe) {
      f.vx = 0; f.vy = 0;
      f.sdTrack = false;
      f.sdDrifted = false;
      f.sdDrifting = false;
      f.sdDriftT = 0;
      f.sdDriftDist = 0;
      f.sdDriftDir = 0;
    },
    update(f, foe) {
      const target = sdTarget(f, foe);
      if (f.skPh === 0) {
        if (f.t >= 0.08) {
          f.skPh = 1; f.t = 0; f.invul = 0.12; f.hitDone = false; SFX.dash();
          f.sdDrifted = false;
          f.sdDrifting = false;
          f.sdDriftT = 0;
          f.sdDriftDist = 0;
          const toward = target && (Math.sign(target.x - f.x) === f.face || Math.abs(target.x - f.x) <= 15);
          f.sdTrack = !!toward;
          const a = toward ? sdAim(f, target) : (f.face > 0 ? 0 : Math.PI);
          f.vx = Math.cos(a) * SD_SPD; f.vy = Math.sin(a) * SD_SPD;
        }
      }
      if (f.skPh === 1) {
        // 碰墙不卡死、不停滞：沿墙借力反弹回场内
        if (f.x <= WALL + 6 && f.vx < 0) {
          f.x = WALL + 8;
          f.vx = Math.abs(f.vx) || SD_SPD * 0.75;
          f.face = 1;
          if (f.sdDrifting) { f.sdDrifting = false; f.sdDrifted = true; }
          SFX.dash();
          if (!RESIM) ring(f.x, f.y - 50, 45, '255,140,225', 0.2);
        } else if (f.x >= STAGE_W - WALL - 6 && f.vx > 0) {
          f.x = STAGE_W - WALL - 8;
          f.vx = -Math.abs(f.vx) || -SD_SPD * 0.75;
          f.face = -1;
          if (f.sdDrifting) { f.sdDrifting = false; f.sdDrifted = true; }
          SFX.dash();
          if (!RESIM) ring(f.x, f.y - 50, 45, '255,140,225', 0.2);
        }

        const dFoe = target ? Math.hypot(target.x - f.x, (target.y - 50) - (f.y - 50)) : Infinity;

        // 第一次不命中对手，而是向后凌空漂移回拉（大幅提升最大漂移距离）
        if (!f.sdDrifted && !f.sdDrifting && target && (dFoe <= 125 || Math.abs(target.x - f.x) <= 85)) {
          f.sdDrifting = true;
          f.sdDriftT = 0;
          f.sdDriftDist = 0;
          f.sdDriftDir = f.x < target.x ? -1 : 1;
          f.vx = f.sdDriftDir * SD_DRIFT_SPD;
          f.vy = Math.min(f.vy, -160);
          f.invul = Math.max(f.invul, 0.15);
          SFX.dash();
          if (!RESIM) {
            ring(f.x, f.y - 50, 75, '255,140,225', 0.35);
            addP({ type: 'text', text: '✦ 移形回影 · 漂移 ✦', x: f.x, y: f.y - 110, life: 0.65, max: 0.65, rgb: '255,140,225' });
          }
          return;
        }

        // 漂移回拉中
        if (f.sdDrifting) {
          f.sdDriftT += STEP;
          f.sdDriftDist += Math.abs(f.vx) * STEP;
          f.vx = damp(f.vx, f.sdDriftDir * SD_DRIFT_SPD * 0.45, 7, STEP);
          f.vy = damp(f.vy, -100, 8, STEP);
          if (f.y >= 0 && f.vy > 0) f.vy = 0;
          if (target) f.face = target.x >= f.x ? 1 : -1;
          if (!RESIM && Math.random() < 0.6) {
            addP({ type: 'spark', x: f.x - f.face * 15, y: f.y - 45, vx: -f.sdDriftDir * rand(60, 200), vy: rand(-60, 60), rgb: '255,140,225', life: 0.25, max: 0.25 });
          }
          if (f.sdDriftDist >= SD_DRIFT_MAX || f.sdDriftT >= 0.24) {
            f.sdDrifting = false;
            f.sdDrifted = true;
            f.sdTrack = true;
            const a = target ? sdAim(f, target) : (f.face > 0 ? 0 : Math.PI);
            f.vx = Math.cos(a) * SD_SPD;
            f.vy = Math.sin(a) * SD_SPD;
            SFX.dash();
            if (!RESIM) ring(f.x, f.y - 50, 60, '255,140,225', 0.3);
          }
          return;
        }

        // 追踪：每一帧把飞行方向往对手现在的位置转（每秒最多转 SD_TURN 弧度），速度保持 SD_SPD
        if (target && f.sdTrack) {
          const cur = Math.atan2(f.vy, f.vx), want = sdAim(f, target);
          let d = want - cur;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          if (f.y >= 0 && Math.sin(cur + clamp(d, -SD_TURN * STEP, SD_TURN * STEP)) > Math.max(0.001, Math.sin(cur))) d -= Math.sign(d) * Math.PI * 2;
          const a = cur + clamp(d, -SD_TURN * STEP, SD_TURN * STEP);
          f.vx = Math.cos(a) * SD_SPD; f.vy = Math.sin(a) * SD_SPD;
        } else {
          const v = Math.hypot(f.vx, f.vy) || 1;
          f.vx = f.vx / v * SD_SPD; f.vy = f.vy / v * SD_SPD;
        }
        if (f.vx) f.face = f.vx > 0 ? 1 : -1;
        if (f.y >= 0 && f.vy > 0) f.vy = 0;
        if (!RESIM && Math.random() < 0.6) {
          addP({ type: 'spark', x: f.x - f.face * 20, y: f.y - 50, vx: -f.face * rand(50, 150), vy: rand(-40, 40), rgb: '235,110,210', life: 0.25, max: 0.25 });
        }

        // 完成漂移回拉后进行真正的穿刺攻击，持续追踪不命中不休止
        if (f.sdDrifted) {
          const hitFoe = target || foe;
          const wasMarked = (hitFoe.needleMark || 0) > 0;
          if (strike(f, hitFoe, {
            name: 'shadowdash',
            box: [-40, -120, 104, 24],
            dmg: 34,
            kb: [190, 0],
            stun: 0.42,
            hs: 0.07,
            noJg: true,
            unparryable: true,
            blockStun: 0.45,
            launch: false
          })) {
            if (wasMarked) {
              hitFoe.needleMark = 0;
              f.skill2CD = 0;
              shake = Math.max(shake, 14);
              SFX.heavy(); SFX.slice();
              applyHit(f, hitFoe, { dmg: 38, kb: [240, -640], stun: 0.55, hs: 0.14, launch: true, big: true, unblockable: true }, [hitFoe.x, hitFoe.y - 60]);
              ring(hitFoe.x, hitFoe.y - 60, 110, '235,110,210', 0.4);
              for (let k = 0; k < 12; k++) {
                const a = rand(0, 6.28), v = rand(120, 320);
                addP({ type: 'spark', x: hitFoe.x, y: hitFoe.y - 60, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rgb: '255,160,230', life: 0.35, max: 0.35 });
              }
              addP({ type: 'text', text: '✦ 雀芒引爆 · 换影重置 ✦', x: f.x, y: f.y - 120, life: 1.0, max: 1.0, rgb: '255,140,225' });
            }
            f.skPh = 2; f.t = 0; f.vx *= 0.06; f.vy *= 0.06;
          }
        }
        // 持续不间断追踪，直至命中目标（或目标阵亡脱离）
        if (target && target.hp <= 0 && f.t >= 1.5) { f.skPh = 2; f.t = 0; f.vx *= 0.12; f.vy *= 0.12; }
      }
      if (f.skPh === 2 && f.t >= 0.16) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['du_l1s', 24] : f.skPh === 1 ? (f.sdDrifting ? ['du_l1s', 30] : ['dash', 60]) : ['idle', 14],
    ai: (me, foe, d) => foe.invul <= 0 && ((foe.needleMark > 0 && d < 700) || (d > 100 && d < 520)) },
  // 离影：雾身的规则和怎么选雾身在 09-actions.js 的「雾身」那一节，数在 src/data/heroes/13-liying.js 的 clone
  mistmark: { name: '留影', cd: 5, nofric: true, can: f => f.onGround(), lack: () => '要站在地上才能留影', desc: '在脚下留一个雾身，同时向前踏出一大步斩出一刀（40 伤害）。只能在地上用；场上最多 2 个雾身，再留就散掉最早的那个。雾身存在 6 秒，碰到任何攻击就碎（攻击照常打下去），打碎的人回 10 点气。',
    start(f) { f.vx = 0; plantClone(f, f.x); },
    update(f, foe) {
      // 踏出约 110 像素再出刀：雾身留在身后，不和本体叠在一起（不然打本体的刀顺手就把雾身打碎了）
      if (f.skPh === 0 && f.t >= 0.12) { f.skPh = 1; f.t = 0; f.hitDone = false; f.vx = 920 * f.face; SFX.swing(); }
      if (f.skPh === 1) {
        strike(f, foe, { box: [0, -112, 118, -8], dmg: 40, kb: [260, -60], stun: 0.32, hs: 0.07 });
        if (f.t >= 0.12) { f.skPh = 2; f.t = 0; f.vx *= 0.3; }
      }
      if (f.skPh === 2 && f.t >= 0.22) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['fy_seal', 40] : f.skPh === 1 ? ['l2a', 60] : ['idle', 14],
    ai: (me, foe, d) => d > 160 && d < 460 && (me.clones || []).length < 2 },
  // free：只能从自由状态（站、走、下落、防御）发动，不能接在出招后面，也不能从腾空闪里放
  mistswap: { name: '渡影', cd: 4, free: true, breakout: true,
    can: f => ['idle', 'walk', 'air', 'block', 'hitstun', 'blockstun', 'launched'].includes(f.state) && !f.escInvul && !!pickClone(f, foeOf(f)),
    lack: f => (f.clones || []).length ? '那边没有雾身' : '没有雾身可渡',
    desc: '结印 0.2 秒（站着不动，看得出要去哪个雾身），然后身子瞬间到那个雾身的位置，雾身用掉。只按 R 去离对手最近的雾身（一直标着光圈）；按住 ← 或 → 再按 R 去那一边最近的；按住 ↓ 再按 R 去最早留下的。到了以后 0.15 秒不能出招（可以防御），朝向是来的方向。没有无敌，结印时被打断就落空。',
    start(f, foe) { const c = pickClone(f, foe); f.swapId = c ? c.id : -1; f.vx = 0; },
    update(f) {
      const C = f.ch.clone;
      f.vx = 0;
      if (f.skPh === 0) {
        const c = (f.clones || []).find(k => k.id === f.swapId);
        if (!c) { toNeutral(f); return; }   // 结印时雾身被打碎或散了：这次落空，冷却照算
        if (f.t >= C.swapSeal) {
          const x0 = f.x;
          cloneGone(f, c, false);
          f.x = c.x; f.vy = 0; mapPutOn(f, c.p !== undefined ? c.p : -1); f.jumps = 0; f.airDash = 1;   // 雾身在平台上就站到平台上
          if (c.x !== x0) f.face = c.x > x0 ? 1 : -1;   // 朝向是来的方向：换到对手身后时是背对着他的
          f.snap = true; f.trail.length = 0; f.scarf = [];
          if (!RESIM) { smoke(x0, -50, 10); ring(f.x, f.y - 50, 70, f.look.slash, 0.3); SFX.poof(); }
          f.skPh = 1; f.t = 0;
        }
        return;
      }
      if (f.ctrl && f.ctrl.held.down && f.onGround()) { toNeutral(f); f.state = 'block'; return; }   // 凝身时可以防御
      if (f.t >= C.swapLand) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['fy_seal', 50] : ['idle', 20],
    ai: () => false },
  polarswap: { name: '极性反转', cd: 8, instant: true, desc: '正极和负极互换，不花出招时间，空中也能用；身上亮起一个大大的红色 ⊕ 或蓝色 ⊖，换完立刻清零「磁极」（R）的冷却。负极普攻消磁了，换一下极性就恢复。',
    start(f) {
      f.pol = f.pol > 0 ? -1 : 1; f.polT = 0.6; f.skill2CD = 0; f.mChain = 0; f.mT = 0;   // 换极性也顺便恢复消磁
      ring(f.x, f.y - 60, 90, magRGB(f.pol), 0.3); SFX.parry();
      addP({ type: 'text', text: magName(f.pol), x: f.x, y: f.y - 125, life: 0.7, max: 0.7, rgb: magRGB(f.pol) });
      toNeutral(f);
    },
    update(f) { toNeutral(f); },
    pose: () => ['idle', 14],
    ai: () => false },
  magfield: { name: '磁极', cd: 6, desc: `正极：身边生出一圈磁石，把周围的敌人用力弹走，离得越近弹得越远（${MAG.rPlusDmg} 伤害）。负极：把中距离的对手吸过来，越近吸得越快，吸到身前定住 ${MAG.rMinusStun} 秒，不会倒地（${MAG.rMinusDmg} 伤害，挡不住）。`,
    start(f) { f.vx = 0; f.magN = f.pol; f.magTg = -1; },   // 按起手那一刻的极性放
    update(f, foe) {
      const plus = f.magN > 0;
      if (f.skPh === 0 && f.t >= (plus ? 0.14 : 0.16)) {
        f.skPh = 1; f.t = 0; f.hitDone = false;
        const tg = sdTarget(f, foe) || foe, rgb = magRGB(f.magN);
        if (plus) {
          for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; addP({ type: 'mag', pol: 1, x: f.x + Math.cos(a) * 40, y: f.y - 60 + Math.sin(a) * 30, vx: Math.cos(a) * 520, vy: Math.sin(a) * 300, rot: a, r: 11, life: 0.32, max: 0.32, drag: 3 }); }
          ring(f.x, f.y - 60, MAG.rPlusR, rgb, 0.35); shake = Math.max(shake, 10); SFX.heavy();
          const d = Math.hypot(tg.x - f.x, tg.y - f.y), near = clamp(1 - d / MAG.rPlusR, 0, 1);   // 越近越大
          const dir = (Math.sign(tg.x - f.x) || f.face) * MAG.rPlusDir;
          strike(f, tg, { box: [-MAG.rPlusR, -150, MAG.rPlusR, 20], dmg: MAG.rPlusDmg, kb: [MAG.rPlusKb[0] + MAG.rPlusKb[1] * near, -360 - 260 * near], stun: 0.5, hs: 0.1, launch: true, big: true, dir });
        } else {
          ring(f.x, f.y - 60, 70, rgb, 0.3); SFX.dash();
          addP({ type: 'mag', pol: -1, x: f.x + f.face * 34, y: f.y - 62, vx: 0, vy: 0, rot: 0, r: 13, life: 0.45, max: 0.45 });
          const dx = tg.x - f.x;
          if (!isClient() && tg.hp > 0 && tg.invul <= 0 && Math.abs(dx) <= MAG.rMinusRange && Math.abs(tg.y - f.y) < 260) {
            f.face = Math.sign(dx) || f.face; f.magTg = tg.idx; f.hitDone = true;
            tg.state = 'held'; tg.t = 0; tg.vx = 0; tg.vy = 0; tg.move = null; tg.skill = null; tg.sp = null;
          }
        }
      }
      if (f.skPh === 1 && f.magTg >= 0) {   // 负极：一帧一帧吸过来，越近越快
        const tg = fighterByIdx(f.magTg), dx = f.x + f.face * 72 - tg.x, d = Math.abs(tg.x - f.x);
        if (tg.state !== 'held' || tg.hp <= 0) f.magTg = -1;
        else {
          const v = magForce(MAG.rMinusK, d, MAG.rMinusV[0], MAG.rMinusV[1]), stepX = Math.sign(dx) * Math.min(Math.abs(dx), v * STEP);
          magMove(tg, tg.x + stepX); tg.y = damp(tg.y, gndY(f), 18, STEP);   // 吸到磁仙脚下那一层
          if (!RESIM && Math.random() < 0.7) addP({ type: 'spark', x: tg.x, y: tg.y - 60 + rand(-20, 20), vx: Math.sign(dx) * rand(300, 600), vy: rand(-30, 30), rgb: magRGB(-1), life: 0.2, max: 0.2, w: 2 });
          if (Math.abs(dx) < 2 || f.t >= MAG.rMinusTime) {
            f.magTg = -1; mapPutOn(tg, f.plat);
            applyHit(f, tg, { dmg: MAG.rMinusDmg, kb: [0, 0], stun: MAG.rMinusStun, hs: 0.08, root: true, unblockable: true, dir: f.face }, [tg.x, tg.y - 60]);
            if (tg.state === 'held') toNeutral(tg);
            ring(tg.x, tg.y - 60, 60, magRGB(-1), 0.25); SFX.thud();
          }
        }
      }
      if (f.skPh === 1 && f.magTg < 0 && f.t >= 0.24) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['lm_boxer', 26] : [f.magN > 0 ? 'hva' : 'yx_push', 56],
    ai: (me, foe, d) => me.pol > 0 ? d < MAG.rPlusR + 10 : d > 120 && d < MAG.rMinusRange - 40 },
};
const COUNTER = { dmg: 95, kb: [440, -820], stun: 1.05, hs: 0.2, launch: true, big: true, unblockable: true, noScale: true };

