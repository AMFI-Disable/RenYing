  function pCases() {
    const s = blankS(), dl = C.openLeft(s, C.REG[0], CF()), wl = C.openLeft(s, 'c7', CF()), zl = C.openLeft(s, 'c8', CF()), hl = C.openLeft(s, 'c14', CF());
    const available = Math.min(dl, C.REG.reduce((n, c) => n + (s.cases[c] || 0), 0)) + Math.min(wl, s.cases.c7 || 0) + Math.min(zl, s.cases.c8 || 0) + Math.min(hl, s.cases.c14 || 0);
    const gift = live() && !ST.gift ? `<div class="ar-card ar-gift"><span><b>新手礼</b> 送你一个初刃武器箱和一台货郎，先开一个试试手气。</span><button type="button" class="go small" id="arGift">领取</button></div>` : '';
    const lim = `<div class="ar-card ar-week"><span>今天还能开 <b>${dl}</b> 个普通武器箱</span><span class="ar-pips" aria-hidden="true">${pips(dl, C.cv(CF(), 'openDay'))}</span>
      <span>今天还能开 <b>${wl}</b> 个神兵武器箱</span><span class="ar-pips gold" aria-hidden="true">${pips(wl, C.cv(CF(), 'premDay'))}</span>
      <span>本周还能开 <b>${zl}</b> 个星座武器箱</span><span class="ar-pips zod" aria-hidden="true">${pips(zl, C.cv(CF(), 'zodWeek'))}</span>
      <span>本周还能开 <b>${hl}</b> 个天工传世匣</span><span class="ar-pips gold" aria-hidden="true">${pips(hl, C.cv(CF(), 'heirWeek'))}</span><button type="button" class="go small" data-open-all ${live() && available ? '' : 'disabled'}>一键开启全部</button><small>普通和神兵武器箱每天零点刷新，星座与天工传世匣每周一刷新；武器箱在商店按固定价格买，不限量</small></div>`;
    const card = cid => {
      const col = C.COLS[cid], O = C.oddsOf(cid, CF()), n = s.cases[cid], left = C.openLeft(s, cid, CF());
      const have = col.mil.filter(k => s.inv.some(x => x.k === k)).length, claimed = s.cc.includes(cid);
      const tiers = C.TIERS.filter(t => O[t] > 0 && (col[t] || []).length).map(t => `<div class="ar-ctier" style="--tc:${C.TIER[t].c}"><span>${C.TIER[t].n} · ${pct(O[t])}</span><div class="ar-minis">${col[t].map(k => `<img src="${thumb(k)}" alt="" title="${escapeHTML(itemName({ k, st: -1 }))}" data-pv="${k}" loading="lazy">`).join('')}</div></div>`).join('');
      const openTxt = n && !left ? '今天开完了' : '开启';
      return `<div class="ar-casecard" style="--cc:${col.col}">
        <div class="ar-casehead"><div class="ar-casebox"><span>${col.emblem}</span></div><div><h3>${col.name}武器箱</h3><p>拥有 <b>${n}</b> 个 · 商店价 ${ink(col.price)}</p>
          <div class="row"><button type="button" class="go small" data-open="${cid}" ${n && left ? '' : 'disabled'}>${openTxt}</button><button type="button" class="ghost small" data-buyg="${cid}">购买 ${ink(col.price)}</button></div></div></div>
        ${tiers}
        ${col.mil.length ? `<div class="ar-col"><span>集齐这个箱子的 ${col.mil.length} 款精铁：${have}/${col.mil.length}，送 1 个${col.name}武器箱 + 1 张改名标签</span><button type="button" class="${have >= col.mil.length && !claimed ? 'go' : 'ghost'} small" data-collect="${cid}" ${have >= col.mil.length && !claimed ? '' : 'disabled'}>${claimed ? '已领取' : have >= col.mil.length ? '领取' : '未集齐'}</button></div>` : ''}
      </div>`;
    };
    const premCard = cid => {   // 天工传世、神兵、星座武器箱：左边开箱、右边把饰品摆出来，点一下就能看穿上的样子
      const col = C.COLS[cid], O = C.oddsOf(cid, CF()), n = s.cases[cid], left = C.openLeft(s, cid, CF()), zod = cid === 'c8', heir = !!col.heirloom;
      const limText = col.daily ? `每天限开 ${C.cv(CF(), col.lim)} 个` : `每周限开 ${C.cv(CF(), col.lim)} 个`;
      const btnText = n && !left ? (col.daily ? '今天开完了' : '这周开过了') : '开启';
      const ts = ['gold', 'cov', 'cla'].filter(t => O[t] > 0 && (col[t] || []).length);
      const show = heir ? `<div class="ar-zrow" style="--tc:218,175,92"><span class="ar-zlab">★ 传世斩数<b>100%</b></span><div class="ar-zgrid">${col.gold.map(k => `<button type="button" class="ar-pcard ar-zcard t-gold" data-pv="${k}" style="--tc:218,175,92" title="${escapeHTML(skinName(k))} · ${escapeHTML(charName(k))}"><span class="ar-pimg"><img src="${thumb(k)}" alt="" loading="lazy"></span><b>${escapeHTML(skinName(k))}</b><small>${escapeHTML(charName(k))}</small></button>`).join('')}</div></div>`
        : zod ? ts.map(t => `<div class="ar-zrow" style="--tc:${C.TIER[t].c}"><span class="ar-zlab">${C.TIER[t].n}<b>${pct(O[t])}</b></span><div class="ar-zgrid">${col[t].map(k => `<button type="button" class="ar-pcard ar-zcard t-${t}" data-pv="${k}" style="--tc:${C.TIER[t].c}" title="${escapeHTML(skinName(k))} · ${escapeHTML(charName(k))}"><span class="ar-pimg"><img src="${thumb(k)}" alt="" loading="lazy"></span><b>${escapeHTML(skinName(k).split('·')[0])}</b><small>${escapeHTML(charName(k))}</small></button>`).join('')}</div></div>`).join('')
        : ts.flatMap(t => col[t].map(k => `<button type="button" class="ar-pcard t-${t}" data-pv="${k}" style="--tc:${C.TIER[t].c}" title="看看穿上的样子"><span class="ar-pimg"><img src="${art(k)}" alt="" loading="lazy"></span><b>${escapeHTML(skinName(k))}</b><small>${C.TIER[t].n} · ${escapeHTML(charName(k))}</small></button>`)).join('');
      return `<div class="ar-casecard prem${zod || heir ? ' zod' : ''}${heir ? ' heirloom' : ''}" style="--cc:${col.col}"><div class="ar-premside">
        <span class="ar-premtag">${heir ? `${limText} · 全套 20 款仅存斩数版 · 解锁攻守双境` : `${limText} · 赤霄和绝世加起来 ${pct(O.cov + O.gold)}`}</span>
        <div class="ar-casehead"><div class="ar-casebox"><span>${col.emblem}</span></div><div><h3>${col.name}${heir ? '典藏匣' : '武器箱'}</h3><p>拥有 <b>${n}</b> 个 · 商店价 ${ink(C.shopPrice(cid, CF()))}</p>
          <div class="row"><button type="button" class="go small" data-open="${cid}" ${n && left ? '' : 'disabled'}>${btnText}</button><button type="button" class="ghost small" data-buyg="${cid}">购买 ${ink(C.shopPrice(cid, CF()))}</button></div></div></div>
        <div class="ar-podds">${ts.slice().reverse().map(t => `<span style="--tc:${C.TIER[t].c}">${heir ? '★ 天工传世 · 斩数' : C.TIER[t].n}<b>${pct(O[t])}</b></span>`).join('')}</div>
        <p class="ar-note">${heir ? '《天工传世 · 器灵纪》全 20 位侠客典藏器灵，全系仅存斩数版（无普通版），优先开出未拥有款式；穿戴即解锁实战专属攻守双境。' : zod ? '十二星座，每位侠客都有星辉、星焰、星冕三款。每个号都送了 1 个星座武器箱，可以先免费开一次。' : ''}${heir ? '' : `只出这三档，这 ${ts.reduce((a, t) => a + col[t].length, 0)} 款饰品别的武器箱都开不出来，开它也不占每天那 ${C.cv(CF(), 'openDay')} 个普通武器箱。点一下饰品，就能先看看穿上的样子。`}</p>
      </div><div class="ar-pshow${zod || heir ? ' zod' : ''}">${show}</div></div>`;
    };
    const premOrder = C.CASES.filter(c => C.COLS[c].prem).sort((a, b) => (C.COLS[b].heirloom ? 1 : 0) - (C.COLS[a].heirloom ? 1 : 0));
    return `${gift}${lim}<div class="ar-cases">${premOrder.map(premCard).join('')}${C.REG.map(card).join('')}</div>`;
  }
  // 开箱滚轮：结果已经由服务器（或本机）定好了，滚轮只是把它转出来
  const REEL = { on: false };
  let bulkOpening = false;
  async function openAllCases() {
    if (bulkOpening || REEL.on || BUSY || !live()) return;
    bulkOpening = true;
    const wins = [], owner = UID;
    try {
      while (live() && UID === owner && C.CASES.some(cid => ST.cases[cid] > 0 && C.openLeft(ST, cid, CF()) > 0) && !C.invFull(ST)) {
        const r = await act('openAll', {});
        if (!r || !r.ok || !Array.isArray(r.items) || !r.items.length) return;
        wins.push(...r.items);
      }
    } finally {
      bulkOpening = false;
      render();
      if (wins.length && UID === owner && $id('armory').classList.contains('on')) {
        modal(`<h3>开箱结果</h3><div class="ar-grid">${wins.map(it => tile(it)).join('')}</div><div class="row"><button class="go small" id="arBulkDone">收下</button></div>`, 'wide');
        $id('arBulkDone').addEventListener('click', () => { closeModal(); render(); });
      }
    }
  }
  const CW = 132;   // 每格宽 + 间隔
  function reelFill(cid, win) {   // 滚轮上的其他格子按这个箱子的爆率随便摆（好的那几档多摆一点，看着热闹）
    const col = C.COLS[cid], O = C.oddsOf(cid, CF()), ts = C.TIERS.filter(t => O[t] > 0 && (col[t] || []).length), w = ts.map((t, i) => O[t] * (i ? 3 : 1)), sum = w.reduce((a, b) => a + b, 0), out = [];
    for (let i = 0; i < 56; i++) {
      let r = Math.random() * sum, j = 0; while (j < ts.length - 1 && r >= w[j]) r -= w[j++];
      const a = col[ts[j]]; out.push({ k: a[Math.floor(Math.random() * a.length)], st: -1 });
    }
    out[48] = win;
    return out;
  }
  function skipAnim() { try { return localStorage.getItem('renying-arm-fast') === '1'; } catch (e) { return false; } }
  async function openCase(cid) {
    if (REEL.on || bulkOpening) return;
    const r = await act('open', { c: cid });
    if (!r || !r.ok) { render(); return; }
    const win = r.item, lvWin = C.TIERS.indexOf(tierOf(win.k)), big = lvWin >= 2;
    render();
    const strip = reelFill(cid, win);
    REEL.on = true;
    modal(`<h3>${C.COLS[cid].name}武器箱</h3><div class="ar-reel${C.COLS[cid].prem ? ' prem' : ''}"><div class="ar-strip" id="arStrip">${strip.map(x => `<div class="ar-rt" style="--tc:${tc(x.k)}"><img src="${art(x.k)}" alt=""><b>${escapeHTML(skinName(x.k))}</b></div>`).join('')}</div><i class="ar-mark"></i></div>
      <div class="row"><button class="ghost small" id="arSkip">跳过</button><label class="ar-fast"><input type="checkbox" id="arFast" ${skipAnim() ? 'checked' : ''}> 以后直接出结果</label></div>`, 'wide');
    $id('arFast').addEventListener('change', e => { try { localStorage.setItem('renying-arm-fast', e.target.checked ? '1' : '0'); } catch (err) {} });
    const el = $id('arStrip'), box = el.parentElement, mid = box.clientWidth / 2;
    const target = -(48 * CW + CW / 2 - mid) + Math.round((Math.random() - 0.5) * (CW - 24));
    let done = false, lastI = -1, raf = 0;
    const finish = () => { if (done) return; done = true; cancelAnimationFrame(raf); REEL.on = false; reveal(win, cid); };
    const land = () => {   // 停在灵犀以上：中间那一格先亮一下，再出结果
      if (done) return;
      if (!big) { setTimeout(finish, 450); return; }
      const t = el.children[48]; if (t) t.classList.add('win');
      box.classList.add('land'); box.classList.toggle('lv4', lvWin >= 4); box.style.setProperty('--wc', tc(win.k));
      const wait = lvWin >= 4 ? 1150 : lvWin >= 3 ? 900 : 750;
      try { SFX.shine && SFX.shine(); riser(lvWin, wait / 1000); } catch (e) {}
      setTimeout(finish, wait);
    };
    const tick = () => {
      if (done) return;
      const m = getComputedStyle(el).transform, x = m && m !== 'none' ? +m.split(',')[4] : 0, i = Math.floor((mid - x) / CW);
      if (i !== lastI) { lastI = i; try { sNoise(0.012, 7000, 4000, 1, 0.1, 'highpass'); } catch (e) {} }
      raf = requestAnimationFrame(tick);
    };
    $id('arSkip').addEventListener('click', finish);
    if (skipAnim()) { finish(); return; }
    requestAnimationFrame(() => { el.style.transition = 'transform 6.2s cubic-bezier(0.06, 0.62, 0.1, 1)'; el.style.transform = `translateX(${target}px)`; raf = requestAnimationFrame(tick); });
    el.addEventListener('transitionend', land, { once: true });
  }
  // 开箱的声音：五档各有一套，越好的越长、越响、越热闹（D 大调五声音阶，和游戏配乐同调）
  const PENT = [587.33, 659.26, 739.99, 880, 987.77];   // D5 E5 F♯5 A5 B5
  const pent = (i, o = 0) => PENT[((i % 5) + 5) % 5] * Math.pow(2, Math.floor(i / 5) + o);
  function toneAt(f0, f1, at, dur, vol, type = 'sine', dest) {
    const t = AC.currentTime + at, o = AC.createOscillator(), g = AC.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest || master); o.start(t); o.stop(t + dur + 0.03);
  }
  function noiseAt(at, dur, f0, f1, q, vol, type = 'bandpass', rise) {   // rise：慢慢起来（反向镲）
    const t = AC.currentTime + at, src = AC.createBufferSource(), fl = AC.createBiquadFilter(), g = AC.createGain();
    src.buffer = noiseBuf; src.loop = true; fl.type = type; fl.Q.value = q;
    fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    if (rise) { g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.96); g.gain.linearRampToValueAtTime(0.0001, t + dur); }
    else { g.gain.exponentialRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
    src.connect(fl).connect(g).connect(master); src.start(t); src.stop(t + dur + 0.05);
  }
  function drumAt(at, f, vol) {   // 太鼓：一声低沉的“咚”，带一点鼓皮的噪声
    toneAt(f * 1.9, f * 0.62, at, 0.55, vol, 'sine');
    toneAt(f * 3.1, f * 1.2, at, 0.12, vol * 0.25, 'triangle');
    noiseAt(at, 0.22, 900, 140, 0.7, vol * 0.45, 'lowpass');
  }
  function gongAt(at, f, dur, vol) {   // 锣：一组不成整数倍的泛音慢慢散开
    for (const [r, v, d] of [[1, 1, 1], [1.48, 0.55, 0.8], [2.03, 0.42, 0.62], [2.66, 0.3, 0.5], [3.42, 0.2, 0.36], [4.17, 0.12, 0.28]])
      for (const det of [1, 1.004]) toneAt(f * r * det, f * r * det * 0.995, at, dur * d, vol * v * (det === 1 ? 1 : 0.55));
  }
  function padAt(fs, at, dur, vol) {   // 一个慢慢涌上来的和弦（像远处的合唱）
    const t = AC.currentTime + at, g = AC.createGain(), fl = AC.createBiquadFilter();
    fl.type = 'lowpass'; fl.frequency.setValueAtTime(900, t); fl.frequency.linearRampToValueAtTime(2600, t + dur * 0.5); fl.Q.value = 0.6;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.5, dur * 0.3)); g.gain.setValueAtTime(vol, t + dur * 0.55); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    fl.connect(g).connect(master);
    for (const f of fs) for (const det of [0.996, 1.004]) { const o = AC.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f * det; o.connect(fl); o.start(t); o.stop(t + dur + 0.05); }
  }
  const bells = (notes, at, gap, dur, vol) => notes.forEach((n, i) => bellAt(n, at + i * gap, dur, vol));
  // 滚轮停在灵犀以上时先“吸一口气”：一段往上走的风声，正好在揭晓那一下收住
  function riser(lv, dur) {
    if (!AC || muted || lv < 2) return;
    try {
      noiseAt(0, dur, 500, lv >= 4 ? 9000 : 6000, 2.5, lv >= 4 ? 0.16 : 0.1, 'bandpass', true);
      if (lv >= 3) toneAt(73.42, 146.83, 0, dur, 0.12, 'sawtooth');
      if (lv >= 4) for (let i = 0; i < 6; i++) bellAt(pent(i, 1), dur * (0.35 + i * 0.1), 0.35, 0.025 + i * 0.006);
    } catch (e) {}
  }
  function sting(k) {
    const lv = C.TIERS.indexOf(tierOf(k));
    if (!AC || muted) return;
    try {
      if (lv <= 0) {                      // 精铁：木鱼一声 + 一个铃
        toneAt(620, 300, 0, 0.12, 0.22, 'triangle'); noiseAt(0, 0.05, 2400, 900, 2, 0.14);
        bellAt(pent(3, 1), 0.04, 0.9, 0.045);
      } else if (lv === 1) {              // 碧玉：两个铃往上走
        toneAt(560, 280, 0, 0.1, 0.18, 'triangle');
        bells([pent(1, 1), pent(3, 1)], 0.02, 0.11, 1.2, 0.055);
        noiseAt(0.02, 0.5, 2500, 8000, 5, 0.025);
      } else if (lv === 2) {              // 灵犀：低鼓垫底，三个铃一串，一面小锣
        drumAt(0, 70, 0.45);
        bells([pent(0, 1), pent(2, 1), pent(4, 1), pent(5, 1)], 0.03, 0.085, 1.4, 0.06);
        gongAt(0.02, 392, 1.8, 0.045);
        noiseAt(0.05, 0.7, 3000, 9000, 6, 0.03);
      } else if (lv === 3) {              // 赤霄：两声太鼓、大锣，铃音一路冲上去，后面垫一个和弦
        drumAt(0, 58, 0.7); drumAt(0.16, 64, 0.5);
        gongAt(0, 196, 3.2, 0.08);
        bells([0, 1, 2, 3, 4, 5, 7].map(i => pent(i, 1)), 0.12, 0.06, 1.6, 0.055);
        padAt([293.66, 440, 587.33], 0.1, 2.6, 0.035);
        noiseAt(0, 1.4, 6000, 2500, 0.8, 0.05, 'highpass');
        playSting('legendary', true);
      } else {                            // 绝世：鼓点连击、大锣、铃音像金子一样洒下来，合唱和弦铺满，再接传说的乐句
        drumAt(0, 55, 0.85); drumAt(0.12, 55, 0.55); drumAt(0.24, 62, 0.7);
        gongAt(0, 174.6, 4.2, 0.1); gongAt(0.02, 261.6, 3.2, 0.04);
        bells([0, 2, 4, 5, 7, 9, 10, 12].map(i => pent(i, 1)), 0.18, 0.055, 1.8, 0.06);
        bells([12, 10, 9, 7, 5, 4, 2].map(i => pent(i, 1)), 0.75, 0.07, 1.6, 0.04);
        padAt([146.83, 220, 293.66, 369.99, 440], 0.15, 3.6, 0.04);
        noiseAt(0, 2.2, 8000, 3000, 0.8, 0.06, 'highpass');
        playSting('legendary', true);
        SFX.sparkle && SFX.sparkle();
      }
    } catch (e) {}
  }
  // 揭晓的特效：五档各不相同。精铁只有一圈柔光；碧玉多几颗星点；灵犀起光芒和冲击波；赤霄再加一道红色的二次冲击和飘起的火星；绝世满屏金光、金叶落下
  function revealFx(lv) {
    const n = [0, 6, 10, 16, 26][lv] || 0, dots = [];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, r = 90 + Math.random() * 120;
      dots.push(`<b style="--x:${Math.round(Math.cos(a) * r)}px;--y:${Math.round(Math.sin(a) * r * 0.8)}px;--d:${(Math.random() * 1.6).toFixed(2)}s;--s:${(0.6 + Math.random() * 0.9).toFixed(2)}"></b>`);
    }
    const embers = lv === 3 ? Array.from({ length: 14 }, () => `<em style="--x:${Math.round((Math.random() - 0.5) * 360)}px;--d:${(Math.random() * 2.4).toFixed(2)}s;--s:${(0.5 + Math.random() * 0.8).toFixed(2)}"></em>`).join('') : '';
    const leaves = lv >= 4 ? Array.from({ length: 22 }, () => `<u style="--x:${Math.round((Math.random() - 0.5) * 520)}px;--d:${(Math.random() * 3).toFixed(2)}s;--r:${Math.round(Math.random() * 360)}deg;--w:${(2.6 + Math.random() * 2.2).toFixed(2)}s;--s:${(0.6 + Math.random() * 0.8).toFixed(2)}"></u>`).join('') : '';
    return `<div class="ar-rvfx lv${lv}" aria-hidden="true"><i class="ar-glow"></i>${lv >= 2 ? '<i class="ar-rays"></i><i class="ar-burst"></i>' : ''}${lv >= 3 ? '<i class="ar-burst b2"></i>' : ''}${dots.join('')}${embers}${leaves}</div>`;
  }
  function reveal(it, cid) {
    const t = tierOf(it.k), lv = C.TIERS.indexOf(t);
    sting(it.k);
    const again = cid && ST.cases[cid] > 0 && C.openLeft(ST, cid, CF()) > 0;
    modal(`<div class="ar-reveal t-${t}" style="--tc:${tc(it.k)}">${revealFx(lv)}<span class="ar-tier" style="--tc:${tc(it.k)}">${C.TIER[t].n}</span><div class="ar-rvart"><img src="${bigArt(it.k)}" alt=""><i class="ar-shine"></i></div><h3>${escapeHTML(itemName(it))}</h3>
      ${it.st >= 0 ? '<p class="ar-stline">斩数版：穿着它每击倒一个对手，计数 +1</p>' : ''}<p>${colName(it.k)}武器箱 · ${charName(it.k)}</p></div>
      <div class="row"><button class="go small" id="arKeep">收下</button><button class="ghost small" id="arSee">检视</button>${again ? `<button class="ghost small" id="arAgain">再开一个</button>` : ''}</div>`, `rv t-${t}`);
    $id('arKeep').addEventListener('click', () => { closeModal(); render(); });
    $id('arSee').addEventListener('click', () => { closeModal(); const x = ST.inv.find(y => y.i === it.i); if (x) inspect(x, 'inv'); });
    if (again) $id('arAgain').addEventListener('click', () => { closeModal(); openCase(cid); });
  }

  // 货郎：开封后一次报一件，买下就用掉；不要就换下一件，最多 5 件；也支持一键批量开启全部可用货郎
  let TERM_FX = 0;   // 新的一件刚出来：卡面播一下“解码”的动画
