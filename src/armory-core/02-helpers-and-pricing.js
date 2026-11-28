  /* ---------- 小工具 ---------- */
  function hash32(str) {
    let h = 0x811c9dc5;
    str = String(str);
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return h >>> 0;
  }
  function rng(seed) {   // mulberry32：同一个种子在哪台机器上都得到同一串数
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // 查表一律只认表里自己的键（'__proto__'、'constructor' 这种名字查不到东西）
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined;
  C.own = own;
  C.hash32 = hash32; C.rng = rng;
  C.day = t => Math.floor((t + 8 * 3600e3) / 86400e3);
  C.week = d => Math.floor((d + 3) / 7);
  C.season = d => { const k = Math.max(0, Math.floor((d - C.DAY0) / C.SEASON_DAYS)), s = C.DAY0 + k * C.SEASON_DAYS; return { k, id: 's' + (k + 1), start: s, end: s + C.SEASON_DAYS }; };

  // 每件饰品：属于哪个武器箱（收藏品）、什么品质、热门程度
  C.ITEM = Object.create(null);
  for (const [cid, col] of Object.entries(C.COLS)) for (const t of C.TIERS) for (const k of col[t] || [])
    C.ITEM[k] = { col: cid, tier: t, mul: 0.85 + (hash32('pop|' + k) % 450) / 1000 };   // 热门程度 0.85~1.3
  C.isItem = k => Object.prototype.hasOwnProperty.call(C.ITEM, k);
  C.ofTier = t => Object.keys(C.ITEM).filter(k => C.ITEM[k].tier === t);
  C.isPrem = k => C.isItem(k) && !!C.COLS[C.ITEM[k].col].prem;
  C.isHeirloom = k => C.isItem(k) && !!C.COLS[C.ITEM[k].col].heirloom;
  C.isStOnly = k => C.isItem(k) && !!C.COLS[C.ITEM[k].col].stOnly;
  C.ofTierReg = t => C.ofTier(t).filter(k => !C.isPrem(k));   // 普通武器箱里的：星章兑换只从这些里出，神兵、星座与传世武器箱不在此列
  const PREFIX = { qf: 'qingfeng', fy: 'feiying', ts: 'tieshan', ls: 'lingshuang', ly: 'liuyun', lm: 'leiming', my: 'moyu', yh: 'yuehua', yl: 'yanling', yx: 'yuxiao', zx: 'zuixian', gc: 'gouchen', lq: 'lingque', li: 'liying', cx: 'cixian', qj: 'qianji', ch: 'chixiao', xj: 'xuanji', ql: 'qingluan', xw: 'xuanwu' };
  C.charOf = k => own(PREFIX, String(k).split('_')[0]) || '';
  // 退场侠客的饰品：精简到 20 位侠客时退场的 16 位里，只有幽篁（yu_）和破浪（pl_）在武库里有饰品，一共 14 款。
  // 每款换成同一个武器箱、同一档品质、同一个位置上接替它的那一款。存档、挂单、记录里读到旧编号一律换成新编号，斩数照旧。
  // 上一版读存档时直接丢掉了这些旧款：服务器按流水找回（cloudflare/worker/30-admin-helpers.js 的 retiredRestore），本机账号按可穿的皮肤补（src/armory.js）
  C.RETIRED = { yu_sf1: 'ql_sf1', pl_sf1: 'xw_sf1', yu_ic1: 'ql_ic1', pl_ic1: 'xw_ic1', yu_ic3: 'ql_ic3', yu_ic4: 'ql_ic4',
    pl_st1: 'xw_st1', pl_st2: 'xw_st2', pl_st3: 'xw_st3', pl_st4: 'xw_st4', yu_ym1: 'xw_ym1', yu_ym2: 'xw_ym2', yu_ym3: 'ql_ym3', yu_ym4: 'li_ym4' };
  C.isRetired = k => typeof k === 'string' && own(C.RETIRED, k) !== undefined;
  C.liveKey = k => C.isRetired(k) ? C.RETIRED[k] : k;
  // 可穿的皮肤、正穿着的：旧编号换成新编号；穿在退场侠客身上的那一条拿掉
  C.retireSkins = env => {
    if (!env || !Array.isArray(env.skins)) return false;
    let changed = false;
    const out = [];
    for (const k of env.skins) { const m = C.liveKey(k); if (m !== k) changed = true; if (!out.includes(m)) out.push(m); }
    if (changed) { env.skins.length = 0; env.skins.push(...out); }
    if (env.equip && typeof env.equip === 'object') for (const [c, k] of Object.entries(env.equip)) if (C.isRetired(k)) { delete env.equip[c]; changed = true; }
    return changed;
  };

  // 星座武器箱的 36 款：按 C.ZODIAC 的配色和 C.ZOD_OF 的分配生成。
  // 背后一枚星座星图（deco.sign 是哪个星座，zt 是第几档：灵犀只有星图，赤霄加一圈星环，绝世是转动的星盘），头上星冠，绝世的兵器上还有星光（zw）
  const hexRGB = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const rgbS = h => hexRGB(h).join(',');
  const mixH = (a, b, t) => '#' + hexRGB(a).map((v, i) => Math.round(v + (hexRGB(b)[i] - v) * t).toString(16).padStart(2, '0')).join('');
  const GOLD = '#ffd36a';
  const zodSkin = (pre, z, ti) => {
    const [code, name, m, lt, dk, nt, ac] = z, char = PREFIX[pre], tier = C.ZOD_TIERS[ti][0];
    const sky = (a, b) => [nt, mixH(nt, dk, a), mixH(dk, m, b), mixH(nt, dk, a * 0.8)];
    const sign = { sign: code, zt: ti + 1, zc: rgbS(m), zc2: rgbS(ti === 2 ? GOLD : ac) };
    const base = { char, name: `${name}·${C.ZOD_TIERS[ti][1]}` }, ws = pre === 'gc' ? { weapStyle: 'zod_' + code } : {};   // 勾陈的流星锤按星座换颜色（HAMMER_LOOK）
    if (tier === 'cla') return { ...base,
      look: { body: lt, shade: mixH(lt, m, 0.45), scarf: m, slash: rgbS(mixH(m, '#ffffff', 0.25)), blade: mixH(lt, '#ffffff', 0.5), metal: mixH(m, '#ffffff', 0.35), haft: dk, outline: nt, outlineA: 1 },
      deco: { head: 'circlet', gem: m, robe: 'starry', robeC: mixH(m, dk, 0.55), back: 'zodiac', ...sign, trail: 'star', ...ws },
      fx: { th: 'star', c: rgbS(m), c2: rgbS(ac) },
      scene: { sky: sky(0.5, 0.25), orb: 'moon', orbC: rgbS(lt), mist: rgbS(m), mtn: [mixH(nt, dk, 0.7), mixH(nt, dk, 0.4)], bam: [mixH(nt, dk, 0.3), nt], wx: 'twinkle', wxC: rgbS(lt), hit: 'starburst', hitC: rgbS(m), stars: 0.7 } };
    if (tier === 'cov') return { ...base,
      look: { body: dk, shade: mixH(dk, nt, 0.6), scarf: m, slash: rgbS(m), blade: lt, metal: m, haft: nt, outline: mixH(m, '#ffffff', 0.2), outlineA: 0.85 },
      deco: { head: 'startiara', tiaraC: ac, gem: m, robe: 'starry', robeC: mixH(dk, nt, 0.3), breastplate: m, shoulder: mixH(dk, m, 0.35), cape: mixH(dk, nt, 0.4), back: 'zodiac', ...sign, trail: 'star', aura: 'aurora', ...ws },
      fx: { th: 'nebula', c: rgbS(m), c2: rgbS(ac), part: 'twinkle' },
      scene: { sky: sky(0.7, 0.4), orb: 'moon', orbC: rgbS(mixH(lt, m, 0.3)), mist: rgbS(m), mtn: [mixH(nt, dk, 0.75), mixH(nt, dk, 0.45)], bam: [mixH(nt, dk, 0.3), nt], wx: 'twinkle', wxC: rgbS(mixH(lt, m, 0.3)), hit: 'swirl', hitC: rgbS(m), stars: 0.9, rays: true } };
    return { ...base,
      look: { body: mixH(nt, dk, 0.55), shade: nt, scarf: GOLD, slash: rgbS(mixH(m, GOLD, 0.35)), blade: '#fffbea', metal: GOLD, haft: mixH(dk, '#3a2a10', 0.5), outline: mixH(GOLD, '#ffffff', 0.25), outlineA: 0.9 },
      deco: { head: 'startiara', tiaraC: GOLD, gem: m, robe: 'celestial', robeC: mixH(dk, nt, 0.2), breastplate: '#d8aa4a', shoulder: mixH(dk, GOLD, 0.35), cape: mixH(nt, dk, 0.6), back: 'zodiac', ...sign, orbs: mixH(m, '#ffffff', 0.3), zw: 1, trail: 'gold', aura: 'gold', ...ws },
      fx: { th: 'nebula', c: rgbS(m), c2: rgbS(GOLD), part: 'twinkle' },
      scene: { sky: sky(0.85, 0.55), orb: 'galaxy', orbC: rgbS(mixH(m, '#ffffff', 0.4)), mist: rgbS(m), mtn: [mixH(nt, dk, 0.8), mixH(nt, dk, 0.5)], bam: [mixH(nt, dk, 0.35), nt], wx: 'gold', wxC: rgbS(GOLD), hit: 'sunburst', hitC: rgbS(GOLD), stars: 1, rays: true } };
  };
  for (const [pre, zs] of Object.entries(C.ZOD_OF)) zs.forEach((code, ti) => { C.FULL[`${pre}_z${code}`] = zodSkin(pre, C.ZODIAC.find(z => z[0] === code), ti); });
  // 五套主题系列套装皮肤生成（山海星陨 sf、墨韵丹青 ic、沧澜雷霆 st、九霄剑阁 jx、幽冥玄煞 ym；全套专属外观、兵器、配饰、特效与全景天象）
  const HERO_WEAP_STYLE = {
    qf: 'renying_blade', fy: 'butterfly_daggers', ts: 'crystal_greatsword', ls: 'tianhe_spear',
    ly: 'koi_fan', lm: 'jiuxiao_gauntlet', my: 'jade_brush', yh: 'guanghan_moon',
    yl: 'peacock_feather', yx: 'tianlai_flute', zx: 'moon_gourd', gc: 'frost_hammer',
    lq: 'peacock_feather', li: 'butterfly_daggers', cx: 'guanghan_moon', qj: 'frost_hammer',
    ch: 'tianhe_spear', xj: 'guanghan_moon', ql: 'koi_fan', xw: 'crystal_greatsword',
  };
  const SET_THEMES = {
    sf: {
      name: '星陨', body: '#1c234d', shade: '#0d112b', scarf: '#9bb2ff', slash: '165,188,255', blade: '#f2f6ff', outline: '#b6c8ff',
      breast: '#27306b', shoulder: '#36428c', cape: '#161c42', gem: '#ffd8f6',
      heads: ['headband', 'jadepin', 'valkyrie', 'starguan'],
      robes: ['starry', 'starry', 'celestial', 'celestial'],
      backs: ['crescent', 'notering', 'galaxy', 'galaxy'],
      fx: { th: 'nebula', c: '165,188,255', c2: '255,160,235' },
      scene: { sky: ['#040512', '#0e1338', '#232864', '#0b0e28'], orb: 'galaxy', orbC: '175,195,255', mist: '165,175,255', mtn: ['#151a44', '#0b0e26'], bam: ['#080a1c', '#040510'], wx: 'twinkle', wxC: '225,230,255', hit: 'swirl', hitC: '180,190,255', stars: 1, rays: true },
    },
    ic: {
      name: '丹青', body: '#f2eadc', shade: '#bda892', scarf: '#d83b30', slash: '238,88,74', blade: '#1e1917', outline: '#281814',
      breast: '#8a2620', shoulder: '#a8342a', cape: '#2a1a16', gem: '#ff8a7a',
      heads: ['bamboohat', 'bamboohat', 'veilhat', 'plume'],
      robes: ['jade_master', 'jade_master', 'dusk', 'phoenix'],
      backs: ['scroll', 'scroll', 'koi', 'flysword'],
      fx: { th: 'ink', c: '238,88,74', c2: '24,18,16' },
      scene: { sky: ['#140a08', '#341612', '#6a261e', '#24100d'], orb: 'bloodmoon', orbC: '255,115,92', mist: '240,140,115', mtn: ['#2e1612', '#1a0c0a'], bam: ['#120806', '#0a0404'], wx: 'ink', wxC: '60,24,20', hit: 'enso', hitC: '245,95,80', stars: 0.25, rays: true },
    },
    st: {
      name: '沧澜', body: '#143248', shade: '#091a28', scarf: '#38d2ff', slash: '90,222,255', blade: '#ecfbff', outline: '#7ae4ff',
      breast: '#1d4d6e', shoulder: '#2a6a92', cape: '#0c2638', gem: '#a8f4ff',
      heads: ['headband', 'voidhorns', 'taotiehelm', 'starguan'],
      robes: ['blizzard', 'thunder', 'thunder', 'heavy'],
      backs: ['crystals', 'icewings', 'chakra', 'chakra'],
      fx: { th: 'thunder', c: '90,222,255', c2: '220,250,255' },
      scene: { sky: ['#04101c', '#0a263e', '#1a4f74', '#0a2034'], orb: 'rift', orbC: '120,232,255', mist: '115,215,250', mtn: ['#10324a', '#081d2e'], bam: ['#061624', '#030c14'], wx: 'spark', wxC: '150,235,255', hit: 'bolt', hitC: '95,225,255', stars: 0.45, rays: true },
    },
    jx: {
      name: '九霄', body: '#f8f2e2', shade: '#c8b482', scarf: '#f5be48', slash: '255,218,125', blade: '#fffaf0', outline: '#3a280e',
      breast: '#c6983e', shoulder: '#deb356', cape: '#5c3c16', gem: '#fff0b8',
      heads: ['jadepin', 'plume', 'starguan', 'valkyrie'],
      robes: ['celestial', 'celestial', 'phoenix', 'celestial'],
      backs: ['notering', 'flysword', 'flysword', 'peacock'],
      fx: { th: 'star', c: '255,218,125', c2: '255,248,220' },
      scene: { sky: ['#161006', '#3d2a0e', '#8c6424', '#2e1e08'], orb: 'sun', orbC: '255,228,150', mist: '255,215,135', mtn: ['#3e2a10', '#241808'], bam: ['#181006', '#0e0904'], wx: 'gold', wxC: '255,228,145', hit: 'sunburst', hitC: '255,220,125', stars: 0.35, rays: true },
    },
    ym: {
      name: '幽冥', body: '#241438', shade: '#10081c', scarf: '#c870ff', slash: '205,120,255', blade: '#f5e8ff', outline: '#b668ff',
      breast: '#381e58', shoulder: '#4f2a7a', cape: '#180c28', gem: '#8ff6ff',
      heads: ['foxmask', 'voidhorns', 'foxmask', 'voidhorns'],
      robes: ['dark', 'spirit', 'spirit', 'dark'],
      backs: ['butterflywings', 'crescent', 'butterflywings', 'galaxy'],
      fx: { th: 'butterfly', c: '205,120,255', c2: '125,245,255', part: 'butterfly' },
      scene: { sky: ['#080412', '#1c0c34', '#3b1866', '#140826'], orb: 'bloodmoon', orbC: '215,135,255', mist: '185,120,255', mtn: ['#22103c', '#120822'], bam: ['#0e061a', '#06030e'], wx: 'petal', wxC: '215,160,255', hit: 'crescent', hitC: '205,120,255', stars: 0.75, rays: true },
    },
  };
  const SET_RANK = { 1: '初影', 2: '流光', 3: '玄华', 4: '赤霄' };
  const SET_TRAIL = { 1: 'cloud', 2: 'spark', 3: 'gold', 4: 'gold' };
  const SET_AURA = { 1: undefined, 2: 'cloud', 3: 'aurora', 4: 'gold' };
  for (const cid of ['c9', 'c10', 'c11', 'c12', 'c13']) {
    for (const t of ['mil', 'res', 'cla', 'cov']) {
      for (const k of C.COLS[cid][t] || []) {
        const [pre, tag] = k.split('_'), th = SET_THEMES[tag.slice(0, 2)], rkNum = +tag.slice(2) || 1, rk = SET_RANK[rkNum] || '';
        const head = th.heads[rkNum - 1] || th.heads[0];
        const robe = th.robes[rkNum - 1] || th.robes[0];
        const back = th.backs[rkNum - 1] || th.backs[0];
        C.FULL[k] = {
          char: PREFIX[pre],
          name: `${th.name}·${rk}`,
          look: { body: th.body, shade: th.shade, scarf: th.scarf, slash: th.slash, blade: th.blade, outline: th.outline, outlineA: 0.95 },
          deco: {
            head,
            hideBaseHead: head === 'foxmask' || head === 'voidhorns' || head === 'taotiehelm',
            gem: th.gem,
            band: th.scarf,
            hatC: th.breast,
            veilC: 'rgba(220,200,255,0.35)',
            mask: th.gem,
            helmC: th.shoulder,
            crest: th.scarf,
            plumeC: [th.scarf, th.gem],
            robe,
            breastplate: th.breast,
            shoulder: rkNum >= 2 ? th.shoulder : undefined,
            cape: rkNum >= 3 ? th.cape : undefined,
            back,
            trail: SET_TRAIL[rkNum],
            aura: SET_AURA[rkNum],
            weapStyle: HERO_WEAP_STYLE[pre] || 'renying_blade',
            transform: rkNum >= 3 ? 'awaken' : undefined,
          },
          fx: { ...th.fx },
          scene: JSON.parse(JSON.stringify(th.scene)),
        };
      }
    }
  }

  // ---------- 典藏至臻：天工传世 · 器灵纪（全 20 位侠客专属，各承一脉非遗国宝器艺，解锁攻守双境） ----------
  const HEIRLOOM_DEFS = {
    qf_porcelain: { char: 'qingfeng', name: '青花龙泉', relic: { craft: '元青花瓷', material: 'porcelain', title: '窑火胎骨 · 龙泉剑魄', sfx: 'porcelain', glyph: '瓷', stanceAtk: '青花裂锋', stanceDef: '釉玉守心' },
      look: { body: '#f2f6fb', shade: '#9db6d6', scarf: '#1e4fa3', slash: '58,124,230', blade: '#f7fbff', metal: '#d8b464', haft: '#1a3668', outline: '#122852', outlineA: 1 },
      deco: { head: 'jadepin', gem: '#2c6be0', robe: 'jade_master', robeC: '#1b3d7a', breastplate: '#2352a6', shoulder: '#d8b464', cape: '#162f60', back: 'flysword', trail: 'cloud', aura: 'cloud', weapStyle: 'relic_porcelain', relicMat: 'porcelain', relicGlyph: '瓷', transform: 'heirloom' },
      fx: { th: 'crystal', c: '64,132,235', c2: '242,248,255', relicMat: 'porcelain' },
      scene: { sky: ['#061024', '#10254a', '#26508e', '#0d1d3c'], orb: 'moon', orbC: '235,244,255', mist: '150,195,245', mtn: ['#1a3b6e', '#0f2548'], bam: ['#0a1830', '#050d1c'], wx: 'petal', wxC: '215,232,255', hit: 'enso', hitC: '64,132,235', stars: 0.55, rays: true } },
    fy_puppet: { char: 'feiying', name: '皮影千机', relic: { craft: '驴皮影戏', material: 'puppet', title: '烛火镂影 · 丝牵双刃', sfx: 'puppet', glyph: '影', stanceAtk: '剪影夺魂', stanceDef: '幕障藏锋' },
      look: { body: '#241410', shade: '#120806', scarf: '#e6552e', slash: '245,112,62', blade: '#ffe6b8', metal: '#d99a3e', haft: '#3b180e', outline: '#f5b85a', outlineA: 0.92 },
      deco: { head: 'foxmask', hideBaseHead: true, mask: '#f5b85a', gem: '#ff6438', robe: 'dark', robeC: '#2b120c', breastplate: '#7a2214', shoulder: '#c97828', cape: '#1a0a06', back: 'butterflywings', trail: 'ink', aura: 'smoke', weapStyle: 'relic_puppet', relicMat: 'puppet', relicGlyph: '影', transform: 'heirloom' },
      fx: { th: 'ink', c: '245,112,62', c2: '255,214,132', relicMat: 'puppet' },
      scene: { sky: ['#140804', '#38160c', '#7c3418', '#260e08'], orb: 'sun', orbC: '255,204,120', mist: '240,140,80', mtn: ['#36180d', '#1e0c06'], bam: ['#140704', '#0a0302'], wx: 'gold', wxC: '255,186,100', hit: 'inksplat', hitC: '245,112,62', stars: 0.25, rays: true } },
    ts_taotie: { char: 'tieshan', name: '后母饕餮', relic: { craft: '商周青铜', material: 'bronze', title: '铭文古鼎 · 饕餮镇岳', sfx: 'bronze', glyph: '鼎', stanceAtk: '饕餮噬锋', stanceDef: '玄鼎不动' },
      look: { body: '#2b4742', shade: '#162825', scarf: '#d4a64a', slash: '110,204,178', blade: '#76b8a4', metal: '#d4a64a', haft: '#1e322e', outline: '#6ac4aa', outlineA: 0.95 },
      deco: { head: 'taotiehelm', hideBaseHead: true, helmC: '#355c54', crest: '#e6b852', gem: '#78e6c8', robe: 'heavy', robeC: '#1f3833', breastplate: '#3f6c62', shoulder: '#d4a64a', cape: '#152622', back: 'chakra', trail: 'spark', aura: 'gold', weapStyle: 'relic_bronze', relicMat: 'bronze', relicGlyph: '鼎', transform: 'heirloom' },
      fx: { th: 'crystal', c: '108,208,180', c2: '230,186,88', relicMat: 'bronze' },
      scene: { sky: ['#071210', '#132a26', '#265048', '#0e201d'], orb: 'sun', orbC: '232,196,112', mist: '112,196,174', mtn: ['#1b3b35', '#0e221e'], bam: ['#0a1815', '#050d0b'], wx: 'gold', wxC: '225,190,104', hit: 'hexagon', hitC: '108,208,180', stars: 0.3, rays: true } },
    ls_celadon: { char: 'lingshuang', name: '汝窑天青', relic: { craft: '宋代汝窑', material: 'celadon', title: '雨过天青 · 冰裂长枪', sfx: 'porcelain', glyph: '汝', stanceAtk: '冰裂穿云', stanceDef: '天青止水' },
      look: { body: '#cfe6e4', shade: '#7fa8a8', scarf: '#f0cfa0', slash: '152,218,220', blade: '#e8faf8', metal: '#e0bc7a', haft: '#3f686b', outline: '#1e3e42', outlineA: 1 },
      deco: { head: 'valkyrie', gem: '#9ee8e4', robe: 'blizzard', robeC: '#588284', breastplate: '#7ca8aa', shoulder: '#e0bc7a', cape: '#3a5d60', back: 'icewings', trail: 'snow', aura: 'snow', weapStyle: 'relic_celadon', relicMat: 'celadon', relicGlyph: '汝', transform: 'heirloom' },
      fx: { th: 'frost', c: '152,222,224', c2: '245,226,184', relicMat: 'celadon' },
      scene: { sky: ['#071418', '#15343c', '#346872', '#122c32'], orb: 'moon', orbC: '228,248,248', mist: '160,215,218', mtn: ['#204a52', '#122c32'], bam: ['#0b1e22', '#061114'], wx: 'snow', wxC: '220,245,245', hit: 'snowflake', hitC: '152,222,224', stars: 0.5, rays: true } },
    ly_embroidery: { char: 'liuyun', name: '苏绣云锦', relic: { craft: '江南苏绣', material: 'silk', title: '金线双面 · 锦扇生风', sfx: 'silk', glyph: '绣', stanceAtk: '金针破锦', stanceDef: '云缎卸力' },
      look: { body: '#fbf2eb', shade: '#cfa39a', scarf: '#d94862', slash: '245,126,154', blade: '#fff5e6', metal: '#f0c464', haft: '#7a2434', outline: '#3c1420', outlineA: 1 },
      deco: { head: 'veilhat', hatC: '#a82a44', veilC: 'rgba(255,198,210,0.42)', gem: '#ffd278', robe: 'dusk', robeC: '#8a2238', breastplate: '#c9405c', shoulder: '#f0c464', cape: '#6e1a2e', back: 'koi', trail: 'cloud', aura: 'cloud', weapStyle: 'relic_embroidery', relicMat: 'silk', relicGlyph: '绣', transform: 'heirloom' },
      fx: { th: 'water', c: '245,126,154', c2: '255,216,136', part: 'petal', relicMat: 'silk' },
      scene: { sky: ['#160810', '#3a1426', '#782c4a', '#280e1c'], orb: 'moon', orbC: '255,232,226', mist: '245,155,175', mtn: ['#3c1628', '#220c18'], bam: ['#180812', '#0d040a'], wx: 'petal', wxC: '255,184,200', hit: 'ripple', hitC: '245,126,154', stars: 0.45, rays: true } },
    lm_cloisonne: { char: 'leiming', name: '景泰掐丝', relic: { craft: '景泰蓝珐琅', material: 'enamel', title: '金丝宝蓝 · 雷火珐琅', sfx: 'enamel', glyph: '蓝', stanceAtk: '掐丝奔雷', stanceDef: '宝蓝金钟' },
      look: { body: '#143878', shade: '#0a1c42', scarf: '#f5c242', slash: '82,172,255', blade: '#fff3c4', metal: '#f5c242', haft: '#0f2858', outline: '#ffd86b', outlineA: 0.95 },
      deco: { head: 'starguan', gem: '#38c8ff', robe: 'thunder', robeC: '#102e66', breastplate: '#1a4c9e', shoulder: '#f5c242', cape: '#0b2048', back: 'chakra', trail: 'spark', aura: 'gold', weapStyle: 'relic_cloisonne', relicMat: 'enamel', relicGlyph: '蓝', transform: 'heirloom' },
      fx: { th: 'thunder', c: '82,172,255', c2: '255,212,96', relicMat: 'enamel' },
      scene: { sky: ['#050c20', '#0e2252', '#1e4696', '#0a1a40'], orb: 'rift', orbC: '255,218,108', mist: '108,180,255', mtn: ['#122c62', '#0a1a3d'], bam: ['#07122a', '#040918'], wx: 'spark', wxC: '255,216,104', hit: 'bolt', hitC: '82,172,255', stars: 0.6, rays: true } },
    my_woodblock: { char: 'moyu', name: '雕版朱印', relic: { craft: '梨木雕版', material: 'woodblock', title: '梨木刻经 · 朱砂镇纸', sfx: 'woodblock', glyph: '印', stanceAtk: '朱砂判笔', stanceDef: '古卷镇印' },
      look: { body: '#f0e6d2', shade: '#b8a484', scarf: '#c82e24', slash: '220,62,50', blade: '#1e1612', metal: '#c82e24', haft: '#3e2618', outline: '#24140e', outlineA: 1 },
      deco: { head: 'bamboohat', hatC: '#4a2b1c', gem: '#e03e32', robe: 'jade_master', robeC: '#2b1b14', breastplate: '#7a221c', shoulder: '#c82e24', cape: '#1c120d', back: 'scroll', trail: 'ink', inkC: '198,46,36', aura: 'smoke', weapStyle: 'relic_woodblock', relicMat: 'woodblock', relicGlyph: '印', transform: 'heirloom' },
      fx: { th: 'ink', c: '220,62,50', c2: '28,20,16', relicMat: 'woodblock' },
      scene: { sky: ['#140c08', '#2e1a12', '#5c3020', '#20120c'], orb: 'bloodmoon', orbC: '235,84,68', mist: '220,160,130', mtn: ['#2c1810', '#180d08'], bam: ['#120a06', '#080402'], wx: 'ink', wxC: '80,28,22', hit: 'enso', hitC: '220,62,50', stars: 0.2, rays: true } },
    yh_liuli: { char: 'yuehua', name: '琉璃月华', relic: { craft: '药玉琉璃', material: 'liuli', title: '流光药玉 · 弦月琉璃', sfx: 'liuli', glyph: '琉', stanceAtk: '流光折月', stanceDef: '玉魄凝华' },
      look: { body: '#1f2b58', shade: '#0f1636', scarf: '#88f0ff', slash: '142,232,255', blade: '#f2fdff', metal: '#c4a2ff', haft: '#1a2450', outline: '#a6f4ff', outlineA: 0.92 },
      deco: { head: 'startiara', tiaraC: '#88f0ff', gem: '#e4b2ff', robe: 'starry', robeC: '#182452', breastplate: '#2c4688', shoulder: '#88f0ff', cape: '#121a3e', back: 'crescent', trail: 'star', aura: 'aurora', weapStyle: 'relic_liuli', relicMat: 'liuli', relicGlyph: '琉', transform: 'heirloom' },
      fx: { th: 'crystal', c: '142,232,255', c2: '220,174,255', relicMat: 'liuli' },
      scene: { sky: ['#05081a', '#101d48', '#254488', '#0c1638'], orb: 'moon', orbC: '225,248,255', mist: '150,218,255', mtn: ['#162c5e', '#0c1838'], bam: ['#081026', '#040814'], wx: 'twinkle', wxC: '210,242,255', hit: 'crescent', hitC: '142,232,255', stars: 0.9, rays: true } },
    yl_kingfisher: { char: 'yanling', name: '点翠金凤', relic: { craft: '宫廷点翠', material: 'kingfisher', title: '翠羽鎏金 · 凤翎穿风', sfx: 'feather', glyph: '翠', stanceAtk: '金凤掠羽', stanceDef: '翠幕回旋' },
      look: { body: '#0d4a58', shade: '#062630', scarf: '#f5c84c', slash: '46,216,212', blade: '#e8fffb', metal: '#f5c84c', haft: '#093440', outline: '#f5c84c', outlineA: 0.95 },
      deco: { head: 'plume', plumeC: ['#14c8c0', '#f5c84c'], gem: '#2ee6dc', robe: 'phoenix', robeC: '#0a3a46', breastplate: '#126474', shoulder: '#f5c84c', cape: '#082c36', back: 'peacock', trail: 'feather', featherC: '46,216,212', aura: 'gold', weapStyle: 'relic_kingfisher', relicMat: 'kingfisher', relicGlyph: '翠', transform: 'heirloom' },
      fx: { th: 'feather', c: '46,216,212', c2: '245,200,76', part: 'feather', relicMat: 'kingfisher' },
      scene: { sky: ['#041218', '#0a2e3a', '#165e6e', '#092630'], orb: 'sun', orbC: '255,224,126', mist: '80,212,208', mtn: ['#0f404c', '#08242c'], bam: ['#061a20', '#030e12'], wx: 'feather', wxC: '110,234,228', hit: 'feathers', hitC: '46,216,212', stars: 0.45, rays: true } },
    yx_guqin: { char: 'yuxiao', name: '古琴断纹', relic: { craft: '仲尼断纹琴', material: 'guqin', title: '蛇腹金徽 · 广陵清商', sfx: 'guqin', glyph: '琴', stanceAtk: '十面杀伐', stanceDef: '流水清心' },
      look: { body: '#2c1e16', shade: '#160e0a', scarf: '#e6c278', slash: '238,198,118', blade: '#f8eed8', metal: '#e6c278', haft: '#3c261a', outline: '#e6c278', outlineA: 0.9 },
      deco: { head: 'jadepin', gem: '#e6c278', robe: 'celestial', robeC: '#241812', breastplate: '#6a4a2a', shoulder: '#d8b060', cape: '#1a110c', back: 'notering', trail: 'gold', aura: 'gold', weapStyle: 'relic_guqin', relicMat: 'guqin', relicGlyph: '琴', transform: 'heirloom' },
      fx: { th: 'note', c: '238,198,118', c2: '255,244,214', part: 'note', relicMat: 'guqin' },
      scene: { sky: ['#120c08', '#2a1c12', '#5c3e24', '#1e140c'], orb: 'moon', orbC: '252,232,188', mist: '225,190,130', mtn: ['#322216', '#1c120b'], bam: ['#120c08', '#090604'], wx: 'gold', wxC: '240,206,132', hit: 'sunburst', hitC: '238,198,118', stars: 0.4, rays: true } },
    zx_sancai: { char: 'zuixian', name: '唐三彩釉', relic: { craft: '盛唐三彩', material: 'sancai', title: '流釉琥珀 · 醉卧长安', sfx: 'porcelain', glyph: '彩', stanceAtk: '琥珀醉拳', stanceDef: '翠釉化劲' },
      look: { body: '#f5ecd8', shade: '#c4a672', scarf: '#2e9e66', slash: '242,162,56', blade: '#fff6e0', metal: '#e89a2c', haft: '#7a4a18', outline: '#2e1e0e', outlineA: 1 },
      deco: { head: 'veilhat', hatC: '#c4721c', veilC: 'rgba(110,214,154,0.34)', gem: '#2e9e66', robe: 'dusk', robeC: '#a8621c', breastplate: '#2e8a5a', shoulder: '#e89a2c', cape: '#6e3e12', back: 'gourdback', trail: 'gold', aura: 'cloud', weapStyle: 'relic_sancai', relicMat: 'sancai', relicGlyph: '彩', transform: 'heirloom' },
      fx: { th: 'water', c: '242,162,56', c2: '72,196,132', relicMat: 'sancai' },
      scene: { sky: ['#161006', '#3a2810', '#7e5620', '#2a1c0a'], orb: 'sun', orbC: '255,222,148', mist: '225,186,120', mtn: ['#3a2c14', '#22180a'], bam: ['#141008', '#0a0804'], wx: 'gold', wxC: '245,190,96', hit: 'swirl', hitC: '242,162,56', stars: 0.3, rays: true } },
    gc_kintsugi: { char: 'gouchen', name: '金缮大漆', relic: { craft: '大漆金缮', material: 'kintsugi', title: '玄漆裂金 · 碎玉重铸', sfx: 'kintsugi', glyph: '缮', stanceAtk: '裂金崩岳', stanceDef: '玄漆不坏' },
      look: { body: '#1a1618', shade: '#0b090a', scarf: '#f4c542', slash: '248,198,66', blade: '#2a2220', metal: '#f4c542', haft: '#141012', outline: '#f4c542', outlineA: 0.96 },
      deco: { head: 'voidhorns', hideBaseHead: true, gem: '#ffcf48', robe: 'dark', robeC: '#161214', breastplate: '#261e20', shoulder: '#f4c542', cape: '#120e10', back: 'crystals', trail: 'gold', aura: 'gold', weapStyle: 'relic_kintsugi', relicMat: 'kintsugi', relicGlyph: '缮', transform: 'heirloom' },
      fx: { th: 'crystal', c: '248,198,66', c2: '255,240,180', relicMat: 'kintsugi' },
      scene: { sky: ['#0a0808', '#1e1612', '#42301c', '#16100c'], orb: 'bloodmoon', orbC: '248,200,76', mist: '215,176,92', mtn: ['#241a12', '#120d08'], bam: ['#0c0806', '#060403'], wx: 'gold', wxC: '248,202,82', hit: 'hexagon', hitC: '248,198,66', stars: 0.45, rays: true } },
    lq_papercut: { char: 'lingque', name: '蔚县剪纸', relic: { craft: '蔚县窗花', material: 'papercut', title: '朱红镂空 · 飞雀剪风', sfx: 'paper', glyph: '剪', stanceAtk: '飞剪断影', stanceDef: '纸蝶化形' },
      look: { body: '#fff6ee', shade: '#e0b8b0', scarf: '#e62e2d', slash: '245,62,62', blade: '#ffebe8', metal: '#f5c24a', haft: '#8e1818', outline: '#b81a1a', outlineA: 1 },
      deco: { head: 'plume', plumeC: ['#e62e2d', '#f5c24a'], gem: '#ff4242', robe: 'phoenix', robeC: '#b81c1c', breastplate: '#d82828', shoulder: '#f5c24a', cape: '#8a1414', back: 'butterflywings', trail: 'feather', featherC: '245,62,62', aura: 'cloud', weapStyle: 'relic_papercut', relicMat: 'papercut', relicGlyph: '剪', transform: 'heirloom' },
      fx: { th: 'feather', c: '245,62,62', c2: '255,214,112', part: 'butterfly', relicMat: 'papercut' },
      scene: { sky: ['#180606', '#441010', '#8c2020', '#2e0a0a'], orb: 'sun', orbC: '255,214,132', mist: '255,120,110', mtn: ['#441212', '#260808'], bam: ['#180606', '#0c0303'], wx: 'petal', wxC: '255,108,108', hit: 'feathers', hitC: '245,62,62', stars: 0.35, rays: true } },
    li_screen: { char: 'liying', name: '金箔屏风', relic: { craft: '金箔漆屏', material: 'goldleaf', title: '折屏藏刃 · 鎏金离影', sfx: 'goldleaf', glyph: '屏', stanceAtk: '金屏裂影', stanceDef: '折光避锋' },
      look: { body: '#241e14', shade: '#120e08', scarf: '#ffd65c', slash: '255,214,92', blade: '#fff6d0', metal: '#ffd65c', haft: '#382a14', outline: '#ffd65c', outlineA: 0.94 },
      deco: { head: 'foxmask', hideBaseHead: true, mask: '#ffd65c', gem: '#fff0a8', robe: 'spirit', robeC: '#2c2212', breastplate: '#8c6824', shoulder: '#ffd65c', cape: '#1c150a', back: 'crescent', trail: 'gold', aura: 'gold', weapStyle: 'relic_screen', relicMat: 'goldleaf', relicGlyph: '屏', transform: 'heirloom' },
      fx: { th: 'star', c: '255,214,92', c2: '255,248,214', relicMat: 'goldleaf' },
      scene: { sky: ['#120e06', '#322610', '#6e521e', '#241a0a'], orb: 'sun', orbC: '255,232,148', mist: '245,208,118', mtn: ['#362812', '#1e1608'], bam: ['#140e06', '#0a0703'], wx: 'gold', wxC: '255,222,126', hit: 'crescent', hitC: '255,214,92', stars: 0.6, rays: true } },
    cx_compass: { char: 'cixian', name: '司南浑仪', relic: { craft: '磁石司南', material: 'compass', title: '玄磁勺盘 · 阴阳定向', sfx: 'bronze', glyph: '磁', stanceAtk: '磁极裂阵', stanceDef: '司南定乾' },
      look: { body: '#1e2838', shade: '#0e1420', scarf: '#58d8ff', slash: '96,218,255', blade: '#dff8ff', metal: '#e2b862', haft: '#1a2434', outline: '#78e0ff', outlineA: 0.92 },
      deco: { head: 'circlet', gem: '#58d8ff', robe: 'starry', robeC: '#162030', breastplate: '#2e4662', shoulder: '#e2b862', cape: '#101824', back: 'zodiac', sign: 'aqu', zt: 3, zc: '96,218,255', zc2: '226,184,98', trail: 'spark', aura: 'aurora', weapStyle: 'relic_compass', relicMat: 'compass', relicGlyph: '磁', transform: 'heirloom' },
      fx: { th: 'nebula', c: '96,218,255', c2: '226,184,98', relicMat: 'compass' },
      scene: { sky: ['#050c18', '#0e2038', '#1e446c', '#0b182a'], orb: 'galaxy', orbC: '132,226,255', mist: '112,196,238', mtn: ['#142c48', '#0a182a'], bam: ['#071220', '#030a12'], wx: 'spark', wxC: '150,232,255', hit: 'swirl', hitC: '96,218,255', stars: 0.85, rays: true } },
    qj_marionette: { char: 'qianji', name: '提线榫卯', relic: { craft: '鲁班榫卯', material: 'woodblock', title: '紫檀榫卯 · 机丝连环', sfx: 'woodblock', glyph: '榫', stanceAtk: '连环机括', stanceDef: '榫合铁壁' },
      look: { body: '#4a2b1e', shade: '#26140c', scarf: '#f0b858', slash: '240,184,88', blade: '#fae6c0', metal: '#e0a642', haft: '#361c12', outline: '#f0b858', outlineA: 0.9 },
      deco: { head: 'headband', band: '#f0b858', gem: '#ffcf70', robe: 'heavy', robeC: '#3a2016', breastplate: '#6a3c26', shoulder: '#e0a642', cape: '#28140e', back: 'chakra', trail: 'spark', aura: 'gold', weapStyle: 'relic_marionette', relicMat: 'woodblock', relicGlyph: '榫', transform: 'heirloom' },
      fx: { th: 'star', c: '240,184,88', c2: '180,120,64', relicMat: 'woodblock' },
      scene: { sky: ['#120a06', '#2e1a10', '#603820', '#20120a'], orb: 'sun', orbC: '245,204,126', mist: '220,164,108', mtn: ['#341e12', '#1c1008'], bam: ['#120a06', '#080402'], wx: 'spark', wxC: '245,196,104', hit: 'hexagon', hitC: '240,184,88', stars: 0.35, rays: true } },
    ch_ironfire: { char: 'chixiao', name: '打铁熔星', relic: { craft: '非遗打铁花', material: 'ironfire', title: '千度铁水 · 星雨焚天', sfx: 'ironfire', glyph: '熔', stanceAtk: '铁花焚空', stanceDef: '熔炉护体' },
      look: { body: '#281412', shade: '#120808', scarf: '#ff7a22', slash: '255,126,38', blade: '#fff0c2', metal: '#ff9632', haft: '#3c1810', outline: '#ffa842', outlineA: 0.96 },
      deco: { head: 'voidhorns', hideBaseHead: true, gem: '#ff9632', robe: 'thunder', robeC: '#24100e', breastplate: '#6a2214', shoulder: '#ff7a22', cape: '#1a0a08', back: 'chakra', trail: 'spark', aura: 'gold', weapStyle: 'relic_ironfire', relicMat: 'ironfire', relicGlyph: '熔', transform: 'heirloom' },
      fx: { th: 'thunder', c: '255,126,38', c2: '255,236,160', relicMat: 'ironfire' },
      scene: { sky: ['#120604', '#361208', '#7c2a10', '#260c06'], orb: 'bloodmoon', orbC: '255,152,64', mist: '255,134,58', mtn: ['#38140a', '#1e0a04'], bam: ['#140604', '#080302'], wx: 'spark', wxC: '255,198,96', hit: 'sunburst', hitC: '255,126,38', stars: 0.7, rays: true } },
    xj_armillary: { char: 'xuanji', name: '浑天玑衡', relic: { craft: '张衡浑天仪', material: 'armillary', title: '三环玑衡 · 璇玑演星', sfx: 'bronze', glyph: '浑', stanceAtk: '星轨贯日', stanceDef: '天仪护周' },
      look: { body: '#181e3a', shade: '#0a0e20', scarf: '#f2c864', slash: '242,200,100', blade: '#fff8de', metal: '#f2c864', haft: '#141a32', outline: '#f2c864', outlineA: 0.94 },
      deco: { head: 'startiara', tiaraC: '#f2c864', gem: '#92b8ff', robe: 'celestial', robeC: '#141a34', breastplate: '#3a4678', shoulder: '#f2c864', cape: '#0e1226', back: 'galaxy', trail: 'star', aura: 'aurora', weapStyle: 'relic_armillary', relicMat: 'armillary', relicGlyph: '浑', transform: 'heirloom' },
      fx: { th: 'nebula', c: '242,200,100', c2: '132,178,255', part: 'twinkle', relicMat: 'armillary' },
      scene: { sky: ['#040614', '#0e1638', '#22306a', '#0a1028'], orb: 'galaxy', orbC: '248,216,136', mist: '165,190,255', mtn: ['#16204a', '#0c122c'], bam: ['#080c1e', '#040610'], wx: 'twinkle', wxC: '248,224,158', hit: 'starburst', hitC: '242,200,100', stars: 1, rays: true } },
    ql_dunhuang: { char: 'qingluan', name: '敦煌飞天', relic: { craft: '莫高窟壁画', material: 'dunhuang', title: '石青金箔 · 飞天伎乐', sfx: 'guqin', glyph: '煌', stanceAtk: '琵琶破阵', stanceDef: '藻井慈光' },
      look: { body: '#f4e4cc', shade: '#c29c72', scarf: '#28889e', slash: '68,186,204', blade: '#fff2d2', metal: '#eab84a', haft: '#7a4222', outline: '#3c1e12', outlineA: 1 },
      deco: { head: 'startiara', tiaraC: '#eab84a', gem: '#28a4b8', robe: 'celestial', robeC: '#1e6478', breastplate: '#c86832', shoulder: '#eab84a', cape: '#184e5e', back: 'notering', trail: 'gold', aura: 'gold', weapStyle: 'relic_dunhuang', relicMat: 'dunhuang', relicGlyph: '煌', transform: 'heirloom' },
      fx: { th: 'note', c: '68,186,204', c2: '245,196,86', part: 'petal', relicMat: 'dunhuang' },
      scene: { sky: ['#160e08', '#3c2614', '#86582a', '#2c1c0e'], orb: 'sun', orbC: '255,224,142', mist: '220,178,120', mtn: ['#4a3018', '#2a1a0c'], bam: ['#181008', '#0e0804'], wx: 'gold', wxC: '255,216,124', hit: 'sunburst', hitC: '245,196,86', stars: 0.45, rays: true } },
    xw_cinnabar: { char: 'xuanwu', name: '剔红镇岳', relic: { craft: '宫廷剔红漆', material: 'cinnabar', title: '百层雕漆 · 玄龟镇岳', sfx: 'cinnabar', glyph: '漆', stanceAtk: '雕漆重压', stanceDef: '百层玄甲' },
      look: { body: '#7c1816', shade: '#420a0a', scarf: '#f0c458', slash: '232,68,58', blade: '#f8dfd4', metal: '#f0c458', haft: '#380a08', outline: '#f0c458', outlineA: 0.94 },
      deco: { head: 'taotiehelm', hideBaseHead: true, helmC: '#8e1c1a', crest: '#f0c458', gem: '#ff5242', robe: 'heavy', robeC: '#641210', breastplate: '#9e221e', shoulder: '#f0c458', cape: '#4a0c0a', back: 'crystals', trail: 'gold', aura: 'gold', weapStyle: 'relic_cinnabar', relicMat: 'cinnabar', relicGlyph: '漆', transform: 'heirloom' },
      fx: { th: 'ink', c: '232,68,58', c2: '242,196,88', relicMat: 'cinnabar' },
      scene: { sky: ['#160606', '#3e0e0c', '#821c18', '#2a0808'], orb: 'bloodmoon', orbC: '255,140,104', mist: '228,108,92', mtn: ['#42100e', '#240808'], bam: ['#160606', '#0c0303'], wx: 'gold', wxC: '245,200,96', hit: 'hexagon', hitC: '232,68,58', stars: 0.35, rays: true } },
  };
  for (const [k, def] of Object.entries(HEIRLOOM_DEFS)) {
    C.FULL[k] = { ...def, heirloom: true, stOnly: true };
  }

  /* ---------- 价格 ---------- */
  // 系统只给自己卖的东西定价：武器箱、货郎（商店固定价格）和货郎报的那一件。
  // 饰品在玩家市场上卖多少钱全由玩家定，系统不定价、不收购，所以也没有“市场价”。
  C.ST_MUL = t => t === 'gold' ? 1.4 : 1.75;   // 货郎报斩数版时贵多少
  C.refVal = it => {   // 一件饰品的基准价：只用来定货郎的报价
    const d = C.ITEM[it.k]; if (!d) return 0;
    const base = C.isHeirloom(it.k) ? 12000 : C.BASE[d.tier];
    return Math.max(2, Math.round(base * d.mul * (it.st >= 0 ? C.ST_MUL(d.tier) : 1)));
  };
  C.GOODS = [...C.CASES, 'term'];              // 武器箱和货郎：只在商店卖，不能挂到市场
  C.isGood = k => C.GOODS.includes(k);
  C.shopPrice = (k, cfg) => k === 'term' ? C.cv(cfg, 'price.term') : own(C.COLS, k) ? C.cv(cfg, 'price.' + k) : 0;
  C.net = (p, cfg) => Math.floor(p * (1 - C.cv(cfg, 'fee')));    // 挂单卖掉，卖家到手多少
  const LID_RE = /^[0-9a-f]{16}$/;
  C.isLid = l => typeof l === 'string' && LID_RE.test(l);   // 挂单编号：服务器随机给的 16 位

