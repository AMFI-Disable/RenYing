-- Cloudflare D1 Database Schema for RenYing (刃影)
-- 这是 cloudflare/migrations/ 里所有迁移跑完以后的样子，方便一次看全；表结构以迁移文件为准，改表要加新的迁移文件，再同步改这里
-- （tools/econ-test.mjs 会核对两边一样）。Worker 第一次收到请求时自己跑迁移，记在 schema_migrations 表里，平时不用手动执行这个文件。

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    profile_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    -- 密码怎么存的：'pbkdf2-sha256:次数' 或以前的 'sha256-v1'（老号登录成功时自动换成 PBKDF2）。
    -- 以前建的库没有这两列，迁移 0002 会加上
    password_algo TEXT NOT NULL DEFAULT 'sha256-v1',
    password_updated_at INTEGER NOT NULL DEFAULT 0,
    -- 管理后台删除的号：0 是没删，否则是删除时间。删除不动别的数据，恢复就是改回 0（迁移 0005）
    deleted_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_users_deleted ON users(deleted_at) WHERE deleted_at > 0;

-- token 存的是 'h1:' + 令牌的 SHA-256（十六进制），不存原文；以前存原文的那些，用到一次就换成哈希。
CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    dev TEXT NOT NULL DEFAULT '',   -- 属于哪台设备（devices.id）；老式 30 天令牌是空的
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 一台设备（一个浏览器）一行：refresh 是续期令牌的哈希，prev 是上一个（刚换完 1 分钟内拿它来换算两个标签页同时换）
CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    refresh TEXT NOT NULL UNIQUE,
    prev TEXT NOT NULL DEFAULT '',
    rotated_at INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    last_seen INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_dev ON sessions(dev);
-- 换掉的续期令牌（哈希）：再被拿来用就是被偷了
CREATE TABLE IF NOT EXISTS refresh_used (
    h TEXT PRIMARY KEY,
    dev TEXT NOT NULL,
    at INTEGER NOT NULL
);

-- 刃影武库（经济）和反作弊。
-- 武库存档：state_json 是库存、武器箱、终端机、改名标签这些；srv_json 是只有服务器看的账（墨锭入账编号、每天入账额、卖掉的皮肤）。
-- ver 每改一次加 1，两个请求同时改时只有一个能成（防双花）。
CREATE TABLE IF NOT EXISTS econ (
    uid TEXT PRIMARY KEY,
    state_json TEXT NOT NULL,
    srv_json TEXT NOT NULL,
    ink INTEGER NOT NULL CHECK (ink >= 0),
    ver INTEGER NOT NULL CHECK (ver >= 0),
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
    strikes INTEGER NOT NULL DEFAULT 0 CHECK (strikes >= 0),
    ban_until INTEGER NOT NULL DEFAULT 0,
    perm INTEGER NOT NULL DEFAULT 0 CHECK (perm IN (0, 1)),
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
    st INTEGER NOT NULL CHECK (st >= -1),
    item_json TEXT NOT NULL,
    price INTEGER NOT NULL CHECK (price >= 1),
    at INTEGER NOT NULL,
    state INTEGER NOT NULL DEFAULT 0 CHECK (state IN (0, 1, 2)),
    buyer TEXT,
    done_at INTEGER,
    paid INTEGER NOT NULL DEFAULT 0 CHECK (paid IN (0, 1)),
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

-- 登录记录：注册、登录、失败、退出、改密码…各一条，留 90 天。ip 是 HMAC 后的前 16 位（倒推不出 IP）
CREATE TABLE IF NOT EXISTS auth_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at INTEGER NOT NULL,
    uid TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL DEFAULT '',
    act TEXT NOT NULL,
    ip TEXT NOT NULL DEFAULT '',
    dev TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_auth_log_uid ON auth_log(uid, at);
CREATE INDEX IF NOT EXISTS idx_auth_log_at ON auth_log(at);

-- 管理员账号：名字 + 密码（PBKDF2，和玩家一样），四种角色。ADMIN_SECRET 口令登录不在这张表里
CREATE TABLE IF NOT EXISTS admins (
    name TEXT PRIMARY KEY COLLATE NOCASE,
    role TEXT NOT NULL CHECK (role IN ('view', 'econ', 'ban', 'all')),
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    password_algo TEXT NOT NULL,
    disabled INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    created_by TEXT NOT NULL,
    last_login INTEGER NOT NULL DEFAULT 0
);

-- 管理网页的登录：30 分钟，token 只存哈希（h1: + sha256）。改密码、停用、退出时删掉
CREATE TABLE IF NOT EXISTS admin_sessions (
    token TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);

-- 错误记录：同一种错（kind + 消息 + 位置）合成一行，n 是出现了几次。kind：client 网页报上来的、server 服务器自己出的错、slow 慢请求。
-- ms 是慢请求最慢一次多少毫秒，ms_sum 是加起来多少毫秒（除以 n 是平均）。不存 IP、账号
CREATE TABLE IF NOT EXISTS errs (
    sig TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    msg TEXT NOT NULL,
    src TEXT NOT NULL,
    stack TEXT NOT NULL,
    meta TEXT NOT NULL,
    n INTEGER NOT NULL,
    first_at INTEGER NOT NULL,
    last_at INTEGER NOT NULL,
    ms INTEGER NOT NULL DEFAULT 0,
    ms_sum INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_errs_last ON errs (kind, last_at);

-- 天魔讨伐：每一代一行（hp 到 0 或 until 到了就 ended；killer 为空表示遁走了；paid 是奖励发了没有）；last / last_tx 是最近一次扣血扣了多少、是哪个请求
CREATE TABLE IF NOT EXISTS gboss (
    gen INTEGER PRIMARY KEY,
    hero TEXT NOT NULL,
    affix TEXT NOT NULL,
    max_hp INTEGER NOT NULL,
    hp INTEGER NOT NULL,
    started INTEGER NOT NULL,
    until INTEGER NOT NULL,
    ended INTEGER NOT NULL DEFAULT 0,
    killer TEXT,
    paid INTEGER NOT NULL DEFAULT 0,
    last INTEGER NOT NULL DEFAULT 0,
    last_tx TEXT
);
CREATE TABLE IF NOT EXISTS gboss_hit (
    gen INTEGER NOT NULL,
    uid TEXT NOT NULL,
    dmg INTEGER NOT NULL,
    runs INTEGER NOT NULL,
    last INTEGER NOT NULL,
    PRIMARY KEY (gen, uid)
);
-- 一次出战一张票：done 是交过伤害没有，dmg 是最后算进去多少（天魔已经倒了就是 0），killed 是这一下打死的
CREATE TABLE IF NOT EXISTS gboss_try (
    id TEXT PRIMARY KEY,
    uid TEXT NOT NULL,
    gen INTEGER NOT NULL,
    started INTEGER NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    tx TEXT,
    dmg INTEGER NOT NULL DEFAULT 0,
    killed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_gboss_try_uid ON gboss_try (uid, started);
CREATE INDEX IF NOT EXISTS idx_gboss_try_done ON gboss_try (done, started);

-- 侠客列传的江湖足迹：node 是 n1 ~ n5（走完第几节）、c3（第 3 节的抉择）、end（结局），pick 是选了什么
CREATE TABLE IF NOT EXISTS saga_mark (
    hero TEXT NOT NULL,
    node TEXT NOT NULL,
    uid TEXT NOT NULL,
    pick TEXT NOT NULL,
    at INTEGER NOT NULL,
    PRIMARY KEY (hero, node, uid)
);

-- 全服肉鸽 · 江湖长卷（0007）：全服共享的剧情进度只有 chron 这一行；分线上报去重（chron_rep）；谁在哪一节出过力（chron_part）；
-- 完成了的节和奖励（chron_done）；谁领过哪一节（chron_claim，一个号一节只领一次）
CREATE TABLE IF NOT EXISTS chron (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    node INTEGER NOT NULL DEFAULT 0 CHECK (node >= 0),
    got INTEGER NOT NULL DEFAULT 0 CHECK (got >= 0),
    need INTEGER NOT NULL DEFAULT 1 CHECK (need >= 1),
    g TEXT NOT NULL DEFAULT 'kill',
    v INTEGER NOT NULL DEFAULT 0,
    at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS chron_rep (
    rid TEXT PRIMARY KEY,
    nonce TEXT NOT NULL,
    at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chron_rep_at ON chron_rep (at);
CREATE TABLE IF NOT EXISTS chron_part (
    node INTEGER NOT NULL,
    uid TEXT NOT NULL,
    amt INTEGER NOT NULL DEFAULT 0 CHECK (amt >= 0),
    PRIMARY KEY (node, uid)
);
CREATE INDEX IF NOT EXISTS idx_chron_part_uid ON chron_part (uid, node);
CREATE TABLE IF NOT EXISTS chron_done (
    node INTEGER PRIMARY KEY,
    at INTEGER NOT NULL,
    line INTEGER NOT NULL DEFAULT 0,
    ink INTEGER NOT NULL DEFAULT 0 CHECK (ink >= 0),
    mj TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS chron_claim (
    node INTEGER NOT NULL,
    uid TEXT NOT NULL,
    cn TEXT NOT NULL,
    at INTEGER NOT NULL,
    PRIMARY KEY (node, uid)
);
CREATE INDEX IF NOT EXISTS idx_chron_claim_uid ON chron_claim (uid, cn);
