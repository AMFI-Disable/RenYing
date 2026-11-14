// ======================= 飞行道具 =======================
const projs = [];
let projSeq = 0;
function spawnProj(f, o) {
  if (isClient()) return;   // 联机时由房主生成，加入方从快照同步
  if (scOn()) { o = { src: f.state === 'skill' ? f.skill : f.state === 'special' ? 'ult' : '', ...o }; scProj(f, o); }   // 秘卷：认得出是哪一招放的，也能改它
  if (mayhemOn()) {
    o = { ...o };
    if (o.dmg) o.dmg = Math.round(o.dmg * 2.5);
    if (o.w) o.w = Math.round(o.w * 1.8);
    if (o.h) o.h = Math.round(o.h * 1.8);
    ring(o.x, o.y, 110, f.look.slash || '255,215,80', 0.35);
  }
  const skillProjectile = f.state === 'skill' || (f.state === 'special' && o.ult);
  if ((skillProjectile || o.isWave) && Number.isFinite(o.vx) && Math.abs(o.vx) > 1 && o.life < 1000) {
    if (skillProjectile && !o.noRangeBoost) o.life *= 1.15 * (typeof mapSkillReach === 'function' ? mapSkillReach(f) : 1);
    // Ranged skills and Li Ying's shadow waves travel to the edge on every map, even when that map is wider than their old fixed lifetime.
    if (Number.isFinite(o.x) && Math.abs(o.vy || 0) < Math.abs(o.vx) * 0.45) {
      const edge = o.vx > 0 ? STAGE_W - WALL : WALL;
      const travel = Math.max(0, (edge - o.x) * Math.sign(o.vx));
      o.life = Math.max(o.life, (travel + (o.w || 0)) / Math.abs(o.vx));
    }
  }
  const projectile = Object.assign({ id: ++projSeq, owner: f.idx, vy: 0, life: 1, age: 0, hits: 0, hitCD: 0, delay: 0, isProj: true }, o);
  if (projectile.autoAim) {
    const target = foeOf(f), speed = Math.hypot(projectile.vx || 0, projectile.vy || 0);
    if (target && speed > 0) {
      const authored = Math.atan2(projectile.vy || 0, projectile.vx || 0), base = f.face < 0 ? Math.PI : 0;
      const spread = Math.atan2(Math.sin(authored - base), Math.cos(authored - base));
      const tx = target.x + target.vx * 0.12, ty = target.y - 62 + target.vy * 0.08;
      const angle = Math.atan2(ty - projectile.y, tx - projectile.x) + spread;
      projectile.vx = Math.cos(angle) * speed; projectile.vy = Math.sin(angle) * speed;
      projectile.autoAimTurn = projectile.autoAimTurn || 1.4;
    }
  }
  projs.push(projectile);
  if (f.ch.passive === 'mist' && f.clones && f.clones.length && !o.cloneEcho && !projectile.ult && projectile.dmg) {
    for (const c of f.clones) {
      projs.push(Object.assign({}, projectile, {
        id: ++projSeq, x: projectile.x + c.x - f.x, y: projectile.y + (c.y || 0) - f.y,
        dmg: projectile.dmg * 0.75, cloneEcho: true
      }));
    }
  }
}
function projBox(p) { return [p.x - p.w / 2, p.y - p.h / 2, p.x + p.w / 2, p.y + p.h / 2]; }
const ironBallInvulnerable = f => f.invul > 0 && !(f.onGround() && ['idle', 'walk', 'block', 'blockstun'].includes(f.state));
function resolveYoyoBallHits(p, owner, box) {
  if (!owner || !p.dmg) return;
  const foes = isMulti() ? foesOf(owner) : [foeOf(owner)];
  p.yoyoHitAt = p.yoyoHitAt || {};
  p.yoyoUltDealt = p.yoyoUltDealt || {};
  for (const foe of foes) {
    if (!foe || foe.hp <= 0 || ironBallInvulnerable(foe) || !overlap(box, hurtbox(foe))) continue;
    if ((p.yoyoHitAt[foe.idx] || -99) + (p.yoyoPhase === 'loop' ? 0.72 : 0.3) > p.age) continue;
    const speed = Math.abs(p.vx || 0);
    const speedDmg = clamp(0.8 + speed / 5000, 0.9, 1.45);
    if (p.yoyoPhase === 'ult-pass' || p.yoyoPhase === 'ult-return') {
      const remain = 120 - (p.yoyoUltDealt[foe.idx] || 0);
      if (remain <= 0) continue;
      const dmg = Math.min(p.dmg * speedDmg, remain);
      applyHit(owner, foe, { dmg, kb: [260, -300], stun: 0.32, hs: 0.08, launch: true, ult: true, noScale: true, isProj: true, guardDamage: 24, blockGuardDamage: 12, dir: Math.sign(p.vx) || p.yoyoDir || owner.face, srcX: p.x, backAttack: true }, [p.x, p.y]);
      p.yoyoUltDealt[foe.idx] = (p.yoyoUltDealt[foe.idx] || 0) + dmg;
    } else {
      applyHit(owner, foe, { dmg: p.dmg * speedDmg, kb: [180, -300], stun: p.yoyoPhase === 'lash' ? 0.38 : 0.24, hs: 0.06, launch: foe.ballGuardBreakT > 0, isProj: true, guardDamage: p.yoyoPhase === 'lash' ? 44 : 34, blockGuardDamage: p.yoyoPhase === 'lash' ? 18 : 12, dir: Math.sign(p.vx) || p.yoyoDir || owner.face, srcX: p.x, backAttack: true }, [p.x, p.y]);
    }
    p.yoyoHitAt[foe.idx] = p.age;
    p.hits = (p.hits || 0) + 1;
  }
}
function updateProjs() {
  for (const p of projs) {
    if (p.dead) continue;
    p.age += STEP; p.life -= STEP; p.hitCD -= STEP;
    const wasDelay = p.delay > 0;
    if (p.autoAim && p.delay <= 0) {
      const owner = fighterByIdx(p.owner), target = owner && foeOf(owner), speed = Math.hypot(p.vx || 0, p.vy || 0);
      if (target && target.hp > 0 && speed > 0) {
        const desired = Math.atan2(target.y - 62 - p.y, target.x - p.x), current = Math.atan2(p.vy || 0, p.vx || 0);
        let turn = Math.atan2(Math.sin(desired - current), Math.cos(desired - current));
        turn = clamp(turn, -(p.autoAimTurn || 1.4) * STEP, (p.autoAimTurn || 1.4) * STEP);
        const angle = current + turn;
        p.vx = Math.cos(angle) * speed; p.vy = Math.sin(angle) * speed;
      }
    }
    if (p.track || p.home || p.stick) {
      const tg = foeOf(fighterByIdx(p.owner));
      if (tg && tg.hp > 0) {
        if (p.track && p.delay > (p.trackEnd || 0)) p.x = clamp(damp(p.x, tg.x, p.track, STEP), WALL, STAGE_W - WALL);
        if (p.home && p.delay <= 0) p.vx = damp(p.vx, clamp((tg.x - p.x) * 2, -p.homeV, p.homeV), p.home, STEP);
        if (p.stick && !p.stuck && overlap(projBox(p), hurtbox(tg))) { p.vx *= p.stick; p.stuck = true; }
        else if (p.stick && p.stuck && !overlap(projBox(p), hurtbox(tg))) { p.vx /= p.stick; p.stuck = false; }
      }
    }
    if (p.delay > 0) { p.delay -= STEP; if (p.delay <= 0 && p.kind === 'net') { shake = Math.max(shake, 18); dust(p.x, 0, 22); SFX.thud(); } if (p.delay <= 0 && p.kind === 'popcorn') { SFX.poof(); for (let k = 0; k < 9; k++) { const a = rand(0, 6.28), v = rand(80, 260); addP({ type: 'spark', x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: 0.35, max: 0.35, rgb: k % 3 ? '255,240,200' : '255,200,90', w: 2.2, drag: 2 }); } } if (p.delay <= 0 && p.kind === 'bolt') { if (p.small) { dust(p.x, 0, 8); SFX.thunder(); flashA = Math.max(flashA, 0.1); flashRGB = '255,245,200'; } else boltFX(p); } continue; }
    // Moving enemy projectiles bend gently in Ci Xian's magnetic field.
    if (p.vx && !p.fx) for (const f of allFighters()) {
      if (f.hidden || f.hp <= 0 || !f.ch || f.ch.passive !== 'magnet' || f.idx % 2 === p.owner % 2) continue;
      const dx = f.x - p.x, dy = f.y - 65 - p.y, d = Math.hypot(dx, dy);
      if (d > 20 && d < 420) p.vy += clamp(dy / d * f.pol * 100 * (1 - d / 420), -100, 100) * STEP;
    }
    if (p.kind === 'ironball' && p.yoyo) {
      const owner = fighterByIdx(p.owner), phase = p.yoyoPhase || 'loop';
      if (!owner || owner.hp <= 0) { p.dead = true; continue; }
      const ice = !!(mapNow() && mapNow().ice), qRange = STAGE_W - WALL * 2;
      const arenaMin = WALL + 18, arenaMax = STAGE_W - WALL - 18;
      const gearBoost = p.yoyoBoostT > 0 ? (p.yoyoGearBoost ? 1.4 : 1.25) : 1;
      const loopSpeed = (ice ? 2050 : 2300) * gearBoost;
      p.yoyoBoostT = Math.max(0, (p.yoyoBoostT || 0) - STEP);
      if (phase === 'loop') {
        if (p.yoyoDmgT > 0) { p.yoyoDmgT = Math.max(0, p.yoyoDmgT - STEP); if (!p.yoyoDmgT) { p.dmg = 24; p.yoyoGearBoost = false; } }
        p.yoyoRange = qRange;
        p.yoyoDir = p.yoyoDir || owner.face || 1;
        if (!p.yoyoLeg) p.yoyoLeg = 'out';
        if (p.yoyoLeg === 'return' && Math.abs(p.x - owner.x) < 56) {
          p.yoyoLeg = 'out';
          const facing = owner.face || p.yoyoDir;
          p.yoyoDir = (facing < 0 && owner.x - arenaMin < 56) || (facing > 0 && arenaMax - owner.x < 56) ? -facing : facing;
          p.yoyoCycle = (p.yoyoCycle || 0) + 1;
        }
        if (p.yoyoLeg === 'out' && Math.abs(p.x - owner.x) >= qRange - 8) p.yoyoLeg = 'return';
        p.vx = (p.yoyoLeg === 'return' ? Math.sign(owner.x - p.x) || -p.yoyoDir : p.yoyoDir) * loopSpeed;
        p.vy = clamp((owner.y - 58 - p.y) * 6, -300, 300);
      } else if (phase === 'lash') {
        p.yoyoRange = qRange;
        p.vx = (p.yoyoDir || owner.face) * 2700;
        p.vy = clamp((owner.y - 58 - p.y) * 3, -180, 180);
        p.yoyoActionT -= STEP;
        if (p.yoyoActionT <= 0 || Math.abs(p.x - owner.x) >= qRange) { p.yoyoPhase = 'loop'; p.yoyoLeg = 'return'; p.yoyoActionT = 0; }
      } else if (phase === 'ult-pass') {
        p.yoyoRange = STAGE_W;
        p.vx = (p.yoyoDir || owner.face) * 2700;
        p.vy = clamp((owner.y - 58 - p.y) * 4, -320, 320);
        if (p.x <= arenaMin + 8 || p.x >= arenaMax - 8) {
          p.x = clamp(p.x, arenaMin, arenaMax); p.yoyoPasses = (p.yoyoPasses || 0) + 1;
          if (p.yoyoPasses >= 3) p.yoyoPhase = 'ult-return'; else p.yoyoDir *= -1;
        }
      } else if (phase === 'ult-return') {
        const dx = owner.x - p.x;
        p.yoyoRange = STAGE_W; p.vx = (Math.sign(dx) || 1) * 2700;
        p.vy = clamp((owner.y - 58 - p.y) * 5, -400, 400);
        if (Math.abs(dx) < 52) { p.yoyoArrived = true; p.vx = 0; p.vy = 0; }
      }
      p.g = 0; p.resting = false; p.speedTier = Math.abs(p.vx) > 1900 ? 3 : Math.abs(p.vx) > 900 ? 2 : 1;
    } else if (p.g) p.vy += p.g * STEP;
    if (p.kind === 'ironball' && !p.yoyo) {
      // 玄铁傀丸专属物理：永动反弹、金丝牵引回弹与传动加速
      if (p.recalling) {
        // 大招收球中：直线贯穿，不受重力与反弹限制
      } else {
        const floorY = -18;
        if (p.y >= floorY) {
          p.y = floorY;
          const terrainMap = mapNow(), ballOwner = fighterByIdx(p.owner), ice = terrainMap && terrainMap.ice;
          // 触地弹性高反弹，保持充沛动能
          const minVy = -260;
          if (p.vy > 60 || Math.abs(p.vy) > 80) {
            const eavesBonus = terrainMap === MAPS.pagoda && mapFavOn(ballOwner) && ballOwner.ch.id === 'qianji';
            p.vy = -Math.abs(p.vy) * (eavesBonus ? 0.99 : 0.92);
            if (p.vy > minVy) p.vy = minVy;
            p.vx *= ice ? (mapFavOn(ballOwner) && ballOwner.ch.id === 'qianji' ? 0.99 : 0.985) : 0.975;
            p.bounceCount = (p.bounceCount || 0) + 1;
            dust(p.x, 0, 7); ring(p.x, 0, 36, '235,165,70', 0.18); SFX.ballHit();
          } else {
            // 贴地滚动时保留弹跳机能，受金丝牵拉轻微浮起
            p.vy = minVy * 0.6;
            p.vx *= ice ? (mapFavOn(ballOwner) && ballOwner.ch.id === 'qianji' ? 0.99 : 0.985) : 0.96;
          }
        }
        // 墙壁弹性高反弹（保留 94% 水平动能并获得轻微上弹）
        if (p.x + p.vx * STEP <= WALL + 18) {
          p.x = WALL + 18;
          p.vx = Math.max(520, Math.abs(p.vx) * 0.94);
          p.vy = Math.min(p.vy, -160);
          ring(p.x, p.y, 42, '235,165,70', 0.25); SFX.ballHit();
        } else if (p.x + p.vx * STEP >= STAGE_W - WALL - 18) {
          p.x = STAGE_W - WALL - 18;
          p.vx = -Math.max(520, Math.abs(p.vx) * 0.94);
          p.vy = Math.min(p.vy, -160);
          ring(p.x, p.y, 42, '235,165,70', 0.25); SFX.ballHit();
        }

        // 天工金丝弹性牵引回弹机制（Golden Silk Tension Return）：
        // 随着傀丸飞离主人，金丝产生轻柔弹簧牵引力将球拉回主人方向，便于主人连环击球形成对拉
        const owner = fighterByIdx(p.owner);
        if (owner && owner.hp > 0) {
          const dx = owner.x - p.x;
          const dist = Math.abs(dx);
          if (dist > 140) {
            // 距离越远，金丝拉力适度增强；飞离主人时减速更快，返程时加速送回主人身前
            const pullDir = Math.sign(dx);
            const springK = p.vx * pullDir < 0 ? 560 : 320; // 背向飞离拉力更明显
            p.vx += pullDir * springK * STEP;
          }
          // 速度极低时保持最低活跃动能，不轻易停滞
          if (Math.abs(p.vx) < 120) {
            p.vx = (Math.sign(dx) || 1) * 160;
          }
        }

        p.speedTier = Math.abs(p.vx) > 1300 ? 3 : Math.abs(p.vx) > 420 ? 2 : 1;
        p.resting = false;
      }
    }
    if (p.boomer && p.age > p.turn) {
      const o = fighterByIdx(p.owner), dx = o.x - p.x;
      p.vx = damp(p.vx, Math.sign(dx) * 860, 7, STEP); p.vy = damp(p.vy, (o.y - 65 - p.y) * 4, 7, STEP);
      if (Math.abs(dx) < 34 && p.age > p.turn + 0.15) { p.dead = true; continue; }
    }
    p.x += p.vx * STEP; p.y += p.vy * STEP;
    if (p.kind === 'ironball' && !p.recalling) {
      p.x = clamp(p.x, WALL + 18, STAGE_W - WALL - 18);
    }
    mapWindProj(p);   // 竹海悬岩的风
    if (p.kind === 'ironball' && p.yoyo) {
      const owner = fighterByIdx(p.owner), range = p.yoyoRange || 600;
      const wallL = WALL + 18, wallR = STAGE_W - WALL - 18;
      p.x = clamp(p.x, wallL, wallR);
      if (owner && p.yoyoPhase === 'loop' && ((p.x <= wallL && p.vx < 0) || (p.x >= wallR && p.vx > 0))) {
        p.yoyoLeg = 'return'; p.yoyoDir = Math.sign(owner.x - p.x) || (p.x <= wallL ? 1 : -1);
        ring(p.x, p.y, 42, '235,165,70', 0.25); SFX.ballHit();
      } else if (owner && p.yoyoPhase === 'lash' && ((p.x <= wallL && p.vx < 0) || (p.x >= wallR && p.vx > 0))) {
        p.yoyoPhase = 'loop'; p.yoyoLeg = 'return'; p.yoyoActionT = 0;
        p.yoyoDir = Math.sign(owner.x - p.x) || (p.x <= wallL ? 1 : -1);
        ring(p.x, p.y, 42, '235,165,70', 0.25); SFX.ballHit();
      }
      if (owner && (p.yoyoPhase === 'loop' || p.yoyoPhase === 'lash')) p.x = clamp(p.x, Math.max(wallL, owner.x - range), Math.min(wallR, owner.x + range));
      p.y = clamp(p.y, -560, -24);
    }
    if (p.grow) { p.w += p.grow * STEP; p.h += p.grow * STEP; }
    if (p.lob && p.y >= -8) { p.dead = true; for (let i = 0; i < 10; i++) addP({ type: 'ink', x: p.x, y: -4, vx: rand(-160, 160), vy: rand(-200, -40), g: 1400, life: 0.5, max: 0.5, r: rand(2, 4), rgb: '15,15,22' }); continue; }
    if (p.kind === 'dragon' || p.kind === 'tornado' || p.kind === 'wind') { if (Math.random() < 0.6) addP({ type: 'ink', x: p.x - Math.sign(p.vx) * p.w * 0.4, y: p.y + rand(-p.h / 3, p.h / 3), vx: -p.vx * 0.1, vy: rand(-40, 40), life: 0.5, max: 0.5, r: rand(2, 5), rgb: p.kind === 'dragon' ? '20,20,28' : CHARS[fighterByIdx(p.owner).chIdx].look.slash }); }
    if (p.life <= 0 || p.x < -300 || p.x > STAGE_W + 300) { p.dead = true; continue; }
    if (p.fx || p.dmg <= 0) continue;
    const owner = fighterByIdx(p.owner), box = projBox(p);
    if (p.kind === 'ironball' && p.yoyo) { resolveYoyoBallHits(p, owner, box); hitClones(box, p.owner, p.dmg); continue; }
    const candidates = isMulti() ? foesOf(owner) : [foeOf(owner)];
    let foe = candidates.find(ef => ef.hp > 0 && overlap(box, hurtbox(ef))) || candidates[0];
    // 斩弹：对手的刀砍中飞行道具就把它打散
    if (!p.unbreakable && foe.state === 'attack' && foe.move && foe.t >= foe.move.su && foe.t < foe.move.su + foe.move.ac && overlap(hitbox(foe, foe.move.box), box)) {
      p.dead = true; blockFX(p.x, p.y, foe.face); SFX.block();
      foe.meter = Math.min(100, foe.meter + 1.5);
      addP({ type: 'text', text: '斩', x: p.x, y: p.y - 30, life: 0.5, max: 0.5, rgb: foe.look.slash }); continue;
    }
    hitClones(box, p.owner, p.dmg);
    if (hitDecoyBox(box, p.owner)) { if (!p.pierce) p.dead = true; continue; }
    if (p.hitCD > 0 || (p.kind === 'ironball' ? ironBallInvulnerable(foe) : foe.invul > 0) || foe.hp <= 0) continue;
    if ((p.groundOnly || p.kind === 'quake') && (foe.y < -16 || foe.flying)) continue;
    if (!overlap(box, hurtbox(foe))) continue;
    if (p.feast) {   // 与民同乐：砸中就得陪着喝
      p.dead = true;
      if (!isClient()) {
        foe.hp = Math.min(foe.maxHp, foe.hp + Math.round(85 * HERO_HP_SCALE));
        foe.state = 'hitstun'; foe.t = 0; foe.stun = 1.0; foe.drinkT = 1.0; foe.vx = 0; foe.move = null; foe.skill = null; foe.sp = null; foe.rooted = true;
      }
      SFX.drink(); addP({ type: 'text', text: '与民同乐 · 干！', x: foe.x, y: foe.y - 130, life: 1.0, max: 1.0, rgb: '255,190,90' });
      addP({ type: 'text', text: `+${Math.round(85 * HERO_HP_SCALE)}`, x: foe.x, y: foe.y - 105, life: 0.8, max: 0.8, rgb: '130,230,140' });
      continue;
    }
    // 玉箫回音壁：把飞行道具原路弹回去
    if (foe.reflectT > 0 && !p.ult && !p.groundOnly && !['trap', 'bolt', 'quake', 'dragon', 'tornado', 'net', 'chord', 'pavilion', 'popcorn'].includes(p.kind)) {
      p.owner = foe.idx; p.vx = -p.vx || foe.face * 700; p.vy = -p.vy * 0.4; p.hits = 0; p.hitCD = 0.05; p.life = Math.max(p.life, 0.8);
      p.boomer = false; p.lob = false; p.g = 0; p.sk = true; p.hook = false;
      foe.notes = Math.min(3, (foe.notes || 0) + 1);
      ring(p.x, p.y, 60, foe.look.slash, 0.25); SFX.parry();
      addP({ type: 'text', text: '回音', x: p.x, y: p.y - 30, life: 0.6, max: 0.6, rgb: foe.look.slash }); continue;
    }
    // 霸体吃掉飞行道具
    if (foe.armorT > 0 && !p.ult) {
      p.dead = true; ring(p.x, p.y, 50, '255,215,120', 0.25); SFX.block();
      if (foe.ch.passive === 'armor') {
        foe.meter = Math.min(100, foe.meter + 3);
        foe.skillCD = Math.max(0, foe.skillCD - 0.3);
        foe.skill2CD = Math.max(0, foe.skill2CD - 0.3);
      }
      addP({ type: 'text', text: '霸体', x: foe.x, y: foe.y - 130, life: 0.6, max: 0.6, rgb: '255,215,120' }); continue;
    }
    p.dir = p.vx !== 0 ? Math.sign(p.vx) : (foe.x >= p.x ? 1 : -1); p.srcX = p.x - p.dir * 10;
    let hitM = p.lastBig && p.hits === (p.maxHits || 1) - 1 ? { ...p, kb: [420, -780], hs: 0.14, big: true } : p;
    if (p.kind === 'moonring') {
      const returning = p.boomer && p.age > p.turn;
      if (returning) {
        hitM = { ...p, dmg: 38, stun: 0.78, hs: 0.12, launch: true, kb: [180, -580], big: true };
        addP({ type: 'text', text: '背袭破防', x: foe.x, y: foe.y - 100, life: 0.8, max: 0.8, rgb: '230,200,255' });
      } else {
        hitM = { ...p, dmg: 28, stun: 0.25, hs: 0.04, launch: false, kb: [100, 0] };
      }
    } else if (p.kind === 'inkblob') {
      foe.slowT = 2.5;
      addP({ type: 'text', text: '墨迹遮目', x: foe.x, y: foe.y - 100, life: 0.9, max: 0.9, rgb: '160,160,190' });
    } else if (p.kind === 'note' && p.notes >= 3) {
      foe.slowT = 2.2;
      addP({ type: 'text', text: '绕梁 · 失律', x: foe.x, y: foe.y - 100, life: 0.9, max: 0.9, rgb: '150,240,200' });
    } else if (p.kind === 'spindle' || p.mark) {
      addNeedleMark(foe, 1);
    }
    applyHit(owner, foe, hitM, [clamp(foe.x, box[0], box[2]), clamp(foe.y - 60, box[1], box[3])]);
    const struck = foe.hp > 0 && (foe.state === 'hitstun' || foe.state === 'launched');
    if (p.burn && struck) { foe.burnT = 2; addP({ type: 'text', text: '酒火灼身', x: foe.x, y: foe.y - 110, life: 0.8, max: 0.8, rgb: '255,150,60' }); }
    if (p.jail && foe.hp > 0 && !isClient()) {   // 醉翁亭落下：留客 1 秒
      foe.jailT = 1.0; foe.jailX = clamp(foe.x, WALL + 30, STAGE_W - WALL - 30);
      shake = Math.max(shake, 12); dust(foe.x, 0, 16); SFX.thud();
      addP({ type: 'text', text: '醉翁亭 · 留客片刻', x: foe.x, y: foe.y - 290, life: 1.1, max: 1.1, rgb: '255,190,90' });
    }
    if (p.hook && struck && !isClient()) {   // 勾陈飞锤：扯链拽到身前
      foe.x = clamp(owner.x + owner.face * 72, WALL, STAGE_W - WALL); foe.y = 0; foe.vx = 0; foe.vy = 0;
      foe.state = 'hitstun'; foe.t = 0; foe.stun = Math.max(foe.stun || 0, 0.42); foe.hookedT = 1.2;
      dust(foe.x, 0, 6); SFX.heavy();
    }
    p.hits++; p.hitCD = p.rehit || 99;
    if (p.kind === 'ironball') {
      // 玄铁傀丸永不消散（只有千机大招收回时才销毁）
    } else if (!p.pierce || p.hits >= (p.maxHits || 1)) p.dead = true;
  }
  // 双方远程弹道相撞相抵（Projectile Clashing）：两方飞射物在空中交错时互相抵消消散（排除地面震波、落雷、陷阱与结构物）
  const NO_CLASH = ['quake', 'bolt', 'trap', 'pavilion', 'chord', 'net', 'popcorn'];
  for (let i = 0; i < projs.length; i++) {
    const p1 = projs[i];
    if (p1.dead || p1.dmg <= 0 || p1.groundOnly || NO_CLASH.includes(p1.kind)) continue;
    const b1 = projBox(p1);
    for (let j = i + 1; j < projs.length; j++) {
      const p2 = projs[j];
      if (p2.dead || p2.dmg <= 0 || p1.owner === p2.owner || p2.groundOnly || NO_CLASH.includes(p2.kind)) continue;
      const b2 = projBox(p2);
      if (overlap(b1, b2)) {
        // 高速玄铁傀丸撞碎普通飞行道具
        if (p1.kind === 'ironball' && p1.speedTier >= 2 && !p2.ult && !p2.unbreakable) {
          p2.dead = true;
          const cx = p2.x, cy = p2.y;
          ring(cx, cy, 50, '255,220,130', 0.2);
          for (let k = 0; k < 4; k++) addP({ type: 'spark', x: cx, y: cy, vx: rand(-140, 140), vy: rand(-140, 140), rgb: '255,220,130', life: 0.15, max: 0.15 });
          SFX.block(); addP({ type: 'text', text: '碾碎', x: cx, y: cy - 20, life: 0.4, max: 0.4, rgb: '255,220,130' });
          continue;
        }
        if (p2.kind === 'ironball' && p2.speedTier >= 2 && !p1.ult && !p1.unbreakable) {
          p1.dead = true;
          const cx = p1.x, cy = p1.y;
          ring(cx, cy, 50, '255,220,130', 0.2);
          for (let k = 0; k < 4; k++) addP({ type: 'spark', x: cx, y: cy, vx: rand(-140, 140), vy: rand(-140, 140), rgb: '255,220,130', life: 0.15, max: 0.15 });
          SFX.block(); addP({ type: 'text', text: '碾碎', x: cx, y: cy - 20, life: 0.4, max: 0.4, rgb: '255,220,130' });
          break;
        }
        if (p1.unbreakable || p2.unbreakable || p1.ult || p2.ult) continue;
        p1.dead = true; p2.dead = true;
        const cx = (p1.x + p2.x) / 2, cy = (p1.y + p2.y) / 2;
        ring(cx, cy, 60, '255,220,130', 0.25);
        for (let k = 0; k < 5; k++) addP({ type: 'spark', x: cx, y: cy, vx: rand(-160, 160), vy: rand(-160, 160), rgb: '255,220,130', life: 0.18, max: 0.18 });
        SFX.block();
        addP({ type: 'text', text: '破', x: cx, y: cy - 20, life: 0.45, max: 0.45, rgb: '255,220,130' });
        break;
      }
    }
  }
  for (let i = projs.length - 1; i >= 0; i--) if (projs[i].dead) projs.splice(i, 1);
}
function boltFX(p) { shake = Math.max(shake, 10); flashA = Math.max(flashA, 0.35); flashRGB = '255,245,200'; dust(p.x, 0, 12); ring(p.x, 0, 90, '255,240,150', 0.3); SFX.thunder(); }
