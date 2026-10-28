// ======================= 纯键盘：菜单、弹窗、点将台、暂停和结算都不用鼠标 =======================
// 当前页面（有弹窗时只在最上层弹窗里）：方向键或 WASD 按位置移动选中框，Enter / 空格按下，Esc 返回，Tab 按顺序走。
// 按过这些键就进入键盘模式，页面上始终有一个金色选中框；用鼠标或手指点一下就退出（选中框隐藏），鼠标、触屏照旧。
// 对局中（没有页面盖在上面）键盘照旧是出招，这里一概不管。
const KBN = { on: false, root: null, key: '', rect: null, mem: new Map() };
const KBN_FOCUSABLE = 'button, a[href], input:not([type="hidden"]), select, textarea, summary, [tabindex]:not([tabindex="-1"])';
const KBN_DIR = { ArrowUp: 'u', ArrowDown: 'd', ArrowLeft: 'l', ArrowRight: 'r', KeyW: 'u', KeyS: 'd', KeyA: 'l', KeyD: 'r' };
const KBN_DIALOGS = '.rk-info:not(.hidden), .rk-reveal:not(.hidden), #arModal:not([hidden]), #arIns:not([hidden]), .ui-confirm, #kbHelp:not([hidden])';
const KBN_BACK = { bp: 'bpQuit', acc: 'accBack', lb: 'lbBack', replays: 'rpBack', settings: 'setDone', towerModal: '' };   // 各页的返回键；空串表示这一页 Esc 不返回
const kbnRing = document.createElement('div');
kbnRing.id = 'kbRing'; kbnRing.setAttribute('aria-hidden', 'true');
document.body.appendChild(kbnRing);

function kbnShown(el) {
  if (!el || !el.isConnected || el.closest('[hidden], .hidden')) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  return getComputedStyle(el).visibility !== 'hidden';
}
// 键盘该在哪些地方走：最上层的弹窗；否则是当前页面，加上顶栏和右上角账号栏
function kbnRoots() {
  const dlg = [...document.querySelectorAll(KBN_DIALOGS)].filter(d => { const s = d.closest('.scr'); return (!s || s.classList.contains('on')) && kbnShown(d); }).pop();
  if (dlg) return [dlg];
  const scr = [...document.querySelectorAll('.scr.on')].pop();
  if (!scr) return REPLAY.on && kbnShown($id('rpBar')) ? [$id('rpBar')] : null;
  const roots = [scr];
  for (const id of ['topNav', 'accBar']) if (kbnShown($id(id))) roots.push($id(id));
  return roots;
}
function kbnCands(roots) {
  const out = [];
  for (const r of roots) for (const el of r.querySelectorAll(KBN_FOCUSABLE)) if (!el.disabled && el.tabIndex >= 0 && kbnShown(el)) out.push(el);
  return out;
}
// 记住选中的是哪一个：页面重画（innerHTML 换掉）以后按 id / data-* 找回同一个
function kbnKey(el) {
  if (el.id) return '#' + CSS.escape(el.id);
  let s = '';
  for (const a of el.attributes) if (a.name.startsWith('data-') && a.name !== 'data-kb-default' && a.value.length < 60) s += `[${a.name}="${CSS.escape(a.value)}"]`;
  if (!s) return '';
  const p = el.parentElement && el.parentElement.closest('[id]');
  return (p ? '#' + CSS.escape(p.id) + ' ' : '') + el.tagName.toLowerCase() + s;
}
function kbnFocus(el) {
  if (!el) return;
  try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
  try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) {}
  kbnRemember(el);
  kbnRingDraw();
}
function kbnRemember(el) {
  const roots = kbnRoots(); if (!roots) return;
  const root = roots.find(r => r.contains(el)); if (!root) return;
  KBN.root = roots[0]; KBN.key = kbnKey(el); KBN.rect = el.getBoundingClientRect();
  KBN.mem.set(roots[0], el);
}
// 一进页面先选中哪个：上次在这一页选的 → 标了 data-kb-default 的 → 主按钮 → 第一个
function kbnDefault(roots, cands) {
  const main = roots[0], mine = cands.filter(el => main.contains(el));
  const prev = KBN.mem.get(main);
  if (prev && mine.includes(prev)) return prev;
  if (main.id === 'bp') {
    const card = main.querySelector('#bpGrid .bpcard.sel') || main.querySelector('#bpGrid .bpcard:not([aria-disabled])');
    if (card && mine.includes(card)) return card;
  }
  return mine.find(el => el.hasAttribute('data-kb-default')) || mine.find(el => el.matches('.go, .mm-go')) || mine.find(el => !el.matches('[data-back]')) || mine[0] || cands[0] || null;
}
function kbnRestore(roots, cands) {
  if (KBN.root === roots[0] && KBN.key) {
    const same = cands.find(el => el.matches(KBN.key));
    if (same) return same;
  }
  if (KBN.root === roots[0] && KBN.rect) {   // 原来那个没了（列表重画、按钮藏起来）：选离原位置最近的
    const cx = KBN.rect.left + KBN.rect.width / 2, cy = KBN.rect.top + KBN.rect.height / 2;
    let best = null, bd = Infinity;
    for (const el of cands) { const r = el.getBoundingClientRect(), d = Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy); if (d < bd) { bd = d; best = el; } }
    if (best) return best;
  }
  return kbnDefault(roots, cands);
}
// 按方向找下一个：这个方向上离得近的、和当前这个横（竖）向有重叠的优先；
// 只有中心点在那一边、身子还压着当前这个的（错位叠着的按钮），要多算一段距离
function kbnPick(cands, cur, dir) {
  const a = cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2, horiz = dir === 'l' || dir === 'r';
  let best = null, bs = Infinity;
  for (const el of cands) {
    if (el === cur || el.contains(cur) || cur.contains(el)) continue;
    const b = el.getBoundingClientRect(), bx = b.left + b.width / 2, by = b.top + b.height / 2;
    const ahead = dir === 'r' ? bx - ax : dir === 'l' ? ax - bx : dir === 'd' ? by - ay : ay - by;
    if (ahead <= 2) continue;
    const beyond = dir === 'r' ? b.left >= a.right - 8 : dir === 'l' ? b.right <= a.left + 8 : dir === 'd' ? b.top >= a.bottom - 8 : b.bottom <= a.top + 8;
    const gap = Math.max(0, dir === 'r' ? b.left - a.right : dir === 'l' ? a.left - b.right : dir === 'd' ? b.top - a.bottom : a.top - b.bottom);
    const overlap = horiz ? Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) : Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const off = horiz ? Math.abs(by - ay) : Math.abs(bx - ax);
    const s = gap + (overlap > 0 ? off * 0.25 : 40 + off * 2) + (beyond ? 0 : 200);
    if (s < bs) { bs = s; best = el; }
  }
  return best;
}
function kbnOn() {
  if (KBN.on) return;
  KBN.on = true; document.body.classList.add('kbnav');
  requestAnimationFrame(kbnRingLoop);
}
function kbnOff() {
  if (!KBN.on || kbOnly()) return;   // 纯键盘模式：鼠标点了选中框也不收
  KBN.on = false; document.body.classList.remove('kbnav'); kbnRing.classList.remove('on');
}
function kbnRingDraw() {
  const el = document.activeElement, roots = KBN.on && kbnRoots();
  if (!roots || !el || el === document.body || !roots.some(r => r.contains(el)) || !kbnShown(el)) { kbnRing.classList.remove('on'); return; }
  const r = el.getBoundingClientRect();
  Object.assign(kbnRing.style, { left: `${r.left - 4}px`, top: `${r.top - 4}px`, width: `${r.width + 8}px`, height: `${r.height + 8}px` });
  kbnRing.classList.add('on');
}
function kbnRingLoop() { if (!KBN.on) return; kbnRingDraw(); requestAnimationFrame(kbnRingLoop); }
// 键盘模式下页面换了、列表重画了、弹窗关了：马上把选中框放回去，不用先按一下才看得到
function kbnTick() {
  if (!KBN.on) return;
  const roots = kbnRoots(); if (!roots) return;
  const ae = document.activeElement;
  if (ae && ae !== document.body && roots.some(r => r.contains(ae)) && kbnShown(ae)) return;
  const cands = kbnCands(roots);
  if (cands.length) kbnFocus(kbnRestore(roots, cands));
}
setInterval(kbnTick, 120);
// Esc：关弹窗，或者回上一页
function kbnBack(roots) {
  const main = roots[0];
  if (main.id === 'arModal' || main.id === 'arIns') return false;   // 武库自己会用 Esc 收起弹窗和检视
  if (main.id === 'kbHelp') { kbHelpShow(false); return true; }
  const close = main.matches('.rk-info, .rk-reveal') && [...main.querySelectorAll('#modal2v2Close, #modalRougeClose, .mm-cancel, [data-close]')].find(kbnShown);
  if (close) { close.click(); return true; }
  if (!main.classList.contains('scr')) return false;
  const id = main.id;
  if (id === 'pause' || id === 'end' || id === 'sagaTalk' || id === 'menu') return false;   // 暂停、结算、剧情对话有自己的 Esc
  if (id === 'bp' && bpMode === 'net') return false;   // 联机禁选时按 Esc 不会把人带出房间
  const btn = KBN_BACK[id] !== undefined ? (KBN_BACK[id] && $id(KBN_BACK[id])) : [...main.querySelectorAll('[data-back]')].find(kbnShown);
  if (KBN_BACK[id] === '') return true;
  if (btn && kbnShown(btn)) { btn.click(); return true; }
  if (MENU_SCREENS.includes(id) || NAV_SCREENS.includes(id)) { backToMenu(); return true; }
  return false;
}
window.addEventListener('keydown', e => {
  if (typeof rebindingKey !== 'undefined' && rebindingKey) return;   // 设置里正在改键，按键全给它
  if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
  const roots = kbnRoots();
  if (!roots) { if (e.isTrusted && e.code !== 'KeyM') kbnOn(); return; }   // 对局中用键盘打的人，暂停、结算页一出来就有选中框
  const t = e.target, tag = t && t.tagName, type = t && t.type;
  const typing = tag === 'TEXTAREA' || (tag === 'INPUT' && !/^(button|checkbox|radio|range|submit|reset|color|file)$/i.test(type));
  const cands = kbnCands(roots), inside = cands.includes(document.activeElement);
  const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
  const dir = KBN_DIR[e.code];
  if ((e.code === 'F1' || (e.key === '?' && !typing)) && !e.repeat) { stop(); kbOnly() && kbnOn(); kbHelpShow($id('kbHelp').hidden); return; }
  if (e.code === 'Escape') {
    if (typing) {   // 先离开输入框，再按一次才返回
      const next = kbnPick(cands, t, 'd') || kbnPick(cands, t, 'u');
      t.blur(); kbnOn(); stop(); if (next) kbnFocus(next);
      return;
    }
    if (kbnBack(roots)) { kbnOn(); stop(); }
    return;
  }
  if (e.code === 'Tab') {
    if (!cands.length) return;
    kbnOn(); stop();
    const i = cands.indexOf(document.activeElement);
    kbnFocus(i < 0 ? kbnRestore(roots, cands) : cands[(i + (e.shiftKey ? -1 : 1) + cands.length) % cands.length]);
    return;
  }
  if (dir) {
    if (typing && !(e.code === 'ArrowUp' || e.code === 'ArrowDown')) return;   // 输入框里左右键、WASD 是打字
    if (tag === 'INPUT' && type === 'range' && (dir === 'l' || dir === 'r')) {   // 滑块：左右调大小
      if (e.code.startsWith('Key')) { if (dir === 'l') t.stepDown(); else t.stepUp(); t.dispatchEvent(new Event('input', { bubbles: true })); t.dispatchEvent(new Event('change', { bubbles: true })); stop(); }
      kbnOn(); return;
    }
    if (tag === 'SELECT' && (dir === 'l' || dir === 'r')) {   // 下拉框：左右换选项，上下照常走开
      const n = t.selectedIndex + (dir === 'l' ? -1 : 1);
      if (n >= 0 && n < t.options.length) { t.selectedIndex = n; t.dispatchEvent(new Event('change', { bubbles: true })); }
      kbnOn(); stop(); return;
    }
    if (!cands.length) return;
    kbnOn(); stop();
    if (!inside) { kbnFocus(kbnRestore(roots, cands)); return; }
    const next = kbnPick(cands, document.activeElement, dir);
    if (next) kbnFocus(next);
    else kbnRingDraw();
    return;
  }
  if (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') {
    if (typing) return;
    if (!inside) {   // 还没选中任何东西：这一下先把选中框亮出来（暂停、结算页的快捷键照旧）
      const scr = roots[0].id;
      if (scr === 'pause' || scr === 'end' || scr === 'rpBar' || !cands.length) return;
      kbnOn(); stop(); kbnFocus(kbnRestore(roots, cands)); return;
    }
    kbnOn();
    e.stopImmediatePropagation();   // 按下的是选中的按钮，别再被当成游戏快捷键
    if (e.repeat) { e.preventDefault(); return; }   // 按住不放不连点
    const el = document.activeElement;
    const native = el.matches('button, a[href], summary, select, input[type="button"], input[type="submit"], input[type="reset"]') || (e.code === 'Space' && el.matches('input[type="checkbox"], input[type="radio"]'));
    if (!native) { e.preventDefault(); el.click(); }
  }
}, true);
document.addEventListener('focusin', e => { if (KBN.on) kbnRemember(e.target); });
window.addEventListener('pointerdown', e => { if (e.isTrusted) kbnOff(); }, true);

// ======================= 纯键盘模式：设置里的开关（首页次入口也有一个） =======================
// 打开后选中框一直亮着，用鼠标点了也不收；按 ? 或 F1 看快捷键；对局里鼠标不再出招，1P 只用键盘的攻击键。记在本机设置里。
if (SETTINGS.kbOnly === undefined) SETTINGS.kbOnly = false;
function kbOnly() { return SETTINGS.kbOnly === true; }
function kbOnlyApply() {
  try { document.body.classList.toggle('kb-only', kbOnly()); } catch (e) {}
  const b = $id('mKbOnly'); if (b && b.setAttribute) b.setAttribute('aria-pressed', kbOnly() ? 'true' : 'false');
  if (kbOnly()) kbnOn();
}
function kbOnlySet(on) {
  SETTINGS.kbOnly = !!on; saveSettings(); kbOnlyApply();
  toast(on ? '纯键盘模式已打开：方向键走、Enter 按下、Esc 返回，按 ? 看快捷键' : '纯键盘模式已关闭', on ? 4 : 2.6);
}
// 快捷键说明：菜单里的走法，加上 1P 对局按键（跟着设置里改过的键走）
const kbHelp = document.createElement('div');
kbHelp.id = 'kbHelp'; kbHelp.className = 'kb-help'; kbHelp.hidden = true;
if (kbHelp.setAttribute) { kbHelp.setAttribute('role', 'dialog'); kbHelp.setAttribute('aria-modal', 'true'); kbHelp.setAttribute('aria-label', '快捷键'); }
document.body.appendChild(kbHelp);
const kbHint = document.createElement('button');
kbHint.id = 'kbHint'; kbHint.type = 'button'; kbHint.className = 'kb-hint'; kbHint.textContent = '? 快捷键';
document.body.appendChild(kbHint);
if (kbHint.addEventListener) kbHint.addEventListener('click', () => kbHelpShow(true));
let kbHelpFrom = null;
function kbHelpShow(on) {
  if (on) {
    const k = a => escapeHTML(keyLabel(custom1PKeys[a]));
    const row = (t, d) => `<dt>${t}</dt><dd>${d}</dd>`;
    kbHelp.innerHTML = `<div class="kb-help-box"><div class="kb-help-head"><b>快捷键</b><button class="ghost small" type="button" data-close>关闭</button></div>
      <div class="kb-help-cols"><dl><dt class="kb-help-h">菜单和弹窗</dt>${row('移动选中框', '<kbd>↑↓←→</kbd> 或 <kbd>WASD</kbd>')}${row('按下', '<kbd>Enter</kbd> 或 <kbd>空格</kbd>')}${row('返回 / 关弹窗', '<kbd>Esc</kbd>')}${row('按顺序走', '<kbd>Tab</kbd>')}${row('滑块、下拉框', '<kbd>←</kbd> <kbd>→</kbd> 调')}${row('这张说明', '<kbd>?</kbd> 或 <kbd>F1</kbd>')}</dl>
      <dl><dt class="kb-help-h">对局（1P）</dt>${row('移动', `<kbd>${k('left')}</kbd> <kbd>${k('right')}</kbd>`)}${row('跳跃', `<kbd>${k('jump')}</kbd>`)}${row('防御', `<kbd>${k('down')}</kbd>`)}${row('攻击 / 蓄力', `<kbd>${k('atk')}</kbd>`)}${row('腾空闪', `<kbd>${k('dash')}</kbd>`)}${row('技能', `<kbd>${k('skill')}</kbd>`)}${row('远程招式', `<kbd>${k('skill2')}</kbd>`)}${row('大招', `<kbd>${k('special')}</kbd>`)}${row('暂停 / 静音', '<kbd>P</kbd> / <kbd>M</kbd>')}</dl></div>
      <p class="kb-help-foot">${kbOnly() ? '纯键盘模式开着：选中框一直亮，对局里鼠标不出招。' : '在设置里打开「纯键盘模式」，选中框会一直亮着，对局里鼠标不出招。'}键位在设置里改。</p></div>`;
    kbHelpFrom = document.activeElement;
    kbHelp.hidden = false;
    const c = kbHelp.querySelector('[data-close]');
    c.addEventListener('click', () => kbHelpShow(false));
    kbnFocus(c);
  } else if (!kbHelp.hidden) {
    kbHelp.hidden = true;
    if (kbHelpFrom && kbHelpFrom.isConnected && kbHelpFrom.focus) kbnFocus(kbHelpFrom);
    kbHelpFrom = null;
  }
}
if (kbHelp.addEventListener) kbHelp.addEventListener('click', e => { if (e.target === kbHelp) kbHelpShow(false); });
if ($id('mKbOnly')) $id('mKbOnly').addEventListener('click', () => kbOnlySet(!kbOnly()));
kbOnlyApply();
