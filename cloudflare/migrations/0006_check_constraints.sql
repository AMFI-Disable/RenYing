-- 0006：给武库存档、玩家市场、处罚记录加 CHECK 约束，代码哪天写错了，数据库也不会存进负墨锭、不认识的挂单状态这种值。
-- SQLite 不能给已有的表加 CHECK，只能新建一张带约束的表、把数据搬过去、删掉旧表、改名。三张表都没有别的表用外键指着，
-- 删旧表不会连带删别的数据（users 被 sessions、devices 用外键指着，所以不动它）。
-- 搬的时候顺手把不合规的值夹回范围里（正常数据不会有）：负的墨锭、版本号当 0，市场状态不认识的当撤下，paid 只留 0 / 1，
-- 标价至少 1，斩数至少 -1；记过次数不为负，perm 只留 0 / 1。
-- 整个文件在一个事务里：中途出错就整个退回，什么都不改，下次请求再试。

CREATE TABLE econ_new (uid TEXT PRIMARY KEY, state_json TEXT NOT NULL, srv_json TEXT NOT NULL, ink INTEGER NOT NULL CHECK (ink >= 0), ver INTEGER NOT NULL CHECK (ver >= 0), updated_at INTEGER NOT NULL);
INSERT INTO econ_new (uid, state_json, srv_json, ink, ver, updated_at) SELECT uid, state_json, srv_json, MAX(ink, 0), MAX(ver, 0), updated_at FROM econ;
DROP TABLE econ;
ALTER TABLE econ_new RENAME TO econ;

CREATE TABLE mkt_new (id TEXT PRIMARY KEY, seller TEXT NOT NULL, k TEXT NOT NULL, st INTEGER NOT NULL CHECK (st >= -1), item_json TEXT NOT NULL, price INTEGER NOT NULL CHECK (price >= 1), at INTEGER NOT NULL, state INTEGER NOT NULL DEFAULT 0 CHECK (state IN (0, 1, 2)), buyer TEXT, done_at INTEGER, paid INTEGER NOT NULL DEFAULT 0 CHECK (paid IN (0, 1)), tx TEXT);
INSERT INTO mkt_new (id, seller, k, st, item_json, price, at, state, buyer, done_at, paid, tx)
  SELECT id, seller, k, MAX(st, -1), item_json, MAX(price, 1), at, CASE WHEN state IN (0, 1, 2) THEN state ELSE 2 END, buyer, done_at, CASE WHEN paid = 0 THEN 0 ELSE 1 END, tx FROM mkt;
DROP TABLE mkt;
ALTER TABLE mkt_new RENAME TO mkt;
CREATE INDEX IF NOT EXISTS idx_mkt_k ON mkt (k, state, price);
CREATE INDEX IF NOT EXISTS idx_mkt_seller ON mkt (seller, state, paid);
CREATE INDEX IF NOT EXISTS idx_mkt_done ON mkt (state, done_at);

CREATE TABLE sanctions_new (uid TEXT PRIMARY KEY, strikes INTEGER NOT NULL DEFAULT 0 CHECK (strikes >= 0), ban_until INTEGER NOT NULL DEFAULT 0, perm INTEGER NOT NULL DEFAULT 0 CHECK (perm IN (0, 1)), log_json TEXT NOT NULL DEFAULT '[]', at INTEGER NOT NULL DEFAULT 0, pardon INTEGER NOT NULL DEFAULT 0);
INSERT INTO sanctions_new (uid, strikes, ban_until, perm, log_json, at, pardon) SELECT uid, MAX(strikes, 0), ban_until, CASE WHEN perm = 0 THEN 0 ELSE 1 END, log_json, at, pardon FROM sanctions;
DROP TABLE sanctions;
ALTER TABLE sanctions_new RENAME TO sanctions;

-- 回滚：三张表各做一遍反过来的（以 econ 为例，mkt 记得重建三个索引）：
-- CREATE TABLE econ_old (uid TEXT PRIMARY KEY, state_json TEXT NOT NULL, srv_json TEXT NOT NULL, ink INTEGER NOT NULL, ver INTEGER NOT NULL, updated_at INTEGER NOT NULL);
-- INSERT INTO econ_old SELECT uid, state_json, srv_json, ink, ver, updated_at FROM econ;
-- DROP TABLE econ;
-- ALTER TABLE econ_old RENAME TO econ;
-- DELETE FROM schema_migrations WHERE id = 6;
