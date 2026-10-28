// 刃影 国际化多语言支持模块 (i18n)
// 支持简体中文 (zh) 与英文 (en)，默认中文，支持设置与初次启动语言偏好引导

(function() {
  'use strict';

  // 中文 → 英文的词条表在 src/data/30-ui-copy.js（UI_COPY_EN）。它和游戏主体拼在一起，比这个文件晚加载，
  // 所以每次用到时再去取；还没加载好就当作空表（照样显示中文）。
  function dictEn() {
    return typeof UI_COPY_EN === 'object' && UI_COPY_EN ? UI_COPY_EN : {};
  }

  // 当前语言：'zh' 或 'en'
  let currentLang = 'zh';

  function initLang() {
    try {
      const saved = localStorage.getItem('renying-lang');
      if (saved === 'en' || saved === 'zh') {
        currentLang = saved;
      } else {
        // 尝试从 SETTINGS 中读取
        const s = JSON.parse(localStorage.getItem('renying-settings') || '{}');
        if (s.lang === 'en' || s.lang === 'zh') {
          currentLang = s.lang;
        } else {
          currentLang = 'zh'; // 默认中文
        }
      }
    } catch (e) {
      currentLang = 'zh';
    }
  }

  initLang();

  function getLang() {
    return currentLang;
  }

  function setLang(lang) {
    if (lang !== 'en' && lang !== 'zh') lang = 'zh';
    currentLang = lang;
    try {
      localStorage.setItem('renying-lang', lang);
      const s = JSON.parse(localStorage.getItem('renying-settings') || '{}');
      s.lang = lang;
      localStorage.setItem('renying-settings', JSON.stringify(s));
    } catch (e) {}

    if (typeof window !== 'undefined' && window.SETTINGS) {
      window.SETTINGS.lang = lang;
    }

    applyTranslations();

    // 触发页面内各类动态组件重新渲染
    try { if (typeof renderTopNav === 'function') renderTopNav(); } catch (e) {}
    try { if (typeof renderHome === 'function') renderHome(); } catch (e) {}
    try { if (typeof buildSettings === 'function') buildSettings(); } catch (e) {}
    try { if (typeof renderTasks === 'function') renderTasks(); } catch (e) {}
    try { if (typeof renderCodex === 'function') renderCodex(); } catch (e) {}
    try { if (typeof renderAccPage === 'function') renderAccPage(); } catch (e) {}
    try { if (typeof updateAIBrief === 'function') updateAIBrief(); } catch (e) {}
    try { if (typeof singleSec === 'function' && typeof currentSingleTab !== 'undefined') singleSec(currentSingleTab); } catch (e) {}
    try { if (typeof renderLobby === 'function') renderLobby(); } catch (e) {}
  }

  // 数字是拼进去的句子（"剩余 25 天 6 小时"、"全服 12 人在线"），整句查表永远查不到，
  // 这里按模板换：$1 之类照常可用，也可以直接给一个替换函数。
  const EN_DUR = s => String(s).replace(/(\d+)\s*天/g, '$1d').replace(/(\d+)\s*小时/g, '$1h').replace(/(\d+)\s*分(?:钟)?/g, '$1m');
  const PATTERNS_EN = [
    [/^今日\s*(\d+)\/(\d+)(?:\s*·\s*可领\s*(\d+)\s*墨锭)?$/, (m0, a, b, c) => `Today ${a}/${b}` + (c ? ` · ${c} Ink to claim` : '')],
    [/^(.+?)\s*位侠士在线$/, (m0, n) => `${n} ${n === '1' ? 'warrior' : 'warriors'} online`],
    [/^剩\s*(\d+)\s*天$/, (m0, d) => `${d}d left`],
    [/^全服\s*(.+?)\s*人在线$/, (m0, n) => `Global · ${n} online`],
    [/^(\d+)\s*人在线\s*·\s*(.+)$/, (m0, n, rest) => `${n} online · ${lookup(rest) || rest}`],
    [/^对局中\s*(\d+)\s*人(?:\s*·\s*匹配中\s*(\d+)\s*人)?$/, (m0, p, w) => `${p} in matches` + (w ? ` · ${w} queuing` : '')],
    [/^(.+?)\s*人在线$/, (m0, n) => `${n} online`],
    [/^(\d+\.\d+\s*[–-]\s*\d+\.\d+)\s*·\s*剩余\s*(.+)$/, (m0, span, left) => `${span} · ${EN_DUR(left)} left`],
    [/^剩余\s*(\d.*)$/, (m0, left) => `${EN_DUR(left)} left`],
    [/^第一赛季\s*(\d.*?)\s*后开启(（[^）]*）)?$/, (m0, left, tail) => `Season 1 starts in ${EN_DUR(left)}${tail ? ' (preseason rating resets)' : ''}`],
    [/^全皮肤限免\s*·\s*剩\s*(\d+)\s*天$/, (m0, d) => `All skins free · ${d}d left`],
    [/^赛季已结束$/, () => 'Season over'],
    [/^训练集：(.+?)\s*个样本$/, (m0, n) => `Training set: ${n} samples`],
    [/^(\d+)\s*个样本$/, (m0, n) => `${n} samples`],
    [/^(.+?)\s*个样本\s*·\s*(.+)$/, (m0, n, rest) => `${n} samples · ${rest}`],
    // 匹配：计时后面的范围、排位、邀请、版本不符
    [/^(\d+:\d{2}) · 全服随机$/, (m0, t) => `${t} · Anyone online`],
    [/^(\d+:\d{2}) · 匹配范围 (.+?)(?:–(.+?))? 段$/, (m0, t, a, b) => `${t} · Range ${lookup(a) || a}${b ? `–${lookup(b) || b}` : ''}`],
    [/^排位赛：(.+)$/, (m0, r) => `Competitive: ${lookup(r) || r}`],
    [/^定级赛 (\d+)\/(\d+) · ～(\d+) 分$/, (m0, a, b, c) => `Placement ${a}/${b} · ~${c} pts`],
    [/^([A-Z]\d*) · (.+?) · ([\d,]+) 分$/, (m0, l, n, p) => `${l} · ${lookup(n) || n} · ${p} pts`],
    [/^检测到邀请房间码 (\S+)，正在自动加入…$/, (m0, c) => `Invite room code ${c} found, joining…`],
    [/^中途离开排位赛，判负（(.+?) 分）$/, (m0, d) => `Left a ranked match early: counted as a loss (${d} pts)`],
    [/^你的版本与房主不同（房主是 (.+?)），刷新网页再试$/, (m0, v) => `Your version differs from the host's (${v}). Refresh the page and try again`],
    // 选人页（BP）：步骤、倒计时、侠客数值
    [/^第\s*(\d+)\s*\/\s*(\d+)\s*步$/, (m0, a, b) => `Step ${a} / ${b}`],
    [/^(\d+)\s*\/\s*(\d+)\s*步$/, (m0, a, b) => `${a} / ${b} steps`],
    [/^(\d+(?:\.\d+)?)\s*秒$/, (m0, n) => `${n}s`],
    [/^（冷却\s*(\d+(?:\.\d+)?)\s*秒）$/, (m0, n) => ` (cooldown ${n}s)`],
    [/^(.+?)禁用一名侠客$/, (m0, w) => `${lookup(w) || w} · Ban a hero`],
    [/^(.+?)选择出战侠客$/, (m0, w) => `${lookup(w) || w} · Pick a hero`],
    [/^(.+?)钦点【(.+?)】出战$/, (m0, w, r) => `${lookup(w) || w} · Pick the ${lookup(r) || r}`],
    [/^禁 (.+)$/, (m0, n) => `Ban · ${lookup(n) || n}`],
    [/^选择 (.+)$/, (m0, n) => `Pick ${lookup(n) || n}`],
    [/^禁用 (.+)$/, (m0, n) => `Ban ${lookup(n) || n}`],
    [/^\+(\d+) 墨锭$/, (m0, n) => `+${n} Ink`],
    [/^皮肤 · (.+)$/, (m0, n) => `Skin · ${lookup(n) || n}`],
    [/^生命 (\d+)$/, (m0, n) => `HP ${n}`],
    [/^体量 ([\d.]+)$/, (m0, n) => `Build ${n}`],
    [/^移速 ([\d.]+)$/, (m0, n) => `Speed ${n}`],
    [/^耐力 (\d+) · 稳定 (\d+)% · 透伤 (\d+)% · 回涌 (\d+)\/秒$/, (m0, a, b, c, d) => `Guard ${a} · Stability ${b}% · Chip ${c}% · Regen ${d}/s`],
    [/^· 伤害 ([\d.]+)(?: \((\d+)段\))?$/, (m0, d, n) => `· Damage ${d}${n ? ` (${n} hits)` : ''}`],
    [/^([QRE]) · (.+?)(?: \[(.+)\])?$/, (m0, k, n, t) => `${k} · ${lookup(n) || n}${t ? ` [${lookup(t) || t}]` : ''}`],
    [/^(.+?) \[(.+)\]$/, (m0, n, t) => `${lookup(n) || n} [${lookup(t) || t}]`],
    [/^(2v2 .+?) · (凯旋大捷！|惜败，择日再战！) 比分 (\d+) : (\d+)$/, (m0, mode, r, a, b) => `${lookup(mode) || mode} · ${r === '凯旋大捷！' ? 'Victory!' : 'Close loss, fight again another day!'} Score ${a} : ${b}`]   // 2v2 结算
  ];
  // 一处查表：先查固定词条，再试模板；返回空串表示“没有这句的译文”
  function lookup(text) {
    if (!text) return '';
    const dict = dictEn();
    if (Object.prototype.hasOwnProperty.call(dict, text) && dict[text]) return dict[text];
    for (let i = 0; i < PATTERNS_EN.length; i++) {
      const re = PATTERNS_EN[i][0];
      if (re.test(text)) return text.replace(re, PATTERNS_EN[i][1]);
    }
    return '';
  }

  // 翻译指定文本
  function t(text) {
    if (currentLang === 'zh' || !text || typeof text !== 'string') return text;
    const trimmed = text.trim();
    const out = lookup(trimmed);
    return out ? text.replace(trimmed, out) : text;
  }

  // 递归或属性扫描翻译 DOM 节点
  function translateNode(node) {
    if (!node) return;
    if (node.nodeType === Node.TEXT_NODE) {
      // 文本节点没有 dataset 属性：原来这里读 node.datasetOrigText 会在第一个文本节点上抛 TypeError，
      // 整段翻译走不到底（切成英文等于没反应，还顺带把 chooseLang 后面的 backToMenu 也带崩）。
      // 原文记在节点自己的属性上，不写进 DOM。
      const orig = node.__origText !== undefined ? node.__origText : node.nodeValue;
      if (node.__origText === undefined) {
        node.__origText = orig;
      }
      const trimmed = orig.trim();
      const out = currentLang === 'en' && trimmed ? lookup(trimmed) : '';
      // 值没变就不写：一写就是一次 DOM 变更，能省则省（这些节点每帧都可能被重排）
      if (out) {
        const next = trimmed === orig ? out : orig.replace(trimmed, out);
        if (node.nodeValue !== next) node.nodeValue = next;
      } else if (node.nodeValue !== orig) {
        node.nodeValue = orig;
      }
      return;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      // 翻译特定属性
      ['title', 'placeholder', 'aria-label'].forEach(attr => {
        const val = node.getAttribute(attr);
        if (val) {
          const origKey = 'orig_' + attr.replace(/-/g, '_');
          const orig = node.dataset[origKey] !== undefined ? node.dataset[origKey] : val;
          if (node.dataset[origKey] === undefined) {
            node.dataset[origKey] = orig;
          }
          const trimmed = orig.trim();
          const out = currentLang === 'en' && trimmed ? lookup(trimmed) : '';
          const next = out ? orig.replace(trimmed, out) : orig;
          if (node.getAttribute(attr) !== next) node.setAttribute(attr, next);
        }
      });

      // 递归子节点（跳过脚本与画布内部）
      if (node.tagName !== 'SCRIPT' && node.tagName !== 'STYLE' && node.tagName !== 'CANVAS' && !node.classList.contains('no-i18n')) {
        for (let i = 0; i < node.childNodes.length; i++) {
          translateNode(node.childNodes[i]);
        }
      }
    }
  }

  function applyTranslations(root) {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = currentLang === 'en' ? 'en' : 'zh-CN';
    document.body.classList.toggle('lang-en', currentLang === 'en');
    const target = root || document.body;
    if (target) translateNode(target);
  }

  // 每个页面打开时都是现拼 innerHTML，切完语言之后再画出来的那批文本没人翻译（英文模式下
  // 打开单人模式、任务、图鉴……全是中文）。盯住 body 的新增节点补一遍；只观察 childList，
  // 自己写 nodeValue 是 characterData，不会反过来再触发，也就不存在来回翻译的死循环。
  let trMO = null;
  function trWatch() {
    if (trMO || typeof MutationObserver === 'undefined' || typeof document === 'undefined' || !document.body) return;
    trMO = new MutationObserver(recs => {
      if (currentLang !== 'en') return;
      for (const r of recs) for (const n of r.addedNodes) {
        if (n.nodeType === 1 || n.nodeType === 3) translateNode(n);
      }
    });
    trMO.observe(document.body, { childList: true, subtree: true });
  }

  if (typeof document !== 'undefined') {
    if (document.body) trWatch();
    else if (document.addEventListener) document.addEventListener('DOMContentLoaded', trWatch, { once: true });
  }

  // 挂载全局
  if (typeof window !== 'undefined') {
    window.I18N = {
      getLang,
      setLang,
      t,
      applyTranslations,
      get DICT_EN() { return dictEn(); }
    };
    window.t = t;
  }
})();
