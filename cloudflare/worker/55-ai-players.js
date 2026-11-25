// ===========================================================================
// 持久化 AI 玩家系统：100 个独立 AI 账号、UTC+8 个体作息与昼夜周期（常驻 20~30 人在线）、
// 会话与休息节律、高比例 AI 专属匹配/排位、模式/侠客/流派偏好、长期行为演化、
// 受保护的市场参与、真人与 AI 严格区分及管理接口
// ===========================================================================
const AI_USERNAMES_100 = [
  '6767', '看见你', '不吃香菜', '别打我', 'xiaoming9', 'kk0812', '0419', '晚安玛卡巴卡', 'linyi7', 'yz_07',
  '8823', '吃口西瓜', 'chen77', '就打一把', 'k792', '再打一局就睡', 'skycn', 'momo酱', 'm0x3', '菜鸟报道',
  'zerok', '阿泽', '9527x', '路过打酱油', 'nova23', '小安', 'a2048', '喝杯奶茶', 'kuro7', '南风',
  'zz77', '熬夜冠军', 'momo123', '北城', 'q1314', '随便玩玩', 'yukis', '晚星', 'x404', '手有点抖',
  'leogg', '半夏', 'n886', '明天再练', 'ace08', '微凉', 'v587', '小透明', 'dusk99', '念安',
  's2333', '摸鱼达人', 'kai2026', '青禾', '刚下课', 'ren05', '云起', '网有点卡', 'mingz', '初见',
  '请多指教', 'su777', '旧梦', '今天不想上班', 'han42', '长风', '不想起名字', 'yu01', '孤舟', '打完吃饭',
  'qi99', '暮色', '睡前一把', 'fengx', '青衫', '点错了', '阿宁', '竹影', '慢慢打', '阿澈',
  '墨染', '发呆中', '小满', '寒鸦', '我试试', '知秋', '惊鸿', '拾光', '远山', '望舒',
  '落雪', '晴岚', '松间', '江枫', '渔火', '清欢', '岁安', '长安客', '渡口', '听雨',
];

const AI_BEHAVIORS = ['aggressive', 'balanced', 'defensive', 'tactical'];
const AI_STATUSES = ['offline', 'resting', 'menu', 'queue', 'match', 'training', 'market'];
const AI_ONLINE_STATUSES = ['menu', 'queue', 'match', 'training', 'market'];
const AI_CHRONOTYPES = ['early_bird', 'daytime', 'student', 'evening', 'night_owl', 'casual'];
const AI_MODES = ['quickmatch', 'ranked', '1v1', '2v2', 'tag3', 'melee', 'ctf', 'raid', 'train'];
const AI_MOODS = ['focused', 'relaxed', 'competitive', 'exploratory'];
const AI_MARKET_MAX_SPENT = 2500;
const AI_MARKET_MAX_LIST = 3;
const AI_TOTAL_COUNT = AI_USERNAMES_100.length;
let AI_LAST_TICK = 0;

// 每种作息类型的基础活动时段（UTC+8 北京时间，支持跨午夜如 [21.0, 26.8]）与会话/休息时长范围（分钟）
const AI_CHRONO_CFG = {
  early_bird: { windows: [[6.2, 10.5], [13.5, 16.0], [19.0, 21.0]], sessionMin: [22, 60], restMin: [45, 150], weekendBoost: 1.08 },
  daytime:    { windows: [[9.5, 12.8], [14.0, 18.0], [20.0, 22.0]], sessionMin: [20, 55], restMin: [40, 130], weekendBoost: 1.12 },
  student:    { windows: [[12.0, 13.5], [17.2, 22.8]],              sessionMin: [28, 78], restMin: [35, 120], weekendBoost: 1.24 },
  evening:    { windows: [[12.1, 13.4], [18.8, 23.8]],              sessionMin: [32, 88], restMin: [30, 110], weekendBoost: 1.18 },
  night_owl:  { windows: [[15.0, 17.5], [21.0, 27.5], [0.5, 5.2]],  sessionMin: [35, 95], restMin: [35, 135], weekendBoost: 1.15 },
  casual:     { windows: [[10.5, 12.2], [15.5, 17.5], [19.8, 22.2]],sessionMin: [16, 44], restMin: [55, 180], weekendBoost: 1.20 },
};

const AI_DEFAULT_HERO_POOL = [
  'qingfeng', 'feiying', 'tieshan', 'lingshuang', 'liuyun', 'leiming', 'moyu', 'yuehua',
  'yanling', 'yuxiao', 'zuixian', 'gouchen', 'lingque', 'liying', 'cixian', 'qianji',
  'chixiao', 'youhuang', 'xuanji', 'polang', 'cangming', 'qingluan', 'xuanwu', 'chiyan',
  'yinhu', 'yunhe', 'tiangang', 'mojie', 'baihe', 'jinpeng', 'youming', 'lingxi',
  'bawang', 'fengling', 'wuya', 'danqing',
];

function safeJson(s, fallback) {
  try { return s ? JSON.parse(s) : fallback; } catch { return fallback; }
}

function aiHash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

async function aiBatchChunked(env, stmts, chunkSize = 40) {
  for (let i = 0; i < stmts.length; i += chunkSize) {
    await env.DB.batch(stmts.slice(i, i + chunkSize));
  }
}

// 为 100 位 AI 生成各具特色的种子配置（保留 ai_01..ai_25 兼容旧库，扩展至 ai_100）
const AI_CHRONO_RING = [
  'evening', 'early_bird', 'student', 'daytime', 'casual', 'night_owl',
  'evening', 'student', 'night_owl', 'daytime', 'evening', 'early_bird',
  'student', 'casual', 'night_owl', 'evening', 'daytime', 'night_owl',
  'early_bird', 'student',
];

const AI_PLAYER_SEEDS = AI_USERNAMES_100.map((username, i) => {
  const uid = i < 9 ? `ai_0${i + 1}` : `ai_${i + 1}`;
  const behavior = AI_BEHAVIORS[Math.floor(aiHash(uid + ':beh') * AI_BEHAVIORS.length)];
  const chronotype = AI_CHRONO_RING[i % AI_CHRONO_RING.length];
  const activity = Math.round((0.46 + aiHash(uid + ':act0') * 0.44) * 100) / 100;
  // 每位 AI 都有高比例的 匹配 (quickmatch) / 排位 (ranked) 倾向，再搭配 1~2 个其他个人偏好模式
  const extraModes = ['1v1', '2v2', 'tag3', 'melee', 'ctf', 'raid', 'train'];
  const m1 = extraModes[Math.floor(aiHash(uid + ':m1') * extraModes.length)];
  const m2 = extraModes[Math.floor(aiHash(uid + ':m2') * extraModes.length)];
  const modes = i % 3 === 0
    ? ['ranked', 'quickmatch', m1]
    : i % 3 === 1
      ? ['quickmatch', 'ranked', m1]
      : ['quickmatch', 'ranked', m1, m2];
  const uniqueModes = [...new Set(modes)];
  const heroes = [];
  for (let k = 0; k < 3; k++) {
    const h = AI_DEFAULT_HERO_POOL[Math.floor(aiHash(`${uid}:h:${k}`) * AI_DEFAULT_HERO_POOL.length)];
    if (!heroes.includes(h)) heroes.push(h);
  }
  return [uid, username, behavior, activity, chronotype, uniqueModes, heroes];
});

function aiBeijingClock(now) {
  const bjMs = now + 8 * 3600e3;
  const day = Math.floor(bjMs / DAY_MS);
  const d = new Date(bjMs);
  const hour = d.getUTCHours();
  const minute = d.getUTCMinutes();
  const dow = d.getUTCDay();
  const isWeekend = dow === 0 || dow === 6;
  const hourFloat = hour + minute / 60;
  const phase = hour < 6 ? 'late_night' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening_peak';
  return { day, dow, hour, minute, hourFloat, isWeekend, phase };
}

function aiDayCycleFactor(hourFloat) {
  if (hourFloat >= 19 && hourFloat < 23.5) return 1.0;
  if (hourFloat >= 12 && hourFloat < 14) return 0.80;
  if (hourFloat >= 14 && hourFloat < 19) return 0.76;
  if (hourFloat >= 8 && hourFloat < 12) return 0.62;
  if (hourFloat >= 6 && hourFloat < 8) return 0.45;
  if (hourFloat >= 23.5 || hourFloat < 1.5) return 0.56;
  return 0.34;
}

// 按 UTC+8 昼夜节律动态计算目标在线人数（整体稳定在约 20~30 人，昼夜自然起伏）
function aiTargetOnlineCount(bj, activeCount) {
  const h = bj.hourFloat;
  let base;
  if (h >= 2 && h < 6) base = 19;        // 深夜低谷：约 18~21 人（夜猫子为主）
  else if (h >= 6 && h < 9) base = 21;   // 清晨渐起：约 20~23 人
  else if (h >= 9 && h < 12) base = 23;  // 上午活跃：约 22~25 人
  else if (h >= 12 && h < 14) base = 25; // 午间小峰：约 24~27 人
  else if (h >= 14 && h < 18) base = 24; // 午后平稳：约 23~26 人
  else if (h >= 18 && h < 23.2) base = 28; // 晚间高峰：约 27~30 人
  else base = 22;                        // 午夜回落：约 21~24 人
  if (bj.isWeekend) base += 1;
  // 按 15 分钟刻度加 ±1 人的自然微幅波动，避免数字死板不变
  const wave = Math.round((aiHash(`wave:${bj.day}:${Math.floor(h * 4)}`) - 0.5) * 2);
  return Math.max(0, Math.min(activeCount, Math.max(18, Math.min(30, base + wave))));
}

function aiBuildSchedule(uid, chronotype, seedIdx) {
  const cfg = AI_CHRONO_CFG[chronotype] || AI_CHRONO_CFG.evening;
  const baseOffset = (aiHash(uid + ':off') - 0.5) * 1.1; // ±33 分钟个体固定偏移
  const windows = cfg.windows.map(([s, e]) => [
    Math.round((s + baseOffset) * 100) / 100,
    Math.round((e + baseOffset) * 100) / 100
  ]);
  const sMin = cfg.sessionMin[0] + Math.round(aiHash(uid + ':smin') * 8);
  const sMax = cfg.sessionMin[1] + Math.round(aiHash(uid + ':smax') * 12);
  const rMin = cfg.restMin[0] + Math.round(aiHash(uid + ':rmin') * 12);
  const rMax = cfg.restMin[1] + Math.round(aiHash(uid + ':rmax') * 25);
  const marketCooldownMin = 25 + Math.round(aiHash(uid + ':mkt:' + seedIdx) * 95);
  return { windows, sessionMin: [sMin, sMax], restMin: [rMin, rMax], marketCooldownMin };
}

function aiBuildPrefs(modes, heroes, profile, uid) {
  const validHeroes = (Array.isArray(heroes) ? heroes : []).filter(h => !C.HERO_IDS || C.HERO_IDS.includes(h));
  const heroPool = validHeroes.length ? validHeroes : ['qingfeng', 'feiying', 'tieshan'];
  const validModes = (Array.isArray(modes) ? modes : []).filter(m => AI_MODES.includes(m));
  const modePool = validModes.length ? validModes : ['quickmatch', 'ranked', '1v1'];
  const trainBias = Math.round((0.08 + aiHash(uid + ':tb') * 0.12) * 100) / 100;
  const marketBias = Math.round((0.04 + aiHash(uid + ':mb') * 0.08) * 100) / 100;
  const rankedBias = Math.round((0.35 + aiHash(uid + ':rb') * 0.35) * 100) / 100;
  return { modes: modePool, heroes: heroPool, style: profile, trainBias, marketBias, rankedBias };
}

function aiBuildEvolution(heroes, day, uid) {
  const mastery = {};
  for (let i = 0; i < heroes.length; i++) mastery[heroes[i]] = 10 + Math.round(aiHash(uid + ':m:' + i) * 20);
  return {
    experience: Math.round(aiHash(uid + ':xp') * 40),
    mood: AI_MOODS[Math.floor(aiHash(uid + ':mood') * AI_MOODS.length)],
    winStreak: 0,
    recentForm: 0.5,
    heroMastery: mastery,
    styleDrift: 0,
    lastEvolvedDay: day,
  };
}

function aiInScheduleWindow(schedule, bj, uid) {
  const wins = (schedule && Array.isArray(schedule.windows) && schedule.windows.length)
    ? schedule.windows
    : AI_CHRONO_CFG.evening.windows;
  const dailyDrift = (aiHash(`${uid}:drift:${bj.day}`) - 0.5) * 0.85;
  const weekendExt = bj.isWeekend ? 0.8 : 0;
  const h = bj.hourFloat;
  for (const [rawS, rawE] of wins) {
    const s = rawS + dailyDrift - (bj.isWeekend ? 0.3 : 0);
    const e = rawE + dailyDrift + weekendExt;
    if (e <= 24) {
      if (h >= s && h <= e) return true;
    } else {
      if (h >= s || h <= (e - 24)) return true;
    }
  }
  return false;
}

function aiPickWeightedHero(prefs, evo, rndVal) {
  const heroes = (prefs && Array.isArray(prefs.heroes) && prefs.heroes.length) ? prefs.heroes : ['qingfeng'];
  const mastery = (evo && evo.heroMastery) || {};
  if (evo && evo.mood === 'exploratory' && rndVal > 0.78 && C.HERO_IDS && C.HERO_IDS.length) {
    return C.HERO_IDS[Math.floor(rndVal * C.HERO_IDS.length) % C.HERO_IDS.length];
  }
  let total = 0;
  const weights = heroes.map(h => {
    const w = 10 + (mastery[h] || 0);
    total += w;
    return w;
  });
  let r = rndVal * total;
  for (let i = 0; i < heroes.length; i++) {
    r -= weights[i];
    if (r <= 0) return heroes[i];
  }
  return heroes[0];
}

// 优先选择 AI 专属「匹配 (quickmatch)」与「排位 (ranked)」，兼顾少量其他偏好模式
function aiPickMode(prefs, evo, matchmakingEnabled, rndVal) {
  const modes = (prefs && Array.isArray(prefs.modes) && prefs.modes.length) ? prefs.modes : ['quickmatch', 'ranked', '1v1'];
  const matchModes = modes.filter(m => m !== 'train');
  if (!matchmakingEnabled || !matchModes.length) return 'train';
  const rankedP = (prefs && typeof prefs.rankedBias === 'number' ? prefs.rankedBias : 0.45) + (evo && evo.mood === 'competitive' ? 0.12 : 0);
  if (rndVal < Math.min(0.50, rankedP * 0.82)) return 'ranked';
  if (rndVal < 0.84) return 'quickmatch';
  const others = matchModes.filter(m => m !== 'ranked' && m !== 'quickmatch');
  if (others.length) return others[Math.floor(rndVal * others.length) % others.length];
  return rndVal < 0.5 ? 'ranked' : 'quickmatch';
}

function aiEvolveDaily(row, prefs, evo, day) {
  const nextEvo = {
    experience: (evo && evo.experience) || 0,
    mood: (evo && evo.mood) || 'focused',
    winStreak: (evo && evo.winStreak) || 0,
    recentForm: (evo && typeof evo.recentForm === 'number') ? evo.recentForm : 0.5,
    heroMastery: { ...((evo && evo.heroMastery) || {}) },
    styleDrift: (evo && evo.styleDrift) || 0,
    lastEvolvedDay: day,
  };
  const rMood = aiHash(`${row.uid}:mood:${day}`);
  nextEvo.mood = AI_MOODS[Math.floor(rMood * AI_MOODS.length) % AI_MOODS.length];
  const deltaAct = (aiHash(`${row.uid}:act:${day}`) - 0.5) * 0.08;
  const nextActivity = Math.round(Math.min(0.95, Math.max(0.35, (row.activity_level || 0.65) + deltaAct)) * 100) / 100;
  nextEvo.styleDrift = (nextEvo.styleDrift || 0) + 1;
  let nextProfile = row.behavior_profile;
  if (nextEvo.styleDrift >= 8 && aiHash(`${row.uid}:style:${day}`) < 0.35) {
    nextEvo.styleDrift = 0;
    const alt = AI_BEHAVIORS.filter(b => b !== row.behavior_profile);
    nextProfile = alt[Math.floor(aiHash(`${row.uid}:stylepick:${day}`) * alt.length) % alt.length];
  }
  return { evo: nextEvo, activity: nextActivity, profile: nextProfile };
}

function aiRefPrice(itemKey) {
  const it = C.ITEM && C.ITEM[itemKey];
  if (!it) return 240;
  const tierBase = { mil: 60, res: 140, cla: 320, cov: 760, gold: 1800 };
  return tierBase[it.tier] || 240;
}

async function ensureAiPlayers(env, now) {
  const existing = await env.DB.prepare('SELECT uid, username, status, chronotype, schedule_json, prefs_json, evolution_json, session_until FROM ai_players').all();
  const rows = (existing && existing.results) || [];
  const byUid = Object.fromEntries(rows.map(r => [r.uid, r]));
  const bj = aiBeijingClock(now);
  const targetOnline = aiTargetOnlineCount(bj, AI_TOTAL_COUNT);
  let onlineAssigned = rows.filter(r => AI_ONLINE_STATUSES.includes(r.status) && r.session_until > now).length;
  const stmts = [];
  const sampleKeys = Object.keys(C.ITEM || {}).slice(0, 16);
  const needRename = AI_PLAYER_SEEDS.some(([uid, uname]) => byUid[uid] && byUid[uid].username !== uname);
  let humanNames = null;
  if (needRename) {
    const hRows = (await env.DB.prepare("SELECT LOWER(username) AS u FROM users WHERE password_algo != 'ai-bot-locked'").all()).results || [];
    humanNames = new Set(hRows.map(x => x.u));
  }

  for (let i = 0; i < AI_PLAYER_SEEDS.length; i++) {
    const [uid, username, profile, activity, chronotype, modes, heroes] = AI_PLAYER_SEEDS[i];
    const schedule = aiBuildSchedule(uid, chronotype, i);
    const prefs = aiBuildPrefs(modes, heroes, profile, uid);
    const evo = aiBuildEvolution(prefs.heroes, bj.day, uid);
    const cur = byUid[uid];
    if (!cur) {
      const inWin = aiInScheduleWindow(schedule, bj, uid);
      const initR = aiHash(`${uid}:init:${bj.day}:${bj.hour}`);
      let initStatus = 'offline', sessionUntil = 0, restUntil = 0, curMode = '', curHero = '';
      // 仅在目标在线人数范围内初始化在线状态，避免 100 个 AI 同时上线
      if (onlineAssigned < targetOnline && ((inWin && initR < 0.72) || initR < 0.16)) {
        onlineAssigned++;
        const sLen = Math.max(8, Math.round((schedule.sessionMin[0] + aiHash(uid + ':slen0') * (schedule.sessionMin[1] - schedule.sessionMin[0])) * (0.35 + aiHash(uid + ':srem0') * 0.65)));
        sessionUntil = now + sLen * 60e3;
        curHero = prefs.heroes[0] || 'qingfeng';
        if (initR < 0.48) { initStatus = 'match'; curMode = aiPickMode(prefs, evo, true, initR); }
        else if (initR < 0.72) { initStatus = 'queue'; curMode = aiPickMode(prefs, evo, true, initR); }
        else if (initR < 0.84) { initStatus = 'training'; curMode = 'train'; }
        else { initStatus = 'menu'; }
      } else if (initR < 0.30) {
        initStatus = 'resting';
        const rLen = schedule.restMin[0] + Math.round(aiHash(uid + ':rlen0') * (schedule.restMin[1] - schedule.restMin[0]));
        restUntil = now + rLen * 60e3;
      }
      const nextMarketAt = now + Math.round((12 + aiHash(uid + ':mk0') * schedule.marketCooldownMin) * 60e3);
      const items = [];
      if (sampleKeys.length) {
        const k = sampleKeys[i % sampleKeys.length];
        items.push({ id: `ai_it_${i}_1`, k, st: i % 4 === 0 ? 1 : 0, fl: 0.25, src: 'ai_seed', at: now });
      }
      const econState = JSON.stringify({ items, cases: {}, term: 0, tags: 0, eq: {} });
      const profJson = JSON.stringify({ name: username, isAi: true, behavior: profile, chronotype, owned: prefs.heroes, netWins: 4 + (i % 15), netLosses: 3 + (i % 12) });
      stmts.push(
        env.DB.prepare("INSERT OR IGNORE INTO users (id, username, password_hash, salt, profile_json, created_at, updated_at, password_algo, password_updated_at, deleted_at) VALUES (?1, ?2, 'ai-bot-locked', 'ai-locked', ?3, ?4, ?4, 'ai-bot-locked', ?4, 0)")
          .bind(uid, username, profJson, now),
        env.DB.prepare("INSERT OR IGNORE INTO econ (uid, state_json, srv_json, ink, ver, updated_at) VALUES (?1, ?2, '{}', ?3, 1, ?4)")
          .bind(uid, econState, 1200 + (i % 5) * 300, now),
        env.DB.prepare('INSERT OR IGNORE INTO ai_players (uid, username, active, activity_level, behavior_profile, matchmaking_enabled, market_enabled, status, chronotype, schedule_json, prefs_json, evolution_json, current_mode, current_hero, session_until, rest_until, next_market_at, sessions_today, matches_today, training_today, last_active_at, daily_spent, daily_listed, daily_reset_day, updated_at) VALUES (?1, ?2, 1, ?3, ?4, 1, 1, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, 0, 0, ?16, 0, 0, ?17, ?16)')
          .bind(uid, username, activity, profile, initStatus, chronotype, JSON.stringify(schedule), JSON.stringify(prefs), JSON.stringify(evo), curMode, curHero, sessionUntil, restUntil, nextMarketAt, AI_ONLINE_STATUSES.includes(initStatus) ? 1 : 0, now, bj.day)
      );
    } else {
      if (cur.username !== username && (!humanNames || !humanNames.has(username.toLowerCase()))) {
        const profJson = JSON.stringify({ name: username, isAi: true, behavior: profile, chronotype, owned: prefs.heroes, netWins: 4 + (i % 15), netLosses: 3 + (i % 12) });
        stmts.push(
          env.DB.prepare('UPDATE ai_players SET username = ?1, updated_at = ?2 WHERE uid = ?3').bind(username, now, uid),
          env.DB.prepare("UPDATE users SET username = ?1, profile_json = ?2, updated_at = ?3 WHERE id = ?4 AND password_algo = 'ai-bot-locked'").bind(username, profJson, now, uid)
        );
      }
      if (!cur.schedule_json || cur.schedule_json === '{}' || !cur.prefs_json || cur.prefs_json === '{}' || (AI_ONLINE_STATUSES.includes(cur.status) && !cur.session_until)) {
        // 从旧版迁移过来的 AI 账号：补齐作息与会话计时，并立即分散上下线状态，彻底修复“全部同时在线”
        const inWin = aiInScheduleWindow(schedule, bj, uid);
        const initR = aiHash(`${uid}:mig:${bj.day}:${bj.hour}`);
        let nextStatus = 'offline', sessUntil = 0, restUntil = 0;
        if (onlineAssigned < targetOnline && inWin && initR < 0.65) {
          onlineAssigned++;
          nextStatus = cur.status && AI_ONLINE_STATUSES.includes(cur.status) ? cur.status : 'menu';
          const sLen = Math.max(8, Math.round((schedule.sessionMin[0] + aiHash(uid + ':slenm') * (schedule.sessionMin[1] - schedule.sessionMin[0])) * 0.6));
          sessUntil = now + sLen * 60e3;
        } else if (initR < 0.35) {
          nextStatus = 'resting';
          restUntil = now + (schedule.restMin[0] + Math.round(initR * 60)) * 60e3;
        }
        stmts.push(
          env.DB.prepare('UPDATE ai_players SET status = ?1, chronotype = ?2, schedule_json = ?3, prefs_json = ?4, evolution_json = ?5, session_until = ?6, rest_until = ?7, next_market_at = ?8, updated_at = ?9 WHERE uid = ?10')
            .bind(nextStatus, chronotype, JSON.stringify(schedule), JSON.stringify(prefs), JSON.stringify(evo), sessUntil, restUntil, now + schedule.marketCooldownMin * 60e3, now, uid)
        );
      }
    }
  }
  if (stmts.length) await aiBatchChunked(env, stmts, 40);
}

async function aiPresenceCounts(env, now) {
  try {
    await ensureAiPlayers(env, now);
    if (now - AI_LAST_TICK > 60e3) {
      AI_LAST_TICK = now;
      await aiTickSimulation(env, now, { market: true });
    }
    const r = await env.DB.prepare(
      "SELECT " +
      "COUNT(*) AS aiTotal, " +
      "SUM(CASE WHEN active = 1 AND status IN ('menu','queue','match','training','market') THEN 1 ELSE 0 END) AS aiOnline, " +
      "SUM(CASE WHEN active = 1 AND status = 'match' AND matchmaking_enabled = 1 THEN 1 ELSE 0 END) AS aiPlaying, " +
      "SUM(CASE WHEN active = 1 AND status = 'queue' AND matchmaking_enabled = 1 THEN 1 ELSE 0 END) AS aiWaiting, " +
      "SUM(CASE WHEN active = 1 AND status IN ('queue','match') AND current_mode = 'quickmatch' THEN 1 ELSE 0 END) AS aiQuickmatch, " +
      "SUM(CASE WHEN active = 1 AND status IN ('queue','match') AND current_mode = 'ranked' THEN 1 ELSE 0 END) AS aiRanked, " +
      "SUM(CASE WHEN active = 1 AND status = 'training' THEN 1 ELSE 0 END) AS aiTraining, " +
      "SUM(CASE WHEN active = 1 AND status = 'market' THEN 1 ELSE 0 END) AS aiMarket, " +
      "SUM(CASE WHEN active = 1 AND status = 'resting' THEN 1 ELSE 0 END) AS aiResting, " +
      "SUM(CASE WHEN active = 0 OR status = 'offline' THEN 1 ELSE 0 END) AS aiOffline, " +
      "SUM(matches_today) AS matchesToday, " +
      "SUM(training_today) AS trainingToday " +
      "FROM ai_players"
    ).first();
    const bj = aiBeijingClock(now);
    return {
      aiTotal: (r && r.aiTotal) || 0,
      aiOnline: (r && r.aiOnline) || 0,
      aiPlaying: (r && r.aiPlaying) || 0,
      aiWaiting: (r && r.aiWaiting) || 0,
      aiQuickmatch: (r && r.aiQuickmatch) || 0,
      aiRanked: (r && r.aiRanked) || 0,
      aiTraining: (r && r.aiTraining) || 0,
      aiMarket: (r && r.aiMarket) || 0,
      aiResting: (r && r.aiResting) || 0,
      aiOffline: (r && r.aiOffline) || 0,
      matchesToday: (r && r.matchesToday) || 0,
      trainingToday: (r && r.trainingToday) || 0,
      dayPhase: bj.phase,
      beijingHour: bj.hour,
      beijingMinute: bj.minute,
    };
  } catch (e) {
    return { aiTotal: 0, aiOnline: 0, aiPlaying: 0, aiWaiting: 0, aiQuickmatch: 0, aiRanked: 0, aiTraining: 0, aiMarket: 0, aiResting: 0, aiOffline: 0, matchesToday: 0, trainingToday: 0, dayPhase: 'evening_peak', beijingHour: 20, beijingMinute: 0 };
  }
}

async function aiTickSimulation(env, now, opts = {}) {
  await ensureAiPlayers(env, now);
  const simNow = Number.isFinite(opts.simNow) ? opts.simNow : now;
  const bj = aiBeijingClock(simNow);
  const dayFactor = aiDayCycleFactor(bj.hourFloat);
  const minuteBucket = Math.floor(simNow / 60e3);
  const rows = (await env.DB.prepare('SELECT * FROM ai_players ORDER BY uid').all()).results || [];
  const activeCount = rows.filter(r => r.active === 1).length;
  const targetOnline = aiTargetOnlineCount(bj, activeCount);
  const stmts = [];
  const marketEligibleUids = [];

  // 第一阶段：按每个 AI 的个体作息、会话剩余时长、休息时长计算自然在线/休息/离线状态
  const plans = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const seed = AI_PLAYER_SEEDS.find(x => x[0] === r.uid) || AI_PLAYER_SEEDS[i % AI_PLAYER_SEEDS.length];
    const chrono = AI_CHRONOTYPES.includes(r.chronotype) ? r.chronotype : (seed[4] || 'evening');
    const schedule = safeJson(r.schedule_json, null) || aiBuildSchedule(r.uid, chrono, i);
    const prefs = safeJson(r.prefs_json, null) || aiBuildPrefs(seed[5], seed[6], r.behavior_profile, r.uid);
    let evo = safeJson(r.evolution_json, null) || aiBuildEvolution(prefs.heroes, bj.day, r.uid);

    const reset = r.daily_reset_day !== bj.day;
    let activity = r.activity_level;
    let profile = r.behavior_profile;
    let dailySpent = reset ? 0 : (r.daily_spent || 0);
    let dailyListed = reset ? 0 : (r.daily_listed || 0);
    let sessionsToday = reset ? 0 : (r.sessions_today || 0);
    let matchesToday = reset ? 0 : (r.matches_today || 0);
    let trainingToday = reset ? 0 : (r.training_today || 0);

    if (reset || (evo.lastEvolvedDay || 0) < bj.day) {
      const ev = aiEvolveDaily(r, prefs, evo, bj.day);
      evo = ev.evo;
      activity = ev.activity;
      profile = ev.profile;
    }

    if (r.active !== 1) {
      plans.push({
        uid: r.uid, active: false, status: 'offline', activity, profile, evo, currentMode: '', currentHero: '',
        sessionUntil: 0, restUntil: 0, nextMarketAt: r.next_market_at || 0,
        sessionsToday, matchesToday, trainingToday, dailySpent, dailyListed,
        matchmakingEnabled: r.matchmaking_enabled === 1, marketEnabled: false,
        prefs, schedule, inWindow: false, wantMatch: false, rndA: 1, rndB: 0.5, rndC: 0.5, rndD: 0.5,
      });
      continue;
    }

    const inWindow = aiInScheduleWindow(schedule, bj, r.uid);
    const rndA = aiHash(`${r.uid}:a:${minuteBucket}`);
    const rndB = aiHash(`${r.uid}:b:${minuteBucket}`);
    const rndC = aiHash(`${r.uid}:c:${minuteBucket}`);
    const rndD = aiHash(`${r.uid}:d:${minuteBucket}`);
    const cCfg = AI_CHRONO_CFG[chrono] || AI_CHRONO_CFG.evening;
    const wkMul = bj.isWeekend ? cCfg.weekendBoost : 1;

    let status = r.status || 'offline';
    let sessionUntil = r.session_until || 0;
    let restUntil = r.rest_until || 0;
    let nextMarketAt = r.next_market_at || (simNow + (schedule.marketCooldownMin || 45) * 60e3);
    let currentMode = r.current_mode || '';
    let currentHero = r.current_hero || '';

    const wasOnline = AI_ONLINE_STATUSES.includes(status);

    if (status === 'resting' && restUntil > simNow) {
      status = 'resting';
      currentMode = '';
      currentHero = '';
    } else if (wasOnline && ((sessionUntil > 0 && simNow >= sessionUntil) || (!sessionUntil) || (!inWindow && rndA < 0.72))) {
      // 会话自然结束或已离开活跃作息窗口 -> 休息或离线
      const rSpan = Math.max(15, (schedule.restMin[1] || 130) - (schedule.restMin[0] || 35));
      const restMins = (schedule.restMin[0] || 35) + Math.round(rndB * rSpan);
      status = inWindow ? 'resting' : 'offline';
      sessionUntil = 0;
      restUntil = status === 'resting' ? simNow + restMins * 60e3 : 0;
      currentMode = '';
      currentHero = '';
    } else if (!wasOnline) {
      // 离线或休息结束：在作息窗口内自然决定是否登录开启新会话
      const loginChance = inWindow
        ? Math.min(0.42, activity * (0.20 + 0.25 * dayFactor) * wkMul)
        : Math.min(0.05, activity * dayFactor * 0.06);
      if (rndA < loginChance) {
        const sSpan = Math.max(12, (schedule.sessionMin[1] || 75) - (schedule.sessionMin[0] || 20));
        const sessMins = (schedule.sessionMin[0] || 20) + Math.round(rndB * sSpan);
        sessionUntil = simNow + sessMins * 60e3;
        restUntil = 0;
        sessionsToday++;
        status = 'menu';
      } else {
        status = inWindow && status === 'resting' ? 'resting' : 'offline';
        sessionUntil = 0;
        if (status === 'offline') restUntil = 0;
        currentMode = '';
        currentHero = '';
      }
    }

    plans.push({
      uid: r.uid, active: true, prevStatus: r.status, status, activity, profile, evo, currentMode, currentHero,
      sessionUntil, restUntil, nextMarketAt,
      sessionsToday, matchesToday, trainingToday, dailySpent, dailyListed,
      matchmakingEnabled: r.matchmaking_enabled === 1, marketEnabled: r.market_enabled === 1,
      prefs, schedule, inWindow, wantMatch: false, rndA, rndB, rndC, rndD,
    });
  }

  // 第二阶段：柔和的人数节律调节（将同时在线 AI 稳定在 UTC+8 目标区间约 20~30 人，避免全员同时在线或全员离线）
  const onlineList = plans.filter(p => p.active && AI_ONLINE_STATUSES.includes(p.status));
  const minBand = Math.max(0, targetOnline - 2);
  const maxBand = Math.min(activeCount, targetOnline + 2);

  if (onlineList.length > maxBand) {
    // 优先让不在活跃窗口内、或会话即将结束的 AI 自然进入休息/离线
    onlineList.sort((a, b) => (a.inWindow === b.inWindow ? (a.sessionUntil - b.sessionUntil) : (a.inWindow ? 1 : -1)));
    let excess = onlineList.length - targetOnline;
    for (const p of onlineList) {
      if (excess <= 0) break;
      const rSpan = Math.max(15, (p.schedule.restMin[1] || 130) - (p.schedule.restMin[0] || 35));
      p.status = p.inWindow ? 'resting' : 'offline';
      p.sessionUntil = 0;
      p.restUntil = p.status === 'resting' ? simNow + ((p.schedule.restMin[0] || 35) + Math.round(p.rndB * rSpan)) * 60e3 : 0;
      p.currentMode = '';
      p.currentHero = '';
      excess--;
    }
  } else if (onlineList.length < minBand) {
    // 优先唤醒当前处于作息窗口内且未处于强制休息期的 AI 登录上线
    const candidates = plans
      .filter(p => p.active && !AI_ONLINE_STATUSES.includes(p.status) && !(p.status === 'resting' && p.restUntil > simNow))
      .sort((a, b) => {
        if (a.inWindow !== b.inWindow) return a.inWindow ? -1 : 1;
        return (b.activity + b.rndA * 0.4) - (a.activity + a.rndA * 0.4);
      });
    let need = targetOnline - onlineList.length;
    for (const p of candidates) {
      if (need <= 0) break;
      const sSpan = Math.max(12, (p.schedule.sessionMin[1] || 75) - (p.schedule.sessionMin[0] || 20));
      const sessMins = (p.schedule.sessionMin[0] || 20) + Math.round(p.rndB * sSpan);
      p.status = 'menu';
      p.sessionUntil = simNow + sessMins * 60e3;
      p.restUntil = 0;
      p.sessionsToday++;
      need--;
    }
  }

  // 第三阶段：为当前在线的 AI 分配活动（大幅提高 AI 专属匹配与排位比例，其余分布于习武训练、市场与大厅）
  for (const p of plans) {
    if (!p.active || !AI_ONLINE_STATUSES.includes(p.status)) continue;

    if (p.prevStatus === 'match' && p.rndC < 0.48) {
      p.matchesToday++;
      p.evo.experience = (p.evo.experience || 0) + 2;
      const won = p.rndB < (0.42 + p.activity * 0.18);
      p.evo.winStreak = won ? (p.evo.winStreak || 0) + 1 : 0;
      p.evo.recentForm = Math.round(((p.evo.recentForm || 0.5) * 0.8 + (won ? 1 : 0) * 0.2) * 100) / 100;
      if (p.currentHero) p.evo.heroMastery[p.currentHero] = Math.min(999, (p.evo.heroMastery[p.currentHero] || 10) + (won ? 3 : 1));
    } else if (p.prevStatus === 'training' && p.rndC < 0.52) {
      p.trainingToday++;
      p.evo.experience = (p.evo.experience || 0) + 1;
      if (p.currentHero) p.evo.heroMastery[p.currentHero] = Math.min(999, (p.evo.heroMastery[p.currentHero] || 10) + 2);
    }

    const hero = aiPickWeightedHero(p.prefs, p.evo, p.rndB);
    const marketDue = p.marketEnabled && simNow >= p.nextMarketAt;
    const marketP = marketDue ? Math.min(0.12, (p.prefs.marketBias || 0.05) + 0.04) : 0;
    const trainP = Math.min(0.14, (p.prefs.trainBias || 0.09) + (p.evo.mood === 'exploratory' ? 0.03 : 0));
    const matchP = p.matchmakingEnabled ? 0.76 : 0;

    if (marketDue && p.rndD < marketP) {
      p.status = 'market';
      p.currentMode = 'market';
      p.currentHero = hero;
      const cdMin = Math.max(25, Math.round((p.schedule.marketCooldownMin || 55) * (0.65 + p.rndC * 0.75)));
      p.nextMarketAt = simNow + cdMin * 60e3;
      marketEligibleUids.push(p.uid);
    } else if (p.rndD < marketP + trainP) {
      p.status = 'training';
      p.currentMode = 'train';
      p.currentHero = hero;
    } else if (p.matchmakingEnabled && p.rndD < marketP + trainP + matchP) {
      p.wantMatch = true;
      p.status = 'queue';
      p.currentMode = aiPickMode(p.prefs, p.evo, true, p.rndC);
      p.currentHero = hero;
    } else {
      p.status = 'menu';
      p.currentMode = '';
      p.currentHero = hero;
    }
  }

  // AI 专属匹配与排位配对：严格只在 wantMatch === true 的 AI 之间成对开局，保留约 20~25% 在队列中模拟真实匹配等待
  const matchSeekers = plans.filter(p => p.wantMatch && p.matchmakingEnabled);
  const targetMatches = Math.floor((matchSeekers.length * 0.76) / 2) * 2;
  for (let i = 0; i < targetMatches; i++) {
    matchSeekers[i].status = 'match';
    if (i % 2 === 1) matchSeekers[i].currentMode = matchSeekers[i - 1].currentMode;
  }

  const rowMap = Object.fromEntries(rows.map(x => [x.uid, x]));
  for (const p of plans) {
    stmts.push(
      env.DB.prepare(
        'UPDATE ai_players SET status = ?1, activity_level = ?2, behavior_profile = ?3, evolution_json = ?4, current_mode = ?5, current_hero = ?6, session_until = ?7, rest_until = ?8, next_market_at = ?9, sessions_today = ?10, matches_today = ?11, training_today = ?12, last_active_at = ?13, daily_spent = ?14, daily_listed = ?15, daily_reset_day = ?16, updated_at = ?17 WHERE uid = ?18'
      ).bind(
        p.status, p.activity, p.profile, JSON.stringify(p.evo), p.currentMode, p.currentHero,
        p.sessionUntil, p.restUntil, p.nextMarketAt,
        p.sessionsToday, p.matchesToday, p.trainingToday,
        AI_ONLINE_STATUSES.includes(p.status) ? simNow : (rowMap[p.uid]?.last_active_at || 0),
        p.dailySpent, p.dailyListed, bj.day, now, p.uid
      )
    );
  }
  if (stmts.length) await aiBatchChunked(env, stmts, 40);
  if (opts.market !== false) {
    await aiMarketStep(env, now, bj.day, opts.forceMarket ? null : marketEligibleUids);
  }
}

// AI 市场参与与防操纵护栏：仅在自然间隔到期时参与，严格限制价格区间（0.75x~1.25x 参考价）、禁止自买自卖、限制每日成交额与挂单数
async function aiMarketStep(env, now, day, eligibleUids = null) {
  let aiRows = (await env.DB.prepare("SELECT a.*, e.ink, e.state_json, e.ver FROM ai_players a JOIN econ e ON e.uid = a.uid WHERE a.active = 1 AND a.market_enabled = 1 AND a.status IN ('menu','queue','match','training','market')").all()).results || [];
  if (Array.isArray(eligibleUids)) {
    if (!eligibleUids.length) return;
    const set = new Set(eligibleUids);
    aiRows = aiRows.filter(r => set.has(r.uid));
  }
  if (!aiRows.length) return;
  let actions = 0;
  const activeOrders = (await env.DB.prepare('SELECT * FROM mkt WHERE state = 0 ORDER BY at ASC LIMIT 20').all()).results || [];
  for (const ord of activeOrders) {
    if (actions >= 2) break;
    const ref = aiRefPrice(ord.k);
    if (ord.price < Math.round(ref * 0.75) || ord.price > Math.round(ref * 1.25)) continue;
    const buyer = aiRows.find(b => b.uid !== ord.seller && (b.daily_reset_day !== day ? 0 : b.daily_spent) + ord.price <= AI_MARKET_MAX_SPENT && b.ink >= ord.price);
    if (!buyer) continue;
    const st = safeJson(buyer.state_json, { items: [] });
    if (!Array.isArray(st.items)) st.items = [];
    const item = safeJson(ord.item_json, null);
    if (!item || !item.k) continue;
    const txId = 'ai_mkt_' + uid(8);
    const updOrd = await env.DB.prepare('UPDATE mkt SET state = 1, buyer = ?1, done_at = ?2, tx = ?3 WHERE id = ?4 AND state = 0').bind(buyer.uid, now, txId, ord.id).run();
    if (!updOrd || !updOrd.meta || !updOrd.meta.changes) continue;
    st.items.push({ ...item, src: 'ai_mkt', at: now });
    const newInk = buyer.ink - ord.price;
    const newSpent = (buyer.daily_reset_day !== day ? 0 : buyer.daily_spent) + ord.price;
    await env.DB.batch([
      env.DB.prepare('UPDATE econ SET ink = ?1, state_json = ?2, ver = ver + 1, updated_at = ?3 WHERE uid = ?4 AND ver = ?5').bind(newInk, JSON.stringify(st), now, buyer.uid, buyer.ver),
      env.DB.prepare('UPDATE ai_players SET daily_spent = ?1, daily_reset_day = ?2, updated_at = ?3 WHERE uid = ?4').bind(newSpent, day, now, buyer.uid),
      env.DB.prepare('INSERT INTO econ_log (uid, at, act, ok, ink0, ink1, detail) VALUES (?1, ?2, ?3, 1, ?4, ?5, ?6)').bind(buyer.uid, now, 'ai_mkt_buy', buyer.ink, newInk, JSON.stringify({ order: ord.id, k: ord.k, price: ord.price }))
    ]);
    actions++;
  }
  for (const seller of aiRows) {
    if (actions >= 3) break;
    const listedToday = seller.daily_reset_day !== day ? 0 : seller.daily_listed;
    if (listedToday >= AI_MARKET_MAX_LIST) continue;
    const st = safeJson(seller.state_json, { items: [] });
    if (!Array.isArray(st.items) || st.items.length < 2) continue;
    const idx = st.items.findIndex(it => it && it.k && C.ITEM && C.ITEM[it.k]);
    if (idx < 0) continue;
    const [picked] = st.items.splice(idx, 1);
    const ref = aiRefPrice(picked.k);
    const priceJitter = 0.94 + aiHash(`${seller.uid}:list:${day}:${listedToday}`) * 0.16;
    const listPrice = Math.max(20, Math.round(ref * priceJitter));
    const mktId = 'aim_' + uid(10);
    await env.DB.batch([
      env.DB.prepare('UPDATE econ SET state_json = ?1, ver = ver + 1, updated_at = ?2 WHERE uid = ?3 AND ver = ?4').bind(JSON.stringify(st), now, seller.uid, seller.ver),
      env.DB.prepare('INSERT INTO mkt (id, seller, k, st, item_json, price, at, state, paid) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, 0)').bind(mktId, seller.uid, picked.k, picked.st || 0, JSON.stringify(picked), listPrice, now),
      env.DB.prepare('UPDATE ai_players SET daily_listed = ?1, daily_reset_day = ?2, updated_at = ?3 WHERE uid = ?4').bind(listedToday + 1, day, now, seller.uid),
      env.DB.prepare('INSERT INTO econ_log (uid, at, act, ok, ink0, ink1, detail) VALUES (?1, ?2, ?3, 1, ?4, ?4, ?5)').bind(seller.uid, now, 'ai_mkt_list', seller.ink, JSON.stringify({ order: mktId, k: picked.k, price: listPrice }))
    ]);
    actions++;
  }
}

async function aiAdminList(env, now) {
  await ensureAiPlayers(env, now);
  const rows = (await env.DB.prepare('SELECT a.*, COALESCE(e.ink, 0) AS ink, e.state_json FROM ai_players a LEFT JOIN econ e ON e.uid = a.uid ORDER BY LENGTH(a.uid) ASC, a.uid ASC').all()).results || [];
  const train = await env.DB.prepare('SELECT COUNT(*) AS samples FROM ai_training_matches').first();
  const hRow = await env.DB.prepare("SELECT COUNT(*) AS online, SUM(st = 'match') AS playing, SUM(st = 'queue') AS waiting FROM presence WHERE seen > ?").bind(now - PRESENCE_WINDOW).first();
  const list = rows.map(r => {
    const st = safeJson(r.state_json, { items: [] });
    const schedule = safeJson(r.schedule_json, {});
    const prefs = safeJson(r.prefs_json, {});
    const evolution = safeJson(r.evolution_json, {});
    return {
      uid: r.uid,
      username: r.username,
      active: r.active === 1,
      activityLevel: r.activity_level,
      behaviorProfile: r.behavior_profile,
      chronotype: r.chronotype || 'evening',
      schedule,
      prefs,
      evolution,
      currentMode: r.current_mode || '',
      currentHero: r.current_hero || '',
      sessionUntil: r.session_until || 0,
      restUntil: r.rest_until || 0,
      nextMarketAt: r.next_market_at || 0,
      sessionsToday: r.sessions_today || 0,
      matchesToday: r.matches_today || 0,
      trainingToday: r.training_today || 0,
      matchmakingEnabled: r.matchmaking_enabled === 1,
      marketEnabled: r.market_enabled === 1,
      status: r.status,
      ink: r.ink || 0,
      itemCount: Array.isArray(st.items) ? st.items.length : 0,
      dailySpent: r.daily_spent || 0,
      dailyListed: r.daily_listed || 0,
      lastActiveAt: r.last_active_at || 0,
    };
  });
  const counts = await aiPresenceCounts(env, now);
  const humanCounts = {
    humanOnline: (hRow && hRow.online) || 0,
    humanPlaying: (hRow && hRow.playing) || 0,
    humanWaiting: (hRow && hRow.waiting) || 0,
  };
  return { ok: true, list, total: list.length, counts, humanCounts, trainingSamples: (train && train.samples) || 0, maxDailySpent: AI_MARKET_MAX_SPENT, maxDailyListed: AI_MARKET_MAX_LIST };
}

async function aiAdminUpdate(env, body, who, why, now) {
  await ensureAiPlayers(env, now);
  if (body.tick) {
    let simNow = now;
    if (body.simHour !== undefined && body.simHour !== '' && body.simHour !== null) {
      const h = Number(body.simHour);
      if (!Number.isFinite(h) || h < 0 || h >= 24) return error('模拟小时范围 0~23.99');
      const bjDayStart = Math.floor((now + 8 * 3600e3) / DAY_MS) * DAY_MS - 8 * 3600e3;
      simNow = bjDayStart + Math.round(h * 3600e3);
    }
    await aiTickSimulation(env, now, { simNow, market: !!body.withMarket, forceMarket: !!body.withMarket });
    await logRow(env, 'ai_system', now, 'admin_ai_tick', 1, null, null, JSON.stringify({ by: who, why, withMarket: !!body.withMarket, simHour: body.simHour ?? null }));
    return await aiAdminList(env, simNow);
  }
  const targetUid = String(body.uid || '').trim();
  const row = await env.DB.prepare('SELECT a.*, COALESCE(e.ink, 0) AS ink FROM ai_players a LEFT JOIN econ e ON e.uid = a.uid WHERE a.uid = ?').bind(targetUid).first();
  if (!row) return error('找不到这个 AI 玩家', 404);
  const active = body.active !== undefined ? (body.active ? 1 : 0) : row.active;
  const activity = body.activityLevel !== undefined ? Math.min(1, Math.max(0, Number(body.activityLevel))) : row.activity_level;
  if (!Number.isFinite(activity)) return error('活跃度范围 0~1');
  const profile = body.behaviorProfile !== undefined ? String(body.behaviorProfile) : row.behavior_profile;
  if (!AI_BEHAVIORS.includes(profile)) return error('行为流派不对');
  const chronotype = body.chronotype !== undefined ? String(body.chronotype) : (row.chronotype || 'evening');
  if (!AI_CHRONOTYPES.includes(chronotype)) return error('作息类型不对');
  const mm = body.matchmakingEnabled !== undefined ? (body.matchmakingEnabled ? 1 : 0) : row.matchmaking_enabled;
  const mkt = body.marketEnabled !== undefined ? (body.marketEnabled ? 1 : 0) : row.market_enabled;
  const status = body.status !== undefined ? String(body.status) : row.status;
  if (!AI_STATUSES.includes(status)) return error('状态不对');

  let scheduleJson = row.schedule_json || '{}';
  if (body.chronotype !== undefined && body.chronotype !== row.chronotype) {
    scheduleJson = JSON.stringify(aiBuildSchedule(targetUid, chronotype, 0));
  }
  const curPrefs = safeJson(row.prefs_json, { modes: ['quickmatch', 'ranked', '1v1'], heroes: ['qingfeng'], style: profile });
  curPrefs.style = profile;
  if (Array.isArray(body.preferredModes)) {
    const cleanM = body.preferredModes.map(String).filter(m => AI_MODES.includes(m)).slice(0, 5);
    if (cleanM.length) curPrefs.modes = cleanM;
  }
  if (Array.isArray(body.preferredHeroes)) {
    const cleanH = body.preferredHeroes.map(String).filter(h => !C.HERO_IDS || C.HERO_IDS.includes(h)).slice(0, 6);
    if (cleanH.length) curPrefs.heroes = cleanH;
  }

  const stmts = [
    env.DB.prepare('UPDATE ai_players SET active = ?1, activity_level = ?2, behavior_profile = ?3, chronotype = ?4, schedule_json = ?5, prefs_json = ?6, matchmaking_enabled = ?7, market_enabled = ?8, status = ?9, updated_at = ?10 WHERE uid = ?11')
      .bind(active, activity, profile, chronotype, scheduleJson, JSON.stringify(curPrefs), mm, mkt, status, now, targetUid),
    env.DB.prepare('INSERT INTO econ_log (uid, at, act, ok, ink0, ink1, detail) VALUES (?1, ?2, ?3, 1, ?4, ?4, ?5)')
      .bind(targetUid, now, 'admin_ai_cfg', row.ink, JSON.stringify({ by: who, why, active, activity, profile, chronotype, mm, mkt, status }))
  ];
  if (body.inkDelta !== undefined && Number.isFinite(Number(body.inkDelta)) && Number(body.inkDelta) !== 0) {
    const delta = Math.trunc(Number(body.inkDelta));
    const nextInk = Math.max(0, (row.ink || 0) + delta);
    stmts.push(env.DB.prepare('UPDATE econ SET ink = ?1, ver = ver + 1, updated_at = ?2 WHERE uid = ?3').bind(nextInk, now, targetUid));
  }
  await env.DB.batch(stmts);
  return await aiAdminList(env, now);
}
