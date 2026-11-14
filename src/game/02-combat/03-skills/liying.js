Object.assign(SKILLS, {
  // ---- 离影 · Q：留影（mistmark） ----
  mistmark: { name: '留影', cd: 3.5, nofric: true, can: f => f.onGround(), lack: () => '要站在地上才能留影', desc: '在脚下留一个雾身，同时向前踏出一大步斩出一刀（40 伤害）。若场上已有雾身，它们会同步复制出刀并在身后化出较弱子影。场上最多 10 个雾身（含本体与子影所生）。雾身具备高额生命且可被攻击打散，被击碎时发生碎影自爆并短暂弱化对手。雾身随本体出招释放内功波动飞刃，虽伤害偏低但直透防御、加剧对手架势耐力流失。',
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
  // ---- 离影 · R（右键）：渡影（mistswap） ----
  mistswap: { name: '渡影', cd: 4, free: true, breakout: true,
    can: f => ['idle', 'walk', 'air', 'block', 'hitstun', 'blockstun', 'launched'].includes(f.state) && !f.escInvul && !!pickClone(f, foeOf(f)),
    lack: f => (f.clones || []).length ? '那边没有雾身' : '没有雾身可渡',
    desc: '施展渡影获得 0.25 秒霸体护身；发动时全场进入 0.5 秒时空凝滞（0.5x 减速）。在此期间按方向键精确拣选本体真身所留雾身进行瞬移，若未指定方向则随机拣选一具真身雾身渡位。结印后身形瞬现，消去选定雾身；路径间穿梭造成飞身割裂（约 95 伤害，击飞）。',
    start(f, foe) {
      const C = f.ch.clone || {};
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
    pose: f => f.skPh === 0 ? ['fy_seal', 50] : ['idle', 20],
    ai: () => false },
});
