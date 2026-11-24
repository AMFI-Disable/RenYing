// ===========================================================================
// 持久化 AI 玩家系统：25 个独立 AI 账号、个体作息与昼夜周期、会话与休息节律、
// 模式/侠客/流派偏好、长期行为演化、AI 专属对局与训练、受保护的市场参与、在线人数区分与管理接口
// ===========================================================================
// [uid, username, behavior_profile, activity_level, chronotype, preferredModes, preferredHeroes]
const AI_PLAYER_SEEDS = [
  ['ai_01', '墨影清风', 'balanced',   0.82, 'evening',    ['1v1', 'tag3', 'train'],            ['qingfeng', 'liuyun', 'wuya']],
  ['ai_02', '寒江孤客', 'defensive',  0.70, 'early_bird', ['1v1', 'train', 'raid'],            ['lingshuang', 'baihe', 'yuehua']],
  ['ai_03', '青云剑痴', 'aggressive', 0.85, 'student',    ['1v1', 'tag3', 'melee'],            ['qingfeng', 'chixiao', 'feiying']],
  ['ai_04', '玄霜枪魂', 'tactical',   0.76, 'daytime',    ['2v2', 'ctf', '1v1'],               ['lingshuang', 'tiangang', 'cangming']],
  ['ai_05', '苍崖醉墨', 'balanced',   0.64, 'casual',     ['raid', '2v2', 'train'],            ['zuixian', 'moyu', 'danqing']],
  ['ai_06', '踏雪无痕', 'aggressive', 0.88, 'night_owl',  ['1v1', 'melee', 'tag3'],            ['feiying', 'liying', 'yinhu']],
  ['ai_07', '惊雷破空', 'aggressive', 0.80, 'evening',    ['melee', '2v2', '1v1'],             ['leiming', 'chiyan', 'bawang']],
  ['ai_08', '素心抚琴', 'defensive',  0.62, 'early_bird', ['2v2', 'raid', 'train'],            ['yuxiao', 'lingxi', 'qingluan']],
  ['ai_09', '云海归鸿', 'tactical',   0.74, 'daytime',    ['ctf', '2v2', '1v1'],               ['liuyun', 'yanling', 'yunhe']],
  ['ai_10', '紫陌流光', 'balanced',   0.75, 'student',    ['tag3', '1v1', 'ctf'],              ['lingque', 'fengling', 'qingfeng']],
  ['ai_11', '铁骨铮铮', 'defensive',  0.68, 'early_bird', ['melee', 'ctf', 'raid'],            ['tieshan', 'xuanwu', 'polang']],
  ['ai_12', '夜雨听竹', 'tactical',   0.66, 'night_owl',  ['1v1', 'train', 'tag3'],            ['moyu', 'youhuang', 'mojie']],
  ['ai_13', '赤霄燃烬', 'aggressive', 0.84, 'evening',    ['melee', 'tag3', '2v2'],            ['chixiao', 'chiyan', 'leiming']],
  ['ai_14', '幽谷兰香', 'defensive',  0.58, 'casual',     ['train', 'raid', '2v2'],            ['yuehua', 'qingluan', 'fengling']],
  ['ai_15', '星辰推演', 'tactical',   0.77, 'night_owl',  ['1v1', '2v2', 'train'],             ['xuanji', 'qianji', 'cixian']],
  ['ai_16', '沧海破浪', 'aggressive', 0.79, 'evening',    ['ctf', 'melee', '2v2'],             ['polang', 'bawang', 'gouchen']],
  ['ai_17', '飞燕掠影', 'balanced',   0.81, 'student',    ['ctf', '1v1', 'tag3'],              ['yanling', 'jinpeng', 'lingque']],
  ['ai_18', '银狐幻月', 'aggressive', 0.86, 'night_owl',  ['1v1', 'tag3', 'melee'],            ['yinhu', 'liying', 'youming']],
  ['ai_19', '白鹤乘风', 'defensive',  0.65, 'daytime',    ['2v2', 'ctf', 'raid'],              ['yunhe', 'baihe', 'liuyun']],
  ['ai_20', '天罡镇岳', 'defensive',  0.72, 'evening',    ['melee', 'ctf', 'raid'],            ['tiangang', 'tieshan', 'xuanwu']],
  ['ai_21', '笔走龙蛇', 'tactical',   0.71, 'daytime',    ['1v1', 'train', '2v2'],             ['mojie', 'danqing', 'moyu']],
  ['ai_22', '冰河剑意', 'balanced',   0.76, 'early_bird', ['1v1', 'tag3', 'train'],            ['baihe', 'cangming', 'lingshuang']],
  ['ai_23', '金鹏展翼', 'aggressive', 0.83, 'student',    ['melee', 'ctf', '1v1'],             ['jinpeng', 'yanling', 'feiying']],
  ['ai_24', '冥夜行者', 'tactical',   0.69, 'night_owl',  ['1v1', 'melee', 'tag3'],            ['youming', 'gouchen', 'liying']],
  ['ai_25', '居合断水', 'balanced',   0.75, 'casual',     ['1v1', 'train', 'tag3'],            ['wuya', 'qingfeng', 'qianji']],
];

const AI_BEHAVIORS = ['aggressive', 'balanced', 'defensive', 'tactical'];
const AI_STATUSES = ['offline', 'resting', 'menu', 'queue', 'match', 'training', 'market'];
const AI_ONLINE_STATUSES = ['menu', 'queue', 'match', 'training', 'market'];
const AI_CHRONOTYPES = ['early_bird', 'daytime', 'student', 'evening', 'night_owl', 'casual'];
const AI_MODES = ['1v1', '2v2', 'tag3', 'melee', 'ctf', 'raid', 'train'];
const AI_MOODS = ['focused', 'relaxed', 'competitive', 'exploratory'];
const AI_MARKET_MAX_SPENT = 2500;
const AI_MARKET_MAX_LIST = 3;
let AI_LAST_TICK = 0;

// 每种作息类型的基础活动时段（北京时间小时，支持跨午夜，如 [21, 2.5]）与会话/休息时长范围（分钟）
const AI_CHRONO_CFG = {
  early_bird: { windows: [[6.2, 10.5], [13.5, 16.0], [19.0, 21.0]], sessionMin: [25, 65], restMin: [40, 140], weekendBoost: 1.08 },
  daytime:    { windows: [[9.5, 12.8], [14.0, 18.0], [20.0, 22.0]], sessionMin: [20, 55], restMin: [35, 120], weekendBoost: 1.12 },
  student:    { windows: [[12.0, 13.5], [17.2, 22.8]],              sessionMin: [30, 80], restMin: [30, 110], weekendBoost: 1.25 },
  evening:    { windows: [[12.1, 13.4], [18.8, 23.8]],              sessionMin: [35, 90], restMin: [25, 100], weekendBoost: 1.18 },
  night_owl:  { windows: [[15.0, 17.5], [21.0, 26.8]],              sessionMin: [40, 95], restMin: [30, 130], weekendBoost: 1.15 },
  casual:     { windows: [[10.5, 12.2], [15.5, 17.5], [19.8, 22.2]],sessionMin: [18, 45], restMin: [50, 180], weekendBoost: 1.22 },
};

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
  // 真实昼夜曲线：凌晨 3~5 点最低谷，上午缓升，午间小高峰，晚间 19~23 点最高峰
  if (hourFloat >= 19 && hourFloat < 23.5) return 1.0;
  if (hourFloat >= 12 && hourFloat < 14) return 0.78;
  if (hourFloat >= 14 && hourFloat < 19) return 0.72;
  if (hourFloat >= 8 && hourFloat < 12) return 0.52;
  if (hourFloat >= 6 && hourFloat < 8) return 0.32;
  if (hourFloat >= 23.5 || hourFloat < 1.5) return 0.42;
  return 0.16;
}

function aiBuildSchedule(uid, chronotype, seedIdx) {
  const cfg = AI_CHRONO_CFG[chronotype] || AI_CHRONO_CFG.evening;
  const baseOffset = (aiHash(uid + ':off') - 0.5) * 0.9; // ±27 分钟个体固定偏移
  const windows = cfg.windows.map(([s, e]) => [
    Math.round((s + baseOffset) * 100) / 100,
    Math.round((e + baseOffset) * 100) / 100
  ]);
  const sMin = cfg.sessionMin[0] + Math.round(aiHash(uid + ':smin') * 8);
  const sMax = cfg.sessionMin[1] + Math.round(aiHash(uid + ':smax') * 12);
  const rMin = cfg.restMin[0] + Math.round(aiHash(uid + ':rmin') * 10);
  const rMax = cfg.restMin[1] + Math.round(aiHash(uid + ':rmax') * 20);
  const marketCooldownMin = 25 + Math.round(aiHash(uid + ':mkt:' + seedIdx) * 85);
  return { windows, sessionMin: [sMin, sMax], restMin: [rMin, rMax], marketCooldownMin };
}

function aiBuildPrefs(modes, heroes, profile, uid) {
  const validHeroes = (Array.isArray(heroes) ? heroes : []).filter(h => !C.HERO_IDS || C.HERO_IDS.includes(h));
  const heroPool = validHeroes.length ? validHeroes : ['qingfeng', 'feiying', 'tieshan'];
  const validModes = (Array.isArray(modes) ? modes : []).filter(m => AI_MODES.includes(m));
  const modePool = validModes.length ? validModes : ['1v1', 'tag3', 'train'];
  const trainBias = Math.round((0.12 + aiHash(uid + ':tb') * 0.22) * 100) / 100;
  const marketBias = Math.round((0.06 + aiHash(uid + ':mb') * 0.12) * 100) / 100;
  return { modes: modePool, heroes: heroPool, style: profile, trainBias, marketBias };
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
  // 每日个性化上下线抖动（±24 分钟），避免多个 AI 在整点同时上下线
  const dailyDrift = (aiHash(`${uid}:drift:${bj.day}`) - 0.5) * 0.8;
  const weekendExt = bj.isWeekend ? 0.85 : 0;
  const h = bj.hourFloat;
  for (const [rawS, rawE] of wins) {
    const s = rawS + dailyDrift - (bj.isWeekend ? 0.35 : 0);
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
  // 探索情绪时有 22% 概率尝试常用池外的侠客
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

function aiPickMode(prefs, evo, matchmakingEnabled, rndVal) {
  const modes = (prefs && Array.isArray(prefs.modes) && prefs.modes.length) ? prefs.modes : ['1v1', 'train'];
  const matchModes = modes.filter(m => m !== 'train');
  if (!matchmakingEnabled || !matchModes.length) return 'train';
  if (evo && evo.mood === 'competitive' && matchModes.includes('1v1') && rndVal < 0.45) return '1v1';
  return matchModes[Math.floor(rndVal * matchModes.length) % matchModes.length];
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
  // 根据长期活跃度微调，模拟玩家近期热情起伏（保持在 [0.35, 0.95] 区间）
  const deltaAct = (aiHash(`${row.uid}:act:${day}`) - 0.5) * 0.08;
  const nextActivity = Math.round(Math.min(0.95, Math.max(0.35, (row.activity_level || 0.65) + deltaAct)) * 100) / 100;
  // 每隔约 7~10 天允许一次温和的行为流派演化（受 styleDrift 驱动）
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
  const existing = await env.DB.prepare('SELECT uid, chronotype, schedule_json, prefs_json, evolution_json FROM ai_players').all();
  const rows = (existing && existing.results) || [];
  const byUid = Object.fromEntries(rows.map(r => [r.uid, r]));
  const bj = aiBeijingClock(now);
  const stmts = [];
  const sampleKeys = Object.keys(C.ITEM || {}).slice(0, 12);

  for (let i = 0; i < AI_PLAYER_SEEDS.length; i++) {
    const [uid, username, profile, activity, chronotype, modes, heroes] = AI_PLAYER_SEEDS[i];
    const schedule = aiBuildSchedule(uid, chronotype, i);
    const prefs = aiBuildPrefs(modes, heroes, profile, uid);
    const evo = aiBuildEvolution(prefs.heroes, bj.day, uid);
    const cur = byUid[uid];
    if (!cur) {
      const inWin = aiInScheduleWindow(schedule, bj, uid);
      const initR = aiHash(`${uid}:init:${bj.day}`);
      let initStatus = 'offline', sessionUntil = 0, restUntil = 0, curMode = '', curHero = '';
      if (inWin && initR < activity * aiDayCycleFactor(bj.hourFloat)) {
        const sLen = schedule.sessionMin[0] + Math.round(aiHash(uid + ':slen0') * (schedule.sessionMin[1] - schedule.sessionMin[0]));
        sessionUntil = now + sLen * 60e3;
        curHero = prefs.heroes[0] || 'qingfeng';
        if (initR < activity * 0.42) { initStatus = 'match'; curMode = aiPickMode(prefs, evo, true, initR); }
        else if (initR < activity * 0.58) { initStatus = 'training'; curMode = 'train'; }
        else if (initR < activity * 0.72) { initStatus = 'queue'; curMode = aiPickMode(prefs, evo, true, initR); }
        else { initStatus = 'menu'; }
      } else if (initR < 0.35) {
        initStatus = 'resting';
        const rLen = schedule.restMin[0] + Math.round(aiHash(uid + ':rlen0') * (schedule.restMin[1] - schedule.restMin[0]));
        restUntil = now + rLen * 60e3;
      }
      const nextMarketAt = now + Math.round((10 + aiHash(uid + ':mk0') * schedule.marketCooldownMin) * 60e3);
      const items = [];
      if (sampleKeys.length) {
        const k = sampleKeys[i % sampleKeys.length];
        items.push({ id: `ai_it_${i}_1`, k, st: i % 4 === 0 ? 1 : 0, fl: 0.25, src: 'ai_seed', at: now });
      }
      const econState = JSON.stringify({ items, cases: {}, term: 0, tags: 0, eq: {} });
      const profJson = JSON.stringify({ name: username, isAi: true, behavior: profile, chronotype, owned: prefs.heroes, netWins: 4 + (i % 9), netLosses: 3 + (i % 7) });
      stmts.push(
        env.DB.prepare("INSERT OR IGNORE INTO users (id, username, password_hash, salt, profile_json, created_at, updated_at, password_algo, password_updated_at, deleted_at) VALUES (?1, ?2, 'ai-bot-locked', 'ai-locked', ?3, ?4, ?4, 'ai-bot-locked', ?4, 0)")
          .bind(uid, username, profJson, now),
        env.DB.prepare("INSERT OR IGNORE INTO econ (uid, state_json, srv_json, ink, ver, updated_at) VALUES (?1, ?2, '{}', ?3, 1, ?4)")
          .bind(uid, econState, 1200 + (i % 5) * 300, now),
        env.DB.prepare('INSERT OR IGNORE INTO ai_players (uid, username, active, activity_level, behavior_profile, matchmaking_enabled, market_enabled, status, chronotype, schedule_json, prefs_json, evolution_json, current_mode, current_hero, session_until, rest_until, next_market_at, sessions_today, matches_today, training_today, last_active_at, daily_spent, daily_listed, daily_reset_day, updated_at) VALUES (?1, ?2, 1, ?3, ?4, 1, 1, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, 0, 0, ?16, 0, 0, ?17, ?16)')
          .bind(uid, username, activity, profile, initStatus, chronotype, JSON.stringify(schedule), JSON.stringify(prefs), JSON.stringify(evo), curMode, curHero, sessionUntil, restUntil, nextMarketAt, AI_ONLINE_STATUSES.includes(initStatus) ? 1 : 0, now, bj.day)
      );
    } else if (!cur.schedule_json || cur.schedule_json === '{}' || !cur.prefs_json || cur.prefs_json === '{}') {
      // 从 0010 升级到 0011 的旧行补齐个性化作息、偏好与演化配置
      stmts.push(
        env.DB.prepare('UPDATE ai_players SET chronotype = ?1, schedule_json = ?2, prefs_json = ?3, evolution_json = ?4, next_market_at = ?5, updated_at = ?6 WHERE uid = ?7')
          .bind(chronotype, JSON.stringify(schedule), JSON.stringify(prefs), JSON.stringify(evo), now + schedule.marketCooldownMin * 60e3, now, uid)
      );
    }
  }
  if (stmts.length) await env.DB.batch(stmts);
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
      "SUM(CASE WHEN active = 1 AND status IN ('menu','queue','match','training','market') THEN 1 ELSE 0 END) AS aiOnline, " +
      "SUM(CASE WHEN active = 1 AND status = 'match' AND matchmaking_enabled = 1 THEN 1 ELSE 0 END) AS aiPlaying, " +
      "SUM(CASE WHEN active = 1 AND status = 'queue' AND matchmaking_enabled = 1 THEN 1 ELSE 0 END) AS aiWaiting, " +
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
      aiOnline: (r && r.aiOnline) || 0,
      aiPlaying: (r && r.aiPlaying) || 0,
      aiWaiting: (r && r.aiWaiting) || 0,
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
    return { aiOnline: 0, aiPlaying: 0, aiWaiting: 0, aiTraining: 0, aiMarket: 0, aiResting: 0, aiOffline: 0, matchesToday: 0, trainingToday: 0, dayPhase: 'evening_peak', beijingHour: 20, beijingMinute: 0 };
  }
}

async function aiTickSimulation(env, now, opts = {}) {
  await ensureAiPlayers(env, now);
  const simNow = Number.isFinite(opts.simNow) ? opts.simNow : now;
  const bj = aiBeijingClock(simNow);
  const dayFactor = aiDayCycleFactor(bj.hourFloat);
  const minuteBucket = Math.floor(simNow / 60e3);
  const rows = (await env.DB.prepare('SELECT * FROM ai_players ORDER BY uid').all()).results || [];
  const stmts = [];
  const marketEligibleUids = [];

  // 先为每位 AI 计算是否在线、会话/休息状态与意向活动，再统一为 AI-only 匹配配对（绝不进入真人队列）
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
        uid: r.uid, status: 'offline', activity, profile, evo, currentMode: '', currentHero: '',
        sessionUntil: 0, restUntil: 0, nextMarketAt: r.next_market_at || 0,
        sessionsToday, matchesToday, trainingToday, dailySpent, dailyListed,
        matchmakingEnabled: r.matchmaking_enabled === 1, marketEnabled: false,
        prefs, wantMatch: false,
      });
      continue;
    }

    const inWindow = aiInScheduleWindow(schedule, bj, r.uid);
    const rndA = aiHash(`${r.uid}:a:${minuteBucket}`);
    const rndB = aiHash(`${r.uid}:b:${minuteBucket}`);
    const rndC = aiHash(`${r.uid}:c:${minuteBucket}`);
    const cCfg = AI_CHRONO_CFG[chrono] || AI_CHRONO_CFG.evening;
    const wkMul = bj.isWeekend ? cCfg.weekendBoost : 1;

    let status = r.status || 'offline';
    let sessionUntil = r.session_until || 0;
    let restUntil = r.rest_until || 0;
    let nextMarketAt = r.next_market_at || (simNow + (schedule.marketCooldownMin || 45) * 60e3);
    let currentMode = r.current_mode || '';
    let currentHero = r.current_hero || '';
    let wantMatch = false;

    const wasOnline = AI_ONLINE_STATUSES.includes(status);

    // 1. 休息期判断：正在休息且未到结束时间，保持休息
    if (status === 'resting' && restUntil > simNow) {
      plans.push({
        uid: r.uid, status: 'resting', activity, profile, evo, currentMode: '', currentHero: '',
        sessionUntil: 0, restUntil, nextMarketAt,
        sessionsToday, matchesToday, trainingToday, dailySpent, dailyListed,
        matchmakingEnabled: r.matchmaking_enabled === 1, marketEnabled: r.market_enabled === 1,
        prefs, wantMatch: false,
      });
      continue;
    }

    // 2. 在线会话超时或已离开活跃时段 -> 自然下线或进入休息（休息时长因人而异）
    if (wasOnline && ((sessionUntil > 0 && simNow >= sessionUntil) || (!inWindow && rndA < 0.65))) {
      const rSpan = Math.max(10, (schedule.restMin[1] || 120) - (schedule.restMin[0] || 30));
      const restMins = (schedule.restMin[0] || 30) + Math.round(rndB * rSpan);
      status = inWindow ? 'resting' : 'offline';
      sessionUntil = 0;
      restUntil = status === 'resting' ? simNow + restMins * 60e3 : 0;
      currentMode = '';
      currentHero = '';
    } else if (!wasOnline) {
      // 3. 离线或休息结束：根据个体作息窗口 + 昼夜周期决定是否上线开启新会话
      const loginChance = inWindow
        ? Math.min(0.92, activity * (0.45 + 0.55 * dayFactor) * wkMul)
        : Math.min(0.12, activity * dayFactor * 0.14);
      if (rndA < loginChance) {
        const sSpan = Math.max(10, (schedule.sessionMin[1] || 75) - (schedule.sessionMin[0] || 20));
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

    // 4. 已在线：按个人偏好在 AI 专属对局、习武训练、市场浏览、大厅小憩之间自然切换
    if (AI_ONLINE_STATUSES.includes(status)) {
      // 结算上一轮进行的 AI 对局或习武训练，推进成长与熟练度演化
      if (r.status === 'match' && rndC < 0.45) {
        matchesToday++;
        evo.experience = (evo.experience || 0) + 2;
        const won = rndB < (0.42 + activity * 0.18);
        evo.winStreak = won ? (evo.winStreak || 0) + 1 : 0;
        evo.recentForm = Math.round(((evo.recentForm || 0.5) * 0.8 + (won ? 1 : 0) * 0.2) * 100) / 100;
        if (currentHero) evo.heroMastery[currentHero] = Math.min(999, (evo.heroMastery[currentHero] || 10) + (won ? 3 : 1));
      } else if (r.status === 'training' && rndC < 0.5) {
        trainingToday++;
        evo.experience = (evo.experience || 0) + 1;
        if (currentHero) evo.heroMastery[currentHero] = Math.min(999, (evo.heroMastery[currentHero] || 10) + 2);
      }

      const hero = aiPickWeightedHero(prefs, evo, rndB);
      const marketDue = r.market_enabled === 1 && simNow >= nextMarketAt;
      const trainP = (prefs.trainBias || 0.18) + (evo.mood === 'exploratory' ? 0.12 : 0) + (evo.winStreak === 0 && evo.recentForm < 0.4 ? 0.08 : 0);
      const marketP = marketDue ? (prefs.marketBias || 0.12) + 0.18 : 0;

      if (marketDue && rndA < marketP) {
        status = 'market';
        currentMode = 'market';
        currentHero = hero;
        const cdMin = Math.max(20, Math.round((schedule.marketCooldownMin || 50) * (0.65 + rndC * 0.75)));
        nextMarketAt = simNow + cdMin * 60e3;
        marketEligibleUids.push(r.uid);
      } else if (rndA < marketP + trainP) {
        status = 'training';
        currentMode = 'train';
        currentHero = hero;
      } else if (r.matchmaking_enabled === 1 && rndA < marketP + trainP + 0.58) {
        wantMatch = true;
        status = 'queue';
        currentMode = aiPickMode(prefs, evo, true, rndC);
        currentHero = hero;
      } else {
        // 大厅休息 / 整理装备
        status = 'menu';
        currentMode = '';
        currentHero = hero;
      }
    }

    plans.push({
      uid: r.uid, status, activity, profile, evo, currentMode, currentHero,
      sessionUntil, restUntil, nextMarketAt,
      sessionsToday, matchesToday, trainingToday, dailySpent, dailyListed,
      matchmakingEnabled: r.matchmaking_enabled === 1, marketEnabled: r.market_enabled === 1,
      prefs, wantMatch,
    });
  }

  // AI 专属匹配配对：严格只在 wantMatch === true 的 AI 之间两两成局，绝不进入人类匹配队列
  const matchSeekers = plans.filter(p => p.wantMatch && p.matchmakingEnabled);
  const pairCount = Math.floor(matchSeekers.length / 2) * 2;
  for (let i = 0; i < pairCount; i++) {
    matchSeekers[i].status = 'match';
    // 同局配对的两位 AI 共享同一 AI 专属模式
    if (i % 2 === 1) matchSeekers[i].currentMode = matchSeekers[i - 1].currentMode;
  }

  for (const p of plans) {
    stmts.push(
      env.DB.prepare(
        'UPDATE ai_players SET status = ?1, activity_level = ?2, behavior_profile = ?3, evolution_json = ?4, current_mode = ?5, current_hero = ?6, session_until = ?7, rest_until = ?8, next_market_at = ?9, sessions_today = ?10, matches_today = ?11, training_today = ?12, last_active_at = ?13, daily_spent = ?14, daily_listed = ?15, daily_reset_day = ?16, updated_at = ?17 WHERE uid = ?18'
      ).bind(
        p.status, p.activity, p.profile, JSON.stringify(p.evo), p.currentMode, p.currentHero,
        p.sessionUntil, p.restUntil, p.nextMarketAt,
        p.sessionsToday, p.matchesToday, p.trainingToday,
        AI_ONLINE_STATUSES.includes(p.status) ? simNow : (rows.find(x => x.uid === p.uid)?.last_active_at || 0),
        p.dailySpent, p.dailyListed, bj.day, now, p.uid
      )
    );
  }
  if (stmts.length) await env.DB.batch(stmts);
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
  // 1. 检查合乎安全价格区间的市场挂单并有限度购买（不与自己交易）
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
  // 2. 从持有富余饰品的 AI 账号创建合理价位挂单（[0.92x, 1.12x] 参考价，每日最多 3 单）
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
  const rows = (await env.DB.prepare('SELECT a.*, COALESCE(e.ink, 0) AS ink, e.state_json FROM ai_players a LEFT JOIN econ e ON e.uid = a.uid ORDER BY a.uid ASC').all()).results || [];
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
  return { ok: true, list, counts, humanCounts, trainingSamples: (train && train.samples) || 0, maxDailySpent: AI_MARKET_MAX_SPENT, maxDailyListed: AI_MARKET_MAX_LIST };
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
  const curPrefs = safeJson(row.prefs_json, { modes: ['1v1', 'train'], heroes: ['qingfeng'], style: profile });
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
