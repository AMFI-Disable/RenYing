Object.assign(ULTS, {
  // ---- 铁山 · 大招 E：山崩（avalanche） ----
  avalanche: { name: '山崩', desc: '举巨刃蓄势一跃擎天，滞空期间可按方向键自由操控落点（亦可按 S 加速下砸），泰山压顶砸落（185 伤害，不可格挡），地裂石飞。不仅贯穿常规格挡，更可强行轰碎地面绝技霸体！正中命中触发【怒意回涌】：强制震荡晕眩对手（0.9 秒），气量直接回满、可以立刻再放一次山崩，并重置震地与铁壁冲冷却！连放的第二次、只砸到边缘（落点 92 像素外）或砸中倒地的对手，只回 50% 气量。',
    begin(f, foe) {
      f.sp = 'leap'; f.vy = -1050; f.y = -1;
      const c = f.ctrl, dir = (c && c.held && c.held.right ? 1 : 0) - (c && c.held && c.held.left ? 1 : 0);
      f.vx = dir * 360;
      f.spPose = 'ts_lift'; f.invul = 0.3; SFX.heavy();
      f.avaChain = !!f.avaFree; f.avaFree = false;   // 这次是不是打满后连放的那一下
    },
    update(f, foe) {
      if (f.sp === 'leap') {
        const c = f.ctrl;
        if (c && c.held) {
          const dir = (c.held.right ? 1 : 0) - (c.held.left ? 1 : 0);
          if (dir !== 0) {
            f.vx = damp(f.vx, dir * 520, 10, STEP);
            f.face = dir;
          } else {
            f.vx = damp(f.vx, clamp(foe.x - f.x, -260, 260), 7, STEP);   // 没按方向：慢慢朝对手飘过去
          }
          if (c.held.down && f.t > 0.18 && f.vy > -300) {
            f.vy += 1400 * STEP;
          }
        }
        if (Math.random() < 0.35) {
          addP({ type: 'spark', x: f.x - f.face * 18, y: f.y - 65, vx: -f.face * rand(60, 160), vy: rand(-40, 40), life: 0.22, max: 0.22, rgb: '255,200,120', w: 2 });
        }
        f.vy += GRAV * STEP;
        if (f.t > 0.15 && (f.y >= 0 || f.plat >= 0)) {   // 落在山河异境的平台上也算砸到地
          f.sp = 'slam'; f.t = 0; f.vx = 0; f.spPose = 'ts_slam'; f.snap = true;
          shake = 26; flashA = 0.4; flashRGB = '255,210,150'; dust(f.x, 0, 30); ring(f.x, 0, 240, '255,210,150', 0.4); ring(f.x, 0, 150, '255,255,255', 0.3); SFX.ko();
          for (const sd of [-1, 1]) spawnProj(f, { kind: 'quake', x: f.x + sd * 40, y: -22, vx: sd * 500, w: 80, h: 44, life: 0.3, dmg: 0, kb: [0, 0], stun: 0, hs: 0, fx: true, unbreakable: true, groundOnly: true });
          // 强化山崩判定：对地面目标具备绝对压制，即使处于绝技中亦可直接砸中（御空飞行/突进位移除外）
          const foeIsFlying = foe.flying || (foe.ch && foe.ch.id === 'yanling' && foe.y < -80);
          const foeIsDashUlt = foe.state === 'special' && ['dash', 'rush', 'sweep'].includes(foe.sp);
          const canCrushUlt = foe.state === 'special' && !foeIsFlying && !foeIsDashUlt;
          const dx = Math.abs(foe.x - f.x), foeDown = foe.state === 'knockdown' || foe.state === 'getup';   // 倒在地上的人也砸得到
          if (dx < 205 && airH(foe) < 100 && (foe.invul <= 0 || canCrushUlt || foeDown) && !foeIsFlying && !foeIsDashUlt) {
            const dir = foe.x >= f.x ? 1 : -1;
            // 正中（落点 92 像素以内、对手站着）才算打满；砸到边缘或砸倒地的人只回一半气量
            const full = dx < 92.5 && !foeDown;
            if (foeDown) {
              applyHit(f, foe, { dmg: 185, kb: [0, 0], stun: 0, hs: 0.25, unblockable: true, ult: true, noScale: true, noStun: true, dir, big: true }, [foe.x, foe.y - 20]);   // 只掉血，人还躺着
            } else {
              // 打断绝技：判断要在下面把对手改成 hitstun 之前取，不然 foe.state === 'special' 永远不成立
              const wasSpecial = foe.state === 'special';
              const isLeiMingUlt = wasSpecial && foe.ch && foe.ch.id === 'leiming';
              applyHit(f, foe, { dmg: 185, kb: [dir * 140, 0], stun: 0.9, hs: 0.25, root: true, unblockable: true, ult: true, noScale: true, dir, big: true }, [foe.x, foe.y - 40]);
              foe.state = 'hitstun'; foe.stun = 0.9; foe.rooted = true; foe.vx = dir * 80; foe.vy = 0; foe.y = 0;
              // 被打断的绝技要收干净：无敌只有 endSpecial 会清，而它已经不会再跑了。
              // 不清的话被打断的人会带着 99 秒无敌打完这一回合（山崩能打穿绝技就是这个口子）
              if (wasSpecial) { if (!isLeiMingUlt) foe.sp = null; if (foe.invul > 1) foe.invul = 0; }   // 只收掉绝技带的长无敌，短无敌（起身、受身）别动
            }
            const free = full && !f.avaChain;   // 山崩打满：气量回满，能马上再放一次；连放的那一次、砸偏或砸倒地的人只回 50%
            f.meter = free ? 100 : Math.min(100, f.meter + 50); f.avaFree = free;
            f.skillCD = 0; f.skill2CD = 0;
            ring(f.x, f.y - 60, 220, '255,200,120', 0.6);
            addP({ type: 'text', text: free ? '⚡ 怒意回涌 · 再来一次' : '⚡ 怒意回涌 +50% 气量', x: f.x, y: f.y - 130, life: 1.2, max: 1.2, rgb: '255,200,100' });
            if (!foeDown) addP({ type: 'text', text: '💫 震荡晕眩 · 破灭万法', x: foe.x, y: foe.y - 110, life: 1.3, max: 1.3, rgb: '255,220,120' });
            SFX.chargeFull();
          }
          // 地面碎裂：石块向两边飞溅
          for (const sd of [-1, 1]) for (let k = 0; k < 3; k++)
            spawnProj(f, { kind: 'rock', x: f.x + sd * (30 + k * 14), y: -30, vx: sd * (320 + k * 170), vy: -520 + k * 90, g: 1800, lob: true, w: 34, h: 30, life: 1.4, dmg: 35, kb: [220, -300], stun: 0.4, hs: 0.06, launch: true, ult: true, noScale: true, rot: grand(0, 6) });
        }
      } else if (f.sp === 'slam' && f.t >= 0.5) endSpecial(f);
    } },
});
