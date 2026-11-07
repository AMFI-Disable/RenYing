// ======================= 2v2 天道演武观战 (Watch AI vs AI 2v2) =======================
// 本文件：2v2 观战：电脑替两队点将（watch2v2AiChoice），一步一步自动禁选，然后开打（startWatch2v2）。
// watch2v2Draft: [ban1, team1_p1, team1_p2, ban2, team2_p1, team2_p2] -> 6 个完全不重复的英雄索引
let watch2v2Draft = [3, 0, 1, 6, 2, 7];

// 2v2 的竞技标准蛇形禁选顺序（Snake Draft Order）：
// 步骤：[0队禁, 1队禁, 0队首选, 1队首选, 1队次选(连选), 0队次选(终选)]
// 先选方拥有首选优势，后选方享有二连选（Pick 2 & Pick 3）的战术组合权，杜绝先选方全包不公。
const WATCH2V2_TEAMS = ['苍龙', '赤凤'];
const WATCH2V2_STEPS_ORDER = [
  { team: 0, type: 'ban', slot: 0, label: '苍龙禁' },
  { team: 1, type: 'ban', slot: 0, label: '赤凤禁' },
  { team: 0, type: 'pick', slot: 0, label: '苍龙先锋' },
  { team: 1, type: 'pick', slot: 0, label: '赤凤先锋' },
  { team: 1, type: 'pick', slot: 1, label: '赤凤次锋' },
  { team: 0, type: 'pick', slot: 1, label: '苍龙次锋' },
];
const WATCH2V2_STEP_DELAY = 0.75;     // 每一步停留 0.75 秒，足够看清 AI 的出手顺序
const WATCH2V2_FINISH_DELAY = 1.15;   // 禁选完成后留一点时间给玩家看清最终阵容
let watch2v2Bp = null;                // 2v2 专属禁选状态；1v1 仍然使用 BP / bpMode，互不干扰

// 进入 2v2 禁选：切到 #bp 选人界面，由 bpTick 驱动的天道 AI 逐步完成 6 手禁选。
function startWatch2v2Draft(customOpts = {}) {
  const opts = { ...(customOpts || {}) };
  if (!opts.mapBriefed && !skipInteractiveDraft()) {
    opts.mapId = MAPS[opts.mapId] ? opts.mapId : rollMap();
    opts.mapBriefed = true;
    showMapBriefing(opts.mapId, () => { if (currentScreen === 'mapBriefing') startWatch2v2Draft(opts); });
    return;
  }
  initAudio();
  M.map = MAPS[opts.mapId] ? opts.mapId : rollMap();
  ensurePortraits();
  chatClear();
  BP = null;
  watch2v2Bp = {
    step: 0,
    bans: [-1, -1],
    picks: [[-1, -1], [-1, -1]],
    draft: [-1, -1, -1, -1, -1, -1],
    last: -1,
    t: WATCH2V2_STEP_DELAY,
  };
  bpMode = 'watch2v2';
  bpSel = -1; bpHover = -1;
  showScreen('bp');
  renderBP();
}

// 天道 AI 的选人逻辑：禁选永远从“未被禁、未被选”的侠客里挑，保证 6 个席位互不重复；
// 选人时优先拿 beats 里写着敌方已选侠客的人，禁用时优先封掉 beats 里写着自家已选侠客的人。
function watch2v2AiChoice(step) {
  const st = watch2v2Bp;
  const used = new Set();
  for (const b of st.bans) if (b >= 0) used.add(b);
  for (const side of st.picks) for (const i of side) if (i >= 0) used.add(i);
  const avail = CHARS.map((_, i) => i).filter(i => !used.has(i));
  if (!avail.length) return 0;
  if (step.type === 'pick') {
    // 打分选人：beats 里有对面的人 +3、对面的 beats 里有自己 -2.5、和队友招式定位互补（近身配远程）+1.5，再加一点随机避免每局同一套
    const foes = st.picks[1 - step.team].filter(i => i >= 0).map(i => CHARS[i]);
    const mates = st.picks[step.team].filter(i => i >= 0).map(i => CHARS[i]);
    const role = ch => (typeof AI_KIT !== 'undefined' && AI_KIT[ch.skill] && AI_KIT[ch.skill].role) || 'rush';
    const ranged = r => r === 'proj' || r === 'trap' || r === 'zone';
    let best = avail[0], bestS = -Infinity;
    for (const i of avail) {
      const ch = CHARS[i];
      let s = Math.random() * 1.6;
      for (const f of foes) {
        if ((ch.beats || []).includes(f.id)) s += 3;
        if ((f.beats || []).includes(ch.id)) s -= 2.5;
      }
      for (const m of mates) if (ranged(role(m)) !== ranged(role(ch))) s += 1.5;
      if (s > bestS) { bestS = s; best = i; }
    }
    return best;
  } else {
    const mine = st.picks[step.team].filter(i => i >= 0).map(i => CHARS[i].id);
    if (mine.length) {
      const threats = avail.filter(i => mine.some(id => (CHARS[i].beats || []).includes(id)));
      if (threats.length && Math.random() < 0.7) return threats[(Math.random() * threats.length) | 0];
    }
  }
  return avail[(Math.random() * avail.length) | 0];
}

function watch2v2ApplyStep() {
  const st = watch2v2Bp;
  const step = WATCH2V2_STEPS_ORDER[st.step];
  const i = watch2v2AiChoice(step);
  st.draft[st.step] = i;
  if (step.type === 'ban') {
    st.bans[step.team] = i;
    SFX.thud();
  } else {
    const slots = st.picks[step.team];
    const slotIdx = step.slot !== undefined ? step.slot : slots.findIndex(v => v < 0);
    slots[slotIdx < 0 ? slots.length - 1 : slotIdx] = i;
    SFX.block();
  }
  st.last = i;
  st.step++;
  st.t = st.step >= WATCH2V2_STEPS_ORDER.length ? WATCH2V2_FINISH_DELAY : WATCH2V2_STEP_DELAY;
  bpSel = i;
  renderBP();
}

function bpTickWatch2v2(dt) {
  const st = watch2v2Bp;
  if (!st) return;
  const scr = $id('bp');
  if (!scr || !scr.classList.contains('on')) { watch2v2Bp = null; return; }
  st.t -= dt;
  if (st.t > 0) return;
  if (st.step >= WATCH2V2_STEPS_ORDER.length) {
    const draft = st.draft.slice();
    watch2v2Bp = null;
    showPop(null);
    startWatch2v2(draft);
    return;
  }
  watch2v2ApplyStep();
}

// 2v2 禁选界面的绘制：沿用 #bp 的骨架（双方席位 / 中央步骤 / 英雄网格 / 详情 / 招式速览 / 底栏），
// 只把槽位扩成每队 1 禁 2 选，并把操作全部交给 AI。
function renderBPWatch2v2() {
  const st = watch2v2Bp;
  if (!st) return;
  const total = WATCH2V2_STEPS_ORDER.length;
  const done = st.step >= total;
  const step = done ? null : WATCH2V2_STEPS_ORDER[st.step];
  const teamCol = sd => (sd === 0 ? 'var(--p1)' : 'var(--p2)');
  const active = sd => !done && step.team === sd;
  $id('bpChat').classList.add('hidden');
  // 步骤名里已经带上了队名（苍龙禁 / 赤凤先锋），标题不再重复一遍
  const stepTeam = done ? '' : WATCH2V2_TEAMS[step.team];
  $id('bpStep').innerHTML = `<span>${done ? '禁选完成 · 演武即将开始'
    : (step.label.startsWith(stepTeam) ? step.label : `${stepTeam} · ${step.label}`)}</span>`
    + `<span class="bpcount">${done ? `6 / ${total} 步` : `第 ${st.step + 1} / ${total} 步`}</span>`;
  $id('bpStep').style.color = done ? 'var(--gold)' : teamCol(step.team);
  $id('bpTime').textContent = done ? '' : (st.last >= 0 ? `上一手 · ${CHARS[st.last].name}` : '天道 AI 演算中');
  $id('bpTime').classList.remove('urgent');
  for (const sd of [0, 1]) {
    const banActive = active(sd) && step.type === 'ban';
    const pickActive = active(sd) && step.type === 'pick';
    const pickNum = pickActive ? st.picks[sd].filter(i => i >= 0).length : -1;
    const slot = (idx, kind, on, lab) => `<div class="slot2 ${kind}${on ? ' on' : ''}">${idx >= 0 ? `<img src="${PORTRAITS[idx] || ''}" alt=""><span class="lab">${lab}${CHARS[idx].name}</span>` : lab}</div>`;
    const slotsHtml = slot(st.bans[sd], 'ban', banActive, '禁 ')
      + slot(st.picks[sd][0], 'pick', pickActive && pickNum === 0, '选1 ')
      + slot(st.picks[sd][1], 'pick', pickActive && pickNum === 1, '选2 ');
    $id('bpS' + sd).innerHTML = `<div class="who" style="color:${teamCol(sd)}">${WATCH2V2_TEAMS[sd]}队${active(sd) ? ' · 行动中' : ''}</div>
      <div class="slots">${slotsHtml}</div>`;
  }
  $id('bpGrid').innerHTML = CHARS.map((c, i) => {
    const banned = st.bans.includes(i);
    const pickedBy = st.picks.findIndex(p => p.includes(i));
    const isLast = st.last === i;
    const tag = banned ? '<span class="tag">禁</span>'
      : pickedBy >= 0 ? `<span class="tag p" style="background:${pickedBy === 0 ? '#2b6f86' : '#8a5a1e'}">${WATCH2V2_TEAMS[pickedBy]}</span>` : '';
    const state = banned ? '，已禁用' : pickedBy >= 0 ? `，已被${WATCH2V2_TEAMS[pickedBy]}队选择` : '，等待天道 AI 选择';
    return `<button class="bpcard${banned ? ' banned' : ''}${pickedBy >= 0 ? ' picked' : ''}${isLast ? ' sel' : ''}" data-i="${i}" type="button" aria-label="${c.name}，${c.role}${state}" aria-disabled="true"${isLast ? ' style="opacity:1"' : ''}>
      ${tag}<img src="${PORTRAITS[i] || ''}" alt=""><div class="nm" style="color:rgb(${c.look.slash})">${c.name}</div><div class="rl">${c.role}</div></button>`;
  }).join('');
  const show = bpHover >= 0 ? bpHover : (st.last >= 0 ? st.last : 0);
  setDetail(show);
  const goB = $id('bpGo');
  goB.disabled = true;
  goB.textContent = done ? '演武即将开始…' : '天道 AI 自动禁选';
}

// 禁选结束后按 [苍龙禁, 赤凤禁, 苍龙先, 赤凤先, 赤凤次, 苍龙次] 的阵容真正开打。
function startWatch2v2(draft, buffsReady = false) {
  if (!buffsReady) {
    const [ban0, ban1, t1a, t2a, t2b, t1b] = Array.isArray(draft) && draft.length === 6 ? draft : watch2v2Draft;
    const preMatch = preMatchCreate(M.map, (Math.random() * 0x100000000) >>> 0);
    preMatchSetPicks(preMatch, [[t1a, t1b], [t2a, t2b]]);
    competitiveDraftStart(preMatch, 'watch2v2', { isWatch: true }, state => {
      M.competitiveScrolls = competitiveScrollMap(state);
      M.hasBuffs = Object.values(M.competitiveScrolls).some(team => Object.keys(team).length > 0);
      startWatch2v2(draft, true);
    }, false);
    return;
  }
  if (p2pActive()) netDropWaiting();
  initAudio();
  refocusGame();
  paused = false;
  human[0].rec = null;
  REC.on = false;
  if (Array.isArray(draft) && draft.length === 6) watch2v2Draft = [...draft];
  const [ban0, ban1, t1a, t2a, t2b, t1b] = watch2v2Draft;
  M.mode = 'watch2v2'; M.teamMutator = teamMutator;
  M.watchAi = true;
  M.level = 'god';
  M.bans = [ban0, ban1];
  M.wins = [0, 0];
  M.round = 1;
  M.carry = null;
  M.stage = null;
  if (!M.map) M.map = rollMap();
  A.setChar(t1a); C.setChar(t1b);
  B.setChar(t2a); D.setChar(t2b);
  A.ctrl = new AICtrl('god'); C.ctrl = new AICtrl('god');
  B.ctrl = new AICtrl('god'); D.ctrl = new AICtrl('god');
  A.meter = B.meter = C.meter = D.meter = 35;
  human[0].clear(); human[1].clear(); human[2].clear(); human[3].clear();
  showScreen(null);
  startRound();
  say(`天道 2v2 · 禁选 ${CHARS[ban0].name} & ${CHARS[ban1].name}`, 1.4);
}
