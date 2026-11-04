// ======================= 角色图鉴界面 =======================
let cxIdx = 0, cxActiveMove = 'full', cxDemoSpeed = 1.0;
demoLoop($id('cxDemo'), () => cxIdx, () => $id('codex').classList.contains('on'), () => (cxPrev !== null ? cxPrev : mySkin(CHARS[cxIdx].id)), () => cxActiveMove === 'full' ? null : cxActiveMove);
function statRows(c) {
  const m = CHAR_MOVES[CHAR_IDX[c.id]];
  const st = c.stat, B = BAL[c.id] || BAL.qingfeng, hp = Math.round(st.hp * B.hp), dmg = +(st.dmg * B.normal).toFixed(2);
  const rows = [
    ['生命上限', hp, 1000, `${hp}`],
    ['体量压制', st.weight || 1, 2.0, `${st.weight || 1}×`],
    ['防御减伤', st.defRating || 1, 1.25, `×${st.defRating || 1}`],
    ['格挡架势', st.guardMax || 100, 160, `${st.guardMax || 100}`],
    ['格挡稳定性', st.guardStab || 1, 2.0, `×${st.guardStab || 1}`],
    ['格挡穿透伤', Math.round((st.guardChip || 0.12) * 100), 20, `${Math.round((st.guardChip || 0.12) * 100)}%`],
    ['受击硬直', st.poise || 1, 1.25, `×${st.poise || 1}`],
    ['移动速度', WALK * st.walk, WALK * 1.2, `${Math.round(WALK * st.walk)}`],
    ['基础伤害', dmg, 1.25, `×${dmg}`],
    ['攻击距离', m.l1.box[2], 130, `${Math.round(m.l1.box[2])}`],
    ['跳跃高度', st.jump || 1, 1.2, `×${st.jump || 1}`],
    ['卡肉感', c.hitFeel || 1, 1.6, `×${c.hitFeel || 1}`],
  ];
  if (c.fly) rows.push(['飞行时间', c.fly, 3, `${c.fly} 秒`]);
  return rows;
}
// 图鉴静态说明、招式数据与演示序列见 18-codex-content.js。
function renderCodex() {
  const c = CHARS[cxIdx], m = CHAR_MOVES[cxIdx], S = SKILLS[c.skill], S2 = SKILLS[c.skill2], U = ULTS[c.ult];
  const skin = cxPrev !== null ? cxPrev : mySkin(c.id);
  const L = skinLook(cxIdx, skin);
  const col = `rgb(${L.slash})`;
  $id('cxTabs').innerHTML = CHARS.map((x, i) => `<button class="${i === cxIdx ? 'sel' : ''}" data-i="${i}" style="${i === cxIdx ? '' : `color:rgb(${x.look.slash})`} ">${x.name}</button>`).join('');
  const cv2 = $id('cxCard'), g = cv2.getContext && cv2.getContext('2d');
  if (g) { g.clearRect(0, 0, cv2.width, cv2.height); g.drawImage(makeCardArt(cxIdx, cv2.width, cv2.height, skin), 0, 0); }
  if (cv2) {
    cv2.style.boxShadow = `0 16px 48px ${col.replace('rgb', 'rgba').replace(')', ',0.35)')}`;
    cv2.style.borderColor = col;
  }
  const rar = CHAR_RARITY[c.id], own = ownsHero(c.id), free = heroesFree() || (PROF.rotation || []).includes(c.id);
  const skMeta = skin && SKINS[skin], skG = skMeta && skinGrade(skin);
  const skPill = skMeta ? `<span class="pill sk-pill" style="--tc:${skG.c}">${skG.n} · ${skMeta.name}</span>` : '';
  $id('cxName').innerHTML = `<div class="nm" style="color:${col}">${c.name}</div><div class="pills">${skPill}<span class="pill">${c.role}</span><span class="pill" style="color:rgb(${RAR_RGB[rar]})">${RAR_NAME[rar]}</span><span class="pill">${own ? '已拥有' : heroesFree() ? '限时免费' : free ? '本周限免' : '未拥有'}</span><span class="pill">难度 ${'●'.repeat(c.diff)}${'○'.repeat(3 - c.diff)}</span>${balNote(c.id) ? `<span class="pill" title="按电脑对打的胜率调过强度；招式说明里写的伤害是调整前的数">平衡 · ${balNote(c.id)}</span>` : ''}</div>`;
  const skList = Object.entries(SKINS).filter(([k, v]) => v.char === c.id);
  const skScn = skMeta && SCENES[skin];
  const skDesc = skMeta ? `<span style="font-size:12px;color:var(--dim);margin-left:6px">（${skMeta.rarity === 'legend' ? '✨' : '🌟'}<span>${skMeta.rarity === 'legend' ? '专属全景天象与奥义特效' : '专属灵光天色与命中特效'}</span>）</span>` : '';
  $id('cxSkinT').innerHTML = (cxPrev !== null && cxPrev !== mySkin(c.id) ? '皮肤 · 预览中' : '皮肤装束') + skDesc;

  const C_CORE = window.ArmoryCore;
  const isWukuKey = k => (C_CORE && C_CORE.CS_KEYS && C_CORE.CS_KEYS.includes(k)) || (SKINS[k] && SKINS[k].cs);
  const bdSkins = skList.filter(([k]) => !isWukuKey(k)).sort((a, b) => skinWeight(a[0]) - skinWeight(b[0]));
  const wkSkins = skList.filter(([k]) => isWukuKey(k)).sort((a, b) => skinWeight(a[0]) - skinWeight(b[0]));

  const renderSkinBtn = ([k, v]) => {
    const has = skinOwned(k), g = skinGrade(k);
    const lockHint = v.exclusive ? ' · 青锋行 / 武库' : ' · 武库';
    return `<button data-sk="${k}" class="sk-g${skin === k ? ' sel' : ''}${has ? '' : ' lock'}" style="--tc:${g.c}" title="${g.n}"><i class="sk-dot"></i>${v.name}${has ? ((PROF.skins || []).includes(k) || OFFLINE_BUILD ? '' : ' · 限免') : lockHint}</button>`;
  };

  const defaultBtn = `<button data-sk="" class="${skin ? '' : 'sel'}">默认</button>`;
  const bdHtml = defaultBtn + bdSkins.map(renderSkinBtn).join('');
  const wkHtml = wkSkins.length ? wkSkins.map(renderSkinBtn).join('') : uiState('empty', '暂无武库饰品', 'cx-skin-empty');

  $id('cxSkins').innerHTML = `
    <div class="cx-skin-row">
      <div class="cx-skin-row-hd"><span class="cx-skin-tag tag-bd">绑定装束</span></div>
      <div class="cx-skin-row-btns">${bdHtml}</div>
    </div>
    <div class="cx-skin-row">
      <div class="cx-skin-row-hd"><span class="cx-skin-tag tag-wk">武库饰品</span></div>
      <div class="cx-skin-row-btns">${wkHtml}</div>
    </div>
  `;
  $id('cxStats').innerHTML = statRows(c).map(([n, v, max, t]) => `<div class="st"><span>${n}</span><div class="bar"><i style="width:${Math.round(clamp(v / max, 0.05, 1) * 100)}%;background:${col}"></i></div><span class="v">${t}</span></div>`).join('');
  const lk = c.id === 'leiming' ? ['l1', 'l2', 'l3', 'l4', 'l5', 'l6'] : c.id === 'cixian' ? ['l1', 'l2', 'l3', 'l4'] : ['l1', 'l2', 'l3', 'l4', 'l5'];   // 磁仙四段循环
  const bn = (BAL[c.id] || BAL.qingfeng).normal, dv = d => Math.round(d * bn * 10) / 10;   // 普攻、蓄力、空中按强度调整后的数
  const sum = Math.round(lk.reduce((a, k) => a + m[k].dmg, 0) * bn * 10) / 10;
  const fun = (typeof SKILL_FUN !== 'undefined' && SKILL_FUN[c.id]) || {};
  const sh = n => { const p = (n || '').split('·'); return p.length > 1 ? [p[0].trim(), p[1].trim()] : ['', n || '']; };
  const nm = ids => ids.map(id => CHARS[CHAR_IDX[id]].name).join(' ');
  const tile = (icon, label, val, desc, cd, wide, moveKey, half) => {
    const hit = (moveKey && HERO_HIT_DETAILS[c.id] && HERO_HIT_DETAILS[c.id][moveKey]) || null;
    const mType = (moveKey && mTypes[moveKey]) || null;
    const rng = (mType && mType.rng) || (moveKey === 'ult' ? 'screen' : moveKey === 'air' ? 'air' : 'melee');
    const mini = moveKey ? `<div class="card-mini-win" data-rng="${rng}"><canvas class="card-mini-cv" data-mv="${moveKey}"></canvas><span class="mini-tag">${hit ? hit.badge : val}</span></div>` : '';
    const f = moveKey && fun[moveKey];
    return `<div class="tile t-m${half ? ' half' : wide ? ' wide' : ''}${moveKey ? ' t-has-demo' : ''}${moveKey && cxActiveMove === moveKey ? ' active-demo' : ''}" ${moveKey ? `data-move="${moveKey}" title="点击在主视窗慢放/演示该招式"` : ''}><div class="th">${ic(icon, col)}<span class="tl">${label}</span></div>${mini}${val ? `<div class="tv">${val}</div>` : ''}<div class="td">${desc}</div>${f ? `<div class="tf">“${f}”</div>` : ''}${cd ? `<span class="cd">${cd}</span>` : ''}</div>`;
  };
  const mTypes = HERO_MOVE_TYPES[c.id] || {};
  const lType = mTypes.light || { label: '近战', type: 'melee', rng: 'melee' };
  const cType = mTypes.charge || { label: '近战', type: 'melee', rng: 'melee' };
  const aType = mTypes.air || { label: '近战', type: 'melee', rng: 'melee' };
  const qType = mTypes.skill || { label: '技能', icon: 'skill', type: 'melee', rng: 'melee' };
  const rType = mTypes.ranged || { label: '远程', icon: 'ranged', type: 'ranged', rng: 'ranged' };
  const uType = mTypes.ult || { label: '奥义', type: 'fullscreen', rng: 'screen' };
  const restr = HERO_RESTRAINTS_EXPLAIN[c.id] || { beatsWhy: `克 ${nm(c.beats)}`, weakWhy: `怕 ${nm(c.weakTo)}` };
  const qName = (skin && skinSkillName(skin, 1)) || S.name;
  const rName = (skin && skinSkillName(skin, 2)) || S2.name;
  const uName = (skin && skinUltName(skin)) || U.name;
  $id('cxMoves').innerHTML = [
    tile('passive', `被动 · ${c.passiveName}`, '', PASSIVE_SHORT[c.id] || '', '', true),
    tile('light', `左键 · 连击 <small class="type-tag ${lType.type}">${lType.label}</small>`, sum, `${lk.length} 段${c.id === 'cixian' ? '循环 · 负极能一直连' : ' · 末段击飞'}${c.inkShot ? ` · 另有墨团 ${lk.length}×${INK_DMG}` : ''}`, '', false, 'light'),
    tile('charge', `按住左键 · 蓄力 <small class="type-tag ${cType.type}">${cType.label}</small>`, `${dv(m.cs1.dmg)} / ${dv(m.cs2.dmg)}`, '满蓄破防 · 打倒', '', false, 'charge'),
    tile('air', `空中 <small class="type-tag ${aType.type}">${aType.label}</small>`, `${dv(m.a1.dmg)} / ${dv(m.a2.dmg)}`, '空中斩 · 下砸', '', false, 'air'),
    tile(qType.icon || 'skill', `Q · ${qName} <small class="type-tag ${qType.type}">${qType.label}</small>`, sh(S.name)[0], sh(S.name)[1], `${S.cd}s`, false, 'skill'),
    tile(rType.icon || 'ranged', `左键+右键 · ${rName} <small class="type-tag ${rType.type}">${rType.label}</small>`, sh(S2.name)[0], sh(S2.name)[1], `${S2.cd}s`, false, 'ranged'),
    tile('ult', `E · ${uName} <small class="type-tag ${uType.type}">${uType.label}</small>`, sh(U.name)[0], `${sh(U.name)[1]}<div style="margin-top:4px;font-size:12px;color:#ffe8a3;line-height:1.35;opacity:0.95">${HERO_METER_EXPLAIN[c.id] || ''}</div>`, '气满', true, 'ult'),
    tile('esc', '右键 · 腾空闪', `${c.escCD || BREAK_CD}s`, '解除受制 · 落地前无敌', '', false, 'esc'),
    tile('chronicle', '宿命篇章 · 试炼与秘传', '', `<div style="font-size:12.5px;line-height:1.55;color:var(--dim);word-break:keep-all;overflow-wrap:break-word">${(() => {
      const chIdx = CHAPTERS.findIndex(chap => chap.boss === c.id);
      if (chIdx < 0) {
        return `<b>青锋传 · 月下起意</b><br>青锋行打通第三章「剑冢」，斩落剑魔，即可领悟绝学并解锁专属传说皮肤「青锋行」。`;
      }
      const ch = CHAPTERS[chIdx];
      const rSkinKey = ({ tieshan: 'ts_bronze', liuyun: 'ly_dusk', lingshuang: 'ls_plum', feiying: 'fy_jade', leiming: 'lm_violet', yanling: 'yl_raven', yuehua: 'yh_sakura', moyu: 'my_cinnabar', yuxiao: 'yx_snow', zuixian: 'zx_amber', gouchen: 'gc_crimson' })[c.id];
      const rSkin = rSkinKey && SKINS[rSkinKey];
      const skinHas = (PROF.skins || []).includes(rSkinKey) || OFFLINE_BUILD;
      const stars = (STAGE_STARS && STAGE_STARS[`${chIdx + 1}.5`]) || 0;
      const clear = stars > 0;
      return `<b style="color:#efe8d8">第 ${chIdx + 1} 章 · ${ch.name}</b>（守关：${c.name} · 难度：${LV_NAME[ch.lv]}）<br>通关破关：${clear ? `<span style="color:#7fe0b0">已破关 (★${stars})</span>` : '<span style="color:#e9c46a">未破关</span>'} · 专属皮肤：${rSkin ? `<span style="color:rgb(${RAR_RGB[rSkin.rarity] || '239,232,216'})">「${rSkin.name}」</span>（${skinHas ? '<span style="color:#7fe0b0">已获得</span>' : '破关解锁'}）` : '无'}<div style="margin-top:6px"><button type="button" class="ghost small cx-go-stage" data-c="${chIdx}" style="padding:2px 10px;font-size:12px;border-radius:4px;color:var(--gold);border-color:rgba(233,196,106,.4);cursor:pointer">⚔️ 前往第 ${chIdx + 1} 章试炼</button></div>`;
    })()}${typeof sagaCodexLine === 'function' ? sagaCodexLine(c.id) : ''}</div>`, '', true),
    ADV_SHORT[c.id] ? tile('adv', '进阶技巧', '', ADV_SHORT[c.id], '', false, null, true) : '',
    tile('vs', '克制机理详解', '', `<div class="vs-explain"><div class="vs-line beats" style="color:#7fe0b0;margin-bottom:3px">${restr.beatsWhy}</div><div class="vs-line weaks" style="color:#ff8a8a">${restr.weakWhy}</div></div>`, '', true, null, !!ADV_SHORT[c.id]),
  ].filter(Boolean).join('');
  for (const el of document.querySelectorAll('#cxBento .ic[data-ic]')) el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="${col}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[el.dataset.ic] || ICONS.skill}</svg>`;
  if ($id('cxBento')) $id('cxBento').style.setProperty('--cx-accent', col);
  startCodexCardsDirector();
}

let cxCardsRAF = null;
function startCodexCardsDirector() {
  if (cxCardsRAF) return;
  let lastT = performance.now();
  const tick = now => {
    if (!$id('codex') || !$id('codex').classList.contains('on')) {
      cxCardsRAF = null;
      return;
    }
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    const cvs = document.querySelectorAll('#cxMoves .card-mini-cv');
    const c = CHARS[cxIdx];
    if (c) {
      const skin = cxPrev !== null ? cxPrev : mySkin(c.id);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      for (const cv of cvs) {
        const mv = cv.dataset.mv;
        if (!mv || !HERO_MOVE_SEQS[c.id] || !HERO_MOVE_SEQS[c.id][mv]) continue;
        let p = cv._pup;
        if (!p || p.chIdx !== cxIdx || p.skin !== skin || cv._mv !== mv) {
          p = new Puppet(cxIdx, skin);
          p.playSeq(HERO_MOVE_SEQS[c.id][mv], null, true);
          cv._pup = p;
          cv._mv = mv;
        }
        p.update(dt);
        const g = cv.getContext && cv.getContext('2d');
        if (g) {
          const cw = cv._w || (cv._w = cv.clientWidth || 160);
          const chh = cv._h || (cv._h = cv.clientHeight || 76);
          if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(chh * dpr)) {
            cv.width = Math.round(cw * dpr); cv.height = Math.round(chh * dpr);
          }
          g.setTransform(dpr, 0, 0, dpr, 0, 0);
          g.fillStyle = '#0a0b18';
          g.fillRect(0, 0, cw, chh);
          g.fillStyle = 'rgba(200,180,255,0.08)'; g.fillRect(0, chh * 0.84, cw, 1);
          p.draw(g, cw, chh, chh / 180, true);
        }
      }
    }
    cxCardsRAF = requestAnimationFrame(tick);
  };
  cxCardsRAF = requestAnimationFrame(tick);
}

$id('cxMoves').addEventListener('click', e => {
  const sagaBtn = e.target.closest('.cx-go-saga');
  if (sagaBtn) { sagaPick = sagaBtn.dataset.h; openScreen('saga'); SFX.slice && SFX.slice(); return; }
  const stageBtn = e.target.closest('.cx-go-stage');
  if (stageBtn) {
    const ch = +stageBtn.dataset.c;
    stageCh = ch;
    openScreen('stage');
    renderStages();
    SFX.slice && SFX.slice();
    return;
  }
  const tile = e.target.closest('.tile[data-move]');
  if (!tile) return;
  const m = tile.dataset.move;
  cxActiveMove = m;
  for (const t of $id('cxMoves').querySelectorAll('.tile')) t.classList.remove('active-demo');
  tile.classList.add('active-demo');
  for (const btn of $id('cxDemoTabs').querySelectorAll('button')) btn.classList.toggle('sel', btn.dataset.m === m);
  const demoCanvas = $id('cxDemo');
  if (demoCanvas && demoCanvas._pup) {
    const ch = CHARS[cxIdx];
    if (HERO_MOVE_SEQS[ch.id] && HERO_MOVE_SEQS[ch.id][m]) {
      demoCanvas._pup.playSeq(HERO_MOVE_SEQS[ch.id][m], null, true);
    }
    SFX.slice();
  }
});

const demoTabsEl = $id('cxDemoTabs');
if (demoTabsEl) {
  demoTabsEl.addEventListener('click', e => {
    const btn = e.target.closest('button[data-m]');
    if (!btn) return;
    const m = btn.dataset.m;
    cxActiveMove = m;
    for (const b of demoTabsEl.querySelectorAll('button')) b.classList.remove('sel');
    btn.classList.add('sel');
    for (const t of $id('cxMoves').querySelectorAll('.tile')) t.classList.toggle('active-demo', t.dataset.move === m);
    const demoCanvas = $id('cxDemo');
    if (demoCanvas && demoCanvas._pup) {
      const ch = CHARS[cxIdx];
      if (m === 'full' || m === 'all') {
        demoCanvas._pup.playSeq(HERO_FULL_DEMO[ch.id] || DEMO2, null, true);
      } else if (HERO_MOVE_SEQS[ch.id] && HERO_MOVE_SEQS[ch.id][m]) {
        demoCanvas._pup.playSeq(HERO_MOVE_SEQS[ch.id][m], null, true);
      }
      SFX.slice();
    }
  });
}

const demoSpdEl = $id('cxDemoSpd');
if (demoSpdEl) {
  demoSpdEl.addEventListener('click', () => {
    cxDemoSpeed = cxDemoSpeed === 1.0 ? 0.5 : 1.0;
    demoSpdEl.textContent = cxDemoSpeed === 0.5 ? '原速 1.0x' : '慢放 0.5x';
    demoSpdEl.classList.toggle('sel', cxDemoSpeed === 0.5);
    SFX.slice && SFX.slice();
  });
}

function openCodex() {
  cxPrev = null;
  cxActiveMove = 'full';
  if ($id('cxDemoTabs')) {
    for (const b of $id('cxDemoTabs').querySelectorAll('button')) b.classList.toggle('sel', b.dataset.m === 'full' || b.dataset.m === 'all');
  }
  renderCodex();
}
window.openCodex = openCodex;
$id('cxSkins').addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  const sk = b.dataset.sk || '';
  const id = CHARS[cxIdx].id;
  const has = skinOwned(sk);
  if (!has) {
    cxPrev = sk; renderCodex(); SFX.slice();
    toast('还没有这款皮肤，先给你看看');
    return;
  }
  cxPrev = null;
  PROF.equip = PROF.equip || {};
  PROF.equip[id] = sk;   // 点“默认”记成空串：自动选皮肤不再替这个角色换
  try { localStorage.setItem('renying-equip', JSON.stringify(PROF.equip)); } catch (err) {}
  if (window.CloudSave) CloudSave.saveProfile(PROF);
  if (PORTRAITS.length) { PORTRAITS.length = 0; ensurePortraits(); }
  applyProfile(PROF);
  renderCodex();
  SFX.slice();
  toast(sk ? `已装配「${SKINS[sk].name}」` : '已换回原本装束');
});
$id('cxTabs').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (b) {
    cxIdx = +b.dataset.i;
    cxPrev = null;
    cxActiveMove = 'full';
    if ($id('cxDemoTabs')) {
      for (const btn of $id('cxDemoTabs').querySelectorAll('button')) btn.classList.toggle('sel', btn.dataset.m === 'full' || btn.dataset.m === 'all');
    }
    renderCodex();
    SFX.slice();
  }
});
