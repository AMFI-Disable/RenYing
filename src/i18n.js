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
    [/^没找到名字里同时有「(.+)」这几个字的人，按回车按全名加$/, (m0, q) => `No one's name contains “${q}”. Press Enter to add by full name`],
    // 英雄页皮肤按钮和皮肤牌：「名字 · 限免 / 武库 / 青锋行 / 武库」「品级 · 名字」
    [/^(.+?) · (限免|武库|青锋行 \/ 武库)$/, (m0, n, t) => `${lookup(n) || n} · ${{ 限免: 'Free trial', 武库: 'Armory', '青锋行 / 武库': 'Qingfeng Quest / Armory' }[t]}`],
    [/^(受限|隐秘|保密|军规级|★ 非凡|非凡|传说|精英) · (.+)$/, (m0, g, n) => `${lookup(g) || g} · ${lookup(n) || n}`],
    [/^难度 ([●○]+)$/, (m0, d) => `Difficulty ${d}`],
    [/^平衡 · 伤害与气血 ×([\d.]+)$/, (m0, n) => `Balance · Damage & HP ×${n}`],
    [/^(正常|原速) ([\d.]+)x$/, (m0, w, n) => `Normal ${n}x`],
    [/^慢放 ([\d.]+)x$/, (m0, n) => `Slow ${n}x`],
    // 结算页（src/game/08-fighter-match.js showEnd、src/game/19-progress.js reportProgress）
    [/^(你赢了|你输了)，比分 (\d+) : (\d+)$/, (m0, r, a, b) => `${r === '你赢了' ? 'You won' : 'You lost'} · Score ${a} : ${b}`],
    [/^比分 (\d+) : (\d+)$/, (m0, a, b) => `Score ${a} : ${b}`],
    [/^\+(\d+) 墨锭 · 联机(胜|负)（累计 (\d+) 胜）$/, (m0, g, r, n) => `+${g} Ink · Online ${r === '胜' ? 'win' : 'loss'} (${n} win${n === '1' ? '' : 's'} total)`],
    [/^2v2 天道演武决出胜负，比分 (\d+) : (\d+)$/, (m0, a, b) => `2v2 Exhibition decided · Score ${a} : ${b}`],
    [/^三阵连克，斩获 (\d+) 墨锭！（击破比分 (\d+) : (\d+)）$/, (m0, g, a, b) => `Three bouts won, +${g} Ink! (KOs ${a} : ${b})`],
    [/^胜败乃兵家常事，重整旗鼓再战（击破比分 (\d+) : (\d+)）$/, (m0, a, b) => `Win some, lose some. Regroup and try again (KOs ${a} : ${b})`],
    [/^同袍肉鸽 · 第 (\d+) 重魔劫 · 全员收益共享$/, (m0, n) => `Co-op Roguelike · Trial ${n} · Rewards shared by all`],
    [/^(?:🎉 )?讨伐大捷！全员共享斩获 \+(\d+) 墨锭（累计收获 (\d+) 墨锭 · 全队共鸣 (\d+) 卷秘卷）$/, (m0, g, t, n) => `Victory! Everyone gets +${g} Ink (${t} Ink this run · ${n} shared scroll${n === '1' ? '' : 's'})`],
    [/^惜败于六技融魂首领【(.+)】！全员仍获共享赏金 \+(\d+) 墨锭（本趟累计 (\d+) 墨锭）$/, (m0, h, g, t) => `Lost to the fused boss [${h.split('·').map(n => lookup(n) || n).join(' · ')}]. Everyone still gets +${g} Ink (${t} Ink this run)`],
    [/^(.+) 融魂首领$/, (m0, h) => `${h.split('·').map(n => lookup(n) || n).join(' · ')} · Fused Boss`],
    [/^止步于万仞剑阁第 (\d+) 层，共领悟 (\d+) 卷武林秘籍！$/, (m0, f, n) => `Stopped on floor ${f} of the Sword Pavilion with ${n} scroll${n === '1' ? '' : 's'} learned!`],
    [/^最高纪录：第 (\d+) 层$/, (m0, f) => `Best: floor ${f}`],
    [/^同袍肉鸽虽败犹荣 · 全员共享抚恤 \+(\d+) 墨锭$/, (m0, g) => `Co-op Roguelike: a loss with honor · Everyone gets +${g} Ink`],
    [/^(?:🎉 )?众志破魔大捷！全员共享丰厚悬赏 \+(\d+) 墨锭！$/, (m0, g) => `The demon falls! Everyone gets a +${g} Ink bounty!`],
    // 英雄页招式区（src/game/18-codex.js、src/game/22-saga.js 的 sagaCodexLine）
    [/^“([\s\S]+)”$/, (m0, x) => { const t = lookup(x); return t ? `“${t}”` : ''; }],
    [/^被动 · (.+)$/, (m0, n) => `Passive · ${lookup(n) || n}`],
    [/^左键\+右键 · (.+)$/, (m0, n) => `L+R Click · ${lookup(n) || n}`],
    [/^(\d+) 段 · 末段击飞(?: · 另有墨团 (\d+)×([\d.]+))?$/, (m0, n, k, d) => `${n} hits · Last hit launches${k ? ` · plus ${k}× ink blots of ${d}` : ''}`],
    [/^第 (\d+) 章 · (.+)$/, (m0, n, x) => `Chapter ${n} · ${lookup(x) || x}`],
    [/^（守关：(.+?) · 难度：(.+?)）$/, (m0, h, lv) => ` (Guardian: ${lookup(h) || h} · Difficulty: ${lookup(lv) || lv})`],
    [/^已破关 \(★(\d)\)$/, (m0, n) => `Cleared (★${n})`],
    [/^前往第 (\d+) 章试炼$/, (m0, n) => `Go to the Chapter ${n} trial`],
    [/^「(.+)」$/, (m0, n) => { const t = lookup(n); return t ? `“${t}”` : ''; }],
    [/^侠客列传 · (.+?)传 · (.+)$/, (m0, h, t) => `Hero Tales · ${lookup(h) || h} · ${lookup(t) || t}`],
    [/^走到第 (\d+) \/ (\d+) 节$/, (m0, a, b) => `Reached part ${a} / ${b}`],
    [/^结局 ((?:「[^」]+」)+)$/, (m0, x) => `Endings: ${x.slice(1, -1).split('」「').map(n => lookup(n) || n).join(', ')}`],
    // 守关挑战（src/game/07-ai-story.js）：故事标题 · 关名、角色台词、结算页
    [/^(\S+?)传 · (.+?)(?: · (.+))?$/, (m0, h, t, st) => { const a = lookup(t); return a ? `Tale of ${lookup(h) || h} · ${a}${st ? ` · ${lookup(st) || st}` : ''}` : ''; }],
    [/^(\S{2,3})：「([\s\S]+)」$/, (m0, h, x) => { const t = lookup(x); return t ? `${lookup(h) || h}: “${t}”` : ''; }],
    [/^第 (\d+) 幕$/, (m0, n) => `Act ${n}`],
    [/^(\d+\.\d+) (破关|折戟)$/, (m0, id, r) => `${id} ${r === '破关' ? 'Cleared' : 'Failed'}`],
    [/^折在第 (\d+) \/ (\d+) 波，共击退 (\d+) 只妖物$/, (m0, a, b, n) => `Fell on wave ${a} / ${b} after driving off ${n} demons`],
    [/^同袍残存气血 (\d+)%，共斩灭 (\d+) 只妖物 ·$/, (m0, p, n) => `Team HP left ${p}%, ${n} demons slain ·`],
    [/^全员共享斩妖赏金 \+(\d+) 墨锭！$/, (m0, g) => `Everyone shares a +${g} Ink bounty!`],
    [/^(?:🎉 )?宿命通关奖励：已解锁【(.+?)】专属皮肤「(.+?)」！$/, (m0, h, k) => `Destiny reward: unlocked ${lookup(h) || h}'s exclusive skin “${lookup(k) || k}”!`],
    [/^比分 (\d+) : (\d+)，再磨一磨剑$/, (m0, a, b) => `Score ${a} : ${b}. Sharpen your sword and try again`],
    // 守关关卡里画在画布上的字（src/game/07-ai-story.js、22-modes.js 的同袍斩妖）：大字、HUD、条幅
    [/^第 (\d+) \/ (\d+) 波妖潮$/, (m0, a, b) => `Wave ${a} / ${b}`],
    [/^尚余 (\d+) 妖$/, (m0, n) => `${n} left`],
    [/^(\d+) 只$/, (m0, n) => n],
    [/^(\d+) 卷$/, (m0, n) => n],
    [/^关卡 (\d+\.\d+) · (.+)$/, (m0, id, n) => `Stage ${id} · ${lookup(n) || n}`],
    [/^终幕魔首降临 · (.+)$/, (m0, n) => `The final boss arrives · ${lookup(n) || n}`],
    [/^决战【(.+)】$/, (m0, h) => `Final battle [${h.split('·').map(n => lookup(n) || n).join(' · ')}]`],
    [/^全员共享 \+(\d+) 墨锭$/, (m0, g) => `+${g} Ink for everyone`],
    [/^群妖肃清！全队共享顿悟「(.+)」$/, (m0, n) => `Demons cleared! The team shares the scroll “${lookup(n) || n}”`],
    // 问剑密卷（src/game/22-modes.js）和天魔讨伐的选卷面板、层数大字、画布上的层数
    [/^(问剑|问剑密卷|万仞剑阁|天道爬塔) · 第 (\d+) 层$/, (m0, w, n) => `${{ 问剑: 'Sword Scrolls', 问剑密卷: 'Sword Scrolls', 万仞剑阁: 'Sword Pavilion', 天道爬塔: 'AI Climb' }[w]} · Floor ${n}`],
    [/^问剑密卷 · 继续第 (\d+) 层$/, (m0, n) => `Sword Scrolls · Resume floor ${n}`],
    [/^突破第 (\d+) 层 · 顿悟秘卷$/, (m0, n) => `Floor ${n} cleared · Learn a scroll`],
    [/^讨伐第 (\d+) 劫大捷 · 全员共享秘卷增益$/, (m0, n) => `Trial ${n} won · A shared scroll for everyone`],
    // 已领悟 / 已带 N 卷 · 雷 3/3：共鸣效果 · 墨 1/3（流派是印章式单字，照原样）
    [/^(\S) (\d+)\/(\d+)(?:：(.+))?$/, (m0, g, a, b, x) => `${g} ${a}/${b}${x ? `: ${lookup(x) || x}` : ''}`],
    [/^(已领悟|已带) (\d+) 卷(?: · (.+))?$/, (m0, w, n, x) => `${w === '已带' ? 'Taking' : 'Learned'} ${n} scroll${n === '1' ? '' : 's'}${x ? ' · ' + x.split(' · ').map(r => lookup(r) || r).join(' · ') : ''}`],
    // 打斗中飘的字（带数字的）
    [/^画符 · (\d+)\/(\d+)$/, (m0, a, b) => `Talisman · ${a}/${b}`],
    [/^符爆 ×(\d+)$/, (m0, n) => `Talisman Burst ×${n}`],
    [/^枪尖穿心 \((\d+)\/(\d+)\)$/, (m0, a, b) => `Spear to the Heart (${a}/${b})`],
    [/^剑坛赐福：(.+)$/, (m0, x) => `Arena blessing: ${lookup(x) || x}`],
    [/^(\d+) 连击$/, (m0, n) => `${n} Hits`],
    // 拿到秘卷时的大字（src/game/22-modes.js、07-ai-story.js、22-world.js 的 say）
    [/^全队共享领悟「(.+)」$/, (m0, n) => `The team learns “${lookup(n) || n}”`],
    [/^领悟「(.+)」$/, (m0, n) => `Learned “${lookup(n) || n}”`],
    [/^全员共享「(.+)」$/, (m0, n) => `Everyone shares “${lookup(n) || n}”`],
    [/^全线共享「(.+)」$/, (m0, n) => `All lines share “${lookup(n) || n}”`],
    [/^第 (\d+) 波击退 · 全队共享「(.+)」$/, (m0, w, n) => `Wave ${w} repelled · The team shares “${lookup(n) || n}”`],
    // 选卷页的流派 · 品级标签：流派是印章式的单字，照原样
    [/^(\S) · (凡品|精品|绝品|险卷|天书)$/, (m0, g, r) => `${g} · ${lookup(r) || r}`],
    // 同袍肉鸽的画布 HUD（src/game/16-draw-ui.js drawHUDRaid）：要排在上面「全队共享秘卷：…」之前
    [/^全队共享秘卷：(\d+) 卷 · 破魔悬赏 \+(\d+) 墨锭$/, (m0, n, g) => `Shared scrolls: ${n} · Boss bounty +${g} Ink`],
    [/^全服共享秘卷：(\d+) 卷 · 魔首血量全线共享$/, (m0, n) => `Server-shared scrolls: ${n} · Boss HP shared across all lines`],
    [/^同袍肉鸽 · 第(\d+)劫$/, (m0, n) => `Co-op Roguelike · Trial ${n}`],
    [/^(.+) 融魂魔首$/, (m0, h) => `Fused Demon Lord of ${h.split('·').map(n => lookup(n) || n).join(' · ')}`],
    [/^全队共享秘卷：(.+)$/, (m0, x) => `Shared scrolls: ${x.split('、').map(n => { const m = n.match(/^「(.+)」$/); return m ? `“${lookup(m[1]) || m[1]}”` : n; }).join(', ')}`],
    // 天魔讨伐（src/game/22-tianmo.js）：页面、首页小卡片、出战提示和结算
    [/^第 (\d+) 代天魔$/, (m0, n) => `Demon · Gen ${n}`],
    [/^第 (\d+) 代天魔 · (.+)$/, (m0, n, h) => `Demon · Gen ${n} · ${lookup(h) || h}`],
    [/^剩 (\d+)% 血 · (\d+) 人参战(?: · (\d+) 人正在出战)?$/, (m0, p, n, f) => `${p}% HP left · ${n} fighters${f ? ` · ${f} fighting now` : ''}`],
    [/^(\d+) 人参战$/, (m0, n) => `${n} fighters`],
    [/^(\d+) 人正在出战$/, (m0, n) => `${n} fighting now`],
    [/^(\d.*?)后遁走$/, (m0, t) => `Escapes in ${EN_DUR(t).replace(/\s+/g, ' ')}`],
    [/^全服已斩杀 (\d+) 代（解锁 (\d+) 卷天书）$/, (m0, a, b) => `The server has slain ${a} generation${a === '1' ? '' : 's'} (${b} Heavenly Tome${b === '1' ? '' : 's'} unlocked)`],
    [/^出战 (\d+) 次$/, (m0, n) => `${n} run${n === '1' ? '' : 's'}`],
    [/^造成 ([\d,]+) 伤害$/, (m0, n) => `dealt ${n} damage`],
    [/^(\d+) 天前$/, (m0, n) => `${n} d ago`],
    [/^上一代（(.+?)）被 (.+) 斩杀$/, (m0, h, k) => `The last demon (${lookup(h) || h}) was slain by ${k}`],
    [/^上一代（(.+?)）没被打死，遁走了$/, (m0, h) => `The last demon (${lookup(h) || h}) escaped alive`],
    [/^你这一代造成 ([\d,]+) 伤害（出战 (\d+) 次）$/, (m0, d, n) => `You dealt ${d} damage to this generation (${n} run${n === '1' ? '' : 's'})`],
    [/^大家各自出战（不是同场联机），伤害都扣在这一只天魔身上。一次出战先抽三卷秘卷，再打 (\d+) 秒，天魔倒下会再站起来。天魔被斩杀或遁走后，按伤害发墨锭，伤害前三和斩杀者另得一个武器箱，下次打开武库自动领取。$/,
      (m0, n) => `Everyone fights on their own (not live together), and all damage lands on this one demon. Each run you draw three scrolls, then fight for ${n} seconds; the demon gets back up when it falls. When it is slain or escapes, Ink is paid out by damage, and the top three and the slayer each get a weapon case, collected the next time you open the Armory.`],
    [/^第 (\d+) \/ (\d+) 卷 · 天魔词缀：(.+)$/, (m0, a, b, x) => `Scroll ${a} / ${b} · Demon affixes: ${x === '无' ? 'none' : x.split('、').map(n => lookup(n) || n).join(', ')}`],
    [/^天魔讨伐 · 第 (\d+) 代$/, (m0, n) => `Demon Raid · Gen ${n}`],
    [/^这一战对天魔造成 ([\d,]+) 伤害，打倒它 (\d+) 次$/, (m0, d, n) => `You dealt ${d} damage to the demon and knocked it down ${n} time${n === '1' ? '' : 's'}`],
    [/^交不上：(.+)$/, (m0, x) => `Couldn't submit: ${lookup(x) || x}`],
    [/^计入全服 ([\d,]+) 伤害，最后一击斩杀了第 (\d+) 代天魔！奖励下次打开武库自动领取$/, (m0, d, n) => `${d} damage counted, and your last hit slew the Gen ${n} demon! Rewards are collected the next time you open the Armory`],
    [/^你出战时第 (\d+) 代天魔已被别人斩杀，这次伤害没有计入$/, (m0, n) => `The Gen ${n} demon was slain by someone else during your run, so this damage didn't count`],
    [/^已计入全服：([\d,]+) 伤害(（超过这次出战时长能打出的上限，按上限算）)?$/, (m0, d, cap) => `Counted for the server: ${d} damage${cap ? ' (above the most this run could deal, so capped)' : ''}`],
    // 排行榜说明
    [/^本赛季打满 (\d+) 场定级赛后上榜。段位从低到高：(.+)$/, (m0, n, ts) => `Finish ${n} placement matches this season to get on the board. Tiers, low to high: ${ts.split('、').map(t => { const m = t.match(/^(\S+) (.+)$/); return m ? `${m[1]} ${lookup(m[2]) || m[2]}` : t; }).join(', ')}`],
    [/^已注册玩家 (\d+) 位，按联机胜场排$/, (m0, n) => `${n} registered players, ranked by online wins`],
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
    [/^(2v2 .+?) · (凯旋大捷！|惜败，择日再战！) 比分 (\d+) : (\d+)$/, (m0, mode, r, a, b) => `${lookup(mode) || mode} · ${r === '凯旋大捷！' ? 'Victory!' : 'Close loss, fight again another day!'} Score ${a} : ${b}`],   // 2v2 结算
    // 账号、云存档、备份导入（src/game/24-account.js、src/cloud.js）和云端接口回的提示
    [/^墨锭 (\d+)$/, (m0, n) => `Ink ${n}`],
    [/^(\d+) 分钟前$/, (m0, n) => `${n} min ago`],
    [/^(\d+) 小时前$/, (m0, n) => `${n} h ago`],
    [/^上次上传：(.+)$/, (m0, x) => `Last upload: ${lookup(x) || x}`],
    [/^(·\s*)?最近在用：(.+)$/, (m0, p, x) => `${p || ''}Last used: ${lookup(x) || x}`],
    [/^更新前登录的 (\d+) 处，分不出是哪台设备$/, (m0, n) => `${n} sign-in${n === '1' ? '' : 's'} from before the update (device unknown)`],
    [/^请求失败 \((\d+)\)$/, (m0, n) => `Request failed (${n})`],
    [/^上传失败，(\d+) 秒后自动重试$/, (m0, n) => `Upload failed, retrying in ${n}s`],
    [/^(.+)，重新登录后会自动补传存档$/, (m0, x) => `${lookup(x) || x}. Log in again and your save uploads automatically`],
    [/^(.+)，本机存档不受影响，可先导出备份$/, (m0, x) => `${lookup(x) || x}. Your local save is safe; you can export a backup first`],
    [/^服务器内部错误（编号 (\w+)）$/, (m0, id) => `Server error (ref ${id})`],
    [/^升级失败：(.+)$/, (m0, x) => `Upgrade failed: ${lookup(x) || x}`],
    [/^欢迎归来，(.+)！已载入存档$/, (m0, n) => `Welcome back, ${n}! Save loaded`],
    [/^注册成功！大侠 (.+)，已开启专属存档$/, (m0, n) => `Registered! Welcome, ${n}. Your save is ready`],
    [/^配置格式错误：(.+)$/, (m0, x) => `Invalid setting: ${x}`],
    [/^-- 选择导入包中的账号（共 (\d+) 位） --$/, (m0, n) => `-- Pick an account from the backup (${n} total) --`],
    [/^(.+) \((\d+)墨锭 · (\d+)英雄 · (\d+)皮肤 · (\d+)胜(\d+)负\)$/, (m0, n, ink, h, k, w, l) => `${n} (${ink} Ink · ${h} heroes · ${k} skins · ${w}W ${l}L)`],
    [/^已成功继承【(.+)】！已解锁 (\d+) 位英雄、(\d+) 款皮肤、(\d+) 墨锭！$/, (m0, n, h, k, ink) => `Inherited "${n}"! Unlocked ${h} heroes, ${k} skins and ${ink} Ink!`],
    [/^已成功导入【(.+)】$/, (m0, n) => `Imported "${n}"`],
    [/^已切换到导入的本机账号【(.+?)】：(\d+) 位英雄、(\d+) 墨锭。(?:(.+)。)?$/, (m0, n, h, ink, note) => `Switched to the imported local account "${n}": ${h} heroes, ${ink} Ink.` + (note ? ` ${lookup(note) || note}.` : '')],
    [/^已切换到导入的本机账号【(.+?)】(?:（(.+)）)?$/, (m0, n, note) => `Switched to the imported local account "${n}"` + (note ? ` (${lookup(note) || note})` : '')],
    [/^已载入全备份包（共 (\d+) 个账号）$/, (m0, n) => `Loaded the full backup (${n} accounts)`],
    [/^成功恢复 (\d+) 个账号，请在下拉框选择切换！$/, (m0, n) => `Restored ${n} accounts, pick one from the list to switch`],
    [/^成功恢复 (\d+) 个账号$/, (m0, n) => `Restored ${n} accounts`],
    [/^已读取 (.+)（(\d+) 个账号）$/, (m0, f, n) => `Read ${f} (${n} accounts)`],
    [/^成功载入 (\d+) 个账号数据$/, (m0, n) => `Loaded ${n} accounts`],
    [/^导入失败：(.+)$/, (m0, x) => `Import failed: ${lookup(x) || x}`],
    [/^文件解析失败：(.+)$/, (m0, x) => `Couldn't read the file: ${lookup(x) || x}`]
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
      get DICT_EN() { return dictEn(); },
      get PATTERNS_EN() { return PATTERNS_EN; }   // tools/data-check.mjs 检查每一项的形状
    };
    window.t = t;
  }
})();
