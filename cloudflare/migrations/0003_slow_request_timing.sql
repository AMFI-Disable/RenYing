-- 0003：错误记录里加慢请求的耗时：ms 是最慢一次多少毫秒，ms_sum 是加起来多少毫秒（除以 n 是平均）。
ALTER TABLE errs ADD COLUMN ms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE errs ADD COLUMN ms_sum INTEGER NOT NULL DEFAULT 0;

-- 回滚：
-- ALTER TABLE errs DROP COLUMN ms_sum;
-- ALTER TABLE errs DROP COLUMN ms;
