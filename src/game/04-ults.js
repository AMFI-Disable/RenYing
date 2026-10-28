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
  needlestorm: { name: '万线归宗', desc: '凌雀化作流光直扑对手（若背对则远离），飞行追踪。命中带【雀芒】印记之敌，消耗印记层数并连续穿刺绞杀（每层印记1段12伤害），终结斩56伤害。命中有印记者立即重置大招冷却（可连续施放），重置换影冷却。',
    begin(f, foe) {
      const target = sdTarget(f, foe);
      const facingCorrect = target && (Math.sign(target.x - f.x) === f.face || Math.abs(target.x - f.x) <= 20);

      f.sp = 'dash'; f.spN = 0; f.spPose = 'dash'; f.invul = 0.16; f.hitDone = false;
      f.sdTrack = !!facingCorrect; f.y = Math.min(f.y, -1);

      if (facingCorrect && target) {
        const a = Math.atan2((target.y - 50) - f.y, target.x - f.x);
        f.vx = Math.cos(a) * 2100; f.vy = Math.sin(a) * 2100;
      } else {
        f.vx = -f.face * 1400; f.vy = -520;
      }
      SFX.superOn(); SFX.dash();
    },
    update(f, foe) {
      const target = sdTarget(f, foe);

      if (f.sp === 'dash') {
        if (target && target.invul <= 0 && f.sdTrack) {
          const cur = Math.atan2(f.vy, f.vx);
          const want = Math.atan2((target.y - 50) - f.y, target.x - f.x);
          let d = want - cur;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          if (f.y >= 0 && Math.sin(cur + clamp(d, -20 * STEP, 20 * STEP)) > Math.max(0.001, Math.sin(cur))) d -= Math.sign(d) * Math.PI * 2;
          const a = cur + clamp(d, -20 * STEP, 20 * STEP);
          f.vx = Math.cos(a) * 2100; f.vy = Math.sin(a) * 2100;
        }
        if (f.vx) f.face = f.vx > 0 ? 1 : -1;
        if (f.y >= 0 && f.vy > 0) f.vy = 0;

        if (!RESIM && Math.random() < 0.7) {
          addP({ type: 'spark', x: f.x - f.face * 20, y: f.y - 50, vx: -f.face * rand(80, 180), vy: rand(-50, 50), rgb: '235,110,210', life: 0.28, max: 0.28 });
        }

        const hitFoe = target || foe;
        const marks = hitFoe.needleMark || 0;

        if (!f.hitDone && hitFoe.hp > 0 && overlap(hitbox(f, [-40, -120, 104, 24]), hurtbox(hitFoe))) {
          f.hitDone = true;
          f.sp = 'flurry'; f.t = 0; f.spN = 0; f.vx = 0; f.vy = 0;
          f.storedMarks = marks;
          if (marks > 0) {
            hitFoe.needleMark = 0;
            hitFoe.needleMarkT = 0;
          }
        } else if (f.t >= 0.9) {
          f.sp = 'miss'; f.t = 0; f.vx *= 0.15; f.vy *= 0.15;
        }
      }

      if (f.sp === 'flurry') {
        f.vx = 0; f.vy = damp(f.vy, 0, 8, STEP);
        const hitFoe = target || foe;
        const marks = f.storedMarks || 0;
        const totalHits = marks > 0 ? marks : 1;

        if (f.spN < totalHits && f.t >= f.spN * 0.10) {
          f.spN++;
          SFX.slice();
          const sd = (f.spN % 2 === 0) ? 1 : -1;
          const ang = (f.spN * 0.6) % 3.14;
          slashLine(hitFoe.x + rand(-30, 30), hitFoe.y - 50 + rand(-25, 25), ang, '235,110,210');
          ring(hitFoe.x, hitFoe.y - 50, 60 + f.spN * 12, '235,110,210', 0.28);
          if (hitFoe.hp > 0) {
            applyHit(f, hitFoe, { dmg: 12, exact: true, kb: [sd * 50, -30], stun: 0.24, hs: 0.03, unblockable: true, ult: true, noScale: true, dir: sd }, [hitFoe.x, hitFoe.y - 50]);
          }
        }

        if (f.spN === totalHits && f.t >= totalHits * 0.10 + 0.15) {
          f.spN = totalHits + 1;
          f.y = 0; f.vy = 0;
          shake = Math.max(shake, 16); SFX.heavy(); SFX.slice();
          ring(hitFoe.x, hitFoe.y - 50, 150, '255,140,225', 0.45);
          if (hitFoe.hp > 0) {
            applyHit(f, hitFoe, { dmg: 56, kb: [f.face * 300, -700], stun: 0.55, hs: 0.16, launch: true, unblockable: true, ult: true, noScale: true, big: true, dir: f.face }, [hitFoe.x, hitFoe.y - 50]);
            f.skill2CD = 0;
            if (marks > 0) {
              f.meter = 100;
              addP({ type: 'text', text: '✦ 雀芒归宗 · 大招重置 ✦', x: f.x, y: f.y - 120, life: 1.2, max: 1.2, rgb: '255,140,225' });
            } else {
              addP({ type: 'text', text: '✦ 悬丝归宗 ✦', x: f.x, y: f.y - 120, life: 1.0, max: 1.0, rgb: '255,140,225' });
            }
          }
        }

        if (f.t >= totalHits * 0.10 + 0.50) endSpecial(f);
      }

      if (f.sp === 'miss' && f.t >= 0.35) endSpecial(f);
    } },
};

