Object.assign(ULTS, {
  // ---- 铁山 · 大招 E：山崩（avalanche） ----
  // 重做：蓄势冲霄跃升至五层战场穹顶之上，滞空锁敌蓄威后以陨星坠落之势贯通全部五层平台，
  // 逐层崩裂引发独立冲击波、碎石飞溅、震地波与多目标打击，兼具 1v1 爆发与 8v8 跨层清场威势。
  avalanche: { name: '山崩', desc: '举巨刃蓄势冲霄，一跃直上五层战场穹顶之上！滞空期间可操控落点（按 S 极速下坠），随后以陨星之势贯通全部五层平台，逐层引爆冲击波、漫天碎石与震地裂浪（每层 185 伤害，不可格挡），击碎格挡与地面霸体！正中命中触发【怒意回涌】：震荡晕眩对手（0.9 秒），回满真气并重置震地与铁壁冲冷却；连放、擦边或砸中倒地目标回 50% 真气。',
    begin(f, foe) {
      f.sp = 'ascend'; f.plat = -1; f.dropT = 2.0;
      const topY = typeof arenaTopY === 'function' ? arenaTopY() : 0;
      // 始终跃升至全场最高层之上至少 220 像素（五层战场 -528 -> -748），展现“凌驾五层”的磅礴气势
      f.avaApexY = Math.min(topY - 220, f.y - 360);
      f.vy = -2150;
      f.y = f.y - 2;
      const c = f.ctrl, dir = (c && c.held && c.held.right ? 1 : 0) - (c && c.held && c.held.left ? 1 : 0);
      f.vx = dir * 420;
      f.spPose = 'ts_lift'; f.invul = 1.6; SFX.heavy();
      f.avaChain = !!f.avaFree; f.avaFree = false;
      f.avaPrevY = f.y;
      f.avaLayers = [];
      f.avaHitSet = [];
      f.avaTriggered = false;
      f.avaFull = false;
      f.avaSlammedLayers = [];
      if (!RESIM) {
        ring(f.x, f.y, 170, '255,210,130', 0.38);
        dust(f.x, f.y, 18);
        if (typeof debrisBurst === 'function') debrisBurst(f.x, f.y, 10, '155,125,95');
        addP({ type: 'callout', text: '擎天山崩', x: f.x, y: f.y - 95, life: 0.75, max: 0.75, rgb: '255,215,120', scale: 1.9 });
      }
    },
    update(f, foe) {
      const slamLayer = (layerY, finalGround) => {
        const keyY = Math.round(layerY);
        if (f.avaLayers.includes(keyY)) return;
        f.avaLayers.push(keyY);
        if (Array.isArray(f.avaSlammedLayers) && !f.avaSlammedLayers.includes(keyY)) f.avaSlammedLayers.push(keyY);
        if (!RESIM) {
          shake = Math.max(shake, finalGround ? 30 : 21);
          flashA = Math.max(flashA, finalGround ? 0.45 : 0.24);
          flashRGB = '255,210,145';
          dust(f.x, layerY, finalGround ? 32 : 20);
          if (typeof debrisBurst === 'function') debrisBurst(f.x, layerY, finalGround ? 18 : 11, finalGround ? '160,125,92' : '135,112,92');
          ring(f.x, layerY, finalGround ? 280 : 215, '255,205,125', 0.44);
          ring(f.x, layerY, finalGround ? 165 : 125, '255,255,255', 0.3);
          finalGround ? SFX.ko() : SFX.thud();
          if (!finalGround) addP({ type: 'text', text: '💥 裂层贯通!', x: f.x, y: layerY - 72, life: 0.72, max: 0.72, rgb: '255,215,120' });
        }
        // 该层左右双向震地裂浪（严格锚定在 layerY，不误落底地面）
        for (const sd of [-1, 1]) {
          spawnProj(f, { kind: 'quake', x: f.x + sd * 46, y: layerY - 22, groundY: layerY, vx: sd * 580, w: 92, h: 48, life: 0.38, dmg: finalGround ? 36 : 28, kb: [sd * 220, -320], stun: 0.42, hs: 0.06, launch: true, ult: true, noScale: true, unbreakable: true, groundOnly: true, pierce: true, rehit: 0.5 });
        }
        // 崩裂飞石
        const rockN = finalGround ? 3 : 2;
        for (const sd of [-1, 1]) for (let k = 0; k < rockN; k++) {
          spawnProj(f, { kind: 'rock', x: f.x + sd * (32 + k * 18), y: layerY - 30, groundY: layerY, vx: sd * (340 + k * 175), vy: -510 + k * 75, g: 1800, lob: true, w: 36, h: 32, life: 1.25, dmg: 35, kb: [220, -300], stun: 0.4, hs: 0.06, launch: true, ult: true, noScale: true, rot: grand(0, 6) });
        }
        const targets = isMulti() ? foesOf(f) : [foe];
        let layerHits = 0;
        for (const tf of targets) {
          if (!tf || tf.hidden || tf.hp <= 0 || f.avaHitSet.includes(tf.idx)) continue;
          const foeIsFlying = tf.flying || (tf.ch && tf.ch.id === 'yanling' && airH(tf) > 80);
          const foeIsDashUlt = tf.state === 'special' && ['dash', 'rush', 'sweep'].includes(tf.sp);
          const canCrushUlt = tf.state === 'special' && !foeIsFlying && !foeIsDashUlt;
          const dx = Math.abs(tf.x - f.x), dy = Math.abs(tf.y - layerY);
          const foeDown = tf.state === 'knockdown' || tf.state === 'getup';
          if (dx < 225 && dy < 110 && (!invulVs(tf, f) || canCrushUlt || foeDown) && !foeIsFlying && !foeIsDashUlt) {
            f.avaHitSet.push(tf.idx);
            const dir = tf.x >= f.x ? 1 : -1;
            const full = dx < 100 && !foeDown;
            const mul = typeof multiTargetScale === 'function' ? multiTargetScale(layerHits) : 1;
            const dmg = Math.round(185 * mul);
            layerHits++;
            const hsVal = finalGround ? 0.22 : 0.08;
            if (foeDown) {
              applyHit(f, tf, { dmg, kb: [0, 0], stun: 0, hs: hsVal, unblockable: true, ult: true, noScale: true, noStun: true, dir, big: true }, [tf.x, tf.y - 20]);
            } else {
              const wasSpecial = tf.state === 'special';
              const isLeiMingUlt = wasSpecial && tf.ch && tf.ch.id === 'leiming';
              const keepY = tf.y, keepPlat = tf.plat;
              applyHit(f, tf, { dmg, kb: [dir * 140, 0], stun: 0.9, hs: hsVal, root: true, unblockable: true, ult: true, noScale: true, dir, big: true }, [tf.x, tf.y - 40]);
              tf.state = 'hitstun'; tf.stun = 0.9; tf.rooted = true; tf.vx = dir * 80; tf.vy = 0;
              tf.y = keepY; tf.plat = keepPlat;
              if (wasSpecial) { if (!isLeiMingUlt) tf.sp = null; if (tf.invul > 1) tf.invul = 0; }
            }
            f.avaTriggered = true;
            if (full) f.avaFull = true;
            if (!foeDown && !RESIM) addP({ type: 'text', text: '💫 震荡晕眩 · 破灭万法', x: tf.x, y: tf.y - 110, life: 1.3, max: 1.3, rgb: '255,220,120' });
          }
        }
      };

      const steer = (maxSpd) => {
        const c = f.ctrl;
        if (c && c.held) {
          const dir = (c.held.right ? 1 : 0) - (c.held.left ? 1 : 0);
          if (dir !== 0) { f.vx = damp(f.vx, dir * maxSpd, 10, STEP); f.face = dir; }
          else if (foe && foe.hp > 0) { f.vx = damp(f.vx, clamp(foe.x - f.x, -300, 300), 7, STEP); }
        }
      };

      if (f.sp === 'ascend') {
        steer(560);
        f.plat = -1;
        f.vy = damp(f.vy, -1900, 3, STEP);
        if (!RESIM && Math.random() < 0.65) {
          addP({ type: 'spark', x: f.x + rand(-24, 24), y: f.y - 20, vx: rand(-80, 80), vy: rand(260, 520), life: 0.22, max: 0.22, rgb: '255,215,130', w: 2.6 });
        }
        if (f.y <= f.avaApexY || f.t >= 0.34) {
          f.y = Math.min(f.y, f.avaApexY);
          f.sp = 'hover'; f.t = 0; f.vy = 0; f.vx *= 0.35; f.spPose = 'ts_lift';
          if (!RESIM) {
            ring(f.x, f.y - 40, 210, '255,220,130', 0.3);
            addP({ type: 'beam', x: f.x, y: f.y, x2: f.x, y2: 0, w: 34, life: 0.26, max: 0.26, rgb: '255,205,110' });
            SFX.chargeFull();
          }
        }
      } else if (f.sp === 'hover') {
        steer(480);
        f.vy = 0;
        const fastDown = f.ctrl && f.ctrl.held && f.ctrl.held.down;
        if (f.t >= (fastDown ? 0.06 : 0.14)) {
          f.sp = 'plummet'; f.t = 0; f.vy = fastDown ? 3000 : 2550; f.spPose = 'ts_slam'; f.snap = true;
          f.avaPrevY = f.y;
          if (!RESIM) SFX.heavy();
        }
      } else if (f.sp === 'plummet') {
        steer(360);
        const c = f.ctrl;
        if (c && c.held && c.held.down) f.vy = Math.max(f.vy, 3200);
        else f.vy += GRAV * 1.4 * STEP;
        f.dropT = 0.5;
        f.plat = -1;
        if (!RESIM && Math.random() < 0.8) {
          addP({ type: 'spark', x: f.x + rand(-28, 28), y: f.y - 40, vx: rand(-140, 140), vy: -rand(280, 560), life: 0.2, max: 0.2, rgb: '255,190,100', w: 3 });
        }
        const prevY = f.avaPrevY !== undefined ? f.avaPrevY : f.y;
        const nextY = f.y + f.vy * STEP;
        // 按从高到低顺序逐层贯通途经的所有高台层
        const layers = typeof arenaLayersAt === 'function' ? arenaLayersAt(f.x) : [0];
        for (const py of layers) {
          if (py < -1 && prevY <= py && nextY >= py) slamLayer(py, false);
        }
        f.avaPrevY = f.y;
        if (f.y >= 0 || nextY >= 0) {
          f.y = 0; f.plat = -1; f.dropT = 0;
          f.sp = 'slam'; f.t = 0; f.vx = 0; f.vy = 0; f.spPose = 'ts_slam'; f.snap = true;
          for (const py of layers) { if (py < -1) slamLayer(py, false); }
          slamLayer(0, true);
          if (f.avaTriggered) {
            const free = f.avaFull && !f.avaChain;
            f.meter = free ? 100 : Math.min(100, f.meter + 50);
            f.avaFree = free;
            f.skillCD = 0; f.skill2CD = 0;
            if (!RESIM) {
              ring(f.x, f.y - 60, 220, '255,200,120', 0.6);
              addP({ type: 'text', text: free ? '⚡ 怒意回涌 · 再来一次' : '⚡ 怒意回涌 +50% 气量', x: f.x, y: f.y - 130, life: 1.2, max: 1.2, rgb: '255,200,100' });
              SFX.chargeFull();
            }
          }
        }
      } else if (f.sp === 'slam' && f.t >= 0.5) endSpecial(f);
    } },
});
