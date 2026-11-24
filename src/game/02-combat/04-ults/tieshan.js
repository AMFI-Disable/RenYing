Object.assign(ULTS, {
  // ---- 铁山 · 大招 E：山崩（avalanche） ----
  // 重做：裂空山崩可自高空贯通全部五层战场，逐层崩裂平台并引发每层独立震波、碎石与打击判定，不再被单层平台阻挡。
  avalanche: { name: '山崩', desc: '举巨刃蓄势一跃擎天，滞空期间可操控落点（按 S 加速下砸），泰山压顶贯通五层战场逐层崩裂（每层 185 伤害，不可格挡），击碎格挡与地面霸体！正中命中触发【怒意回涌】：震荡晕眩对手（0.9 秒），回满真气并重置震地与铁壁冲冷却；连放、擦边或砸中倒地目标回 50% 真气。',
    begin(f, foe) {
      f.sp = 'leap'; f.vy = (typeof battleMapOn === 'function' && battleMapOn()) ? -1880 : -1050; f.y = f.y - 1; f.plat = -1; f.dropT = 1.2;
      const c = f.ctrl, dir = (c && c.held && c.held.right ? 1 : 0) - (c && c.held && c.held.left ? 1 : 0);
      f.vx = dir * 360;
      f.spPose = 'ts_lift'; f.invul = 0.35; SFX.heavy();
      f.avaChain = !!f.avaFree; f.avaFree = false;
      f.avaPrevY = f.y;
      f.avaLayers = [];      // 已贯通震裂的层高（y 坐标）
      f.avaHitSet = [];      // 本次山崩已命中的目标 idx（每层只受一次主砸击）
      f.avaTriggered = false;
      f.avaFull = false;
      f.avaSlammedLayers = [];
    },
    update(f, foe) {
      const slamLayer = (layerY, finalGround) => {
        const keyY = Math.round(layerY);
        if (f.avaLayers.includes(keyY)) return;
        f.avaLayers.push(keyY);
        f.avaSlammedLayers.push(keyY);
        if (!RESIM) {
          shake = Math.max(shake, finalGround ? 28 : 20);
          flashA = Math.max(flashA, finalGround ? 0.42 : 0.24);
          flashRGB = '255,210,150';
          dust(f.x, layerY, finalGround ? 30 : 20);
          ring(f.x, layerY, finalGround ? 240 : 195, '255,210,150', 0.42);
          ring(f.x, layerY, finalGround ? 150 : 120, '255,255,255', 0.3);
          finalGround ? SFX.ko() : SFX.thud();
          if (!finalGround) addP({ type: 'text', text: '💥 裂层贯通!', x: f.x, y: layerY - 72, life: 0.75, max: 0.75, rgb: '255,215,120' });
        }
        for (const sd of [-1, 1]) {
          spawnProj(f, { kind: 'quake', x: f.x + sd * 40, y: layerY - 22, groundY: layerY, vx: sd * 520, w: 80, h: 44, life: 0.32, dmg: 0, kb: [0, 0], stun: 0, hs: 0, fx: true, unbreakable: true, groundOnly: true });
        }
        const rockN = finalGround ? 3 : 2;
        for (const sd of [-1, 1]) for (let k = 0; k < rockN; k++) {
          spawnProj(f, { kind: 'rock', x: f.x + sd * (30 + k * 14), y: layerY - 30, groundY: layerY, vx: sd * (320 + k * 170), vy: -480 + k * 80, g: 1800, lob: true, w: 34, h: 30, life: 1.2, dmg: 35, kb: [220, -300], stun: 0.4, hs: 0.06, launch: true, ult: true, noScale: true, rot: grand(0, 6) });
        }
        const targets = isMulti() ? foesOf(f) : [foe];
        for (const tf of targets) {
          if (!tf || tf.hidden || tf.hp <= 0 || f.avaHitSet.includes(tf.idx)) continue;
          const foeIsFlying = tf.flying || (tf.ch && tf.ch.id === 'yanling' && airH(tf) > 80);
          const foeIsDashUlt = tf.state === 'special' && ['dash', 'rush', 'sweep'].includes(tf.sp);
          const canCrushUlt = tf.state === 'special' && !foeIsFlying && !foeIsDashUlt;
          const dx = Math.abs(tf.x - f.x), dy = Math.abs(tf.y - layerY);
          const foeDown = tf.state === 'knockdown' || tf.state === 'getup';
          if (dx < 205 && dy < 105 && (tf.invul <= 0 || canCrushUlt || foeDown) && !foeIsFlying && !foeIsDashUlt) {
            f.avaHitSet.push(tf.idx);
            const dir = tf.x >= f.x ? 1 : -1;
            const full = dx < 92.5 && !foeDown;
            if (foeDown) {
              applyHit(f, tf, { dmg: 185, kb: [0, 0], stun: 0, hs: 0.25, unblockable: true, ult: true, noScale: true, noStun: true, dir, big: true }, [tf.x, tf.y - 20]);
            } else {
              const wasSpecial = tf.state === 'special';
              const isLeiMingUlt = wasSpecial && tf.ch && tf.ch.id === 'leiming';
              const keepY = tf.y, keepPlat = tf.plat;
              applyHit(f, tf, { dmg: 185, kb: [dir * 140, 0], stun: 0.9, hs: 0.25, root: true, unblockable: true, ult: true, noScale: true, dir, big: true }, [tf.x, tf.y - 40]);
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

      if (f.sp === 'leap') {
        const c = f.ctrl;
        if (c && c.held) {
          const dir = (c.held.right ? 1 : 0) - (c.held.left ? 1 : 0);
          if (dir !== 0) {
            f.vx = damp(f.vx, dir * 520, 10, STEP);
            f.face = dir;
          } else if (foe) {
            f.vx = damp(f.vx, clamp(foe.x - f.x, -260, 260), 7, STEP);
          }
          if (c.held.down && f.t > 0.18 && f.vy > -300) f.vy += 1400 * STEP;
        }
        if (!RESIM && Math.random() < 0.35) {
          addP({ type: 'spark', x: f.x - f.face * 18, y: f.y - 65, vx: -f.face * rand(60, 160), vy: rand(-40, 40), life: 0.22, max: 0.22, rgb: '255,200,120', w: 2 });
        }
        const prevY = f.avaPrevY !== undefined ? f.avaPrevY : f.y;
        f.vy += GRAV * STEP;
        if (f.vy > 0 && f.t > 0.15) {
          f.dropT = 0.3;
          f.plat = -1;
          // 贯通途经的所有高台层（不在此停住，直接砸穿！）
          const ps = typeof mapPlats === 'function' ? (mapPlats() || []) : [];
          for (const P of ps) {
            if (!P || P.k === 'stairs') continue;
            if (Math.abs(f.x - P.x) > P.w / 2) continue;
            const py = platformY(P, f.x);
            if (py < -1 && prevY <= py && f.y + f.vy * STEP >= py) slamLayer(py, false);
          }
        }
        f.avaPrevY = f.y;
        // 抵达最底层主地面：触发终极落地震波，并将冲击纵贯未经过的其余战场层（含五层大型战场全部五层）
        if (f.t > 0.15 && f.y >= 0) {
          f.y = 0; f.plat = -1; f.dropT = 0;
          f.sp = 'slam'; f.t = 0; f.vx = 0; f.vy = 0; f.spPose = 'ts_slam'; f.snap = true;
          const ps = typeof mapPlats === 'function' ? (mapPlats() || []) : [];
          const deckYs = [];
          for (const P of ps) {
            if (!P || P.k === 'stairs') continue;
            if (Math.abs(f.x - P.x) > P.w / 2) continue;
            const py = platformY(P, f.x);
            if (py < -1 && !deckYs.includes(Math.round(py))) deckYs.push(py);
          }
          deckYs.sort((a, b) => a - b);
          for (const py of deckYs) slamLayer(py, false);
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
