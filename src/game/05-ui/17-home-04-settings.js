// ======================= 设置与键位 =======================
// 本文件：设置页（SETTING_ROWS 定义每一行）和改键（KEY_ACTIONS、handleKeyRebind）。
// 找 bug 提示：设置项读写都走 SETTINGS / saveSettings（01-core.js）；改键存在 custom1PKeys（06-input-net.js）。
// ======================= 设置 =======================
let settingsBack = 'menu';
const SETTING_ROWS = [
  { group: '操控与游戏', k: 'lang', name: '语言 / Language', opts: [['zh', '简体中文'], ['en', 'English']] },
  { group: '操控与游戏', k: 'kbOnly', name: '纯键盘模式', opts: [[false, '不用'], [true, '开启']] },
  { group: '操控与游戏', k: 'backgroundPlay', name: '切换窗口时', opts: [[false, '暂停对局'], [true, '继续对局']] },
  { group: '操控与游戏', k: 'aim', name: '朝向', opts: [[true, '按 A / D 决定'], [false, '自动面向对手']] },
  { group: '操控与游戏', k: 'autoSkin', name: '皮肤', opts: [[true, '自动穿最好的'], [false, '按我选的穿']] },
  { group: '显示与性能', k: 'bloom', name: '泛光', opts: [[1.6, '高（最佳效果）'], [1, '中'], [0.5, '低'], [0, '关闭']] },
  { group: '显示与性能', k: 'fps', name: '帧率上限', opts: [[144, '144'], [120, '120'], [60, '60'], [30, '30']] },
  { group: '显示与性能', k: 'quality', name: '画质', opts: [['high', '极高画质（原生全像素）'], ['mid', '中'], ['low', '低']] },
  { group: '显示与性能', k: 'blur', name: '背景虚化', opts: [[true, '开'], [false, '关闭']] },
  { group: '显示与性能', k: 'shake', name: '画面震动', range: [0, 2, 0.1] },
  { group: '显示与性能', k: 'vig', name: '暗角', range: [0, 1.5, 0.1] },
  { group: '无障碍与显示', k: 'colorblind', name: '色觉辅助', opts: [['none', '关闭'], ['protan', '红色盲'], ['deutan', '绿色盲'], ['tritan', '蓝色盲']] },
  { group: '无障碍与显示', k: 'reducedFlash', name: '减弱闪光与震动', opts: [[false, '关闭'], [true, '开启']] },
  { group: '无障碍与显示', k: 'highContrastHitbox', name: '高对比判定框', opts: [[false, '关闭'], [true, '开启']] },
  { group: '无障碍与显示', k: 'uiScale', name: '界面字号', opts: [['normal', '标准'], ['large', '放大']] },
  { group: '声音', k: 'music', name: '音乐', range: [0, 1, 0.05] },
  { group: '声音', k: 'sfx', name: '音效', range: [0, 1, 0.05] },
  { group: '声音', k: 'spatialAudio', name: '立体声定位', opts: [[true, '开启'], [false, '关闭']] },
  { group: '声音', k: 'audioCaptions', name: '音效字幕', opts: [[false, '关闭'], [true, '开启']] },
  { group: '数据偏好', k: 'stats', name: '匿名统计', opts: [[true, '开（不记名字、账号）'], [false, '关闭']] },
  { group: '数据偏好', k: 'aiTraining', name: 'AI 模型训练', opts: [[true, '开（匿名上传对局操作）'], [false, '关闭']] },
];
const DISPLAY_PRESETS = {
  smooth: { quality: 'high', fps: 144, bloom: 1.2, blur: true, vig: 0.8 },
  balanced: { quality: 'mid', fps: 120, bloom: 0.8, blur: true, vig: 0.5 },
  battery: { quality: 'low', fps: 60, bloom: 0.4, blur: false, vig: 0.2 }
};
const KEY_CATS = [
  ['all', '全部'],
  ['move', '移动与身法'],
  ['combat', '攻击与绝学'],
  ['vision', '视野与战况'],
  ['tactics', '战术与统帅']
];
const KEY_ACTIONS = [
  ['left', '向左移动', 'move'],
  ['right', '向右移动', 'move'],
  ['jump', '跳跃 / 二段跳', 'move'],
  ['down', '沉身格挡', 'move'],
  ['dash', '疾步冲刺', 'move'],
  ['atk', '攻击 / 蓄力斩', 'combat'],
  ['heavyStrike', '重击劈斩', 'combat'],
  ['lowKick', '下段扫腿', 'combat'],
  ['iaido', '居合斩穴', 'combat'],
  ['grapple', '擒拿投技', 'combat'],
  ['special', '终极绝技', 'combat'],
  ['skill', '门派绝学', 'combat'],
  ['skill2', '特殊突进', 'combat'],
  ['stance', '切换架势', 'combat'],
  ['relicStance', '器灵双境', 'combat'],
  ['feint', '虚招翻滚', 'combat'],
  ['parry', '聚气弹反', 'combat'],
  ['pet', '灵宠秘技', 'combat'],
  ['lock', '切换锁定', 'vision'],
  ['beacon', '归位自标', 'vision'],
  ['scoreboard', '战况总览', 'vision'],
  ['rally', '战意号令', 'tactics'],
  ['orderFocus', '全军集火', 'tactics'],
  ['orderProtect', '回防掩护', 'tactics'],
  ['orderSpread', '分散游击', 'tactics'],
  ['cmdSelect', '选中队友', 'tactics'],
  ['cmdRole', '分派任务', 'tactics']
];
let rebindingKey = null;
let keyCatFilter = 'all';
function keyActionLabel(act) {
  const row = KEY_ACTIONS.find(([k]) => k === act);
  return row ? row[1] : act;
}
function handleKeyRebind(e) {
  if (!rebindingKey) return;
  e.preventDefault(); e.stopPropagation();
  if (e.code === 'Escape') {
    cancelKeyRebind();
    buildSettings();
    return;
  }
  const act = rebindingKey;
  const taken = Object.keys(custom1PKeys).find(a => a !== act && custom1PKeys[a] === e.code);
  if (taken) custom1PKeys[taken] = custom1PKeys[act];   // 这个键已经给了别的动作：两个对调，别让那个动作没键可按
  custom1PKeys[act] = e.code;
  try { localStorage.setItem('renying-1p-keys', JSON.stringify(custom1PKeys)); } catch (err) {}
  applyCustomKeys();
  cancelKeyRebind();
  buildSettings();
  if (taken) toast(`已将「${keyActionLabel(act)}」与「${keyActionLabel(taken)}」的键位互换`);
}
function buildSettings() {
  const groups = [];
  for (const r of SETTING_ROWS) {
    let group = groups[groups.length - 1];
    if (!group || group.name !== r.group) groups.push(group = { name: r.group, rows: [] });
    group.rows.push(r);
  }
  const baseHtml = groups.map(g => `<section class="setting-group"><h3>${cvT(g.name)}</h3>${g.rows.map(r => r.opts
    ? `<div class="setrow"><span>${cvT(r.name)}</span><div class="seg" data-k="${r.k}">${r.opts.map(([v, t]) => `<button data-v='${JSON.stringify(v)}' class="${SETTINGS[r.k] === v ? 'sel' : ''}">${cvT(t === '关闭' ? '关闭选项' : t)}</button>`).join('')}</div><span></span></div>`
    : `<div class="setrow"><span>${cvT(r.name)}</span><input type="range" data-k="${r.k}" min="${r.range[0]}" max="${r.range[1]}" step="${r.range[2]}" value="${SETTINGS[r.k]}"><span class="v" id="sv_${r.k}">${Math.round(SETTINGS[r.k] * 100)}%</span></div>`).join('')}</section>`).join('');
  $id('settingPresets').innerHTML = `<b>${cvT('显示预设')}</b>${[['smooth', '流畅优先'], ['balanced', '均衡'], ['battery', '省电']].map(([id, label]) => `<button type="button" class="ghost small" data-settings-preset="${id}">${cvT(label)}</button>`).join('')}`;
  const customCount = KEY_ACTIONS.filter(([act]) => custom1PKeys[act] !== DEFAULT_1P_KEYS[act]).length;
  const visibleKeys = keyCatFilter === 'all' ? KEY_ACTIONS : KEY_ACTIONS.filter(([, , cat]) => cat === keyCatFilter);
  const catTabsHtml = KEY_CATS.map(([cat, label]) => {
    const cnt = cat === 'all' ? KEY_ACTIONS.length : KEY_ACTIONS.filter(([, , c]) => c === cat).length;
    return `<button type="button" class="keycat-btn${keyCatFilter === cat ? ' sel' : ''}" data-keycat="${cat}">${label}<small>${cnt}</small></button>`;
  }).join('');
  const keyHtml = `
    <div class="keypanel">
      <div class="keypanel-head">
        <div class="keypanel-title">
          <b>1P 键位设置</b>
          <span class="keypanel-meta">${customCount ? `已自定义 ${customCount} 项` : '默认方案'} · 点击按键改键，按 Esc 取消</span>
        </div>
        <button id="resetKeysBtn" type="button" class="ghost small" ${customCount ? '' : 'disabled'}>恢复默认</button>
      </div>
      <div class="keycat-tabs" role="tablist" aria-label="键位分类">${catTabsHtml}</div>
      <div class="keygrid">
        ${visibleKeys.map(([act, name]) => {
          const isCustom = custom1PKeys[act] !== DEFAULT_1P_KEYS[act];
          const isActive = rebindingKey === act;
          return `
          <div class="keyitem${isCustom ? ' is-custom' : ''}${isActive ? ' is-rebinding' : ''}">
            <span class="kact">${name}</span>
            <button type="button" class="ghost keybind-btn${isActive ? ' active' : ''}${isCustom ? ' is-custom' : ''}" data-act="${act}" title="默认：${keyLabel(DEFAULT_1P_KEYS[act])}">
              ${isActive ? '请按新键…' : keyLabel(custom1PKeys[act])}
            </button>
          </div>`;
        }).join('')}
      </div>
      <p class="keypanel-foot">鼠标亦可直接操作：左键轻击与蓄力，右键腾空闪，左键加右键施放远程招式；冲突按键会自动互换。</p>
    </div>
  `;
  $id('setList').innerHTML = baseHtml + `<section class="setting-group keypanel-group"><h3>${cvT('键位')}</h3>${keyHtml}</section>`;
}
$id('settingPresets').addEventListener('click', e => {
  const b = e.target.closest('[data-settings-preset]'), preset = b && DISPLAY_PRESETS[b.dataset.settingsPreset];
  if (!preset) return;
  Object.assign(SETTINGS, preset, { qualityChosen: true });
  saveSettings(); resize(); buildSettings();
  toast(`${cvT(b.textContent)} · ${cvT('已应用')}`);
});
$id('setList').addEventListener('click', e => {
  const catBtn = e.target.closest('[data-keycat]');
  if (catBtn) {
    cancelKeyRebind();
    keyCatFilter = catBtn.dataset.keycat || 'all';
    buildSettings();
    return;
  }
  const rst = e.target.closest('#resetKeysBtn');
  if (rst) {
    cancelKeyRebind();
    custom1PKeys = { ...DEFAULT_1P_KEYS };
    try { localStorage.removeItem('renying-1p-keys'); } catch (err) {}
    applyCustomKeys();
    buildSettings();
    toast('已恢复默认键位');
    return;
  }
  const kb = e.target.closest('.keybind-btn');
  if (kb) {
    if (rebindingKey === kb.dataset.act) {
      cancelKeyRebind();
      buildSettings();
      return;
    }
    rebindingKey = kb.dataset.act;
    window.removeEventListener('keydown', handleKeyRebind, true);
    window.addEventListener('keydown', handleKeyRebind, true);
    buildSettings();
    return;
  }
  const b = e.target.closest('button'); if (!b || !b.parentElement || !b.parentElement.dataset.k) return;
  const k = b.parentElement.dataset.k; SETTINGS[k] = JSON.parse(b.dataset.v); saveSettings();
  if (k === 'aiTraining' && !SETTINGS.aiTraining && typeof aiTrainClearQueue === 'function') aiTrainClearQueue();
  if (k === 'lang' && window.I18N) window.I18N.setLang(SETTINGS[k]);
  buildSettings();
  if (k === 'lang' && typeof xiwuPresetRender === 'function') xiwuPresetRender();
  if (k === 'kbOnly') kbOnlySet(SETTINGS.kbOnly);
  if (k === 'quality') { SETTINGS.qualityChosen = true; saveSettings(); resize(); }   // 手动选过画质：以后不再自动降
  if (k === 'autoSkin') applySkins();
});
$id('setList').addEventListener('input', e => {
  const k = e.target.dataset.k; if (!k) return;
  SETTINGS[k] = +e.target.value; $id('sv_' + k).textContent = Math.round(SETTINGS[k] * 100) + '%'; saveSettings();
  if (k === 'music' || k === 'sfx') applyVolumes();
});
function cancelKeyRebind() {   // 点了改键又直接离开设置：别让监听留着吞掉对局里按下的第一个键
  if (!rebindingKey) return;
  rebindingKey = null;
  window.removeEventListener('keydown', handleKeyRebind, true);
}
$id('setHelp').addEventListener('click', () => {
  cancelKeyRebind();
  if (settingsBack === 'pause' && M.mode !== 'demo') showScreen('help');
  else navTo('help');
});
$id('setDone').addEventListener('click', () => {
  cancelKeyRebind();
  if (settingsBack === 'pause' || (M.mode !== 'demo' && paused)) showScreen('pause');
  else backToMenu();
});
$id('pauseSet').addEventListener('click', () => {
  settingsBack = 'pause';
  paused = true;
  buildSettings();
  showScreen('settings');
});

