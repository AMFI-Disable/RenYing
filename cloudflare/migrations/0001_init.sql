-- 0001：最早的一批表（迁移文件出现以前 Worker 启动时建的那些，原样搬过来）。
-- 以前的库这些表都已经有了，IF NOT EXISTS 直接跳过；空库从这里建起。
-- 后来加的列、约束在后面的文件里。

CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL COLLATE NOCASE, password_hash TEXT NOT NULL, salt TEXT NOT NULL, profile_json TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, password_algo TEXT NOT NULL DEFAULT 'sha256-v1', password_updated_at INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, dev TEXT NOT NULL DEFAULT '', FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS devices (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, refresh TEXT NOT NULL UNIQUE, prev TEXT NOT NULL DEFAULT '', rotated_at INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, label TEXT NOT NULL DEFAULT '', last_seen INTEGER NOT NULL DEFAULT 0, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_id);
CREATE TABLE IF NOT EXISTS refresh_used (h TEXT PRIMARY KEY, dev TEXT NOT NULL, at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS admins (name TEXT PRIMARY KEY COLLATE NOCASE, role TEXT NOT NULL CHECK (role IN ('view', 'econ', 'ban', 'all')), password_hash TEXT NOT NULL, salt TEXT NOT NULL, password_algo TEXT NOT NULL, disabled INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, created_by TEXT NOT NULL, last_login INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS admin_sessions (token TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS auth_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, uid TEXT NOT NULL DEFAULT '', name TEXT NOT NULL DEFAULT '', act TEXT NOT NULL, ip TEXT NOT NULL DEFAULT '', dev TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS idx_auth_log_uid ON auth_log(uid, at);
CREATE INDEX IF NOT EXISTS idx_auth_log_at ON auth_log(at);
CREATE TABLE IF NOT EXISTS econ (uid TEXT PRIMARY KEY, state_json TEXT NOT NULL, srv_json TEXT NOT NULL, ink INTEGER NOT NULL, ver INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS econ_nonce (uid TEXT NOT NULL, nonce TEXT NOT NULL, at INTEGER NOT NULL, res_json TEXT NOT NULL, PRIMARY KEY (uid, nonce));
CREATE TABLE IF NOT EXISTS econ_log (id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT NOT NULL, at INTEGER NOT NULL, act TEXT NOT NULL, ok INTEGER NOT NULL, ink0 INTEGER, ink1 INTEGER, detail TEXT);
CREATE INDEX IF NOT EXISTS idx_econ_log_uid ON econ_log (uid, at);
-- 管理后台查“管理员做过的事”用
CREATE INDEX IF NOT EXISTS idx_econ_log_act ON econ_log (act, id);
CREATE TABLE IF NOT EXISTS sanctions (uid TEXT PRIMARY KEY, strikes INTEGER NOT NULL DEFAULT 0, ban_until INTEGER NOT NULL DEFAULT 0, perm INTEGER NOT NULL DEFAULT 0, log_json TEXT NOT NULL DEFAULT '[]', at INTEGER NOT NULL DEFAULT 0, pardon INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS rate (k TEXT PRIMARY KEY, n INTEGER NOT NULL, reset INTEGER NOT NULL);
-- 玩家市场：state 0 在卖、1 卖掉了、2 撤下了；paid 是卖家拿到钱没有；tx 是改它的那个请求（同一批写入靠它确认改成了）
CREATE TABLE IF NOT EXISTS mkt (id TEXT PRIMARY KEY, seller TEXT NOT NULL, k TEXT NOT NULL, st INTEGER NOT NULL, item_json TEXT NOT NULL, price INTEGER NOT NULL, at INTEGER NOT NULL, state INTEGER NOT NULL DEFAULT 0, buyer TEXT, done_at INTEGER, paid INTEGER NOT NULL DEFAULT 0, tx TEXT);
CREATE INDEX IF NOT EXISTS idx_mkt_k ON mkt (k, state, price);
CREATE INDEX IF NOT EXISTS idx_mkt_seller ON mkt (seller, state, paid);
CREATE INDEX IF NOT EXISTS idx_mkt_done ON mkt (state, done_at);
-- 全服补偿：uid 是 '*' 发给所有人（只给 born 之前注册的号），否则只发给这一个号；领过的记在 gift_got
CREATE TABLE IF NOT EXISTS gift (id TEXT PRIMARY KEY, uid TEXT NOT NULL, ink INTEGER NOT NULL DEFAULT 0, items_json TEXT NOT NULL DEFAULT '{}', note TEXT NOT NULL, by TEXT NOT NULL, at INTEGER NOT NULL, until INTEGER NOT NULL, born INTEGER NOT NULL, off INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_gift_uid ON gift (uid, until);
CREATE TABLE IF NOT EXISTS gift_got (gid TEXT NOT NULL, uid TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (gid, uid));
-- 兑换码：玩家在游戏里输入就领到里面的东西，每个号只领一次（code_got）；got 到了 uses 就领完了（CHECK 挡住多领），until 之后、off 是 1 都领不到
CREATE TABLE IF NOT EXISTS code (code TEXT PRIMARY KEY, ink INTEGER NOT NULL DEFAULT 0, items_json TEXT NOT NULL DEFAULT '{}', note TEXT NOT NULL, by TEXT NOT NULL, at INTEGER NOT NULL, until INTEGER NOT NULL, uses INTEGER NOT NULL, got INTEGER NOT NULL DEFAULT 0, off INTEGER NOT NULL DEFAULT 0, CHECK (got <= uses));
CREATE TABLE IF NOT EXISTS code_got (code TEXT NOT NULL, uid TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (code, uid));
-- 在线改的经济数值：每改一次加一行，最后一行是现在用的（只存和默认值不一样的项）
CREATE TABLE IF NOT EXISTS cfg (id INTEGER PRIMARY KEY AUTOINCREMENT, json TEXT NOT NULL, by TEXT NOT NULL, note TEXT NOT NULL, at INTEGER NOT NULL);
-- 在线人数：每个打开的网页（按标签页，刷新不算新人）每 30 秒报一次到；PRESENCE_WINDOW 内报过的算在线。ip 只存哈希
CREATE TABLE IF NOT EXISTS presence (sid TEXT PRIMARY KEY, ip TEXT NOT NULL, st TEXT NOT NULL, seen INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_presence_seen ON presence (seen);
-- 天魔讨伐：每一代一行（hp 到 0 或 until 到了就 ended；killer 为空表示遁走了；paid 是奖励发了没有）；last / last_tx 是最近一次扣血扣了多少、是哪个请求
CREATE TABLE IF NOT EXISTS gboss (gen INTEGER PRIMARY KEY, hero TEXT NOT NULL, affix TEXT NOT NULL, max_hp INTEGER NOT NULL, hp INTEGER NOT NULL, started INTEGER NOT NULL, until INTEGER NOT NULL, ended INTEGER NOT NULL DEFAULT 0, killer TEXT, paid INTEGER NOT NULL DEFAULT 0, last INTEGER NOT NULL DEFAULT 0, last_tx TEXT);
CREATE TABLE IF NOT EXISTS gboss_hit (gen INTEGER NOT NULL, uid TEXT NOT NULL, dmg INTEGER NOT NULL, runs INTEGER NOT NULL, last INTEGER NOT NULL, PRIMARY KEY (gen, uid));
-- 一次出战一张票：done 是交过伤害没有，dmg 是最后算进去多少（天魔已经倒了就是 0），killed 是这一下打死的
CREATE TABLE IF NOT EXISTS gboss_try (id TEXT PRIMARY KEY, uid TEXT NOT NULL, gen INTEGER NOT NULL, started INTEGER NOT NULL, done INTEGER NOT NULL DEFAULT 0, tx TEXT, dmg INTEGER NOT NULL DEFAULT 0, killed INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_gboss_try_uid ON gboss_try (uid, started);
CREATE INDEX IF NOT EXISTS idx_gboss_try_done ON gboss_try (done, started);
-- 侠客列传的江湖足迹：node 是 n1 ~ n5（走完第几节）、c3（第 3 节的抉择）、end（结局），pick 是选了什么
CREATE TABLE IF NOT EXISTS saga_mark (hero TEXT NOT NULL, node TEXT NOT NULL, uid TEXT NOT NULL, pick TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (hero, node, uid));
-- 功能开关：mode 是 off（关）、dev（只对 Dev 账号开）、all（所有人开）；没有这一行就用代码里 FLAGS 写的默认值
CREATE TABLE IF NOT EXISTS flags (k TEXT PRIMARY KEY, mode TEXT NOT NULL CHECK (mode IN ('off', 'dev', 'all')), by TEXT NOT NULL, note TEXT NOT NULL, at INTEGER NOT NULL);
-- 错误记录：同一种错（kind + 消息 + 位置）合成一行，n 是出现了几次。kind：client 网页报上来的、server 服务器自己出的错、slow 慢请求。不存 IP、账号
CREATE TABLE IF NOT EXISTS errs (sig TEXT PRIMARY KEY, kind TEXT NOT NULL, msg TEXT NOT NULL, src TEXT NOT NULL, stack TEXT NOT NULL, meta TEXT NOT NULL, n INTEGER NOT NULL, first_at INTEGER NOT NULL, last_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_errs_last ON errs (kind, last_at);

-- 回滚：这是第一个迁移，回滚就是删库重建，不要在生产上做。
