function shadowExecReady(f) {
  if (!f || !(f.shadowExecT > 0) || !(f.shadowExecTarget >= 0)) return null;
  const tg = fighterByIdx(f.shadowExecTarget);
  if (!tg || tg.hidden || tg.hp <= 0) return null;
  if (!foesOf(f).includes(tg)) return null;
  return tg;
}
Object.assign(SKILLS, {
  // ---- 离影 · Q：留影（mistmark） ----
  mistmark: { name: '留影', cd: 3.5, nofric: true, can: f => f.onGround(), lack: () => '要站在地上才能留影', desc: '在脚下留一个雾身，同时向前踏出一大步斩出一刀（40 伤害）。若场上已有雾身，它们会同步释放影刃并在身后化出较弱子影（场上最多 10 个）。雾身攻击造成极低伤害且不削减对手架势，但每次命中都会为该对手独立叠加「影印」，叠满 25 层后引爆魂噬重创并解锁 R 键「影落破势」瞬移下劈。',
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
    ai: (me, foe, d) => d > 160 && d < 460 && (me.clones || []).length < (me.ch.clone ? me.ch.clone.max : 10) },
  // free：只能从自由状态（站、走、下落、防御）发动，不能接在出招后面，也不能从腾空闪里放
  // ---- 离影 · R（右键）：渡影 / 影落破势（mistswap） ----
  mistswap: { name: '渡影', cd: 4, free: true, breakout: true, air: true,
    can: f => ['idle', 'walk', 'air', 'block', 'hitstun', 'blockstun', 'launched'].includes(f.state) && !f.escInvul && (!!shadowExecReady(f) || !!pickClone(f, foeOf(f))),
    lack: f => (f.clones || []).length ? '那边没有雾身' : '没有雾身或满印目标可渡',
    desc: '平时施展渡影获得 0.25 秒霸体护身，并在 0.5 秒时空凝滞中瞬移至本体真身雾身、对沿途敌人造成割裂；当有对手叠满 25 层「影印」时，优先发动「影落破势」——直接瞬移至该对手正上方（跨五层平台生效）劈出强力坠斩，瞬间清零其全部架势并触发破防崩势！',
    start(f, foe) {
      const C = f.ch.clone || {};
      const execTg = shadowExecReady(f);
      if (execTg) {
        // 影落破势：瞬移至满印对手正上方，发动强力坠斩清零架势
        f.skPh = 10;
        f.swapId = execTg.idx;
        f.shadowExecTarget = -1;
        f.shadowExecT = 0;
        f.armorT = Math.max(f.armorT || 0, 0.32);
        f.armorHits = Math.max(f.armorHits || 0, 2);
        f.invul = Math.max(f.invul || 0, 0.22);
        if (!RESIM) { smoke(f.x, f.y - 50, 10); ring(f.x, f.y - 50, 75, '127,214,224', 0.3); }
        f.x = clamp(execTg.x, WALL, STAGE_W - WALL);
        f.y = execTg.y - 135;
        f.plat = -1;
        f.vx = 0; f.vy = 0;
        f.jumps = 0; f.airDash = 1;
        f.snap = true; f.trail.length = 0; f.scarf = [];
        if (!RESIM) {
          ring(f.x, f.y - 45, 95, '210,165,255', 0.35);
          addP({ type: 'text', text: '⬇ 影落破势！', x: f.x, y: f.y - 95, life: 0.85, max: 0.85, rgb: '190,240,255' });
          SFX.poof();
        }
        return;
      }
      f.armorT = Math.max(f.armorT || 0, C.swapArmor !== undefined ? C.swapArmor : 0.25);
      f.armorHits = Math.max(f.armorHits || 0, 1);
      const c = pickClone(f, foe);
      f.swapId = c ? c.id : -1;
      f.vx = 0;
      f.swapFreezeT = C.swapFreeze !== undefined ? C.swapFreeze : 0.5;
      triggerSwapFreeze(f, f.swapFreezeT);
    },
    update(f) {
      const C = f.ch.clone || {};
      if (f.skPh === 10) {
        const tg = fighterByIdx(f.swapId);
        if (tg && !tg.hidden && tg.hp > 0) {
          f.x = clamp(f.x + (tg.x - f.x) * 0.45, WALL, STAGE_W - WALL);
          f.y = tg.y - 135;
        }
        f.vx = 0; f.vy = 0;
        if (f.t >= 0.08) {
          f.skPh = 11; f.t = 0; f.hitDone = false;
          f.vy = 1320;
          SFX.swing();
        }
        return;
      }
      if (f.skPh === 11) {
        const tg = fighterByIdx(f.swapId);
        const targetAlive = tg && !tg.hidden && tg.hp > 0;
        if (targetAlive) f.x = clamp(f.x + (tg.x - f.x) * 0.35, WALL, STAGE_W - WALL);
        const reached = targetAlive ? (f.y >= tg.y - 42 || f.t >= 0.14) : (f.onGround() || f.t >= 0.16);
        if (reached) {
          f.skPh = 12; f.t = 0; f.vx = 0; f.vy = 0;
          if (targetAlive) {
            if (tg.plat >= 0) mapPutOn(f, tg.plat);
            else { f.y = Math.min(0, tg.y); f.plat = -1; }
          }
          const execDmg = C.shadowExecDmg || 75;
          const execSpec = { dmg: execDmg, kb: [160, 0], stun: 0.85, hs: 0.14, big: true, skill: true, guardDeplete: true, root: true, noScale: true };
          if (targetAlive && Math.abs(tg.x - f.x) <= 135 && Math.abs(tg.y - f.y) <= 130) {
            applyHit(f, tg, { ...execSpec, dir: Math.sign(tg.x - f.x) || f.face, srcX: f.x }, [tg.x, tg.y - 58]);
          }
          if (!isClient() && typeof strikeAoE === 'function') {
            strikeAoE(f, f.x, f.y - 45, 130, 110, { dmg: Math.round(execDmg * 0.55), kb: [200, -240], stun: 0.4, hs: 0.08, big: true, skill: true }, targetAlive ? [tg.idx] : []);
          }
          if (!RESIM) {
            ring(f.x, f.y - 18, 175, '127,214,224', 0.45);
            ring(f.x, f.y - 18, 110, '255,140,100', 0.36);
            slashLine(f.x, f.y - 55, Math.PI * 0.5, '165,245,255');
            dust(f.x, f.y, 18);
            shake = Math.max(shake, 16);
            SFX.heavy();
          }
        }
        return;
      }
      if (f.skPh === 12) {
        f.vx = 0;
        if (f.t >= 0.18) toNeutral(f);
        return;
      }
      f.vx = 0;
      if (f.skPh === 0) {
        // 在 0.5s 减速时空期间，玩家可以通过按键方向动态调整目标真身雾身
        const steer = steerClone(f, foeOf(f));
        if (steer) f.swapId = steer.id;
        const c = (f.clones || []).find(k => k.id === f.swapId && !k.sub);
        if (!c) {
          // 目标已被击散或无效：在剩余真身雾身中重新随机指定或回退
          const fb = pickClone(f, foeOf(f));
          if (fb) f.swapId = fb.id;
          else { toNeutral(f); return; }
        }
        if (f.t >= C.swapSeal) {
          const targetClone = (f.clones || []).find(k => k.id === f.swapId && !k.sub);
          if (!targetClone) { toNeutral(f); return; }
          const x0 = f.x, y0 = f.y;
          cloneGone(f, targetClone, false);
          f.x = targetClone.x; f.vy = 0; mapPutOn(f, targetClone.p !== undefined ? targetClone.p : -1); f.jumps = 0; f.airDash = 1;
          f.invul = Math.max(f.invul || 0, C.swapInvul || 0.12);
          // 渡影路过的敌人
          const lo = Math.min(x0, f.x) - (C.swapPathPad || 30), hi = Math.max(x0, f.x) + (C.swapPathPad || 30), top = Math.min(y0, f.y) - 170, bot = Math.max(y0, f.y) + 30;
          echoCloneAttack(f, [lo, top, hi, bot], { dmg: C.swapPathDmg, kb: [220, -380], stun: 0.45, hs: 0.1, launch: true, big: true, skill: true }, 'mistswap');
          for (const e of foesOf(f)) {
            if (!e || e.hp <= 0 || e.invul > 0 || e.x < lo || e.x > hi || e.y < top || e.y > bot) continue;
            applyHit(f, e, { dmg: C.swapPathDmg, kb: [220, -380], stun: 0.45, hs: 0.1, launch: true, big: true, dir: Math.sign(f.x - x0) || f.face, srcX: x0 }, [e.x, e.y - 60]);
            if (!RESIM) for (let k = 0; k < 8; k++) addP({ type: 'spark', x: e.x, y: e.y - 60 + rand(-30, 30), vx: (Math.sign(f.x - x0) || 1) * rand(200, 460), vy: rand(-60, 60), rgb: '127,214,224', life: 0.28, max: 0.28, w: 1.8 });
          }
          if (targetClone.x !== x0) f.face = targetClone.x > x0 ? 1 : -1;
          f.snap = true; f.trail.length = 0; f.scarf = [];
          if (!RESIM) { smoke(x0, -50, 10); ring(f.x, f.y - 50, 70, f.look.slash, 0.3); SFX.poof(); }
          f.skPh = 1; f.t = 0;
        }
        return;
      }
      if (f.ctrl && f.ctrl.held && f.ctrl.held.down && f.onGround()) { toNeutral(f); f.state = 'block'; return; }
      if (f.t >= (C.swapLand || 0.08)) toNeutral(f);
    },
    pose: f => f.skPh === 10 ? ['fy_seal', 55] : f.skPh === 11 ? ['a2', 70] : f.skPh === 12 ? ['l3', 40] : f.skPh === 0 ? ['fy_seal', 50] : ['idle', 20],
    ai: me => !!shadowExecReady(me) },
});
