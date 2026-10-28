-- 0002：密码换成 PBKDF2 时加的两列。password_algo 记着是哪种存法（'pbkdf2-sha256:次数' 或以前的 'sha256-v1'），
-- password_updated_at 是什么时候换的。空库在 0001 里已经建好这两列，Worker 发现列已经有了会跳过这一句。
ALTER TABLE users ADD COLUMN password_algo TEXT NOT NULL DEFAULT 'sha256-v1';
ALTER TABLE users ADD COLUMN password_updated_at INTEGER NOT NULL DEFAULT 0;

-- 回滚（D1 的 SQLite 支持 DROP COLUMN；回滚前先把 Worker 退回不用这两列的版本）：
-- ALTER TABLE users DROP COLUMN password_updated_at;
-- ALTER TABLE users DROP COLUMN password_algo;
