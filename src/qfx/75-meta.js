/* ---------------- 存档：章首快照、战绩 ---------------- */
const SAVE_KEY = 'qfx2';
const Save = {
  d: null,
  blank() { return { v: 1, soul: 0, up: {}, rec: { best: 0, clears: 0, bestTime: 0, maxCombo: 0, kills: 0, runs: 0, deaths: 0 }, set: {}, tut: 0, run: null }; },
  load() {
    if (this.d) return this.d; let d = null;
    try { d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (_) {}
    if (!d || d.v !== 1) d = this.blank();
    const b = this.blank(); for (const k in b) if (d[k] === undefined) d[k] = b[k]; for (const k in b.rec) if (d.rec[k] === undefined) d.rec[k] = 0;
    return this.d = d;
  },
  write() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.d)); } catch (_) {} },
  /* 章首快照：整局成长都记下，死了可以从本章开头重来 */
  snapRun() {
    const d = this.load();
    d.run = { ch: G.chapter, lv: Pl.lv, xp: Pl.xp, gold: Math.floor(Pl.gold), pots: Pl.pots, swordLv: Pl.swordLv, bodyLv: Pl.bodyLv, qiLv: Pl.qiLv, perks: Object.assign({}, Pl.perks),
      slots: Pl.slots.slice(), ult: Pl.ult, skLv: Object.assign({}, Pl.skLv), rage: Math.round(Pl.rage), metaRevive: Pl.metaRevive, playT: G.playT, kills: G.kills, dmg: Math.round(G.dmgDone), maxCombo: G.maxCombo };
    this.write();
  },
  run() { return this.load().run; },
  clearRun() { this.load().run = null; this.write(); },
  applyRun(r) {
    Object.assign(Pl, { lv: r.lv, xp: r.xp, gold: r.gold, pots: r.pots, swordLv: r.swordLv, bodyLv: r.bodyLv, qiLv: r.qiLv, perks: Object.assign({}, r.perks), slots: (r.slots || ['qi', null, null]).slice(), ult: r.ult || null, skLv: Object.assign({}, r.skLv || { qi: 1 }), rage: r.rage || 0, metaRevive: !!r.metaRevive });
    recalc(); Pl.hp = Pl.maxHp; Pl.mp = Pl.maxMp; Pl.shield = pk('shield') ? 1 : 0; setSwordTier();
    Object.assign(G, { playT: r.playT, kills: r.kills, dmgDone: r.dmg, maxCombo: r.maxCombo });
  },
  /* 战绩：过关、通关、阵亡时更新 */
  stageDone(n) { const r = this.load().rec; if (!G.endless && n > r.best) r.best = n; this.write(); },
  kill() { this.load().rec.kills++; },
  runEnd(win) {
    const r = this.load().rec; r.maxCombo = Math.max(r.maxCombo, G.maxCombo);
    if (win) { r.clears++; if (!r.bestTime || G.playT < r.bestTime) r.bestTime = Math.round(G.playT); } else r.deaths++;
    this.write();
  },
};
const fmtTime = s => { s = Math.round(s); const m = Math.floor(s / 60); return `${m}:${('0' + (s % 60)).slice(-2)}`; };

/* ---------------- 剑魄与藏经阁：死了也留得住的东西 ---------------- */
const META = [
  { id: 'gu', n: '根骨', max: 5, cost: l => 30 + 25 * l, d: l => `生命上限 +${6 * l}%` },
  { id: 'jian', n: '剑骨', max: 5, cost: l => 30 + 25 * l, d: l => `攻击 +${5 * l}%` },
  { id: 'dan', n: '丹房', max: 2, cost: l => 50 + 50 * l, d: l => `开局多带 ${l} 枚回春丹` },
  { id: 'pan', n: '盘缠', max: 3, cost: l => 40 + 30 * l, d: l => `开局铜钱 +${40 * l}` },
  { id: 'wu', n: '悟性', max: 2, cost: l => 80 + 70 * l, d: l => `每章可重掷破境卡 ${l} 次` },
  { id: 'xia', n: '剑匣', max: 1, cost: () => 160, d: () => '开局 E 槽自带一门随机剑技' },
  { id: 'yuan', n: '宿缘', max: 2, cost: l => 90 + 60 * l, d: l => `开局自带 ${l} 道随机机缘` },
  { id: 'hun', n: '回魂', max: 1, cost: () => 220, d: () => '每局一次，濒死时回复三成生命' },
];
const up = k => Save.load().up[k] || 0;
function buyMeta(m) { const d = Save.load(), l = up(m.id); if (l >= m.max || d.soul < m.cost(l)) return false; d.soul -= m.cost(l); d.up[m.id] = l + 1; Save.write(); return true; }
function addSoul(n) { n = Math.round(n); if (n <= 0) return 0; const d = Save.load(); d.soul += n; d.rec.souls = (d.rec.souls || 0) + n; Save.write(); return n; }
/* 新开一局时把藏经阁的修为带上 */
function applyMetaStart() {
  Pl.pots += up('dan'); Pl.gold += 40 * up('pan'); Pl.metaRevive = up('hun') > 0;
  if (up('xia')) { const ids = Object.keys(SK).filter(k => k !== 'qi'); learnSkill(pick(ids)); }
  for (let i = 0; i < up('yuan'); i++) { const pool = PERKS.filter(p => p.r === 1 && pk(p.id) < p.max && !p.need); if (pool.length) takePerk(pick(pool)); }
  recalc(); Pl.hp = Pl.maxHp; Pl.mp = Pl.maxMp;
}

/* ---------------- 设置 ---------------- */
const SET0 = { q: -1, sens: 1, shake: 1, nums: 1, vol: .8 };
const setting = k => { const s = Save.load().set; return s[k] === undefined ? SET0[k] : s[k]; };
function setSetting(k, v) { Save.load().set[k] = v; Save.write(); applySettings(); }
function applySettings() { if (Snd.out && !Snd.muted) Snd.out.gain.value = .55 * setting('vol') / .8; }
