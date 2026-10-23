// 改版前（4.5 版 73c8ff4）的电脑 AI，只给 tools/ai-arena.mjs 当强度对照用，游戏里不加载
const OLD_LEVELS = {
  easy:   { think: [0.35, 0.7],  block: 0.15, aggr: 0.4,  combo: 1 },
  normal: { think: [0.18, 0.42], block: 0.4,  aggr: 0.58, combo: 3 },
  hard:   { think: [0.08, 0.22], block: 0.72, aggr: 0.75, combo: 4 },
  impossible: { think: [0.012, 0.035], block: 0.99, aggr: 0.95, combo: 5, god: true },   // 绝顶：几乎零反应时间、必挡、被连必逃
  god:    { think: [0.005, 0.018], block: 0.99, aggr: 0.98, combo: 6, god: true, neural: true }, // 天道：全英雄对抗深度强化神经网络决策、极致预判与精准破招
};

const OLD_AI_COMBOS = [
  [['light', 0], ['light', 0.12], ['light', 0.24], ['light', 0.36], ['light', 0.48], ['light', 0.6], ['light', 0.72], ['light', 0.84], ['light', 0.96], ['light', 1.08]],
  [['light', 0], ['light', 0.17], ['light', 0.34], ['light', 0.52], ['light', 0.72]],
  [['light', 0], ['light', 0.17], ['light', 0.34]],
  [['heavy', 0]],
  [['light', 0], ['light', 0.17], ['heavy', 0.34]],
  [['light', 0], ['light', 0.17], ['heavy', 0.34], ['jump', 0.62], ['light', 0.78], ['light', 0.96], ['heavy', 1.2]],
];

// 电脑什么时候放大招
const OLD_ULT_AI = {
  crescent: (m, f, d) => d < 330, shadows: (m, f, d) => d < 330, avalanche: (m, f, d) => d < 700 && f.onGround(),
  phoenix: (m, f, d) => d < 230, timestop: (m, f, d) => d < 700, tornado: (m, f, d) => d < 650, thunder: () => true,
  inkdragon: (m, f) => (m.fu || 0) >= 2 || m.hp < m.maxHp * 0.5 || f.hp < FU_BASE + FU_PER * (m.fu || 0), featherstorm: (m, f, d) => d < 500, guangling: (m, f, d) => d < 700, shanshui: () => true, eightimm: (m, f, d) => d < 300, skynet: (m, f, d) => d < 600, moonflow: (m, f, d) => d < 230 || m.hp < m.maxHp * 0.45,
};
// 技能之后顺手接的动作
const OLD_SKILL_FOLLOW = { gale: [['light', 0.42], ['light', 0.6], ['light', 0.78]], blink: [['light', 0.32], ['light', 0.48], ['light', 0.64], ['heavy', 0.84]] };
// 神经网络推理辅助函数（用于天道 God 难度模型，预分配缓冲区实现零 GC 推理）
const OLD_AI_H1 = new Float32Array(64);
const OLD_AI_H2 = new Float32Array(32);
const OLD_AI_LOGITS = new Float32Array(10);
const OLD_AI_PROBS = new Float32Array(10);
const OLD_AI_OBS = new Float32Array(31);

function OLD_aiPredictPolicy(heroId, obs) {
  try {
    let m = null;
    if (M.mode === 'watch2v2' && typeof window !== 'undefined' && window.RENYING_2V2_MODEL && window.RENYING_2V2_MODEL.weights) {
      m = window.RENYING_2V2_MODEL;
    } else {
      const models = typeof window !== 'undefined' ? window.RENYING_HERO_MODELS : null;
      if (!models || !models[heroId]) return null;
      m = models[heroId];
    }
    const { W1, b1, W2, b2, W3, b3 } = m.weights;
    const n1 = b1.length, n2 = b2.length, n3 = b3.length, nIn = obs.length;
    for (let j = 0; j < n1; j++) OLD_AI_H1[j] = b1[j];
    for (let i = 0; i < nIn; i++) {
      const xi = obs[i];
      if (xi === 0) continue;
      const wRow = W1[i];
      if (!wRow) continue;
      for (let j = 0; j < n1; j++) OLD_AI_H1[j] += xi * wRow[j];
    }
    for (let j = 0; j < n1; j++) if (OLD_AI_H1[j] < 0) OLD_AI_H1[j] = 0;

    for (let j = 0; j < n2; j++) OLD_AI_H2[j] = b2[j];
    for (let i = 0; i < n1; i++) {
      const h1i = OLD_AI_H1[i];
      if (h1i === 0) continue;
      const wRow = W2[i];
      for (let j = 0; j < n2; j++) OLD_AI_H2[j] += h1i * wRow[j];
    }
    for (let j = 0; j < n2; j++) if (OLD_AI_H2[j] < 0) OLD_AI_H2[j] = 0;

    let maxL = -Infinity;
    for (let j = 0; j < n3; j++) {
      let sum = b3[j];
      for (let i = 0; i < n2; i++) sum += OLD_AI_H2[i] * W3[i][j];
      OLD_AI_LOGITS[j] = sum;
      if (sum > maxL) maxL = sum;
    }
    // Low-temperature softmax (T = 0.25 -> invTemp = 4.0) sharpens optimal action selection in God Mode
    let expSum = 0;
    for (let j = 0; j < n3; j++) {
      OLD_AI_PROBS[j] = Math.exp((OLD_AI_LOGITS[j] - maxL) * 4.0);
      expSum += OLD_AI_PROBS[j];
    }
    const invSum = 1 / (expSum || 1);
    for (let j = 0; j < n3; j++) OLD_AI_PROBS[j] *= invSum;
    return OLD_AI_PROBS;
  } catch (e) {
    return null;
  }
}

function OLD_extractAIObs(me, foe) {
  OLD_AI_OBS[0] = (foe.x - me.x) / STAGE_W;
  OLD_AI_OBS[1] = (foe.y - me.y) / 400;
  OLD_AI_OBS[2] = Math.abs(foe.x - me.x) / STAGE_W;
  OLD_AI_OBS[3] = me.hp / me.maxHp;
  OLD_AI_OBS[4] = foe.hp / foe.maxHp;
  OLD_AI_OBS[5] = (me.guard || 0) / (me.maxGuard || 100);
  OLD_AI_OBS[6] = (foe.guard || 0) / (foe.maxGuard || 100);
  OLD_AI_OBS[7] = (me.meter || 0) / 100;
  OLD_AI_OBS[8] = (foe.meter || 0) / 100;
  OLD_AI_OBS[9] = me.vy / 600;
  OLD_AI_OBS[10] = foe.vy / 600;
  OLD_AI_OBS[11] = me.face;
  OLD_AI_OBS[12] = foe.face;
  OLD_AI_OBS[13] = me.state === 'attack' ? 1 : 0;
  OLD_AI_OBS[14] = me.state === 'block' || me.state === 'blockstun' ? 1 : 0;
  OLD_AI_OBS[15] = me.state === 'hitstun' || me.state === 'launched' ? 1 : 0;
  OLD_AI_OBS[16] = me.onGround() ? 0 : 1;
  OLD_AI_OBS[17] = foe.state === 'attack' ? 1 : 0;
  OLD_AI_OBS[18] = foe.state === 'block' || foe.state === 'blockstun' ? 1 : 0;
  OLD_AI_OBS[19] = foe.state === 'hitstun' || foe.state === 'launched' ? 1 : 0;
  OLD_AI_OBS[20] = foe.onGround() ? 0 : 1;
  OLD_AI_OBS[21] = Math.min(1, (me.skillCD || 0) / 6);
  OLD_AI_OBS[22] = Math.min(1, (me.skill2CD || 0) / 6);
  OLD_AI_OBS[23] = Math.min(1, (me.breakCD || 0) / 10);
  let projNear = 0;
  for (let i = 0; i < projs.length; i++) {
    const p = projs[i];
    if ((p.owner % 2 !== me.idx % 2) && p.dmg > 0 && Math.abs(me.x - p.x) < 300) {
      projNear = (p.x - me.x) / STAGE_W;
      break;
    }
  }
  OLD_AI_OBS[24] = projNear;

  // 2v2 Co-op 31-dim features (features 25-30)
  if (M.mode === 'watch2v2' && typeof ARENA2V2 !== 'undefined') {
    const mate = (me.idx % 2 === 0) ? (me.idx === 0 ? C : A) : (me.idx === 1 ? D : B);
    if (mate) {
      OLD_AI_OBS[25] = (mate.x - me.x) / STAGE_W;
      OLD_AI_OBS[26] = (mate.y - me.y) / 400;
      OLD_AI_OBS[27] = mate.hp > 0 ? (mate.hp / mate.maxHp) : 0;
      OLD_AI_OBS[28] = (mate.state === 'hitstun' || mate.state === 'launched') ? 1 : 0;
      OLD_AI_OBS[29] = (mate.target && me.target && mate.target === me.target) ? 1 : 0;
    } else {
      OLD_AI_OBS[25] = 0; OLD_AI_OBS[26] = 0; OLD_AI_OBS[27] = 0; OLD_AI_OBS[28] = 0; OLD_AI_OBS[29] = 0;
    }
    OLD_AI_OBS[30] = (STAGE_W / 2 - me.x) / STAGE_W;
    return OLD_AI_OBS;
  }

  return OLD_AI_OBS.subarray(0, 25);
}

class OldAICtrl extends Ctrl {
  constructor(level) {
    super();
    this.level = level;
    this.L = OLD_LEVELS[level] || OLD_LEVELS.normal;
    this.queue = [];
    this.next = 0;
    this.holdDown = 0;
    this.dir = 0;
    this.reacted = false;
    this.projReact = false;
    this.lastOppId = null;
    this.lastMeId = null;
    this.tactic = null;
  }
  updateTactic(me, foe) {
    if (!me || !foe || !me.ch || !foe.ch) return;
    this.lastOppId = foe.ch.id;
    this.lastMeId = me.ch.id;
    if (me.state !== 'attack') {
      this.queue = [];
      this.next = 0;
    }
    this.holdDown = 0;
    this.reacted = false;
    this.projReact = false;

    const meCh = me.ch, foeCh = foe.ch;
    const isAdvantage = (meCh.beats || []).includes(foeCh.id);
    const isDisadvantage = (meCh.weakTo || []).includes(foeCh.id) || (foeCh.beats || []).includes(meCh.id);
    const foeIsRanged = (foeCh.stat && foeCh.stat.reach && foeCh.stat.reach > 1.1) || ['liuyun', 'moyu'].includes(foeCh.id);
    const foeIsHeavy = (foeCh.stat && foeCh.stat.weight && foeCh.stat.weight > 1.15) || ['tieshan', 'leiming', 'gouchen'].includes(foeCh.id);
    const foeIsFast = (foeCh.stat && foeCh.stat.speed && foeCh.stat.speed > 0.9) || ['feiying', 'yanling'].includes(foeCh.id);
    const foeHasParry = foeCh.skill === 'mirror';
    const foeHasSpear = foeCh.passive === 'tip';

    const baseRange = meCh.ai && meCh.ai.range ? [...meCh.ai.range] : [60, 160];
    let rMin = baseRange[0], rMax = baseRange[1];

    if (foeIsRanged) {
      rMin = Math.max(40, rMin * 0.7);
      rMax = Math.max(rMin + 45, rMax * 0.75);
    } else if (foeIsHeavy) {
      rMin = Math.min(rMin * 1.25, 130);
      rMax = Math.max(rMax * 1.15, 200);
    } else if (foeHasSpear) {
      if (baseRange[0] < 120) rMax = 135;
      else rMin = 245;
    }

    this.tactic = {
      isAdvantage,
      isDisadvantage,
      foeIsRanged,
      foeIsHeavy,
      foeIsFast,
      foeHasParry,
      foeHasSpear,
      range: [rMin, rMax],
      aggrMul: isAdvantage ? 1.25 : (isDisadvantage ? 0.85 : 1.0),
      blockMul: isDisadvantage ? 1.2 : (isAdvantage ? 0.9 : 1.0)
    };
  }
  plan(list) { this.queue = list.map(([a, dt]) => ({ at: clock + dt, a })); }
  // 困在蓬莱境里：看不见自己和对手在哪，不看对手出招也不看暗器，只能凭感觉乱走、乱挡、乱打
  blindThink(me) {
    if ((me.state === 'launched' || (me.state === 'hitstun' && me.comboHits >= 3)) && me.breakCD <= 0 && me.t > 0.1 && Math.random() < this.L.block * 0.012) this.press('dash');   // 挨打是摸得出来的
    while (this.queue.length && this.queue[0].at <= clock) { const a = this.queue.shift().a; if (a !== 'chargeStart' && a !== 'chargeEnd') this.press(a); }
    this.holdDown = Math.max(0, this.holdDown - STEP);
    if (clock >= this.next && !this.queue.length && this.holdDown <= 0) {
      this.next = clock + rand(0.3, 0.7);
      const r = Math.random();
      this.dir = Math.random() < 0.5 ? -1 : 1;
      if (r < 0.3) this.plan([['light', 0], ['light', 0.2]]);
      else if (r < 0.5) { this.dir = 0; this.holdDown = rand(0.4, 0.9); }
      else if (r < 0.58) this.plan([['jump', 0]]);
      else if (r < 0.64 && me.skillCD <= 0) this.plan([['skill', 0]]);
      else if (r < 0.75) this.dir = 0;
    }
    this.held.down = this.holdDown > 0; this.held.atk = false; this.held.jump = false;
    this.held.left = this.dir < 0; this.held.right = this.dir > 0;
  }
  think(me, foe) {
    if (me.veilT > 0) return this.blindThink(me);
    if (!this.tactic || this.lastOppId !== foe.ch.id || this.lastMeId !== me.ch.id) {
      this.updateTactic(me, foe);
    }
    const tactic = this.tactic;
    const L = this.L, d = Math.abs(foe.x - me.x), to = Math.sign(foe.x - me.x) || 1;
    const ch = me.ch, [rMin, rMax] = tactic.range, S = SKILLS[ch.skill];
    const aggr = L.aggr * tactic.aggrMul, blockRate = Math.min(0.99, L.block * tactic.blockMul);
    if ((me.state === 'launched' || me.state === 'knockdown' || (me.state === 'hitstun' && me.comboHits >= 3)) && me.breakCD <= 0 && me.t > 0.1 && Math.random() < blockRate * 0.018) this.press('dash');
    if (L.god && (me.state === 'hitstun' || me.state === 'launched') && me.comboHits >= 2 && me.breakCD <= 0) this.press('dash');   // 绝顶/天道：被连两下就闪
    while (this.queue.length && this.queue[0].at <= clock) {
      const a = this.queue.shift().a;
      if (a === 'chargeStart') { this.held.atk = true; this.atkT = clock - CHARGE_START; }
      else if (a === 'chargeEnd') this.held.atk = false;
      else if (a === 'jump' && me.ch.fly) { this.press('jump'); this.flyUntil = clock + rand(0.5, 1.4); }
      else this.press(a);
    }
    if (!this.queue.length) this.held.atk = false;
    this.holdDown = Math.max(0, this.holdDown - STEP);
    const free = me.onGround() && ['idle', 'walk', 'block'].includes(me.state);
    // 看到对手出招：防御，月华会用月镜
    const isFoeHeavy = foe.state === 'attack' && foe.move && (foe.move.unblockable || foe.move.knock || foe.moveName === 'cs1' || foe.moveName === 'cs2' || (foe.move.guardBreakMul && foe.move.guardBreakMul > 1.2));
    const threat = foe.state === 'attack' && foe.move && foe.t < foe.move.su + 0.04 && d < foe.move.box[2] + 70;
    if (threat && !this.reacted) {
      this.reacted = true;
      if (free) {
        if (isFoeHeavy && Math.random() < blockRate * 0.85) {
          if (me.dashCD <= 0 && Math.random() < 0.6) { this.queue = []; this.dir = -to; this.press('dash'); }
          else { this.queue = []; this.press('jump'); this.dir = -to; }
        } else if (ch.skill === 'mirror' && me.skillCD <= 0 && Math.random() < blockRate * 0.9) { this.queue = []; this.press('skill'); }
        else if (Math.random() < blockRate) { this.holdDown = 0.38; this.queue = []; this.dir = 0; }
      }
    }
    if (foe.state !== 'attack') this.reacted = false;
    // 看到敌方飞行道具：跳或挡；看到雷印就走开（同队队友暗器不避让）
    const inc = projs.find(p => (p.owner % 2 !== me.idx % 2) && !p.fx && p.dmg > 0 && p.delay <= 0 && p.kind !== 'trap' && Math.sign(me.x - p.x) === Math.sign(p.vx) && Math.abs(me.x - p.x) < 280);
    if (inc && !this.projReact) {
      this.projReact = true;
      if (free && Math.random() < blockRate) {
        if (inc.unblockable || inc.groundOnly || Math.random() < 0.5) { this.queue = []; this.press('jump'); this.dir = to; }
        else { this.holdDown = 0.35; this.queue = []; }
      }
    }
    if (!inc) this.projReact = false;
    const bolt = projs.find(p => p.kind === 'bolt' && (p.owner % 2 !== me.idx % 2) && p.delay > 0 && Math.abs(p.x - me.x) < 80);
    if (bolt && Math.random() < blockRate * 0.2) { this.dir = me.x >= bolt.x ? 1 : -1; this.next = clock + 0.25; this.queue = []; }
    const trap = projs.find(p => p.kind === 'trap' && (p.owner % 2 !== me.idx % 2) && Math.abs(p.x - me.x) < 110 && Math.sign(p.x - me.x) === this.dir);
    if (trap && me.onGround() && Math.random() < blockRate * 0.15) this.press('jump');

    if (clock >= this.next && !this.queue.length && this.holdDown <= 0) {
      this.next = clock + rand(L.think[0], L.think[1]);
      const r = Math.random();
      this.dir = 0;
      const atkRange = me.moves.l1.box[2] + 22;

      // 2v2 专属战场大局观（争夺太阴灵丹/增益符、阻截对手抢点、利用灵泉调息）
      if (M.mode === 'watch2v2' && typeof ARENA2V2 !== 'undefined') {
        const cx = STAGE_W / 2;
        if (ARENA2V2.orb && ARENA2V2.orb.active) {
          const k = ARENA2V2.orb.kind; // 0: 破军神火, 1: 太阴灵丹, 2: 紫微星魄
          const dAltar = Math.abs(me.x - cx);
          const mate = (me.idx % 2 === 0) ? (me.idx === 0 ? C : A) : (me.idx === 1 ? D : B);
          const activeFoes = foesOf(me).filter(ef => !ef.hidden && ef.hp > 0);
          
          let closestFoe = null, minFoeAltar = 9999;
          for (const ef of activeFoes) {
            const df = Math.abs(ef.x - cx);
            if (df < minFoeAltar) { minFoeAltar = df; closestFoe = ef; }
          }
          
          const wantLingDan = (k === 1) && (me.hp < me.maxHp * 0.75 || (mate && mate.hp <= 0));
          const wantBuff = (k === 0 || k === 2) || wantLingDan;

          // 1. 阻截/卡位策略：敌方英雄逼近祭坛企图夺取灵丹/增益
          if (closestFoe && minFoeAltar < 280) {
            const canIntercept = Math.abs(me.x - closestFoe.x) < atkRange + 90;
            if (canIntercept && (dAltar <= minFoeAltar + 70)) {
              this.dir = Math.sign(closestFoe.x - me.x) || to;
              if (me.skillCD <= 0 && S.ai(me, closestFoe, Math.abs(closestFoe.x - me.x))) {
                this.plan([['skill', 0], ...(OLD_SKILL_FOLLOW[ch.skill] || [])]);
                return;
              } else if (me.skill2CD <= 0 && SKILLS[ch.skill2].ai(me, closestFoe, Math.abs(closestFoe.x - me.x))) {
                this.plan([['skill2', 0]]);
                return;
              } else if (Math.abs(closestFoe.x - me.x) <= atkRange) {
                this.plan(OLD_AI_COMBOS[Math.min(L.combo, OLD_AI_COMBOS.length - 1)]);
                return;
              } else {
                return;
              }
            }
          }

          // 2. 夺取策略：优先抢夺太阴灵丹回血或争夺强力增益
          if (wantBuff && (dAltar < minFoeAltar + 140)) {
            const mateRushing = mate && mate.hp > 0 && Math.abs(mate.x - cx) < dAltar && (k !== 1 || mate.hp < me.hp);
            if (!mateRushing) {
              if (dAltar < 48 && me.onGround()) {
                this.dir = Math.sign(cx - me.x) || to;
                this.plan([['jump', 0]]);
                return;
              } else {
                this.dir = Math.sign(cx - me.x);
                if (dAltar > 120 && me.dashCD <= 0 && Math.random() < 0.65) {
                  this.press('dash');
                  return;
                }
                return;
              }
            }
          }
        }

        // 3. 御风灵泉调息策略：技能全在大冷却且临近灵泉时借风御空减CD
        if (ARENA2V2.geysers && (me.skillCD > 2.2 || me.skill2CD > 2.2)) {
          for (const g of ARENA2V2.geysers) {
            if (g.cd <= 0 && Math.abs(me.x - g.x) < 180 && Math.abs(me.x - g.x) > 30) {
              if (Math.random() < 0.35) {
                this.dir = Math.sign(g.x - me.x);
                return;
              }
            }
          }
        }
      }

      // 天道 (God) 难度：先调用离线全门派对抗训练的神经网络预测最优战术策略
      let neuralAct = -1;
      if (L.neural) {
        const obs = OLD_extractAIObs(me, foe);
        const probs = OLD_aiPredictPolicy(ch.id, obs);
        if (probs) {
          let pickR = Math.random(), acc = 0;
          for (let pi = 0; pi < probs.length; pi++) {
            acc += probs[pi];
            if (pickR <= acc) { neuralAct = pi; break; }
          }
        }
      }

      // 0:idle, 1:left, 2:right, 3:down, 4:jump, 5:atk, 6:skill1, 7:skill2, 8:dash, 9:special
      if (neuralAct === 9 && me.meter >= 100 && OLD_ULT_AI[ch.ult](me, foe, d)) {
        this.plan([['special', 0]]);
      } else if (neuralAct === 8 && me.dashCD <= 0 && d > 120) {
        this.dir = to; this.press('dash');
      } else if (neuralAct === 7 && me.skill2CD <= 0 && SKILLS[ch.skill2].ai(me, foe, d)) {
        this.plan([['skill2', 0]]);
      } else if (neuralAct === 6 && me.skillCD <= 0 && S.ai(me, foe, d)) {
        this.plan([['skill', 0], ...(OLD_SKILL_FOLLOW[ch.skill] || [])]);
      } else if (neuralAct === 5 && d <= atkRange + 30) {
        this.plan(OLD_AI_COMBOS[Math.min(L.combo, OLD_AI_COMBOS.length - 1)]);
      } else if (neuralAct === 4 && me.onGround()) {
        this.dir = to; this.plan([['jump', 0], ['light', 0.22]]);
      } else if (neuralAct === 3) {
        this.holdDown = 0.35;
      } else if (neuralAct === 1 || neuralAct === 2) {
        this.dir = (neuralAct === 2 && to > 0) || (neuralAct === 1 && to < 0) ? to : -to;
      } else if (foe.rooted && foe.state === 'hitstun') {
        if (d < 300 && r < 0.6) this.plan([['chargeStart', 0], ['chargeEnd', 0.8], ['light', 0.96]]);
        else this.dir = to;
      }
      else if ((foe.hookedT || 0) > 0 && foe.state === 'hitstun' && d <= atkRange + 30) this.plan(OLD_AI_COMBOS[Math.random() * Math.min(L.combo, OLD_AI_COMBOS.length) | 0]);
      else if (foe.state === 'knockdown' || foe.state === 'getup') { this.dir = d > atkRange ? to : 0; }
      else if (me.meter >= 100 && OLD_ULT_AI[ch.ult](me, foe, d) && r < 0.5) this.plan([['special', 0]]);
      else if (me.skillCD <= 0 && S.ai(me, foe, d) && r < 0.4) this.plan([['skill', 0], ...(OLD_SKILL_FOLLOW[ch.skill] || [])]);
      else if (me.skill2CD <= 0 && SKILLS[ch.skill2].ai(me, foe, d) && r < 0.62) this.plan([['skill2', 0]]);
      else if (me.hp < me.maxHp * 0.3 && d < 150 && r < 0.2) { this.dir = -to; }
      else if (d > rMax) { this.dir = to; if (r < 0.15) this.plan([['jump', 0]]); }
      else if (d < rMin && rMin > 110) {           // 远程和长枪：太近了先还手或把人推开，再拉开距离
        if (d <= atkRange && r < L.aggr * 0.6) this.plan(OLD_AI_COMBOS[Math.random() * Math.min(L.combo, OLD_AI_COMBOS.length) | 0]);
        else if (me.skillCD <= 0 && S.ai(me, foe, d) && r < 0.6) this.plan([['skill', 0]]);
        else if (r < 0.75) this.dir = -to;
        else if (r < 0.88) { this.dir = -to; this.plan([['jump', 0], ['jump', 0.22]]); }
        else this.holdDown = 0.3;
      } else if (d <= atkRange) {
        if (r < L.aggr) this.plan(OLD_AI_COMBOS[Math.random() * Math.min(L.combo, OLD_AI_COMBOS.length) | 0]);
        else if (r < L.aggr + 0.18) this.holdDown = 0.4;
        else this.dir = -to;
      } else {
        if (r < L.aggr * 0.45) this.dir = to;
        else if (r < L.aggr * 0.7) { this.dir = to; this.plan([['jump', 0], ['light', 0.3]]); }
        else if (r < L.aggr) { this.dir = to; this.plan([['light', 0.2]]); }
        else if (r < L.aggr + 0.1) { const r2 = rand(0.35, 1.0); this.plan([['chargeStart', 0], ['chargeEnd', r2], ['light', r2 + 0.16]]); }
        else if (r < 0.85) this.dir = -to;
      }
    }
    // 往后退却快撞墙了：跳过对手头顶
    if (this.dir === -to && ((this.dir < 0 && me.x < WALL + 130) || (this.dir > 0 && me.x > STAGE_W - WALL - 130))) {
      this.dir = to; if (me.onGround() && !this.queue.length) this.plan([['jump', 0], ['jump', 0.25]]);
    }
    if (me.state === 'special' && me.ch.ult === 'avalanche') {
      this.dir = Math.abs(me.x - foe.x) > 40 ? to : 0;
      if (Math.abs(me.x - foe.x) < 80 && me.t > 0.2) this.holdDown = 0.3;
    }
    this.held.down = this.holdDown > 0;
    this.held.jump = !!(me.ch.fly && clock < (this.flyUntil || 0));
    this.held.left = this.dir < 0; this.held.right = this.dir > 0;
  }
}


window.OldAICtrl = OldAICtrl;
