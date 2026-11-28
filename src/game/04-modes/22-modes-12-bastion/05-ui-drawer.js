// ======================= 整备抽屉与 HUD =======================
let bastionArmoryTab = 'forge';
function bastionToggleArmory(force) {
  const B0 = bastionEnsureState();
  B0.armoryOpen = force !== undefined ? !!force : !B0.armoryOpen;
  bastionRenderArmory();
}

function ensureBastionOverlay() {
  if (typeof document === 'undefined' || !document.body) return null;
  let bar = document.getElementById('bastionHudBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'bastionHudBar';
    bar.className = 'bastion-hud-bar';
    document.body.appendChild(bar);
  }
  if (!bar.dataset.bound) {
    bar.dataset.bound = '1';
    bar.innerHTML = `<button type="button" class="ghost small" id="bHudTp">[T] 传音同袍</button>`
      + `<button type="button" class="ghost small" id="bHudSos">[V] 穿云箭</button>`
      + `<button type="button" class="ghost small" id="bHudComp">[G] 灵侍绝技</button>`
      + `<button type="button" class="ghost small" id="bHudBank">⛩ 寄存</button>`
      + `<button type="button" class="ghost small" id="bHudExtract">撤离回城</button>`
      + `<button type="button" class="go small" id="bHudArmory">[B] 天枢整备</button>`;
    const bind = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
    bind('bHudTp', () => bastionTpToAlly());
    bind('bHudSos', () => bastionFireSos());
    bind('bHudComp', () => bastionCastCompanionSkill());
    bind('bHudBank', () => bastionWaystationBank());
    bind('bHudExtract', () => bastionExtract());
    bind('bHudArmory', () => bastionToggleArmory());
  }
  let drawer = document.getElementById('bastionDrawer');
  if (!drawer) {
    drawer = document.createElement('div');
    drawer.id = 'bastionDrawer';
    drawer.className = 'bastion-drawer hidden';
    document.body.appendChild(drawer);
  }
  return { bar, drawer };
}

function bastionSyncHUD() {
  const ui = ensureBastionOverlay(); if (!ui) return;
  const on = B2D.open || (M.mode === 'bastion' && !document.querySelector('.scr.on'));
  ui.bar.style.display = on ? 'flex' : 'none';
  if (!on || !M.bastion) { ui.drawer.classList.add('hidden'); return; }
  const tpBtn = document.getElementById('bHudTp');
  if (tpBtn) tpBtn.textContent = M.bastion.tpCd > 0 && M.bastion.sosActiveT <= 0 ? `[T] 传音 (${Math.ceil(M.bastion.tpCd)}s)` : '[T] 传音同袍';
  const sosBtn = document.getElementById('bHudSos');
  if (sosBtn) sosBtn.textContent = M.bastion.sosCd > 0 ? `[V] 穿云 (${Math.ceil(M.bastion.sosCd)}s)` : '[V] 穿云箭';
}

function bastionRenderArmory() {
  const ui = ensureBastionOverlay(); if (!ui) return;
  if (!M.bastion || !M.bastion.armoryOpen) { ui.drawer.classList.add('hidden'); return; }
  ui.drawer.classList.remove('hidden');
  const p = bastionProfile(), st = bastionStats();
  let html = `<div class="bd-head"><b>天枢城 · 整备百业（功勋:${p.merit} | 灵脉:${p.ley} | 宗门库:${p.guild.treasury}）</b>`
    + `<button type="button" class="ghost small" id="bCloseDrawer">关闭 [B]</button></div>`
    + `<div class="bd-tabs">`
    + `<button type="button" class="ghost small ${bastionArmoryTab === 'forge' ? 'sel' : ''}" data-bt="forge">百兵衣冠 (8流派6槽)</button>`
    + `<button type="button" class="ghost small ${bastionArmoryTab === 'comp' ? 'sel' : ''}" data-bt="comp">随行灵侍 (6位)</button>`
    + `<button type="button" class="ghost small ${bastionArmoryTab === 'mats' ? 'sel' : ''}" data-bt="mats">万象材谱 (24种)</button>`
    + `<button type="button" class="ghost small ${bastionArmoryTab === 'city' ? 'sel' : ''}" data-bt="city">城防·宗门·传送阵</button>`
    + `</div><div class="bd-body">`;
  if (bastionArmoryTab === 'forge') {
    const activeSets = BASTION_GENRES.filter(g => st.gc[g.id] >= 2).map(g => `${g.name} (${st.gc[g.id]}件)`).join('、') || '暂无激活套装';
    const cardList = Object.entries(st.cards || {}).map(([id, n]) => `${BASTION_CARD_BY[id]?.name || id}×${n}`).join('、') || '暂无本局秘卷';
    html += `<p class="bd-sub">境界 Lv.${p.level || 1} | 套装：${activeSets} | 秘卷：${cardList} | 攻击×${st.atkMul.toFixed(2)} | 气血×${st.hpMul.toFixed(2)}</p>`;
    html += `<div class="bd-grid">` + BASTION_SLOTS.map(s => {
      const it = st.eq[s.id];
      const upgTxt = it && it.upg ? ` +${it.upg}` : '';
      return `<div class="bd-card"><b>${s.name}</b><small>${it ? it.name + upgTxt : '未穿戴'}</small>`
        + (it && (it.upg || 0) < 5 ? `<button type="button" class="ghost small bEnhBtn" data-bi="${it.id}">强化 +1 (${((it.upg || 0) + 1) * 50}功勋)</button>` : '')
        + `</div>`;
    }).join('') + `</div>`;
    html += `<div class="bd-row">` + BASTION_GENRES.map(g => `<button type="button" class="ghost small bForgeBtn" data-bg="${g.id}">锻造 ${g.name} 兵器</button>`).join('') + `</div>`;
    html += `<div class="bd-row">` + p.bag.slice(-8).map(it => `<button type="button" class="ghost small bEquipBtn" data-bi="${it.id}">穿戴 ${it.name}${it.upg ? ` +${it.upg}` : ''}</button>`).join('') + `</div>`;
  } else if (bastionArmoryTab === 'comp') {
    html += `<div class="bd-grid">` + BASTION_COMPANIONS.map(c => {
      const has = p.comp.unlocked.includes(c.id), isAct = p.comp.active === c.id;
      return `<div class="bd-card"><b>${c.name} (${c.role})</b><small>${c.desc} 羁绊 L${p.comp.bonds[c.id] || 1}</small>`
        + `<button type="button" class="ghost small bCompBtn" data-bc="${c.id}">${has ? (isAct ? '出战中 · 喂养' : '设为出战') : '契约解锁'}</button></div>`;
    }).join('') + `</div>`;
  } else if (bastionArmoryTab === 'mats') {
    html += `<div class="bd-grid">` + BASTION_MATS.map(m => `<div class="bd-card"><b>${m.name} (T${m.tier})</b><small>持有：${p.mats[m.id] || 0}</small>`
      + (m.tier < 4 && m.cat !== 'boss' ? `<button type="button" class="ghost small bTransBtn" data-bm="${m.id}">4→1 炼化</button>` : '')
      + `</div>`).join('') + `</div>`;
  } else {
    html += `<div class="bd-grid">` + BASTION_BUILDINGS.map(b => `<div class="bd-card"><b>${b.name} L${p.buildings[b.id] || 1}</b><small>${b.desc}</small>`
      + `<button type="button" class="ghost small bBuildBtn" data-bb="${b.id}">捐献材料</button></div>`).join('') + `</div>`;
    html += `<div class="bd-row">`
      + `<button type="button" class="ghost small" id="bGuildDonBtn">宗门捐献 (+25 宗门库/贡献)</button>`
      + BASTION_REALMS.map(r => `<button type="button" class="ghost small bRealmBtn" data-br="${r.tier}">传送 ${r.name}</button>`).join('')
      + `<button type="button" class="go small" id="bGoSiegeBtn">进入守城战</button></div>`;
  }
  html += `</div>`;
  ui.drawer.innerHTML = html;
  const cl = document.getElementById('bCloseDrawer'); if (cl) cl.onclick = () => bastionToggleArmory(false);
  for (const t of ui.drawer.querySelectorAll('[data-bt]')) t.onclick = () => { bastionArmoryTab = t.dataset.bt; bastionRenderArmory(); };
  for (const b of ui.drawer.querySelectorAll('.bForgeBtn')) b.onclick = () => { bastionForgeItem('weapon', b.dataset.bg, 1); bastionRenderArmory(); };
  for (const b of ui.drawer.querySelectorAll('.bEquipBtn')) b.onclick = () => { bastionEquipItem(b.dataset.bi); bastionRenderArmory(); };
  for (const b of ui.drawer.querySelectorAll('.bEnhBtn')) b.onclick = () => { bastionEnhanceItem(b.dataset.bi); bastionRenderArmory(); };
  for (const b of ui.drawer.querySelectorAll('.bCompBtn')) b.onclick = () => {
    const id = b.dataset.bc;
    if (p.comp.unlocked.includes(id) && p.comp.active !== id) { p.comp.active = id; bastionSave(); bastionInitCompanions(); }
    else bastionUnlockOrBondCompanion(id);
    bastionRenderArmory();
  };
  for (const b of ui.drawer.querySelectorAll('.bTransBtn')) b.onclick = () => { bastionTransmuteMat(b.dataset.bm); bastionRenderArmory(); };
  for (const b of ui.drawer.querySelectorAll('.bBuildBtn')) b.onclick = () => { bastionDonateBuilding(b.dataset.bb, 3); bastionRenderArmory(); };
  for (const b of ui.drawer.querySelectorAll('.bRealmBtn')) b.onclick = () => { bastionSwitchSpace('expedition', +b.dataset.br); bastionToggleArmory(false); };
  const gd = document.getElementById('bGuildDonBtn'); if (gd) gd.onclick = () => { bastionDonateGuild(3); bastionRenderArmory(); };
  const sg = document.getElementById('bGoSiegeBtn'); if (sg) sg.onclick = () => { bastionSwitchSpace('siege', 1); bastionToggleArmory(false); };
}

function startBastion(p1, p2, lv, opts = {}) {
  initAudio();
  paused = false;
  const pvp = !!opts.pvp;
  M.mode = 'bastion';
  M.level = lv || pickLevel || 'normal';
  M.round = 1; M.wins = [0, 0]; M.carry = null; M.stage = null; M.duo = null; M.map = null; M.quick = false;
  M.watchAi = false; M.bastionPvp = pvp;
  M.teamMutator = 'normal';
  const allyCh = (p1 + 1) % CHARS.length;
  const bossCh = (p2 + 2) % CHARS.length;
  setChars(p1, p2, allyCh, bossCh);
  A.ctrl = human[0];
  C.ctrl = pvp ? human[1] : new AICtrl(M.level);
  B.ctrl = new AICtrl(M.level);
  D.ctrl = new AICtrl(M.level);
  human[0].clear(); human[1].clear();
  showScreen(null);
  REC.on = false;
  startRound();
  if (opts.space) bastionSwitchSpace(opts.space, opts.tier || 1);
  bastionSyncHUD();
}
