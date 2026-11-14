Object.assign(SKILLS, {
  // ---- 凌雀 · Q：穿叶飞梭（spindle） ----
  spindle: { name: '穿叶飞梭', cd: 5, nofric: true, desc: '凌雀掷出牵丝子母飞梭，飞梭破风向前穿刺（贯穿前方敌人与墨阵），命中附加 5 秒【雀芒】印记（最多 5 层）并造成 30 伤害。',
    start(f) { f.vx = 0; },
    update(f, foe) {
      if (f.skPh === 0 && f.t >= 0.12) {
        f.skPh = 1; f.t = 0;
        SFX.slice(); SFX.dash();
        spawnProj(f, { kind: 'spindle', x: f.x + f.face * 40, y: f.y - 55, vx: f.face * 1050, vy: 0, autoAim: true, w: 46, h: 26, life: 0.65, dmg: 30, kb: [150, 0], stun: 0.30, hs: 0.05, mark: true, pierce: true, maxHits: 2 });
      }
      if (f.skPh === 1 && f.t >= 0.16) toNeutral(f);
    },
    pose: f => f.skPh === 0 ? ['du_l1s', 24] : ['du_l1a', 40],
    ai: (me, foe, d) => d > 110 && d < 460 },
  // ---- 凌雀 · R（右键）：移形换影（shadowdash） ----
  shadowdash: { name: '移形换影', cd: 7.5, pass: true, air: true, nofric: true, desc: '踏悬丝化作极速流光扑向对手，初次近身不刺，而是迂回从对手头顶翻到他身后（身后贴墙没地方时改为凌空漂移回拉），随后一路追踪直刺直至命中。对手无法精准招架；唯有正确格挡方可减免伤害并终结突进，但仍会被强袭震晕（不倒地）。穿刺已带【雀芒】之敌，引爆 1 层悬丝真气造成 30 爆炸伤害与挑空，并立即清零移形换影冷却（若目标带多层印记，可连续五发换影不休）！',
    start(f, foe) {
      f.vx = 0; f.vy = 0;
      f.sdTrack = false;
      f.sdDrifted = false;
      f.sdDrifting = false;
      f.sdDriftT = 0;
      f.sdDriftDist = 0;
      f.sdDriftDir = 0;
      f.sdOver = false;
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

        // 第一次近身不刺，迂回：从对手头顶翻到他身后再扑下来（身后贴墙没地方就照旧往回漂移）
        if (!f.sdDrifted && !f.sdDrifting && target && (dFoe <= 125 || Math.abs(target.x - f.x) <= 85)) {
          const over = f.x < target.x ? 1 : -1, room = over > 0 ? STAGE_W - WALL - target.x : target.x - WALL;
          f.sdDrifting = true;
          f.sdDriftT = 0;
          f.sdDriftDist = 0;
          f.sdOver = room > SD_OVER_ROOM;
          f.sdDriftDir = f.sdOver ? over : -over;
          f.vx = f.sdDriftDir * (f.sdOver ? SD_OVER_VX : SD_DRIFT_SPD);
          f.vy = f.sdOver ? SD_OVER_VY : Math.min(f.vy, -160);
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
          if (f.sdOver) f.vy += SD_OVER_G * STEP;   // 翻过头顶的弧线
          else { f.vx = damp(f.vx, f.sdDriftDir * SD_DRIFT_SPD * 0.45, 7, STEP); f.vy = damp(f.vy, -100, 8, STEP); }
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
          const v = Math.hypot(f.vx, f.vy);
          if (v > 1) { f.vx = f.vx / v * SD_SPD; f.vy = f.vy / v * SD_SPD; }
          else { f.vx = (target ? (target.x >= f.x ? 1 : -1) : f.face) * SD_SPD; f.vy = 0; }   // 速度被什么清零了：别停在原地，朝对手接着冲
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
              hitFoe.needleMark = Math.max(0, (hitFoe.needleMark || 0) - 1);
              if (hitFoe.needleMark <= 0) {
                hitFoe.needleMark = 0;
                hitFoe.needleMarkT = 0;
              }
              f.skill2CD = 0;
              shake = Math.max(shake, 14);
              SFX.heavy(); SFX.slice();
              applyHit(f, hitFoe, { dmg: 30, kb: [240, -640], stun: 0.55, hs: 0.14, launch: true, big: true, unblockable: true }, [hitFoe.x, hitFoe.y - 60]);
              ring(hitFoe.x, hitFoe.y - 60, 110, '235,110,210', 0.4);
              for (let k = 0; k < 12; k++) {
                const a = rand(0, 6.28), v = rand(120, 320);
                addP({ type: 'spark', x: hitFoe.x, y: hitFoe.y - 60, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rgb: '255,160,230', life: 0.35, max: 0.35 });
              }
              const leftMarks = Math.round(hitFoe.needleMark);
              addP({ type: 'text', text: leftMarks > 0 ? `✦ 雀芒引爆 (${leftMarks}余印) · 换影重置 ✦` : '✦ 雀芒引爆 · 换影重置 ✦', x: f.x, y: f.y - 120, life: 1.0, max: 1.0, rgb: '255,140,225' });
            }
            f.skPh = 2; f.t = 0; f.vx *= 0.06; f.vy *= 0.06;
          }
        }
        // 持续不间断追踪，直至命中目标（或目标阵亡脱离）
        if (target && target.hp <= 0 && f.t >= 1.5) { f.skPh = 2; f.t = 0; f.vx *= 0.12; f.vy *= 0.12; }
      }
      if (f.skPh === 2) {
        if (f.skill2CD <= 0 && f.ctrl && f.ctrl.consume && f.ctrl.consume('skill2')) return startSkill(f, foe, 2);
        if (f.t >= 0.16) toNeutral(f);
      }
    },
    pose: f => f.skPh === 0 ? ['du_l1s', 24] : f.skPh === 1 ? (f.sdDrifting ? ['du_l1s', 30] : ['dash', 60]) : ['idle', 14],
    ai: (me, foe, d) => foe.invul <= 0 && ((foe.needleMark > 0 && d < 700) || (d > 100 && d < 520)) },
  // 离影：雾身的规则和怎么选雾身在 09-actions.js 的「雾身」那一节，数在 src/data/heroes/13-liying.js 的 clone
});
