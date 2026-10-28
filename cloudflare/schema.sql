-- Cloudflare D1 Database Schema for RenYing (刃影)
-- Run this in Cloudflare Dashboard -> Storage & Databases -> D1 -> Console,
-- or via CLI: npx wrangler d1 execute renying-db --file=./cloudflare/schema.sql

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    profile_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- token 存的是 'h1:' + 令牌的 SHA-256（十六进制），不存原文；以前存原文的那些，用到一次就换成哈希。
CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- 刃影武库（经济）和反作弊。worker 第一次收到请求时会自动建这些表，这里列出来方便查看和手动建。
-- 武库存档：state_json 是库存、武器箱、终端机、改名标签这些；srv_json 是只有服务器看的账（墨锭入账编号、每天入账额、卖掉的皮肤）。
-- ver 每改一次加 1，两个请求同时改时只有一个能成（防双花）。
CREATE TABLE IF NOT EXISTS econ (
    uid TEXT PRIMARY KEY,
    state_json TEXT NOT NULL,
    srv_json TEXT NOT NULL,
    ink INTEGER NOT NULL,
    ver INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- 每个请求的一次性编号和结果：网络重试同一个编号，直接回上次的结果，不会再执行一遍。
CREATE TABLE IF NOT EXISTS econ_nonce (
    uid TEXT NOT NULL,
    nonce TEXT NOT NULL,
    at INTEGER NOT NULL,
    res_json TEXT NOT NULL,
    PRIMARY KEY (uid, nonce)
);

-- 流水：每次开箱、终端机、买卖、汰换、墨锭上报都记一条（查账、查作弊用）。
CREATE TABLE IF NOT EXISTS econ_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uid TEXT NOT NULL,
    at INTEGER NOT NULL,
    act TEXT NOT NULL,
    ok INTEGER NOT NULL,
    ink0 INTEGER,
    ink1 INTEGER,
    detail TEXT
);
CREATE INDEX IF NOT EXISTS idx_econ_log_uid ON econ_log (uid, at);
-- 管理后台查“管理员做过的事”用（act 是 admin、admin_ban、pardon、admin_pw、gift_new、gift_off、code_new、code_off、cfg 这些）。
CREATE INDEX IF NOT EXISTS idx_econ_log_act ON econ_log (act, id);

-- 处罚记录：第 1 次警告，第 2 次封 1 天，第 3 次永久封号；pardon 是管理员解封的时间。
CREATE TABLE IF NOT EXISTS sanctions (
    uid TEXT PRIMARY KEY,
    strikes INTEGER NOT NULL DEFAULT 0,
    ban_until INTEGER NOT NULL DEFAULT 0,
    perm INTEGER NOT NULL DEFAULT 0,
    log_json TEXT NOT NULL DEFAULT '[]',
    at INTEGER NOT NULL DEFAULT 0,
    pardon INTEGER NOT NULL DEFAULT 0
);

-- 限速计数：每个账号、每个 IP 在一段时间里的请求数。
CREATE TABLE IF NOT EXISTS rate (
    k TEXT PRIMARY KEY,
    n INTEGER NOT NULL,
    reset INTEGER NOT NULL
);

-- 玩家市场：只有玩家之间买卖饰品，标价玩家自己定。state 0 在卖、1 卖掉了、2 撤下了；
-- paid 是卖家拿到钱没有（卖家下次动武库时结）；tx 是改这一单的那个请求（买、撤同一单只有一个能成）。
CREATE TABLE IF NOT EXISTS mkt (
    id TEXT PRIMARY KEY,
    seller TEXT NOT NULL,
    k TEXT NOT NULL,
    st INTEGER NOT NULL,
    item_json TEXT NOT NULL,
    price INTEGER NOT NULL,
    at INTEGER NOT NULL,
    state INTEGER NOT NULL DEFAULT 0,
    buyer TEXT,
    done_at INTEGER,
    paid INTEGER NOT NULL DEFAULT 0,
    tx TEXT
);
CREATE INDEX IF NOT EXISTS idx_mkt_k ON mkt (k, state, price);
CREATE INDEX IF NOT EXISTS idx_mkt_seller ON mkt (seller, state, paid);
CREATE INDEX IF NOT EXISTS idx_mkt_done ON mkt (state, done_at);

-- 全服补偿（管理后台发）：uid 是 '*' 就发给所有人，否则只发给这一个账号。玩家下次动武库时自动领，每个账号只领一次（gift_got）。
-- born：只有这个时间之前注册的账号能领（发补偿之后新注册的号不领）；until 之后不再发；off 是 1 就是停发了。
CREATE TABLE IF NOT EXISTS gift (
    id TEXT PRIMARY KEY,
    uid TEXT NOT NULL,
    ink INTEGER NOT NULL DEFAULT 0,
    items_json TEXT NOT NULL DEFAULT '{}',
    note TEXT NOT NULL,
    by TEXT NOT NULL,
    at INTEGER NOT NULL,
    until INTEGER NOT NULL,
    born INTEGER NOT NULL,
    off INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_gift_uid ON gift (uid, until);
CREATE TABLE IF NOT EXISTS gift_got (
    gid TEXT NOT NULL,
    uid TEXT NOT NULL,
    at INTEGER NOT NULL,
    PRIMARY KEY (gid, uid)
);

-- 礼包兑换码（管理后台建）：玩家在游戏的兑换框输入，领到里面的东西（和补偿一样直接进存档和墨锭）。
-- 每个账号只领一次（code_got）；got 是已经领走的份数，到了 uses 就领完了（CHECK 挡住多领）；过了 until、off 是 1 都领不到。
CREATE TABLE IF NOT EXISTS code (
    code TEXT PRIMARY KEY,
    ink INTEGER NOT NULL DEFAULT 0,
    items_json TEXT NOT NULL DEFAULT '{}',
    note TEXT NOT NULL,
    by TEXT NOT NULL,
    at INTEGER NOT NULL,
    until INTEGER NOT NULL,
    uses INTEGER NOT NULL,
    got INTEGER NOT NULL DEFAULT 0,
    off INTEGER NOT NULL DEFAULT 0,
    CHECK (got <= uses)
);
CREATE TABLE IF NOT EXISTS code_got (
    code TEXT NOT NULL,
    uid TEXT NOT NULL,
    at INTEGER NOT NULL,
    PRIMARY KEY (code, uid)
);

-- 在线改的经济数值（价格、爆率、每天能开几个、手续费、掉落、每天认多少本机收入）：每改一次加一行，最后一行是现在用的。
-- json 只存和默认值不一样的项；能改哪些、上下限是多少看 src/armory-core.js 的 C.CFG_INFO。
CREATE TABLE IF NOT EXISTS cfg (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    json TEXT NOT NULL,
    by TEXT NOT NULL,
    note TEXT NOT NULL,
    at INTEGER NOT NULL
);

-- 在线人数：每个打开的网页（按标签页）每 30 秒报一次到，90 秒内报过的算在线；ip 只存哈希
CREATE TABLE IF NOT EXISTS presence (
    sid TEXT PRIMARY KEY,
    ip TEXT NOT NULL,
    st TEXT NOT NULL,
    seen INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_presence_seen ON presence (seen);

-- 功能开关：只存在管理后台改过的；能有哪些开关、默认是什么看 cloudflare/worker.js 的 FLAGS。
-- mode：off 关，dev 只开 Dev 账号，all 所有人
CREATE TABLE IF NOT EXISTS flags (
    k TEXT PRIMARY KEY,
    mode TEXT NOT NULL CHECK (mode IN ('off', 'dev', 'all')),
    by TEXT NOT NULL,
    note TEXT NOT NULL,
    at INTEGER NOT NULL
);
