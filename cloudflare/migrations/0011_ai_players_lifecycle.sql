-- 0011：升级持久化 AI 玩家表，增加个体作息节律、昼夜周期、会话/休息计时、模式与侠客偏好及长期演化状态。
-- 与 0006 相同，通过重建表扩展 status 的 CHECK 约束并保留已有行（无外键指向 ai_players）。
CREATE TABLE ai_players_new (
  uid TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  activity_level REAL NOT NULL DEFAULT 0.65 CHECK (activity_level >= 0 AND activity_level <= 1),
  behavior_profile TEXT NOT NULL DEFAULT 'balanced' CHECK (behavior_profile IN ('aggressive', 'balanced', 'defensive', 'tactical')),
  matchmaking_enabled INTEGER NOT NULL DEFAULT 1 CHECK (matchmaking_enabled IN (0, 1)),
  market_enabled INTEGER NOT NULL DEFAULT 1 CHECK (market_enabled IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('offline', 'resting', 'menu', 'queue', 'match', 'training', 'market')),
  chronotype TEXT NOT NULL DEFAULT 'evening' CHECK (chronotype IN ('early_bird', 'daytime', 'student', 'evening', 'night_owl', 'casual')),
  schedule_json TEXT NOT NULL DEFAULT '{}',
  prefs_json TEXT NOT NULL DEFAULT '{}',
  evolution_json TEXT NOT NULL DEFAULT '{}',
  current_mode TEXT NOT NULL DEFAULT '',
  current_hero TEXT NOT NULL DEFAULT '',
  session_until INTEGER NOT NULL DEFAULT 0,
  rest_until INTEGER NOT NULL DEFAULT 0,
  next_market_at INTEGER NOT NULL DEFAULT 0,
  sessions_today INTEGER NOT NULL DEFAULT 0 CHECK (sessions_today >= 0),
  matches_today INTEGER NOT NULL DEFAULT 0 CHECK (matches_today >= 0),
  training_today INTEGER NOT NULL DEFAULT 0 CHECK (training_today >= 0),
  last_active_at INTEGER NOT NULL DEFAULT 0,
  daily_spent INTEGER NOT NULL DEFAULT 0 CHECK (daily_spent >= 0),
  daily_listed INTEGER NOT NULL DEFAULT 0 CHECK (daily_listed >= 0),
  daily_reset_day INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);
INSERT INTO ai_players_new (uid, username, active, activity_level, behavior_profile, matchmaking_enabled, market_enabled, status, last_active_at, daily_spent, daily_listed, daily_reset_day, updated_at)
  SELECT uid, username, active, activity_level, behavior_profile, matchmaking_enabled, market_enabled,
    CASE WHEN status IN ('offline', 'resting', 'menu', 'queue', 'match', 'training', 'market') THEN status ELSE 'offline' END,
    last_active_at, MAX(daily_spent, 0), MAX(daily_listed, 0), daily_reset_day, updated_at FROM ai_players;
DROP TABLE ai_players;
ALTER TABLE ai_players_new RENAME TO ai_players;
CREATE INDEX IF NOT EXISTS idx_ai_players_active ON ai_players (active, status);

-- 回滚：
-- 按 0010 结构重建 ai_players 并执行 DELETE FROM schema_migrations WHERE id = 11;
