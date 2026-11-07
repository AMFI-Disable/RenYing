// ======================= 点将台信息与交互 =======================
function bpDetailHTML(i) {
  if (i < 0) return '<p style="color:var(--dim);grid-column:1/-1;margin:0">把鼠标移到角色上，可查看招式说明。</p>';
  const c = CHARS[i], S = SKILLS[c.skill], U = ULTS[c.ult];
  const curSkin = mySkin(c.id);
  const L = skinLook(i, curSkin);
  const col = `rgb(${L.slash})`;
  const st = c.stat || {};
  const guardTxt = `耐力 ${st.guardMax || 100} · 稳定 ${Math.round((st.guardStab || 1) * 100)}% · 透伤 ${Math.round((st.guardChip || 0.1) * 100)}% · 回涌 ${st.guardRegen || 28}/秒`;
  const hits = HERO_HIT_DETAILS[c.id] || {};
  const comboFlow = hits.light ? `<span>${hits.light.name}</span>（<span>${hits.light.badge || '连击'}</span>） · <span>蓄力</span>：<span>${hits.charge ? hits.charge.name : '蓄力重斩'}</span>` : '';   // 每段单独一个节点，英文界面才能逐段查表
  const S2 = SKILLS[c.skill2];
  const specialMove = S2 ? `<span>${S2.name}</span> · <span>${S2.desc || ''}</span>` : '';

  return `<img src="${PORTRAITS[i] || makePortrait(i)}" alt="" style="border:1px solid ${col};border-radius:6px">
    <div><h3 style="color:${col};display:flex;align-items:center;gap:8px;margin:0 0 4px">${c.name}${curSkin ? `<span class="pill" style="font-size:12px;color:${col};border-color:${col}">皮肤 · ${SKINS[curSkin].name}</span>` : ''}</h3>
    <!-- 皮肤改在角色图鉴里装配：选人是有时限的，这里只显示当前装束 -->
    <div class="meta"><span>${c.role}</span><span>难度 ${'★'.repeat(c.diff)}${'☆'.repeat(3 - c.diff)}</span><span>生命 ${Math.round((st.hp || 850) * ((BAL[c.id] || {}).hp || 1))}</span><span>体量 ${(st.weight || 1).toFixed(2)}</span><span>移速 ${(st.walk || 1).toFixed(2)}</span></div>
    ${bpFav(c) ? `<div class="bp-fav"><b>本局地利</b> <span>${bpFav(c)}</span></div>` : ''}
    <dl><dt><span>被动</span> <span>${c.passiveName}</span></dt><dd>${c.passiveDesc}</dd>
    <dt>门派架势</dt><dd>${guardTxt}</dd>
    ${comboFlow ? `<dt>连招流向</dt><dd>${comboFlow}</dd>` : ''}
    <dt><span>技能</span> <span>${S.name}</span></dt><dd><span>${S.desc}</span><span>（冷却 ${S.cd} 秒）</span></dd>
    ${specialMove ? `<dt><span>绝技</span> <span>${S2.name}</span></dt><dd>${specialMove}</dd>` : ''}
    <dt><span>大招</span> <span>${U.name}</span></dt><dd><span>${U.desc}</span><div style="margin-top:2px;font-size:12px;color:#ffe8a3">${HERO_METER_EXPLAIN[c.id] || ''}</div></dd>${ADV[c.id] ? `<dt>进阶</dt><dd>${ADV[c.id]}</dd>` : ''}</dl>
    </div>`;
}
function buildDetails(force) {
  const box = document.getElementById('bpDetail'), mk = (bpMap() || {}).n || '';   // 换了地图，地利那一行跟着变
  if (!force && box.dataset.built === String(PORTRAITS.length) && box.dataset.map === mk) return;
  box.innerHTML = [-1, ...CHARS.map((c, i) => i)].map(i => `<div class="bpd" data-i="${i}">${bpDetailHTML(i)}</div>`).join('');
  box.dataset.built = String(PORTRAITS.length); box.dataset.map = mk;
}
// 山河异境与常规对决的点将台：这局的地图
const bpMap = () => (BP && MAPS[BP.mapId] && MAPS[BP.mapId]) || null;
const bpFav = c => { const mp = bpMap(); return (mp && mp.fav && mp.fav[c.id]) || ''; };
function bpMapBanner() {
  const box = $id('bpMap'), mp = bpMap();
  if (!box) return;
  box.classList.toggle('hidden', !mp); if (box.parentElement) box.parentElement.classList.toggle('has-map', !!mp);
  if (!mp || box.dataset.map === mp.n) return;
  box.dataset.map = mp.n;
  const fav = Object.keys(mp.fav || {}).filter(id => CHAR_IDX[id] !== undefined).map(id => `<span>${escapeHTML(cvT(CHARS[CHAR_IDX[id]].name))}</span>`).join(' · ');
  box.innerHTML = `<span class="bpm-n">${mp.n}</span><span class="bpm-d">${mp.d}</span>`
    + (fav ? `<span class="bpm-f"><span>地利侠客</span> ${fav}</span>` : '');
}
let bpDeckMove = 'light';
function updateBPDeck(i) {
  const idx = i >= 0 ? i : (bpSel >= 0 ? bpSel : 0);
  const ch = CHARS[idx];
  if (!ch) return;
  const curSkin = mySkin(ch.id);
  const L = skinLook(idx, curSkin);
  const col = `rgb(${L.slash})`;
  const mTypes = HERO_MOVE_TYPES[ch.id] || {};
  const qType = mTypes.skill || { label: '技能', type: 'melee' };
  const rType = mTypes.ranged || { label: '远程', type: 'ranged' };
  const tabs = [
    { k: 'light', lab: '普攻连击 [近战]' },
    { k: 'charge', lab: '蓄力重斩 [近战]' },
    { k: 'skill', lab: `Q · ${SKILLS[ch.skill].name} [${qType.label}]` },
    { k: 'ranged', lab: `R · ${SKILLS[ch.skill2].name} [${rType.label}]` },
    { k: 'ult', lab: `E · ${ULTS[ch.ult].name}` },
  ];
  const tabsEl = $id('bpDeckTabs');
  if (tabsEl) {
    tabsEl.innerHTML = tabs.map(t => `<button class="${t.k === bpDeckMove ? 'sel' : ''}" data-m="${t.k}">${t.lab}</button>`).join('');
    requestAnimationFrame(() => tabsEl.classList.toggle('overflowing', tabsEl.scrollWidth > tabsEl.clientWidth + 2));
  }
  const hit = (HERO_HIT_DETAILS[ch.id] && HERO_HIT_DETAILS[ch.id][bpDeckMove]) || { name: '', badge: '', badgeCls: 'badge-buff', dmg: '', desc: '' };
  const curType = mTypes[bpDeckMove] || { label: '近战', type: 'melee' };
  const nameEl = $id('bpdHitName');
  if (nameEl) {
    nameEl.innerHTML = `<span style="color:${col}">${hit.name}</span> <span class="type-tag ${curType.type || 'melee'}">${curType.label}</span>${hit.dmg ? ` <span style="font-size:12px;color:var(--gold);font-weight:600">· 伤害 ${hit.dmg}</span>` : ''}`;
  }
  const badgeEl = $id('bpdHitBadge');
  if (badgeEl) {
    badgeEl.innerHTML = hit.badge ? `<span class="${hit.badgeCls}">${hit.badge}</span>` : '';
  }
  const descEl = $id('bpdHitDesc');
  if (descEl) {
    descEl.textContent = hit.desc;
  }
}

const bpDeckTabsEl = $id('bpDeckTabs');
if (bpDeckTabsEl) {
  bpDeckTabsEl.addEventListener('click', e => {
    const b = e.target.closest('button[data-m]');
    if (!b) return;
    bpDeckMove = b.dataset.m;
    const idx = bpHover >= 0 ? bpHover : (bpSel >= 0 ? bpSel : 0);
    updateBPDeck(idx);
    const cv = $id('bpDeckCanvas');
    if (cv && cv._pup && HERO_MOVE_SEQS[CHARS[idx].id] && HERO_MOVE_SEQS[CHARS[idx].id][bpDeckMove]) {
      cv._pup.playSeq(HERO_MOVE_SEQS[CHARS[idx].id][bpDeckMove], null, true);
    }
    SFX.slice();
  });
}
demoLoop($id('bpDeckCanvas'), () => (bpHover >= 0 ? bpHover : (bpSel >= 0 ? bpSel : 0)), () => $id('bp') && $id('bp').classList.contains('on'), () => mySkin(CHARS[(bpHover >= 0 ? bpHover : (bpSel >= 0 ? bpSel : 0))].id), () => bpDeckMove);

const bpDetailEl = $id('bpDetail');
if (bpDetailEl) {
  bpDetailEl.addEventListener('click', e => {
    const b = e.target.closest('.bp-skin-btn');
    if (!b) return;
    const idx = +b.dataset.i;
    const sk = b.dataset.sk || '';
    const ch = CHARS[idx];
    if (!ch) return;
    const has = skinOwned(sk);
    if (!has) {
      SFX.slice();
      toast('尚未解锁该皮肤');
      return;
    }
    PROF.equip = PROF.equip || {};
    PROF.equip[ch.id] = sk;
    try { localStorage.setItem('renying-equip', JSON.stringify(PROF.equip)); } catch (err) {}
    if (window.CloudSave) CloudSave.saveProfile(PROF);
    PORTRAITS.length = 0;
    ensurePortraits();
    applyProfile(PROF);
    buildDetails(true);
    setDetail(idx);
    updateBPDeck(idx);
    renderBP();
    if (M.mode === 'net' || bpMode === 'net') {
      send({ pskin: mySkinMap() });
    }
    const cv = $id('bpDeckCanvas');
    if (cv && cv._pup) {
      cv._pup = new Puppet(idx, sk);
      if (HERO_MOVE_SEQS[ch.id] && HERO_MOVE_SEQS[ch.id][bpDeckMove]) {
        cv._pup.playSeq(HERO_MOVE_SEQS[ch.id][bpDeckMove], null, true);
      }
    }
    SFX.slice();
    toast(sk ? `已装配「${SKINS[sk].name}」` : '已换回原本装束');
  });
}

function setDetail(i) {
  buildDetails();
  for (const el of document.querySelectorAll('#bpDetail .bpd')) el.classList.toggle('show', +el.dataset.i === i);
  updateBPDeck(i);
}

function renderBP() {
  // 2v2 专属天道演武禁选走独立状态与独立渲染
  bpMapBanner();
  if (bpMode === 'watch2v2') { if (watch2v2Bp) renderBPWatch2v2(); return; }
  if (!BP) return;
  $id('bpChat').classList.toggle('hidden', bpMode !== 'net');
  const my = bpMySide(), done = BP.step >= bpSteps().length;
  const [side, type] = done ? [-1, ''] : bpSteps()[BP.step];
  const isWatch = bpMode === 'cpuWatch' || (bpCustomOpts && bpCustomOpts.isWatch);
  const myTurn = !done && isMyTurnBP();
  const multiPick = isMultiPickBP();
  const hasBans = bpSteps().some(x => x[1] === 'ban');

  let modePrefix = '';
  if (bpMode === 'net' && NET.isRanked) modePrefix = '排位赛 · ';
  else if (bpMode === 'net' && roomDef().four) modePrefix = '联机2v2 · ';
  else if (bpMode === 'cpu' || bpMode === 'cpuWatch') modePrefix = '论剑点将 · ';
  else if (bpMode === 'chaos') modePrefix = '天机乱斗 · ';
  else if (bpMode === 'maps') modePrefix = '山河异境 · ';
  else if (bpMode === 'mayhem') modePrefix = '通天神决 · ';
  else if (bpMode === 'tag3') modePrefix = '3v3车轮 · ';
  else if (bpMode === 'tower') modePrefix = '问剑密卷 · ';
  else if (bpMode === 'stage') modePrefix = '守关挑战 · ';
  else if (bpMode === 'train') modePrefix = '木人试剑 · ';
  else if (bpMode === '2v2') modePrefix = '2v2演武 · ';
  else if (bpMode === 'raid') modePrefix = '同袍肉鸽 · ';
  else if (bpMode === 'world') modePrefix = '江湖共斗 · ';

  const TAG3_ROLES = ['先锋', '中坚', '大将'];
  const TEAM2_ROLES = ['先锋', '次锋'];

  const isTag3BP = bpMode === 'tag3' || !!(multiPick && BP.picks[0] && BP.picks[0].length === 3);

  let stepTitle = '';
  if (done) {
    stepTitle = isWatch ? '点将完成 · 演武即将开战' : '点将完成 · 准备开战';
  } else if (type === 'ban') {
    stepTitle = `${bpSideName(side)}禁用一名侠客`;
  } else if (isTag3BP) {
    const idxNum = (BP.picks[side] || []).filter(x => x >= 0).length;
    stepTitle = `${bpSideName(side)}钦点【${TAG3_ROLES[idxNum] || '大将'}】出战`;
  } else if (multiPick) {
    const idxNum = (BP.picks[side] || []).filter(x => x >= 0).length;
    stepTitle = `${bpSideName(side)}钦点【${TEAM2_ROLES[idxNum] || '次锋'}】出战`;
  } else if (bpMode === 'tower' || bpMode === 'stage' || bpMode === 'train' || bpMode === 'world') {
    stepTitle = '挑选你的本命首发出战侠客（免禁用直选）';
  } else {
    stepTitle = `${bpSideName(side)}选择出战侠客`;
  }

  // 模式名和这一步分开放，英文界面才能各自查表
  document.getElementById('bpStep').innerHTML = (modePrefix ? `<span>${modePrefix.slice(0, -3)}</span> · ` : '') + `<span>${stepTitle}</span>`
    + (done ? '' : `<span class="bpcount">第 ${BP.step + 1} / ${bpSteps().length} 步</span>`);
  document.getElementById('bpStep').style.color = myTurn ? '#e9c46a' : 'var(--ink)';
  document.getElementById('bpTime').textContent = done ? '' : `${Math.ceil(BP.t)} 秒`;

  // 左右双方席位槽位渲染
  for (const sd of [0, 1]) {
    const el = document.getElementById('bpS' + sd);
    if (!el) continue;
    const keep = [...el.querySelectorAll('.bubble')];
    const banSlotHtml = hasBans
      ? (() => {
          const bIdx = Array.isArray(BP.bans) ? BP.bans[sd] : -1;
          const bActive = !done && side === sd && type === 'ban';
          return `<div class="slot2 ban${bActive ? ' on' : ''}">${bIdx >= 0 ? `<img src="${PORTRAITS[bIdx] || ''}" alt=""><span class="lab">禁 ${CHARS[bIdx].name}</span>` : '禁用'}</div>`;
        })()
      : '';
    if (bpMode === 'raid' && sd === 1) {
      const rb = typeof pendingRaidBoss !== 'undefined' && pendingRaidBoss ? pendingRaidBoss : null;
      const bossTitle = rb ? `六技魔首：${rb.heroNames.join('·')}` : '三侠六技·融魂魔首';
      el.innerHTML = `<div class="who" style="color:var(--p2)">秘境魔首 (3xHP · 1.25x伤)</div>
        <div class="slots"><div class="slot2">${bossTitle}</div></div>`;
    } else if (bpMode === 'tower' || bpMode === 'stage' || bpMode === 'train' || bpMode === 'world') {
      if (sd === 1) {
        // 单人模式右侧显示对位/关卡信息
        let rightInfo = '木人桩试剑';
        if (bpMode === 'tower') rightInfo = '万仞剑阁守关者';
        else if (bpMode === 'stage') rightInfo = (STAGE && STAGE.C ? STAGE.C.name : '守关宗师');
        el.innerHTML = `<div class="who" style="color:var(--p2)">敌阵挑战</div>
          <div class="slots"><div class="slot2">${rightInfo}</div></div>`;
      } else {
        const pIdx = Array.isArray(BP.picks) ? BP.picks[0] : -1;
        const slot = `<div class="slot2 pick${!done ? ' on' : ''}">${pIdx >= 0 ? `<img src="${PORTRAITS[pIdx] || ''}" alt=""><span class="lab">${CHARS[pIdx].name}</span>` : '选择出战'}</div>`;
        el.innerHTML = `<div class="who" style="color:var(--p1)">出战大侠</div>
          <div class="slots">${slot}</div>`;
      }
    } else if (isTag3BP) {
      const picks = BP.picks[sd] || [-1, -1, -1];
      const slotsHtml = [0, 1, 2].map(slotIdx => {
        const idx = picks[slotIdx];
        const isActive = !done && side === sd && type === 'pick' && (BP.picks[sd].filter(x => x >= 0).length === slotIdx);
        return `<div class="slot2 pick${isActive ? ' on' : ''}">${idx >= 0 ? `<img src="${PORTRAITS[idx] || ''}" alt=""><span class="lab">${TAG3_ROLES[slotIdx]} ${CHARS[idx].name}</span>` : TAG3_ROLES[slotIdx]}</div>`;
      }).join('');
      const sideLabel = bpMode === 'tag3' ? `${escapeHTML(bpSideName(sd))}阵线` : escapeHTML(bpSideName(sd));
      el.innerHTML = `<div class="who" style="color:${sd === 0 ? 'var(--p1)' : 'var(--p2)'}">${sideLabel}</div>
        <div class="slots">${banSlotHtml}${slotsHtml}</div>`;
    } else if (multiPick) {
      const picks = BP.picks[sd] || [-1, -1];
      const slotsHtml = [0, 1].map(slotIdx => {
        const idx = picks[slotIdx];
        const isActive = !done && side === sd && type === 'pick' && (BP.picks[sd].filter(x => x >= 0).length === slotIdx);
        return `<div class="slot2 pick${isActive ? ' on' : ''}">${idx >= 0 ? `<img src="${PORTRAITS[idx] || ''}" alt=""><span class="lab">${TEAM2_ROLES[slotIdx]} ${CHARS[idx].name}</span>` : TEAM2_ROLES[slotIdx]}</div>`;
      }).join('');
      el.innerHTML = `<div class="who" style="color:${sd === 0 ? 'var(--p1)' : 'var(--p2)'}">${escapeHTML(bpSideName(sd))}</div>
        <div class="slots">${banSlotHtml}${slotsHtml}</div>`;
    } else {
      const slot = (idx, kind, active) => `<div class="slot2 ${kind}${active ? ' on' : ''}">${idx >= 0 ? `<img src="${PORTRAITS[idx] || ''}" alt=""><span class="lab">${kind === 'ban' ? '禁 ' : ''}${CHARS[idx].name}</span>` : (kind === 'ban' ? '禁用' : '选择')}</div>`;
      el.innerHTML = `<div class="who" style="color:${sd === 0 ? 'var(--p1)' : 'var(--p2)'}">${escapeHTML(bpSideName(sd))}</div>
        <div class="slots">${banSlotHtml}${slot(BP.picks[sd], 'pick', !done && side === sd && type === 'pick')}</div>`;
    }
    for (const b of keep) el.appendChild(b);
  }

  const focusI = document.activeElement && document.activeElement.closest && document.activeElement.closest('#bpGrid .bpcard') ? +document.activeElement.dataset.i : -1;   // 重画后键盘选中框留在同一张卡上
  document.getElementById('bpGrid').innerHTML = CHARS.map((c, i) => {
    let banned = false, pickedBy = -1;
    if (Array.isArray(BP.bans)) banned = BP.bans.includes(i);
    if (multiPick) {
      if (BP.picks[0] && BP.picks[0].includes(i)) pickedBy = 0;
      else if (BP.picks[1] && BP.picks[1].includes(i)) pickedBy = 1;
    } else if (Array.isArray(BP.picks)) {
      pickedBy = BP.picks.indexOf(i);
    }
    const can = myTurn && bpValid(i);
    const myAv = BP.avail && BP.avail[my];
    const lock = !OFFLINE_BUILD && myAv && !myAv.includes(i);
    const free = !OFFLINE_BUILD && !heroesFree() && !ownsHero(c.id) && (PROF.rotation || []).includes(c.id);
    const fav = !!bpFav(c);   // 山河异境：这张图的地利侠客
    const tag = banned ? '<span class="tag">禁</span>' : pickedBy >= 0 ? `<span class="tag p">${escapeHTML(bpSideName(pickedBy))}</span>` : lock ? '<span class="tag lk">未拥有</span>' : free ? '<span class="tag free">限免</span>' : fav ? '<span class="tag fav">地利</span>' : '';
    const state = (banned ? '，已禁用' : pickedBy >= 0 ? '，已被选择' : lock ? '，未拥有' : free ? '，本周限免' : '') + (fav ? '，本局地利' : '');
    const aria = `${c.name}，${c.role}${state}${bpSel === i ? '，已选中' : ''}${can ? '' : '，当前不可选'}`;
    return `<button class="bpcard${lock ? ' lock' : ''}${banned ? ' banned' : ''}${pickedBy >= 0 ? ' picked' : ''}${bpSel === i ? ' sel' : ''}${fav ? ' fav' : ''}" data-i="${i}" aria-label="${aria}" ${can ? '' : 'aria-disabled="true"'}>
      <span class="bp-shortcut">${i + 1}</span>${tag}<img src="${PORTRAITS[i] || ''}" alt=""><div class="nm" style="color:rgb(${c.look.slash})">${c.name}</div><div class="rl">${c.role}</div></button>`;
  }).join('');
  if (focusI >= 0) { const fc = document.querySelector(`#bpGrid .bpcard[data-i="${focusI}"]`); if (fc) fc.focus({ preventScroll: true }); }
  const show = bpHover >= 0 ? bpHover : (bpSel >= 0 ? bpSel : 0);
  setDetail(show);
  const goB = document.getElementById('bpGo');
  if (isWatch) {
    goB.disabled = true;
    goB.textContent = done ? '即将开战 · 演武观战' : 'AI 演武禁选中…';
  } else {
    goB.disabled = !(myTurn && bpValid(bpSel));
    goB.textContent = myTurn ? (bpSel >= 0 ? `${type === 'ban' ? '禁用' : '选择'} ${CHARS[bpSel].name}` : (type === 'ban' ? '选一个禁用' : '选一个角色')) : (done ? '开战在即' : '等待对方');
  }
}
document.getElementById('bpGrid').addEventListener('click', e => {
  const b = e.target.closest('.bpcard'); if (!b || !BP || BP.step >= bpSteps().length) return;
  const i = +b.dataset.i;
  if (!isMyTurnBP() || !bpValid(i)) return;
  if (e.detail === 0 && bpSel === i) { bpConfirm(); return; }   // 键盘（Enter / 空格）对已选中的卡再按一次：确认
  bpSel = i; SFX.slice(); renderBP();
});
let lastCardClick = { i: -1, t: 0 };
document.getElementById('bpGrid').addEventListener('click', e => {
  const b = e.target.closest('.bpcard'); if (!b) return;
  const i = +b.dataset.i, now = performance.now();
  if (lastCardClick.i === i && now - lastCardClick.t < 400) {
    lastCardClick.i = -1;
    if (BP && BP.step < bpSteps().length && isMyTurnBP() && bpValid(i)) { bpSel = i; bpConfirm(); }
    return;
  }
  lastCardClick = { i, t: now };
});
document.getElementById('bpGrid').addEventListener('dblclick', e => {
  const b = e.target.closest('.bpcard'); if (!b || !BP || BP.step >= bpSteps().length) return;
  const i = +b.dataset.i;
  if (!isMyTurnBP() || !bpValid(i)) return;
  bpSel = i; bpConfirm();
});
// 数字键 1～9 直接选人；方向键移动由纯键盘导航（26-kbnav.js）统一处理。
// Enter / 空格：第一次选中这张卡，对已选中的卡再按一次就确认
document.getElementById('bpGrid').addEventListener('keydown', e => {
  if (!BP) return;   // 2v2 观战禁选没有玩家操作，按键不参与
  const k = e.key;
  const cards = [...document.querySelectorAll('#bpGrid .bpcard')];
  if (k >= '1' && k <= '9') {
    const pickNum = parseInt(k, 10) - 1;
    if (pickNum >= 0 && pickNum < CHARS.length && cards[pickNum]) {
      e.preventDefault();
      cards[pickNum].focus();
      if (isMyTurnBP() && bpValid(pickNum)) {
        bpSel = pickNum;
        SFX.slice();
        renderBP();
      }
      return;
    }
  }
});
// 悬停：更新下部检视视窗
let popIdx = -1;
function showPop(card) {
  const pop = $id('bpPop');
  if (!card) { if (pop) pop.classList.remove('on'); popIdx = -1; return; }
  const i = +card.dataset.i;
  popIdx = i;
  updateBPDeck(i);
  if (pop) pop.classList.remove('on');
}
demoLoop($id('bpPopCv'), () => popIdx, () => false);
document.getElementById('bpGrid').addEventListener('pointerover', e => {
  const b = e.target.closest('.bpcard'); const i = b ? +b.dataset.i : -1;
  if (i !== bpHover) { bpHover = i; setDetail(i >= 0 ? i : bpSel); showPop(b); }
});
document.getElementById('bpGrid').addEventListener('focusin', e => {   // 键盘移到哪张卡，下面就显示谁的招式（和鼠标悬停一样）
  const b = e.target.closest('.bpcard'); if (!b) return;
  const i = +b.dataset.i;
  if (i !== bpHover) { bpHover = i; setDetail(i); showPop(b); }
});
document.getElementById('bpGrid').addEventListener('pointerleave', () => { bpHover = -1; setDetail(bpSel); showPop(null); });
function bpConfirm() {
  if (!BP || BP.step >= bpSteps().length || !isMyTurnBP() || !bpValid(bpSel)) return;
  if (bpAuth()) bpApply(bpSel); else { send({ bp: bpSel }); document.getElementById('bpGo').disabled = true; }
}
document.getElementById('bpGo').addEventListener('click', bpConfirm);
document.getElementById('bpQuit').addEventListener('click', () => toMenu());
