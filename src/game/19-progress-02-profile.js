// Player profile and equipped skin behavior.
const PROF = {
  loaded: false,
  guest: true,
  ink: 500,
  owned: ['qingfeng'],
  frags: {},
  pity: 0,
  welfare: 1,
  tutorial: 0,
  rank: null,
  rotation: getWeeklyRotation(),
  daily: [],
  weekly: [],
  skins: [],
  equip: {},
  spity: 0,
  netWins: 0,
  netLosses: 0,
  online10Unlocked: false
};
const MSTAT = { maxcombo: 0, ults: 0 };
function toast(t, sec) { const el = $id('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.tm); toast.tm = setTimeout(() => el.classList.remove('on'), (sec || 2.6) * 1000); }   // sec：长一点的说明多留几秒
// 侠客全部直接能用：问剑阁撤掉以后，侠客不再靠抽卡、碎片解锁（皮肤从武库拿）
function ownsHero(id) { return CHARS.some(c => c.id === id); }
function heroesFree() { return true; }
function availList() {
  if (OFFLINE_BUILD || heroesFree()) return CHARS.map((c, i) => i);
  const ok = new Set([...(PROF.owned || ['qingfeng']), ...(PROF.rotation || [])]);
  return CHARS.map((c, i) => i).filter(i => ok.has(CHARS[i].id));
}
function skinLook(ci, skin) {
  const sk = SKINS[skin];
  const ok = sk && sk.char === CHARS[ci].id;
  const it = ok && window.ArmoryCore && ArmoryCore.ITEM[skin];
  return { ...CHARS[ci].look, ...(ok ? sk.look : {}), name: CHARS[ci].name, legend: !!(ok && sk.rarity === 'legend'), deco: ok ? sk.deco || null : null, fx: ok ? sk.fx || null : null, tier: it ? it.tier : '' };
}
function skinSkillName(fOrKey, slot) {
  const skKey = typeof fOrKey === 'string' ? fOrKey : (fOrKey && fOrKey.skinKey);
  const sk = skKey && SKINS[skKey];
  if (!sk || !sk.skillNames) return '';
  return slot === 2 ? (sk.skillNames.ranged || '') : (sk.skillNames.skill || '');
}
function skinUltName(fOrKey) {
  const skKey = typeof fOrKey === 'string' ? fOrKey : (fOrKey && fOrKey.skinKey);
  const sk = skKey && SKINS[skKey];
  return (sk && sk.skillNames && sk.skillNames.ult) || '';
}
function freeSkinEvent(now = Date.now()) { return now >= FREE_SKIN_EVENT.start && now < FREE_SKIN_EVENT.end; }
function freeSkinDaysLeft() { return Math.max(0, Math.ceil((FREE_SKIN_EVENT.end - Date.now()) / 86400e3)); }
// 限免活动只包括原来的皮肤；武库里的饰品（cs）要自己开出来或买到
function skinOwned(k) { return !k || (PROF.skins || []).includes(k) || OFFLINE_BUILD || (freeSkinEvent() && !(SKINS[k] && SKINS[k].cs)); }
// 自动穿最好的皮肤：没手动选过的角色，穿已拥有里品质综合权重最高的那款（统合绑定传说/非凡与武库顶级饰品）
function bestSkin(id) {
  let best = '', bw = 0;
  for (const [k, v] of Object.entries(SKINS)) {
    if (v.char !== id || !skinOwned(k)) continue;
    const w = skinWeight(k);
    if (w > bw) {
      bw = w;
      best = k;
    }
  }
  return best;
}
function mySkin(id) {
  let eq = PROF.equip;
  if (!eq || typeof eq !== 'object') {
    try { eq = PROF.equip = JSON.parse(localStorage.getItem('renying-equip') || '{}'); } catch (e) { eq = {}; }
  }
  const k = eq[id];
  if (k && (skinOwned(k) || (SKINS && SKINS[k]))) return k;
  return SETTINGS.autoSkin !== false && !(id in eq && k === '') ? bestSkin(id) : '';
}
function mySkinMap() { const m = {}; for (const c of CHARS) { const k = mySkin(c.id); if (k) m[c.id] = k; } return m; }
if (typeof window !== 'undefined') { window.skinLook = skinLook; window.mySkin = mySkin; window.skinSkillName = skinSkillName; window.skinUltName = skinUltName; }
function applySkins() {
  for (const f of allFighters()) {
    let k = '';
    if (M.mode === 'net') {
      k = f.idx === localIdx() ? mySkin(f.ch.id) : ((NET.peerSkins || {})[f.ch.id] || '');
    } else if (M.mode === 'replay') {
      k = (REPLAY.m && REPLAY.m.skins && REPLAY.m.skins[f.idx]) || mySkin(f.ch.id);
    } else if (M.mode === 'watch2v2') {
      k = mySkin(f.ch.id);
      if (!k) {
        const charSkins = Object.keys(SKINS).filter(sk => SKINS[sk].char === f.ch.id);
        if (charSkins.length) k = charSkins[(f.idx + f.chIdx) % charSkins.length];
      }
    } else {
      // 无论是 cpu、tag3、tower、stage、train、pvp 还是 demo，均显示已装备的皮肤
      k = mySkin(f.ch.id);
    }
    if (!f.dummy) f.look = skinLook(f.chIdx, k);
    f.skinKey = f.dummy ? '' : k;
  }
  pickScene();
}
if (typeof window !== 'undefined') window.applySkins = applySkins;
function flagsKey() { return 'renying-flags-' + (curName() || 'guest'); }
function loadFlags() { try { return JSON.parse(localStorage.getItem(flagsKey()) || '{}') || {}; } catch (e) { return {}; } }
function saveFlag(k, v) { const fl = loadFlags(); fl[k] = v; try { localStorage.setItem(flagsKey(), JSON.stringify(fl)); } catch (e) {} }
function applyProfile(p, opts) {
  if (!p) return;
  if (p.guest) {
    // 游客答案不是一份完整存档，只是“本周轮换/概率”这类提示。
    // 拿它覆盖角色、墨锭和奖励状态会把存档打回新手：只有明示的 reset（退出账号）才允许清档。
    PROF.guest = true;
    if (p.rotation) PROF.rotation = p.rotation;
    if (p.rates) PROF.rates = p.rates;
    if (opts && opts.reset) {
      Object.assign(PROF, {
        ink: p.ink !== undefined ? p.ink : 500,
        owned: Array.isArray(p.owned) && p.owned.length ? p.owned : ['qingfeng'],
        frags: p.frags || {},
        pity: p.pity || 0,
        spity: p.spity || 0,
        skins: Array.isArray(p.skins) ? p.skins : [],
        equip: p.equip || {},
        netWins: p.netWins || 0,
        netLosses: p.netLosses || 0,
        welfare: 1,
        rank: null,
        daily: [],
        weekly: []
      });
    }
  } else {
    const saga0 = PROF.saga;
    Object.assign(PROF, p);
    // 游客身份只认“有没有登录”：云端字段白名单里没有 guest，存回来的存档不带这个标记，
    // 以前这里直接写 false，重载一次就把任务、系统补偿的登录门全打开了。
    // 游客身份只看有没有登录（离线单文件版没有账号体系，从来不拦任务和补偿）
    PROF.guest = OFFLINE_BUILD ? false : !(window.CloudSave && CloudSave.getUser && CloudSave.getUser());
    if (saga0) PROF.saga = sagaMerge(saga0, p.saga);   // 列传进度和关卡星一样：本机和云端每位侠客取走得远的那份
  }
  PROF.loaded = true;
  if (!PROF.guest && p.stageStars && typeof p.stageStars === 'object') {   // 关卡星跟着账号走：取云存档和本机（退出时已清空）两边较高的
    for (const [k, v] of Object.entries(p.stageStars)) STAGE_STARS[k] = Math.max(STAGE_STARS[k] || 0, Math.floor(+v || 0));
    PROF.stageStars = STAGE_STARS;
    try { localStorage.setItem('renying-stage', JSON.stringify(STAGE_STARS)); } catch (e) {}
  }
  { const fl = loadFlags();   // 一次性奖励的领取记录不进云存档，按账号记在本机，刷新后还在
    if (fl.codes) PROF.redeemedCodes = Array.from(new Set([...(PROF.redeemedCodes || []), ...fl.codes]));
    if (fl.tutorial && !PROF.guest) PROF.tutorial = 1;
  }
  if (PROF.guest && (PROF.redeemedCodes || []).includes('ZODIAC2026STAR')) {   // 作废的星座码：游客以前领到的装束只记在本机皮肤里，收回
    const zod = new Set(getZodiacSkinKeys());
    PROF.skins = (PROF.skins || []).filter(k => !zod.has(k));
  }
  if (!OFFLINE_BUILD && !freeSkinEvent() && PROF.equip) {
    const ownedSkins = new Set(PROF.skins || []);
    for (const [cid, sk] of Object.entries(PROF.equip)) {
      if (sk && !ownedSkins.has(sk)) delete PROF.equip[cid];
    }
  }
  renderAcc(); updateTutBtn();
  // 青锋行的最高分直接写进 PROF.qfx：以前这里调一个从来没定义过的 qfxClaim，这个分支永远是死的
  if (!PROF.guest && typeof qfxBest === 'function') { const qb = qfxBest(); if (qb > (PROF.qfx || 0)) PROF.qfx = qb; }
  const eq = JSON.stringify(PROF.equip || {});
  if (eq !== applyProfile.eq) {
    applyProfile.eq = eq;
    if (PORTRAITS.length) { PORTRAITS.length = 0; ensurePortraits(); }
    applySkins();
    if (typeof renderTower === 'function') renderTower();
    if (typeof renderChaos === 'function') renderChaos();
    if (typeof renderTag3 === 'function') renderTag3();
  }
  for (const el of document.querySelectorAll('.gInk')) el.textContent = PROF.ink;
  if ($id('tasks').classList.contains('on')) renderTasks();
  if ($id('netp').classList.contains('on')) renderRankLine();
  if ($id('menu').classList.contains('on')) compMaybe();
}
