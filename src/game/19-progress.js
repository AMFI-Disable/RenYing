// ======================= 成长系统：墨锭、任务、皮肤、排位 =======================
const RAR_NAME = { starter: '初始', common: '普通', rare: '稀有', legend: '传说' };
const RAR_RGB = { starter: '190,190,205', common: '159,177,201', rare: '111,168,255', legend: '233,196,106' };
// 皮肤的稀有度颜色：武器箱里的饰品照武库的五档（军规级、受限、保密、隐秘、非凡），不在武器箱里的（比如青锋行）照原来的稀有 / 传说
function skinGrade(k) {
  const S = SKINS[k], C = window.ArmoryCore, it = S && C && C.ITEM[k];
  if (it) return { t: it.tier, n: C.TIER[it.tier].n, c: C.TIER[it.tier].c };
  if (k === 'qf_qfx') return { t: 'gold', n: '★ 非凡', c: '228,174,57' };
  return { t: S ? S.rarity : 'rare', n: RAR_NAME[S && S.rarity] || '稀有', c: RAR_RGB[S && S.rarity] || RAR_RGB.rare };
}
// 统一品质综合权重：用于由低到高（最差到最好）排序及自动穿戴最高品质
// 军规级 10 -> 受限/稀有 20 -> 保密/普通传说 30 -> 隐秘/顶级传说 40 -> ★ 非凡卓越 50
function skinWeight(k) {
  if (!k) return 0;
  const C = window.ArmoryCore, it = C && C.ITEM && C.ITEM[k];
  if (it) {
    const tm = { mil: 10, res: 20, cla: 30, cov: 40, gold: 50 };
    return tm[it.tier] || 10;
  }
  const S = SKINS[k];
  if (S) {
    if (k === 'qf_qfx') return 50;
    if (S.rarity === 'legend') return 35;
    if (S.rarity === 'rare') return 20;
  }
  return 10;
}
const CHAR_RARITY = { yuxiao: 'legend', zuixian: 'rare', gouchen: 'rare', lingque: 'rare', qingfeng: 'starter', tieshan: 'common', leiming: 'common', feiying: 'rare', liuyun: 'rare', lingshuang: 'rare', moyu: 'legend', yuehua: 'legend', yanling: 'legend' };
function getWeeklyRotation() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  const weekKey = `${d.getUTCFullYear()}-W${weekNo}`;
  const nonStarters = CHARS.map(c => c.id).filter(id => id !== 'qingfeng');
  let seed = 0;
  for (let i = 0; i < weekKey.length; i++) seed = (seed * 31 + weekKey.charCodeAt(i)) >>> 0;
  const list = [...nonStarters];
  const result = [];
  for (let i = 0; i < 3 && list.length; i++) {
    seed = (seed * 9301 + 49297) % 233280;
    const idx = Math.floor((seed / 233280) * list.length);
    result.push(list.splice(idx, 1)[0]);
  }
  return result;
}
const SKINS = {
  qf_frost: { char: 'qingfeng', rarity: 'rare', name: '烟雨', look: { body: '#eef4f2', shade: '#86a29e', scarf: '#4f8a96', slash: '140,205,215', blade: '#f2fbff' }, deco: { head: 'jadepin', dress: ['#e4efed', '#3d6870'], sash: '#2f5a56', back: 'umbrella', weapStyle: 'rain_sword' }, fx: { th: 'rain', c: '150,210,225', c2: '230,248,255' } },
  qf_gold: { char: 'qingfeng', rarity: 'legend', name: '金乌', look: { body: '#fff3d2', shade: '#c9a45a', scarf: '#ffb62e', slash: '255,196,90', blade: '#fff3cf' }, deco: { head: 'crown', robe: 'gold', breastplate: '#ffd966', shoulder: '#d4af37', back: 'crowwings', trail: 'ember', aura: 'ember', weapStyle: 'sun_sword' }, fx: { th: 'flame', c: '255,175,60', c2: '255,80,20' } },
  qf_abyss: { char: 'qingfeng', rarity: 'legend', name: '幽渊', look: { body: '#241a3a', shade: '#10081c', scarf: '#9b51e0', slash: '160,80,240', blade: '#f3e8ff' }, deco: { head: 'voidhorns', gem: '#bd7bfa', robe: 'dark', shoulder: '#3d2060', back: 'voidshards', trail: 'smoke', aura: 'smoke', weapStyle: 'abyss_blade' }, fx: { th: 'void', c: '175,95,255', c2: '34,8,64' } },
  fy_jade: { char: 'feiying', rarity: 'rare', name: '碧影', look: { scarf: '#2bd49a', slash: '90,230,170', blade: '#dffff2' }, deco: { head: 'jadevisor', hideBaseHead: true, mask: '#2bd49a', robe: 'leaf', shoulder: '#1f8f68', trail: 'leaf', weapStyle: 'jade_daggers' }, fx: { th: 'leaf', c: '90,220,160' } },
  fy_blood: { char: 'feiying', rarity: 'legend', name: '血月', look: { body: '#3a1420', shade: '#1a080e', scarf: '#ff2a3d', slash: '255,60,80', blade: '#ffd9dd' }, deco: { head: 'horns', hideBaseHead: true, hornC: '#2a0a10', robe: 'crimson', breastplate: '#4a121c', back: 'crescent', trail: 'smoke', aura: 'smoke', weapStyle: 'blood_scythes' }, fx: { th: 'void', c: '255,45,65', c2: '60,0,12' } },
  fy_phantom: { char: 'feiying', rarity: 'legend', name: '幻灵', look: { body: '#f0faff', shade: '#7faac6', scarf: '#00f2fe', slash: '0,242,254', blade: '#e0ffff' }, deco: { head: 'foxmask', hideBaseHead: true, mask: '#00f2fe', robe: 'spirit', shoulder: '#2888aa', back: 'foxtails', cape: '#1b4d6b', trail: 'snow', aura: 'aurora', weapStyle: 'phantom_kunai' }, fx: { th: 'aurora', c: '0,235,255', c2: '170,120,255' } },
  ts_bronze: { char: 'tieshan', rarity: 'rare', name: '青铜', look: { body: '#c9a26b', shade: '#7a5a34', scarf: '#3fa37a', slash: '120,210,170' }, deco: { head: 'taotiehelm', hideBaseHead: true, helmC: '#a8804a', crest: '#3fa37a', shoulder: '#8a6a3a', breastplate: '#7a5a34', robe: 'bronze', weapStyle: 'bronze_cleaver' }, fx: { th: 'metal', c: '150,230,190' } },
  ts_obsidian: { char: 'tieshan', rarity: 'legend', name: '玄武', look: { body: '#34303e', shade: '#18161e', scarf: '#6a5cff', slash: '140,120,255', blade: '#d8d4ff' }, deco: { head: 'horns', hideBaseHead: true, hornC: '#1a1822', robe: 'heavy', breastplate: '#2e2642', back: 'shell', shoulder: '#2a2632', aura: 'smoke', weapStyle: 'obsidian_slab' }, fx: { th: 'water', c: '110,135,255', c2: '200,215,255' } },
  ts_crimson: { char: 'tieshan', rarity: 'legend', name: '修罗', look: { body: '#3a1616', shade: '#1c0808', scarf: '#ff3a30', slash: '255,50,60', blade: '#ffd8d8' }, deco: { head: 'asuramask', hideBaseHead: true, helmC: '#4a1212', crest: '#ff3a30', shoulder: '#5a1a1a', breastplate: '#501414', robe: 'shura', back: 'flamebanners', trail: 'ember', aura: 'ember', weapStyle: 'shura_blade' }, fx: { th: 'flame', c: '255,95,40', c2: '170,10,0' } },
  ls_plum: { char: 'lingshuang', rarity: 'rare', name: '红梅', look: { body: '#fdf3f4', shade: '#c7909b', scarf: '#d8344f', slash: '255,120,145', blade: '#fff4f6' }, deco: { head: 'plumpin', dress: ['#fff1f3', '#b8243f'], sash: '#e9c46a', shawl: '255,175,195', weapStyle: 'plum_spear' }, fx: { th: 'petal', c: '255,120,150' } },
  ls_aurora: { char: 'lingshuang', rarity: 'legend', name: '极光', look: { body: '#dff8f4', shade: '#7fb7c0', scarf: '#5ef2c9', slash: '120,255,210', blade: '#e9fffa' }, deco: { head: 'valkyrie', gem: '#7dffd8', robe: 'aurora', breastplate: '#4aa090', back: 'aurora', trail: 'snow', aura: 'aurora', weapStyle: 'aurora_lance' }, fx: { th: 'aurora', c: '110,255,205', c2: '170,120,255' } },
  ls_dragon: { char: 'lingshuang', rarity: 'legend', name: '沧龙', look: { body: '#d6edff', shade: '#4d82b8', scarf: '#1f90ff', slash: '40,150,255', blade: '#e6f3ff' }, deco: { head: 'dragonhorns', gem: '#1f90ff', robe: 'ocean', breastplate: '#205080', back: 'dragon', cape: '#103a66', trail: 'snow', aura: 'cloud', weapStyle: 'dragon_spear' }, fx: { th: 'water', c: '70,170,255', c2: '210,240,255' } },
  ly_dusk: { char: 'liuyun', rarity: 'rare', name: '晚霞', look: { scarf: '#ff8a4a', slash: '255,160,100' }, deco: { head: 'veilhat', hatC: '#c97a46', veilC: 'rgba(255,140,85,0.42)', robe: 'dusk', cape: '#c8602a', trail: 'leaf', leaf: '255,150,80', weapStyle: 'dusk_fan' }, fx: { th: 'leaf', c: '255,140,70' } },
  ly_sky: { char: 'liuyun', rarity: 'legend', name: '天青', look: { body: '#eaf6ff', shade: '#8fb4d6', scarf: '#56b8ff', slash: '130,200,255', blade: '#f0faff' }, deco: { head: 'plume', plumeC: ['#ffffff', '#bfe2ff'], robe: 'celestial', breastplate: '#6ba0cc', back: 'pibo', trail: 'feather', aura: 'cloud', weapStyle: 'feather_fan' }, fx: { th: 'wind', c: '150,210,255', c2: '245,250,255', part: 'feather' } },
  ly_bamboo: { char: 'liuyun', rarity: 'rare', name: '墨竹', look: { body: '#f0f2eb', shade: '#7d8a74', scarf: '#4e7850', slash: '80,180,120', blade: '#eef6f0' }, deco: { head: 'bamboohat', hatC: '#426b44', robe: 'bamboo', shoulder: '#3e6040', cape: '#2d4730', trail: 'leaf', leaf: '80,180,120', weapStyle: 'bamboo_fan' }, fx: { th: 'leaf', c: '100,190,120' } },
  ly_fox: { char: 'liuyun', rarity: 'legend', name: '狐火', look: { body: '#fbf6ee', shade: '#c9a590', scarf: '#ff4a2a', slash: '255,120,70', blade: '#fff1e6' }, deco: { head: 'foxears', hideBaseHead: true, robe: 'foxfire', back: 'kitsunetails', trail: 'ember', aura: 'ember', weapStyle: 'fox_fan' }, fx: { th: 'flame', c: '255,120,60', c2: '255,225,190' } },
  lm_violet: { char: 'leiming', rarity: 'rare', name: '紫电', look: { scarf: '#9a5cff', slash: '185,140,255' }, deco: { head: 'headband', band: '#9a5cff', robe: 'thunder', shoulder: '#5a30a0', trail: 'spark', weapStyle: 'violet_gauntlet' }, fx: { th: 'thunder', c: '190,150,255' } },
  lm_sun: { char: 'leiming', rarity: 'legend', name: '烈阳', look: { body: '#ffe7c2', shade: '#d08a3a', scarf: '#ff6a1a', slash: '255,150,60', blade: '#fff0dc' }, deco: { head: 'crown', robe: 'solar', breastplate: '#b86a20', back: 'flamemane', trail: 'ember', aura: 'ember', weapStyle: 'sun_gauntlet' }, fx: { th: 'flame', c: '255,160,50', c2: '255,60,10' } },
  lm_asura: { char: 'leiming', rarity: 'legend', name: '金刚', look: { body: '#3c1808', shade: '#1c0a02', scarf: '#ffaa00', slash: '255,180,40', blade: '#fff2d0' }, deco: { head: 'headband', band: '#ffaa00', robe: 'vajra', breastplate: '#6a3210', back: 'chakra', shoulder: '#6a3210', trail: 'gold', aura: 'gold', weapStyle: 'vajra_gauntlet' }, fx: { th: 'thunder', c: '255,205,70', c2: '255,250,220' } },
  my_cinnabar: { char: 'moyu', rarity: 'rare', name: '朱砂', look: { scarf: '#c8321e', slash: '230,80,60' }, deco: { head: 'talismanhat', hideBaseHead: true, hatC: '#6b1c14', robe: 'cinnabar', shoulder: '#781c10', trail: 'ink', inkC: '200,50,30', weapStyle: 'cinnabar_brush' }, fx: { th: 'ink', c: '230,70,50', c2: '120,16,10' } },
  my_gold: { char: 'moyu', rarity: 'legend', name: '泥金', look: { body: '#f5ead0', shade: '#b39a5c', scarf: '#d8b04a', slash: '235,200,110', blade: '#fff4d6' }, deco: { head: 'hood', hideBaseHead: true, hoodC: '#6a5220', robe: 'gilt', breastplate: '#8a6a20', back: 'lotus', lotusC: '233,196,106', trail: 'gold', aura: 'gold', weapStyle: 'gold_brush' }, fx: { th: 'gold', c: '245,205,105', c2: '255,245,200' } },
  my_celestial: { char: 'moyu', rarity: 'legend', name: '星墨', look: { body: '#141c36', shade: '#0a0d1c', scarf: '#4facfe', slash: '79,172,254', blade: '#dcf4ff' }, deco: { head: 'starguan', hideBaseHead: true, robe: 'starry', breastplate: '#183060', back: 'constellation', lotusC: '90,190,255', cape: '#102444', trail: 'spark', aura: 'aurora', weapStyle: 'star_brush' }, fx: { th: 'star', c: '120,190,255', c2: '8,14,40' } },
  yh_sakura: { char: 'yuehua', rarity: 'rare', name: '樱月', look: { scarf: '#ff9ec4', slash: '255,170,210', blade: '#fff0f6' }, deco: { head: 'sakurabranch', flower: '#ff9ec4', robe: 'sakura', shoulder: '#a04870', trail: 'petal', petal: '255,180,210', weapStyle: 'sakura_moon' }, fx: { th: 'petal', c: '255,170,200' } },
  yh_eclipse: { char: 'yuehua', rarity: 'legend', name: '月蚀', look: { body: '#2c2238', shade: '#140e1c', scarf: '#c13a4a', slash: '230,90,110', blade: '#ffd8de' }, deco: { head: 'hood', hideBaseHead: true, hoodC: '#1c1024', robe: 'eclipse', breastplate: '#381622', back: 'tattered', trail: 'smoke', aura: 'smoke', weapStyle: 'eclipse_moon' }, fx: { th: 'void', c: '255,95,115', c2: '26,4,14' } },
  yh_solstice: { char: 'yuehua', rarity: 'legend', name: '霜华', look: { body: '#f2f8ff', shade: '#95b5db', scarf: '#80d0ff', slash: '130,215,255', blade: '#f4faff' }, deco: { head: 'frosttiara', flower: '#a8e0ff', robe: 'snow', breastplate: '#4878a8', back: 'icewings', cape: '#2a5078', trail: 'snow', aura: 'snow', weapStyle: 'frost_moon' }, fx: { th: 'frost', c: '150,220,255', c2: '235,248,255' } },
  yl_raven: { char: 'yanling', rarity: 'rare', name: '玄羽', look: { body: '#2c2c36', shade: '#14141a', scarf: '#8a8aa6', slash: '170,170,200', blade: '#e0e0ee' }, deco: { head: 'ravencowl', hideBaseHead: true, hoodC: '#16161e', robe: 'raven', shoulder: '#20202a', trail: 'feather', featherC: '40,40,55', weapStyle: 'raven_feather' }, fx: { th: 'feather', c: '120,120,150' } },
  qf_qfx: { char: 'qingfeng', rarity: 'legend', name: '青锋行', exclusive: true, look: { body: '#f6f2e8', shade: '#9db3aa', scarf: '#c8321e', slash: '120,220,190', blade: '#eafff8' }, deco: { head: 'headband', band: '#c8321e', robe: 'jade_master', breastplate: '#2e5a4e', back: 'flysword', trail: 'leaf', leaf: '150,235,200', aura: 'cloud', weapStyle: 'qfx_sword' }, fx: { th: 'ink', c: '120,225,190', c2: '18,24,22' } },
  yx_snow: { char: 'yuxiao', rarity: 'rare', name: '雪箫', look: { body: '#f4f8fb', shade: '#a8bccb', scarf: '#9fd8ff', slash: '170,220,255', blade: '#eef8ff' }, deco: { head: 'frosttiara', robe: 'snow', shoulder: '#7ca8cc', back: 'snowflake', trail: 'snow', weapStyle: 'snow_flute' }, fx: { th: 'frost', c: '170,225,255', c2: '230,245,255' } },
  yx_celestial: { char: 'yuxiao', rarity: 'legend', name: '钧天', look: { body: '#fff8e7', shade: '#c7a66b', scarf: '#ffd166', slash: '255,215,110', blade: '#fff6d6' }, deco: { head: 'starguan', robe: 'gold', breastplate: '#c99a3e', back: 'bells', trail: 'gold', aura: 'gold', weapStyle: 'bell_flute' }, fx: { th: 'gold', c: '255,210,100', c2: '255,250,220' } },
  zx_amber: { char: 'zuixian', rarity: 'rare', name: '琥珀', look: { body: '#d9b46a', shade: '#9a7230', scarf: '#a0302a', slash: '255,190,90', blade: '#ffe8b8' }, deco: { head: 'gourdcrown', robe: 'solar', shoulder: '#8a5820', trail: 'ember', weapStyle: 'amber_gourd' }, fx: { th: 'flame', c: '255,175,70', c2: '220,90,20' } },
  zx_immortal: { char: 'zuixian', rarity: 'legend', name: '酒剑仙', look: { body: '#e6f9ff', shade: '#78b0c8', scarf: '#38e8ff', slash: '90,235,255', blade: '#eaffff' }, deco: { head: 'plume', plumeC: ['#e0ffff', '#56d8ff'], robe: 'jade_master', breastplate: '#2a6f82', back: 'gourdback', trail: 'cloud', aura: 'cloud', weapStyle: 'jade_gourd' }, fx: { th: 'water', c: '90,230,255', c2: '230,255,255' } },
  gc_crimson: { char: 'gouchen', rarity: 'rare', name: '赤锤', look: { body: '#3a1a1e', shade: '#220c10', scarf: '#d83a3a', slash: '255,120,110', blade: '#ffe0dc' }, deco: { head: 'ironvisage', hideBaseHead: true, robe: 'shura', shoulder: '#6a1a1e', trail: 'smoke', weapStyle: 'crimson_hammer' }, fx: { th: 'metal', c: '255,140,90' } },
  gc_underworld: { char: 'gouchen', rarity: 'legend', name: '冥狱', look: { body: '#241834', shade: '#120a1e', scarf: '#a855f7', slash: '185,105,255', blade: '#f0e0ff' }, deco: { head: 'voidhorns', hideBaseHead: true, robe: 'dark', breastplate: '#3b1d5e', shoulder: '#4c2478', back: 'ghostchains', trail: 'smoke', aura: 'smoke', weapStyle: 'underworld_hammer' }, fx: { th: 'void', c: '185,105,255', c2: '28,0,56' } },
  lq_silk: { char: 'lingque', rarity: 'rare', name: '素丝', look: { body: '#2d1b32', shade: '#180d1c', scarf: '#f06292', slash: '240,98,146', blade: '#fff0f5' }, deco: { head: 'ribbon', robe: 'silk', shoulder: '#880e4f', trail: 'petal', weapStyle: 'silk_spindle' }, fx: { th: 'petal', c: '240,98,146' } },
  lq_sparrow: { char: 'lingque', rarity: 'legend', name: '惊雀', look: { body: '#1a1028', shade: '#0d0616', scarf: '#e040fb', slash: '224,64,251', blade: '#f3e5f5' }, deco: { head: 'tiara', robe: 'nightingale', breastplate: '#4a148c', back: 'featherwings', trail: 'spark', aura: 'smoke', weapStyle: 'nightingale_spindle' }, fx: { th: 'void', c: '224,64,251', c2: '74,20,140' } },
  yl_phoenix: { char: 'yanling', rarity: 'legend', name: '凤羽', look: { body: '#fff0d8', shade: '#d6874a', scarf: '#ff5a2a', slash: '255,130,60', blade: '#fff2e0' }, deco: { back: 'phoenixtail', head: 'plume', plumeC: ['#ff7a2a', '#ffd25a'], robe: 'phoenix', breastplate: '#b84414', cape: '#e8552a', trail: 'ember', aura: 'ember', weapStyle: 'phoenix_feather' }, fx: { th: 'flame', c: '255,145,50', c2: '255,60,20', part: 'feather' } },
  yl_blizzard: { char: 'yanling', rarity: 'legend', name: '雪鸮', look: { body: '#eef4fa', shade: '#94acc4', scarf: '#70b6f6', slash: '120,190,255', blade: '#f2f8ff' }, deco: { head: 'owlhood', hideBaseHead: true, hoodC: '#1c2838', robe: 'blizzard', breastplate: '#385878', back: 'wings', trail: 'feather', featherC: '220,240,255', aura: 'snow', weapStyle: 'owl_feather' }, fx: { th: 'frost', c: '150,210,255', c2: '235,245,255', part: 'feather' } },
};
// ======================= 皮肤场景和特效：稀有皮肤换天色、天气和命中特效，传说皮肤整个场景都换 =======================
// sky 天空渐变 orb 天上的月亮/太阳 mist 雾色 mtn 远山 bam 竹林 wx 天气 hit 命中图案 hitC 命中颜色 stars 星星多少 rays 光柱
const SCENES = {
  qf_frost: { sky: ['#081216', '#12282f', '#24434b', '#122126'], orb: 'moon', orbC: '205,228,232', mist: '170,210,215', mtn: ['#1a3238', '#10222a'], bam: ['#0a1a16', '#06120e'], wx: 'rain', wxC: '190,225,235', hit: 'ripple', hitC: '170,220,230' },
  qf_qfx: { sky: ['#120e16', '#3a2836', '#a65e5e', '#3c2630'], orb: 'moon', orbC: '255,232,214', mist: '235,200,200', mtn: ['#2a2232', '#1a1622'], bam: ['#0c1a14', '#06100a'], wx: 'petal', wxC: '255,190,210', hit: 'leaves', hitC: '140,230,200', stars: 0.4 },
  qf_gold: { sky: ['#1a0a08', '#4a1a10', '#b0561e', '#5a2410'], orb: 'sun', orbC: '255,190,80', mist: '255,170,90', mtn: ['#4a2014', '#2e140c'], bam: ['#1c0a06', '#120604'], wx: 'ember', wxC: '255,170,70', hit: 'sunburst', hitC: '255,200,90', stars: 0.15, rays: true },
  qf_abyss: { sky: ['#0a0414', '#1e0c38', '#451670', '#1c0a30'], orb: 'rift', orbC: '170,90,255', mist: '160,80,240', mtn: ['#220d3d', '#130624'], bam: ['#0d0417', '#080210'], wx: 'spark', wxC: '180,110,255', hit: 'crescent', hitC: '170,90,255', stars: 0.6, rays: true },
  fy_jade: { sky: ['#06140f', '#0f2e26', '#1f4a3c', '#12261e'], orb: 'moon', orbC: '205,255,232', mist: '120,230,180', mtn: ['#12302a', '#0c221c'], bam: ['#081812', '#04100c'], wx: 'leaf', wxC: '90,220,160', hit: 'leaves', hitC: '90,230,170' },
  fy_blood: { sky: ['#0a0204', '#2a0610', '#5a0c1a', '#2a060c'], orb: 'bloodmoon', orbC: '230,40,60', mist: '200,40,60', mtn: ['#2a0810', '#1a0408'], bam: ['#120206', '#0a0104'], wx: 'ash', wxC: '255,80,90', hit: 'crescent', hitC: '255,60,80', stars: 0.4, rays: true },
  fy_phantom: { sky: ['#041018', '#0c2c3e', '#1c5a75', '#0f3246'], orb: 'moon', orbC: '180,245,255', mist: '100,230,255', mtn: ['#0f3448', '#092130'], bam: ['#061722', '#030d14'], wx: 'snow', wxC: '160,240,255', hit: 'swirl', hitC: '80,235,255', stars: 0.5, rays: true },
  ts_bronze: { sky: ['#120c06', '#2e2214', '#54402a', '#2a2014'], orb: 'moon', orbC: '255,215,160', mist: '220,180,120', mtn: ['#3a2c1a', '#281e12'], bam: ['#16100a', '#0e0a06'], wx: 'dust', wxC: '220,180,120', hit: 'shards', hitC: '210,170,100' },
  ts_obsidian: { sky: ['#06040e', '#160e2e', '#2e1a4a', '#160e22'], orb: 'rift', orbC: '150,120,255', mist: '140,110,255', mtn: ['#1e1636', '#140e26'], bam: ['#0a0614', '#06040c'], wx: 'lava', wxC: '255,130,70', hit: 'hexagon', hitC: '160,130,255', rays: true },
  ts_crimson: { sky: ['#180404', '#480e0e', '#a02020', '#4a0e0e'], orb: 'sun', orbC: '255,70,60', mist: '255,60,60', mtn: ['#441212', '#2a0808'], bam: ['#180505', '#0e0202'], wx: 'ember', wxC: '255,80,60', hit: 'sunburst', hitC: '255,60,60', stars: 0.1, rays: true },
  ls_plum: { sky: ['#120610', '#2a1028', '#4a1a38', '#2a0e20'], orb: 'moon', orbC: '255,215,225', mist: '255,140,170', wx: 'petal', wxC: '230,60,90', hit: 'flower', hitC: '255,110,140' },
  ls_aurora: { sky: ['#020a10', '#062030', '#0c3a44', '#081c22'], orb: 'aurora', orbC: '120,255,210', mist: '120,255,210', mtn: ['#0c2a30', '#081c20'], bam: ['#04121a', '#020a10'], wx: 'snow', wxC: '200,255,240', hit: 'snowflake', hitC: '120,255,210' },
  ls_dragon: { sky: ['#051224', '#0f2c52', '#1f5694', '#103058'], orb: 'cloudsun', orbC: '180,225,255', mist: '150,210,255', mtn: ['#133866', '#0a2140'], bam: ['#061830', '#030d1c'], wx: 'snow', wxC: '180,225,255', hit: 'swirl', hitC: '60,170,255', stars: 0.25, rays: true },
  ly_dusk: { sky: ['#140a10', '#40182a', '#9a4a30', '#40201a'], orb: 'moon', orbC: '255,190,140', mist: '255,150,90', mtn: ['#3a1c22', '#2a1218'], wx: 'leaf', wxC: '255,140,70', hit: 'leaves', hitC: '255,160,100' },
  ly_sky: { sky: ['#0a1a34', '#24507e', '#6aa0cc', '#335f86'], orb: 'cloudsun', orbC: '240,250,255', mist: '230,245,255', mtn: ['#3a5a80', '#2a4868'], bam: ['#16304a', '#0e2238'], wx: 'feather', wxC: '240,248,255', hit: 'swirl', hitC: '160,215,255', stars: 0, rays: true },
  ly_bamboo: { sky: ['#08120c', '#142a1b', '#264c33', '#162e20'], orb: 'moon', orbC: '215,245,220', mist: '140,210,160', mtn: ['#183424', '#0f2216'], bam: ['#0a1810', '#050f09'], wx: 'leaf', wxC: '110,215,145', hit: 'leaves', hitC: '90,210,135' },
  ly_fox: { sky: ['#0c0610', '#2a0e1e', '#7a2a2a', '#2a1018'], orb: 'moon', orbC: '255,236,214', mist: '255,150,110', mtn: ['#2a1420', '#1a0c14'], bam: ['#120810', '#0a0408'], wx: 'ember', wxC: '255,140,80', hit: 'swirl', hitC: '255,120,60', stars: 0.4, rays: true },
  lm_violet: { sky: ['#08061a', '#1c1240', '#34205e', '#1c1236'], orb: 'moon', orbC: '215,190,255', mist: '170,130,255', wx: 'spark', wxC: '200,160,255', hit: 'bolt', hitC: '190,150,255', storm: true },
  lm_sun: { sky: ['#180804', '#501808', '#c2501a', '#5a200a'], orb: 'sun', orbC: '255,150,60', mist: '255,140,60', mtn: ['#4a1a0a', '#301006'], bam: ['#1a0804', '#100402'], wx: 'ember', wxC: '255,140,50', hit: 'sunburst', hitC: '255,150,60', stars: 0.1, rays: true },
  lm_asura: { sky: ['#1a0c02', '#4c2206', '#a65410', '#54280a'], orb: 'sun', orbC: '255,190,50', mist: '255,180,60', mtn: ['#441e06', '#2c1202'], bam: ['#1a0a02', '#0e0400'], wx: 'gold', wxC: '255,200,60', hit: 'bolt', hitC: '255,190,40', stars: 0.2, rays: true },
  my_cinnabar: { sky: ['#100808', '#2a1414', '#4a2420', '#241010'], orb: 'moon', orbC: '255,190,170', mist: '220,90,70', wx: 'ink', wxC: '200,50,30', hit: 'enso', hitC: '210,60,40' },
  my_gold: { sky: ['#120c04', '#3a2a10', '#8a6a2a', '#3a2a10'], orb: 'lotus', orbC: '255,215,120', mist: '255,215,140', mtn: ['#3a2c14', '#2a1e0c'], bam: ['#161006', '#0e0a04'], wx: 'gold', wxC: '255,220,130', hit: 'lotus', hitC: '255,215,120', rays: true },
  my_celestial: { sky: ['#050818', '#0d1838', '#1c326c', '#0f1d44'], orb: 'lotus', orbC: '140,210,255', mist: '120,190,255', mtn: ['#122452', '#0a1534'], bam: ['#060c20', '#030612'], wx: 'spark', wxC: '140,215,255', hit: 'enso', hitC: '90,195,255', stars: 0.8, rays: true },
  yh_sakura: { sky: ['#120818', '#2e1436', '#52244c', '#2a1230'], orb: 'moon', orbC: '255,222,236', mist: '255,170,210', wx: 'petal', wxC: '255,175,205', hit: 'flower', hitC: '255,170,210' },
  yh_eclipse: { sky: ['#040206', '#14060e', '#300a18', '#12040a'], orb: 'eclipse', orbC: '230,80,100', mist: '200,60,90', mtn: ['#200810', '#14040a'], bam: ['#0c0206', '#060104'], wx: 'ash', wxC: '230,90,110', hit: 'crescent', hitC: '230,90,110', stars: 0.6, rays: true },
  yh_solstice: { sky: ['#081220', '#142c4c', '#2c588e', '#163254'], orb: 'moon', orbC: '200,235,255', mist: '170,220,255', mtn: ['#1b3a64', '#102442'], bam: ['#081528', '#040b18'], wx: 'snow', wxC: '210,240,255', hit: 'snowflake', hitC: '140,220,255', stars: 0.5, rays: true },
  yl_raven: { sky: ['#08090e', '#181a24', '#2c2e3c', '#16171e'], orb: 'moon', orbC: '225,225,240', mist: '170,170,200', mtn: ['#22232e', '#181922'], wx: 'feather', wxC: '175,175,200', hit: 'feathers', hitC: '180,180,210' },
  yl_phoenix: { sky: ['#160604', '#4a1206', '#b23a12', '#501806'], orb: 'phoenix', orbC: '255,130,60', mist: '255,120,60', mtn: ['#4a160a', '#300c06'], bam: ['#1a0604', '#100302'], wx: 'ember', wxC: '255,150,60', hit: 'feathers', hitC: '255,140,60', stars: 0.1, rays: true },
  yl_blizzard: { sky: ['#0a1422', '#163050', '#2d5c92', '#17365c'], orb: 'moon', orbC: '215,240,255', mist: '180,225,255', mtn: ['#1e426e', '#122a48'], bam: ['#0a182c', '#050f1c'], wx: 'feather', wxC: '220,240,255', hit: 'feathers', hitC: '150,210,255', stars: 0.3, rays: true },
  yx_snow: { sky: ['#0a1824', '#143048', '#2d587c', '#183854'], orb: 'moon', orbC: '210,240,255', mist: '180,230,255', mtn: ['#1a3854', '#10263c'], bam: ['#0a1c2c', '#06121e'], wx: 'snow', wxC: '210,240,255', hit: 'snowflake', hitC: '170,220,255', stars: 0.4 },
  yx_celestial: { sky: ['#140d04', '#38240a', '#7c5418', '#362208'], orb: 'sun', orbC: '255,220,120', mist: '255,210,120', mtn: ['#36240c', '#241606'], bam: ['#160e04', '#0e0802'], wx: 'gold', wxC: '255,220,120', hit: 'sunburst', hitC: '255,215,110', stars: 0.3, rays: true },
  zx_amber: { sky: ['#1c1006', '#44260e', '#8c521c', '#42240e'], orb: 'moon', orbC: '255,210,130', mist: '255,180,100', mtn: ['#3e2410', '#281608'], bam: ['#180e06', '#100802'], wx: 'ember', wxC: '255,180,80', hit: 'sunburst', hitC: '255,190,90', stars: 0.2 },
  zx_immortal: { sky: ['#061624', '#123854', '#266c94', '#143c58'], orb: 'cloudsun', orbC: '160,245,255', mist: '140,235,255', mtn: ['#143a56', '#0c2438'], bam: ['#081828', '#040e18'], wx: 'spark', wxC: '150,245,255', hit: 'swirl', hitC: '90,235,255', stars: 0.4, rays: true },
  gc_crimson: { sky: ['#160608', '#381014', '#7a1e28', '#380e14'], orb: 'bloodmoon', orbC: '255,110,110', mist: '230,80,90', mtn: ['#300c12', '#1e060a'], bam: ['#140406', '#0a0204'], wx: 'ash', wxC: '255,100,100', hit: 'shards', hitC: '255,120,110', stars: 0.3 },
  gc_underworld: { sky: ['#080312', '#1a0a32', '#3c1468', '#18082c'], orb: 'rift', orbC: '185,105,255', mist: '175,95,245', mtn: ['#200b3a', '#120522'], bam: ['#0c0318', '#06010e'], wx: 'spark', wxC: '190,115,255', hit: 'crescent', hitC: '185,105,255', stars: 0.65, rays: true },
  lq_silk: { sky: ['#160a18', '#34143a', '#682270', '#34123c'], orb: 'moon', orbC: '255,200,240', mist: '240,140,210', mtn: ['#2e1236', '#1c0822'], bam: ['#140618', '#0a020e'], wx: 'petal', wxC: '255,160,220', hit: 'flower', hitC: '240,110,210' },
  lq_sparrow: { sky: ['#0a0418', '#200a3e', '#521288', '#220840'], orb: 'rift', orbC: '230,120,255', mist: '210,100,255', mtn: ['#280c48', '#16042a'], bam: ['#100220', '#080112'], wx: 'spark', wxC: '230,130,255', hit: 'crescent', hitC: '224,64,251', stars: 0.7, rays: true },
};
const SCN_DEF = { mtn: ['#241f48', '#1a1636'], bam: ['#110f26', '#0b0a1c'], mist: '190,160,220' };
// 默认擂台动态天气环境变体（清晨竹风、暮色残阳、风雨雷霆、静谧竹夜）
const DEFAULT_WEATHER_THEMES = [
  null, // 默认经典月夜
  { sky: ['#0d141e', '#1c2836', '#2a3c4e', '#1a2430'], orb: 'moon', orbC: '210,235,245', mist: '160,195,215', mtn: ['#1e2c38', '#141e26'], bam: ['#0f1c16', '#08120e'], wx: 'rain', wxC: '190,225,245', hit: 'ripple', hitC: '170,220,235', storm: true },
  { sky: ['#180c14', '#3c1a24', '#682e2c', '#301820'], orb: 'moon', orbC: '255,200,160', mist: '235,160,140', mtn: ['#321a22', '#221018'], bam: ['#180c10', '#100608'], wx: 'leaf', wxC: '255,160,110', hit: 'leaves', hitC: '240,160,120' },
  { sky: ['#080c12', '#14202a', '#223440', '#16222a'], orb: 'moon', orbC: '220,240,250', mist: '150,180,200', mtn: ['#1c2832', '#121c24'], bam: ['#0a1812', '#06100c'], wx: 'petal', wxC: '230,240,245', hit: 'swirl', hitC: '180,220,240' }
];
let defaultWeatherIdx = 0;
const WX_RISE = { ember: 1, gold: 1, lava: 1 };
let SCN = null;   // 这一场的场景（null 是默认的月夜竹林）
function sceneOf(k) { const T = k && SCENES[k], S = k && SKINS[k]; return T && S ? { ...T, key: k, legend: S.rarity === 'legend', name: S.name } : null; }
// 两边都有皮肤时，用稀有度高的；一样高用自己的
function pickScene() {
  SCN = null;
  const me = localIdx();
  for (const i of [me, 1 - me]) {
    const f = [A, B][i]; if (!f || f.dummy) continue;
    const T = sceneOf(f.skinKey);
    if (T && (!SCN || (T.legend && !SCN.legend))) SCN = T;
  }
  if (!SCN) {
    defaultWeatherIdx = (defaultWeatherIdx + 1) % DEFAULT_WEATHER_THEMES.length;
    SCN = DEFAULT_WEATHER_THEMES[defaultWeatherIdx];
  }
}
// ---------- 小图形：天气和命中碎片 ----------
function drawShape(kind, s, rgb, a) {
  const c = `rgba(${rgb},${a})`;
  ctx.fillStyle = c; ctx.strokeStyle = c;
  if (kind === 'snow') { ctx.beginPath(); ctx.arc(0, 0, s * 0.6, 0, 7); ctx.fill(); if (s > 3) { ctx.lineWidth = 0.8; for (let k = 0; k < 3; k++) { ctx.rotate(Math.PI / 3); ctx.beginPath(); ctx.moveTo(-s * 1.4, 0); ctx.lineTo(s * 1.4, 0); ctx.stroke(); } } }
  else if (kind === 'petal') { ctx.beginPath(); ctx.moveTo(0, -s * 1.3); ctx.quadraticCurveTo(s * 1.1, -s * 0.2, 0, s * 1.2); ctx.quadraticCurveTo(-s * 1.1, -s * 0.2, 0, -s * 1.3); ctx.fill(); }
  else if (kind === 'leaf') { ctx.beginPath(); ctx.moveTo(0, -s * 1.6); ctx.quadraticCurveTo(s * 1.1, 0, 0, s * 1.6); ctx.quadraticCurveTo(-s * 1.1, 0, 0, -s * 1.6); ctx.fill(); ctx.strokeStyle = `rgba(0,0,0,${a * 0.35})`; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(0, -s * 1.4); ctx.lineTo(0, s * 1.4); ctx.stroke(); }
  else if (kind === 'feather') { ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(0, -s * 2.4); ctx.quadraticCurveTo(s * 0.4, 0, 0, s * 2.4); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, -s * 2.2); ctx.quadraticCurveTo(s * 1.3, -s * 0.6, s * 0.2, s * 1.6); ctx.quadraticCurveTo(-s * 1.1, -s * 0.2, 0, -s * 2.2); ctx.globalAlpha *= 0.7; ctx.fill(); ctx.globalAlpha /= 0.7; }
  else if (kind === 'ink') { ctx.beginPath(); ctx.moveTo(0, -s * 1.6); ctx.quadraticCurveTo(s, s * 0.2, 0, s); ctx.quadraticCurveTo(-s, s * 0.2, 0, -s * 1.6); ctx.fill(); }
  else if (kind === 'rain') { ctx.lineWidth = Math.max(0.6, s * 0.3); ctx.beginPath(); ctx.moveTo(0, -s * 4); ctx.lineTo(0, s * 4); ctx.stroke(); }
  else if (kind === 'ash') { ctx.fillRect(-s * 0.6, -s * 0.4, s * 1.2, s * 0.8); }
  else if (kind === 'dust') { ctx.beginPath(); ctx.arc(0, 0, s * 0.5, 0, 7); ctx.fill(); }
  else if (kind === 'spark') { ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-s, -s * 1.5); ctx.lineTo(s * 0.3, -s * 0.2); ctx.lineTo(-s * 0.3, s * 0.2); ctx.lineTo(s, s * 1.5); ctx.stroke(); }
  else if (kind === 'twinkle') {   // 星星：四道细芒 + 一个亮点
    ctx.beginPath(); for (let k = 0; k < 8; k++) { const r = k % 2 ? s * 0.22 : s * 1.7, an = k * Math.PI / 4; ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r); } ctx.closePath(); ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.beginPath(); ctx.arc(0, 0, s * 0.32, 0, 7); ctx.fill();
  }
  else if (kind === 'butterfly') {   // 蝴蝶：上下两对翅膀，一扇一扇（每只扇的节奏不一样）
    const fl = 0.28 + 0.72 * Math.abs(Math.sin(clock * 11 + s * 37));
    ctx.save(); ctx.scale(fl, 1);
    for (const sg of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(sg * s * 1.9, -s * 2.3, sg * s * 2.2, -s * 0.5); ctx.quadraticCurveTo(sg * s * 1.3, s * 0.1, 0, 0); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(sg * s * 1.7, s * 0.3, sg * s * 1.1, s * 1.6); ctx.quadraticCurveTo(sg * s * 0.4, s * 1.1, 0, 0); ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.fillRect(-s * 0.12, -s * 0.9, s * 0.24, s * 1.9);
  }
  else if (kind === 'note') {   // 音符：一个八分音符
    ctx.beginPath(); ctx.ellipse(0, s * 0.9, s * 0.78, s * 0.54, -0.4, 0, 7); ctx.fill();
    ctx.lineWidth = Math.max(0.8, s * 0.24); ctx.beginPath(); ctx.moveTo(s * 0.66, s * 0.72); ctx.lineTo(s * 0.66, -s * 1.9); ctx.quadraticCurveTo(s * 1.6, -s * 1.2, s * 1.45, -s * 0.15); ctx.stroke();
  }
  else if (kind === 'koi') drawKoi(s * 1.15, c, `rgba(255,250,240,${a * 0.9})`, clock * 9 + s * 5);
  else {   // ember gold lava：会发光的小点
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 2.2); g.addColorStop(0, `rgba(255,250,230,${a})`); g.addColorStop(0.35, c); g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g; ctx.fillRect(-s * 2.2, -s * 2.2, s * 4.4, s * 4.4);
    if (kind === 'gold' && s > 2) { ctx.strokeStyle = `rgba(255,250,220,${a})`; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(-s * 2.5, 0); ctx.lineTo(s * 2.5, 0); ctx.moveTo(0, -s * 2.5); ctx.lineTo(0, s * 2.5); ctx.stroke(); }
  }
}
// 锦鲤：头朝 +x，身子一扭一扭，尾鳍跟着摆；spot 是背上的一块白斑（不要就传空）
function drawKoi(s, body, spot, wig) {
  const w = Math.sin(wig) * 0.35, tx = -s * 0.95, ty = w * s * 0.6;
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.moveTo(s * 1.6, 0); ctx.quadraticCurveTo(s * 0.8, -s * 0.78, -s * 0.5, -s * 0.32 + w * s * 0.3); ctx.quadraticCurveTo(-s * 1.05, w * s * 0.5, -s * 0.5, s * 0.32 + w * s * 0.3); ctx.quadraticCurveTo(s * 0.8, s * 0.78, s * 1.6, 0); ctx.fill();
  ctx.beginPath(); ctx.moveTo(tx + s * 0.3, ty); ctx.quadraticCurveTo(tx - s * 0.5, ty - s * 0.9, tx - s * 1.05, ty - s * 0.75 + w * s); ctx.quadraticCurveTo(tx - s * 0.5, ty, tx - s * 1.05, ty + s * 0.75 + w * s); ctx.quadraticCurveTo(tx - s * 0.5, ty + s * 0.9, tx + s * 0.3, ty); ctx.fill();
  for (const sg of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * 0.45, sg * s * 0.58, s * 0.38, s * 0.14, sg * 0.7, 0, 7); ctx.fill(); }
  if (spot) { ctx.fillStyle = spot; ctx.beginPath(); ctx.ellipse(s * 0.25, -s * 0.08, s * 0.48, s * 0.24, 0.15, 0, 7); ctx.fill(); }
}
// ---------- 命中图案：以命中点为中心，放大并淡出 ----------
function drawGlyph(kind, r, rgb, a) {
  const c = `rgba(${rgb},${a})`, w = `rgba(255,255,255,${a * 0.8})`;
  ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const arms = (n, f) => { for (let k = 0; k < n; k++) { ctx.save(); ctx.rotate(k * Math.PI * 2 / n); f(); ctx.restore(); } };
  if (kind === 'snowflake') arms(6, () => { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(r, 0); for (const q of [0.45, 0.72]) { ctx.moveTo(r * q, 0); ctx.lineTo(r * (q + 0.16), r * 0.16); ctx.moveTo(r * q, 0); ctx.lineTo(r * (q + 0.16), -r * 0.16); } ctx.stroke(); });
  else if (kind === 'sunburst') { ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, r * 0.38, 0, 7); ctx.stroke(); arms(12, () => { ctx.beginPath(); ctx.moveTo(r * 0.5, -r * 0.06); ctx.lineTo(r, 0); ctx.lineTo(r * 0.5, r * 0.06); ctx.fill(); }); }
  else if (kind === 'crescent') { ctx.beginPath(); ctx.arc(0, 0, r * 0.8, -2.2, 2.2); ctx.arc(r * 0.35, 0, r * 0.62, 2.0, -2.0, true); ctx.closePath(); ctx.fill(); ctx.strokeStyle = w; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.stroke(); }
  else if (kind === 'hexagon') { for (const q of [1, 0.55]) { ctx.beginPath(); for (let k = 0; k <= 6; k++) { const an = k * Math.PI / 3; ctx.lineTo(Math.cos(an) * r * q, Math.sin(an) * r * q); } ctx.stroke(); } arms(6, () => { ctx.beginPath(); ctx.moveTo(r * 0.55, 0); ctx.lineTo(r, 0); ctx.stroke(); }); }
  else if (kind === 'flower') { arms(5, () => { ctx.beginPath(); ctx.ellipse(r * 0.48, 0, r * 0.42, r * 0.24, 0, 0, 7); ctx.stroke(); }); ctx.fillStyle = w; ctx.beginPath(); ctx.arc(0, 0, r * 0.12, 0, 7); ctx.fill(); }
  else if (kind === 'leaves') arms(3, () => { ctx.beginPath(); ctx.moveTo(r * 0.1, 0); ctx.quadraticCurveTo(r * 0.55, -r * 0.32, r, 0); ctx.quadraticCurveTo(r * 0.55, r * 0.32, r * 0.1, 0); ctx.stroke(); ctx.beginPath(); ctx.moveTo(r * 0.15, 0); ctx.lineTo(r * 0.9, 0); ctx.stroke(); });
  else if (kind === 'swirl') arms(3, () => { ctx.beginPath(); for (let k = 0; k <= 24; k++) { const q = k / 24; ctx.lineTo(Math.cos(q * 4) * r * q, Math.sin(q * 4) * r * q); } ctx.stroke(); });
  else if (kind === 'bolt') { ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(0, 0, r * 0.9, 0, 7); ctx.stroke(); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-r * 0.2, -r * 0.8); ctx.lineTo(r * 0.15, -r * 0.1); ctx.lineTo(-r * 0.15, r * 0.05); ctx.lineTo(r * 0.25, r * 0.8); ctx.stroke(); }
  else if (kind === 'enso') { for (let k = 0; k < 18; k++) { const a0 = 0.4 + k * 0.3; ctx.lineWidth = 2 + 5 * Math.sin(k / 17 * Math.PI); ctx.beginPath(); ctx.arc(0, 0, r * 0.8, a0, a0 + 0.32); ctx.stroke(); } }
  else if (kind === 'lotus') { for (let k = -3; k <= 3; k++) { ctx.save(); ctx.rotate(k * 0.36); ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(r * 0.3, -r * 0.5, 0, -r); ctx.quadraticCurveTo(-r * 0.3, -r * 0.5, 0, 0); ctx.stroke(); ctx.restore(); } ctx.beginPath(); ctx.arc(0, 0, r * 0.9, 0.3, Math.PI - 0.3); ctx.stroke(); }
  else if (kind === 'shards') arms(5, () => { ctx.beginPath(); ctx.moveTo(r * 0.35, -r * 0.1); ctx.lineTo(r, 0); ctx.lineTo(r * 0.35, r * 0.1); ctx.closePath(); ctx.fill(); });
  else if (kind === 'ripple') { ctx.save(); ctx.scale(1, 0.42); for (const [q, w] of [[0.35, 2.6], [0.68, 1.8], [1, 1.1]]) { ctx.lineWidth = w; ctx.globalAlpha = 1.15 - q * 0.6; ctx.beginPath(); ctx.arc(0, 0, r * q, 0, 7); ctx.stroke(); } ctx.restore(); ctx.fillStyle = w; ctx.beginPath(); ctx.arc(0, 0, r * 0.08, 0, 7); ctx.fill(); }
  else if (kind === 'feathers') arms(5, () => { ctx.save(); ctx.translate(r * 0.55, 0); ctx.rotate(Math.PI / 2); drawShape('feather', r * 0.2, rgb, a); ctx.restore(); });
  else if (kind === 'star8') {   // 非凡：八角星印，长短芒交替，中间一圈
    ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, 7); ctx.stroke();
    arms(8, () => { ctx.beginPath(); ctx.moveTo(r * 0.34, -r * 0.07); ctx.lineTo(r, 0); ctx.lineTo(r * 0.34, r * 0.07); ctx.closePath(); ctx.fill(); });
    ctx.save(); ctx.rotate(Math.PI / 8); arms(8, () => { ctx.beginPath(); ctx.moveTo(r * 0.32, -r * 0.05); ctx.lineTo(r * 0.6, 0); ctx.lineTo(r * 0.32, r * 0.05); ctx.closePath(); ctx.fill(); }); ctx.restore();
    ctx.fillStyle = w; ctx.beginPath(); ctx.arc(0, 0, r * 0.1, 0, 7); ctx.fill();
  }
}
// ---------- 天上的东西：月亮、太阳、血月、日蚀、极光、金莲、裂月、云日、凤凰、天河 ----------
function drawOrb(T, mx, my, mr, t) {
  const o = T ? T.orb : 'moon', c = T ? T.orbC : '255,236,210';
  const glow = (r0, r1, a) => { const g = ctx.createRadialGradient(mx, my, r0, mx, my, r1); g.addColorStop(0, `rgba(${c},${a})`); g.addColorStop(1, `rgba(${c},0)`); ctx.fillStyle = g; ctx.fillRect(mx - r1, my - r1, r1 * 2, r1 * 2); };
  const disk = (fill, r = mr) => { ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2); ctx.fill(); };
  if (o === 'sun' || o === 'phoenix') {
    glow(mr * 0.5, mr * 6, 0.45);
    ctx.save(); ctx.translate(mx, my); ctx.rotate(t * 0.05); ctx.fillStyle = `rgba(${c},0.18)`;
    for (let k = 0; k < 16; k++) { ctx.rotate(Math.PI / 8); ctx.beginPath(); ctx.moveTo(mr * 1.1, -mr * 0.12); ctx.lineTo(mr * (2.4 + (k % 2) * 0.8), 0); ctx.lineTo(mr * 1.1, mr * 0.12); ctx.fill(); }
    ctx.restore();
    if (o === 'phoenix') {   // 凤凰：太阳两侧展开火焰翅膀
      for (const s of [-1, 1]) for (let k = 0; k < 5; k++) {
        const f = Math.sin(t * 1.5 + k) * 0.06;
        ctx.fillStyle = `rgba(255,${120 + k * 22},60,${0.32 - k * 0.04})`;
        ctx.beginPath(); ctx.moveTo(mx + s * mr * 0.6, my);
        ctx.quadraticCurveTo(mx + s * mr * (2 + k * 0.5), my - mr * (1.6 - k * 0.15 + f * 10), mx + s * mr * (3.2 + k * 0.6), my - mr * (0.4 - k * 0.3));
        ctx.quadraticCurveTo(mx + s * mr * (1.8 + k * 0.3), my - mr * 0.2, mx + s * mr * 0.6, my + mr * 0.3); ctx.fill();
      }
    }
    const g = ctx.createRadialGradient(mx - mr * 0.2, my - mr * 0.2, 0, mx, my, mr); g.addColorStop(0, '#fffbe8'); g.addColorStop(0.6, `rgb(${c})`); g.addColorStop(1, `rgba(${c},0.9)`);
    disk(g);
  } else if (o === 'bloodmoon') {
    glow(mr * 0.6, mr * 5, 0.4);
    disk(`rgb(${c})`);
    ctx.fillStyle = 'rgba(60,0,10,0.35)'; [[-0.3, -0.2, 0.25], [0.28, 0.18, 0.32], [-0.05, 0.42, 0.14]].forEach(([a, b, r]) => { ctx.beginPath(); ctx.arc(mx + a * mr, my + b * mr, r * mr, 0, 7); ctx.fill(); });
    ctx.strokeStyle = 'rgba(20,0,4,0.7)'; ctx.lineWidth = mr * 0.05;   // 划过月面的黑云
    for (let k = 0; k < 3; k++) { const yy = my - mr * 0.5 + k * mr * 0.5, dx = Math.sin(t * 0.2 + k) * mr * 0.3; ctx.beginPath(); ctx.moveTo(mx - mr * 1.6 + dx, yy); ctx.quadraticCurveTo(mx + dx, yy - mr * 0.15, mx + mr * 1.6 + dx, yy + mr * 0.05); ctx.stroke(); }
  } else if (o === 'eclipse') {
    glow(mr * 0.9, mr * 4.5, 0.5);
    ctx.save(); ctx.translate(mx, my); ctx.rotate(t * 0.08); ctx.strokeStyle = `rgba(${c},0.35)`; ctx.lineWidth = 1.5;
    for (let k = 0; k < 40; k++) { ctx.rotate(Math.PI / 20); ctx.beginPath(); ctx.moveTo(mr * 1.02, 0); ctx.lineTo(mr * (1.3 + hash(k) * 0.9), 0); ctx.stroke(); }
    ctx.restore();
    disk(`rgba(255,220,225,0.95)`, mr * 1.04); disk('#050206', mr);
  } else if (o === 'rift') {   // 裂月：紫色月亮，熔岩裂纹在发光
    glow(mr * 0.6, mr * 4.5, 0.38);
    disk('#cfc6f2');
    ctx.save(); ctx.beginPath(); ctx.arc(mx, my, mr, 0, 7); ctx.clip();
    ctx.strokeStyle = `rgba(255,${130 + Math.sin(t * 2) * 50 | 0},70,0.9)`; ctx.lineWidth = mr * 0.045;
    for (let k = 0; k < 5; k++) { ctx.beginPath(); let x = mx + (hash(k) - 0.5) * mr * 0.4, y = my + (hash(k + 3) - 0.5) * mr * 0.4; ctx.moveTo(x, y); for (let n = 0; n < 4; n++) { const an = k * 1.26 + (hash(k * 7 + n) - 0.5); x += Math.cos(an) * mr * 0.35; y += Math.sin(an) * mr * 0.35; ctx.lineTo(x, y); } ctx.stroke(); }
    ctx.restore();
  } else if (o === 'galaxy') {   // 天河：一条星河斜着横过天空，中间一道暗的尘带，星核是斜着的一团亮光，两条旋臂慢慢转
    const L = Math.max(W, mr * 14);
    ctx.save(); ctx.translate(mx, my); ctx.rotate(-0.42); ctx.globalCompositeOperation = 'lighter';
    for (const [w, a, col] of [[mr * 3.4, 0.13, c], [mr * 1.8, 0.15, '255,150,220'], [mr * 0.8, 0.2, '240,244,255']]) {
      const g = ctx.createLinearGradient(0, -w, 0, w); g.addColorStop(0, `rgba(${col},0)`); g.addColorStop(0.5, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g; ctx.fillRect(-L, -w, L * 2, w * 2);
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = 'rgba(8,6,28,0.32)'; ctx.beginPath();   // 尘带
    for (let x = -L; x <= L; x += mr * 0.5) ctx.lineTo(x, Math.sin(x / (mr * 2.6)) * mr * 0.22 - mr * 0.12);
    for (let x = L; x >= -L; x -= mr * 0.5) ctx.lineTo(x, Math.sin(x / (mr * 2.6) + 0.8) * mr * 0.16 + mr * 0.1);
    ctx.fill(); ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 140; k++) {   // 星河里的星尘，一闪一闪
      const x = (hash(k + 210) - 0.5) * L * 2, y = (hash(k + 330) + hash(k + 450) - 1) * mr * 1.7, tw = 0.35 + 0.65 * Math.sin(t * (0.8 + hash(k + 570) * 2.2) + k) ** 2, z = 1.2 + hash(k + 690) * 2.2;
      ctx.fillStyle = `rgba(${k % 5 ? '255,255,255' : '255,200,240'},${0.7 * tw})`; ctx.fillRect(x - z / 2, y - z / 2, z, z);
    }
    ctx.rotate(0.12); ctx.scale(1, 0.46);   // 星系盘斜着放，旋臂在盘里慢慢转
    for (let arm = 0; arm < 2; arm++) for (let k = 0; k < 48; k++) {   // 旋臂
      const q = k / 48, an = arm * Math.PI + q * 4.4 + t * 0.05, r = mr * (0.2 + q * 1.7);
      ctx.fillStyle = `rgba(${q < 0.45 ? '255,235,250' : c},${0.6 * (1 - q)})`;
      ctx.beginPath(); ctx.arc(Math.cos(an) * r, Math.sin(an) * r, (1 - q) * 4.5 + 1.2, 0, 7); ctx.fill();
    }
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, mr * 1.05); g.addColorStop(0, 'rgba(255,252,255,0.95)'); g.addColorStop(0.25, `rgba(${c},0.55)`); g.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, mr * 1.05, 0, 7); ctx.fill();   // 星核（压扁成斜着的椭圆，不像月亮）
    ctx.restore();
  } else if (o === 'lotus') {   // 金莲托月
    glow(mr * 0.6, mr * 5, 0.42);
    for (let k = -4; k <= 4; k++) {
      ctx.save(); ctx.translate(mx, my + mr * 1.05); ctx.rotate(k * 0.3 + Math.sin(t * 0.6) * 0.02);
      const L = mr * (1.35 - Math.abs(k) * 0.1);
      const g = ctx.createLinearGradient(0, 0, 0, -L); g.addColorStop(0, `rgba(${c},0.75)`); g.addColorStop(1, 'rgba(255,245,215,0.25)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(L * 0.42, -L * 0.55, 0, -L); ctx.quadraticCurveTo(-L * 0.42, -L * 0.55, 0, 0); ctx.fill(); ctx.restore();
    }
    disk('#fff2cc', mr * 0.86);
  } else if (o === 'cloudsun') {
    glow(mr * 0.5, mr * 6, 0.4);
    disk('#fbfdff', mr * 0.9);
    for (let k = 0; k < 4; k++) {   // 飘过的云带
      const yy = my + mr * (0.4 + k * 0.55), xx = mx + ((t * (8 + k * 4) + k * 140) % (mr * 9)) - mr * 4.5;
      ctx.fillStyle = `rgba(255,255,255,${0.3 - k * 0.05})`; ctx.beginPath(); ctx.ellipse(xx, yy, mr * (2 + k * 0.5), mr * 0.22, 0, 0, 7); ctx.fill();
    }
  } else {
    glow(mr * 0.6, mr * 4, 0.32);
    disk(T ? `rgb(${T.orbC})` : '#f7ecd8');
    ctx.fillStyle = 'rgba(150,130,160,0.12)';
    [[-0.3, -0.2, 0.22], [0.25, 0.15, 0.3], [-0.05, 0.4, 0.12]].forEach(([a, b, r]) => { ctx.beginPath(); ctx.arc(mx + a * mr, my + b * mr, r * mr, 0, 7); ctx.fill(); });
  }
  if (o === 'aurora') {   // 极光：三条光带在天上飘
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const cols = ['120,255,210', '90,200,255', '190,120,255'];
    for (let k = 0; k < 3; k++) {
      const base = my - mr * (0.2 - k * 0.5), amp = mr * 0.5;
      ctx.beginPath();
      for (let x = 0; x <= W + 20; x += 20) ctx.lineTo(x, base + Math.sin(x / (mr * 2.2) + t * 0.4 + k * 1.7) * amp);
      for (let x = W + 20; x >= 0; x -= 20) ctx.lineTo(x, base + Math.sin(x / (mr * 2.2) + t * 0.4 + k * 1.7) * amp + mr * (1.4 + Math.sin(x / 90 + k) * 0.4));
      const g = ctx.createLinearGradient(0, base - amp, 0, base + mr * 2.2); g.addColorStop(0, `rgba(${cols[k]},0)`); g.addColorStop(0.4, `rgba(${cols[k]},0.3)`); g.addColorStop(1, `rgba(${cols[k]},0)`);
      ctx.fillStyle = g; ctx.fill();
    }
    ctx.restore();
  }
}
// 光柱：从天上斜照下来的几道光（传说场景）
function drawRays(T, mx, my) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 5; k++) {
    const an = 1.75 + (k - 2) * 0.17 + Math.sin(clock * 0.15 + k) * 0.03, len = H * 1.3, w = 0.05 + hash(k + 4) * 0.05;
    const g = ctx.createLinearGradient(mx, my, mx + Math.cos(an) * len, my + Math.sin(an) * len);
    g.addColorStop(0, `rgba(${T.orbC},${0.09 + 0.03 * Math.sin(clock * 0.7 + k)})`); g.addColorStop(1, `rgba(${T.orbC},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(mx, my);
    ctx.lineTo(mx + Math.cos(an - w) * len, my + Math.sin(an - w) * len); ctx.lineTo(mx + Math.cos(an + w) * len, my + Math.sin(an + w) * len); ctx.fill();
  }
  ctx.restore();
}
// 天气：按时间算出位置，不用存状态（世界坐标里画，跟着镜头）
function drawWeather(T, sc) {
  const n = Math.round((T.legend ? 90 : 42) * (SETTINGS.quality === 'low' ? 0.4 : SETTINGS.quality === 'mid' ? 0.7 : 1)), spanX = W / sc + 200, top = -groundY() / sc - 60, spanY = -top + 30, rise = WX_RISE[T.wx];
  for (let i = 0; i < n; i++) {
    const rain = T.wx === 'rain';
    const tw = T.wx === 'twinkle', sp = (rain ? 520 : T.wx === 'snow' ? 50 : T.wx === 'ink' ? 160 : rise ? 45 : tw ? 12 : 60) * (0.6 + hash(i + 3) * 0.8), dr = rain ? -110 : T.wx === 'spark' || tw ? 0 : -25 + hash(i + 8) * 20;
    let y = (hash(i + 1) * spanY + sp * clock) % spanY; y = rise ? 20 - y : top + y;
    const x = cam.x - spanX / 2 + ((hash(i) * spanX + dr * clock + (rain ? 0 : Math.sin(clock * (0.6 + hash(i + 5)) + i) * 30)) % spanX + spanX) % spanX;
    const s = (T.legend ? 2 : 1.6) + hash(i + 7) * 2.4, near = hash(i + 9);
    let a = 0.35 + near * 0.55;
    if (T.wx === 'spark') { a *= Math.max(0, Math.sin(clock * 6 + i * 3.7)) ** 6; if (a < 0.02) continue; }
    else if (tw) { a *= 0.12 + 0.88 * Math.max(0, Math.sin(clock * (1.2 + hash(i + 11)) + i * 2.3)) ** 3; }
    if (rise) a *= clamp((20 - y) / 120, 0, 1) * clamp((y - top) / 150, 0, 1);
    ctx.save(); ctx.translate(x, y); ctx.rotate(rain ? -Math.atan2(dr, sp) : clock * (hash(i + 2) - 0.5) * 3 + i);
    if (rise || T.wx === 'spark' || tw) ctx.globalCompositeOperation = 'lighter';
    drawShape(T.wx, s * (0.7 + near * 0.6), T.wxC, a);
    ctx.restore();
  }
}
// 卡面和图鉴演示用：在一块画布里画出整个皮肤场景
function paintSceneCard(CW, CH, T, t, u) {
  const bg = ctx.createLinearGradient(0, 0, 0, CH);
  T.sky.forEach((c, k) => bg.addColorStop([0, 0.45, 0.75, 1][k], c));
  ctx.fillStyle = bg; ctx.fillRect(0, 0, CW, CH);
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 40 * (T.stars === undefined ? 1 : T.stars); i++) { ctx.globalAlpha = 0.25 + 0.5 * hash(i + 30); ctx.fillRect(hash(i) * CW, hash(i + 50) * CH * 0.5, 1.2 * u, 1.2 * u); }
  ctx.globalAlpha = 1;
  const keepW = W; W = CW;   // 极光按画布宽度画
  drawOrb(T, CW * 0.66, CH * 0.24, Math.min(CW, CH) * 0.13, t);
  W = keepW;
  const mt = T.mtn || SCN_DEF.mtn;
  [[0.62, 22, mt[0], 1.3], [0.72, 14, mt[1], 4.7]].forEach(([b, amp, col, sd]) => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, CH); for (let x = 0; x <= CW; x += 6 * u) ctx.lineTo(x, CH * b - Math.sin(x / (40 * u) + sd) * amp * u - Math.sin(x / (17 * u) + sd * 2) * amp * 0.4 * u); ctx.lineTo(CW, CH); ctx.fill(); });
  const mist = ctx.createLinearGradient(0, CH * 0.5, 0, CH); mist.addColorStop(0, `rgba(${T.mist},0)`); mist.addColorStop(1, `rgba(${T.mist},0.22)`); ctx.fillStyle = mist; ctx.fillRect(0, CH * 0.5, CW, CH * 0.5);
  for (let i = 0; i < (T.legend ? 34 : 18); i++) {
    const rise = WX_RISE[T.wx], y = ((hash(i + 1) * CH + (rise ? -1 : 1) * 30 * u * t * (0.6 + hash(i + 3))) % CH + CH) % CH;
    ctx.save(); ctx.translate(hash(i) * CW + Math.sin(t + i) * 8 * u, y); ctx.rotate(t * (hash(i + 2) - 0.5) * 2 + i);
    if (rise || T.wx === 'spark' || T.wx === 'twinkle') ctx.globalCompositeOperation = 'lighter';
    drawShape(T.wx, (1.6 + hash(i + 7) * 2.6) * u, T.wxC, 0.4 + hash(i + 9) * 0.5); ctx.restore();
  }
}
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
function toast(t) { const el = $id('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.tm); toast.tm = setTimeout(() => el.classList.remove('on'), 2600); }
// 侠客全部直接能用：问剑阁撤掉以后，侠客不再靠抽卡、碎片解锁（皮肤从武库拿）
function ownsHero(id) { return CHARS.some(c => c.id === id); }
function heroesFree() { return true; }
function availList() {
  if (OFFLINE_BUILD || DEV_SESSION_UNLOCKED || heroesFree()) return CHARS.map((c, i) => i);
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
function skinOwned(k) { return !k || (PROF.skins || []).includes(k) || OFFLINE_BUILD || DEV_SESSION_UNLOCKED || (freeSkinEvent() && !(SKINS[k] && SKINS[k].cs)); }
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
  const eq = PROF.equip || {}, k = eq[id];
  if (k && skinOwned(k)) return k;
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
    Object.assign(PROF, p, { guest: false });
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
    if ((PROF.redeemedCodes || []).includes('ZODIAC2026STAR')) {
      const zk = getZodiacSkinKeys();
      PROF.skins = Array.from(new Set([...(PROF.skins || []), ...zk]));
    }
  }
  if (!OFFLINE_BUILD && !DEV_SESSION_UNLOCKED && !freeSkinEvent() && PROF.equip) {
    const ownedSkins = new Set(PROF.skins || []);
    for (const [cid, sk] of Object.entries(PROF.equip)) {
      if (sk && !ownedSkins.has(sk)) delete PROF.equip[cid];
    }
  }
  renderAcc(); updateTutBtn();
  if (!PROF.guest && typeof qfxClaim === 'function' && qfxBest() > (PROF.qfx || 0)) setTimeout(() => qfxClaim(qfxBest()), 0);
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
// ---------- 补偿：任务能刷新重复领奖，给每位玩家补一位自选侠客（活动期内领） ----------
let compAsked = false;
function compKey() { return 'renying-comp1022-' + curName(); }
function compState() {
  if (OFFLINE_BUILD || Date.now() >= FREE_SKIN_EVENT.end) return null;
  let claimed = false; try { claimed = !!curName() && localStorage.getItem(compKey()) === '1'; } catch (e) {}
  return { claimed };
}
function compMaybe() {   // 登录后回到首页时弹一次，点了稍后再选就不再追着弹
  const st = compState();
  if (st && !st.claimed && !compAsked && !PROF.guest && curName()) { compAsked = true; setTimeout(compClaim, 400); }
}
function compMark() { try { localStorage.setItem(compKey(), '1'); } catch (e) {} }
function compClaim() {
  const st = compState(); if (!st || st.claimed || PROF.guest || !curName()) return;
  if (CHARS.every(c => ownsHero(c.id))) {   // 侠客都能直接用了：改发墨锭
    compMark(); PROF.ink = (PROF.ink || 0) + 500; saveProfile(); SFX.chargeFull(); toast('侠客现在都能直接用，补偿改发 500 墨锭'); return;
  }
  openWelfare('comp');
}
// ---------- 新手福利 ----------
let wSel = -1;
let wMode = 'new';
function openWelfare(mode = 'new') {
  ensurePortraits(); wSel = -1; wMode = mode;
  const comp = mode === 'comp';
  $id('wTitle').textContent = comp ? '补偿 · 自选侠客' : '新手福利';
  $id('wSub').textContent = comp ? '之前任务刷新后能重复领奖，现在已经修好。给每位大侠补一位自选侠客，永久拥有。' : '人人开局都有青锋。再从下面挑一位角色，免费相赠，永久拥有。';
  $id('wLater').classList.toggle('hidden', !comp);
  $id('wGrid').innerHTML = CHARS.map((c, i) => PROF.owned.includes(c.id) ? '' : `<button data-i="${i}"><img src="${PORTRAITS[i] || ''}" alt=""><div class="wn" style="color:rgb(${c.look.slash})">${c.name}</div><div class="wr">${c.role} · ${RAR_NAME[CHAR_RARITY[c.id]]}</div></button>`).join('');
  $id('wGo').disabled = true; $id('wMsg').textContent = '';
  showScreen('welfare');
}
$id('wGrid').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; wSel = +b.dataset.i; for (const x of $id('wGrid').children) x.classList.toggle('sel', x === b); $id('wGo').disabled = false; });
$id('wLater').addEventListener('click', () => backToMenu());
$id('wGo').addEventListener('click', async () => {
  if (wSel < 0) return;
  const picked = CHARS[wSel].id;
  PROF.owned = Array.from(new Set([...(PROF.owned || ['qingfeng']), picked]));
  if (wMode === 'comp') compMark(); else PROF.welfare = 1;
  if (window.CloudSave) CloudSave.saveProfile(PROF, true);
  applyProfile(PROF);
  toast(`新得角色：${CHARS[wSel].name}`);
  backToMenu();
});
// ---------- 任务 ----------
function taskDest(name) {
  if (/排位|匹配|联机|好友/.test(name)) return 'netp';
  if (/青锋行|秘境|竹林/.test(name)) return 'forest';
  if (/人机|关卡/.test(name)) return 'cpu';
  if (/试炼|木人/.test(name)) return 'train';
  if (/图鉴|招式/.test(name)) return 'codex';
  return 'cpu';
}
// GitHub 站没有服务器：任务进度按账号存在本机，北京时间 0 点换日、周一换周
const TASK_DEFS = {
  daily: [['d1', '习武精进：进行 1 局对战', 'games', 1, 30], ['d2', '招式纯熟：一局里打出 5 连击', 'combo', 5, 40], ['d3', '破敌致胜：击败 1 名对手', 'wins', 1, 50]],
  weekly: [['w1', '百炼成钢：进行 5 局对战', 'games', 5, 120], ['w2', '名扬四海：赢得 3 场胜利', 'wins', 3, 180], ['w3', '融会贯通：施展 5 次终极奥义', 'ults', 5, 200]],
};
const EVT_TASK = { id: 'e1000', name: '打满 3 局人机（输赢都算）', target: 3, reward: 1000 };
function bjDay(t = Date.now()) { return Math.floor((t + 8 * 3600e3) / 86400e3); }
function taskKey(name) { return 'renying-tasks-' + (name || 'guest'); }
function loadTasks() {
  const name = curName(); let s = null;
  try { s = JSON.parse(localStorage.getItem(taskKey(name)) || 'null'); } catch (e) {}
  if (!s || typeof s !== 'object') s = {};
  const day = bjDay(), week = Math.floor((day + 3) / 7);
  if (s.day !== day) Object.assign(s, { day, d: {}, dc: [] });
  if (s.week !== week) Object.assign(s, { week, w: {}, wc: [] });
  s.evt = s.evt || { cpu: 0, claimed: false };
  if (name && !s.evt.claimed) {   // 没登录时打的人机局，登录后接着算
    try { const g = JSON.parse(localStorage.getItem(taskKey('')) || 'null'); if (g && g.evt) s.evt.cpu = Math.max(s.evt.cpu, g.evt.cpu || 0); } catch (e) {}
  }
  return s;
}
function saveTasks(s) { try { localStorage.setItem(taskKey(curName()), JSON.stringify(s)); } catch (e) {} }
function taskBump(s, stat, v, max) { for (const per of [s.d, s.w]) per[stat] = max ? Math.max(per[stat] || 0, v) : (per[stat] || 0) + v; }
// 一局打完记进度：观战、回放、木人桩不算；本地双人只算对战局数
function taskMatchEnd(w) {
  if (isAiVsAi() || M.watchAi || ['replay', 'demo', 'train', 'watch2v2'].includes(M.mode)) return;
  const s = loadTasks(), pvp = M.mode === 'pvp';
  taskBump(s, 'games', 1);
  if (!pvp && w >= 0 && w === localTeam()) taskBump(s, 'wins', 1);
  if (!pvp && MSTAT.maxcombo) taskBump(s, 'combo', MSTAT.maxcombo, true);
  if (!pvp && MSTAT.ults) taskBump(s, 'ults', MSTAT.ults);
  if (!pvp && M.mode !== 'net' && freeSkinEvent()) s.evt.cpu++;
  saveTasks(s);
}
function taskMarkClaimed(ids) {
  const s = loadTasks();
  for (const id of ids) {
    if (id === EVT_TASK.id) s.evt.claimed = true;
    else if (TASK_DEFS.daily.some(x => x[0] === id)) s.dc.push(id);
    else s.wc.push(id);
  }
  saveTasks(s);
}
function ensureClientTasks() {
  const s = loadTasks(), row = (x, per, cl) => ({ id: x[0], name: x[1], target: x[3], prog: Math.min(x[3], per[x[2]] || 0), reward: x[4], claimed: cl.includes(x[0]) });
  PROF.daily = TASK_DEFS.daily.map(x => row(x, s.d, s.dc));
  PROF.weekly = TASK_DEFS.weekly.map(x => row(x, s.w, s.wc));
  PROF.evtTask = freeSkinEvent() ? Object.assign({}, EVT_TASK, { prog: Math.min(EVT_TASK.target, s.evt.cpu), claimed: !!s.evt.claimed }) : null;
}
function allTasks() { return [...(PROF.evtTask ? [PROF.evtTask] : []), ...(PROF.daily || []), ...(PROF.weekly || [])]; }
function renderTasks() {
  ensureClientTasks();
  for (const el of document.querySelectorAll('.gInk')) el.textContent = PROF.ink;
  const row = t => {
    const dest = taskDest(t.name);
    const goBtn = (!t.claimed && t.prog < t.target) ? `<button class="ghost task-go" data-go="${dest}" style="margin-left:6px;padding:3px 8px;font-size:12px;">前往</button>` : '';
    return `<div class="trow"><span>${t.name}</span><div class="bar"><i style="width:${Math.min(100, t.prog / t.target * 100)}%"></i></div><span class="rw">+${t.reward}</span><div style="display:flex;align-items:center;"><button data-t="${t.id}" ${t.claimed || t.prog < t.target || PROF.guest ? 'disabled' : ''}>${t.claimed ? '已领取' : t.prog >= t.target ? '领取' : `${Math.floor(t.prog)}/${t.target}`}</button>${goBtn}</div></div>`;
  };
  $id('tDaily').innerHTML = PROF.guest ? '<p class="netnote">登录之后，方可领任务</p>' : (PROF.daily || []).map(row).join('');
  $id('tWeekly').innerHTML = PROF.guest ? '' : (PROF.weekly || []).map(row).join('');
  const ev = PROF.evtTask, comp = compState();
  $id('tEvtCard').hidden = !ev && !comp;
  if (ev || comp) {
    $id('tEvtLeft').textContent = `全皮肤限免 · 剩 ${freeSkinDaysLeft()} 天`;
    const compRow = comp ? `<div class="trow"><span>系统补偿：500 墨锭（侠客现在都能直接用）</span><div class="bar"><i style="width:${comp.claimed ? 100 : 0}%"></i></div><span class="rw">+500</span><div style="display:flex;align-items:center;"><button id="compBtn" ${comp.claimed || PROF.guest ? 'disabled' : ''}>${comp.claimed ? '已领取' : '领取'}</button></div></div>` : '';
    $id('tEvt').innerHTML = compRow + (ev ? row(ev) : '') + (PROF.guest ? '<p class="netnote">进度先替你记着，登录之后就能领</p>' : '');
  }
  const canClaimAny = !PROF.guest && allTasks().some(t => !t.claimed && t.prog >= t.target);
  if ($id('claimAllBtn')) {
    $id('claimAllBtn').classList.toggle('hidden', PROF.guest || !canClaimAny);
    $id('claimAllBtn').disabled = !canClaimAny;
  }
}
for (const id of ['tEvt', 'tDaily', 'tWeekly']) $id(id).addEventListener('click', async e => {
  if (e.target.closest('#compBtn')) { compClaim(); renderTasks(); return; }   // 领完马上把按钮变成「已领取」
  const go = e.target.closest('.task-go');
  if (go && go.dataset.go) {
    const dest = go.dataset.go;
    if (dest === 'forest') startForest();
    else if (dest === 'cpu') openScreen('cpu');
    else if (dest === 'train') openScreen('train');
    else menuGo(dest);
    return;
  }
  const b = e.target.closest('button[data-t]'); if (!b || b.disabled) return;
  const tid = b.dataset.t;
  if (PROF.guest) return;
  const t = allTasks().find(x => x.id === tid);
  if (!t || t.claimed || t.prog < t.target) return;
  t.claimed = true; taskMarkClaimed([tid]);
  const gain = t.reward || 50;
  PROF.ink = (PROF.ink || 0) + gain;
  if (window.CloudSave) CloudSave.saveProfile(PROF);
  applyProfile(PROF);
  SFX.chargeFull();
  toast(`+${gain} 墨锭`);
  renderTasks();
});
if ($id('claimAllBtn')) {
  $id('claimAllBtn').addEventListener('click', async () => {
    if (PROF.guest) return;
    const all = allTasks().filter(t => !t.claimed && t.prog >= t.target);
    if (!all.length) return;
    taskMarkClaimed(all.map(t => t.id));
    let totalGain = 0;
    for (const t of all) {
      t.claimed = true;
      totalGain += (t.reward || 50);
    }
    PROF.ink = (PROF.ink || 0) + totalGain;
    if (window.CloudSave) CloudSave.saveProfile(PROF);
    applyProfile(PROF);
    SFX.chargeFull();
    toast(`一键领取完成：+${totalGain} 墨锭`);
    renderTasks();
  });
}
function getZodiacSkinKeys() {
  const zodSkins = [];
  if (typeof ArmoryCore !== 'undefined' && ArmoryCore.ZOD_OF) {
    for (const [pre, zs] of Object.entries(ArmoryCore.ZOD_OF)) {
      zs.forEach(code => zodSkins.push(`${pre}_z${code}`));
    }
  } else {
    zodSkins.push(
      'qf_zpis', 'qf_zsag', 'qf_zleo', 'fy_ztau', 'fy_zaqu', 'fy_zsco',
      'ts_zcap', 'ts_zleo', 'ts_ztau', 'ls_zgem', 'ls_zsco', 'ls_zsag',
      'ly_zvir', 'ly_zpis', 'ly_zlib', 'lm_zleo', 'lm_zcap', 'lm_zari',
      'my_zaqu', 'my_zlib', 'my_zvir', 'yh_zlib', 'yh_zvir', 'yh_zcan',
      'yl_zsag', 'yl_zari', 'yl_zgem', 'yx_zcan', 'yx_zgem', 'yx_zpis',
      'zx_zsco', 'zx_zcan', 'zx_zaqu', 'gc_zari', 'gc_ztau', 'gc_zcap'
    );
  }
  return zodSkins;
}
async function redeemCode(rawCode) {
  const code = (rawCode !== undefined ? String(rawCode) : ($id('rdCode') ? $id('rdCode').value : '')).trim();
  if (!code) return;
  const up = code.toUpperCase();
  if (['LOCK', 'RELOCK'].includes(up)) {
    DEV_SESSION_UNLOCKED = false;
    try { sessionStorage.removeItem('renying-dev-unlock'); } catch (e) {}
    if ($id('rdCode')) $id('rdCode').value = '';
    SFX.thud();
    renderAcc();
    if (typeof BP !== 'undefined' && BP) renderBP();
    if (typeof renderCodex === 'function' && $id('codex').classList.contains('on')) renderCodex();
    if (typeof renderStages === 'function' && $id('single').classList.contains('on')) renderStages();
    return;
  }
  const DEV_SUPER_CODE = 'VG8KS7K8PYP5R36P';
  if (up === DEV_SUPER_CODE) {
    const curU = (typeof curName === 'function' ? curName() : '') || (window.CloudSave && CloudSave.getUser && CloudSave.getUser() ? CloudSave.getUser().name : '') || (typeof ACC !== 'undefined' ? ACC.name : '');
    const isDev = ['dev', 'dev_master'].includes(String(curU || '').trim().toLowerCase()) || !!(window.CloudSave && CloudSave.getUser && CloudSave.getUser() && CloudSave.getUser().isDevMaster);
    if (!isDev) {
      // 若当前为游客或普通本地会话，使用超级神权码直接提升会话权限为 Dev
      const devUser = { uid: 'dev_master', name: 'Dev', displayName: 'Dev', isDevMaster: true, isCloud: false };
      try { localStorage.setItem('renying-local-current', JSON.stringify(devUser)); } catch (e) {}
      if (typeof ACC !== 'undefined') { ACC.name = 'Dev'; ACC.token = 'dev_master'; }
      if (window.CloudSave && typeof CloudSave.getUser === 'function') {
        const u = CloudSave.getUser();
        if (u) { u.name = 'Dev'; u.displayName = 'Dev'; u.isDevMaster = true; }
      }
    }
    const allHeroes = ['qingfeng', 'feiying', 'tieshan', 'lingshuang', 'liuyun', 'leiming', 'moyu', 'yuehua', 'yanling', 'yuxiao', 'zuixian', 'gouchen', 'lingque'];
    const allSkins = Array.from(new Set([
      ...Object.keys(typeof SKINS !== 'undefined' ? SKINS : {}),
      ...(typeof ArmoryCore !== 'undefined' ? Object.keys(ArmoryCore.ITEM || {}) : []),
      ...(typeof ArmoryCore !== 'undefined' ? (ArmoryCore.CS_KEYS || []) : [])
    ]));

    PROF.ink = 1000000;
    PROF.owned = allHeroes.slice();
    PROF.skins = allSkins.slice();

    // 每一款皮肤包含所有形态和斩数各 5 件（共 10 件/皮肤），每个武器箱 1000 个
    if (typeof ArmoryCore !== 'undefined') {
      const C = ArmoryCore;
      const newInv = [];
      let nid = 1;
      for (const k of allSkins) {
        if (!C.isItem(k)) continue;
        for (const stVal of [-1, 0]) {
          for (let copy = 0; copy < 5; copy++) {
            newInv.push({ i: nid++, k, st: stVal, t: Date.now() });
          }
        }
      }
      const devCases = {};
      for (const cid of (C.CASES || ['c1','c2','c3','c4','c5','c6','c7','c8'])) {
        devCases[cid] = 1000;
      }
      let grantedArm = null;
      if (typeof window.grantDevArmory === 'function') {
        grantedArm = window.grantDevArmory(newInv, devCases);
      }
      if (!grantedArm) {   // 没有武库网页（不该发生）才走存档；grantDevArmory 已经连校验一起放好了，不要再写回去（写回去校验不过会记作弊）
        const arm = C.normalize(C.blank(), { now: Date.now(), uid: curU });
        arm.inv = newInv; arm.nid = nid; arm.cases = Object.assign(arm.cases || {}, devCases);
        arm.via = Array.from(new Set(allSkins.filter(k => C.isItem(k))));
        PROF.armory = arm;
      }
    }

    // 最高段位：S+（25000分，天下无双）
    const sid = typeof rkSeason === 'function' ? rkSeason().id : 'S1';
    const devRk = {
      season: sid,
      owner: curU,
      pts: 25000,
      placed: 10,
      est: 25000,
      w: 999,
      l: 0,
      peak: 25000,
      streak: 50,
      hist: [],
      pending: null,
      at: Date.now()
    };
    PROF.rk = devRk;
    try {
      if (typeof rkOwner === 'function') {
        localStorage.setItem('renying-rk-' + rkOwner(), JSON.stringify(devRk));
      }
    } catch (e) {}

    DEV_SESSION_UNLOCKED = true;
    try { sessionStorage.setItem('renying-dev-unlock', '1'); } catch (e) {}

    if (window.CloudSave) CloudSave.saveProfile(PROF, true);
    applyProfile(PROF);
    if (typeof rkSave === 'function') rkSave();

    SFX.chargeFull();
    toast('开发者神权兑换成功：最高段位、全角色、全皮肤及副本、1000个武器箱、100万墨锭！');
    if ($id('tMsg')) $id('tMsg').textContent = '开发者神权兑换成功！已全部解锁并同步。';
    if ($id('rdCode')) $id('rdCode').value = '';
    renderTasks();
    if (typeof renderCodex === 'function' && $id('codex') && $id('codex').classList.contains('on')) renderCodex();
    if (typeof renderStages === 'function' && $id('single') && $id('single').classList.contains('on')) renderStages();
    if (typeof renderTopNav === 'function') renderTopNav();
    if (typeof renderHome === 'function') renderHome();
    return;
  }
  // 星座专属隐藏兑换码：全员可用，解锁全部十二侠客的 36 款星座皮肤（若此前领过但皮肤缺失，允许补齐）
  const ZODIAC_SECRET_CODE = 'ZODIAC2026STAR';
  if (up === ZODIAC_SECRET_CODE) {
    const zodSkins = getZodiacSkinKeys();
    const redeemed = (PROF.redeemedCodes = PROF.redeemedCodes || []);
    const hasAllSkins = zodSkins.every(k => (PROF.skins || []).includes(k));
    const hasAllArmory = typeof window.armoryHasAll === 'function' ? window.armoryHasAll(zodSkins) : true;
    if (redeemed.includes(up) && hasAllSkins && hasAllArmory) {
      toast('该兑换码已使用过了');
      if ($id('tMsg')) $id('tMsg').textContent = '该兑换码已使用过了';
      return;
    }
    const cloudUser = !OFFLINE_BUILD && !!(window.CloudSave && CloudSave.getUser && CloudSave.getUser() && CloudSave.getUser().isCloud);
    if (cloudUser && typeof window.armoryRedeem === 'function') {
      const btn = $id('rdBtn');
      if (btn) btn.disabled = true;
      try { await window.armoryRedeem(up); } catch (e) {} finally { if (btn) btn.disabled = false; }
    }
    if (!redeemed.includes(up)) redeemed.push(up);
    saveFlag('codes', redeemed);

    PROF.skins = Array.from(new Set([...(PROF.skins || []), ...zodSkins]));
    if (typeof window.armoryGrantLocal === 'function') window.armoryGrantLocal(zodSkins, 'code');

    if (window.CloudSave) CloudSave.saveProfile(PROF, true);
    applyProfile(PROF);
    SFX.chargeFull();
    toast('星芒降世：已解锁十二侠客全套 36 款星座专属星辉、星焰、星冕装束！');
    if ($id('tMsg')) $id('tMsg').textContent = '星图共鸣！全套 36 款星座皮肤已成功激活！';
    if ($id('rdCode')) $id('rdCode').value = '';
    renderTasks();
    if (typeof renderCodex === 'function' && $id('codex') && $id('codex').classList.contains('on')) renderCodex();
    if (typeof renderTopNav === 'function') renderTopNav();
    if (typeof renderHome === 'function') renderHome();
    return;
  }
  const clientCodes = {
    'RENYING666': 300,
    'RENYING888': 500,
    'SWORD2026': 600,
    'MOYUGIFT': 400
  };
  if (clientCodes[up]) {
    const redeemed = (PROF.redeemedCodes = PROF.redeemedCodes || []);
    if (redeemed.includes(up)) {
      toast('该兑换码已使用过了');
      if ($id('tMsg')) $id('tMsg').textContent = '该兑换码已使用过了';
      return;
    }
    redeemed.push(up); saveFlag('codes', redeemed);
    const inkGain = clientCodes[up];
    PROF.ink = (PROF.ink || 0) + inkGain;
    if (window.CloudSave) CloudSave.saveProfile(PROF);
    applyProfile(PROF);
    SFX.chargeFull();
    toast(`兑换成功：+${inkGain} 墨锭！`);
    if ($id('tMsg')) $id('tMsg').textContent = `兑换成功：+${inkGain} 墨锭！`;
    if ($id('rdCode')) $id('rdCode').value = '';
    renderTasks();
    return;
  }
  // 管理后台建的礼包码：拿去服务器核对（armory.js 里的 armoryRedeem），领到的东西直接进存档；离线版没有服务器
  if (!OFFLINE_BUILD && /^[A-Z0-9]{4,20}$/.test(up) && typeof window.armoryRedeem === 'function') {
    const btn = $id('rdBtn');
    if (btn) btn.disabled = true;
    if ($id('tMsg')) $id('tMsg').textContent = '正在兑换…';
    let r;
    try { r = await window.armoryRedeem(up); } finally { if (btn) btn.disabled = false; }
    const text = r.ok ? `兑换成功：${r.note}（${r.text}）` : r.err;
    if (r.ok) { SFX.chargeFull(); if ($id('rdCode')) $id('rdCode').value = ''; }
    toast(text);
    if ($id('tMsg')) $id('tMsg').textContent = text;
    renderTasks();
    return;
  }
  toast('兑换码无效或已过期');
  if ($id('tMsg')) $id('tMsg').textContent = '兑换码无效或已过期';
}
$id('rdBtn').addEventListener('click', () => redeemCode());
$id('rdCode').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') redeemCode(); });
window.redeemCode = redeemCode;
// ---------- 排位赛：赛季、段位、定级（不需要服务器，分数存在账号里） ----------
// 分数 1000–25000。D C B A S 每个字母 5000 分（D 从 1000 起，只有 4000 分），
// 每个字母最低的 1500 分是“-”、最高的 1500 分是“+”，中间是不带符号的。
// 新赛季先打 5 场定级赛：定级期间显示一个估分（～xxxx 分），起点偏低、每场涨落很大，最高只能定到 B+。
const SEASON = { id: 'S1', name: '第一赛季', start: Date.UTC(2026, 9, 21, 16), end: Date.UTC(2026, 10, 21, 16) };   // 北京时间 10 月 22 日 0 点到 11 月 22 日 0 点
const RK = { MIN: 1000, MAX: 25000, STEP: 5000, EDGE: 1500, PLACE: 5, PLACE_CAP: 14999, PLACE_START: 2600 };
const RK_TIERS = [
  { l: 'D', n: '初出茅庐', c1: '#e0a06a', c2: '#5a2c12', glow: '#ffb27a' },
  { l: 'C', n: '小有名气', c1: '#e8eef5', c2: '#4f5c6c', glow: '#dff0ff' },
  { l: 'B', n: '名动一方', c1: '#ffd875', c2: '#7e4f0c', glow: '#ffe7a3' },
  { l: 'A', n: '一代宗师', c1: '#72f5d6', c2: '#0b4f5a', glow: '#8fffe6' },
  { l: 'S', n: '天下无双', c1: '#ff5a5a', c2: '#4d0718', glow: '#ffcf6e' },
];
function rkSeason() {
  const now = Date.now();
  if (now < SEASON.start) return { id: 'S0', name: '季前赛', pre: true, left: SEASON.start - now };
  return { id: SEASON.id, name: SEASON.name, pre: false, left: Math.max(0, SEASON.end - now), over: now >= SEASON.end };
}
function rkClamp(v, hi) { return Math.max(RK.MIN, Math.min(hi || RK.MAX, Math.round(+v || 0))); }
function rkTier(pts) {
  pts = rkClamp(pts);
  const li = Math.min(4, Math.floor(pts / RK.STEP));
  const lo = li === 0 ? RK.MIN : li * RK.STEP, hi = (li + 1) * RK.STEP;
  const sub = pts < lo + RK.EDGE ? '-' : pts >= hi - RK.EDGE ? '+' : '';
  const prev = sub === '-' ? lo : sub === '' ? lo + RK.EDGE : hi - RK.EDGE;
  const next = Math.min(RK.MAX, sub === '-' ? lo + RK.EDGE : sub === '' ? hi - RK.EDGE : hi);
  const t = RK_TIERS[li];
  return { li, sub, letter: t.l, label: t.l + sub, name: t.n, pts, lo, hi, prev, next, prog: Math.max(0, Math.min(1, (pts - prev) / Math.max(1, next - prev))) };
}
function rkOwner() { const u = window.CloudSave && CloudSave.getUser && CloudSave.getUser(); return (u && u.name) || ACC.name || ''; }
let RKS = null, RKS_KEY = '';
function rkFresh(season) { return { season, owner: rkOwner(), pts: 0, placed: 0, est: RK.PLACE_START, w: 0, l: 0, peak: 0, streak: 0, hist: [], pending: null, at: 0 }; }
// 当前账号这个赛季的排位数据：本机一份、云端一份（PROF.rk），谁新用谁
function rkState() {
  const owner = rkOwner(), key = 'renying-rk-' + owner, sid = rkSeason().id;
  if (!RKS || RKS_KEY !== key) {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) {}
    RKS = s && typeof s === 'object' ? s : null; RKS_KEY = key;
  }
  const c = PROF.rk;
  if (c && typeof c === 'object' && c.owner === owner && (!RKS || (c.at || 0) > (RKS.at || 0))) RKS = JSON.parse(JSON.stringify(c));
  if (!RKS || RKS.season !== sid) {
    const old = RKS;
    RKS = rkFresh(sid);
    if (old && old.placed >= RK.PLACE) RKS.last = { season: old.season, label: rkTier(old.pts).label, peak: old.peak || old.pts };
  }
  RKS.owner = owner;
  return RKS;
}
function rkSave() {
  const s = rkState();
  s.at = Date.now();
  try { localStorage.setItem(RKS_KEY, JSON.stringify(s)); } catch (e) {}
  PROF.rk = JSON.parse(JSON.stringify(s));
  if (window.CloudSave && rkOwner()) CloudSave.saveProfile(PROF, true);
  if (typeof renderTopNav === 'function') renderTopNav();
}
function rkPlaced(s) { return (s || rkState()).placed >= RK.PLACE; }
function rkMatchPts() { const s = rkState(); return rkPlaced(s) ? s.pts : s.est; }
// 排队时发给对手的信息
function rkMatchInfo() {
  const s = rkState(), pts = rkMatchPts();
  return { band: rkTier(pts).li, uid: rkOwner(), rk: { pts, placed: s.placed, label: rkPlaced(s) ? rkTier(s.pts).label : '定级中' } };
}
function rkLabel(s) {
  s = s || rkState();
  if (!rkPlaced(s)) return `定级赛 ${s.placed}/${RK.PLACE} · ～${Math.round(s.est)} 分`;
  const t = rkTier(s.pts);
  return `${t.label} · ${t.name} · ${t.pts.toLocaleString()} 分`;
}
// 一场的分数变化：对手越强赢了涨得越多、输了扣得越少；定级赛的幅度是平时的五倍多
function rkDelta(me, opp, won, placing, streak) {
  const E = 1 / (1 + Math.pow(10, (opp - me) / 6000));
  let d = won ? (placing ? 3200 : 600) * (1 - E) : -(placing ? 1900 : 600) * E;   // 定级赛输了扣得比赢了涨得少
  if (placing) d = won ? Math.max(900, d) : Math.min(-400, d);
  else {
    d = won ? Math.max(80, d) : Math.min(-60, d);
    if (won && streak >= 2) d *= 1 + Math.min(0.5, (streak - 1) * 0.1);   // 连胜加成，最多 +50%
  }
  return Math.round(d);
}
// 开打就先记一笔“未完成”：中途关网页、点离开，下次打开按输算
function rkBegin() {
  if (!NET.isRanked || NET.rkDone || !rkOwner()) return;
  const s = rkState();
  const o = NET.oppRk || {};
  s.pending = { opp: rkClamp(o.pts || rkMatchPts()), at: Date.now() };
  rkSave();
}
function rkFinish(won, why) {
  const s = rkState();
  if (!s.pending) return null;
  const opp = s.pending.opp, placing = !rkPlaced(s);
  const beforeT = placing ? null : rkTier(s.pts);
  s.streak = won ? Math.max(0, s.streak) + 1 : Math.min(0, s.streak) - 1;
  const d = rkDelta(placing ? s.est : s.pts, opp, won, placing, won ? s.streak : 0);
  won ? s.w++ : s.l++;
  const r = { won, delta: d, placing, why: why || '' };
  if (placing) {
    s.est = rkClamp(s.est + d, RK.PLACE_CAP);
    s.placed++;
    r.est = s.est;
    if (rkPlaced(s)) { s.pts = s.est; s.peak = Math.max(s.peak || 0, s.pts); r.placedDone = true; }
  } else {
    s.pts = rkClamp(s.pts + d);
    s.peak = Math.max(s.peak || 0, s.pts);
    const t = rkTier(s.pts);
    if (t.li > beforeT.li) r.promo = 'letter'; else if (t.li === beforeT.li && t.label !== beforeT.label && d > 0) r.promo = 'sub';
    if (t.li < beforeT.li) r.demote = true;
  }
  r.tier = rkTier(rkPlaced(s) ? s.pts : s.est);
  s.hist = [{ w: won ? 1 : 0, d, o: opp, t: Date.now(), p: placing ? 1 : 0 }].concat(s.hist || []).slice(0, 20);
  s.pending = null;
  rkSave();
  return r;
}
function rkClearPending() { const s = rkState(); if (s.pending) { s.pending = null; rkSave(); } }
function rkResultText(r) {
  if (!r) return '';
  const sign = r.delta >= 0 ? '+' : '';
  if (r.placing && !r.placedDone) return `定级赛 ${rkState().placed}/${RK.PLACE} · 估分 ${sign}${r.delta} → ～${r.est}`;
  if (r.placedDone) return `定级完成 · ${r.tier.label} ${r.tier.name}（${r.tier.pts.toLocaleString()} 分）`;
  return `排位赛 ${sign}${r.delta} 分 · ${r.tier.label}（${r.tier.pts.toLocaleString()}）${r.promo === 'letter' ? ' · 晋升！' : r.promo === 'sub' ? ' · 升段' : r.demote ? ' · 掉段' : ''}`;
}
// 上次排位没打完就关了网页：按输算
function rkCheckPending() {
  if (!rkOwner() || (M.mode === 'net' && NET.open) || bpMode === 'net') return;
  const s = rkState();
  if (!s.pending) return;
  const r = rkFinish(false, 'quit');
  if (r) setTimeout(() => toast(`上一场排位赛中途离开，判负（${r.delta} 分）`), 600);
}
// ---------- 段位勋章（SVG） ----------
let rkMedalN = 0;
function rkMedalSVG(t, size, opt) {
  opt = opt || {};
  const id = 'rkm' + (++rkMedalN), sz = size || 96;
  const hex = (r, cx = 100, cy = 100) => Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 3 * i - Math.PI / 2; return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`; }).join(' ');
  if (!t) {   // 定级中：灰色问号，外圈 5 格表示打了几场
    const n = opt.placed || 0, segs = [];
    for (let i = 0; i < RK.PLACE; i++) {
      const a0 = -Math.PI / 2 + i * 2 * Math.PI / RK.PLACE + 0.08, a1 = a0 + 2 * Math.PI / RK.PLACE - 0.16, R = 86;
      segs.push(`<path d="M${(100 + R * Math.cos(a0)).toFixed(1)} ${(100 + R * Math.sin(a0)).toFixed(1)} A${R} ${R} 0 0 1 ${(100 + R * Math.cos(a1)).toFixed(1)} ${(100 + R * Math.sin(a1)).toFixed(1)}" stroke="${i < n ? '#ece8e1' : 'rgba(236,232,225,.18)'}" stroke-width="7" fill="none" stroke-linecap="round"/>`);
    }
    return `<svg class="rk-medal unranked" viewBox="0 0 200 200" width="${sz}" height="${sz}" aria-hidden="true"><defs><linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b6470"/><stop offset="1" stop-color="#1c222b"/></linearGradient></defs>${segs.join('')}<polygon points="${hex(62)}" fill="url(#${id}g)" stroke="rgba(236,232,225,.5)" stroke-width="2"/><polygon points="${hex(50)}" fill="#0f1923" stroke="rgba(236,232,225,.25)" stroke-width="1.5"/><text x="100" y="121" text-anchor="middle" font-size="58" font-weight="800" fill="#ece8e1" font-family="Oswald,Impact,'Arial Narrow',sans-serif">?</text></svg>`;
  }
  const T = RK_TIERS[t.li], blades = [];
  const nb = [0, 2, 4, 6, 8][t.li];
  const m = nb / 2;
  for (let k = 0; k < m; k++) for (const side of [1, -1]) {   // 背后左右对称的刃：段位越高越多
    const off = m === 1 ? -0.25 : -0.7 + 1.4 * k / (m - 1);
    const a = side > 0 ? off : Math.PI - off, w = 0.2, L = 99 - Math.abs(off) * 12;
    const pt = (r, aa) => `${(100 + r * Math.cos(aa)).toFixed(1)},${(100 + r * Math.sin(aa)).toFixed(1)}`;
    blades.push(`<polygon points="${pt(50, a - w)} ${pt(L, a)} ${pt(50, a + w)}" fill="url(#${id}b)" stroke="${T.c1}" stroke-opacity=".55" stroke-width="1.2"/>`);
  }
  const pips = t.sub === '-' ? 1 : t.sub === '' ? 2 : 3, chev = [];
  for (let i = 0; i < pips; i++) { const y = 168 + i * 9; chev.push(`<path d="M84 ${y} L100 ${y + 7} L116 ${y}" stroke="${T.c1}" stroke-width="4" fill="none" stroke-linejoin="miter"/>`); }
  const crown = t.li >= 3 ? `<polygon points="100,14 108,30 100,40 92,30" fill="${T.glow}" stroke="#fff" stroke-opacity=".6"/>` : '';
  const flame = t.li === 4 ? `<circle cx="100" cy="100" r="86" fill="none" stroke="url(#${id}f)" stroke-width="3" stroke-dasharray="3 7" class="rk-spin"/><circle cx="100" cy="100" r="80" fill="none" stroke="${T.glow}" stroke-opacity=".35" stroke-width="1"/>` : '';
  return `<svg class="rk-medal t${t.li}" viewBox="0 0 200 200" width="${sz}" height="${sz}" aria-hidden="true"><defs>
<linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${T.c1}"/><stop offset=".55" stop-color="${T.c2}"/><stop offset="1" stop-color="${T.c1}"/></linearGradient>
<linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${T.c1}" stop-opacity=".95"/><stop offset="1" stop-color="${T.c2}" stop-opacity=".9"/></linearGradient>
<linearGradient id="${id}t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="${T.c1}"/></linearGradient>
<radialGradient id="${id}r"><stop offset="0" stop-color="${T.glow}" stop-opacity=".55"/><stop offset="1" stop-color="${T.glow}" stop-opacity="0"/></radialGradient>
<linearGradient id="${id}f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffcf6e"/><stop offset=".5" stop-color="#ff4655"/><stop offset="1" stop-color="#ffcf6e"/></linearGradient>
<clipPath id="${id}c"><polygon points="${hex(62)}"/></clipPath></defs>
<circle cx="100" cy="100" r="${70 + t.li * 6}" fill="url(#${id}r)"/>${flame}${blades.join('')}${crown}
<polygon points="${hex(62)}" fill="url(#${id}g)" stroke="${T.glow}" stroke-width="2.5"/>
<polygon points="${hex(57)}" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="2"/>
<polygon points="${hex(50)}" fill="#0f1923" stroke="${T.c1}" stroke-width="2"/>
<path d="M${hex(50).split(' ').slice(4).join(' L')} L${hex(50).split(' ')[0]} L${hex(50).split(' ')[1]} Z" fill="#fff" opacity=".05"/>
<g clip-path="url(#${id}c)"><rect class="rk-shine" x="-60" y="-20" width="34" height="240" fill="#fff" opacity=".18" transform="rotate(25 100 100)"/></g>
<text x="100" y="122" text-anchor="middle" font-size="64" font-weight="800" fill="url(#${id}t)" font-family="Oswald,Impact,'Arial Narrow',sans-serif" letter-spacing="1">${T.l}</text>
${chev.join('')}</svg>`;
}
function rkMedalFor(s, size) { s = s || rkState(); return rkPlaced(s) ? rkMedalSVG(rkTier(s.pts), size) : rkMedalSVG(null, size, { placed: s.placed }); }
// 定级完成 / 晋升时的全屏展示
function rkReveal(r) {
  const box = $id('rkReveal');
  if (!box || !r || !(r.placedDone || r.promo === 'letter')) return;
  const t = r.tier;
  box.innerHTML = `<div class="rkr-in"><div class="rkr-kicker">${r.placedDone ? '定级完成' : '段位晋升'}</div><div class="rkr-medal">${rkMedalSVG(t, 220)}</div><div class="rkr-label">${t.label}</div><div class="rkr-name">${t.name}</div><div class="rkr-pts">${t.pts.toLocaleString()} 分</div><button class="go" type="button">继续</button></div>`;
  box.classList.remove('hidden');
  requestAnimationFrame(() => box.classList.add('on'));
  SFX.gong();
  const close = () => { box.classList.remove('on'); setTimeout(() => box.classList.add('hidden'), 300); };
  box.querySelector('button').onclick = close;
}
// 结算页的段位环：字母勋章外面一圈进度条，赢了顺时针涨、输了往回退，跨段时换勋章接着转
function endRkRing(before, r) {
  const box = $id('endRk');
  if (!box) return;
  box.classList.remove('hidden');
  const R = 92, C = 2 * Math.PI * R, up = r.delta >= 0;
  if (r.placing && !r.placedDone) {   // 定级赛：外圈五格，只报估分
    box.innerHTML = `<div class="erk-dial">${rkMedalSVG(null, 200, { placed: rkState().placed })}</div><div class="erk-txt"><b class="${up ? 'up' : 'down'}">${up ? '+' : ''}${r.delta}</b><span>定级赛 ${rkState().placed}/${RK.PLACE} · 估分 ～${r.est.toLocaleString()}</span></div>`;
    return;
  }
  const t1 = r.tier, t0 = before === null ? null : rkTier(before);
  box.innerHTML = `<div class="erk-dial"><svg class="erk-ring" viewBox="0 0 220 220" aria-hidden="true">
      <circle cx="110" cy="110" r="${R}" class="erk-track"/>
      <circle cx="110" cy="110" r="${R}" class="erk-bar ${up ? 'up' : 'down'}" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${C.toFixed(1)}" transform="rotate(-90 110 110)"/>
      <circle cx="110" cy="18" r="6" class="erk-head ${up ? 'up' : 'down'}"/>
    </svg><div class="erk-medal"></div></div>
    <div class="erk-txt"><b class="${up ? 'up' : 'down'}">${up ? '+0' : '-0'}</b><span class="erk-lab"></span></div>`;
  const bar = box.querySelector('.erk-bar'), head = box.querySelector('.erk-head'), medal = box.querySelector('.erk-medal');
  const num = box.querySelector('.erk-txt b'), lab = box.querySelector('.erk-lab');
  const setMedal = t => { medal.innerHTML = rkMedalSVG(t, 128); lab.textContent = `${t.label} · ${t.name}`; };
  const setP = p => {
    p = Math.max(0, Math.min(1, p));
    bar.setAttribute('stroke-dashoffset', (C * (1 - p)).toFixed(1));
    head.setAttribute('transform', `rotate(${(p * 360).toFixed(1)} 110 110)`);
  };
  // 一段段地转：同一小段就从旧进度转到新进度；升段先转满再从零开始，掉段先退到零再从满往回
  const legs = [];
  if (!t0 || t0.label === t1.label) legs.push([t0 ? t0.prog : 0, t1.prog, t1]);
  else if (t1.pts > t0.pts) { legs.push([t0.prog, 1, t0]); legs.push([0, t1.prog, t1]); }
  else { legs.push([t0.prog, 0, t0]); legs.push([1, t1.prog, t1]); }
  setMedal(legs[0][2]); setP(legs[0][0]);
  const total = 1500, start = performance.now() + 450;
  let leg = 0;
  const tick = now => {
    if (!box.contains(bar)) return;
    const k = Math.max(0, Math.min(1, (now - start) / total)), e = 1 - Math.pow(1 - k, 3);
    num.textContent = (up ? '+' : '-') + Math.round(Math.abs(r.delta) * e);
    const per = 1 / legs.length, li = Math.min(legs.length - 1, Math.floor(e / per)), lk = Math.min(1, (e - li * per) / per);
    if (li !== leg) { leg = li; setMedal(legs[li][2]); SFX.gong(); box.classList.add('erk-flip'); setTimeout(() => box.classList.remove('erk-flip'), 500); }
    setP(legs[li][0] + (legs[li][1] - legs[li][0]) * lk);
    if (k < 1) requestAnimationFrame(tick);
    else lab.textContent = `${t1.label} · ${t1.name} · ${t1.pts.toLocaleString()} 分`;
  };
  requestAnimationFrame(tick);
}
function fmtLeft(ms) { const d = Math.floor(ms / 86400000), h = Math.floor(ms / 3600000) % 24; return d > 0 ? `${d} 天 ${h} 小时` : `${h} 小时 ${Math.floor(ms / 60000) % 60} 分`; }
// 对战大厅：赛季条、两张模式卡
function renderLobby() {
  const sea = rkSeason();
  if ($id('seasonName')) $id('seasonName').textContent = sea.pre ? '季前赛' : SEASON.name;
  if ($id('seasonLeft')) $id('seasonLeft').textContent = sea.pre ? `第一赛季 ${fmtLeft(sea.left)} 后开启（季前赛分数届时清零）` : sea.over ? '赛季已结束' : `剩余 ${fmtLeft(sea.left)}`;
  const owner = rkOwner();
  if ($id('mmMedal')) $id('mmMedal').innerHTML = owner ? rkMedalFor(null, 108) : rkMedalSVG(null, 108, { placed: 0 });
  if (!owner) {
    if ($id('mmRankLabel')) $id('mmRankLabel').textContent = '登录后开启排位';
    if ($id('mmRankSub')) $id('mmRankSub').textContent = '段位与分数保存在账号里';
    if ($id('mmRankBar')) $id('mmRankBar').style.width = '0%';
    return;
  }
  const s = rkState();
  if (rkPlaced(s)) {
    const t = rkTier(s.pts);
    $id('mmRankLabel').textContent = `${t.label} · ${t.name}`;
    $id('mmRankSub').textContent = `${t.pts.toLocaleString()} 分 · 距下一段 ${Math.max(0, t.next - t.pts).toLocaleString()} 分 · ${s.w} 胜 ${s.l} 负`;
    $id('mmRankBar').style.width = (t.prog * 100).toFixed(1) + '%';
  } else {
    $id('mmRankLabel').textContent = `定级赛 ${s.placed}/${RK.PLACE}`;
    $id('mmRankSub').textContent = `当前估分 ～${Math.round(s.est).toLocaleString()} 分（最高定到 B+）`;
    $id('mmRankBar').style.width = (s.placed / RK.PLACE * 100) + '%';
  }
}
// 段位说明
function renderRankInfo() {
  const box = $id('rkInfoBody');
  if (!box) return;
  const s = rkOwner() ? rkState() : null;
  const rows = RK_TIERS.map((T, li) => {
    const lo = li === 0 ? RK.MIN : li * RK.STEP, hi = (li + 1) * RK.STEP;
    const mine = s && rkPlaced(s) && rkTier(s.pts).li === li;
    return `<div class="rki-tier${mine ? ' mine' : ''}">${rkMedalSVG(rkTier(lo + RK.EDGE + 1), 64)}<div><b>${T.l} · ${T.n}</b><span>${lo.toLocaleString()} – ${hi.toLocaleString()} 分</span><span class="rki-subs">${T.l}- ${lo.toLocaleString()}+ · ${T.l} ${(lo + RK.EDGE).toLocaleString()}+ · ${T.l}+ ${(hi - RK.EDGE).toLocaleString()}+</span></div></div>`;
  }).join('');
  const hist = s && s.hist && s.hist.length ? `<div class="rki-hist">${s.hist.slice(0, 10).map(h => `<span class="${h.w ? 'w' : 'l'}" title="${new Date(h.t).toLocaleString()}">${h.w ? '胜' : '负'} ${h.d >= 0 ? '+' : ''}${h.d}</span>`).join('')}</div>` : '';
  const me = s ? `<div class="rki-me">${rkMedalFor(s, 120)}<div><div class="rki-me-l">${rkPlaced(s) ? rkTier(s.pts).label + ' · ' + rkTier(s.pts).name : '定级中'}</div><div class="rki-me-s">${rkLabel(s)}</div><div class="rki-me-s">本赛季 ${s.w} 胜 ${s.l} 负 · 最高 ${(s.peak || 0) ? rkTier(s.peak).label + '（' + s.peak.toLocaleString() + '）' : '—'}${s.last ? ` · 上赛季 ${s.last.label}` : ''}</div>${hist}</div></div>` : '<p class="netnote">登录后即可开始定级。</p>';
  box.innerHTML = `${me}<div class="rki-tiers">${rows}</div><p class="rki-note">新赛季先打 ${RK.PLACE} 场定级赛：定级期间显示估分，起点偏低、每场涨落很大，最高可定到 B+。之后每场按对手强弱加减分，连胜有额外加成。排位只会匹配同段位或相差 1–2 个大段的对手；开打后中途离开按输算。</p>`;
}
// ---------- 排位 ----------
function renderRankLine() {
  renderLobby();
  const rs = rkOwner() ? rkState() : null;
  const rankText = !rs ? '登录后定级' : rkPlaced(rs) ? `${rkTier(rs.pts).label} · ${rkTier(rs.pts).name}` : '定级中';
  if ($id('netRankName')) $id('netRankName').textContent = rankText;
  if ($id('netWinsCount')) {
    const wins = PROF.netWins || 0, losses = PROF.netLosses || 0;
    const total = wins + losses;
    const rate = total > 0 ? Math.round((wins / total) * 100) : 0;
    $id('netWinsCount').textContent = `${wins} 胜 ${losses} 负${total > 0 ? ` (${rate}%)` : ''}`;
  }
}
function reportProgress(w) {
  // GitHub 站与离线模式本地结算与云端持久化
  if (M.mode === 'net') {
    NET.consensus = NET.consensus || {};
    NET.consensus.pendingReport = true;
    // 等双方互相确认胜负再结算；对面迟迟不回就按存疑处理
    if (!tryCommitNet(false)) setTimeout(() => tryCommitNet(true), 5000);
  } else if (M.mode === 'cpu') {
    const won = w === 0;
    if (won) {
      const rewardMap = { easy: 10, normal: 20, hard: 40, adaptive: 40, impossible: 60 };
      const gain = rewardMap[M.level] || 20;
      PROF.ink = (PROF.ink || 0) + gain;
      $id('endRank').textContent = `+${gain} 墨锭`;
      if (window.CloudSave) CloudSave.saveProfile(PROF);
      applyProfile(PROF);
    }
  }
}

function tryCommitNet(force) {
  const c = NET.consensus;
  if (!c || !c.pendingReport || c.committed) return false;
  if (!force && !(c.gotFinish && c.gotAck)) return false;
  commitNetProgress(c.localWinner, !!(c.gotFinish && c.gotAck && c.agreed && c.peerAgreed), c.qualifying !== false);
  return true;
}
function commitNetProgress(w, agreed, isQualifying) {
  if (NET.consensus && NET.consensus.committed) return;
  if (!NET.consensus) NET.consensus = {};
  NET.consensus.committed = true;

  const won = w === localTeam();
  const ranked = NET.isRanked && !NET.rkDone && rkOwner();
  if (ranked) NET.rkDone = true;
  // 若对局过短（<15秒且<4次命中），属于切磋/自测练习局，不计入胜场与排位分，仅给予友好提示
  if (!isQualifying) {
    $id('endRank').textContent = '切磋对局（耗时过短，不计入排位胜场与墨锭）';
    if (ranked) rkClearPending();
    return;
  }
  // 双方意见不一致（作弊或不同步）
  if (!agreed) {
    $id('endRank').textContent = '对局结果同步存疑，本次结果不计入排位';
    if (ranked) rkClearPending();
    return;
  }

  const gain = won ? 60 : 30;
  PROF.ink = (PROF.ink || 0) + gain;
  if (won) {
    PROF.netWins = (PROF.netWins || 0) + 1;
  } else {
    PROF.netLosses = (PROF.netLosses || 0) + 1;
  }
  $id('endRank').textContent = `+${gain} 墨锭 · 联机${won ? '胜' : '负'}（累计 ${PROF.netWins || 0} 胜）`;
  if (ranked) {
    const s0 = rkState(), before = rkPlaced(s0) ? s0.pts : null;
    const r = rkFinish(won);
    if (r) {
      $id('endRank').textContent = `+${gain} 墨锭`;
      endRkRing(before, r);
      setTimeout(() => rkReveal(r), 2600);
    }
  }
  if (window.CloudSave) CloudSave.saveProfile(PROF);
  applyProfile(PROF);
}

