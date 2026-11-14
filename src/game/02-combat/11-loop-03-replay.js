// ======================= 对战回放 =======================
// 对战的逻辑完全由“开场状态 + 每一帧双方的操作”决定，所以只记操作，回放时重新算一遍
const RP_KEY = 'renying-replays', RP_MAX = 10;
// 训AI 用的真实轨迹：录这一局时每 TR_EVERY 帧采一条「状态 + 双方操作」，一局最多留 TR_PER_MATCH 条。
// 以前这里导出的是写死的常量数组（同一个假状态、同一个动作、奖励只看输赢），拿这种数据训练只会学到乱按。
const TR_KEY = 'renying-train-set', TR_SET_MAX = 4000, TR_EVERY = 4, TR_LEGACY_EVERY = 6, TR_PER_MATCH = 3600;

function ctrlKey(c) {
  const b = c.buf;
  let s = inBits(c.held) + ':' + c.atkT;
  for (const k in b) s += ';' + k + '=' + b[k];
  return s;
}
function recBegin(kind) {
  M.reviewReady = false;
  Object.assign(REC, { on: true, bad: false, kind, f: 0, nf: 0, ev: [], tr: [], trStart: null, post: ['', ''], last: [-1, -1],
    meta: { v: VERSION, kind, mode: M.mode, playerSide: localIdx(), trainSlots: kind === 'net' ? [...((ROLL.slots || [])[localIdx()] || [])] : allFighters().filter(f => human.includes(f.ctrl)).map(f => [A, B, C, D].indexOf(f)), mapActive: !!mapNow(), level: M.level || '', ch: [A.chIdx, B.chIdx], trEvery: TR_EVERY, st0: capState(), t: Date.now() } });
  if (M.hasBuffs && M.competitiveScrolls) REC.meta.competitiveScrolls = JSON.parse(JSON.stringify(M.competitiveScrolls));
  // pl：哪几个人按玩家的规则选目标。回放里大家都是普通 Ctrl，不记的话玩家会被当成电脑去配合队友，回放就走样了
  if (kind === 'loc' && is2v2()) { Object.assign(REC.meta, { four: true, sub: M.subMode || '', ch4: [A.chIdx, B.chIdx, C.chIdx, D.chIdx], pl: [A, B, C, D].map(f => !cpuTeamwork(f)) }); REC.post = ['', '', '', '']; }
  if (kind === 'loc' && M.mode === 'raid') { Object.assign(REC.meta, { raid: true, four: true, sub: 'local', ch4: [A.chIdx, B.chIdx, C.chIdx, D.chIdx], raidSquadSize: M.raidSquadSize || 3, raidWave: M.raidWave || 1 }); REC.post = ['', '', '', '']; }
  if (kind === 'loc' && M.mode === 'tag3') Object.assign(REC.meta, { tag3: true, teams: jclone(M.teams || []), teamIdx: [...(M.teamIdx || [0, 0])], round: M.round || 1, mutator: M.teamMutator || 'normal' });
  if (kind === 'loc' && M.mode === 'tower') Object.assign(REC.meta, { towerFloor: M.towerFloor || 1, scrolls: [...(M.towerPerks || [])] });
  if (kind === 'loc' && M.mode === 'saga' && typeof SG !== 'undefined') Object.assign(REC.meta, { chapter: SG.hero || '', chapterNode: SG.node || 0 });
  // 联机：按键是按“每台电脑”记的（一台可能管两个人），回放时要知道每台电脑管哪几个人；2v2 里没人管的是电脑，回放时照样让它想
  if (kind === 'net') {
    Object.assign(REC.meta, { slots: ROLL.slots.map(s => s.slice()), room: netRoomMode, ranked: !!NET.isRanked });   // 房间规则也记下：回放时按它判断 2v2、同袍肉鸽、神决
    if (isRaid()) REC.meta.raidWave = M.raidWave || 1;
    if (allFighters().length > 2 || isRaid()) Object.assign(REC.meta, { four: is2v2(), raid: isRaid(), sub: netRoomMode, ch4: [A.chIdx, B.chIdx, C.chIdx, D.chIdx] });
  }
}
// 本地回放要记的人：1v1 是 A、B，2v2 四个人都记（顺序 A B C D，和 fighterByIdx 一样）
const rpFighters = m => (m && (m.four || m.raid)) ? [A, B, C, D] : [A, B];   // 同袍肉鸽：A、C、D 打魔首 B（两人队时 D 藏着）
// 本地对战：在角色读操作之前记下双方控制器的状态（只记变化）
function rpPoint() {
  if (REC.on && REC.kind === 'loc') {
    rpFighters(REC.meta).forEach((f, i) => { if (ctrlKey(f.ctrl) !== REC.post[i]) REC.ev.push([REC.f, i, inBits(f.ctrl.held), f.ctrl.atkT, { ...f.ctrl.buf }]); });
  } else if (REPLAY.on && REPLAY.kind === 'loc') {
    const ev = REPLAY.ev;
    while (REPLAY.p < ev.length && ev[REPLAY.p][0] <= REPLAY.f) {
      const e = ev[REPLAY.p++], c = rpFighters(REPLAY.m)[e[1]].ctrl, b = e[2];
      c.held.left = !!(b & 1); c.held.right = !!(b & 2); c.held.down = !!(b & 4); c.held.atk = !!(b & 8); c.held.jump = !!(b & 16);
      c.held.aim = (b & 64) ? ((b & 32) ? -1 : 1) : 0; c.atkT = e[3]; c.buf = { ...e[4] };
    }
  }
}
function rpPost() { if (REC.on && REC.kind === 'loc') REC.post = rpFighters(REC.meta).map(f => ctrlKey(f.ctrl)); }
// 联机：只记两边都确认过的帧
function recNet() {
  if (!REC.on || REC.kind !== 'net') return;
  const R = ROLL, me = localIdx(), upto = Math.min(R.F, R.remLast + 1);
  while (REC.nf < upto) {
    const f = REC.nf++, li = R.loc[f] || EMPTY_IN, ri = R.rem[f] || EMPTY_IN, ins = me === 0 ? [li, ri] : [ri, li];
    ins.forEach((x, i) => { if (x.h !== REC.last[i] || x.p.length) { REC.ev.push([f, i, x.h, ...x.p]); REC.last[i] = x.h; } });
  }
}
function rpList() { try { const l = JSON.parse(localStorage.getItem(RP_KEY) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
function rpStore(list) {
  for (;;) {
    try { localStorage.setItem(RP_KEY, JSON.stringify(list)); return; }
    catch (e) {
      // 空间不够：先丢最旧的训练轨迹（几十 KB 一条），再丢最旧的整场回放
      const fat = list.find(m => m && Array.isArray(m.tr) && m.tr.length);
      if (fat) { delete fat.tr; continue; }
      if (list.length <= 1) return;
      list.pop();
    }
  }
}
// 一帧的状态特征（18 维：血量、护甲、内力、奥义槽、站位、朝向、滞空、硬直、正对与否）。
// 数值全部来自这一局真实的角色对象，不是编的。
function trFeat(f, o) {
  const r3 = v => Math.round(v * 100) / 100;
  return [
    r3(f.hp / (f.maxHp || 1)), r3(o.hp / (o.maxHp || 1)),
    r3((f.guard || 0) / (f.maxGuard || 100)), r3((o.guard || 0) / (o.maxGuard || 100)),
    r3((f.ink || 0) / (INK_MAX || 1)), r3((o.ink || 0) / (INK_MAX || 1)),
    r3((f.meter || 0) / 100), r3((o.meter || 0) / 100),
    r3(f.x / STAGE_W), r3(o.x / STAGE_W),
    r3(f.y / 400), r3(o.y / 400),
    f.face || 0, o.face || 0,
    f.onGround() ? 1 : 0, o.onGround() ? 1 : 0,
    r3(Math.min(1, (f.stun || 0) / 30)), r3(Math.min(1, (o.stun || 0) / 30)),
    f.face === (o.x > f.x ? 1 : -1) ? 1 : 0
  ];
}
function trActionBits(c) {
  const held = inBits(c.held), buf = c.buf || {};
  return held | (buf.dash !== undefined ? 1 << 7 : 0) | (buf.special !== undefined ? 1 << 8 : 0)
    | (buf.skill !== undefined ? 1 << 9 : 0) | (buf.skill2 !== undefined ? 1 << 10 : 0)
    | (buf.drop !== undefined ? 1 << 11 : 0) | (buf.heavy !== undefined ? 1 << 12 : 0);
}
function trSample() {
  if (RESIM || !REC.on || REC.bad || !REC.meta || !A || !B || A.hidden || B.hidden) return;   // RESIM 是回滚重算，同一帧会再走一遍
  if (REPLAY.on) return;   // 看回放不重复上传
  const tf = REC.kind === 'net' && typeof ROLL !== 'undefined' ? ROLL.F : REC.f;
  if (tf % TR_EVERY) return;
  if (!A.ctrl || !B.ctrl) return;
  // 前 28 项保持旧训练轨迹兼容；末尾为每名本机玩家记录其自身视角的状态与输入。
  const players = [];
  for (const slot of REC.meta.trainSlots || []) {
    const f = [A, B, C, D][slot];
    if (!f || f.hidden || !f.ctrl) continue;
    const side = sideFighters(0).includes(f) ? 0 : 1;
    const foes = sideFighters(1 - side).filter(o => !o.hidden);
    if (!foes.length) continue;
    const foe = foes.reduce((best, o) => Math.hypot(o.x - f.x, o.y - f.y) < Math.hypot(best.x - f.x, best.y - f.y) ? o : best, foes[0]);
    players.push([slot, trFeat(f, foe), trActionBits(f.ctrl)]);
  }
  REC.tr.push([...trFeat(A, B), trActionBits(A.ctrl), trActionBits(B.ctrl), A.state || 'idle', A.moveName || A.skill || A.sp || '', A.escInvul ? 1 : 0, B.state || 'idle', B.moveName || B.skill || B.sp || '', B.escInvul ? 1 : 0, players]);
  if (REC.trStart === null) REC.trStart = tf;
  if (REC.tr.length > TR_PER_MATCH) { REC.tr.shift(); REC.trStart += TR_EVERY; }
}
// 样本记录的格式：s 是 19 维状态，a 是玩家这一帧按住的键（位掩码），r 由血量/护甲变化和胜负算出来。
const TR_STATE_DIM = 19;
function trEpisodes(m) {
  const rows = Array.isArray(m && m.tr) ? m.tr : [], slots = Array.isArray(m && m.trainSlots) && m.trainSlots.length ? m.trainSlots : [m && m.kind === 'net' ? Math.max(0, Math.min(1, +m.playerSide || 0)) : 0];
  const episodes = [];
  for (const slot of slots) {
    const side = m && m.raid ? 0 : m && m.four ? (slot === 0 || slot === 2 ? 0 : 1) : slot;
    const chars = m && Array.isArray(m.ch4) ? m.ch4 : (Array.isArray(m && m.ch) ? m.ch : [0, 1]);
    const heroIdx = chars[slot] || 0, out = [];
    let prev = null;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!Array.isArray(row) || row.length < TR_STATE_DIM + 2) continue;
      const entry = Array.isArray(row[27]) ? row[27].find(p => Array.isArray(p) && p[0] === slot) : null;
      let s, a;
      if (entry && Array.isArray(entry[1]) && entry[1].length === TR_STATE_DIM) { s = entry[1].slice(); a = entry[2]; }
      else if (slot < 2) {
        s = row.slice(0, TR_STATE_DIM); a = row[TR_STATE_DIM + slot];
        if (slot === 1) {
          for (const [x, y] of [[0,1],[2,3],[4,5],[6,7],[8,9],[10,11],[14,15],[16,17]]) [s[x], s[y]] = [s[y], s[x]];
          [s[12], s[13]] = [-s[13], -s[12]]; s[18] = 1 - s[18];
        }
      } else continue;
      let r = 0;
      if (prev) r = ((prev[0] - s[0]) - (prev[1] - s[1])) * 10 + ((prev[2] - s[2]) - (prev[3] - s[3])) * 2;
      prev = s;
      out.push({ hero: (CHARS[heroIdx] || {}).id || 'hero', heroIdx, s, a, r: Math.round(r * 1000) / 1000, mode: m.mode || 'cpu', frame: Array.isArray(m.trFrames) && Number.isFinite(+m.trFrames[i]) ? +m.trFrames[i] : (+m.trStart || 0) + i * (+m.trEvery || TR_LEGACY_EVERY), source: 'user_replay' });
    }
    if (out.length) {
      const last = out[out.length - 1], winner = m.w === -1 ? -1 : side ? 1 - m.w : m.w;
      last.r = Math.round((last.r + (winner === 0 ? 1 : winner === 1 ? -1 : 0)) * 1000) / 1000;
      last.done = 1; episodes.push({ slot, side, rows: out });
    }
  }
  return episodes;
}
function trSet() { try { const l = JSON.parse(localStorage.getItem(TR_KEY) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
function trSetSave(list) {
  try { localStorage.setItem(TR_KEY, JSON.stringify(list.slice(-TR_SET_MAX))); return true; } catch (e) { return false; }
}
function trDownload(rows, name) {
  if (!rows.length) return false;
  const blob = new Blob([rows.map(s => JSON.stringify(s)).join('\n') + '\n'], { type: 'application/x-jsonlines' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
// 逐行解析训练集文件：一行一个样本，坏行跳过并报行号（返回 { added, bad, total }）
function trImportText(txt) {
  const rows = [], bad = [];
  String(txt || '').split(/\r?\n/).forEach((line, i) => {
    const t2 = line.trim();
    if (!t2) return;
    try {
      const o = JSON.parse(t2);
      if (!o || !Array.isArray(o.s) || o.s.length < 8 || typeof o.a !== 'number') throw new Error('bad');
      rows.push(o);
    } catch (e) { bad.push(i + 1); }
  });
  if (!rows.length) return { added: 0, bad, total: trSet().length };
  const set = trSet().concat(rows);
  return { added: rows.length, bad, total: Math.min(set.length, TR_SET_MAX), ok: trSetSave(set) };
}
function recSave(w) {
  REC.on = false;
  if (REC.bad || !REC.meta) return;
  const m = REC.meta;
  Object.assign(m, { w, wins: [...M.wins], frames: REC.kind === 'net' ? REC.nf : REC.f, ev: REC.ev, tr: REC.tr, trStart: REC.trStart, stats: M.combatStats ? M.combatStats.map(s => ({ ...s })) : null, skins: rpFighters(m).map(f => f.skinKey || ''),
    names: M.mode === 'net' ? rpNetNames(m)
      : m.raid ? [sideFighters(0).map(f => f.look.name).join(' · '), (M.raidBoss && M.raidBoss.heroNames || []).join('·') || B.look.name]
        : m.four ? ({ p_cc: [ACC.name || '你', '电脑'], pp_cc: ['1P · 2P', '电脑'], pp_pp: ['1P · 2P', '3P · 4P'] }[m.sub] || ['苍龙', '赤凤']) : M.mode === 'cpu' ? [ACC.name || '你', '电脑'] : ['1P', '2P'] });
  if (RP.run && RP.run.mode === M.mode) {
    RP.run.segments.push(m);
    if (typeof aiTrainMatch === 'function') aiTrainMatch(m, M.worldKey ? 'world' : undefined);
    const replay = rpRunReplay(RP.run, w);
    RP.last = replay;
    M.reviewReady = true;
    rpRunStore(replay);
    REC.meta = null;
    return replay;
  }
  RP.last = m;
  M.reviewReady = true;
  const list = rpList(); list.unshift(m); while (list.length > RP_MAX) list.pop();
  rpStore(list);
  if (typeof aiTrainMatch === 'function') aiTrainMatch(m, M.worldKey ? 'world' : undefined);
  return m;
}
function rpRunBegin(mode) {
  RP.run = { id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, mode, segments: [] };
}
function rpRunStore(replay) {
  const list = rpList(), prior = list.findIndex(x => x && x.runId === replay.runId);
  if (prior >= 0) list.splice(prior, 1);
  list.unshift(replay); while (list.length > RP_MAX) list.pop();
  rpStore(list);
}
function rpRunReplay(run, winner) {
  const segments = run.segments || [], first = segments[0] || {}, last = segments[segments.length - 1] || first;
  const totalFrames = segments.reduce((n, s) => n + Math.max(0, +s.frames || 0), 0);
  const rows = [], trFrames = [];
  let frameOffset = 0;
  for (const s of segments) {
    const segmentRows = Array.isArray(s.tr) ? s.tr : [];
    segmentRows.forEach((row, i) => { rows.push(row); trFrames.push(frameOffset + (+s.trStart || 0) + i * (+s.trEvery || TR_LEGACY_EVERY)); });
    frameOffset += Math.max(0, +s.frames || 0);
  }
  const stats = Array.from({ length: 4 }, (_, i) => segments.reduce((sum, s) => {
    const x = s.stats && s.stats[i] || {};
    sum.damage += +x.damage || 0; sum.combo = Math.max(sum.combo, +x.combo || 0);
    sum.breaks += +x.breaks || 0; sum.falls += +x.falls || 0;
    return sum;
  }, { damage: 0, combo: 0, breaks: 0, falls: 0 }));
  return { ...last, ...first, runId: run.id, segments, st0: first.st0, ev: [], tr: rows, trFrames, trStart: 0,
    w: winner, frames: totalFrames, stats: run.mode === 'tag3' && last.stats ? last.stats : stats, skins: first.skins || [], names: last.names || first.names,
    wins: last.wins || first.wins, towerFloor: last.towerFloor || first.towerFloor,
    raidWave: last.raidWave || first.raidWave, round: segments.length };
}
function matchReviewData(m) {
  if (!m || !['cpu', 'net', '2v2', 'pvp', 'maps', 'tag3', 'chaos', 'mayhem', 'tower', 'saga', 'raid'].includes(m.mode) || (!Array.isArray(m.stats) && !(Array.isArray(m.tr) && m.tr.length))) return null;
  const team = !!(m.four || m.raid), side = m.raid || ['p_cc', 'pp_cc'].includes(m.sub) ? 0 : m.playerSide === 1 ? 1 : 0;
  const ownIdx = m.raid ? [0, 2, 3] : m.four ? (side === 0 ? [0, 2] : [1, 3]) : [side];
  const foeIdx = m.raid ? [1] : m.four ? (side === 0 ? [1, 3] : [0, 2]) : [side ^ 1];
  const sumStats = ids => ids.reduce((sum, i) => {
    const s = (m.stats || [])[i] || {};
    sum.damage += Math.max(0, +s.damage || 0); sum.combo = Math.max(sum.combo, +s.combo || 0);
    sum.breaks += Math.max(0, +s.breaks || 0); sum.falls += Math.max(0, +s.falls || 0);
    return sum;
  }, { damage: 0, combo: 0, breaks: 0, falls: 0 });
  const own = sumStats(ownIdx), foe = sumStats(foeIdx);
  const dealt = Math.max(0, +own.damage || 0), taken = Math.max(0, +foe.damage || 0), combo = Math.max(0, +own.combo || 0), breaks = Math.max(0, +own.breaks || 0), falls = Math.max(0, +own.falls || 0);
  const samples = (team ? [] : Array.isArray(m.tr) ? m.tr : []).map((row, index) => ({ row, index })).filter(({ row }) => Array.isArray(row) && row.length >= 21 && row.slice(0, 19).every(Number.isFinite));
  const rows = samples.map(sample => sample.row);
  const playerIdx = (m.ch4 || m.ch || [])[m.raid ? 0 : m.four ? ownIdx[0] : side] ?? (m.ch || [])[side] ?? (m.ch || [])[0] ?? 0;
  const foePlayerIdx = (m.ch4 || m.ch || [])[foeIdx[0]] ?? (m.ch || [])[side ^ 1] ?? 0;
  const hero = CHARS[playerIdx] || {}, opponent = CHARS[foePlayerIdx] || {}, heroFrames = aiBrainData().frames && aiBrainData().frames[hero.id] || {};
  const rowFrame = i => { const index = samples[i].index; return Array.isArray(m.trFrames) && Number.isFinite(+m.trFrames[index]) ? +m.trFrames[index] : (+m.trStart || 0) + index * (+m.trEvery || TR_LEGACY_EVERY); };
  let attacks = 0, far = 0, misfaced = 0, farFrame = null, misfacedFrame = null;
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const r = rows[rowIndex];
    const ownBits = +r[19 + side] || 0;
    if (!(ownBits & 8)) continue;
    attacks++;
    const ownX = r[side ? 9 : 8], foeX = r[side ? 8 : 9];
    const frame = rowFrame(rowIndex);
    if (Math.abs(ownX - foeX) > 0.2) { far++; if (farFrame === null) farFrame = frame; }
    const ownFace = r[side ? 13 : 12], toward = foeX > ownX ? 1 : -1;
    if (ownFace !== toward) { misfaced++; if (misfacedFrame === null) misfacedFrame = frame; }
  }
  const strengths = [], errors = [], next = [], moments = [];
  if (dealt > taken && dealt > 0) strengths.push(`伤害交换占优：造成 ${Math.round(dealt)}，承受 ${Math.round(taken)}。`);
  if (combo >= 3) strengths.push(`最长连击：${combo} 段。`);
  if (breaks > 0) strengths.push(`成功破防：${breaks} 次。`);
  if (!strengths.length) strengths.push('对局统计已保存，可在回放中复核攻防交换。');
  const sampleFrame = rowFrame;
  for (let i = 1; i < rows.length; i++) {
    if (samples[i].index !== samples[i - 1].index + 1) continue;
    const prev = rows[i - 1], cur = rows[i], atk = (+prev[19 + side] || 0) & 8 || (+cur[19 + side] || 0) & 8;
    const ownHp = side ? 1 : 0, foeHp = side ? 0 : 1;
    const foeLoss = prev[foeHp] - cur[foeHp], ownLoss = prev[ownHp] - cur[ownHp];
    if (atk && foeLoss > 0.005 && ownLoss <= 0.005) {
      moments.push({ frame: sampleFrame(i), text: '有利交换片段：对手气血下降，你没有同时失血。' });
      break;
    }
  }
  for (let i = 1; i < rows.length; i++) {
    if (samples[i].index !== samples[i - 1].index + 1) continue;
    const prev = rows[i - 1], cur = rows[i], ownAt = side ? 24 : 21, foeAt = side ? 21 : 24;
    if (cur.length < 27 || prev.length < 27) break;
    const escapedFromHit = ['hitstun', 'launched', 'knockdown'].includes(prev[ownAt]) && cur[ownAt + 2] === 1;
    if (escapedFromHit) {
      moments.push({ frame: sampleFrame(i), text: '脱身时机：你在受压后成功使用了腾空闪。' });
      break;
    }
  }
  for (let i = 1; i < rows.length; i++) {
    if (samples[i].index !== samples[i - 1].index + 1) continue;
    const prev = rows[i - 1], cur = rows[i], ownAt = side ? 24 : 21, foeAt = side ? 21 : 24;
    if (cur.length < 27 || prev.length < 27) break;
    const foeActing = ['attack', 'skill', 'special'].includes(prev[foeAt]) || ['attack', 'skill', 'special'].includes(cur[foeAt]);
    const ownGuarding = ['block', 'blockstun'].includes(cur[ownAt]);
    const ownHp = side ? 1 : 0;
    if (foeActing && ownGuarding && prev[ownHp] - cur[ownHp] <= 0.005) {
      moments.push({ frame: sampleFrame(i), text: '防守成功：你挡住了对手的进攻，没有在这段交换中掉血。' });
      break;
    }
  }
  const quickRange = +(heroFrames.l1 && heroFrames.l1.max) || 100;
  for (let i = 1; i < rows.length; i++) {
    if (samples[i].index !== samples[i - 1].index + 1) continue;
    const prev = rows[i - 1], cur = rows[i], ownAt = side ? 24 : 21, foeAt = side ? 21 : 24;
    if (cur.length < 27 || prev.length < 27) break;
    const foeStun = cur[side ? 16 : 17] || 0, ownIdle = ['idle', 'block', 'air'].includes(cur[ownAt]);
    const ownAttack = ((+cur[19 + side] || 0) & 8) !== 0;
    const distance = Math.abs(cur[side ? 9 : 8] - cur[side ? 8 : 9]) * STAGE_W;
    if (foeStun >= 0.2 && ownIdle && !ownAttack && distance <= quickRange * 1.15) {
      moments.push({ frame: sampleFrame(i), text: '可能的追击窗口：对手仍处于硬直，双方距离接近你的快速普攻范围。' });
      break;
    }
  }
  if (taken > dealt * 1.2 && taken > 0) {
    errors.push('承受伤害明显高于输出，交换中还可以减少硬吃招式。');
    next.push('先练习格挡与腾空闪，等对手招式结束后再反击。');
  }
  if (attacks >= 8 && far / attacks >= 0.25) {
    const pct = Math.round(far / attacks * 100);
    errors.push(`约 ${pct}% 的攻击输入发生在较远距离，可能有部分出手够不到对手。`);
    if (farFrame !== null) moments.push({ frame: farFrame, text: '远距离出手：攻击输入发生时双方相距较远。' });
    next.push('把回放频率调到 1 Hz 并打开判定框，确认攻击范围覆盖对手后再出手。');
  }
  if (attacks >= 8 && misfaced / attacks >= 0.2) {
    const pct = Math.round(misfaced / attacks * 100);
    errors.push(`约 ${pct}% 的攻击输入发生时没有正对对手。`);
    if (misfacedFrame !== null) moments.push({ frame: misfacedFrame, text: '朝向检查：攻击输入发生时没有正对对手。' });
    next.push('起手前确认朝向，必要时先用方向键调整再攻击。');
  }
  const ownQ = SKILLS[hero.skill] || {}, ownR = SKILLS[hero.skill2] || {}, foeQ = SKILLS[opponent.skill] || {}, foeR = SKILLS[opponent.skill2] || {};
  const matchup = hero.id && opponent.id ? {
    hero: hero.name || '', heroId: hero.id, opponent: opponent.name || '', opponentId: opponent.id,
    ownMove: ownR.name || ownQ.name || '', foeMove: foeR.name || foeQ.name || '',
    choice: attacks >= 6 && far / attacks > 0.3 && ownR.name ? 'ranged' : misfaced / Math.max(1, attacks) > 0.2 ? 'face' : 'defense',
    ownChoice: attacks >= 6 && far / attacks > 0.3 && ownR.name ? (ownR.name || '') : (ownQ.name || ownR.name || '')
  } : null;
  if (falls > 0) { errors.push(`本局坠崖 ${falls} 次，边缘位置需要更早回到场地中央。`); next.push('把对手引向场地内侧，自己靠近边缘时优先撤回安全位置。'); }
  if (!errors.length) errors.push('现有数据未发现明显的远距离出手或失衡交换。');
  if (!next.length) next.push('用慢放和判定框复核命中后的硬直窗口，再练习一套稳定的追击。');
  const context = { hero: hero.name || '', heroId: hero.id || '', mode: m.mode || '', level: m.level || '' };
  const focus = falls > 0 ? 'edge' : taken > dealt * 1.2 && taken > 0 ? 'defense' : misfaced / Math.max(1, attacks) >= 0.2 ? 'facing' : 'range';
  const evidence = rows.length < 12 ? 'limited' : rows.length < 60 ? 'sampled' : 'strong';
  const duration = Math.max(0, +m.frames || 0), closeFinish = m.w !== -1 && (m.w === side ? taken > dealt * 0.62 : dealt > taken * 0.62);
  const practiceSignal = falls > 0 || combo >= 3 || taken > dealt * 1.2 || (attacks >= 8 && (far / attacks >= 0.25 || misfaced / attacks >= 0.2));
  const worthwhile = duration >= 120 * 12 && (practiceSignal || closeFinish);
  const reviewReason = falls > 0 ? 'edge' : closeFinish ? 'close' : combo >= 5 ? 'combo' : 'decision';
  return { dealt: Math.round(dealt), taken: Math.round(taken), combo, breaks, rows: rows.length, team, context, matchup, focus, evidence, worthwhile, reviewReason, strengths, errors, next, moments: moments.slice(0, 4) };
}
function endReviewShow(m) {
  const btn = $id('endReviewBtn'), panel = $id('endReview');
  if (!btn || !panel) return;
  const review = matchReviewData(m);
  btn.classList.toggle('hidden', !review);
  btn.setAttribute('aria-expanded', String(!!review));
  panel.classList.toggle('hidden', !review);
  if (!review) { panel.innerHTML = ''; return; }
  const list = items => `<ul>${items.map(s => `<li>${escapeHTML(reviewCopy(s))}</li>`).join('')}</ul>`;
  const moments = review.moments.length ? `<section class="end-review-block end-review-moments"><h4>${cvT('关键时刻')}</h4><ul>${review.moments.map(x => `<li><button type="button" class="end-review-jump" data-review-frame="${Math.max(0, Math.floor(x.frame))}">${cvT('回放')} ${formatReviewTime(x.frame)} · ${escapeHTML(cvT(x.text))}</button></li>`).join('')}</ul></section>` : '';
  const context = review.context && review.context.hero ? `<p class="end-review-context">${escapeHTML(cvT(review.context.hero))} · ${cvT(review.context.mode === 'net' ? '联机对局' : review.context.mode === 'cpu' ? '人机对局' : '本地对局')}${review.context.level ? ` · ${escapeHTML(cvT(LV_NAME[review.context.level] || review.context.level))}` : ''}</p>` : '';
  const evidenceText = review.evidence === 'limited' ? '样本较少，建议先当作线索' : review.evidence === 'sampled' ? '依据录像抽样帧与统计' : '录像抽样较充分';
  if (review.worthwhile) btn.textContent = cvT('建议复盘 · AI 复盘'); else btn.textContent = cvT('AI 复盘');
  const matchup = review.matchup ? `<section class="end-review-block"><h4>${cvT('本局对阵建议')}</h4><p>「${escapeHTML(cvT(review.matchup.hero))}」${cvT('迎战')}「${escapeHTML(cvT(review.matchup.opponent))}」 · ${cvT('关注对方')}「${escapeHTML(cvT(review.matchup.foeMove))}」${cvT('；建议选择')}「${escapeHTML(cvT(review.matchup.ownChoice))}」${cvT(review.matchup.choice === 'ranged' ? '保持距离牵制并趁收招接近。' : review.matchup.choice === 'face' ? '校正朝向后起手。' : '先防守脱身，再抓收招反击。')}</p></section>` : '';
  const worth = review.worthwhile ? `<p class="end-review-note"><strong>${cvT('这局值得复盘')}</strong> · ${cvT(review.reviewReason === 'edge' ? '坠崖说明边缘决策值得重看。' : review.reviewReason === 'close' ? '胜负接近，重看关键交换能找到改变结果的选择。' : review.reviewReason === 'combo' ? '本局出现长连段，可以重看起手和追击选择。' : '录像中发现可练习的决策点。')}</p>` : '';
  panel.innerHTML = `<h3>${cvT('本局 AI 复盘')}</h3>${context}${worth}<p class="end-review-note">${cvT(evidenceText)} · ${cvT('分析结合双方侠客、技能、站位与输入，给出可复核的战术选择建议。')}</p><div class="end-review-stats"><span>${cvT(review.team ? '团队造成伤害' : '造成伤害')} ${review.dealt}</span><span>${cvT(review.team ? '团队承受伤害' : '承受伤害')} ${review.taken}</span><span>${cvT('最长连击')} ${review.combo}</span><span>${cvT('破防次数')} ${review.breaks}</span>${review.rows ? `<span>${cvT('分析帧数')} ${review.rows}</span>` : ''}</div><div class="end-review-grid"><section class="end-review-block"><h4>${cvT('做得好')}</h4>${list(review.strengths)}</section><section class="end-review-block"><h4>${cvT('可改进')}</h4>${list(review.errors)}</section><section class="end-review-block"><h4>${cvT('下一步')}</h4>${list(review.next)}</section>${matchup}${moments}</div><p class="end-review-note">${cvT('关键时刻来自录像中的抽样状态与输入，点击可跳到对应回放帧。')}</p><div class="row end-review-actions"><button class="ghost" type="button" data-review-practice="${escapeHTML(review.context.heroId)}" data-review-focus="${review.focus}">${cvT('用这位侠客去练习')}</button><span>${cvT('这份复盘有帮助吗？')}</span><button class="ghost" type="button" data-review-vote="yes">${cvT('有帮助')}</button><button class="ghost" type="button" data-review-vote="no">${cvT('没帮助')}</button></div>`;
}
function reviewCopy(value) {
  const s = String(value || '');
  let m;
  if ((m = s.match(/^伤害交换占优：造成 (\d+)，承受 (\d+)。$/))) return `${cvT('伤害交换占优')}: ${cvT('造成伤害')} ${m[1]}, ${cvT('承受伤害')} ${m[2]}.`;
  if ((m = s.match(/^最长连击：(\d+) 段。$/))) return `${cvT('最长连击')}: ${m[1]}.`;
  if ((m = s.match(/^约 (\d+)% 的攻击输入发生在较远距离，可能有部分出手够不到对手。$/))) return `${m[1]}% of attack inputs were made from too far away to reach the opponent.`;
  if ((m = s.match(/^约 (\d+)% 的攻击输入发生时没有正对对手。$/))) return `${m[1]}% of attack inputs were made while facing away from the opponent.`;
  if ((m = s.match(/^本局坠崖 (\d+) 次，边缘位置需要更早回到场地中央。$/))) return `${cvT('坠崖')}: ${m[1]}. Move back toward the center sooner near an edge.`;
  return cvT(s);
}
function formatReviewTime(frame) {
  const seconds = Math.floor(Math.max(0, +frame || 0) / 120);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
function replayJump(m, frame) {
  startReplay(m);
  const target = Math.max(0, Math.min(Math.floor(+frame || 0), Math.max(0, (m.frames || 0) - 1)));
  REPLAY.paused = true;
  $id('rpPause').textContent = cvT('继续');
  const advance = () => {
    if (!REPLAY.on) return;
    let count = 0;
    while (REPLAY.totalFrame < target && M.phase !== 'end' && count++ < 480) replayFrame();
    if (REPLAY.totalFrame < target && M.phase !== 'end') { setTimeout(advance, 0); return; }
    REPLAY.paused = true;
    REPLAY.frameAcc = 0;
    $id('rpPause').textContent = cvT('继续');
    rpInfo();
  };
  setTimeout(advance, 0);
}
$id('endReview').addEventListener('click', e => {
  const vote = e.target.closest('[data-review-vote]');
  if (vote) {
    if (typeof STATQ !== 'undefined' && !STATQ.reviewVote) {
      STATQ.reviewVote = vote.dataset.reviewVote;
      if (typeof statEv === 'function') statEv(vote.dataset.reviewVote === 'yes' ? 'review_yes' : 'review_no');
      for (const b of $id('endReview').querySelectorAll('[data-review-vote]')) b.disabled = true;
      vote.textContent = cvT('已收到反馈');
    }
    return;
  }
  const jump = e.target.closest('[data-review-frame]');
  if (jump && RP.last) replayJump(RP.last, +jump.dataset.reviewFrame);
  const practice = e.target.closest('[data-review-practice]');
  if (practice && typeof openReviewTraining === 'function') openReviewTraining(practice.dataset.reviewHero || practice.dataset.reviewPractice, practice.dataset.reviewFocus);
});
$id('endReviewBtn').addEventListener('click', () => {
  const panel = $id('endReview'), btn = $id('endReviewBtn'), open = panel.classList.contains('hidden');
  panel.classList.toggle('hidden', !open);
  btn.setAttribute('aria-expanded', String(open));
});
// 联机录像两队的名字：双人共斗是两个人一队打电脑，其余是房主一队、加入的人一队
function rpNetNames(m) {
  const h = (NET.names || {}).host || '游客', c = (NET.names || {}).client || '游客';
  return m.raid ? [h + ' · ' + c, '魔首'] : m.four && m.sub === 'pp_cc' ? [h + ' · ' + c, '电脑'] : [h, c];
}
function rpTitle(m) {
  if (m.raid && Array.isArray(m.names)) return `${m.names[0]} 对 ${m.names[1]}`;
  const nm = i => (CHARS[(m.ch4 || m.ch)[i]] || {}).name || '?';
  return m.four ? `${nm(0)} · ${nm(2)} 对 ${nm(1)} · ${nm(3)}` : `${nm(0)} 对 ${nm(1)}`;
}
function rpSub(m) {
  const d = new Date(m.t), pad = x => String(x).padStart(2, '0');
  const mode = replayModeTag(m);
  const win = m.w >= 0 ? `${m.four ? (m.names || [])[m.w] || '' : (CHARS[m.ch[m.w]] || {}).name || ''} 胜` : '平局';
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())} · ${mode} · ${(m.names || []).join(' 对 ')} · ${win} ${m.wins ? m.wins.join(':') : ''}${m.v !== VERSION ? ' · 旧版本录的，可能对不上' : ''}`;
}
function replayModeTag(m) {
  const mutator = m.st0 && m.st0.M && m.st0.M.teamMutator;
  const mutatorTag = mutator === 'chaos' ? ` · ${cvT('天机乱斗')}` : mutator === 'mayhem' ? ` · ${cvT('通天神决')}` : '';
  if (m.raid) return `${cvT(m.kind === 'net' ? '联机同袍肉鸽' : '本地同袍肉鸽')} · ${cvT('第')} ${m.raidWave || 1}${m.runId ? ` · ${cvT('全程')} ${m.segments.length} ${cvT('劫')}` : ''}`;
  if (m.mode === 'mayhem' || m.room === 'mayhem') return cvT(m.mode === 'net' ? '联机通天神决' : '通天神决');
  if (m.mode === 'net') return m.ranked ? cvT('排位赛') : m.four ? `${cvT('联机2v2')} · ${cvT(m.sub === 'pp_pp' ? '四人对决' : m.sub === 'pp_cc' ? '双人共斗' : '携手共斗')}` : `${cvT('联机')} · ${cvT(m.room === 'chaos' ? '天机乱斗' : m.room === 'mayhem' ? '通天神决' : '标准对战')}`;
  if (m.mode === 'cpu') return `${cvT('人机')} · ${cvT(LV_NAME[m.level] || m.level || '')}`;
  if (m.mode === 'pvp') return cvT('本地双人');
  if (m.mode === '2v2') return `${cvT('2v2')} · ${cvT({ p_cc: '携手共斗', pp_cc: '双人共斗', pp_pp: '四人对决' }[m.sub] || '组队')}${mutatorTag}`;
  if (m.mode === 'maps') return `${cvT('山河异境')} · ${cvT((MAPS[m.st0 && m.st0.M && m.st0.M.map] || {}).n || '')}`;
  if (m.mode === 'tag3') return `${cvT('门派车轮战')} · ${m.runId ? `${m.segments.length} ${cvT('局全程')}` : `${cvT('第')} ${m.round || 1}`}${mutatorTag}`;
  if (m.mode === 'chaos') return cvT('天机乱斗');
  if (m.mode === 'tower') return `${cvT('万仞剑阁')} · ${cvT('第')} ${m.towerFloor || 1}${m.runId ? ` · ${cvT('全程')} ${m.segments.length} ${cvT('层')}` : ''}`;
  if (m.mode === 'saga') return `${cvT('侠客列传')} · ${cvT(CHARS.find(c => c.id === m.chapter)?.name || '')} · ${cvT('第')} ${(m.chapterNode || 0) + 1}`;
  return cvT('本地对战');
}
function renderReplays() {
  const list = rpList(), setN = trSet().length;
  // 训练集是本机攒下来的样本（导入的 .jsonl 并在这里），能整包导出、也能清掉
  const trRow = setN ? `<div class="rprow"><div class="rpm"><div class="rpt">训练集</div><div class="rps">${setN} 个样本</div></div><div style="display:flex;gap:6px;"><button class="ghost" data-trdl="1">导出</button><button class="ghost" data-trclear="1">清空</button></div></div>` : '';
  $id('rpList').innerHTML = (list.length ? list.map((m, i) => `<div class="rprow"><div class="rpm"><div class="rpt">${escapeHTML(rpTitle(m))}</div><div class="rps">${escapeHTML(rpSub(m))}</div></div><div style="display:flex;gap:6px;"><button class="go" data-rp="${i}">播放</button><button class="ghost" data-rptrain="${i}">训AI</button><button class="ghost" data-rpexp="${i}">导出</button><button class="ghost" data-rpdel="${i}">删除</button></div></div>`).join('')
    : uiState('empty', '还没有回放。完成一场支持录像的战斗后，回放会自动保存在这里。')) + trRow;
}
$id('rpList').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const list = rpList();
  if (b.dataset.trdl !== undefined) {
    const set = trSet();
    if (trDownload(set, `renying-train-set_${Date.now()}.jsonl`)) toast(`已导出训练集：${set.length} 个样本`);
    return;
  }
  if (b.dataset.trclear !== undefined) {
    try { localStorage.removeItem(TR_KEY); } catch (e) {}
    renderReplays(); toast('训练集已清空');
    return;
  }
  if (b.dataset.rp !== undefined) { const m = list[+b.dataset.rp]; if (m) startReplay(m); }
  else if (b.dataset.rpdel !== undefined) { list.splice(+b.dataset.rpdel, 1); rpStore(list); renderReplays(); }
  else if (b.dataset.rptrain !== undefined) {
    const m = list[+b.dataset.rptrain];
    if (!m) return;
    const samples = trSamples(m);
    if (!samples.length) {
      // 老版本录的回放、或从别处导入的回放里没有逐帧状态：说清楚，别再造一份假的出来
      toast('这局没有采集到逐帧状态（旧版本录的或导入的回放），没法生成训练轨迹');
      return;
    }
    if (trDownload(samples, `user_fight_${m.t || Date.now()}.jsonl`)) {
      toast(`已导出这一局的真实轨迹：${samples.length} 个样本（s = 19 维状态，a = 按键位掩码，r = 本帧回血/掉血与终局胜负）`);
    }
  }
  else if (b.dataset.rpexp !== undefined) {
    const m = list[+b.dataset.rpexp];
    if (!m) return;
    const blob = new Blob([JSON.stringify(m, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `RenYing-Replay-${m.t || Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('录像已导出');
  }
});
if ($id('rpTrainUploadBtn')) {
  $id('rpTrainUploadBtn').addEventListener('click', () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,.jsonl,application/json';
    inp.onchange = e => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = evt => {
        try {
          const txt = evt.target.result;
          if (file.name.endsWith('.jsonl')) {
            // 逐行真的读进来，并进训练集；坏行报数字，不再只是弹个提示然后把文件丢掉
            const r = trImportText(txt);
            if (!r.added) throw new Error(r.bad.length ? `没有可用的样本（第 ${r.bad.slice(0, 3).join('、')} 行格式不对）` : '文件里没有样本');
            if (r.ok === false) throw new Error('本机空间不够，训练集没存下');
            renderReplays();
            toast(`已加入 ${r.added} 个样本${r.bad.length ? `（跳过 ${r.bad.length} 行格式不对的）` : ''} · 训练集共 ${r.total} 个`);
          } else {
            const m = JSON.parse(txt);
            if (!m || !Array.isArray(m.ch)) throw new Error('无效战局录像');
            const list = rpList();
            list.unshift(m);
            while (list.length > RP_MAX) list.pop();
            rpStore(list);
            renderReplays();
            toast('战局已成功导入！点击「训AI」即可生成训练数据集');
          }
        } catch (err) {
          toast(err.message || '战局上传失败');
        }
      };
      reader.readAsText(file);
    };
    inp.click();
  });
}
if ($id('rpImportBtn')) {
  $id('rpImportBtn').addEventListener('click', () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.onchange = e => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = evt => {
        try {
          const m = JSON.parse(evt.target.result);
          if (!m || !m.ev || !m.st0 || !Array.isArray(m.ch)) {
            throw new Error('录像文件格式不正确');
          }
          const list = rpList();
          list.unshift(m);
          while (list.length > RP_MAX) list.pop();
          rpStore(list);
          renderReplays();
          toast('录像导入成功');
        } catch (err) {
          toast(err.message || '录像解析失败');
        }
      };
      reader.readAsText(file);
    };
    inp.click();
  });
}
function startReplay(m) {
  if (!m || !m.ev || !m.st0) return;
  debugHitbox = false;
  if (FOREST.on) { FOREST.on = false; FOREST.mons = []; FOREST.shots = []; B.forestProxy = false; B.hidden = false; }
  ROLL.on = false; REC.on = false; paused = false; BP = null; B.dummy = false; M.stage = null;
  Object.assign(REPLAY, { on: true, m, totalFrame: 0, segmentIndex: 0, segments: Array.isArray(m.segments) && m.segments.length ? m.segments : [m], paused: false, speed: 1, hz: 120, frameAcc: 0 });
  replayLoadSegment(REPLAY.segments[0]);
  acc = 0; creditT = 0; particles.length = 0;
  pickScene();
  $id('rpPause').textContent = '暂停';
  for (const x of document.querySelectorAll('#rpBar [data-sp]')) x.classList.toggle('sel', x.dataset.sp === '1');
  replayInspectRender();
  $id('rpBar').classList.remove('hidden');
  rpInfo();
}
function replayLoadSegment(m) {
  ROLL.on = false; REC.on = false; M.stage = null;
  setChars(m.ch[0], m.ch[1]);
  if (m.ch4) { C.setChar(m.ch4[2]); D.setChar(m.ch4[3]); }
  const net = m.kind === 'net', mine = new Set(net ? rpSlots(m).flat() : []);
  for (const f of rpFighters(m)) {
    f.ctrl = net && !mine.has(f.idx) ? new AICtrl(m.level || 'god') : new Ctrl();
    if (net && mine.has(f.idx)) f.ctrl.net = true;
  }
  if (!net && m.four && Array.isArray(m.pl)) rpFighters(m).forEach((f, i) => { if (m.pl[i]) f.ctrl.net = true; });
  restState(m.st0);
  M.mode = 'replay';
  M.competitiveScrolls = m.competitiveScrolls && typeof m.competitiveScrolls === 'object' ? JSON.parse(JSON.stringify(m.competitiveScrolls)) : null;
  M.hasBuffs = !!(M.competitiveScrolls && Object.values(M.competitiveScrolls).some(team => Object.keys(team || {}).length));
  Object.assign(REPLAY, { kind: m.kind, seg: m, ev: m.ev || [], p: 0, f: 0, nf: 0, lh: [0, 0] });
  if (isRaid()) raidBossSkills();
  showScreen(null);
  startRound();
  rpFighters(m).forEach((f, i) => { const k = (m.skins || [])[i] || ''; f.look = skinLook(f.chIdx, k); f.skinKey = k; });
}
function rpInfo() {
  if (REPLAY.on) {
    const segments = REPLAY.segments || [], progress = segments.length > 1 ? ` · 第 ${REPLAY.segmentIndex + 1}/${segments.length} 段` : '';
    $id('rpInfo').textContent = cvT(`回放 · 第${M.round}回合${progress}${REPLAY.paused ? ' · 已暂停' : ''} · F1 判定框`);
  }
  replayInspectRender();
}
function replayInspectRender() {
  const rate = $id('rpHz'), value = $id('rpHzValue'), hitbox = $id('rpHitbox'), advance = $id('rpStep');
  if (rate && rate.value !== String(REPLAY.hz || 120)) rate.value = String(REPLAY.hz || 120);
  if (value && value.textContent !== `${REPLAY.hz || 120} Hz`) value.textContent = `${REPLAY.hz || 120} Hz`;
  if (hitbox) {
    hitbox.setAttribute('aria-pressed', String(debugHitbox));
    const label = cvT(`F1 判定框：${debugHitbox ? '开' : '关'}`);
    if (hitbox.textContent !== label) hitbox.textContent = label;
  }
  if (advance) advance.disabled = !REPLAY.on || !REPLAY.paused || M.phase === 'end';
}
// 联机录像里每台电脑管哪几个人（fighter 序号）；以前的录像没记，那时只有 1v1：房主 A、加入的人 B
const rpSlots = m => (m && Array.isArray(m.slots) && m.slots.length === 2) ? m.slots : [[0], [1]];
function replayFrame() {
  if (REPLAY.kind === 'net') {
    const ev = REPLAY.ev, cur = [{ h: REPLAY.lh[0], p: [] }, { h: REPLAY.lh[1], p: [] }];
    while (REPLAY.p < ev.length && ev[REPLAY.p][0] <= REPLAY.nf) { const e = ev[REPLAY.p++]; cur[e[1]] = { h: e[2], p: e.slice(3) }; REPLAY.lh[e[1]] = e[2]; }
    rpSlots(REPLAY.m).forEach((slot, side) => slot.forEach((idx, k) => applyInput(fighterByIdx(idx).ctrl, slotInput(cur[side], k))));
    REPLAY.nf++;
  }
  step();
  REPLAY.totalFrame = (REPLAY.totalFrame || 0) + 1;
  const replayFrameNo = REPLAY.kind === 'net' ? REPLAY.nf : REPLAY.f;
  const seg = REPLAY.seg || REPLAY.m;
  if (REPLAY.on && M.phase !== 'end' && +seg.frames > 0 && replayFrameNo >= +seg.frames) replayEnd(REPLAY.m.w);
}
function replayTick(real) {
  if (REPLAY.paused || M.phase === 'end') return;
  REPLAY.frameAcc += real * Math.max(1, Math.min(120, REPLAY.hz || 120)) * REPLAY.speed;
  let n = 0;
  while (REPLAY.frameAcc >= 1 && n < 48) { replayFrame(); REPLAY.frameAcc -= 1; n++; if (M.phase === 'end' || !REPLAY.on) break; }
  if (n >= 48) REPLAY.frameAcc = 0;
  rpInfo();
}
function replayStep() {
  if (!REPLAY.on || !REPLAY.paused || M.phase === 'end') return false;
  REPLAY.frameAcc = 0;
  replayFrame();
  replayInspectRender();
  return true;
}
function replayEnd(w) {
  if (REPLAY.segmentIndex + 1 < (REPLAY.segments || []).length) {
    REPLAY.segmentIndex++;
    replayLoadSegment(REPLAY.segments[REPLAY.segmentIndex]);
    rpInfo();
    return;
  }
  M.phase = 'end'; REPLAY.paused = true;
  $id('rpBar').classList.add('hidden');
  const t = $id('endTitle'), wf = [A, B][w], mate = REPLAY.m && REPLAY.m.four ? [C, D][w] : null;
  if (wf) { t.textContent = `${wf.look.name}${mate ? ' · ' + mate.look.name : ''} 胜`; t.style.color = `rgb(${wf.look.slash})`; } else { t.textContent = '平局'; t.style.color = ''; }
  $id('endSub').textContent = `回放结束，比分 ${M.wins[0]} : ${M.wins[1]}`;
  $id('endRank').textContent = '';
  $id('againBtn').style.display = 'none';
  $id('rpWatch').style.display = ''; $id('rpWatch').textContent = '再看一遍';
  $id('endChangeHeroBtn').classList.add('hidden');
  $id('endRelayTeams').classList.add('hidden');
  $id('endHistoryBtn').classList.toggle('hidden', !rpList().length);
  RP.last = REPLAY.m;
  endReviewShow(REPLAY.m);
  setTimeout(() => showScreen('end'), 300);
}
$id('rpWatch').addEventListener('click', () => { if (RP.last) startReplay(RP.last); });
$id('rpPause').addEventListener('click', () => { REPLAY.paused = !REPLAY.paused; $id('rpPause').textContent = cvT(REPLAY.paused ? '继续' : '暂停'); rpInfo(); });
$id('rpHz').addEventListener('input', e => { REPLAY.hz = Math.max(1, Math.min(120, Math.round(+e.target.value || 120))); REPLAY.frameAcc = 0; replayInspectRender(); });
$id('rpHitbox').addEventListener('click', () => { if (!REPLAY.on || M.phase === 'end') return; debugHitbox = !debugHitbox; replayInspectRender(); });
$id('rpStep').addEventListener('click', replayStep);
$id('rpExit').addEventListener('click', toMenu);
for (const b of document.querySelectorAll('#rpBar [data-sp]')) b.addEventListener('click', () => {
  REPLAY.speed = +b.dataset.sp;
  for (const x of document.querySelectorAll('#rpBar [data-sp]')) x.classList.toggle('sel', x === b);
});
window.addEventListener('keydown', e => { if (REPLAY.on && e.code === 'Space' && M.phase !== 'end') { e.preventDefault(); e.stopImmediatePropagation(); $id('rpPause').click(); } }, true);

// ======================= 青锋行打通：每破一章的首领，在刃影领奖励（青锋行发来 3、6、10，依次是第一、二、三章） =======================
const QFX_REW = [[3, 200, ''], [6, 300, ''], [10, 500, 'qf_qfx']];
const QFX = { busy: false };
