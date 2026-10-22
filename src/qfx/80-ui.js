/* ---------------- 界面 ---------------- */
const UI = {
  c: {}, toastT: 0,
  set(id, v) { if (this.c[id] !== v) { this.c[id] = v; $(id).textContent = v; } },
  bar(id, k) { k = Math.round(sat(k) * 500) / 500; if (this.c[id] !== k) { this.c[id] = k; $(id).style.transform = `scaleX(${k})`; } },
  cls(id, name, on) { const key = id + '.' + name; if (this.c[key] !== on) { this.c[key] = on; $(id).classList.toggle(name, on); } },
  hide(id, h) { const key = id + '.h'; if (this.c[key] !== h) { this.c[key] = h; $(id).hidden = h; } },
  toast(msg, dur = 1.8) { const el = $('toast'); el.textContent = msg; el.classList.add('show'); this.toastT = dur; },
  banner(t, s = '', cls = '') { const el = $('banner'); $('banT').textContent = t; $('banS').textContent = s; el.className = 'banner ' + cls; void el.offsetWidth; el.classList.add('show'); },
  combo(n) { if (n < 2) { this.hide('combo', true); return; } this.hide('combo', false); this.set('comboN', n); this.set('comboR', n >= 60 ? '万夫莫敌' : n >= 40 ? '无双' : n >= 25 ? '游龙' : n >= 12 ? '流水' : n >= 5 ? '行云' : ''); const el = $('combo'); el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); },
  update(dt) {
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) $('toast').classList.remove('show'); }
    this.bar('hpFill', Pl.hp / Pl.maxHp); this.bar('hpLag', Pl.hp / Pl.maxHp); this.set('hpTxt', Math.ceil(Pl.hp) + ' / ' + Pl.maxHp); this.bar('mpFill', Pl.mp / Pl.maxMp); this.bar('staFill', Pl.sta / Pl.maxSta);
    this.cls('hpBar', 'shield', Pl.shield > 0); this.set('lvNum', cnNum(Pl.lv)); this.set('gold', Math.floor(Pl.gold)); this.set('swName', swordTier().name + (Pl.swordLv ? ' · ' + cnNum(Pl.swordLv) + '重' : '')); this.set('pots', Pl.pots);
    this.set('buffs', (Pl.buffT > 0 ? '踏雪 ' : '') + (Pl.shield > 0 ? '真气 ' : '') + (Pl.bellT > 0 ? '金钟 ' : '') + (Pl.wuyingT > 0 ? '无影 ' : '') + (Pl.nextCrit > 0 ? '回锋 ' : '')); this.bar('xpFill', Pl.xp / Pl.xpNeed);
    for (let i = 0; i < 4; i++) { const d = slotDef(i), id = 'sk' + i, empty = !d; this.cls(id, 'empty', empty); if (this.c[id + '.d'] !== d) { this.c[id + '.d'] = d; const b = $(id); b.querySelector('.g').textContent = d ? d.g : i === 3 ? '绝' : '空'; b.querySelector('.n').textContent = d ? d.n + (i < 3 && skLv(Pl.slots[i]) > 1 ? ' · ' + cnNum(skLv(Pl.slots[i])) + '重' : '') : i === 3 ? '绝学' : '空槽'; }
      if (i < 3) { const lvk = id + '.l', lv = d ? skLv(Pl.slots[i]) : 0; if (this.c[lvk] !== lv) { this.c[lvk] = lv; this.c[id + '.d'] = null; } }
      const cd = empty ? 0 : i === 3 ? 0 : Pl.cds[i] / (Pl.cdMax[i] || d.cd), k = id + '.cd', v = Math.round(cd * 100) / 100; if (this.c[k] !== v) { this.c[k] = v; $(id).style.setProperty('--cd', v); } this.cls(id, 'nomp', !empty && i < 3 && Pl.mp < d.mp); }
    { const v = Math.round(Pl.rage) / 100; if (this.c.rage !== v) { this.c.rage = v; $('sk3').style.setProperty('--rage', v); } this.cls('sk3', 'ready', !!Pl.ult && Pl.rage >= 100); }
    { const v = Math.round(sat(Pl.potCd / 1.5) * 100) / 100; if (this.c.potcd !== v) { this.c.potcd = v; $('sk4').style.setProperty('--cd', v); } }
    const alive = G.enemies.filter(e => e.state !== 'dead').length + G.queue.length;
    let t1, t2; const ch = CHAPTERS[G.chapter] || CHAPTERS[0];
    if (G.intro) { t1 = ch.n; t2 = `整装 ${Math.ceil(G.inter)} · Enter 开战`; }
    else if (G.clearT > 0) { t1 = ch.n; t2 = '已破'; }
    else if (G.inter > 0) { t1 = `第${cnNum(G.stage + 1)}关`; t2 = `休整 ${Math.ceil(G.inter)} · B 入剑庐 · Enter 开战`; }
    else { t1 = `第${cnNum(G.stage)}关`; t2 = `${G.stageName} · 残敌 ${alive}`; }
    this.set('waveT', t1); this.set('waveS', t2);
    const b = G.boss && G.boss.state !== 'dead' ? G.boss : null; this.hide('bossBox', !b); if (b) { this.set('bossName', b.name); this.bar('bossFill', b.hp / b.maxHp); this.bar('bossLag', b.hp / b.maxHp); this.bar('bossPoise', b.stun > 0 ? 1 : b.poiseD / b.cfg.poise); }
    const lk = Pl.lock && Pl.lock.state !== 'dead' && Pl.state !== 'exec' ? Pl.lock : null; this.cls('hud', 'cine', Pl.state === 'exec'); this.hide('lockm', !lk);
    if (lk) { _pv.set(lk.pos.x, lk.hitY, lk.pos.z).project(GFX.camera); const sx = ((_pv.x * .5 + .5) * innerWidth).toFixed(0), sy = (-_pv.y * .5 + .5) * innerHeight; $('lockm').style.transform = `translate(${sx}px,${sy.toFixed(0)}px) rotate(45deg)`; if (!lk.boss) $('lockInfo').style.transform = `translate(${sx}px,${(sy - 44 - lk.radius * 14).toFixed(0)}px)`; }
    this.hide('lockInfo', !lk || !!lk.boss); if (lk && !lk.boss) { this.bar('lockHp', lk.hp / lk.maxHp); this.bar('lockPo', lk.stun > 0 ? 1 : (lk.poiseD || 0) / (lk.cfg.poise * (lk.elite ? 1.6 : 1))); this.cls('lockInfo', 'stun', lk.stun > 0); }
    const ex = Pl.state !== 'dead' && Pl.state !== 'exec' ? findExec() : null; this.hide('execm', !ex || Input.touch); this.cls('tParry', 'exec', !!ex); this.set('tParry', ex ? '决' : '格'); this.cls('tLock', 'on', !!lk);
    if (ex && !Input.touch) { _pv.set(ex.pos.x, ex.hitY + .2, ex.pos.z).project(GFX.camera); $('execm').style.transform = `translate(${((_pv.x * .5 + .5) * innerWidth).toFixed(0)}px,${((-_pv.y * .5 + .5) * innerHeight).toFixed(0)}px) translate(18px,-50%)`; }
    this.mini();
  },
  mini() {
    const cv = $('mini'), g = this.mg || (this.mg = cv.getContext('2d')), S = cv.width, c = S / 2, k = c / 34, yaw = Cam.yaw, rx = -Math.cos(yaw), rz = Math.sin(yaw), fx = Math.sin(yaw), fz = Math.cos(yaw);
    const P = (x, z) => { const dx = x - Pl.pos.x, dz = z - Pl.pos.z; return [c + (dx * rx + dz * rz) * k, c - (dx * fx + dz * fz) * k]; };
    g.clearRect(0, 0, S, S); g.save(); g.beginPath(); g.arc(c, c, c, 0, TAU); g.clip();
    let p = P(0, 0); g.strokeStyle = 'rgba(233,223,200,.35)'; g.lineWidth = 2; g.beginPath(); g.arc(p[0], p[1], World.R * k, 0, TAU); g.stroke(); g.fillStyle = 'rgba(233,223,200,.1)'; g.beginPath(); g.arc(p[0], p[1], 20 * k, 0, TAU); g.fill();
    g.fillStyle = 'rgba(233,223,200,.22)'; for (const c of World.colliders) { if (c.r < .8 || Math.hypot(c.x, c.z) > World.R) continue; p = P(c.x, c.z); g.beginPath(); g.arc(p[0], p[1], Math.max(1.5, c.r * k), 0, TAU); g.fill(); }
    const mp = MAPS[World.id]; if (mp && mp.mini) mp.mini(g, P, k);
    for (const o of Orbs.list) { if (o.type === 0) continue; p = P(o.x, o.z); g.fillStyle = o.type === 1 ? '#dcae55' : '#ff6b57'; g.fillRect(p[0] - 2, p[1] - 2, 4, 4); }
    for (const e of G.enemies) { if (e.state === 'dead') continue; p = P(e.pos.x, e.pos.z); g.fillStyle = e.boss ? '#ff3a22' : e.elite ? '#ffc040' : '#e8674f'; g.beginPath(); g.arc(p[0], p[1], e.boss ? 9 : e.elite ? 6 : 4.5, 0, TAU); g.fill(); }
    for (const h of G.hazards) { if (!h.tele) continue; p = P(h.x, h.z); g.strokeStyle = '#ff3a22'; g.beginPath(); g.arc(p[0], p[1], h.r * k, 0, TAU); g.stroke(); }
    const a = angDiff(yaw, Pl.yaw); g.translate(c, c); g.rotate(-a); g.fillStyle = '#62cdb9'; g.beginPath(); g.moveTo(0, -11); g.lineTo(7, 8); g.lineTo(0, 4); g.lineTo(-7, 8); g.closePath(); g.fill(); g.restore();
  },
  perkList(el) {
    const sk = Pl.slots.filter(Boolean).map(id => `<span class="pk-sk">${SK[id].n}${skLv(id) > 1 ? ' ' + cnNum(skLv(id)) + '重' : ''}</span>`).concat(Pl.ult ? [`<span class="pk-ult">${ULT[Pl.ult].n}</span>`] : []);
    const rs = Object.keys(SCHOOLS).filter(s => reso(s) >= 3).map(s => `<span class="pk-rs" style="color:${SCHOOLS[s].c}">${SCHOOLS[s].n}共鸣 ${reso(s) >= 6 ? '六' : '三'}重</span>`);
    const html = sk.concat(rs, PERKS.filter(p => pk(p.id)).map(p => `<span>${p.n}${pk(p.id) > 1 ? ' ' + cnNum(pk(p.id)) + '重' : ''}</span>`)).join(''); $(el).innerHTML = html || '<span>尚无机缘</span>'; },
  cardHtml(c, i) {
    if (c.k === 'perk') { const p = c.p, S = SCHOOLS[p.s], r = reso(p.s), nx = r + 1, tip = r < 3 && nx >= 3 ? `共鸣三重：${S.r3}` : r < 6 && nx >= 6 ? `共鸣六重：${S.r6}` : `${S.n} ${r} → ${nx} 重`;
      return [`card r${p.r}`, `<span class="rs">${['', '凡', '珍', '绝'][p.r]}</span><span class="ct" style="color:${S.c}">机缘 · ${S.n}</span><span class="cn">${p.n}</span><span class="cdsc">${p.d}</span><span class="cr">${tip}</span><span class="cs"><span>${pk(p.id) ? '已修 ' + cnNum(pk(p.id)) + ' 重' : '初悟'} / ${cnNum(p.max)}</span><span class="ck">${i + 1}</span></span>`]; }
    if (c.k === 'ult') { const u = ULT[c.id]; return ['card ult', `<span class="rs">绝</span><span class="ct">绝学 · V</span><span class="cn">${u.n}</span><span class="cdsc">${u.d}</span><span class="cr">剑意满时施展，只能择一门</span><span class="cs"><span>绝学</span><span class="ck">${i + 1}</span></span>`]; }
    const d = SK[c.id], l = skLv(c.id), slot = l ? Pl.slots.indexOf(c.id) : Pl.slots.indexOf(null);
    return ['card skill', `<span class="rs">${d.g}</span><span class="ct">剑谱 · ${'QER'[slot]}</span><span class="cn">${d.n}</span><span class="cdsc">${d.d(l + 1)}</span><span class="cr">内力 ${d.mp} · 调息 ${d.cd} 息</span><span class="cs"><span>${l ? `${cnNum(l)}重 → ${cnNum(l + 1)}重` : '新学，入' + 'QER'[slot] + '槽'}</span><span class="ck">${i + 1}</span></span>`];
  },
  showLevelUp() {
    const cards = offerCards(), host = $('cards'); host.innerHTML = ''; $('luSub').textContent = `已入${cnNum(Pl.lv - Pl.pending + 1)}境 · 择其一`;
    cards.forEach((c, i) => { const b = document.createElement('button'), [cls, html] = this.cardHtml(c, i); b.type = 'button'; b.className = cls; b.id = 'card' + i; b.innerHTML = html; b.onclick = () => Game.pickPerk(c); host.appendChild(b); });
    this.perks = cards; $('levelup').hidden = false;
  },
  showShop() {
    const host = $('shopGrid'); host.innerHTML = ''; $('shopGold').textContent = Math.floor(Pl.gold);
    SHOP.forEach((it, i) => { const b = document.createElement('button'), mx = it.max(), cost = it.cost(); b.type = 'button'; b.className = 'item'; b.id = 'shop' + i; b.disabled = mx || Pl.gold < cost; b.innerHTML = `<span class="in">${it.n()}</span><span class="ip">${mx ? '已臻极致' : cost + ' 文'}</span><span class="id">${it.d()}</span>`; b.onclick = () => { if (Pl.gold >= cost && !it.max()) { Pl.gold -= cost; it.buy(); UI.showShop(); } }; host.appendChild(b); });
    $('shop').hidden = false;
  },
};

