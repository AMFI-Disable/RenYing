/* ---------------- 章节，和每一处战斗里一拨接一拨的来敌 ---------------- */
const CHAPTERS = [
  { id: 'gate', n: '山门', idx: '第一章', sub: '暮山试剑',
    story: '暮色四合，黑风寨夜袭青云剑宗。师兄弟尽数下山未归，偌大试剑坪上，只剩你一人一剑。' },
  { id: 'bamboo', n: '竹林', idx: '第二章', sub: '月下追影',
    story: '寨主授首，残党遁入后山竹海。月色如水，竹影深处藏着一群不肯露脸的人。' },
  { id: 'tomb', n: '剑冢', idx: '第三章', sub: '万剑同悲',
    story: '一路追上绝顶，才知祸根埋在剑冢。沉睡三百年的剑魔醒了，满山断剑都在低鸣。' },
];
function fillQueue(comp) {
  const q = []; for (const k in comp) for (let i = 0; i < comp[k]; i++) q.push(k);
  for (let i = q.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [q[i], q[j]] = [q[j], q[i]]; }
  G.queue = q.concat(G.queue);
}
function spawnFromQueue() {
  const type = G.queue.pop(), boss = ET[type].boss, R = World.R; let x, z, tries = 0;
  do { const a = rand(TAU), r = boss ? 15 : rand(13, 24); x = Pl.pos.x + Math.cos(a) * r; z = Pl.pos.z + Math.sin(a) * r; } while (Math.hypot(x, z) > R - 3 && tries++ < 30);
  if (Math.hypot(x, z) > R - 3) { const a = rand(TAU); x = Math.cos(a) * 20; z = Math.sin(a) * 20; }
  const p = new V3(x, 0, z); collide(p, 1); spawnEnemy(type, p.x, p.z, { elite: Math.random() < (G.eliteP || 0) });
}
function updateStage(dt) {
  G.atkGap = (G.atkGap || 0) - dt * G.enemyTS;
  if (G.clearT > 0) { G.clearT -= dt; if (G.clearT <= 0) Game.chapterClear(); return; }
  if (Tut.on) { Tut.update(dt); return; }
  if (G.rlDoneT > 0) { G.rlDoneT -= dt; if (G.rlDoneT <= 0) Run.afterFight(); return; }
  if (!Run.node) return;
  const alive = G.enemies.filter(e => e.state !== 'dead').length;
  if (G.queue.length && alive < G.cap) { G.spawnT -= dt; if (G.spawnT <= 0) { spawnFromQueue(); G.spawnT = alive < 3 ? .25 : .7; } }
  // 前一拨快清完（只剩一两个）就压上下一拨
  if (!G.queue.length && G.sub < G.waves.length - 1 && alive <= (G.waves.length > 2 ? 2 : 1)) {
    G.subT += dt; if (G.subT > 1.4) { G.subT = 0; G.sub++; fillQueue(G.waves[G.sub]); G.spawnT = .6; UI.toast(G.sub === G.waves.length - 1 ? '敌军殿后压上' : '援兵将至', 2.2); Snd.gong(); }
  }
  if (!G.queue.length && G.sub >= G.waves.length - 1 && G.enemies.length === 0 && G.stage > 0 && (Net.on ? coopAnyAlive() : Pl.state !== 'dead') && !G.cleared) { G.cleared = true; stageClear(); }
}
function stageClear() { Save.stageDone(G.stage); Run.won(); }
