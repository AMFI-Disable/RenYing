// ---------- 电脑踢球 ----------
// 不用论剑的电脑：它只会盯着对手打。这里按境界调反应快慢、出脚准不准、会不会扑救、凌空抽射与协防
const CUJU_AI = {
  easy:       { react: 0.28, look: 0.12, behind: 70, reach: 95,  atkP: 0.55, skillP: 0.08, ultP: 0.2, save: 0,   tackle: 0.04, dash: 0.05 },
  normal:     { react: 0.17, look: 0.2,  behind: 58, reach: 105, atkP: 0.75, skillP: 0.16, ultP: 0.4, save: 0.4, tackle: 0.1,  dash: 0.12 },
  hard:       { react: 0.11, look: 0.26, behind: 52, reach: 110, atkP: 0.88, skillP: 0.26, ultP: 0.6, save: 0.7, tackle: 0.16, dash: 0.2 },
  impossible: { react: 0.075, look: 0.3, behind: 50, reach: 112, atkP: 0.95, skillP: 0.34, ultP: 0.8, save: 0.85, tackle: 0.2, dash: 0.25 },
  god:        { react: 0.055, look: 0.32, behind: 48, reach: 115, atkP: 1,   skillP: 0.4,  ultP: 0.9, save: 0.95, tackle: 0.24, dash: 0.3 },
};
class CujuAICtrl extends Ctrl {
  constructor(level) { super(); this.level = CUJU_AI[level] ? level : 'normal'; this.L = CUJU_AI[this.level]; this.wait = 0; }
  updateTactic() {}
  think(me, foe) {
    const cj = M.cuju, h = this.held, L = this.L;
    if (!cj || !cj.ball || cj.pause > 0 || M.phase !== 'fight') { this.clear(); return; }
    this.wait -= STEP;
    if (this.wait > 0) return;   // 反应间隔里保持上一次的按键
    this.wait = L.react * (0.7 + Math.random() * 0.6);
    const b = cj.ball, d = cujuAttackDir(me), R = cujuBallR();
    const t = L.look, px = clamp(b.x + b.vx * t, WALL + 40, STAGE_W - WALL - 40);
    const py = Math.min(-R, b.y + b.vy * t + 0.5 * CUJU.G * t * t);
    const rel = (px - me.x) * d;          // 墨球在我进攻方向的前面（正）还是身后（负）
    const ownGoalX = d > 0 ? WALL + CUJU.GD : STAGE_W - WALL - CUJU.GD;
    const hgt = -py, near = Math.abs(b.x - me.x);
    h.left = h.right = h.down = h.up = h.atk = false;
    let move = 0, face = d;

    // 扑救与回防：球快速飞向我家球门，支持低球扑救与高球跳拦
    const incoming = (b.x - me.x) * d > 0 && b.vx * d < -380;
    if (incoming && Math.abs(b.x - me.x) < 260 && Math.abs(me.x - ownGoalX) < 760 && Math.random() < L.save) {
      if (hgt < 150 && me.onGround()) { h.down = true; h.aim = d; return; }
      if (hgt >= 130 && hgt < 245 && me.onGround()) { this.press('jump'); h.aim = d; return; }
    }

    // 2v2 协同站位：如果同队队友离球更近且我在后方，适度守在禁区前策应
    let tx = px - d * L.behind;
    if (is2v2() && typeof sideFighters === 'function') {
      const mates = sideFighters(cujuSide(me)).filter(m => m !== me && !m.hidden);
      if (mates.length && Math.abs(mates[0].x - b.x) + 60 < near) {
        tx = clamp(ownGoalX + d * 360, WALL + 160, STAGE_W - WALL - 160);
      }
    }

    let rush = L.dash;
    if (rel < -10) {   // 球在身后：绕过去。靠近自家门线或慢球贴地就跳过，免得乌龙
      tx = clamp(px - d * (L.behind + 40), WALL + 55, STAGE_W - WALL - 55);
      if (near < 130 && me.onGround() && hgt < 120 && Math.abs(b.vx) < 420) this.press('jump');
      if (b.vx * d < -200 || (b.x - ownGoalX) * d < 200) rush = L.dash * 3;
    }
    const dx = tx - me.x;
    if (Math.abs(dx) > 16) move = Math.sign(dx);
    if (move) face = move;
    if (Math.abs(dx) > 300 && me.dashCD <= 0 && Math.random() < rush) this.press('dash');

    // 出脚：球在前面够得着；高难 AI 会在空旷中场蓄力劲射或迎高球跳起凌空抽射
    const ballFront = (b.x - me.x) * d, ready = ballFront > -14 && ballFront < L.reach;
    if (ready && hgt < 150 && Math.random() < L.atkP) {
      move = 0; face = d;
      if ((this.level === 'hard' || this.level === 'impossible' || this.level === 'god') && Math.abs(foe.x - me.x) > 320 && Math.abs(b.vx) < 300 && Math.random() < 0.22) {
        h.atk = true;   // 蓄力打一脚劲射
      } else {
        if (Math.abs(me.x - ownGoalX) < 380) h.up = true;   // 门前解围踢高球
        this.press('light');
      }
    } else if (ready && hgt >= 140 && hgt < 340 && me.onGround() && near < 120) {
      this.press('jump'); face = d;
    } else if (!me.onGround() && near < 115 && Math.abs(b.y - (me.y - 60)) < 95 && Math.random() < L.atkP) {
      face = d; this.press('light');
    }
    // 抢断：对手比我离球近、就在我面前
    const foeFront = (foe.x - me.x) * face;
    if (foeFront > 0 && foeFront < 95 && Math.abs(foe.x - b.x) < Math.abs(me.x - b.x) && Math.random() < L.tackle) this.press('light');
    this.useSkills(me, b, d, ballFront, hgt);
    if (move > 0) h.right = true; else if (move < 0) h.left = true;
    h.aim = face;
  }
  useSkills(me, b, d, ballFront, hgt) {
    const L = this.L;
    if (me.meter >= 100 && ballFront > 0 && ballFront < 200 && hgt < 200 && Math.random() < L.ultP * 0.3) { this.held.aim = d; this.press('special'); return; }
    const ov = typeof resolveHeroAI === 'function' ? resolveHeroAI(me.ch.id, 'cuju', is2v2() ? '2v2' : '1v1') : null;
    if (ov && typeof ov.useSkills === 'function' && ov.useSkills(this, me, b, d, ballFront, hgt)) return;
    if (ballFront > 0 && ballFront < 170 && hgt < 170 && Math.random() < L.skillP) this.press(Math.random() < 0.5 || me.skill2CD > 0 ? (me.skillCD <= 0 ? 'skill' : 'skill2') : 'skill2');
  }
}

