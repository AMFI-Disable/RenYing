// ======================= 通用界面状态与弹窗 =======================
// 本文件：通用界面组件：空状态 / 出错状态（uiState）、确认框（uiConfirm）、弹窗打开时的焦点管理（uiDlgWatch）。
// ======================= 通用界面组件：空 / 出错 / 加载状态、确认框、弹窗焦点 =======================
// 空列表、连不上、正在加载：各页统一用 uiState 画，读屏软件能听到（出错用 alert，其余用 status）。
// 文字单独放一个节点，中英文切换按原句整句对得上。extra 是额外的 class，用来保留各页原来的位置写法。
function uiState(kind, text, extra = '') {
  const role = kind === 'error' ? 'alert' : 'status';
  return `<div class="ui-state ui-${kind}${extra ? ' ' + extra : ''}" role="${role}"${kind === 'loading' ? ' aria-busy="true"' : ''}><i class="ui-state-ic" aria-hidden="true"></i><span>${escapeHTML(text)}</span></div>`;
}
// 确认框：代替浏览器自带的 confirm()（那个框不跟游戏的样式，手机上还会把全屏顶掉）。
// 返回 Promise<boolean>。默认选中「取消」，Esc、点遮罩都算取消；Enter 按下当前选中的按钮。
// opt.title 是标题；opt.html 是调用方自己拼好（名字已转义）的正文，带墨锭图标、加粗这些，给了就不用 msg。
// opt.input 给了就多一个输入框（代替 prompt()）：{ type, placeholder, autocomplete }，返回输入的字，取消返回 null。
// opt.alert 为真就只有一个「知道了」（代替 alert()），选中它，关掉都返回 true。
function uiConfirm(msg, opt = {}) {
  return new Promise(resolve => {
    const prev = document.activeElement;
    const wrap = document.createElement('div');
    wrap.className = 'ui-confirm'; wrap.setAttribute('role', 'alertdialog'); wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-labelledby', 'uiConfirmMsg');
    const io = opt.input;
    wrap.innerHTML = `<div class="ui-confirm-box">${opt.title ? `<h3>${escapeHTML(opt.title)}</h3>` : ''}<p id="uiConfirmMsg"></p>${io ? `<input class="ui-confirm-in" aria-labelledby="uiConfirmMsg" type="${io.type === 'password' ? 'password' : 'text'}" autocomplete="${escapeHTML(io.autocomplete || 'off')}" placeholder="${escapeHTML(io.placeholder || '')}">` : ''}<div class="row">
      ${opt.alert ? '' : `<button type="button" class="ghost" data-v="0">${escapeHTML(opt.cancel || '取消')}</button>`}
      <button type="button" class="go${opt.danger ? ' danger' : ''}" data-v="1">${escapeHTML(opt.ok || (opt.alert ? '知道了' : '确定'))}</button></div></div>`;
    if (opt.html) wrap.querySelector('p').innerHTML = opt.html; else wrap.querySelector('p').textContent = msg;
    const inp = wrap.querySelector('.ui-confirm-in');
    const done = v => {
      const out = opt.alert || (inp ? (v ? inp.value : null) : v);
      wrap.remove(); window.removeEventListener('keydown', key, true);
      try { if (prev && prev.isConnected) prev.focus({ preventScroll: true }); } catch (e) {}
      resolve(out);
    };
    const key = e => {
      if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); done(false); }
      else if (inp && document.activeElement === inp && (e.code === 'Enter' || e.code === 'NumpadEnter') && !e.isComposing) { e.preventDefault(); e.stopImmediatePropagation(); done(true); }
      else if (e.code === 'Tab') {   // 焦点只在弹窗里转（输入框和按钮）
        e.preventDefault(); e.stopImmediatePropagation();
        const bs = [...wrap.querySelectorAll('input, button')], i = bs.indexOf(document.activeElement);
        bs[(i + (e.shiftKey ? bs.length - 1 : 1)) % bs.length].focus();
      }
    };
    wrap.addEventListener('click', e => { const b = e.target.closest('button[data-v]'); if (b) done(b.dataset.v === '1'); else if (e.target === wrap) done(false); });
    window.addEventListener('keydown', key, true);
    document.body.appendChild(wrap);
    (inp || wrap.querySelector('button[data-v="0"]') || wrap.querySelector('button[data-v="1"]')).focus({ preventScroll: true });
  });
}
// 弹窗焦点：弹窗一出来就把焦点放进去（读屏和键盘都从弹窗里开始），关掉以后回到打开它的那个按钮
const UI_DIALOGS = ['rkInfo', 'rkReveal', 'modal2v2', 'modalRouge', 'modalWorld', 'arModal', 'arIns'];
const uiDlgOpen = el => el.isConnected && !el.hidden && !el.classList.contains('hidden');
const uiDlgPrev = new Map();
function uiDlgWatch(el) {
  if (!el || typeof el.hasAttribute !== 'function' || typeof MutationObserver !== 'function') return;   // 测试用的简化页面没有这些：直接跳过
  if (!el.hasAttribute('role')) el.setAttribute('role', 'dialog');
  if (!el.hasAttribute('aria-modal')) el.setAttribute('aria-modal', 'true');
  if (!el.hasAttribute('tabindex')) el.tabIndex = -1;
  let was = uiDlgOpen(el);
  new MutationObserver(() => {
    const now = uiDlgOpen(el); if (now === was) return; was = now;
    if (now) {
      uiDlgPrev.set(el, document.activeElement);
      requestAnimationFrame(() => {   // 等内容画好再找按钮
        if (!uiDlgOpen(el) || el.contains(document.activeElement)) return;
        const t = el.querySelector('[data-kb-default]') || el.querySelector('button:not([disabled]), [href], input, select, textarea') || el;
        try { t.focus({ preventScroll: true }); } catch (e) {}
      });
    } else {
      const p = uiDlgPrev.get(el); uiDlgPrev.delete(el);
      if (p && p.isConnected && (!document.activeElement || document.activeElement === document.body || el.contains(document.activeElement))) { try { p.focus({ preventScroll: true }); } catch (e) {} }
    }
  }).observe(el, { attributes: true, attributeFilter: ['class', 'hidden'] });
}
for (const id of UI_DIALOGS) uiDlgWatch($id(id));
