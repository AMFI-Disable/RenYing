-- 0008：匿名游玩统计（每天多少人玩、新玩家第 2 天和第 7 天还回不回来、各模式开了多少局、新手教学走到哪一步）。只加新表，不动已有的表和玩家数据。
-- 不存名字、账号、邮箱、IP：网页给一个随机编号，服务器再加盐算一次哈希才存（vid），只用来去重和算留存。
-- play_visitors  每个匿名编号第一次和最近一次来的日子（day 是北京时间的第几天，从 1970-01-01 数）
-- play_days      哪一天来过哪些编号（算每天人数和留存），留 120 天
-- play_counts    每天每件事发生了几次（k：open、tut_start、tut_done、m:cpu 这种），一直留着（很小）
CREATE TABLE IF NOT EXISTS play_visitors (vid TEXT PRIMARY KEY, first_day INTEGER NOT NULL, last_day INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_play_visitors_first ON play_visitors (first_day);
CREATE TABLE IF NOT EXISTS play_days (day INTEGER NOT NULL, vid TEXT NOT NULL, PRIMARY KEY (day, vid));
CREATE TABLE IF NOT EXISTS play_counts (day INTEGER NOT NULL, k TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0 CHECK (n >= 0), PRIMARY KEY (day, k));

-- 回滚（只是统计，删了不影响玩家）：
-- DROP TABLE play_counts;
-- DROP TABLE play_days;
-- DROP TABLE play_visitors;
-- DELETE FROM schema_migrations WHERE id = 8;
