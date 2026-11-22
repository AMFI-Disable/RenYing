// ======================= 无尽试炼：逐波递增车轮生存战 =======================
// 单人迎战源源不断的强敌波次，每破一波自动回血、提升真气并强化属性，冲击最高波次纪录。
const gauntletOn = () => M.mode === 'gauntlet';
const GAUNTLET_BEST_KEY = 'renying-gauntlet-best';

function gauntletBest() { try { return +localStorage.getItem(GAUNTLET_BEST_KEY) || 0; } catch (e) { return 0; } }

function gauntletRoundInit() {
  M.gauntlet = { wave: 1, kills: 0, score: 0, nextT: 0 };
  M.timer = 999;
}

function gauntletNextWave() {
  const G = M.gauntlet;
  if (!G) return;
  G.wave++;
  const nextHero = Math.floor(grnd() * CHARS.length);
  B.setChar(nextHero);
  const scale = 1 + (G.wave - 1) * 0.12;
  B.reset(clamp(A.x + (A.x > STAGE_W / 2 ? -420 : 420), WALL + 80, STAGE_W - WALL - 80));
  B.maxHp = Math.round(B.maxHp * scale);
  B.hp = B.lagHp = B.maxHp;
  B.ctrl = new AICtrl(G.wave >= 7 ? 'god' : G.wave >= 4 ? 'hard' : 'normal');
  A.hp = Math.min(A.maxHp, A.hp + Math.round(A.maxHp * 0.35));
  A.meter = Math.min(100, (A.meter || 0) + 30);
  if (!RESIM) {
    say(`无尽试炼 · 第 ${G.wave} 波`, 1.15, 'big', B.look.name);
    SFX.gong();
  }
}

function gauntletMatch() {
  const G = M.gauntlet;
  if (!G) return;
  if (A.hp <= 0) {
    if (G.wave > gauntletBest()) try { localStorage.setItem(GAUNTLET_BEST_KEY, String(G.wave)); } catch (e) {}
    M.phase = 'ko'; M.t = 0; M.koWinner = 1;
    sayNet(`止步第 ${G.wave} 波 · 击破 ${G.kills} 敌`, 1.6, 'big', 'gong');
    return;
  }
  if (B.hp <= 0) {
    if (G.nextT <= 0) {
      G.kills++;
      G.score += 100 * G.wave;
      G.nextT = 1.4;
      if (!RESIM) addP({ type: 'text', text: `破敌！+${100 * G.wave}`, x: B.x, y: B.y - 110, life: 0.9, max: 0.9, rgb: '255,220,115' });
    } else {
      G.nextT -= STEP;
      if (G.nextT <= 0) gauntletNextWave();
    }
  }
}

function startGauntlet(heroIdx = 0, level = 'normal') {
  debugHitbox = false;
  refocusGame();
  netDropWaiting();
  M.mode = 'gauntlet';
  M.teamSize = 0;
  M.level = level || 'normal';
  M.wins = [0, 0]; M.round = 1; M.watchAi = false;
  A.setChar(heroIdx | 0);
  B.setChar((heroIdx + 1) % CHARS.length);
  A.ctrl = human[0];
  B.ctrl = new AICtrl(M.level);
  human[0].clear();
  showScreen(null);
  startRound();
  say('无尽试炼 · 第 1 波', 1.3);
}
