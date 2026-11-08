-- 匿名对局训练样本：只存校验后的战斗状态、按键、奖励与模式，不含账号或玩家名称。
CREATE TABLE IF NOT EXISTS ai_training_matches (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL,
  result INTEGER NOT NULL CHECK (result IN (-1, 0, 1)),
  rows_json TEXT NOT NULL,
  received_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_training_received ON ai_training_matches (received_at);

-- 回滚：
-- DROP TABLE ai_training_matches;
-- DELETE FROM schema_migrations WHERE id = 9;
