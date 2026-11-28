// ======================= 复盘接管残局演练（v1.3.0 / v1.4.0 独立模块） =======================
const REPLAY_TAKEOVER = { active: false, savedState: null, savedMeta: null, side: 0, timer: 0, maxDur: 8.0, totalFrame: 0, segIdx: 0, p: 0, f: 0, nf: 0, kind: 'loc', ev: [] };

class TakeoverOppCtrl extends Ctrl {
  constructor(oppIdx, kind, ev, startP, startF, startNf) {
    super();
    this.oppIdx = oppIdx;
    this.kind = kind;
    this.ev = Array.isArray(ev) ? ev : [];
    this.p = startP || 0;
    this.f = startF || 0;
    this.nf = startNf || 0;
    this.fallback = new AICtrl('god');
    this.handedOff = false;
  }
  think(f, foe) {
    if (this.handedOff) return this.fallback.think(f, foe);
    const ev = this.ev;
    if (this.kind === 'loc') {
      let applied = false;
      while (this.p < ev.length && ev[this.p][0] <= this.f) {
        const e = ev[this.p++];
        if (e[1] !== this.oppIdx) continue;
        const b = e[2];
        this.held.left = !!(b & 1); this.held.right = !!(b & 2); this.held.down = !!(b & 4); this.held.atk = !!(b & 8); this.held.jump = !!(b & 16);
        this.held.aim = (b & 64) ? ((b & 32) ? -1 : 1) : 0; this.atkT = e[3]; this.buf = { ...e[4] };
        applied = true;
      }
      this.f++;
      if (!applied && this.p >= ev.length) {
        this.handedOff = true;
        this.fallback.think(f, foe);
      }
    } else {
      let applied = false;
      while (this.p < ev.length && ev[this.p][0] <= this.nf) {
        const e = ev[this.p++];
        if (e[1] !== this.oppIdx) continue;
        applyInput(this, { h: e[2], p: e.slice(3) });
        applied = true;
      }
      this.nf++;
      if (!applied && this.p >= ev.length) {
        this.handedOff = true;
        this.fallback.think(f, foe);
      }
    }
  }
}

function replayStartTakeover(sideOverride) {
  if (!REPLAY.on || !REPLAY.m || M.phase === 'end') return false;
  const side = sideOverride !== undefined ? (sideOverride ? 1 : 0) : (REPLAY.m.playerSide === 1 ? 1 : 0);
  Object.assign(REPLAY_TAKEOVER, {
    active: true,
    savedState: capState(),
    savedMeta: REPLAY.m,
    side,
    timer: REPLAY_TAKEOVER.maxDur,
    totalFrame: REPLAY.totalFrame || 0,
    segIdx: REPLAY.segmentIndex || 0,
    p: REPLAY.p || 0,
    f: REPLAY.f || 0,
    nf: REPLAY.nf || 0,
    kind: REPLAY.kind || 'loc',
    ev: REPLAY.ev || [],
  });
  REPLAY.on = false;
  REPLAY.paused = false;
  if ($id('rpBar')) $id('rpBar').classList.add('hidden');
  replayTakeoverApply();
  if (!RESIM && typeof say === 'function') say('复盘接管 · 8秒残局演练', 1.2, 'big', 'Backspace 重试 · Esc 返回回放');
  return true;
}

function replayTakeoverApply() {
  if (!REPLAY_TAKEOVER.active || !REPLAY_TAKEOVER.savedState) return false;
  restState(REPLAY_TAKEOVER.savedState);
  M.mode = 'train';
  M.phase = 'fight';
  const myF = fighterByIdx(REPLAY_TAKEOVER.side);
  const oppF = fighterByIdx(1 - REPLAY_TAKEOVER.side);
  if (myF) { human[0].clear(); myF.ctrl = human[0]; myF.dummy = false; }
  if (oppF) {
    oppF.dummy = false;
    oppF.ctrl = new TakeoverOppCtrl(oppF.idx, REPLAY_TAKEOVER.kind, REPLAY_TAKEOVER.ev, REPLAY_TAKEOVER.p, REPLAY_TAKEOVER.f, REPLAY_TAKEOVER.nf);
  }
  REPLAY_TAKEOVER.timer = REPLAY_TAKEOVER.maxDur;
  particles.length = 0;
  return true;
}

function replayTakeoverReset() {
  if (!REPLAY_TAKEOVER.active) return false;
  const ok = replayTakeoverApply();
  if (ok && !RESIM && typeof toast === 'function') toast('已重置残局接管帧');
  return ok;
}

function replayTakeoverTick() {
  if (!REPLAY_TAKEOVER.active || M.mode !== 'train') return;
  REPLAY_TAKEOVER.timer = Math.max(0, REPLAY_TAKEOVER.timer - STEP);
  if (REPLAY_TAKEOVER.timer <= 0) {
    replayTakeoverApply();
  }
}

function replayTakeoverExit() {
  if (!REPLAY_TAKEOVER.active) return false;
  const m = REPLAY_TAKEOVER.savedMeta;
  const tf = REPLAY_TAKEOVER.totalFrame;
  REPLAY_TAKEOVER.active = false;
  REPLAY_TAKEOVER.savedState = null;
  if (m) {
    startReplay(m);
    REPLAY.paused = true;
    if ($id('rpPause')) $id('rpPause').textContent = cvT('继续');
    replaySeek(tf);
  }
  return true;
}

if ($id('rpTakeover')) {
  $id('rpTakeover').addEventListener('click', () => replayStartTakeover());
}
if ($id('endScrollBtn')) {
  $id('endScrollBtn').addEventListener('click', () => {
    if (typeof exportBattleScrollPng === 'function') exportBattleScrollPng();
  });
}
