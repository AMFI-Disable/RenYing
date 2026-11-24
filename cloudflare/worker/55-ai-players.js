// ===========================================================================
// 持久化 AI 玩家系统：25 个独立 AI 账号、AI 专属对局匹配、受保护的市场参与、在线人数区分与管理接口
// ===========================================================================
const AI_PLAYER_SEEDS = [
  ['ai_01', '墨影清风', 'balanced', 0.85],
  ['ai_02', '寒江孤客', 'defensive', 0.75],
  ['ai_03', '青云剑痴', 'aggressive', 0.82],
  ['ai_04', '玄霜枪魂', 'tactical', 0.78],
  ['ai_05', '苍崖醉墨', 'balanced', 0.68],
  ['ai_06', '踏雪无痕', 'aggressive', 0.88],
  ['ai_07', '惊雷破空', 'aggressive', 0.80],
  ['ai_08', '素心抚琴', 'defensive', 0.65],
  ['ai_09', '云海归鸿', 'tactical', 0.72],
  ['ai_10', '紫陌流光', 'balanced', 0.76],
  ['ai_11', '铁骨铮铮', 'defensive', 0.70],
  ['ai_12', '夜雨听竹', 'tactical', 0.62],
  ['ai_13', '赤霄燃烬', 'aggressive', 0.84],
  ['ai_14', '幽谷兰香', 'defensive', 0.60],
  ['ai_15', '星辰推演', 'tactical', 0.74],
  ['ai_16', '沧海破浪', 'aggressive', 0.79],
  ['ai_17', '飞燕掠影', 'balanced', 0.81],
  ['ai_18', '银狐幻月', 'aggressive', 0.86],
  ['ai_19', '白鹤乘风', 'defensive', 0.67],
  ['ai_20', '天罡镇岳', 'defensive', 0.73],
  ['ai_21', '笔走龙蛇', 'tactical', 0.69],
  ['ai_22', '冰河剑意', 'balanced', 0.77],
  ['ai_23', '金鹏展翼', 'aggressive', 0.83],
  ['ai_24', '冥夜行者', 'tactical', 0.66],
  ['ai_25', '居合断水', 'balanced', 0.75],
];
const AI_BEHAVIORS = ['aggressive', 'balanced', 'defensive', 'tactical'];
const AI_STATUSES = ['menu', 'queue', 'match'];
const AI_MARKET_MAX_SPENT = 2500;
const AI_MARKET_MAX_LIST = 3;
let AI_LAST_TICK = 0;

function safeJson(s, fallback) {
  try { return s ? JSON.parse(s) : fallback; } catch { return fallback; }
}

function aiRefPrice(itemKey) {
  const it = C.ITEM && C.ITEM[itemKey];
  if (!it) return 240;
  const tierBase = { mil: 60, res: 140, cla: 320, cov: 760, gold: 1800 };
  return tierBase[it.tier] || 240;
}

async function ensureAiPlayers(env, now) {
  const existing = await env.DB.prepare('SELECT COUNT(*) AS n FROM ai_players').first();
  if (existing && existing.n >= AI_PLAYER_SEEDS.length) return;
  const stmts = [];
  const day = Math.floor((now + 8 * 3600e3) / DAY_MS);
  const sampleKeys = Object.keys(C.ITEM || {}).slice(0, 12);
  for (let i = 0; i < AI_PLAYER_SEEDS.length; i++) {
    const [uid, username, profile, activity] = AI_PLAYER_SEEDS[i];
    const initStatus = i % 3 === 0 ? 'match' : (i % 5 === 0 ? 'queue' : 'menu');
    const items = [];
    if (sampleKeys.length) {
      const k = sampleKeys[i % sampleKeys.length];
      items.push({ id: `ai_it_${i}_1`, k, st: i % 4 === 0 ? 1 : 0, fl: 0.25, src: 'ai_seed', at: now });
    }
    const econState = JSON.stringify({ items, cases: {}, term: 0, tags: 0, eq: {} });
    const profJson = JSON.stringify({ name: username, isAi: true, behavior: profile, owned: ['qingfeng'], netWins: 4 + (i % 9), netLosses: 3 + (i % 7) });
    stmts.push(
      env.DB.prepare("INSERT OR IGNORE INTO users (id, username, password_hash, salt, profile_json, created_at, updated_at, password_algo, password_updated_at, deleted_at) VALUES (?1, ?2, 'ai-bot-locked', 'ai-locked', ?3, ?4, ?4, 'ai-bot-locked', ?4, 0)")
        .bind(uid, username, profJson, now),
      env.DB.prepare("INSERT OR IGNORE INTO econ (uid, state_json, srv_json, ink, ver, updated_at) VALUES (?1, ?2, '{}', ?3, 1, ?4)")
        .bind(uid, econState, 1200 + (i % 5) * 300, now),
      env.DB.prepare("INSERT OR IGNORE INTO ai_players (uid, username, active, activity_level, behavior_profile, matchmaking_enabled, market_enabled, status, last_active_at, daily_spent, daily_listed, daily_reset_day, updated_at) VALUES (?1, ?2, 1, ?3, ?4, 1, 1, ?5, ?6, 0, 0, ?7, ?6)")
        .bind(uid, username, activity, profile, initStatus, now, day)
    );
  }
  if (stmts.length) await env.DB.batch(stmts);
}

async function aiPresenceCounts(env, now) {
  try {
    await ensureAiPlayers(env, now);
    if (now - AI_LAST_TICK > 60e3) {
      AI_LAST_TICK = now;
      await aiTickSimulation(env, now, { market: false });
    }
    const r = await env.DB.prepare("SELECT COUNT(*) AS aiOnline, SUM(status = 'match' AND matchmaking_enabled = 1) AS aiPlaying, SUM(status = 'queue' AND matchmaking_enabled = 1) AS aiWaiting FROM ai_players WHERE active = 1").first();
    return {
      aiOnline: (r && r.aiOnline) || 0,
      aiPlaying: (r && r.aiPlaying) || 0,
      aiWaiting: (r && r.aiWaiting) || 0,
    };
  } catch (e) {
    return { aiOnline: 0, aiPlaying: 0, aiWaiting: 0 };
  }
}

async function aiTickSimulation(env, now, opts = {}) {
  await ensureAiPlayers(env, now);
  const day = Math.floor((now + 8 * 3600e3) / DAY_MS);
  const rows = (await env.DB.prepare('SELECT * FROM ai_players WHERE active = 1 ORDER BY uid').all()).results || [];
  const stmts = [];
  // AI 专属匹配：仅在启用了 matchmaking_enabled 的 AI 之间配对，绝不进入人类匹配队列
  const mmPool = rows.filter(r => r.matchmaking_enabled === 1);
  let matchSlots = Math.floor(mmPool.length / 2) * 2;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const reset = r.daily_reset_day !== day;
    const seed = ((Math.floor(now / 60e3) + i * 7) % 100) / 100;
    let nextStatus = 'menu';
    if (r.matchmaking_enabled === 1) {
      if (seed < r.activity_level * 0.65 && matchSlots > 0) { nextStatus = 'match'; matchSlots--; }
      else if (seed < r.activity_level) nextStatus = 'queue';
    }
    stmts.push(
      env.DB.prepare('UPDATE ai_players SET status = ?1, last_active_at = ?2, daily_spent = ?3, daily_listed = ?4, daily_reset_day = ?5, updated_at = ?2 WHERE uid = ?6')
        .bind(nextStatus, now, reset ? 0 : r.daily_spent, reset ? 0 : r.daily_listed, day, r.uid)
    );
  }
  if (stmts.length) await env.DB.batch(stmts);
  if (opts.market !== false) await aiMarketStep(env, now, day);
}

// AI 市场参与与防操纵护栏：严格限制价格区间（0.75x~1.25x 参考价）、禁止自买自卖、限制每日成交额与挂单数
async function aiMarketStep(env, now, day) {
  const aiRows = (await env.DB.prepare('SELECT a.*, e.ink, e.state_json, e.ver FROM ai_players a JOIN econ e ON e.uid = a.uid WHERE a.active = 1 AND a.market_enabled = 1').all()).results || [];
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
  // 2. 从持有富余饰品的 AI 账号创建合理价位挂单（[0.90x, 1.15x] 参考价，每日最多 3 单）
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
    const listPrice = Math.max(20, Math.round(ref * 1.02));
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
  const list = rows.map(r => {
    const st = safeJson(r.state_json, { items: [] });
    return {
      uid: r.uid,
      username: r.username,
      active: r.active === 1,
      activityLevel: r.activity_level,
      behaviorProfile: r.behavior_profile,
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
  return { ok: true, list, counts, trainingSamples: (train && train.samples) || 0, maxDailySpent: AI_MARKET_MAX_SPENT, maxDailyListed: AI_MARKET_MAX_LIST };
}

async function aiAdminUpdate(env, body, who, why, now) {
  await ensureAiPlayers(env, now);
  if (body.tick) {
    await aiTickSimulation(env, now, { market: !!body.withMarket });
    await logRow(env, 'ai_system', now, 'admin_ai_tick', 1, null, null, JSON.stringify({ by: who, why, withMarket: !!body.withMarket }));
    return await aiAdminList(env, now);
  }
  const targetUid = String(body.uid || '').trim();
  const row = await env.DB.prepare('SELECT a.*, COALESCE(e.ink, 0) AS ink FROM ai_players a LEFT JOIN econ e ON e.uid = a.uid WHERE a.uid = ?').bind(targetUid).first();
  if (!row) return error('找不到这个 AI 玩家', 404);
  const active = body.active !== undefined ? (body.active ? 1 : 0) : row.active;
  const activity = body.activityLevel !== undefined ? Math.min(1, Math.max(0, Number(body.activityLevel))) : row.activity_level;
  if (!Number.isFinite(activity)) return error('活跃度范围 0~1');
  const profile = body.behaviorProfile !== undefined ? String(body.behaviorProfile) : row.behavior_profile;
  if (!AI_BEHAVIORS.includes(profile)) return error('行为流派不对');
  const mm = body.matchmakingEnabled !== undefined ? (body.matchmakingEnabled ? 1 : 0) : row.matchmaking_enabled;
  const mkt = body.marketEnabled !== undefined ? (body.marketEnabled ? 1 : 0) : row.market_enabled;
  const status = body.status !== undefined ? String(body.status) : row.status;
  if (!AI_STATUSES.includes(status)) return error('状态不对');
  const stmts = [
    env.DB.prepare('UPDATE ai_players SET active = ?1, activity_level = ?2, behavior_profile = ?3, matchmaking_enabled = ?4, market_enabled = ?5, status = ?6, updated_at = ?7 WHERE uid = ?8')
      .bind(active, activity, profile, mm, mkt, status, now, targetUid),
    env.DB.prepare('INSERT INTO econ_log (uid, at, act, ok, ink0, ink1, detail) VALUES (?1, ?2, ?3, 1, ?4, ?4, ?5)')
      .bind(targetUid, now, 'admin_ai_cfg', row.ink, JSON.stringify({ by: who, why, active, activity, profile, mm, mkt, status }))
  ];
  if (body.inkDelta !== undefined && Number.isFinite(Number(body.inkDelta)) && Number(body.inkDelta) !== 0) {
    const delta = Math.trunc(Number(body.inkDelta));
    const nextInk = Math.max(0, (row.ink || 0) + delta);
    stmts.push(env.DB.prepare('UPDATE econ SET ink = ?1, ver = ver + 1, updated_at = ?2 WHERE uid = ?3').bind(nextInk, now, targetUid));
  }
  await env.DB.batch(stmts);
  return await aiAdminList(env, now);
}
