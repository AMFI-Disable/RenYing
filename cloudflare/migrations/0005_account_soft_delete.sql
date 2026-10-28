-- 0005：管理后台删除账号只记删除时间（0 是没删），别的数据都不动，恢复就是改回 0。
ALTER TABLE users ADD COLUMN deleted_at INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_users_deleted ON users(deleted_at) WHERE deleted_at > 0;

-- 回滚（先把删除了的号恢复，或者确认不要了；回滚前先把 Worker 退回不用这一列的版本）：
-- DROP INDEX IF EXISTS idx_users_deleted;
-- ALTER TABLE users DROP COLUMN deleted_at;
