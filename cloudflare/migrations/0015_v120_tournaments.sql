-- v1.2.0 持久化公开锦标赛签表（0015）：支持网页端持久保存、观赛链接分享与 60 秒内存缓存读取。
CREATE TABLE IF NOT EXISTS public_tournaments (
    id TEXT PRIMARY KEY,
    host_uid TEXT NOT NULL,
    host_name TEXT NOT NULL,
    title TEXT NOT NULL,
    size INTEGER NOT NULL CHECK (size IN (4, 8, 16)),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
    code TEXT NOT NULL CHECK (length(code) <= 8192),
    updated_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_public_tournaments_updated ON public_tournaments (updated_at DESC);

-- 回滚：
-- DROP INDEX IF EXISTS idx_public_tournaments_updated;
-- DROP TABLE IF EXISTS public_tournaments;
