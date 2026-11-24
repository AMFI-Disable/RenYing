-- 持久化 AI 玩家账号表（0010）：管理 25 位常驻 AI 玩家的状态、活跃度、行为流派、AI 专属匹配开关与受保护的市场参与配额。
CREATE TABLE IF NOT EXISTS ai_players (
  uid TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  activity_level REAL NOT NULL DEFAULT 0.65 CHECK (activity_level >= 0 AND activity_level <= 1),
  behavior_profile TEXT NOT NULL DEFAULT 'balanced' CHECK (behavior_profile IN ('aggressive', 'balanced', 'defensive', 'tactical')),
  matchmaking_enabled INTEGER NOT NULL DEFAULT 1 CHECK (matchmaking_enabled IN (0, 1)),
  market_enabled INTEGER NOT NULL DEFAULT 1 CHECK (market_enabled IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'menu' CHECK (status IN ('menu', 'queue', 'match')),
  last_active_at INTEGER NOT NULL DEFAULT 0,
  daily_spent INTEGER NOT NULL DEFAULT 0 CHECK (daily_spent >= 0),
  daily_listed INTEGER NOT NULL DEFAULT 0 CHECK (daily_listed >= 0),
  daily_reset_day INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_ai_players_active ON ai_players (active, status);

-- 回滚：
-- DROP TABLE ai_players;
-- DELETE FROM schema_migrations WHERE id = 10;
