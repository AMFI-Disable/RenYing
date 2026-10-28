-- 0004：登录令牌记着属于哪台设备（devices.id；以前的老式 30 天令牌是空的），退出一台设备时按它删。
ALTER TABLE sessions ADD COLUMN dev TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_sessions_dev ON sessions(dev);

-- 回滚：
-- DROP INDEX IF EXISTS idx_sessions_dev;
-- ALTER TABLE sessions DROP COLUMN dev;
