/* ---------------- 章节与关卡：三章十关 ---------------- */
const CHAPTERS = [
  { id: 'gate', n: '山门', idx: '第一章', sub: '暮山试剑', stages: [1, 2, 3],
    story: '暮色四合，黑风寨夜袭青云剑宗。师兄弟尽数下山未归，偌大试剑坪上，只剩你一人一剑。' },
  { id: 'bamboo', n: '竹林', idx: '第二章', sub: '月下追影', stages: [4, 5, 6],
    story: '寨主授首，残党遁入后山竹海。月色如水，竹影深处藏着一群不肯露脸的人。' },
  { id: 'tomb', n: '剑冢', idx: '第三章', sub: '万剑同悲', stages: [7, 8, 9, 10],
    story: '一路追上绝顶，才知祸根埋在剑冢。沉睡三百年的剑魔醒了，满山断剑都在低鸣。' },
];
/* 每关分几拨来敌：前一拨快清完时下一拨压上 */
const STAGES = [null,
  { name: '山贼探路', waves: [{ bandit: 5 }, { bandit: 4, archer: 1 }] },
  { name: '狼嚎四野', waves: [{ wolf: 4, bandit: 3 }, { spear: 3, bandit: 2, archer: 1 }, { brute: 1, wolf: 3 }] },
  { name: '黑风寨主', boss: 'boss1', waves: [{ boss1: 1 }] },
  { name: '林间冷箭', waves: [{ wolf: 4, archer: 2 }, { assassin: 2, spear: 3 }, { assassin: 2, wolf: 3, archer: 1 }] },
  { name: '竹影幢幢', waves: [{ assassin: 3, archer: 2 }, { wraith: 2, spear: 3, wolf: 2 }, { brute: 1, assassin: 3, wraith: 1 }] },
  { name: '无相', boss: 'boss3', waves: [{ boss3: 1 }] },
  { name: '冢前孤魂', waves: [{ slave: 3, wraith: 2 }, { spirit: 5, slave: 2 }, { brute: 1, slave: 2, wraith: 2 }] },
  { name: '剑灵出鞘', waves: [{ spirit: 7, slave: 1 }, { slave: 3, wraith: 2, spirit: 3 }, { brute: 2, spirit: 5 }] },
  { name: '万剑同悲', waves: [{ slave: 4, spirit: 4 }, { brute: 1, wraith: 3, spirit: 5 }, { brute: 2, slave: 3, spirit: 4 }] },
  { name: '剑魔临世', boss: 'boss2', waves: [{ boss2: 1 }] },
];
const LAST_STAGE = 10;
const chapterOf = n => n <= 3 ? 0 : n <= 6 ? 1 : 2;
const isChapterEnd = n => CHAPTERS.some(c => c.stages[c.stages.length - 1] === n);
/* 无尽试炼：十关之后随机配兵，每五关一位旧日强敌 */
function stageDef(n) {
  if (STAGES[n]) return STAGES[n];
  if (n % 5 === 0) { const b = ['boss1', 'boss3', 'boss2'][(n / 5) % 3]; return { name: '强敌再临', boss: b, waves: [{ [b]: 1 }] }; }
  const cost = { bandit: 1, wolf: 1, archer: 1.5, spear: 1.5, wraith: 2, brute: 4, assassin: 2, slave: 2.5, spirit: .8 }, ks = Object.keys(cost), waves = [];
  for (let w = 0; w < 3; w++) { let b = 10 + (n - 10) * 2; const comp = {}; while (b > 0) { const k = pick(ks); if (k === 'archer' && (comp.archer || 0) >= 2) continue; comp[k] = (comp[k] || 0) + 1; b -= cost[k]; } waves.push(comp); }
  return { name: '无尽试炼', waves };
}
function fillQueue(comp) {
  const q = []; for (const k in comp) for (let i = 0; i < comp[k]; i++) q.push(k);
  for (let i = q.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [q[i], q[j]] = [q[j], q[i]]; }
  G.queue = q.concat(G.queue);
}
function startStage(n) {
  const st = stageDef(n); G.stage = n; G.inter = 0; G.intro = false; G.clearT = 0; G.bossDead = false; G.sub = 0; G.subT = 0; G.waves = st.waves; G.stageName = st.name; G.k0 = G.kills;
  G.maxTokens = Math.min(4, 2 + Math.floor(n / 4)); G.cap = Math.min(13, 6 + Math.floor(n / 2)); G.tokens = 0; for (const e of G.enemies) e.token = false;
  G.queue = []; fillQueue(G.waves[0]); G.spawnT = 1.1;
  if (st.boss) UI.banner(st.name, ET[st.boss].name, 'red');
  else { UI.banner(`第${cnNum(n)}关`, st.name, ''); Snd.gong(); }
}
function spawnFromQueue() {
  const type = G.queue.pop(), boss = ET[type].boss, R = World.R; let x, z, tries = 0;
  do { const a = rand(TAU), r = boss ? 15 : rand(13, 24); x = Pl.pos.x + Math.cos(a) * r; z = Pl.pos.z + Math.sin(a) * r; } while (Math.hypot(x, z) > R - 3 && tries++ < 30);
  if (Math.hypot(x, z) > R - 3) { const a = rand(TAU); x = Math.cos(a) * 20; z = Math.sin(a) * 20; }
  const p = new V3(x, 0, z); collide(p, 1); const eliteP = G.stage >= 3 ? Math.min(.28, .07 + .02 * (G.stage - 3)) : 0; spawnEnemy(type, p.x, p.z, { elite: Math.random() < eliteP });
}
function updateStage(dt) {
  G.atkGap = (G.atkGap || 0) - dt * G.enemyTS;
  if (G.clearT > 0) { G.clearT -= dt; if (G.clearT <= 0) Game.chapterClear(); return; }
  if (Tut.on) { Tut.update(dt); return; }
  if (G.inter > 0) { G.inter -= dt; if (G.inter <= 0 || Input.hit('Enter')) startStage(G.stage + 1); return; }
  const alive = G.enemies.filter(e => e.state !== 'dead').length;
  if (G.queue.length && alive < G.cap) { G.spawnT -= dt; if (G.spawnT <= 0) { spawnFromQueue(); G.spawnT = alive < 3 ? .25 : .7; } }
  // 前一拨快清完（只剩一两个）就压上下一拨
  if (!G.queue.length && G.sub < G.waves.length - 1 && alive <= (G.waves.length > 2 ? 2 : 1)) {
    G.subT += dt; if (G.subT > 1.4) { G.subT = 0; G.sub++; fillQueue(G.waves[G.sub]); G.spawnT = .6; UI.toast(G.sub === G.waves.length - 1 ? '敌军殿后压上' : '援兵将至', 2.2); Snd.gong(); }
  }
  if (!G.queue.length && G.sub >= G.waves.length - 1 && G.enemies.length === 0 && G.stage > 0 && Pl.state !== 'dead') stageClear();
}
function stageClear() {
  const n = G.stage;
  try { if (parent !== window) parent.postMessage({ qfx: 'wave', n }, '*'); } catch (_) {}
  G.hazards.length = 0; Pl.mp = Pl.maxMp; Save.stageDone(n);
  const sg = addSoul((4 + 2 * Math.min(n, 12)) * (stageDef(n).boss ? 3 : 1) + (G.kills - (G.k0 ?? G.kills)) * .25); G.soulRun = (G.soulRun || 0) + sg; setTimeout(() => UI.toast(`剑魄 +${sg}`, 1.6), 900);
  if (!G.endless && n === LAST_STAGE) { Game.victory(); return; }
  if (!G.endless && isChapterEnd(n)) { G.clearT = 3.2; const ch = CHAPTERS[chapterOf(n)]; UI.banner(`${ch.n} · 已破`, ch.idx + ' · ' + ch.sub, 'gold'); Snd.level(); return; }
  G.inter = G.endless ? 15 : 20; healPlayer(Pl.maxHp * .1); UI.banner('敌势暂歇', `第${cnNum(n)}关已过`, 'gold'); Snd.level();
}
