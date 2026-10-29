-- 0007：全服肉鸽 · 江湖长卷（全服共享的剧情线，src/data/13-chron.js）。只加新表，不动已有的表和玩家数据。
-- chron        全服只有一行（id = 1）：现在推到第几节（node，从 0 数）、这一节完成了多少（got / need）、目标键（g）、每进一节 v 加一
-- chron_rep    分线上报的编号：同一次上报重发（网络断了不知道成没成）只算一次。nonce 是这一次发送的随机串，后面几句只认这一次插进去的
-- chron_part   谁在哪一节出过力（amt 出了多少力），只有出过力的云端账号能领这一节的奖励
-- chron_done   完成了的节：什么时候、哪条线收的尾、这一节的墨锭和秘卷（完成时按 13-chron.js 算好写进来）
-- chron_claim  谁领过哪一节（主键 node + uid，一个号一节只领一次）；cn 是那一次领取的编号，墨锭按这个编号写一份 gift
CREATE TABLE IF NOT EXISTS chron (id INTEGER PRIMARY KEY CHECK (id = 1), node INTEGER NOT NULL DEFAULT 0 CHECK (node >= 0), got INTEGER NOT NULL DEFAULT 0 CHECK (got >= 0), need INTEGER NOT NULL DEFAULT 1 CHECK (need >= 1), g TEXT NOT NULL DEFAULT 'kill', v INTEGER NOT NULL DEFAULT 0, at INTEGER NOT NULL DEFAULT 0);
INSERT OR IGNORE INTO chron (id, node, got, need, g, v, at) VALUES (1, 0, 0, 40, 'kill', 0, 0);
CREATE TABLE IF NOT EXISTS chron_rep (rid TEXT PRIMARY KEY, nonce TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_chron_rep_at ON chron_rep (at);
CREATE TABLE IF NOT EXISTS chron_part (node INTEGER NOT NULL, uid TEXT NOT NULL, amt INTEGER NOT NULL DEFAULT 0 CHECK (amt >= 0), PRIMARY KEY (node, uid));
CREATE INDEX IF NOT EXISTS idx_chron_part_uid ON chron_part (uid, node);
CREATE TABLE IF NOT EXISTS chron_done (node INTEGER PRIMARY KEY, at INTEGER NOT NULL, line INTEGER NOT NULL DEFAULT 0, ink INTEGER NOT NULL DEFAULT 0 CHECK (ink >= 0), mj TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS chron_claim (node INTEGER NOT NULL, uid TEXT NOT NULL, cn TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (node, uid));
CREATE INDEX IF NOT EXISTS idx_chron_claim_uid ON chron_claim (uid, cn);

-- 回滚（墨锭已经写进 gift 的照样能领）：
-- DROP TABLE chron_claim;
-- DROP TABLE chron_done;
-- DROP TABLE chron_part;
-- DROP TABLE chron_rep;
-- DROP TABLE chron;
-- DELETE FROM schema_migrations WHERE id = 7;
