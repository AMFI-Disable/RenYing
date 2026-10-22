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
      playT: G.playT, kills: G.kills, dmg: Math.round(G.dmgDone), maxCombo: G.maxCombo };
    this.write();
  },
  run() { return this.load().run; },
  clearRun() { this.load().run = null; this.write(); },
  applyRun(r) {
    Object.assign(Pl, { lv: r.lv, xp: r.xp, gold: r.gold, pots: r.pots, swordLv: r.swordLv, bodyLv: r.bodyLv, qiLv: r.qiLv, perks: Object.assign({}, r.perks) });
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
