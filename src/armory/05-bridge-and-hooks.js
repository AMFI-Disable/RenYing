  async function openArmory(tab) {
    if (tab) TAB = tab;
    ensurePortraits();
    render();
    await connect(false);
    if (MODE === 'server') { try { apply(await ECON('sync', {})); } catch (e) {} }
    else if (MODE === 'local' && ST) { const env = envBase(), sold = C.settle(ST, env); if (sold.length) apply({ state: ST, ink: env.ink, sold }); }
    render();
    clearInterval(POLL);
    POLL = setInterval(() => { if (!$id('armory').classList.contains('on')) { clearInterval(POLL); return; } if (!BUSY && !REEL.on && !bulkOpening) act('sync', {}, { bg: true }).then(() => { if (!BUSY && !REEL.on && !bulkOpening && $id('arModal').hidden && $id('arIns').hidden) render(); }); }, 60000);
  }
  window.openArmory = openArmory;
  window.armoryCombatLoadoutMap = function () {
    const s = blankS(), out = {};
    for (const hero of C.HERO_IDS) {
      const id = s.badgeEquip[hero] || '';
      const pet = (s.petEquip && s.petEquip[hero]) || '';
      const sl = (s.skillLoadout && s.skillLoadout[hero]) || {};
      out[hero] = {
        unlocked: (s.heroKOs[hero] || 0) >= 20,
        stance: s.stances[hero] === 1 ? 1 : 0,
        badge: id,
        tier: id ? s.badgeOwned[id] || '' : '',
        pet,
        petTier: pet && s.petOwned ? (s.petOwned[pet] || '') : '',
        skills: { q: sl.q || 'std', r: sl.r || 'std', e: sl.e || 'std' },
      };
    }
    return out;
  };
  window.armoryBadgeState = function () {
    const s = blankS();
    return {
      owned: { ...(s.badgeOwned || {}) },
      equip: { ...(s.badgeEquip || {}) },
      sigils: s.badgeSigils || 0,
      appreciationClaimed: !!s.appreciation2026,
      badges: C.BADGES,
      cats: C.BADGE_CATS,
    };
  };
  window.armoryEnsureReady = async function () {
    if (!ST && !PROF.guest) await connect(false);
    return ST;
  };
  window.armoryQuickEquipBadge = async function (hero, id) {
    if (!ST) await connect(false);
    const r = await act('badgeEquip', { hero, id: id || '' });
    if (r && r.ok) {
      toast(id ? `已为侠客装备「${cvT(C.BADGES[id].name)}」` : '已卸下当前徽记');
      if ($id('armory') && $id('armory').classList.contains('on')) render();
    }
    return r;
  };
  window.armoryAutoAssignBadges = async function () {
    if (!ST) await connect(false);
    const r = await act('badgeAutoAssign', {});
    if (r && r.ok) {
      toast(`⚡ 已为 ${r.assigned} 位侠客智能装配最优徽记`);
      if ($id('armory') && $id('armory').classList.contains('on')) render();
    }
    return r;
  };
  window.armoryFullAuto = async function () {
    if (!ST && !PROF.guest) await connect(false);
    if (!live()) {
      const err = '请先登录账号后再使用 FULL AUTO';
      toast(err);
      return { err };
    }
    const r = await act('fullAuto', {});
    if (r && r.ok) {
      if (r.soldMarketCount) MKD.at = 0;
      redrawLooks();
      SFX.gong && SFX.gong();
      const parts = [];
      if (r.badges) parts.push(`徽记 ${r.badges}`);
      if (r.skins) parts.push(`皮肤 ${r.skins}`);
      if (r.pets) parts.push(`灵宠 ${r.pets}`);
      if (r.stances) parts.push(`架势 ${r.stances}`);
      if (r.skills) parts.push(`招式 ${r.skills}`);
      if (r.soldMarketCount) parts.push(`变现挂单 ${r.soldMarketCount} 件`);
      if (r.soldDupesCount) parts.push(`售出重复 ${r.soldDupesCount} 件`);
      if (r.soldCount && r.inkGain) parts.push(`+${fmt(r.inkGain)}墨`);
      toast(`⚡ FULL AUTO 完成：${parts.join(' · ') || '配置均已最优'}`);
      if ($id('armory') && $id('armory').classList.contains('on')) render();
      if ($id('codex') && $id('codex').classList.contains('on') && typeof renderCodex === 'function') renderCodex();
      if ($id('acc') && $id('acc').classList.contains('on') && typeof renderAccPage === 'function') renderAccPage();
    }
    return r;
  };
  window.armoryClaimAppreciation = async function (badgeId) {
    if (!ST) await connect(false);
    const r = await act('claimAppreciation', { badgeId: badgeId || 'flowing' });
    if (r && r.ok) {
      SFX.gong && SFX.gong();
      toast(`🎁 感恩盛典大礼已到账！+50,000 墨锭 + 全武器箱 + 紫金徽「${cvT(C.BADGES[r.badgeId].name)}」`);
      if ($id('armory') && $id('armory').classList.contains('on')) render();
    }
    return r;
  };
  bind();
  document.addEventListener('keydown', e => {   // Esc 关掉弹窗 / 检视
    if (e.key !== 'Escape' || !$id('armory').classList.contains('on')) return;
    if (!$id('arModal').hidden) { if (!REEL.on) closeModal(); }
    else if (INS) closeIns();
  });
  // 检视用的小舞台：一直在，打开检视时才画
  demoLoop($id('arInsCv'), () => INS ? CHARS.findIndex(c => c.id === C.charOf(INS.it.k)) : -1, () => !$id('arIns').hidden && !!INS, () => INS ? INS.it.k : '', () => null);
  (function leaveWatch() {   // 离开武库就收起检视和弹窗（开箱滚轮转完再收）
    if (!$id('armory').classList.contains('on')) {
      if (INS) closeIns();
      if (!REEL.on && !$id('arModal').hidden) closeModal();
    }
    requestAnimationFrame(leaveWatch);
  })();

  /* ---------- 接到游戏里 ---------- */
  // 存档同步的回执：墨锭按服务器的账走；服务器拿掉 / 补上的皮肤照着改
  let CAP_TOAST = 0;
  if (CS && CS.onLedger) CS.onLedger((L, fix, capped, owed) => {
    const before = Math.floor(PROF.ink || 0), v = LSYNC(L, before);
    if (v > before) GRANT(v - before);
    PROF.ink = v;
    if (fix) {
      const set = new Set(PROF.skins || []);
      for (const k of fix.skinsAdd || []) set.add(k);
      for (const k of fix.skinsDel || []) {
        set.delete(k);
        for (const [c, x] of Object.entries(PROF.equip || {})) if (x === k) delete PROF.equip[c];
      }
      PROF.skins = Array.from(set);
      if (PORTRAITS.length) { PORTRAITS.length = 0; ensurePortraits(); }
      try { applySkins(); } catch (e) {}
    }
    if (capped > 0 && NOW() - CAP_TOAST > 10 * 60000) {   // 十分钟最多提醒一次
      CAP_TOAST = NOW();
      toast(owed > 0 ? `墨锭收入超过今天的额度，${capped} 先记着，之后补上` : `墨锭收入超过今天的额度，${capped} 没有计入`);   // 额度：每天 1500 + 每局对战 80
    }
    for (const el of document.querySelectorAll('.gInk')) el.textContent = PROF.ink;
    try { renderTopNav(); } catch (e) {}
  });
  const baseApply = applyProfile;
  applyProfile = function (p) {
    if (p && p !== PROF && typeof p === 'object') {
      const u = user(), uid = u ? String(u.uid || u.name || '') : '';
      if (uid !== UID || p.guest) { ST = null; MODE = 'none'; UID = uid; }
      if (!p.guest && !('armory' in p) && MODE !== 'server') loadLocal(undefined);
    }
    const r = baseApply.apply(this, arguments);
    if (p && p !== PROF) migrateLocal();
    if (p && p !== PROF && !PROF.guest && cloudOn() && MODE !== 'server') connect(false).then(() => { if ($id('armory').classList.contains('on')) render(); });
    try { if (p && p !== PROF && $id('armory').classList.contains('on')) render(); } catch (e) {}
    return r;
  };
  window.applyProfile = applyProfile;
  // 斩数：这局里自己的侠客每击倒一个对手记一笔（按侠客分开记，车轮战换人也不乱）。重算、预演的不算
  let KO = {};
  const baseHitVisual = hitVisual;
  hitVisual = function (ev, quiet) {
    try {
      if (ev && ev.ko && !quiet && !RESIM && ev.a === localIdx() && C.MODES.includes(M.mode)) {
        const f = fighterByIdx(ev.a), id = f && f.ch && f.ch.id;
        if (id) KO[id] = (KO[id] || 0) + 1;
      }
    } catch (e) {}
    return baseHitVisual.apply(this, arguments);
  };
  // 开局领一张票（服务器用来判断这局是不是真打了）
  const baseStartRound = startRound;
  startRound = function () {
    if (M.round === 1) KO = {};
    const r = baseStartRound.apply(this, arguments);
    try {
      const mode = M.mode;
      if (MODE === 'server' && C.MODES.includes(mode) && !M.watchAi && !(typeof isAiVsAi === 'function' && isAiVsAi()) && (!TK || NOW() - TK > 40 * 60000)) { TK = NOW(); ECON('matchStart', { mode }).catch(() => { TK = 0; }); }
    } catch (e) {}
    return r;
  };
  // 一局打完：斩数、行动任务、每周补给进度、掉落
  const baseTaskEnd = taskMatchEnd;
  taskMatchEnd = function (w) {
    const r = baseTaskEnd.apply(this, arguments);
    try { matchEnd(w); } catch (e) { console.warn('armory match end', e); }
    return r;
  };
  async function matchEnd(w) {
    const el = $id('endArm'); if (el) el.innerHTML = '';
    const ko = KO; KO = {};
    if (!live() || PROF.guest || OFFLINE_BUILD || REPLAY.on) return;
    if (!C.MODES.includes(M.mode) || M.watchAi || (typeof isAiVsAi === 'function' && isAiVsAi())) return;
    const me = typeof localTeam === 'function' ? localTeam() : 0, f = M.mode === 'net' ? [A, B][localIdx()] : A;
    const wins = M.wins || [0, 0], win = w >= 0 && w === me;
    const ctx = { mode: M.mode, level: M.level || '', char: f && f.ch ? f.ch.id : '', win, flawless: win && !(wins[1 - me] || 0), combo: MSTAT.maxcombo || 0, ults: MSTAT.ults || 0, ko };
    TK = 0;
    const res = await act('matchEnd', { ctx }, { bg: true });
    if (!res || !res.ok) return;
    const notes = [];
    for (const x of res.st || []) notes.push(`斩数 +${x.add}（${escapeHTML(skinName(x.k))} 共 ${x.total}）`);
    if (res.drop) notes.push(res.drop.t === 'case' ? `掉落：${C.COLS[res.drop.c].name}武器箱` : `<span style="color:rgb(${tc(res.drop.item.k)})">掉落：${escapeHTML(itemName(res.drop.item))}</span>`);
    if (ST.drop.g === C.SUPPLY_GAMES && !ST.drop.sup) notes.push('每周补给已解锁，去武库领');
    if (res.drop) { SFX.chargeFull && SFX.chargeFull(); }
    if (el && notes.length) el.innerHTML = notes.join(' · ');
  }
  const baseTopNav = renderTopNav;
  renderTopNav = function () {
    const r = baseTopNav.apply(this, arguments);
    try { const b = document.querySelector('#topNav [data-nav="armory"]'); if (b) b.classList.toggle('tn-dot', !!dots().any); } catch (e) {}
    return r;
  };
  // 礼包兑换码（管理后台建的 + 全服通用解锁码 RENYINGALL）：码在服务器上核对，里面的东西直接进存档；全服通用码也支持本机/离线存档
  window.armoryRedeem = async function (code) {
    const up = String(code || '').trim().toUpperCase();
    const isUniversal = up === C.UNIVERSAL_PROMO_CODE;
    const isHeirloom = up === C.HEIRLOOM_PROMO_CODE;
    const NEED = '礼包兑换码要先登录云端账号才能领';
    if ((isUniversal || isHeirloom) && (!cloudOn() || OFFLINE_BUILD)) {
      if (PROF.guest && !OFFLINE_BUILD) return { err: '请先登录账号再兑换礼包码' };
      if (!ST) loadLocal(LOCAL_V, true);
      const r = await act('claimCode', { code: up });
      if (!r || !r.ok) return { err: (r && r.err) || '兑换失败' };
      redrawLooks();
      if ($id('armory') && $id('armory').classList.contains('on')) render();
      if (isHeirloom) return { ok: true, note: '天工传世典藏礼', text: giftText({ heirloomPromo: true, n: r.addedSkins }) };
      return { ok: true, note: '全服全内容解锁礼', text: giftText({ promoAll: true, synced: !r.first, n: r.addedSkins }) };
    }
    if (!cloudOn() || PROF.guest) return { err: NEED };
    if (MODE !== 'server') await connect(true);
    if (MODE !== 'server') return { err: MODE === 'none' ? NEED : MODE === 'offline' || MODE === 'wait' ? '连不上服务器，等联网了再试' : '服务器还没开兑换码，等更新以后再试' };
    if (BUSY) return { err: '上一步还没做完，稍等一下' };
    BUSY = true; busyUi(true);
    try {
      if (FLUSH) await Promise.race([FLUSH().catch(() => {}), new Promise(r => setTimeout(r, 3000))]);   // 先把本机的存档变化报上去，免得两边对不上
      const out = await ECON('claimCode', { code: up });
      apply(out);
      redrawLooks();
      if ($id('armory') && $id('armory').classList.contains('on')) render();
      return out && out.code ? { ok: true, note: String(out.code.note || ''), text: giftText(out.code) } : { err: '兑换码无效或已过期' };
    } catch (e) {
      if (e && e.ban && typeof acRefresh === 'function') acRefresh();
      if (e && e.status === 400 && e.message === '不认识的操作') return { err: '兑换码无效或已过期' };   // 服务器还是没有兑换码的旧版：那上面也就没有码
      return { err: e && e.message ? e.message : '服务器出错了' };
    } finally { BUSY = false; busyUi(false); }
  };
  /* ---------- 一次性、按天按周的奖励（任务、系统补偿、新手教程、关卡星、列传） ----------
     云端账号：领没领过只看服务器上武库存档里的 rw，墨锭由服务器发（armory-core 的 A.task、A.comp、A.tut、A.stars、A.saga），
     本机记的领取记录不算数，换设备、清缓存、退出再登录都领不到第二次。离线版、本机账号返回 null，调用的地方照旧本机算。
     关卡星、列传是打完自动领的（queue）：连不上就先记在本机，下次连上再报；服务器每关每星、每节每结局只给一次，报几遍都一样 */
  const pendKey = () => 'renying-rw-pend-' + UID;
  const pendLoad = () => { try { const a = JSON.parse(localStorage.getItem(pendKey()) || '[]'); return Array.isArray(a) ? a.filter(x => Array.isArray(x) && ['stars', 'saga'].includes(x[0])).slice(-200) : []; } catch (e) { return []; } };
  const pendSave = a => { try { if (a.length) localStorage.setItem(pendKey(), JSON.stringify(a)); else localStorage.removeItem(pendKey()); } catch (e) {} };
  window.armoryRewardServer = () => !PROF.guest && cloudOn();
  window.armoryReward = async function (name, args, opt = {}) {
    if (!window.armoryRewardServer()) return null;
    if (LOADING) await LOADING.catch(() => {});
    const res = MODE === 'wait' ? null : await act(name, args || {}, { bg: true });
    if (!res && opt.queue) pendSave(pendLoad().concat([[name, args || {}]]));
    return res || { err: '连不上服务器，等联网了再领' };
  };
  async function rewardFlush() {
    const a = pendLoad();
    if (MODE !== 'server' || !a.length) return;
    pendSave([]);
    for (let i = 0; i < a.length; i++) {
      const r = await act(a[i][0], a[i][1], { bg: true });
      if (!r) { pendSave(pendLoad().concat(a.slice(i))); return; }
      if (r.gain) toast(`补领到 ${r.gain} 墨锭`);
    }
  }
  // 网页显示用：服务器上的任务进度和领取记录（没连上服务器时是 null）
  window.armoryTasks = () => MODE === 'server' && ST ? C.taskView(ST, NOW()) : null;
  window.armoryRw = () => MODE === 'server' && ST && ST.rw ? ST.rw : null;
  window.armoryHasAll = function (keys) {
    if (!ST || !Array.isArray(ST.inv)) return false;
    return keys.every(k => ST.inv.some(x => x.k === k));
  };
  // 本机武库发饰品（游戏里自带的兑换码）：走规则核心的 addItem，校验跟着更新。
  // 不能“读出 PROF.armory、改完再写回去”：读出来的是带旧校验的副本，写回去校验不过会被当成作弊、整个武库作废
  window.armoryGrantLocal = function (keys, src) {
    if (MODE === 'server' || cloudOn()) return 0;   // 云端账号的武库只有服务器能改：网页里加的一刷新就没了
    if (!ST && !PROF.guest) loadLocal(LOCAL_V, true);
    if (!ST) return 0;
    const env = envBase(); let n = 0;
    for (const k of keys) if (C.isItem(k) && !ST.inv.some(x => x.k === k) && ST.inv.length < C.INV_MAX) { C.addItem(ST, C.mkItem(ST, k, src || 'code', rnd, { st: -1 }), env); if (!ST.via.includes(k)) ST.via.push(k); n++; }
    PROF.skins = Array.from(new Set([...(PROF.skins || []), ...env.skins]));
    SIG = sigOf(ST);
    if (window.CloudSave) CloudSave.saveProfile(PROF, true);
    try { render(); } catch (e) {}
    return n;
  };
  // game.js 先载入，那时首页角色和头像是按不认识武库皮肤画的：这里重画一次
  redrawLooks();
  // 本机模式：存档每秒对一次校验，绕过这里直接改的会被发现
  setInterval(() => {
    if (MODE !== 'local' || !ST) return;
    if (sigOf(ST) !== SIG) { strike('武库数据被篡改'); loadLocal(undefined); render(); }
  }, 1000);
