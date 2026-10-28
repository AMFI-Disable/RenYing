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
    [/^(.+?)\s*个样本\s*·\s*(.+)$/, (m0, n, rest) => `${n} samples · ${rest}`]
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
