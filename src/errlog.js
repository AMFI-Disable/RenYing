// 刃影 前端错误上报：网页里出了没接住的错，记下来报给 Worker（POST /api/err），管理网页的「错误」页能查。
//   全局：window 的 error、unhandledrejection 都接
//   面板兜底：打开、切换页面时出错，页面上留一块「出了点问题」的提示，可以重试或回首页，不会白屏、卡死
//   脱敏：网址只留文件名，去掉查询串；邮箱、长串十六进制 / token、长数字都换成 *；不带昵称、账号、存档
//   采样：每次打开网页，同一条错误只报一次，最多报 5 条；RENYING_ERR_RATE（0 ~ 1）可以只让一部分网页上报
//   离线版（双击打开的 html）不上报，只做面板兜底
// 这个文件最先加载（在其他脚本前面），这样加载阶段的错也接得到。
(function () {
  'use strict';
  const ERR = { seen: new Set(), sent: 0, MAX: 5, busy: 0 };
  const rate = typeof window.RENYING_ERR_RATE === 'number' ? window.RENYING_ERR_RATE : 1;
  const build = window.RENYING_BUILD || {};
  ERR.on = !build.offline && /^https?:$/.test(location.protocol) && Math.random() < rate;

  // 去掉可能认得出人的东西；cap 是最多留几个字
  function scrub(s, cap) {
    return String(s == null ? '' : s)
      .replace(/(?:https?|file|blob|chrome-extension|moz-extension|webkit-masked-url):\/\/[^\s)'"]*?([^/\s)'"?#]*)(?:[?#][^\s)'":]*)?(?=[\s)'":]|$)/g, (m, f) => f || '(url)')
      .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '*@*')
      .replace(/\b(?:[0-9a-f]{20,}|[A-Za-z0-9_-]{32,})\b/g, '*')
      .replace(/\d{6,}/g, '*')
      .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
      .slice(0, cap);
  }
  // 浏览器只留大类和大版本（Chrome 130、Safari 18 这种），加上是不是手机
  function browser() {
    const ua = navigator.userAgent || '';
    const m = ua.match(/(Edg|OPR|Firefox|Chrome|CriOS|FxiOS)\/(\d+)/) || (/Safari\//.test(ua) && ua.match(/(Version)\/(\d+)/));
    const name = m ? ({ Edg: 'Edge', OPR: 'Opera', CriOS: 'Chrome', FxiOS: 'Firefox', Version: 'Safari' }[m[1]] || m[1]) + ' ' + m[2] : 'other';
    const os = /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'other';
    return name + ' / ' + os;
  }
  // 出错时在干什么：版本、哪一页、什么模式（都是游戏自己的变量，读不到就空着）
  function where(extra) {
    const g = k => { try { return k(); } catch (e) { return undefined; } };
    return Object.assign({
      ver: g(() => VERSION), scr: g(() => currentScreen), mode: g(() => M.mode), lang: g(() => I18N.getLang()),
      br: browser(), page: scrub(location.pathname, 80),
    }, extra || {});
  }
  function report(err, extra) {
    try {
      const e = err && typeof err === 'object' ? err : { message: String(err) };
      const msg = scrub(e.message || e.reason || e.type || '未知错误', 300);
      const src = scrub(e.filename ? `${e.filename}:${e.lineno || 0}:${e.colno || 0}` : (String(e.stack || '').split('\n').find(l => /:\d+:\d+/.test(l)) || '').trim(), 200);
      const key = msg + '|' + src;
      if (ERR.seen.has(key)) return false;
      ERR.seen.add(key);
      if (window.console && console.warn) console.warn('[刃影] 出错了：', err);
      if (!ERR.on || ERR.sent >= ERR.MAX) return false;
      const base = window.CloudSave && CloudSave.getEndpoint ? CloudSave.getEndpoint() : '';
      if (!base || typeof fetch !== 'function') return false;
      ERR.sent++;
      const body = JSON.stringify({ k: 'client', msg, src, stack: scrub(e.stack || '', 1500), meta: where(extra) });
      // text/plain：跨域不用先发预检；keepalive：关网页前的错也发得出去
      fetch(base + '/api/err', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body, keepalive: true, credentials: 'omit' }).catch(() => {});
      return true;
    } catch (x) { return false; }
  }
  window.addEventListener('error', ev => {
    if (ev.target && ev.target !== window && ev.target.tagName) return;   // 图片、脚本加载失败：各自有备用方案，不算错
    const e = ev.error;
    report({ message: (e && e.message) || ev.message, stack: e && e.stack, filename: ev.filename, lineno: ev.lineno, colno: ev.colno });
  }, true);
  window.addEventListener('unhandledrejection', ev => {
    const r = ev.reason;
    report(r && typeof r === 'object' ? { message: 'Promise：' + (r.message || r.name || '未知错误'), stack: r.stack } : { message: 'Promise：' + String(r) });
  });

  // ---------- 面板兜底 ----------
  function panelFail(id, err) {
    const el = id && document.getElementById(id);
    if (!el) return;
    try { if (!el.classList.contains('on')) window.showScreen(id); } catch (x) {}   // 切页本身出的错：至少让这一页露出来
    el.classList.add('on');
    const old = el.querySelector(':scope > .err-fallback');
    if (old) old.remove();
    const box = document.createElement('div');
    box.className = 'err-fallback';
    box.setAttribute('role', 'alert');
    const p = document.createElement('p');
    p.textContent = '这个页面出了点问题，已经记录下来了。';
    box.appendChild(p);
    const btn = (text, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'ghost'; b.textContent = text; b.addEventListener('click', fn); box.appendChild(b); return b; };
    btn('重试', () => { box.remove(); window.openScreen ? openScreen(id) : showScreen(id); }).focus();
    if (id !== 'menu') btn('回到首页', () => { box.remove(); showScreen('menu'); });
    else btn('刷新网页', () => location.reload());
    el.appendChild(box);
  }
  // fn 出错时：上报、把 id 这一页留在屏幕上并放上提示，不往外抛（外面的人按“打开了”继续）
  function guard(name, idOf) {
    const fn = window[name];
    if (typeof fn !== 'function' || fn.__guarded) return;
    const g = function (...a) {
      if (ERR.busy > 2) return fn.apply(this, a);   // 兜底的按钮又出错：别无限套娃
      ERR.busy++;
      try { return fn.apply(this, a); }
      catch (e) {
        report(e, { panel: String(idOf(a) || '') });
        try { panelFail(idOf(a), e); } catch (x) {}
        return idOf(a);
      } finally { ERR.busy--; }
    };
    g.__guarded = true;
    window[name] = g;
  }
  // 等页面上的脚本都跑完再包：showScreen（切页）、openScreen（从首页、顶栏打开一页）
  function guardPanels() {
    guard('showScreen', a => a[0]);
    guard('openScreen', a => (document.getElementById(a[0]) ? a[0] : 'single'));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', guardPanels, { once: true });
  else guardPanels();

  ERR.report = report; ERR.scrub = scrub; ERR.panelFail = panelFail; ERR.guardPanels = guardPanels;
  window.ERR = ERR;
})();
