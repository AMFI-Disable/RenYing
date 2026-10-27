// ======================= 问剑密卷：秘卷引擎 =======================
// 肉鸽（爬塔）和全服天魔讨伐共用这一套秘卷。每卷秘卷是一份数据：名字、流派、品级、说明，加上几个“钩子”函数，
// 对战里到了对应的时机（出手命中、挨打、冲刺、放技能、每一帧……）就调用它。秘卷只在 scOn() 时生效（爬塔、天魔讨伐，单机）。
// 谁身上有秘卷：A（idx 0）是玩家，用 M.towerPerks；B（idx 1）是天魔讨伐里的天魔，用 M.foeScrolls（天魔词缀）。
// 每局对战的临时状态放在 f.sc（叠层、计时、排队的延迟效果），每回合开始清空；对手身上的异常状态放在 f.st。
// 一整趟爬塔要带着走的东西放在 M.scRun（存进爬塔存档）。
//
// 钩子一览（c 是一次命中的上下文：c.f 是秘卷的主人，c.o 是另一方，c.dmg 可以改，c.m 是这一招）：
//   out(c) 主人打人、扣血之前      inc(c) 主人挨打、扣血之前      hit(c) 主人打中之后      hurt(c) 主人挨打之后
//   fatal(c) 主人这一下要死了，返回 true 就保住（自己把血设好）
//   blk(f, o, jg, m) 主人格挡（jg 为精准招架）   gb(f, o) 主人打破对手架势   brk(f, o) 主人自己被破防
//   dash / esc / jump / skill(f, o, slot) / ult / atk(f, o, name) / parry / land(f, o, vy) / start / tick(f, o) / clear(f)
//   proj(f, p) 主人生成飞行道具时改它   jg(f) 精准招架窗口（秒）   spd(f) 移速倍数   cd(f) 技能冷却额外流速
const SC_SCHOOLS = {
  lei: { n: '雷', rgb: '255,220,90' }, shuang: { n: '霜', rgb: '140,220,255' }, xue: { n: '血', rgb: '255,90,100' },
  mo: { n: '墨', rgb: '170,170,200' }, feng: { n: '风', rgb: '120,230,180' }, jin: { n: '金', rgb: '240,200,110' },
  ying: { n: '影', rgb: '200,140,255' }, qi: { n: '气', rgb: '110,200,255' }, xian: { n: '险', rgb: '255,120,60' }, hero: { n: '侠', rgb: '233,196,106' }
};
const SC_RARITY = { c: { n: '凡品', w: 10 }, r: { n: '精品', w: 6 }, e: { n: '绝品', w: 2.5 }, x: { n: '险卷', w: 3 }, l: { n: '天书', w: 1.5 } };
const SC_RESONANCE = 3;   // 同一流派凑够几卷触发流派共鸣
const SC_RESO = {
  lei: '每 8 秒自动落下一道天雷劈向对手',
  shuang: '霜寒减速加倍：被冻住的对手移速只剩一半',
  xue: '所有伤害 6% 吸血',
  mo: '伤害 +10%',
  feng: '移速 +12%，冲刺冷却 -25%',
  jin: '受到的伤害 -10%',
  ying: '8% 几率完全闪开一次攻击',
  qi: '气的获取 +25%',
};

// ---------- 小工具 ----------
const scRnd = () => Math.random();   // 秘卷只在单机模式生效，不用回滚同步的随机数
function scTxt(f, text, rgb, dy = 0) { if (!RESIM) addP({ type: 'text', text, x: f.x, y: f.y - 125 - dy, life: 0.85, max: 0.85, rgb: rgb || '235,220,170' }); }
function scHeal(f, n) {
  if (n <= 0 || f.hp <= 0 || scHas(f, 'no_heal')) return 0;
  const h = Math.min(Math.round(n), f.maxHp - f.hp); if (h <= 0) return 0;
  f.hp += h; f.lagHp = Math.max(f.lagHp, f.hp);
  if (!RESIM) addP({ type: 'text', text: '+' + h, x: f.x + rand(-10, 10), y: f.y - 115, life: 0.7, max: 0.7, rgb: '130,230,140' });
  return h;
}
// 真实伤害：不打断、不吃招架；打到 0 由回合流程判定击倒。self 为 true 时（秘卷的代价）最多扣到 1
function scTrue(def, n, rgb, self) {
  n = Math.round(n); if (n <= 0 || def.hp <= 0 || M.phase !== 'fight') return 0;
  const floor = self || def.dummy ? 1 : 0, d = Math.min(n, def.hp - floor); if (d <= 0) return 0;
  def.hp -= d; def.sinceHit = 0; def.lagDelay = 0.5;
  if (!RESIM) addP({ type: 'dmg', text: `${d}`, x: def.x + rand(-15, 15), y: def.y - 75, vx: rand(-20, 20), vy: -120, g: 200, life: 0.65, max: 0.65, s: 0.75, rgb: rgb || '255,200,120', edge: '120,60,20' });
  return d;
}
function scMeter(f, n) { f.meter = clamp(f.meter + n * (n > 0 ? scMeterMul(f) : 1), 0, 100); }
function scMeterMul(f) { let k = 1; if (scReso(f, 'qi')) k *= 1.25; if (scHas(f, 'flow_combo')) k *= 1.5; if (scHas(f, 'all_in')) k *= 0.6; if (scHas(f, 'scorched_earth')) k *= 1.3; return k; }
function scCdCut(f, s) { f.skillCD = Math.max(0, f.skillCD - s); f.skill2CD = Math.max(0, f.skill2CD - s); }
function scLater(f, t, fn) { (f.sc.q || (f.sc.q = [])).push({ t, fn }); }
function scBolt(f, x, dmg) { spawnProj(f, { kind: 'bolt', x, y: -260, vx: 0, w: 60, h: 520, life: 0.4, delay: 0.05, dmg, kb: [60, -180], stun: 0.35, hs: 0.05, launch: true, noScale: true, scFx: true }); SFX.thunder(); }
function scWave(f, dir, dmg, o = {}) { spawnProj(f, Object.assign({ kind: 'wind', x: f.x + dir * 40, y: f.y - 62, vx: dir * 1050, vy: 0, w: 48, h: 44, life: 0.75, dmg, kb: [160, 0], stun: 0.3, hs: 0.04, pierce: true, noScale: true, scFx: true }, o)); }
function scQuake(f, x, dmg) { spawnProj(f, { kind: 'quake', x, y: -20, vx: 0, w: 220, h: 50, life: 0.35, dmg, kb: [80, -420], stun: 0.4, hs: 0.06, launch: true, groundOnly: true, noScale: true, scFx: true }); dust(x, 0, 12); shake = Math.max(shake, 8); }
// 异常状态（放在被打的人身上）
function scSt(f) { return f.st || (f.st = {}); }
function scPoison(def, n) { const s = scSt(def); s.poison = Math.min(8, (s.poison || 0) + n); s.poisonT = 5; }
function scVuln(def, t, v) { const s = scSt(def); if (!s.vulnT || v >= (s.vuln || 0)) { s.vuln = v; } s.vulnT = Math.max(s.vulnT || 0, t); }
function scWeak(def, t, v) { const s = scSt(def); s.weak = Math.max(s.weak || 0, v); s.weakT = Math.max(s.weakT || 0, t); }
function scRoot(def, t) { if (def.hp <= 0) return; def.state = 'hitstun'; def.t = 0; def.stun = Math.max(def.stun || 0, t); def.rooted = true; def.vx = 0; def.move = null; def.skill = null; }
function scStatuses(def) { const s = def.st || {}; return (s.poison > 0) + (s.vulnT > 0) + (s.weakT > 0) + (def.bleedTicks > 0) + (def.frostSlow > 0) + (def.burnT > 0) + ((s.static || 0) > 0); }
const scHpPct = f => f.hp / Math.max(1, f.maxHp);
const scMelee = c => !c.proj && !c.ult;
const scNear = (f, o, d) => Math.abs(f.x - o.x) < d;

// ---------- 秘卷目录 ----------
// s 流派，r 品级（c 凡品 / r 精品 / e 绝品 / x 险卷：好处大、代价真 / l 天书：全服讨伐天魔解锁），h 只给这个侠客
const SCROLLS = [
  // ===== 锋：伤害手段 =====
  { id: 'ink_resonance', n: '墨韵共鸣', s: 'mo', r: 'c', d: '近战斩击伤害 +15%，命中时在地面激起墨浪。', out(c) { if (scMelee(c)) { c.dmg *= 1.15; if (!RESIM) for (let i = 0; i < 4; i++) addP({ type: 'ink', x: c.o.x + rand(-25, 25), y: c.o.y - rand(20, 80), vx: rand(-120, 120), vy: rand(-150, 50), g: 600, life: 0.6, max: 0.6, r: rand(3, 6), rgb: '15,15,22' }); } } },
  { id: 'storm_wrath', n: '天煞狂雷', s: 'lei', r: 'c', d: '近身攻击的击退与挑飞力度 +35%，命中伴随雷爆。', out(c) { if (scMelee(c)) { c.m = { ...c.m, kb: [c.m.kb[0] * 1.35, c.m.kb[1] * 1.25] }; if (!RESIM) ring(c.ev.x, c.ev.y, 110, '255,235,110', 0.35); } } },
  { id: 'air_burst', n: '浮空破灭', s: 'feng', r: 'c', d: '对浮空、被挑飞的敌人伤害 +35%。', out(c) { if (c.air) c.dmg *= 1.35; } },
  { id: 'ink_blade', n: '剑气长虹', s: 'mo', r: 'r', d: '轻击（地面一至五段）同时挥出一道贯穿的墨刃剑气，造成 18 点伤害。', atk(f, o, name) { if (/^l[1-5]$/.test(name)) scWave(f, f.face, 18); } },
  { id: 'first_blood', n: '先声夺人', s: 'jin', r: 'c', d: '每层第一次命中伤害 +80%。', out(c) { if (!c.f.sc.fb) { c.f.sc.fb = 1; c.dmg *= 1.8; scTxt(c.o, '先声夺人', '240,200,110'); } } },
  { id: 'executioner', n: '断魂斩', s: 'xue', r: 'r', d: '对生命低于 30% 的敌人伤害 +40%。', out(c) { if (scHpPct(c.o) < 0.3) c.dmg *= 1.4; } },
  { id: 'giant_slayer', n: '以弱胜强', s: 'jin', r: 'c', d: '对手剩余血量比例比你高时，伤害 +25%。', out(c) { if (scHpPct(c.o) > scHpPct(c.f)) c.dmg *= 1.25; } },
  { id: 'crescendo', n: '连珠渐强', s: 'qi', r: 'r', d: '同一套连招里每多一击伤害 +6%（最多 +48%），连招断了重新算。', out(c) { c.dmg *= 1 + Math.min(8, Math.max(0, c.o.comboHits - 1)) * 0.06; } },
  { id: 'heavy_hand', n: '开山重手', s: 'jin', r: 'c', d: '重击与蓄力斩伤害 +30%，被格挡时削架势多一半。', out(c) { if (c.heavy) c.dmg *= 1.3; }, blkOut(c) { if (c.heavy) c.guardMul = 1.5; } },
  { id: 'needle_rain', n: '疾风连刺', s: 'feng', r: 'c', d: '轻击伤害 +12%；每第 4 下轻击命中会追加一记 50% 伤害的连刺。', out(c) { if (c.light) c.dmg *= 1.12; }, hit(c) { if (c.light && ++c.f.sc.lc % 4 === 0) { const o = c.o, d = c.dmg * 0.5; scLater(c.f, 0.12, () => scTrue(o, d, '200,255,220')); } } },
  { id: 'counter_master', n: '后发先至', s: 'ying', r: 'r', d: '打断对手出招的反击伤害从 1.2 倍提高到 1.8 倍。', out(c) { if (c.counter) c.dmg *= 1.5; } },
  { id: 'backstab', n: '背刺', s: 'ying', r: 'c', d: '击中背对你的敌人伤害 +35%。', out(c) { if (c.o.face === Math.sign(c.o.x - c.f.x)) { c.dmg *= 1.35; scTxt(c.o, '背刺', '200,140,255'); } } },
  { id: 'sniper', n: '百步穿杨', s: 'feng', r: 'c', d: '飞行道具伤害 +40%，近战伤害 -10%。', out(c) { if (c.proj) c.dmg *= 1.4; else if (!c.ult) c.dmg *= 0.9; } },
  { id: 'brawler', n: '近身搏杀', s: 'jin', r: 'c', d: '贴身（60 距离内）近战伤害 +25%，飞行道具伤害 -20%。', out(c) { if (c.proj) c.dmg *= 0.8; else if (scNear(c.f, c.o, 90)) c.dmg *= 1.25; } },
  { id: 'momentum', n: '势如破竹', s: 'feng', r: 'r', d: '出手时你移动得越快伤害越高，最多 +30%。', out(c) { if (!c.proj) c.dmg *= 1 + clamp(Math.abs(c.f.vx) / 1800, 0, 0.3); } },
  { id: 'crit_eye', n: '洞若观火', s: 'ying', r: 'c', d: '12% 几率暴击，造成双倍伤害。', out(c) { if (scRnd() < 0.12) { c.dmg *= 2; c.ev.big = true; scTxt(c.o, '暴击', '255,230,120'); } } },
  { id: 'lethal_rhythm', n: '刀起刀落', s: 'qi', r: 'r', d: '在上一次命中后 0.4~0.8 秒再命中，伤害 +30%（踩准节奏）。', out(c) { const dt = clock - (c.f.sc.lastHit || -9); if (dt >= 0.4 && dt <= 0.8) { c.dmg *= 1.3; scTxt(c.f, '合拍', '110,200,255'); } }, hit(c) { c.f.sc.lastHit = clock; } },
  { id: 'sunder', n: '破甲', s: 'jin', r: 'r', d: '每次命中让对手受到的伤害 +3%，本层最多叠到 +30%。', hit(c) { c.f.sc.sunder = Math.min(10, (c.f.sc.sunder || 0) + 1); }, out(c) { c.dmg *= 1 + (c.f.sc.sunder || 0) * 0.03; } },
  { id: 'double_strike', n: '二重劲', s: 'qi', r: 'e', d: '技能命中后 0.15 秒追加一记 40% 伤害的暗劲。', hit(c) { if (c.skill) { const o = c.o, d = c.dmg * 0.4; scLater(c.f, 0.15, () => { scTrue(o, d, '110,200,255'); if (!RESIM) ring(o.x, o.y - 60, 70, '110,200,255', 0.3); }); } } },
  { id: 'shockwave', n: '地裂', s: 'jin', r: 'r', d: '重击命中时，对手脚下震起一道地裂。', hit(c) { if (c.heavy && (c.f.sc.quakeCd || 0) <= 0) { c.f.sc.quakeCd = 1.5; scQuake(c.f, c.o.x, 16); } }, tick(f) { f.sc.quakeCd = Math.max(0, (f.sc.quakeCd || 0) - STEP); } },
  { id: 'ult_amp', n: '绝技精研', s: 'qi', r: 'c', d: '绝技伤害 +35%。', out(c) { if (c.ult) c.dmg *= 1.35; } },
  { id: 'piercing_wind', n: '穿云', s: 'feng', r: 'c', d: '你的飞行道具变大 40%、能贯穿，飞得更远。', proj(f, p) { if (p.w) p.w *= 1.4; if (p.h) p.h *= 1.4; p.pierce = true; p.life *= 1.25; } },
  // ===== 守：防御手段 =====
  { id: 'golden_bell', n: '金钟护体', s: 'jin', r: 'r', d: '每层第一次受到致命伤害时保住 1 点血，无敌 1.5 秒。', fatal(c) { if (c.f.sc.bell) return false; c.f.sc.bell = 1; c.f.hp = 1; c.f.invul = 1.5; if (!RESIM) ring(c.f.x, c.f.y - 60, 200, '255,215,0', 0.6); scTxt(c.f, '金钟护体 · 绝处逢生', '255,215,0', 15); SFX.parry(); return true; } },
  { id: 'parry_refresh', n: '借力打力', s: 'ying', r: 'r', d: '精准招架瞬间重置两个技能的冷却。', blk(f, o, jg) { if (jg) { f.skillCD = 0; f.skill2CD = 0; scTxt(f, '借力打力 · 招式重置', '120,230,255', 20); } } },
  { id: 'iron_skin', n: '铁布衫', s: 'jin', r: 'c', d: '受到的伤害 -12%。', inc(c) { c.dmg *= 0.88; } },
  { id: 'thorns', n: '荆棘', s: 'xue', r: 'c', d: '近身打你的人反受 25% 的伤害。', hurt(c) { if (!c.proj && c.dmg > 0) scTrue(c.o, c.dmg * 0.25, '255,120,120'); } },
  { id: 'last_stand', n: '背水', s: 'jin', r: 'r', d: '生命低于 25% 时受到的伤害 -35%。', inc(c) { if (scHpPct(c.f) < 0.25) c.dmg *= 0.65; } },
  { id: 'guard_wall', n: '铜墙', s: 'jin', r: 'c', d: '格挡不再被磨血，架势消耗 -40%。', blkIn(c) { c.chip = 0; c.guardMul *= 0.6; } },
  { id: 'retaliation', n: '以牙还牙', s: 'xue', r: 'c', d: '挨打后 2 秒内，你下一次命中伤害 +50%。', hurt(c) { c.f.sc.revT = 2; }, out(c) { if (c.f.sc.revT > 0) { c.dmg *= 1.5; c.f.sc.revT = 0; scTxt(c.o, '以牙还牙', '255,90,100'); } }, tick(f) { f.sc.revT = Math.max(0, (f.sc.revT || 0) - STEP); } },
  { id: 'second_wind', n: '回气', s: 'qi', r: 'r', d: '每层第一次跌到 40% 生命以下时，回复 20% 最大生命。', hurt(c) { if (!c.f.sc.sw && scHpPct(c.f) < 0.4 && c.f.hp > 0) { c.f.sc.sw = 1; scHeal(c.f, c.f.maxHp * 0.2); scTxt(c.f, '回气', '110,200,255', 20); } } },
  { id: 'evasion', n: '移形', s: 'ying', r: 'c', d: '10% 几率完全闪开一次非绝技攻击。', dodge(c) { return !c.ult && scRnd() < 0.10; } },
  { id: 'stone_stance', n: '不动如山', s: 'jin', r: 'r', d: '站定不动 0.8 秒后获得一次霸体（吃一下不被打断）。', tick(f) { if (f.state === 'idle' && f.onGround() && Math.abs(f.vx) < 5) { f.sc.still = (f.sc.still || 0) + STEP; if (f.sc.still >= 0.8 && f.armorT <= 0) { f.armorT = 0.6; f.armorHits = 1; f.sc.still = 0; if (!RESIM) ring(f.x, f.y - 60, 80, '240,200,110', 0.25); } } else f.sc.still = 0; } },
  { id: 'aegis', n: '护心镜', s: 'jin', r: 'r', d: '每 12 秒生成一层护盾，可抵挡 40 点伤害。', start(f) { f.sc.shield = 40; f.sc.shT = 0; }, tick(f) { if ((f.sc.shield || 0) <= 0) { f.sc.shT = (f.sc.shT || 0) + STEP; if (f.sc.shT >= 12) { f.sc.shT = 0; f.sc.shield = 40; scTxt(f, '护心镜', '240,200,110'); } } }, inc(c) { const s = c.f.sc.shield || 0; if (s > 0) { const a = Math.min(s, c.dmg); c.f.sc.shield = s - a; c.dmg -= a; } } },
  { id: 'counter_guard', n: '格挡反震', s: 'jin', r: 'c', d: '普通格挡近战攻击时，30% 几率震得对手硬直。', blk(f, o, jg, m) { if (!jg && !m.isProj && o.hp > 0 && scRnd() < 0.3) { o.state = 'hitstun'; o.t = 0; o.stun = 0.35; o.vx = -o.face * 160; scTxt(o, '反震', '240,200,110'); } } },
  { id: 'jg_window', n: '心眼', s: 'ying', r: 'r', d: '精准招架的判定时间从 0.09 秒放宽到 0.16 秒。', jg() { return 0.16; } },
  { id: 'meditation', n: '调息', s: 'qi', r: 'c', d: '3 秒没挨打就每秒回复 4 点生命。', tick(f) { if (f.sinceHit > 3 && M.phase === 'fight' && f.hp < f.maxHp) { f.sc.medi = (f.sc.medi || 0) + 4 * STEP; if (f.sc.medi >= 1) { const n = Math.floor(f.sc.medi); f.sc.medi -= n; if (!scHas(f, 'no_heal')) { f.hp = Math.min(f.maxHp, f.hp + n); f.lagHp = Math.max(f.lagHp, f.hp); } } } } },
  { id: 'bulwark', n: '磐石', s: 'jin', r: 'c', d: '架势上限 +50%。', start(f) { f.maxGuard = Math.round(f.maxGuard * 1.5); f.guard = f.maxGuard; } },
  { id: 'proj_ward', n: '拨云', s: 'feng', r: 'c', d: '受到飞行道具的伤害 -40%。', inc(c) { if (c.proj) c.dmg *= 0.6; } },
  { id: 'ult_resist', n: '定海神针', s: 'jin', r: 'c', d: '受到绝技的伤害 -40%。', inc(c) { if (c.ult) c.dmg *= 0.6; } },
  { id: 'after_armor', n: '运功护体', s: 'qi', r: 'r', d: '放技能后 1.2 秒内霸体（吃两下不被打断）。', skill(f) { f.armorT = Math.max(f.armorT, 1.2); f.armorHits = Math.max(f.armorHits || 0, 2); } },
  { id: 'lifeline', n: '命悬一线', s: 'ying', r: 'r', d: '生命低于一半时挨打会获得 0.4 秒无敌（每 6 秒一次）。', hurt(c) { if (scHpPct(c.f) < 0.5 && (c.f.sc.llT || 0) <= 0 && c.f.hp > 0) { c.f.sc.llT = 6; c.f.invul = Math.max(c.f.invul, 0.4); scTxt(c.f, '命悬一线', '200,140,255'); } }, tick(f) { f.sc.llT = Math.max(0, (f.sc.llT || 0) - STEP); } },
  { id: 'recoil_guard', n: '卸力', s: 'ying', r: 'e', d: '每层第一次被破防时不会崩势，改为把对手震开并补满架势。', brk(f, o) { if (f.sc.recoil) return false; f.sc.recoil = 1; f.guard = f.maxGuard; o.vx = -o.face * 520; o.state = 'hitstun'; o.t = 0; o.stun = 0.4; scTxt(f, '卸力', '200,140,255'); return true; } },
  // ===== 身：身法 =====
  { id: 'thunder_dash', n: '雷厉', s: 'lei', r: 'r', d: '腾空闪时在身后劈下一道雷，造成 28 点伤害并挑飞。', esc(f) { scBolt(f, f.x - f.face * 60, 28); } },
  { id: 'sky_master', n: '凌霄御风', s: 'feng', r: 'r', d: '空中原地腾空闪的滞空从 0.85 秒延长到 1.5 秒。', esc(f, o, air) { if (air) { f.airHover = 1.5; f.invul = 1.5; } } },
  { id: 'swift_feet', n: '神行', s: 'feng', r: 'c', d: '移动速度 +20%。', spd() { return 1.2; } },
  { id: 'phantom_step', n: '幻步', s: 'ying', r: 'c', d: '冲刺的无敌时间从 0.13 秒延长到 0.3 秒。', dash(f) { f.invul = Math.max(f.invul, 0.3); } },
  { id: 'jump_guard', n: '踏云', s: 'feng', r: 'c', d: '每次起跳获得 0.15 秒无敌，二段跳额外回 5 点架势。', jump(f) { f.invul = Math.max(f.invul, 0.15); if (f.jumps >= 2) f.guard = Math.min(f.maxGuard, f.guard + 5); } },
  { id: 'dash_strike', n: '穿身斩', s: 'feng', r: 'r', d: '冲刺穿过敌人身边时顺手斩出 20 点伤害（每次冲刺一次）。', dash(f) { f.sc.dashHit = 0; }, tick(f, o) { if (f.state === 'dash' && !f.sc.dashHit && o.hp > 0 && o.invul <= 0 && scNear(f, o, 60) && Math.abs(f.y - o.y) < 90) { f.sc.dashHit = 1; scTrue(o, 20, '120,230,180'); if (!RESIM) slashLine(o.x, o.y - 60, 0, '120,230,180'); SFX.dash(); } } },
  { id: 'aerial_ace', n: '鹰击', s: 'feng', r: 'c', d: '你在空中时伤害 +20%。', out(c) { if (c.f.y < -15) c.dmg *= 1.2; } },
  { id: 'feather_fall', n: '轻身', s: 'feng', r: 'c', d: '腾空闪冷却 -30%。', esc(f) { f.breakCD *= 0.7; } },
  { id: 'jg_blink', n: '移形换影', s: 'ying', r: 'e', d: '精准招架近战攻击后瞬移到对手身后。', blk(f, o, jg, m) { if (jg && !m.isProj) { const nx = clamp(o.x - o.face * 70, 40, STAGE_W - 40); smoke(f.x, f.y - 40, 8); f.x = nx; f.face = o.x >= f.x ? 1 : -1; smoke(f.x, f.y - 40, 8); } } },
  { id: 'wind_runner', n: '追风', s: 'feng', r: 'c', d: '冲刺后 0.6 秒内的下一次出手伤害 +35%。', dash(f) { f.sc.wrT = 0.6 + DASH_T; }, tick(f) { f.sc.wrT = Math.max(0, (f.sc.wrT || 0) - STEP); }, out(c) { if (c.f.sc.wrT > 0 && !c.proj) { c.dmg *= 1.35; c.f.sc.wrT = 0; } } },
  { id: 'dash_cd', n: '流光', s: 'feng', r: 'c', d: '冲刺冷却 -40%。', dash(f) { f.dashCD *= 0.6; } },
  { id: 'slipstream', n: '借风', s: 'qi', r: 'c', d: '每次冲刺回复 4 点架势和 3 点气。', dash(f) { f.guard = Math.min(f.maxGuard, f.guard + 4); scMeter(f, 3); } },
  { id: 'air_reset', n: '踏敌', s: 'feng', r: 'r', d: '打中浮空的敌人会刷新你的二段跳。', hit(c) { if (c.air && c.f.y < -15) c.f.jumps = 1; } },
  { id: 'ground_slam', n: '陨星坠', s: 'jin', r: 'r', d: '从高处重重落地时震出地裂。', land(f, o, vy) { if (vy > 900) scQuake(f, f.x, 18); } },
  { id: 'escape_meter', n: '化劲', s: 'qi', r: 'c', d: '每次腾空闪获得 15 点气。', esc(f) { scMeter(f, 15); } },
  { id: 'sidestep', n: '闪身破绽', s: 'ying', r: 'e', d: '对手出招时贴身冲刺闪过，下一击必定暴击。', dash(f, o) { if (o.state === 'attack' && scNear(f, o, 140)) { f.sc.crit = 1; scTxt(f, '破绽', '200,140,255'); } }, out(c) { if (c.f.sc.crit) { c.f.sc.crit = 0; c.dmg *= 2; c.ev.big = true; } } },
  // ===== 时：冷却 =====
  { id: 'light_cdr', n: '快刀', s: 'qi', r: 'c', d: '每次轻击命中让两个技能冷却减少 0.3 秒。', hit(c) { if (c.light) scCdCut(c.f, 0.3); } },
  { id: 'skill_echo', n: '回响', s: 'qi', r: 'r', d: '放技能时 20% 几率不进入冷却。', skill(f, o, slot) { if (scRnd() < 0.2) { if (slot === 2) f.skill2CD = 0; else f.skillCD = 0; scTxt(f, '回响', '110,200,255'); } } },
  { id: 'haste', n: '抢先', s: 'qi', r: 'c', d: '两个技能冷却 -20%。', skill(f, o, slot) { if (slot === 2) f.skill2CD *= 0.8; else f.skillCD *= 0.8; } },
  { id: 'ult_cdr', n: '一气呵成', s: 'qi', r: 'r', d: '放绝技会重置两个技能的冷却。', ult(f) { f.skillCD = 0; f.skill2CD = 0; } },
  { id: 'alternate', n: '左右开弓', s: 'qi', r: 'r', d: '放一个技能会让另一个技能的剩余冷却减半。', skill(f, o, slot) { if (slot === 2) f.skillCD *= 0.5; else f.skill2CD *= 0.5; } },
  { id: 'break_reset', n: '破势', s: 'jin', r: 'r', d: '打破对手架势时重置两个技能的冷却。', gb(f) { f.skillCD = 0; f.skill2CD = 0; scTxt(f, '破势', '240,200,110'); } },
  { id: 'hurt_cdr', n: '愈挫愈勇', s: 'xue', r: 'c', d: '每次挨打让两个技能冷却减少 0.5 秒。', hurt(c) { scCdCut(c.f, 0.5); } },
  { id: 'full_meter_cdr', n: '气贯周天', s: 'qi', r: 'c', d: '气满时技能冷却快一倍。', cd(f) { return f.meter >= 100 ? 1 : 0; } },
  { id: 'low_hp_haste', n: '急中生智', s: 'xue', r: 'c', d: '生命低于一半时技能冷却快 50%。', cd(f) { return scHpPct(f) < 0.5 ? 0.5 : 0; } },
  { id: 'patient_power', n: '厚积薄发', s: 'qi', r: 'r', d: '技能冷却 +30%，但技能伤害 +45%。', skill(f, o, slot) { if (slot === 2) f.skill2CD *= 1.3; else f.skillCD *= 1.3; }, out(c) { if (c.skill) c.dmg *= 1.45; } },
  { id: 'jg_escape', n: '脱胎', s: 'ying', r: 'c', d: '精准招架会刷新腾空闪冷却。', blk(f, o, jg) { if (jg) f.breakCD = 0; } },
  { id: 'combo_cdr', n: '连环', s: 'qi', r: 'r', d: '一套连招打到第 5 下时重置右键招式的冷却。', hit(c) { if (c.o.comboHits === 5) { c.f.skill2CD = 0; scTxt(c.f, '连环', '110,200,255'); } } },
  { id: 'link_skill', n: '连携', s: 'qi', r: 'c', d: '命中后 0.5 秒内放出的技能伤害 +30%。', hit(c) { if (!c.skill) c.f.sc.linkT = 0.5; }, skill(f) { if (f.sc.linkT > 0) f.sc.linked = 1.2; }, tick(f) { f.sc.linkT = Math.max(0, (f.sc.linkT || 0) - STEP); f.sc.linked = Math.max(0, (f.sc.linked || 0) - STEP); }, out(c) { if (c.skill && c.f.sc.linked > 0) c.dmg *= 1.3; } },
  { id: 'opening_haste', n: '先机', s: 'feng', r: 'c', d: '每层开战后 8 秒内技能冷却快 150%。', cd(f) { return M.phase === 'fight' && M.t < 8 ? 1.5 : 0; } },
  { id: 'cd_shield', n: '蓄势', s: 'jin', r: 'c', d: '两个技能都在冷却时受到的伤害 -15%。', inc(c) { if (c.f.skillCD > 0 && c.f.skill2CD > 0) c.dmg *= 0.85; } },
  // ===== 气：资源 =====
  { id: 'flow_combo', n: '行云流水', s: 'qi', r: 'r', d: '所有途径获得的气 +50%。', hit(c) { if (!c.ult) c.f.meter = Math.min(100, c.f.meter + c.m.dmg * 0.09); } },
  { id: 'meter_start', n: '蓄气', s: 'qi', r: 'c', d: '每层开局带 40 点气。', start(f) { f.meter = Math.max(f.meter, 40); } },
  { id: 'meter_block', n: '守中有攻', s: 'qi', r: 'c', d: '每次格挡获得 4 点气，精准招架获得 20 点。', blk(f, o, jg) { scMeter(f, jg ? 20 : 4); } },
  { id: 'meter_drain', n: '吸星', s: 'qi', r: 'r', d: '每次命中吸走对手 5 点气，转给自己一半。', hit(c) { const d = Math.min(5, c.o.meter); c.o.meter -= d; scMeter(c.f, d / 2); } },
  { id: 'meter_heal', n: '归元', s: 'qi', r: 'r', d: '气满时每秒回复 3 点生命。', tick(f) { if (f.meter >= 100 && M.phase === 'fight') { f.sc.mh = (f.sc.mh || 0) + 3 * STEP; if (f.sc.mh >= 1) { const n = Math.floor(f.sc.mh); f.sc.mh -= n; if (!scHas(f, 'no_heal')) { f.hp = Math.min(f.maxHp, f.hp + n); f.lagHp = Math.max(f.lagHp, f.hp); } } } } },
  { id: 'ult_refund', n: '余韵', s: 'qi', r: 'c', d: '绝技命中后返还 30 点气（每次绝技一次）。', ult(f) { f.sc.refund = 1; }, hit(c) { if (c.ult && c.f.sc.refund) { c.f.sc.refund = 0; scLater(c.f, 0.6, () => scMeter(c.f, 30)); } } },
  { id: 'meter_power', n: '气盛', s: 'qi', r: 'c', d: '每有 1 点气伤害 +0.25%（满气 +25%）。', out(c) { c.dmg *= 1 + c.f.meter * 0.0025; } },
  { id: 'jg_meter', n: '借势', s: 'qi', r: 'c', d: '精准招架额外获得 20 点气。', blk(f, o, jg) { if (jg) scMeter(f, 20); } },
  { id: 'meter_shield', n: '气墙', s: 'qi', r: 'r', d: '挨打时若有 50 点以上的气，消耗 15 点抵消 40% 伤害。', inc(c) { if (c.f.meter >= 50) { c.f.meter -= 15; c.dmg *= 0.6; } } },
  { id: 'overflow', n: '满溢', s: 'qi', r: 'c', d: '满血时每秒获得 2 点气。', tick(f) { if (f.hp >= f.maxHp && (f.sc.ovT = (f.sc.ovT || 0) + STEP) > 1) { f.sc.ovT = 0; scMeter(f, 2); } } },
  { id: 'meter_bank', n: '存气', s: 'qi', r: 'r', d: '每层结束时剩下的气存一半，下一层开局带上（最多 60）。', clear(f) { M.scRun.bank = Math.min(60, Math.round(f.meter / 2)); }, start(f) { if (M.scRun.bank) { f.meter = Math.max(f.meter, M.scRun.bank); M.scRun.bank = 0; } } },
  { id: 'foe_meter_cut', n: '断气', s: 'qi', r: 'c', d: '对手获得的气 -40%。', tick(f, o) { const last = f.sc.oMeter === undefined ? o.meter : f.sc.oMeter; if (o.meter > last) o.meter = last + (o.meter - last) * 0.6; f.sc.oMeter = o.meter; } },
  { id: 'ult_heal', n: '绝处逢春', s: 'xue', r: 'c', d: '放绝技时回复 15% 最大生命。', ult(f) { scHeal(f, f.maxHp * 0.15); } },
  { id: 'guard_regen', n: '吐纳', s: 'qi', r: 'c', d: '架势回复速度 +60%。', tick(f) { if (f.state !== 'block' && f.state !== 'blockstun' && f.sinceBlock > 0.6) f.guard = Math.min(f.maxGuard, f.guard + 26 * 0.6 * STEP); } },
  { id: 'fury', n: '怒气', s: 'xue', r: 'c', d: '挨打获得的气翻倍。', hurt(c) { c.f.meter = Math.min(100, c.f.meter + c.m.dmg * 0.14); } },
  // ===== 机：条件 =====
  { id: 'full_hp', n: '完璧', s: 'jin', r: 'c', d: '满血时伤害 +25%。', out(c) { if (c.f.hp >= c.f.maxHp) c.dmg *= 1.25; } },
  { id: 'berserker', n: '狂血', s: 'xue', r: 'r', d: '每损失 2% 生命伤害 +1%（最多 +40%）。', out(c) { c.dmg *= 1 + Math.min(0.4, (1 - scHpPct(c.f)) * 0.5); } },
  { id: 'far_reach', n: '远攻', s: 'feng', r: 'c', d: '离对手越远伤害越高，400 距离时 +30%。', out(c) { c.dmg *= 1 + clamp((Math.abs(c.f.x - c.o.x) - 80) / 320, 0, 1) * 0.3; } },
  { id: 'wall_pin', n: '背水一战', s: 'jin', r: 'c', d: '对手靠近场地边缘时伤害 +30%。', out(c) { if (c.o.x < 160 || c.o.x > STAGE_W - 160) c.dmg *= 1.3; } },
  { id: 'clutch', n: '绝杀', s: 'xue', r: 'c', d: '回合最后 15 秒伤害 +35%。', out(c) { if (M.timer < 15) c.dmg *= 1.35; } },
  { id: 'opener', n: '起手式', s: 'jin', r: 'c', d: '每层前 3 次命中伤害 +30%。', out(c) { if ((c.f.sc.opened || 0) < 3) c.dmg *= 1.3; }, hit(c) { c.f.sc.opened = (c.f.sc.opened || 0) + 1; } },
  { id: 'untouched', n: '片叶不沾', s: 'ying', r: 'r', d: '5 秒没挨打时伤害 +30%。', out(c) { if (c.f.sinceHit > 5) c.dmg *= 1.3; } },
  { id: 'juggler', n: '浮空连段', s: 'feng', r: 'r', d: '浮空连段不再衰减，反而每多一段伤害 +10%。', out(c) { if (c.air) c.dmg *= 1 + Math.min(6, c.o.juggle || 0) * 0.1; } },
  { id: 'low_leech', n: '饮血', s: 'xue', r: 'c', d: '生命低于 30% 时，伤害的 20% 转为生命。', hit(c) { if (scHpPct(c.f) < 0.3) scHeal(c.f, c.dmg * 0.2); } },
  { id: 'stance_switch', n: '刚柔并济', s: 'qi', r: 'c', d: '轻击和重击交替命中时伤害 +20%。', out(c) { const k = c.light ? 'l' : c.heavy ? 'h' : ''; if (k && c.f.sc.lastK && k !== c.f.sc.lastK) c.dmg *= 1.2; }, hit(c) { c.f.sc.lastK = c.light ? 'l' : c.heavy ? 'h' : c.f.sc.lastK; } },
  { id: 'stun_bonus', n: '趁势', s: 'ying', r: 'c', d: '对手硬直中受到的伤害 +15%。', out(c) { if (c.o.state === 'hitstun' || c.o.state === 'launched') c.dmg *= 1.15; } },
  { id: 'block_punish', n: '破绽百出', s: 'jin', r: 'r', d: '对手刚格挡完的 1 秒内伤害 +40%。', out(c) { if ((c.o.sinceBlock || 9) < 1 && c.o.state !== 'block' && c.o.state !== 'blockstun') { c.dmg *= 1.4; scTxt(c.o, '破绽', '240,200,110'); } } },
  { id: 'full_meter_foe', n: '侠胆', s: 'jin', r: 'c', d: '对手气满时，你的伤害 +30%。', out(c) { if (c.o.meter >= 100) c.dmg *= 1.3; } },
  { id: 'odd_even', n: '阴阳', s: 'mo', r: 'c', d: '单数层伤害 +20%，双数层受到的伤害 -20%。', out(c) { if ((M.towerFloor || 1) % 2) c.dmg *= 1.2; }, inc(c) { if (!((M.towerFloor || 1) % 2)) c.dmg *= 0.8; } },
  { id: 'heat', n: '炽烈', s: 'xue', r: 'r', d: '1.5 秒内连续命中会积热，积满 10 层时爆发火焰让对手灼烧 4 秒。', hit(c) { const f = c.f; f.sc.heat = clock - (f.sc.heatAt || -9) < 1.5 ? (f.sc.heat || 0) + 1 : 1; f.sc.heatAt = clock; if (f.sc.heat >= 10) { f.sc.heat = 0; c.o.burnT = Math.max(c.o.burnT || 0, 4); scTxt(c.o, '炽烈', '255,140,50'); if (!RESIM) ring(c.o.x, c.o.y - 60, 120, '255,140,50', 0.4); } } },
  // ===== 毒：异常状态 =====
  { id: 'frost_lock', n: '玄霜凝骨', s: 'shuang', r: 'r', d: '近战命中让对手减速；连中 3 下冻结 0.45 秒。', hit(c) { if (c.proj) return; const o = c.o; o.frostSlow = 2.5; o.frostHits = (o.frostHits || 0) + 1; if (o.frostHits >= 3 && o.hp > 0) { o.frostHits = 0; scRoot(o, 0.45); SFX.frostHit(1.3); scTxt(o, '极寒冻结', '140,220,255'); } } },
  { id: 'bleed_rend', n: '断脉破罡', s: 'xue', r: 'r', d: '暴击、反击，或四成几率，让对手流血 4 跳。', hit(c) { if (c.counter || c.ev.big || scRnd() < 0.4) { c.o.bleedTicks = 4; c.o.bleedDmg = Math.max(4, Math.round(c.dmg * 0.12)); } } },
  { id: 'venom', n: '蛇毒', s: 'mo', r: 'c', d: '每次命中叠一层毒（最多 8 层），每层每秒 2 点伤害。', hit(c) { scPoison(c.o, 1); } },
  { id: 'virulent', n: '剧毒', s: 'mo', r: 'r', d: '反击命中时对手身上的毒层数翻倍。', hit(c) { if (c.counter && scSt(c.o).poison) scPoison(c.o, scSt(c.o).poison); } },
  { id: 'ignite', n: '引火', s: 'xue', r: 'c', d: '技能命中让对手灼烧 3 秒。', hit(c) { if (c.skill) c.o.burnT = Math.max(c.o.burnT || 0, 3); } },
  { id: 'wildfire', n: '燎原', s: 'xue', r: 'r', d: '打中灼烧中的对手伤害 +15%，灼烧延长 1 秒。', out(c) { if (c.o.burnT > 0) c.dmg *= 1.15; }, hit(c) { if (c.o.burnT > 0) c.o.burnT = Math.min(8, c.o.burnT + 1); } },
  { id: 'shatter', n: '碎冰', s: 'shuang', r: 'r', d: '重击打中被霜冻减速的对手，伤害 +50% 并震碎寒霜。', out(c) { if (c.heavy && c.o.frostSlow > 0) { c.dmg *= 1.5; c.o.frostSlow = 0; scTxt(c.o, '碎冰', '140,220,255'); SFX.frostHit(1.5); } } },
  { id: 'hemorrhage', n: '血崩', s: 'xue', r: 'c', d: '流血中的对手受到的伤害 +20%。', out(c) { if (c.o.bleedTicks > 0) c.dmg *= 1.2; } },
  { id: 'marked_prey', n: '猎印', s: 'ying', r: 'r', d: '每第 5 次命中给对手打上猎印，下一击双倍伤害。', out(c) { if (scSt(c.o).mark) { scSt(c.o).mark = 0; c.dmg *= 2; c.ev.big = true; scTxt(c.o, '猎印', '200,140,255'); } }, hit(c) { if (++c.f.sc.markN % 5 === 0) { scSt(c.o).mark = 1; scTxt(c.o, '印', '200,140,255', -20); } } },
  { id: 'static', n: '静电', s: 'lei', r: 'c', d: '命中给对手积静电，满 6 层时引下一道天雷（28 伤害）。', hit(c) { const s = scSt(c.o); s.static = (s.static || 0) + 1; if (s.static >= 6) { s.static = 0; scBolt(c.f, c.o.x, 28); } } },
  { id: 'weaken', n: '卸甲', s: 'mo', r: 'c', d: '命中让对手 3 秒内伤害 -15%。', hit(c) { scWeak(c.o, 3, 0.15); } },
  { id: 'expose', n: '洞穿', s: 'jin', r: 'r', d: '打破对手架势后，对手 4 秒内受到的伤害 +30%。', gb(f, o) { scVuln(o, 4, 0.3); scTxt(o, '洞穿', '240,200,110', 20); } },
  { id: 'root_strike', n: '钉骨', s: 'shuang', r: 'r', d: '反击命中会把对手钉在原地 0.5 秒。', hit(c) { if (c.counter && c.o.hp > 0) { scRoot(c.o, 0.5); scTxt(c.o, '钉骨', '140,220,255'); } } },
  { id: 'plague', n: '百病缠身', s: 'mo', r: 'e', d: '对手身上同时有 3 种以上异常时，所有持续伤害快一倍。', tick(f, o) { o.scFast = scStatuses(o) >= 3; } },
  { id: 'cauterize', n: '以火养身', s: 'xue', r: 'r', d: '对手灼烧时你每秒回复 2 点生命。', tick(f, o) { if (o.burnT > 0 && M.phase === 'fight') { f.sc.cau = (f.sc.cau || 0) + 2 * STEP; if (f.sc.cau >= 1) { f.sc.cau -= 1; scHeal(f, 1); } } } },
  { id: 'toxic_guard', n: '蚀骨', s: 'mo', r: 'c', d: '中毒的对手每跳毒还会掉 4 点架势。', poisonTick(f, o) { o.guard = Math.max(0, o.guard - 4); } },
  { id: 'frost_aura', n: '寒气逼人', s: 'shuang', r: 'c', d: '对手离你 120 距离内时会被持续减速。', tick(f, o) { if (scNear(f, o, 120)) o.frostSlow = Math.max(o.frostSlow || 0, 0.2); } },
  { id: 'chill_proj', n: '冰魄', s: 'shuang', r: 'c', d: '飞行道具命中让对手减速 2 秒。', hit(c) { if (c.proj) c.o.frostSlow = Math.max(c.o.frostSlow || 0, 2); } },
  { id: 'frost_armor', n: '霜甲', s: 'shuang', r: 'r', d: '近身打你的人会被冻得减速 1.5 秒。', hurt(c) { if (!c.proj) c.o.frostSlow = Math.max(c.o.frostSlow || 0, 1.5); } },
  { id: 'deep_freeze', n: '冰封', s: 'shuang', r: 'e', d: '对手被减速时你的伤害 +20%；对手被冻结时 +50%。', out(c) { if (c.o.rooted && c.o.state === 'hitstun') c.dmg *= 1.5; else if (c.o.frostSlow > 0) c.dmg *= 1.2; } },
  { id: 'chain_lightning', n: '连锁闪电', s: 'lei', r: 'r', d: '技能命中有 35% 几率在对手头顶再落一道雷。', hit(c) { if (c.skill && !c.m.scFx && scRnd() < 0.35) scBolt(c.f, c.o.x, 22); } },
  { id: 'thunder_mark', n: '雷印', s: 'lei', r: 'c', d: '绝技命中后，对手 5 秒内每 1 秒挨一道小雷（12 伤害）。', hit(c) { if (c.ult) c.f.sc.tmT = 5; }, tick(f, o) { if (f.sc.tmT > 0) { const t0 = f.sc.tmT; f.sc.tmT -= STEP; if (Math.floor(t0) !== Math.floor(f.sc.tmT)) scBolt(f, o.x, 12); } } },
  { id: 'overcharge', n: '雷霆万钧', s: 'lei', r: 'e', d: '气满时的普通攻击带雷，额外造成 10 点伤害并麻痹 0.2 秒。', hit(c) { if (c.f.meter >= 100 && !c.skill && !c.ult && !c.m.scFx) { scTrue(c.o, 10, '255,220,90'); if (c.o.hp > 0 && c.o.state === 'hitstun') c.o.stun += 0.2; } } },
  { id: 'storm_guard', n: '雷盾', s: 'lei', r: 'r', d: '精准招架时在对手头顶落雷。', blk(f, o, jg) { if (jg) scBolt(f, o.x, 24); } },
  // ===== 杂：其他打法 =====
  { id: 'charge_break', n: '蓄力破军', s: 'jin', r: 'r', d: '蓄力斩命中额外削掉对手 40 点架势。', hit(c) { if (/^cs/.test(c.f.moveName || '') && c.f.state === 'attack') { c.o.guard = Math.max(0, c.o.guard - 40); scTxt(c.o, '破军', '240,200,110'); } } },
  { id: 'proj_absorb', n: '纳气', s: 'qi', r: 'c', d: '被飞行道具打中时获得 10 点气、回复 5 点生命。', hurt(c) { if (c.proj) { scMeter(c.f, 10); scHeal(c.f, 5); } } },
  { id: 'listen_wind', n: '听风辨位', s: 'ying', r: 'r', d: '对手放绝技时你获得 30 点气和 0.5 秒无敌。', foeUlt(f) { scMeter(f, 30); f.invul = Math.max(f.invul, 0.5); scTxt(f, '听风辨位', '200,140,255'); } },
  { id: 'skill_heal', n: '妙手回春', s: 'xue', r: 'c', d: '每放一次技能回复 3% 最大生命。', skill(f) { scHeal(f, f.maxHp * 0.03); } },
  { id: 'guard_crush', n: '摧坚', s: 'jin', r: 'c', d: '打在对手格挡上时磨血翻三倍、削架势多一半。', blkOut(c) { c.chip *= 3; c.guardMul *= 1.5; } },
  { id: 'after_skill_light', n: '余劲', s: 'qi', r: 'r', d: '放完右键招式 1 秒内的下一次轻击伤害 +40%。', skill(f, o, slot) { if (slot === 2) f.sc.ask = 1 + 0.5; }, tick(f) { f.sc.ask = Math.max(0, (f.sc.ask || 0) - STEP); }, out(c) { if (c.light && c.f.sc.ask > 0) { c.f.sc.ask = 0; c.dmg *= 1.4; c.ev.big = true; } } },
  { id: 'pressure', n: '步步紧逼', s: 'jin', r: 'c', d: '朝对手走过去时受到的伤害 -15%。', inc(c) { const f = c.f; if (f.state === 'walk' && Math.sign(f.vx) === Math.sign(c.o.x - f.x)) c.dmg *= 0.85; } },
  { id: 'escape_strike', n: '回身斩', s: 'feng', r: 'c', d: '腾空闪后 1 秒内的空中攻击伤害 +40%。', esc(f) { f.sc.esT = 1.0; }, tick(f) { f.sc.esT = Math.max(0, (f.sc.esT || 0) - STEP); }, out(c) { if (c.f.sc.esT > 0 && c.f.y < -15 && !c.proj) c.dmg *= 1.4; } },
  { id: 'jg_heal', n: '吐故纳新', s: 'xue', r: 'c', d: '精准招架回复 8 点生命。', blk(f, o, jg) { if (jg) scHeal(f, 8); } },
  // ===== 险：好处大、代价真 =====
  { id: 'glass_cannon', n: '玉石俱焚', s: 'xian', r: 'x', d: '伤害 +45%，但受到的伤害 +35%。', out(c) { c.dmg *= 1.45; }, inc(c) { c.dmg *= 1.35; } },
  { id: 'blood_pact', n: '血契', s: 'xian', r: 'x', d: '放技能消耗当前生命的 6%，技能伤害 +60%。', skill(f) { scTrue(f, f.hp * 0.06, '255,90,100', true); }, out(c) { if (c.skill) c.dmg *= 1.6; } },
  { id: 'scorched_earth', n: '破釜沉舟', s: 'xian', r: 'x', d: '最大生命 -30%，伤害 +35%，气的获取 +30%。', start(f) { f.maxHp = Math.round(f.maxHp * 0.7); f.hp = Math.min(f.hp, f.maxHp); f.lagHp = f.hp; }, out(c) { c.dmg *= 1.35; } },
  { id: 'gambler', n: '孤注一掷', s: 'xian', r: 'x', d: '每次命中一半几率 1.7 倍伤害，一半几率 0.6 倍。', out(c) { c.dmg *= scRnd() < 0.5 ? 1.7 : 0.6; } },
  { id: 'overclock', n: '走火入魔', s: 'xian', r: 'x', d: '技能冷却减半，但每放一次技能自损 6 点生命。', skill(f, o, slot) { if (slot === 2) f.skill2CD *= 0.5; else f.skillCD *= 0.5; scTrue(f, 6, '255,120,60', true); } },
  { id: 'no_heal', n: '断情', s: 'xian', r: 'x', d: '伤害 +30%，但无法通过任何方式回复生命。', out(c) { c.dmg *= 1.3; } },
  { id: 'time_bomb', n: '倒悬', s: 'xian', r: 'x', d: '伤害 +30%；回合计时少于 10 秒后你每秒掉 4 点血。', out(c) { c.dmg *= 1.3; }, tick(f) { if (M.phase === 'fight' && M.timer < 10) { f.sc.tb = (f.sc.tb || 0) + 4 * STEP; if (f.sc.tb >= 1) { f.sc.tb -= 1; scTrue(f, 1, '255,120,60', true); } } } },
  { id: 'hunted', n: '众矢之的', s: 'xian', r: 'x', d: '对手伤害 +20%，但你每命中一次本层伤害永久 +2%（最多 +40%）。', inc(c) { c.dmg *= 1.2; }, out(c) { c.dmg *= 1 + Math.min(20, c.f.sc.hunt || 0) * 0.02; }, hit(c) { c.f.sc.hunt = (c.f.sc.hunt || 0) + 1; } },
  { id: 'vampire_curse', n: '血魔', s: 'xian', r: 'x', d: '伤害的 18% 转为生命，但每秒流失 2 点生命（最多掉到 1）。', hit(c) { scHeal(c.f, c.dmg * 0.18); }, tick(f) { if (M.phase === 'fight') { f.sc.vc = (f.sc.vc || 0) + 2 * STEP; if (f.sc.vc >= 1) { f.sc.vc -= 1; scTrue(f, 1, '255,90,100', true); } } } },
  { id: 'frail_fortress', n: '外强中干', s: 'xian', r: 'x', d: '架势上限翻倍，但最大生命 -20%。', start(f) { f.maxGuard *= 2; f.guard = f.maxGuard; f.maxHp = Math.round(f.maxHp * 0.8); f.hp = Math.min(f.hp, f.maxHp); f.lagHp = f.hp; } },
  { id: 'all_in', n: '一招定乾坤', s: 'xian', r: 'x', d: '绝技伤害 1.8 倍，但气的获取 -40%。', out(c) { if (c.ult) c.dmg *= 1.8; } },
  { id: 'thin_ice', n: '如履薄冰', s: 'xian', r: 'x', d: '冲刺和腾空闪冷却减半，但被反击时伤害 +50%。', dash(f) { f.dashCD *= 0.5; }, esc(f) { f.breakCD *= 0.5; }, inc(c) { if (c.f.state === 'attack' || c.f.state === 'skill') c.dmg *= 1.5; } },
  { id: 'cursed_blade', n: '妖刀', s: 'xian', r: 'x', d: '轻击伤害 +40%，重击伤害 -30%。', out(c) { if (c.light) c.dmg *= 1.4; else if (c.heavy) c.dmg *= 0.7; } },
  { id: 'reckless', n: '莽', s: 'xian', r: 'x', d: '再也打不出精准招架，但所有伤害 +25%、移速 +10%。', jg() { return -1; }, out(c) { c.dmg *= 1.25; }, spd() { return 1.1; } },
  { id: 'blood_price', n: '以命换命', s: 'xian', r: 'x', d: '每次命中自损 2 点生命，但伤害 +50%。', out(c) { c.dmg *= 1.5; }, hit(c) { if (!c.m.scFx) scTrue(c.f, 2, '255,90,100', true); } },
  // ===== 侠：只给对应的侠客 =====
  { id: 'qf_intent', n: '青锋 · 剑意满盈', s: 'hero', h: 'qingfeng', r: 'r', d: '两个技能每次命中额外获得 8 点气。', hit(c) { if (c.skill) scMeter(c.f, 8); } },
  { id: 'qf_loop', n: '青锋 · 游龙回旋', s: 'hero', h: 'qingfeng', r: 'e', d: '疾风斩命中重置剑气的冷却；剑气命中让疾风斩冷却减 2 秒。', hit(c) { if (c.src === 'gale') c.f.skill2CD = 0; else if (c.src === 'swordqi') c.f.skillCD = Math.max(0, c.f.skillCD - 2); } },
  { id: 'fy_ambush', n: '绯影 · 影袭', s: 'hero', h: 'feiying', r: 'e', d: '瞬身后 1.2 秒内的下一击 1.8 倍伤害。', skill(f, o, slot) { if (f.skill === 'blink') f.sc.amb = 1.2; }, tick(f) { f.sc.amb = Math.max(0, (f.sc.amb || 0) - STEP); }, out(c) { if (c.f.sc.amb > 0 && c.src !== 'blink') { c.f.sc.amb = 0; c.dmg *= 1.8; c.ev.big = true; scTxt(c.o, '影袭', '200,140,255'); } } },
  { id: 'fy_poison', n: '绯影 · 淬毒苦无', s: 'hero', h: 'feiying', r: 'r', d: '苦无命中叠 2 层毒。', hit(c) { if (c.src === 'kunai') scPoison(c.o, 2); } },
  { id: 'ts_vajra', n: '铁山 · 金刚不坏', s: 'hero', h: 'tieshan', r: 'r', d: '重击的霸体能多吃一下。', atk(f, o, name) { if (HEAVY_MOVES.includes(name)) f.armorHits = (f.armorHits || 0) + 1; } },
  { id: 'ts_aftershock', n: '铁山 · 震岳余波', s: 'hero', h: 'tieshan', r: 'e', d: '震地之后 0.4 秒再震一次。', skill(f) { if (f.skill === 'quake') { const x = f.x + f.face * 120; scLater(f, 0.4, () => scQuake(f, x, 20)); } } },
  { id: 'ls_frost_tip', n: '凌霜 · 寒芒枪尖', s: 'hero', h: 'lingshuang', r: 'r', d: '枪尖（最远端）命中让对手减速 2 秒，并积一层冻结。', hit(c) { if (!c.proj && !c.ult && Math.abs(c.o.x - c.f.x) >= 142) { c.o.frostSlow = Math.max(c.o.frostSlow || 0, 2); c.o.frostHits = (c.o.frostHits || 0) + 1; if (c.o.frostHits >= 3 && c.o.hp > 0) { c.o.frostHits = 0; scRoot(c.o, 0.45); } } } },
  { id: 'ls_turn', n: '凌霜 · 回马枪', s: 'hero', h: 'lingshuang', r: 'e', d: '回马枪命中重置旋枪的冷却，并获得 0.3 秒无敌。', hit(c) { if (c.src === 'backthrust') { c.f.skill2CD = 0; c.f.invul = Math.max(c.f.invul, 0.3); } } },
  { id: 'ly_ride', n: '流云 · 乘风', s: 'hero', h: 'liuyun', r: 'r', d: '在空中时飞行道具伤害 +30%。', out(c) { if (c.proj && c.f.y < -15) c.dmg *= 1.3; } },
  { id: 'ly_return', n: '流云 · 风刃回旋', s: 'hero', h: 'liuyun', r: 'e', d: '风刃放出 0.5 秒后再追加一道风刃。', skill(f) { if (f.skill === 'windblade') { const dir = f.face; scLater(f, 0.5, () => scWave(f, dir, 20, { kind: 'wind' })); } } },
  { id: 'lm_mark', n: '雷鸣 · 雷殛', s: 'hero', h: 'leiming', r: 'r', d: '雷拳命中后 2 秒内，你的下一次命中会引下一道天雷。', hit(c) { if (c.src === 'thunderfist') c.f.sc.lmT = 2; else if (c.f.sc.lmT > 0 && !c.m.scFx) { c.f.sc.lmT = 0; scBolt(c.f, c.o.x, 26); } }, tick(f) { f.sc.lmT = Math.max(0, (f.sc.lmT || 0) - STEP); } },
  { id: 'lm_guard', n: '雷鸣 · 金刚雷铠', s: 'hero', h: 'leiming', r: 'r', d: '雷铠的招架时间延长 0.4 秒。', skill(f) { if (f.skill === 'stomp') f.sc.tgExt = 0.4; }, tick(f) { if (f.sc.tgExt > 0 && f.state === 'skill' && f.skill === 'stomp' && f.thunderGuardT > 0 && f.thunderGuardT < 0.05) { f.thunderGuardT += f.sc.tgExt; f.sc.tgExt = 0; } } },
  { id: 'my_pond', n: '墨羽 · 墨池', s: 'hero', h: 'moyu', r: 'r', d: '墨水回复速度 +60%。', tick(f) { if (f.ch.inkShot) f.ink = Math.min(INK_MAX, (f.ink || 0) + INK_REGEN * 0.6 * STEP); } },
  { id: 'my_bold', n: '墨羽 · 浓墨重彩', s: 'hero', h: 'moyu', r: 'e', d: '墨水多于 50 时，每次命中消耗 5 点墨，伤害 +20%。', out(c) { if ((c.f.ink || 0) > 50) { c.f.ink -= 5; c.dmg *= 1.2; } } },
  { id: 'yh_full', n: '月华 · 月满', s: 'hero', h: 'yuehua', r: 'r', d: '自愈的总量 +80，并且没挨打 2 秒就开始回血。', start(f) { f.regenLeft = (f.regenLeft || 0) + 80; }, tick(f) { if (f.sinceHit > 2 && f.sinceHit <= 3 && f.regenLeft > 0 && f.hp < f.maxHp && M.phase === 'fight' && !scHas(f, 'no_heal')) { const h = Math.min(8 * STEP, f.regenLeft); f.hp = Math.min(f.maxHp, f.hp + h); f.regenLeft -= h; } } },
  { id: 'yh_mirror', n: '月华 · 镜花', s: 'hero', h: 'yuehua', r: 'e', d: '月镜格开攻击时回复 20 点生命、获得 15 点气。', parry(f) { scHeal(f, 20); scMeter(f, 15); } },
  { id: 'yl_sky', n: '燕翎 · 御空', s: 'hero', h: 'yanling', r: 'r', d: '在空中受到的伤害 -20%。', inc(c) { if (c.f.y < -15) c.dmg *= 0.8; } },
  { id: 'yl_chain', n: '燕翎 · 飞燕连环', s: 'hero', h: 'yanling', r: 'r', d: '飞镖命中让俯冲冷却减 1 秒。', hit(c) { if (c.src === 'darts') c.f.skillCD = Math.max(0, c.f.skillCD - 1); } },
  { id: 'yx_echo', n: '玉箫 · 余音', s: 'hero', h: 'yuxiao', r: 'r', d: '攻击命中攒音律的速度翻倍。', hit(c) { if (!c.proj && !c.ult) c.f.notes = Math.min(3, (c.f.notes || 0) + 1); } },
  { id: 'yx_wall', n: '玉箫 · 回音不绝', s: 'hero', h: 'yuxiao', r: 'e', d: '回音壁的反弹时间延长 0.5 秒。', skill(f) { if (f.skill === 'echowall') { f.reflectT = (f.reflectT || 0) + 0.5; f.armorT = Math.max(f.armorT, f.reflectT); } } },
  { id: 'zx_immortal', n: '醉翁 · 酒仙', s: 'hero', h: 'zuixian', r: 'r', d: '醉意的积累速度 +50%。', hit(c) { if (!c.ult) c.f.drunk = Math.min(100, (c.f.drunk || 0) + 2); }, skill(f) { f.drunk = Math.min(100, (f.drunk || 0) + 15); } },
  { id: 'zx_sprawl', n: '醉翁 · 醉卧', s: 'hero', h: 'zuixian', r: 'e', d: '醉意在 80 以上时受到的伤害 -25%。', inc(c) { if ((c.f.drunk || 0) >= 80) c.dmg *= 0.75; } },
  { id: 'gc_soul', n: '勾陈 · 锁魂', s: 'hero', h: 'gouchen', r: 'r', d: '钩住对手的时间延长 1 秒。', hit(c) { if (c.o.hookedT > 0 && !c.f.sc.hooked) { c.f.sc.hooked = 1; c.o.hookedT += 1; } }, tick(f, o) { if (!(o.hookedT > 0)) f.sc.hooked = 0; } },
  { id: 'gc_sweep', n: '勾陈 · 链锤横扫', s: 'hero', h: 'gouchen', r: 'e', d: '旋锤打中被钩住的对手伤害 +40%。', out(c) { if (c.src === 'whirl' && c.o.hookedT > 0) c.dmg *= 1.4; } },
  { id: 'lq_thread', n: '凌雀 · 穿针引线', s: 'hero', h: 'lingque', r: 'r', d: '针印持续时间从 3.5 秒延长到 6.5 秒。', hit(c) { if (c.o.needleMark > 0 && c.o.needleMark >= 3.4) c.o.needleMark = 6.5; } },
  { id: 'lq_drop', n: '凌雀 · 针落', s: 'hero', h: 'lingque', r: 'e', d: '近战打中带针印的对手时引爆针印，追加 25 点伤害。', hit(c) { if (!c.proj && c.o.needleMark > 0) { c.o.needleMark = 0; scTrue(c.o, 25, '235,110,210'); scTxt(c.o, '针落', '235,110,210'); } } },
  // ===== 天书：全服讨伐天魔，每击败一代解锁一卷 =====
  { id: 'tian_thunder', n: '天书 · 九霄雷劫', s: 'lei', r: 'l', d: '每 5 秒在对手头顶落下一道 34 伤害的天雷。', tick(f, o) { if (M.phase !== 'fight') return; f.sc.tt = (f.sc.tt || 0) + STEP; if (f.sc.tt >= 5) { f.sc.tt = 0; scBolt(f, o.x, 34); } } },
  { id: 'tian_rebirth', n: '天书 · 涅槃', s: 'xue', r: 'l', d: '每层第一次倒下时以 40% 生命复活。', fatal(c) { if (c.f.sc.reborn) return false; c.f.sc.reborn = 1; c.f.hp = Math.round(c.f.maxHp * 0.4); c.f.lagHp = c.f.hp; c.f.invul = 2; scTxt(c.f, '涅槃', '255,140,50', 15); if (!RESIM) ring(c.f.x, c.f.y - 60, 220, '255,140,50', 0.6); return true; } },
  { id: 'tian_timeless', n: '天书 · 光阴', s: 'qi', r: 'l', d: '技能冷却永远快一倍。', cd() { return 1; } },
  { id: 'tian_mirror', n: '天书 · 镜像', s: 'ying', r: 'l', d: '你的每次飞行道具都会再复制一发反向飞出。', proj(f, p) { if (!p.scFx && !p.scCopy && p.vx) { const q = { ...p, vx: -p.vx, x: f.x - (p.x - f.x), scCopy: true, scFx: true }; scLater(f, 0, () => { if (!isClient()) projs.push(Object.assign({ id: ++projSeq, owner: f.idx, vy: 0, life: 1, age: 0, hits: 0, hitCD: 0, delay: 0, isProj: true }, q)); }); } } },
  { id: 'tian_frost', n: '天书 · 绝对零度', s: 'shuang', r: 'l', d: '每次命中都积一层冻结，连中 3 下冻结 0.8 秒。', hit(c) { const o = c.o; o.frostSlow = 2.5; o.tfz = (o.tfz || 0) + 1; if (o.tfz >= 3 && o.hp > 0) { o.tfz = 0; scRoot(o, 0.8); scTxt(o, '绝对零度', '140,220,255'); } } },
  { id: 'tian_vortex', n: '天书 · 吞天', s: 'mo', r: 'l', d: '对手每秒被拉向你，靠近时每秒受 6 点伤害。', tick(f, o) { if (M.phase !== 'fight' || o.hp <= 0) return; if (!o.rooted) o.x += Math.sign(f.x - o.x) * 40 * STEP; if (scNear(f, o, 150)) { f.sc.vt = (f.sc.vt || 0) + 6 * STEP; if (f.sc.vt >= 1) { f.sc.vt -= 1; scTrue(o, 1, '170,170,200'); } } } },
  { id: 'tian_aegis', n: '天书 · 不灭金身', s: 'jin', r: 'l', d: '受到的单次伤害最多只有你最大生命的 8%。', inc(c) { c.dmg = Math.min(c.dmg, c.f.maxHp * 0.08); } },
  { id: 'tian_wind', n: '天书 · 逍遥游', s: 'feng', r: 'l', d: '移速 +30%，冲刺不再有冷却。', spd() { return 1.3; }, dash(f) { f.dashCD = 0.05; } },
  { id: 'tian_blade', n: '天书 · 万剑归宗', s: 'jin', r: 'l', d: '每次轻击命中都放出一道 14 伤害的剑气。', hit(c) { if (c.light) scWave(c.f, c.f.face, 14); } },
  { id: 'tian_heart', n: '天书 · 心如止水', s: 'qi', r: 'l', d: '气永远不低于 50。', tick(f) { if (f.meter < 50 && f.state !== 'special') f.meter = 50; } },
];
// ---------- 天魔讨伐：天魔的词缀（也是秘卷，只是装在 B 身上） ----------
const BOSS_AFFIXES = [
  { id: 'bx_enrage', n: '狂暴', d: '生命低于一半后伤害 +30%。', out(c) { if (scHpPct(c.f) < 0.5) c.dmg *= 1.3; } },
  { id: 'bx_thunder', n: '雷霆', d: '每 7 秒在你头顶落雷。', tick(f, o) { if (M.phase !== 'fight') return; f.sc.bt = (f.sc.bt || 0) + STEP; if (f.sc.bt >= 7) { f.sc.bt = 0; scBolt(f, o.x, 30); } } },
  { id: 'bx_regen', n: '再生', d: '4 秒没挨打就每秒回复 1% 生命。', tick(f) { if (f.sinceHit > 4 && M.phase === 'fight') { f.sc.br = (f.sc.br || 0) + f.maxHp * 0.01 * STEP; if (f.sc.br >= 1) { const n = Math.floor(f.sc.br); f.sc.br -= n; f.hp = Math.min(f.maxHp, f.hp + n); } } } },
  { id: 'bx_thorns', n: '荆棘', d: '近身打它会反受 10% 伤害。', hurt(c) { if (!c.proj) scTrue(c.o, c.dmg * 0.1, '255,120,120', true); } },
  { id: 'bx_armor', n: '玄甲', d: '受到的伤害 -15%，架势上限翻倍。', inc(c) { c.dmg *= 0.85; }, start(f) { f.maxGuard *= 2; f.guard = f.maxGuard; } },
  { id: 'bx_frost', n: '寒魄', d: '打中你会让你减速。', hit(c) { c.o.frostSlow = Math.max(c.o.frostSlow || 0, 1.5); } },
  { id: 'bx_venom', n: '瘴毒', d: '打中你会叠一层毒。', hit(c) { scPoison(c.o, 1); } },
  { id: 'bx_haste', n: '疾行', d: '移速 +25%，技能冷却 -30%。', spd() { return 1.25; }, skill(f, o, slot) { if (slot === 2) f.skill2CD *= 0.7; else f.skillCD *= 0.7; } },
];
const SC_BY = {};
for (const s of SCROLLS) SC_BY[s.id] = s;
for (const s of BOSS_AFFIXES) { s.s = 'xian'; s.r = 'x'; SC_BY[s.id] = s; }

// ---------- 谁有哪些秘卷 ----------
function scOn() { return M.mode === 'tower' || M.mode === 'boss' || M.mode === 'saga'; }
function scIds(f) { return !f ? [] : f.idx === 0 ? (M.towerPerks || []) : f.idx === 1 ? (M.foeScrolls || []) : []; }
function scHas(f, id) { return scOn() && scIds(f).includes(id); }
function scList(f) {
  const ids = scIds(f);
  if (!f.sc || f.sc.key !== ids.length + ':' + ids[ids.length - 1]) { f.sc = f.sc || {}; f.sc.key = ids.length + ':' + ids[ids.length - 1]; f.sc.list = ids.map(id => SC_BY[id]).filter(Boolean); }
  return f.sc.list;
}
function scCount(f, school) { let n = 0; for (const s of scList(f)) if (s.s === school) n++; return n; }
function scReso(f, school) { return scOn() && scCount(f, school) >= SC_RESONANCE; }
function scFire(f, hook, ...a) { if (!scOn() || !f || f.idx > 1) return; for (const s of scList(f)) if (s[hook]) s[hook](f, ...a); }
function scAny(f, hook, ...a) { if (!scOn() || !f || f.idx > 1) return false; for (const s of scList(f)) if (s[hook] && s[hook](f, ...a)) return true; return false; }
function scFireC(f, hook, c) { if (!scOn() || !f || f.idx > 1) return; for (const s of scList(f)) if (s[hook]) s[hook](c); }

// ---------- 接进对战的地方 ----------
function scRoundStart() {
  if (!scOn()) return;
  for (const f of [A, B]) {
    f.sc = { lc: 0, markN: 0 }; f.st = {}; f.scFast = false; f.spd = 1;
    scFire(f, 'start', foeOf(f));
  }
}
// 一次命中扣血之前：c.dmg 可以被改；返回 c（c.cancel 为真表示这一下被化解，不扣血）
function scDamage(att, def, m, ev, dmg, counter) {
  const proj = !!m.isProj, ult = !!m.ult || att.state === 'special';
  const src = proj ? (m.src || '') : att.state === 'skill' ? att.skill : '';
  const skill = !ult && !!(m.sk || att.state === 'skill' || (proj && SKILLS[m.src]));
  const name = !proj && att.state === 'attack' ? att.moveName || '' : '';
  const c = { f: att, o: def, m, ev, dmg, counter: !!counter, proj, ult, skill, src,
    light: /^l\d|^a1$/.test(name), heavy: HEAVY_MOVES.includes(name) || name === 'a2', air: def.y < -2 || def.state === 'launched' };
  // 闪避（防守方先判）
  const dc = { ...c, f: def, o: att };
  if ((scReso(def, 'ying') && !ult && scRnd() < 0.08) || scAnyC(def, 'dodge', dc)) {
    if (!RESIM) { smoke(def.x, def.y - 50, 5); addP({ type: 'text', text: '闪', x: def.x, y: def.y - 120, life: 0.6, max: 0.6, rgb: '200,140,255' }); }
    def.invul = Math.max(def.invul, 0.2); c.cancel = true; c.dodged = true; return c;
  }
  scFireC(att, 'out', c);
  if (scReso(att, 'mo')) c.dmg *= 1.1;
  const sa = att.st || {};
  if (sa.weakT > 0) c.dmg *= 1 - (sa.weak || 0);
  const sd = def.st || {};
  if (sd.vulnT > 0) c.dmg *= 1 + (sd.vuln || 0);
  const ic = { ...c, f: def, o: att, dmg: c.dmg };
  scFireC(def, 'inc', ic);
  if (scReso(def, 'jin')) ic.dmg *= 0.9;
  c.dmg = Math.max(0, ic.dmg);
  if (def.hp - c.dmg <= 0 && def.hp > 0) {
    const fc = { ...ic, dmg: c.dmg };
    if (scAnyC(def, 'fatal', fc)) { c.cancel = true; ev.dd = 0; }
  }
  return c;
}
function scAnyC(f, hook, c) { if (!scOn() || !f || f.idx > 1) return false; for (const s of scList(f)) if (s[hook] && s[hook](c)) return true; return false; }
// 扣血之后
function scAfterHit(att, def, m, ev, dmg, counter, pre) {
  if (!scOn()) return;
  const c = { ...pre, dmg };
  scFireC(att, 'hit', c);
  if (scReso(att, 'xue')) scHeal(att, dmg * 0.06);
  scFireC(def, 'hurt', { ...c, f: def, o: att });
}
// 格挡：返回改过的削血比例和架势倍数
function scBlockMod(att, def, m) {
  const c = { f: att, o: def, m, chip: 1, guardMul: 1, heavy: !m.isProj && att.state === 'attack' && HEAVY_MOVES.includes(att.moveName) };
  if (!scOn()) return c;
  scFireC(att, 'blkOut', c);
  scFireC(def, 'blkIn', c);
  return c;
}
function scJG(f) {
  let w = 0.09;
  if (!scOn() || f.idx > 1) return w;
  for (const s of scList(f)) if (s.jg) { const v = s.jg(f); if (v < 0) return -1; w = Math.max(w, v); }
  return w;
}
function scSpd(f) {
  let k = (f.frostSlow > 0 ? (scReso(foeOf(f), 'shuang') ? 0.5 : 0.75) : 1);
  if (!scOn() || f.idx > 1) return k;
  for (const s of scList(f)) if (s.spd) k *= s.spd(f);
  if (scReso(f, 'feng')) k *= 1.12;
  return k;
}
function scProj(f, p) { if (scOn() && f && f.idx <= 1) for (const s of scList(f)) if (s.proj) s.proj(f, p); }
// 每帧：异常状态结算、延迟效果、秘卷的 tick、冷却额外流速
function scTick(f, foe) {
  if (!scOn() || f.idx > 1 || !f.sc) return;
  const st = f.st || (f.st = {}), fast = f.scFast ? 2 : 1;
  if (st.poison > 0 && M.phase === 'fight') {
    st.poisonT -= STEP; st.pT = (st.pT || 0) + STEP * fast;
    if (st.pT >= 0.5) { st.pT = 0; scTrue(f, st.poison, '150,220,110'); scFire(foe, 'poisonTick', f); }
    if (st.poisonT <= 0) st.poison = 0;
  }
  if (st.vulnT > 0) st.vulnT = Math.max(0, st.vulnT - STEP);
  if (st.weakT > 0) st.weakT = Math.max(0, st.weakT - STEP);
  if (fast > 1 && f.bleedTicks > 0) f.bleedTimer = (f.bleedTimer || 0) + STEP;
  if (f.sc.q && f.sc.q.length) {
    for (const e of f.sc.q) e.t -= STEP;
    const due = f.sc.q.filter(e => e.t <= 0); f.sc.q = f.sc.q.filter(e => e.t > 0);
    for (const e of due) e.fn();
  }
  if (M.phase !== 'fight' && M.phase !== 'intro') return;
  let cd = 0;
  for (const s of scList(f)) { if (s.tick) s.tick(f, foe); if (s.cd) cd += s.cd(f); }
  if (cd > 0) scCdCut(f, STEP * cd);
  if (scReso(f, 'lei') && M.phase === 'fight') { f.sc.rl = (f.sc.rl || 0) + STEP; if (f.sc.rl >= 8) { f.sc.rl = 0; scBolt(f, foe.x, 24); } }
  if (scReso(f, 'feng')) f.dashCD = Math.max(0, f.dashCD - STEP * 0.25);
}

// ---------- 抽卷 ----------
// 天书要全服击败天魔才解锁：解锁了几卷记在 GBOSS.kills（从服务器拿，本机缓存一份）
function scLegendUnlocked() { const n = typeof gbossKills === 'function' ? gbossKills() : 0; return SCROLLS.filter(s => s.r === 'l').slice(0, n).map(s => s.id); }
function scPool(heroId) {
  const legend = new Set(scLegendUnlocked());
  return SCROLLS.filter(s => (!s.h || s.h === heroId) && (s.r !== 'l' || legend.has(s.id)));
}
function scDraw(heroId, owned, n = 3) {
  const pool = scPool(heroId).filter(s => !owned.includes(s.id));
  const out = [];
  const bag = [...pool];
  while (out.length < n && bag.length) {
    // 侠客专属和同流派的卷子更容易出：帮你凑出一套打法
    const school = {}; for (const id of owned) { const s = SC_BY[id]; if (s) school[s.s] = (school[s.s] || 0) + 1; }
    const w = bag.map(s => SC_RARITY[s.r].w * (s.h ? 1.6 : 1) * (1 + Math.min(3, school[s.s] || 0) * 0.25));
    let r = scRnd() * w.reduce((a, b) => a + b, 0), i = 0;
    while (i < bag.length - 1 && (r -= w[i]) > 0) i++;
    out.push(bag.splice(i, 1)[0]);
  }
  return out;
}
// 卡片上的图标：按流派画一个简单的符号
const SC_GLYPH = {
  lei: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>', shuang: '<path d="M12 2v20M2 12h20M4.9 4.9l14.2 14.2M4.9 19.1L19.1 4.9"/>',
  xue: '<path d="M12 2.7l5.7 5.7a8 8 0 1 1-11.3 0z"/>', mo: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18 4.5 4.5 0 0 0 0-9 4.5 4.5 0 0 1 0-9"/>',
  feng: '<path d="M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h8"/>', jin: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  ying: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>', qi: '<path d="M12 3c4 4 4 8 0 9s-4 5 0 9M7 6c3 2 3 4 0 6M17 12c-3 2-3 4 0 6"/>',
  xian: '<path d="M12 2l3 7h7l-5.5 4.5 2 7.5L12 17l-6.5 4 2-7.5L2 9h7z"/>', hero: '<path d="M4 20L18 6l2-4-4 2L2 18zM14 4l6 6"/>'
};
function scIcon(s) { const c = SC_SCHOOLS[s.s] || SC_SCHOOLS.jin; return `<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="rgb(${c.rgb})" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${SC_GLYPH[s.s] || SC_GLYPH.jin}</svg>`; }
function scTag(s) { const c = SC_SCHOOLS[s.s] || SC_SCHOOLS.jin; return `<span class="tp-tag" style="color:rgb(${c.rgb})">${c.n} · ${SC_RARITY[s.r].n}</span>`; }
// 当前这套秘卷的流派共鸣说明
function scResoLines(ids) {
  const n = {}; for (const id of ids) { const s = SC_BY[id]; if (s && SC_RESO[s.s]) n[s.s] = (n[s.s] || 0) + 1; }
  return Object.entries(n).map(([k, v]) => `${SC_SCHOOLS[k].n} ${Math.min(v, SC_RESONANCE)}/${SC_RESONANCE}${v >= SC_RESONANCE ? '：' + SC_RESO[k] : ''}`);
}
