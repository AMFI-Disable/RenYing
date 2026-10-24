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
