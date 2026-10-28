// ======================= 大招（E） =======================
// flurry 类型沿用“冲刺后乱斩”的流程，其它类型用 begin / update 自己写
const ULTS = {
  crescent: { name: '残月', flurry: true, n: 6, iv: 0.1, slash: 14, fin: 85, land: true, desc: '纳刀起手，一记居合突刺撕开战局；既已斩中，六道残月剑气接踵绞杀，最后自空中劈落就地了断（终结斩85伤害）。终结斩落触发【剑意通明】：重置全技能与冲刺冷却，并回涌 20% 绝技气量。若突刺落空，门户大开。' },
  shadows: { name: '千影', flurry: true, n: 9, iv: 0.068, slash: 11, fin: 80, desc: '结印潜入暗影，贴地瞬步欺身而入；一击得手，九道猩红残像接连绝杀，收于双刃十字（终结斩80伤害）。绝杀达成触发【暗影绝杀】：重置影瞬与手里剑冷却，并幻化多道迷惑分身隐匿遁形。一旦扑空，任人宰割。' },
  avalanche: { name: '山崩', desc: '举巨刃蓄势一跃擎天，滞空期间可按方向键自由操控落点（亦可按 S 加速下砸），泰山压顶砸落（185 伤害，不可格挡），地裂石飞。不仅贯穿常规格挡，更可强行轰碎地面绝技霸体！正中命中触发【怒意回涌】：强制震荡晕眩对手（1.3 秒），气量直接回满、可以立刻再放一次山崩，并重置震地与铁壁冲冷却！连放的第二次、只砸到边缘（落点 92 像素外）或砸中倒地的对手，只回 50% 气量。',
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
            f.vx = damp(f.vx, 0, 7, STEP);
          }
          if (c.held.down && f.t > 0.18 && f.vy > -300) {
            f.vy += 1400 * STEP;
          }
        }
        if (Math.random() < 0.35) {
          addP({ type: 'spark', x: f.x - f.face * 18, y: f.y - 65, vx: -f.face * rand(60, 160), vy: rand(-40, 40), life: 0.22, max: 0.22, rgb: '255,200,120', w: 2 });
        }
        f.vy += GRAV * STEP;
        if (f.t > 0.15 && f.y >= 0) {
          f.sp = 'slam'; f.t = 0; f.vx = 0; f.spPose = 'ts_slam'; f.snap = true;
          shake = 26; flashA = 0.4; flashRGB = '255,210,150'; dust(f.x, 0, 30); ring(f.x, 0, 240, '255,210,150', 0.4); ring(f.x, 0, 150, '255,255,255', 0.3); SFX.ko();
          for (const sd of [-1, 1]) spawnProj(f, { kind: 'quake', x: f.x + sd * 40, y: -22, vx: sd * 500, w: 80, h: 44, life: 0.3, dmg: 0, kb: [0, 0], stun: 0, hs: 0, fx: true, unbreakable: true, groundOnly: true });
          // 强化山崩判定：对地面目标具备绝对压制，即使处于绝技中亦可直接砸中（御空飞行/突进位移除外）
          const foeIsFlying = foe.flying || (foe.ch && foe.ch.id === 'yanling' && foe.y < -80);
          const foeIsDashUlt = foe.state === 'special' && ['dash', 'rush', 'sweep'].includes(foe.sp);
          const canCrushUlt = foe.state === 'special' && !foeIsFlying && !foeIsDashUlt;
          const dx = Math.abs(foe.x - f.x), foeDown = foe.state === 'knockdown' || foe.state === 'getup';   // 倒在地上的人也砸得到
          if (dx < 185 && foe.y > -80 && (foe.invul <= 0 || canCrushUlt || foeDown) && !foeIsFlying && !foeIsDashUlt) {
            const dir = foe.x >= f.x ? 1 : -1;
            // 正中（落点 92 像素以内、对手站着）才算打满；砸到边缘或砸倒地的人只回一半气量
            const full = dx < 92.5 && !foeDown;
            if (foeDown) {
              applyHit(f, foe, { dmg: 185, kb: [0, 0], stun: 0, hs: 0.25, unblockable: true, ult: true, noScale: true, noStun: true, dir, big: true }, [foe.x, foe.y - 20]);   // 只掉血，人还躺着
            } else {
              const isLeiMingUlt = foe.ch && foe.ch.id === 'leiming' && foe.state === 'special';
              applyHit(f, foe, { dmg: 185, kb: [dir * 140, 0], stun: 1.3, hs: 0.25, root: true, unblockable: true, ult: true, noScale: true, dir, big: true }, [foe.x, foe.y - 40]);
              foe.state = 'hitstun'; foe.stun = 1.3; foe.rooted = true; foe.vx = dir * 80; foe.vy = 0; foe.y = 0;
              if (!isLeiMingUlt && foe.state === 'special') {
                foe.sp = null; // 打断地面常规绝技蓄势
              }
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
  phoenix: { name: '百鸟朝凤', desc: '原地凝枪，向前连刺八道枪影，一枪远过一枪，末枪一挑把人送上半空（终结75伤害）。此招可挡。',
    begin(f) { f.sp = 'thrusts'; f.spN = 0; f.spPose = 'ls_stance'; f.invul = 0.2; },
    update(f, foe) {
      const n = Math.floor(f.t / 0.09);
      if (n >= f.spN && f.spN < 8) {
        const last = f.spN === 7; f.spN++;
        f.spPose = last ? 'ls_plant' : (f.spN % 2 ? 'ls_thrust' : 'ls_stance'); f.snap = true;
        slashLine(f.x + f.face * 130, f.y - 68 + rand(-18, 18), 0, f.look.slash); SFX.slice();
        if (foe.invul <= 0 && foe.hp > 0 && overlap(hitbox(f, [20, -112, 240, -28]), hurtbox(foe)))
          applyHit(f, foe, last ? { dmg: 75, kb: [520, -640], stun: 0.6, hs: 0.18, launch: true, big: true, ult: true, noScale: true }
                                : { dmg: 16, kb: [50, 0], stun: 0.36, hs: 0.03, ult: true, noScale: true }, [foe.x - f.face * 10, foe.y - 68]);
      }
      if (f.t >= 0.95) endSpecial(f);
    } },
  timestop: { name: '刹那', desc: '长枪拄地，凝神入定，天地为之一滞。漫天枪影泼洒开来，终归于一线寒芒，极速贯穿（140 到 185 伤害）。贯穿得手触发【寒霜贯日】：重置回马枪与枪旋冷却，并令对手陷入 4 秒冰冻迟缓（移速减慢 40%）。',
    begin(f, foe) { f.sp = 'stop'; f.spPose = 'ls_stance'; f.invul = 99; superFreeze = 0.9; superOwner = f; f.spX = f.x; f.hitDone = false; SFX.superOn(); },
    update(f, foe) {
      if (f.sp === 'stop' && f.t >= 0.45) {
        f.sp = 'sweep'; f.spPose = 'ls_thrust'; f.snap = true;
        for (let k = 0; k < 8; k++) slashLine(f.x, f.y - 60, k * Math.PI / 8, f.look.slash);
        ring(f.x, f.y - 60, 160, f.look.slash, 0.4); ring(f.x, f.y - 60, 90, '255,255,255', 0.3); SFX.slice(); metal(1800, 0.8, 0.1);
      }
      if (f.sp === 'sweep' && f.t >= 0.8) { f.sp = 'rush'; f.t = 0; f.spPose = 'ls_thrust'; f.face = faceDir(f, foe); f.spX = f.x; SFX.dash(); }
      if (f.sp === 'rush') {
        f.vx = f.face * 1700;
        if (!f.hitDone && foe.hp > 0 && overlap(hitbox(f, [0, -120, 90, 4]), hurtbox(foe))) {
          f.hitDone = true; f.vx = 0;
          const dmg = clamp(140 + Math.abs(f.x - f.spX) / 10, 140, 185);
          applyHit(f, foe, { dmg: Math.round(dmg), kb: [480, -700], stun: 0.6, hs: 0.2, launch: true, unblockable: true, big: true, ult: true, noScale: true }, [foe.x, foe.y - 60]);
          f.skillCD = 0; f.skill2CD = 0;
          foe.slowT = 4.0;
          ring(foe.x, foe.y - 60, 160, '170,220,255', 0.5);
          addP({ type: 'text', text: '❄️ 寒芒贯日 · 回马枪重置', x: f.x, y: f.y - 120, life: 1.1, max: 1.1, rgb: '170,220,255' });
          addP({ type: 'text', text: '❄️ 冰冻减速', x: foe.x, y: foe.y - 100, life: 1.2, max: 1.2, rgb: '140,200,255' });
          f.sp = 'done'; f.t = 0; f.spPose = 'ls_plant';
          SFX.chargeFull();
        } else if (f.t > 0.8 || f.x <= WALL || f.x >= STAGE_W - WALL) { f.sp = 'done'; f.t = 0; f.vx *= 0.2; f.spPose = 'ls_plant'; }
      }
      if (f.sp === 'done' && f.t >= 0.3) endSpecial(f);
    } },
  tornado: { name: '龙卷', desc: '舒袖展扇，乘风而起，放出两道接天龙卷横扫全场（每下 16 伤害）。施法激活【扶摇万里】：重置风刃与开扇冷却，空中跳跃次数全额回满，乘风浮空。',
    begin(f) {
      f.sp = 'cast'; f.spPose = 'ly_fanswipe'; f.invul = 0.2; f.spN = 0;
      f.skillCD = 0; f.skill2CD = 0; f.jumps = 0;
      addP({ type: 'text', text: '🌪️ 扶摇万里 · 开扇重置', x: f.x, y: f.y - 120, life: 1.1, max: 1.1, rgb: '150,255,200' });
      SFX.superOn();
    },
    update(f) {
      if (f.spN < 2 && f.t >= f.spN * 0.45) {
        const second = f.spN === 1; f.spN++;
        f.spPose = second ? 'ly_hover' : 'ly_fanswipe';
        spawnProj(f, { kind: 'tornado', x: f.x + f.face * 70, y: -110, vx: f.face * 360, w: 120, h: 230, life: 2.4, dmg: 16, kb: [40, -220], stun: 0.4, hs: 0.03, pierce: true, rehit: 0.12, maxHits: 8, launch: true, ult: true, unbreakable: true, noScale: true, lastBig: second });
        SFX.swing();
      }
      if (f.t >= 0.85) endSpecial(f);
    } },
  thunder: { name: '雷霆万钧', desc: '一拳击破长空，引落九天神雷。三道天雷循着对手踪迹直劈而下（每道 48 伤害，破防击飞）。引雷触发【雷帝灌顶】：重置奔雷拳与撼地冷却，自身直接回涌 30% 绝技气量！',
    begin(f) {
      f.sp = 'cast'; f.spN = 0; f.spPose = 'lm_kick'; f.invul = 0.2;
      f.skillCD = 0; f.skill2CD = 0; f.meter = Math.min(100, f.meter + 30);
      addP({ type: 'text', text: '⚡ 雷帝灌顶 · 拳劲重置', x: f.x, y: f.y - 120, life: 1.1, max: 1.1, rgb: '255,230,120' });
      SFX.superOn();
    },
    update(f, foe) {
      const times = [0.02, 0.38, 0.74];
      if (f.spN < 3 && f.t >= times[f.spN]) {
        f.spN++;
        f.spPose = f.spN % 2 ? 'lm_boxer' : 'lm_kick';
        spawnProj(f, { kind: 'bolt', x: clamp(foe.x + foe.vx * 0.2, WALL, STAGE_W - WALL), y: -360, vx: 0, w: 76, h: 720, life: 0.62, delay: 0.46, dmg: 48, kb: [0, -620], stun: 0.5, hs: 0.1, launch: true, unblockable: true, ult: true, unbreakable: true, noScale: true });
      }
      if (f.t >= 1.2) endSpecial(f);
    } },
  inkdragon: { name: '符阵', desc: `把攒下的符全部烧掉：整张图化作一张宣纸，全场一览无余，对手被朱砂染红，头顶的符轰然炸开。全图命中、不可格挡，伤害 = ${FU_BASE} + 每张符 ${FU_PER}（最多 ${FU_BASE + FU_PER * FU_MAX}）。`,
    begin(f) {
      f.sp = 'cast'; f.spPose = 'my_stroke'; f.invul = 0.2; SFX.superOn();
      f.spN = f.fu || 0; f.fu = 0;   // 符全部烧掉，记下这次烧了几张
    },
    update(f, foe) {
      if (f.t >= 0.25) f.spPose = 'my_paint';
      const foes = foesOf(f).filter(e => e && e.hp > 0);   // 全图命中：2v2 里两个对手都会炸
      const wait = foes.some(e => e.invul > 0) && f.t < 2.4;   // 对手正无敌（比如也在放大招）就等它结束再炸，最多多等一秒多
      if (f.t >= 0.95 && !f.hitDone && !wait) {
        f.hitDone = true; f.fuT = f.t;
        const n = f.spN || 0;
        if (foes.length) { shake = Math.max(shake, 14 + n * 3); flashA = Math.max(flashA, 0.35); flashRGB = '230,70,50'; SFX.ko(); }
        for (const e of foes) {
          const x = e.x, y = e.y - 150;
          ring(x, y, 90 + n * 18, '230,70,50', 0.5); ring(x, y, 50, '255,230,150', 0.4);
          for (let k = 0; k < 18 + n * 4; k++) { const a = rand(0, 6.28), v = rand(120, 420); addP({ type: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.6, max: 0.6, rgb: k % 2 ? '235,200,90' : '230,70,50', w: 2.4, drag: 2 }); }
          if (e.invul <= 0) applyHit(f, e, { dmg: FU_BASE + FU_PER * n, kb: [0, -520], stun: 0.6, hs: 0.2, launch: true, unblockable: true, big: true, ult: true, noScale: true, dir: e.face * -1 }, [e.x, e.y - 80]);
          addP({ type: 'text', text: n ? `符爆 ×${n}` : '空符一张', x: e.x, y: e.y - 200, life: 1.1, max: 1.1, rgb: '230,70,50' });
        }
      }
      if (f.hitDone && f.t >= (f.fuT || 0.95) + 0.5) endSpecial(f);
    } },
  featherstorm: { name: '万羽', desc: '展翼直上九霄，唤来漫天破甲翎羽如暴雨倾泻（14 枚，每枚 14 伤害）。齐射触发【凌霄破虚】：重置俯冲突袭与翎羽射击冷却，御空飞行耐力全额回满。',
    begin(f) {
      f.sp = 'cast'; f.spN = 0; f.spPose = 'yl_wings'; f.invul = 0.2;
      f.skillCD = 0; f.skill2CD = 0; f.flyT = f.ch.fly || 1.2;
      addP({ type: 'text', text: '🪶 凌霄破虚 · 俯冲重置', x: f.x, y: f.y - 120, life: 1.1, max: 1.1, rgb: '140,190,255' });
      SFX.superOn();
    },
    update(f, foe) {
      const n = Math.floor(f.t / 0.07);
      if (n >= f.spN && f.spN < 14) {
        f.spN++;
        f.spPose = f.spN % 2 ? 'yl_wings' : 'a1a';
        spawnProj(f, { kind: 'feather', x: clamp(foe.x + grand(-150, 150), WALL, STAGE_W - WALL), y: -620, vx: grand(-60, 60), vy: 1100, w: 22, h: 40, life: 1.2, dmg: 14, kb: [40, 0], stun: 0.3, hs: 0.02, ult: true, noScale: true, unbreakable: true });
      }
      if (f.t >= 1.1) endSpecial(f);
    } },
  moonflow: { name: '月华如水', desc: '双手结月印，盘坐入定。月华凝露，回复 100 点生命；月芒震退贴身之敌（75 伤害）。绽放触发【太阴化生】：重置月镜架招与月轮回旋冷却，并获得 4 秒月魄霸体护盾（格挡硬直减伤）。',
    begin(f) {
      f.sp = 'wave'; f.spPose = 'yh_lotus'; f.invul = 0.5; f.hp = Math.min(f.maxHp, f.hp + 100); f.hitDone = false;
      f.skillCD = 0; f.skill2CD = 0; f.armorT = 4.0; f.armorHits = 3;
      ring(f.x, f.y - 60, 260, f.look.slash, 0.5); ring(f.x, f.y - 60, 180, '255,255,255', 0.4);
      addP({ type: 'text', text: '+100', x: f.x, y: f.y - 130, life: 0.9, max: 0.9, rgb: '180,255,200' });
      addP({ type: 'text', text: '🌙 月魄霸体 · 架招重置', x: f.x, y: f.y - 150, life: 1.1, max: 1.1, rgb: '215,195,255' });
      SFX.chargeFull();
    },
    update(f, foe) {
      if (f.t >= 0.1 && !f.hitDone) {
        f.hitDone = true;
        if (Math.abs(foe.x - f.x) < 260 && Math.abs(foe.y - f.y) < 200 && foe.invul <= 0)
          applyHit(f, foe, { dmg: 75, kb: [460, -640], stun: 0.6, hs: 0.15, launch: true, big: true, ult: true, noScale: true, dir: foe.x >= f.x ? 1 : -1 }, [foe.x, foe.y - 60]);
      }
      if (f.t >= 0.55) endSpecial(f);
    } },
  guangling: { name: '广陵散', desc: '奏一曲广陵散：六道音刃从左右两侧轮番穿过对手（每道 14 伤害），曲终一记【绝响】从对手脚下炸开（60 伤害，身上每枚音律再 +15，不可格挡，挑空）。曲罢音律回满，清音冷却清零。',
    begin(f) { f.sp = 'cast'; f.spN = 0; f.spPose = 'yx_play'; f.invul = 0.3; SFX.superOn(); },
    update(f, foe) {
      const T = [0.05, 0.2, 0.35, 0.5, 0.65, 0.8];
      if (f.spN < 6 && f.t >= T[f.spN]) {
        const sd = f.spN % 2 ? 1 : -1; f.spN++;
        f.spPose = f.spN % 2 ? 'yx_play' : 'yx_push'; SFX.note(f.spN % 4);
        spawnProj(f, { kind: 'note', x: foe.x + sd * 520, y: foe.y - 50 - (f.spN % 3) * 18, vx: -sd * 1100, w: 50, h: 50, life: 0.9, dmg: 14, kb: [60, 0], stun: 0.3, hs: 0.03, ult: true, noScale: true, pierce: true, maxHits: 1, notes: 0 });
      }
      if (f.spN === 6 && f.t >= 1.0) {
        f.spN = 7; f.spPose = 'yx_push';
        spawnProj(f, { kind: 'chord', vx: 0, x: foe.x, y: -100, delay: 0.12, w: 170, h: 200, life: 0.42, dmg: 60 + 15 * Math.min(3, f.notes || 0), kb: [300, -760], stun: 0.6, hs: 0.18, launch: true, unblockable: true, ult: true, noScale: true, big: true, unbreakable: true });
        f.notes = 3; f.skillCD = 0;
        addP({ type: 'text', text: '曲终绝响 · 音律回满', x: f.x, y: f.y - 120, life: 1.1, max: 1.1, rgb: '150,240,200' });
      }
      if (f.t >= 1.35) endSpecial(f);
    } },
  shanshui: { name: '山水之间', desc: '醉翁之意不在酒，在乎山水之间也。展开一幅满屏山水，从天上一路压下来，压下去的过程中对手共受 120 伤害（8 下，每下 15，不可格挡，躲在哪都逃不掉，只有腾空闪的无敌能躲开几下）。画卷落下后对手困在蓬莱境里 2 秒：对手的屏幕被画挡住，看不见自己和醉翁在哪，只有醉翁一方看得见。',
    begin(f) { f.sp = 'cast'; f.spN = 0; f.spPose = 'zx_drink'; f.invul = 0.3; SFX.superOn(); },
    update(f, foe) {
      if (f.spN < 8 && f.t >= 0.35 + f.spN * 0.17) {
        f.spN++; f.spPose = f.spN % 2 ? 'zx_sway' : 'zx_drink';
        if (foe.hp > 0 && foe.invul <= 0) applyHit(f, foe, { dmg: 15, exact: true, kb: [0, 0], stun: 0.35, hs: 0.03, unblockable: true, ult: true, noScale: true, dir: f.face }, [foe.x, foe.y - 60]);
        shake = Math.max(shake, 4 + f.spN); SFX.thud();
      }
      if (f.t >= 1.95) { if (foe.hp > 0) foe.veilT = PENGLAI_T; endSpecial(f); }
    } },
  eightimm: { name: '八仙过海', flurry: true, n: 8, iv: 0.085, slash: 12, fin: 76, desc: '醉眼一睁，滚身扑入；一扑得手，八仙醉拳轮番上身。打完醉意直接灌满。' },
  skynet: { name: '开天一锤', desc: '把链锤甩上天，锤头越飞越大，变成一柄巨锤从对手头顶砸落（40 伤害，不可格挡），被砸中的人震晕定身 1.2 秒；随后扯链回锤把人拽到身前再抡一记（80 伤害，挑空），并重置飞锤冷却、附加【震魄】。巨锤落空就只砸出一个坑。',
    begin(f) { f.sp = 'cast'; f.spN = 0; f.spPose = 'gc_wind'; f.invul = 0.3; f.hitDone = false; SFX.superOn(); },
    update(f, foe) {
      if (f.spN === 0 && f.t >= 0.15) {
        f.spN = 1; f.spPose = 'gc_wind'; SFX.swing();
        spawnProj(f, { kind: 'net', vx: 0, x: foe.x, y: Math.min(0, foe.y) - 80, delay: 0.25, w: 320, h: 200, life: 0.55, dmg: 40, kb: [0, 0], stun: 1.2, hs: 0.1, root: true, pierce: true, maxHits: 2, unblockable: true, ult: true, noScale: true, unbreakable: true });
      }
      if (f.spN === 1 && f.t >= 0.95) {
        f.spN = 2;
        if (foe.rooted && foe.state === 'hitstun' && foe.hp > 0 && foe.invul <= 0) {
          f.face = foe.x >= f.x ? 1 : -1; f.spPose = 'gc_pull'; f.snap = true;
          foe.x = clamp(f.x + f.face * 70, WALL, STAGE_W - WALL); foe.y = 0;
          applyHit(f, foe, { dmg: 80, kb: [420, -820], stun: 0.6, hs: 0.2, launch: true, unblockable: true, ult: true, noScale: true, big: true, dir: f.face }, [foe.x, foe.y - 60]);
          foe.hookedT = 1.2; f.skillCD = 0;
          shake = Math.max(shake, 14); SFX.heavy();
          addP({ type: 'text', text: '回锤 · 飞锤重置', x: f.x, y: f.y - 120, life: 1.1, max: 1.1, rgb: '235,205,130' });
        } else f.spPose = 'idle';
      }
      if (f.t >= 1.3) endSpecial(f);
    } },
  needlestorm: { name: '万线归宗', desc: '凌雀跃至半空织就漫天悬丝罗网，子母梭如疾风暴雨全屏交错绞杀敌人（7 段 12 伤害 + 终结 56 伤害），附加【雀芒】印记并重置换影冷却。',
    begin(f, foe) {
      f.sp = 'cast'; f.spN = 0; f.spPose = 'du_l1s'; f.invul = 0.40; f.vx = 0; f.vy = -360; f.y = -1; SFX.superOn();
    },
    update(f, foe) {
      f.vx = 0; f.vy = damp(f.vy, 0, 8, STEP);
      if (f.spN < 7 && f.t >= 0.15 + f.spN * 0.08) {
        f.spN++;
        SFX.slice();
        const sd = (f.spN % 2 === 0) ? 1 : -1;
        const ang = (f.spN * 0.6) % 3.14;
        slashLine(foe.x + rand(-40, 40), foe.y - 50 + rand(-30, 30), ang, '235,110,210');
        ring(foe.x, foe.y - 50, 70 + f.spN * 10, '235,110,210', 0.25);
        if (foe.hp > 0 && foe.invul <= 0) {
          applyHit(f, foe, { dmg: 12, exact: true, kb: [sd * 60, -40], stun: 0.26, hs: 0.03, unblockable: true, ult: true, noScale: true, dir: sd }, [foe.x, foe.y - 50]);
        }
      }
      if (f.spN === 7 && f.t >= 0.78) {
        f.spN = 8;
        f.y = 0; f.vy = 0;
        shake = Math.max(shake, 16); SFX.heavy(); SFX.slice();
        ring(foe.x, foe.y - 50, 150, '255,140,225', 0.45);
        if (foe.hp > 0 && foe.invul <= 0) {
          applyHit(f, foe, { dmg: 56, kb: [f.face * 300, -700], stun: 0.55, hs: 0.16, launch: true, unblockable: true, ult: true, noScale: true, big: true, dir: f.face }, [foe.x, foe.y - 50]);
          foe.needleMark = 3.5;
          f.skill2CD = 0;
          addP({ type: 'text', text: '✦ 雀芒入魂 · 悬丝归宗 ✦', x: f.x, y: f.y - 120, life: 1.1, max: 1.1, rgb: '255,140,225' });
        }
      }
      if (f.t >= 1.15) endSpecial(f);
    } },
  // 离影：每个雾身朝对手斩出一道刀光，然后全部散掉；本体最后瞬移到对手身前补一刀。没有雾身就只剩这一刀。没有无敌（只有出手那一下的定格）
  mistarray: { name: '万影归一', desc: '场上每个雾身同时朝对手斩出一道刀光（每道 34 伤害），然后全部散掉；本体最后瞬移到对手身前补一刀（45 伤害，挑空）。雾身越多刀越多，最多三刀。没有雾身时只有本体那一刀。全程没有无敌，可以被格挡。',
    begin(f, foe) {
      f.sp = 'cast'; f.spPose = 'fy_seal'; f.invul = 0; f.spN = 0; f.vx = 0;
      for (const c of (f.clones || []).slice()) {
        const d = foe.x >= c.x ? 1 : -1;
        spawnProj(f, { kind: 'wind', x: c.x + d * 30, y: -62, vx: d * 1700, vy: 0, w: 70, h: 60, life: 0.45, dmg: 34, kb: [160, 0], stun: 0.6, hs: 0.08, ult: true, unbreakable: true });   // 刀光先到，本体后到
        if (!RESIM) slashLine(c.x, -60, d > 0 ? 0 : Math.PI, f.look.slash);
      }
      clearClones(f);
      SFX.swing();
    },
    update(f, foe) {
      if (f.spN === 0 && f.t >= 0.45) {
        f.spN = 1;
        const side = foe.x >= f.x ? 1 : -1;
        if (!RESIM) smoke(f.x, f.y - 50, 10);
        f.x = clamp(foe.x - side * 80, WALL, STAGE_W - WALL); f.y = 0; f.vy = 0; f.face = side;
        f.snap = true; f.trail.length = 0; f.scarf = [];
        f.spPose = 'l2a'; f.hitDone = false;
        strike(f, foe, { box: [0, -118, 110, 0], dmg: 45, kb: [240, -720], stun: 0.5, hs: 0.12, launch: true, ult: true });
        SFX.slice();
      }
      if (f.t >= 0.8) endSpecial(f);
    } },
  // 磁仙：正极磁石在天上、负极磁石在地上，把对手夹成三明治（对手是中间的肉饼）
  sandwich: { name: '天地磁合', desc: '对手脚下浮出一块负极磁石、头顶压下一块正极磁石，两块磁石异极相吸，把对手牢牢吸住、越合越快，最后合拢夹成肉饼（125 伤害，不可格挡），被夹扁的人定住 1 秒。放的时候对手正在腾空闪这类无敌里，就只吸得住磁石，夹不到人。',
    begin(f, foe) {
      f.sp = 'cast'; f.spN = 0; f.spPose = 'lm_boxer'; f.invul = 0.75; f.vx = 0; f.hitDone = false;   // 合拢之前不会被打断
      f.sw = { x: clamp(foe.x, WALL, STAGE_W - WALL), top: -640, hit: 0, v: foe.idx, t: 0 };   // v：夹的是谁（存序号，回滚存档存得下）
      SFX.superOn(); ring(f.sw.x, -10, 120, magRGB(-1), 0.4);
    },
    update(f, foe) {
      const S = f.sw; if (!S) { endSpecial(f); return; }
      foe = fighterByIdx(S.v);   // 2v2 里一直夹放招时选中的那个人
      S.t = f.t;
      if (f.spN === 0 && f.t >= 0.12) {   // 吸住：对手被两块磁石定在中间
        f.spN = 1; f.spPose = 'victory';
        if (!isClient() && foe.hp > 0 && foe.invul <= 0) {
          S.hit = 1;
          foe.state = 'held'; foe.t = 0; foe.vx = 0; foe.vy = 0; foe.move = null; foe.skill = null; foe.sp = null;
        }
        SFX.charge();
      }
      if (f.spN === 1) {
        const u = clamp((f.t - 0.12) / 0.5, 0, 1);
        S.top = -640 + (640 - 120) * u * u * u;   // 越合越快
        if (S.hit && foe.state === 'held') { magMove(foe, damp(foe.x, S.x, 14, STEP)); foe.y = damp(foe.y, 0, 14, STEP); }
        if (!RESIM && Math.random() < 0.5) addP({ type: 'spark', x: S.x + rand(-60, 60), y: S.top + 20, vx: 0, vy: rand(300, 600), rgb: magRGB(1), life: 0.2, max: 0.2, w: 1.6 });
        if (u >= 1) {
          f.spN = 2; S.top = -120;
          shake = Math.max(shake, 20); flashA = Math.max(flashA, 0.3); flashRGB = '255,255,255'; SFX.heavy(); SFX.thud();
          dust(S.x, 0, 18); ring(S.x, -60, 150, magRGB(1), 0.4); ring(S.x, -60, 110, magRGB(-1), 0.4);
          const caught = S.hit ? foe.state === 'held' : (foe.hp > 0 && foe.invul <= 0 && Math.abs(foe.x - S.x) < 90 && foe.y > -170);
          if (caught && !isClient()) {
            magMove(foe, S.x); foe.y = 0;
            applyHit(f, foe, { dmg: 125, kb: [0, 0], stun: 1.0, hs: 0.22, root: true, unblockable: true, ult: true, noScale: true, big: true, dir: f.face }, [foe.x, foe.y - 60]);
            if (foe.state === 'held') toNeutral(foe);
            foe.squashT = 1.0;
            addP({ type: 'text', text: '天地磁合 · 夹成肉饼', x: S.x, y: -200, life: 1.1, max: 1.1, rgb: '255,220,200' });
          }
        }
      }
      if (f.t >= 1.15) { magRelease(f); endSpecial(f); }
    } },
};

