// ======================= 通用加载幕（RYLoad） =======================
// 本文件：把一块"正在载入"的水墨幕盖在某个容器上，等东西好了再收起。启动画面是 src/page.html 里的 #boot，样式共用 .ry-* 那一套。
// 用法：RYLoad.show(容器, '中文提示')；好了调 RYLoad.hide(容器)。幕至少停 450 毫秒，免得一闪而过像卡了；久等会多出一行提示。
// 现在用在：青锋行 iframe（src/game/02-combat/11-loop-02-step.js 的 openQfx）。新的慢操作也走这里，不要各写各的转圈。
// 找 bug 提示：幕不消失，看调用方有没有在成功和失败两条路上都调 hide。
const RYLoad = (() => {
  const MIN_MS = 450, HINT_MS = 9000, live = new Map();
  function build(label) {
    const el = document.createElement('div');
    el.className = 'ry-veil hidden'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
    el.innerHTML = '<i class="ry-moon"></i><i class="ry-mist"></i><i class="ry-fly"></i><i class="ry-fly"></i><i class="ry-fly"></i>'
      + '<div class="ry-core"><div class="ry-seal">刃</div><div class="ry-bar"><i class="ry-fill"></i></div>'
      + '<p class="ry-msg"></p><p class="ry-hint" hidden></p></div>';
    el.querySelector('.ry-msg').textContent = cvT(label);
    el.querySelector('.ry-hint').textContent = cvT('载入太久？检查一下网络再试');
    el.querySelector('.ry-fill').style.transform = 'scaleX(.6)';
    return el;
  }
  function show(host, label) {
    if (!host) return;
    hide(host, true);
    const el = build(label || '正在载入');
    host.appendChild(el);
    void el.offsetWidth; el.classList.remove('hidden');   // 先放进去再去掉 hidden，淡入才会播
    live.set(host, { el, at: performance.now(), hint: setTimeout(() => { const h = el.querySelector('.ry-hint'); if (h) h.hidden = false; }, HINT_MS) });
  }
  function hide(host, now) {
    const st = live.get(host); if (!st) return;
    live.delete(host); clearTimeout(st.hint);
    const gone = () => { st.el.classList.add('hidden'); setTimeout(() => { if (st.el.parentNode) st.el.parentNode.removeChild(st.el); }, 400); };
    if (now) { if (st.el.parentNode) st.el.parentNode.removeChild(st.el); return; }
    const wait = Math.max(0, MIN_MS - (performance.now() - st.at));
    setTimeout(gone, wait);
  }
  return { show, hide };
})();
