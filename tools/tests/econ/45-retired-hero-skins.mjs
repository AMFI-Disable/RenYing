section('退场侠客的饰品：旧款换成接替的那一款；上一版丢掉了的按流水原样找回（每个号只做一次）');
{
  T = nextNoon();
  const map = C.RETIRED, olds = Object.keys(map);
  ok(olds.length === 14 && olds.every(k => !C.isItem(k) && C.isItem(map[k]) && C.ITEM[map[k]].col && C.charOf(map[k])), '14 款旧款都有接替的那一款，旧编号不再是饰品');
  ok(olds.every(k => !C.HERO_IDS.includes({ yu: 'youhuang', pl: 'polang' }[k.split('_')[0]])), '旧款只属于已经退场的幽篁、破浪');
  // 存档里旧款还在（上一版还没读过这个号）：读进来直接换编号，斩数和名字标签照旧
  const n0 = C.normalize({ ...C.blank(), nid: 9, inv: [{ i: 3, k: 'yu_sf1', st: 7, n: '旧名', t: T, src: 'case' }], via: ['yu_sf1', 'pl_st1'], promoKeys: ['yu_ic1'],
    hist: [{ t: T, kind: 'sell', k: 'pl_st3', st: -1, price: 9 }] }, { now: T, uid: 'x' });
  ok(n0.inv.length === 1 && n0.inv[0].k === 'ql_sf1' && n0.inv[0].st === 7 && n0.inv[0].n === '旧名' && n0.inv[0].i === 3, '库存里的旧款换成新款，编号、斩数、名字照旧', n0.inv);
  ok(n0.via.includes('ql_sf1') && n0.via.includes('xw_st1') && !n0.via.some(k => map[k]) && n0.promoKeys[0] === 'ql_ic1', 'via、通用码记录也换成新编号', [n0.via, n0.promoKeys]);
  ok(n0.hist[0].k === 'xw_st3', '买卖记录里的旧款显示成新款', n0.hist);
  const env0 = { now: T, uid: 'x', skins: ['yu_sf1', 'qf_p1', 'ql_sf1'], equip: { youhuang: 'yu_sf1', qingfeng: 'qf_p1' } };
  C.normalize(C.blank(), env0);
  ok(env0.skins.join() === 'ql_sf1,qf_p1' && !env0.equip.youhuang && env0.equip.qingfeng === 'qf_p1', '可穿的皮肤换成新编号、去重；穿在退场侠客身上的拿掉', env0);

  // 老号 A：旧款还在存档里，还有一件挂在市场上
  const A = await newUser('retire_a', { ink: 100 });
  await econ(A.token, 'sync');
  const sa = stateOf(A.uid), la = 'a1b2c3d4e5f60718';
  sa.inv.push({ i: sa.nid++, k: 'pl_st2', st: 5, n: '', t: T, src: 'case' });
  const listed = { i: sa.nid++, k: 'yu_ym2', st: -1, n: '', t: T, src: 'case' };
  sa.lst.push({ l: la, it: listed, price: 300, t: T });
  sa.via = ['pl_st2'];
  ENV.DB.raw.prepare('UPDATE econ SET state_json = ? WHERE uid = ?').run(JSON.stringify(sa), A.uid);
  ENV.DB.raw.prepare('INSERT INTO mkt (id, seller, k, st, item_json, price, at, state, paid) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)').run(la, A.uid, 'yu_ym2', -1, JSON.stringify(listed), 300, T);
  const pa = profOf(A.uid); pa.skins = ['pl_st2']; pa.equip = { polang: 'pl_st2' };
  ENV.DB.raw.prepare('UPDATE users SET profile_json = ? WHERE id = ?').run(JSON.stringify(pa), A.uid);
  const ra = await econ(A.token, 'sync');
  const sa1 = stateOf(A.uid);
  ok(ra.ok && sa1.inv.length === 1 && sa1.inv[0].k === 'xw_st2' && sa1.inv[0].st === 5 && sa1.lst.length === 1 && sa1.lst[0].it.k === 'xw_ym2', '旧款换成新款：库存的、挂着的都在，没有多出来', sa1);
  ok(profOf(A.uid).skins.includes('xw_st2') && !profOf(A.uid).skins.some(k => map[k]) && !profOf(A.uid).equip.polang, '可穿的皮肤换成新款，穿在退场侠客身上的拿掉', profOf(A.uid));
  ok(JSON.parse(row('SELECT srv_json FROM econ WHERE uid = ?', A.uid).srv_json).rh, '查过一次，记在 srv.rh');
  const B = await newUser('retire_b', { ink: 2000 });
  await econ(B.token, 'sync');
  const mk = await market(B.token, 'xw_ym2');
  const bb = await econ(B.token, 'buy', { l: la, price: 300 });
  ok(bb.res && bb.res.ok && bb.res.item.k === 'xw_ym2' && stateOf(B.uid).inv.some(x => x.k === 'xw_ym2'), '旧款挂单照样能买，买到的是新款', [bb.res, mk.open]);
  await econ(A.token, 'sync');
  ok(!stateOf(A.uid).lst.length && stateOf(A.uid).hist.some(h => h.kind === 'sold' && h.k === 'xw_ym2'), '卖家照常结账，记录里是新款');

  // 老号 C：上一版读存档时旧款已经被丢掉了（库存、via 里都没了），可穿的皮肤和流水里还记着
  const D = await newUser('retire_c', { ink: 100 });
  await econ(D.token, 'sync');
  const sd = stateOf(D.uid), base = sd.nid + 10;
  sd.nid = base + 10;
  ENV.DB.raw.prepare('UPDATE econ SET state_json = ?, srv_json = ? WHERE uid = ?').run(JSON.stringify(sd), JSON.stringify({ ...JSON.parse(row('SELECT srv_json FROM econ WHERE uid = ?', D.uid).srv_json), rh: 0 }), D.uid);
  const logIt = (act, detail) => ENV.DB.raw.prepare('INSERT INTO econ_log (uid, at, act, ok, ink0, ink1, detail) VALUES (?, ?, ?, 1, 0, 0, ?)').run(D.uid, T - 86400e3, act, JSON.stringify(detail));
  logIt('open', { r: `yu_ic3#${base} st12` });
  logIt('trade', { ad: [`pl_st2#${base + 1}`, `pl_st2#${base + 2}`, `pl_st1#${base + 3}`], rm: [] });
  logIt('trade', { rm: [`pl_st1#${base + 3}`] });   // 熔铸掉了的：不找回
  logIt('open', { r: `pl_st4#${base + 4}` });
  const lid = 'f0e1d2c3b4a59687';
  ENV.DB.raw.prepare('INSERT INTO mkt (id, seller, k, st, item_json, price, at, state, paid) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)').run(lid, D.uid, 'pl_st4', -1, JSON.stringify({ i: base + 4, k: 'pl_st4', st: -1, n: '', t: T, src: 'case' }), 450, T);
  const pd = profOf(D.uid); pd.skins = ['yu_ic3', 'pl_st2', 'yu_sf1']; pd.equip = { youhuang: 'yu_ic3' };
  ENV.DB.raw.prepare('UPDATE users SET profile_json = ? WHERE id = ?').run(JSON.stringify(pd), D.uid);
  const rd = await econ(D.token, 'sync');
  const sd1 = stateOf(D.uid), ret = sd1.inv.filter(x => x.src === 'retire');
  ok(rd.ok && ret.some(x => x.k === 'ql_ic3' && x.i === base && x.st === 12), '开箱开到的那件按流水找回：编号、斩数照旧，换成新款', sd1.inv);
  ok(ret.filter(x => x.k === 'xw_st2').map(x => x.i).sort().join() === `${base + 1},${base + 2}`, '两件同款都找回，不只一件');
  ok(!sd1.inv.some(x => x.k === 'xw_st1'), '流水里记着已经熔铸掉的不找回');
  ok(sd1.lst.length === 1 && sd1.lst[0].l === lid && sd1.lst[0].it.k === 'xw_st4' && !sd1.inv.some(x => x.i === base + 4), '还挂在市场上的补回挂单记录，不另放一件进库存', sd1.lst);
  ok(ret.filter(x => x.k === 'ql_sf1').length === 1 && ret.find(x => x.k === 'ql_sf1').st === -1, '流水里查不到的旧款补一件普通版');
  ok(['ql_ic3', 'xw_st2', 'ql_sf1'].every(k => sd1.via.includes(k) && profOf(D.uid).skins.includes(k)) && !profOf(D.uid).skins.some(k => map[k]) && !profOf(D.uid).equip.youhuang, '找回的都能穿，旧编号从可穿的皮肤里拿掉', [sd1.via, profOf(D.uid)]);
  const lg = row("SELECT detail FROM econ_log WHERE uid = ? AND act = 'retire'", D.uid);
  ok(lg && JSON.parse(lg.detail).ad.length === 4 && JSON.parse(lg.detail).lst.length === 1, '流水记了一笔 retire：找回 3 件、补 1 件、补回 1 单挂单', lg);
  const n1 = sd1.inv.length;
  await econ(D.token, 'sync');
  const up = await call('POST', '/api/profile', { profile: { ...profOf(D.uid), skins: [...profOf(D.uid).skins, 'yu_ic3', 'pl_st4'] }, ledger: { deltas: [], ev: 0 } }, D.token);
  await econ(D.token, 'sync');
  ok(up.ok && stateOf(D.uid).inv.length === n1 && !profOf(D.uid).skins.some(k => map[k]), '只做一次：再动武库、网页再报上来旧款都不会再补', [stateOf(D.uid).inv.length, n1, profOf(D.uid).skins]);
  const ls = await adm('GET', '/api/admin/lost?uid=' + D.uid);
  ok(!(ls.items || []).some(x => x.i === base || x.i === base + 1 || x.i === base + 2), '后台找回工具里不再把找回的当成找不到的', ls.items);
  T += 3 * 86400e3;
}
