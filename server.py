#!/usr/bin/env python3
"""
刃影 联机服务器（只用 Python 自带的库）
Created by Even, Luffy, and Opus 5.5

它做这些事：
  1. 把游戏网页 renying.html 发给打开网址的人
  2. 房间：建房得到 4 位房间码，别人输入房间码加入，每个房间 2 人
  3. 快速匹配：排队的人两两配对，自动开一个房间
  4. 转发：同一个房间两个人之间的对战数据、聊天、表情（WebSocket）
  5. 断线重连：对战或选人时掉线，房间会保留 60 秒，回来可以接着打
  6. 账号和排行榜：注册登录（密码加盐哈希保存）
       双方都登录的对战计入“正式”战绩；对手是游客的，计入“切磋”战绩
  7. 社区聊天：所有人都能看，登录的人才能发言；有防刷屏限制，管理员可以删帖、禁言
  10. 背景音乐：music 文件夹里的 mp3
  8. 成长系统：墨锭（货币）、问剑阁（抽角色）、碎片合成、每日和每周任务、每周限免角色
  9. 排位赛：按等级分匹配，5 场定级赛，六个段位（砺锋 出鞘 破竹 惊鸿 踏月 刃影）

数据保存在 data/renying.db（SQLite 数据库），更新游戏不会动它，记得别删。
一般不用直接运行它，用同一个文件夹里的 renying.sh 来管理。
单独运行：python3 server.py [端口，默认 8765]
"""
import base64
import datetime
import hashlib
import hmac
import json
import os
import queue as msgqueue   # 发送队列（不能叫 queue：下面有个同名的排队名单）
import random
import re
import secrets
import socket
import sqlite3
import struct
import sys
import threading
import time
from urllib.parse import unquote

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.join(HERE, "index.html")
ASSETS = os.path.join(HERE, "assets")
ASSET_TYPES = {".js": "text/javascript; charset=utf-8", ".mp3": "audio/mpeg", ".png": "image/png"}
TUNNEL_LOG = os.path.join(HERE, "logs", "tunnel.log")
URL_FILE = os.path.join(os.path.expanduser("~"), "Desktop", "刃影网址.txt")
DB_PATH = os.path.join(HERE, "data", "renying.db")
WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
NAME_RE = re.compile(r"^[\w\u4e00-\u9fff]{2,12}$")
CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"   # 去掉了容易看错的 0 O 1 I
MAX_ROOMS = 300
MAX_FRAME = 256 * 1024
IDLE_TIMEOUT = 90          # 90 秒没有任何消息就断开
RESUME_WAIT = int(os.environ.get("RENYING_RESUME_WAIT", "60"))   # 掉线后房间保留多少秒


def log(*a):
    print(time.strftime("[%H:%M:%S]"), *a, flush=True)


def lan_ip():
    """这台电脑在局域网里的 IP（不会真的发出数据）"""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


# ======================= WebSocket 基础 =======================
def recv_exact(conn, n):
    buf = b""
    while len(buf) < n:
        chunk = conn.recv(n - len(buf))
        if not chunk:
            raise ConnectionError("closed")
        buf += chunk
    return buf


def unmask(data, mask):
    if not data:
        return data
    m = (mask * (len(data) // 4 + 1))[: len(data)]
    return (int.from_bytes(data, "big") ^ int.from_bytes(m, "big")).to_bytes(len(data), "big")


def read_frame(conn):
    b1, b2 = recv_exact(conn, 2)
    fin, op = b1 & 0x80, b1 & 0x0F
    n = b2 & 0x7F
    if n == 126:
        n = struct.unpack("!H", recv_exact(conn, 2))[0]
    elif n == 127:
        n = struct.unpack("!Q", recv_exact(conn, 8))[0]
    if n > MAX_FRAME:
        raise ConnectionError("frame too large")
    mask = recv_exact(conn, 4) if b2 & 0x80 else b"\0\0\0\0"
    return op, unmask(recv_exact(conn, n), mask), bool(fin)


def frame(op, data):
    n = len(data)
    if n < 126:
        head = struct.pack("!BB", 0x80 | op, n)
    elif n < 65536:
        head = struct.pack("!BBH", 0x80 | op, 126, n)
    else:
        head = struct.pack("!BBQ", 0x80 | op, 127, n)
    return head + data


class Peer:
    def __init__(self, conn):
        self.conn, self.role, self.room, self.rt = conn, None, None, None
        self.user = None            # (id, 昵称)，没登录就是 None
        self.last = time.time()     # 最后一次收到消息的时间
        self.bye = False            # 主动离开（不等重连）
        self.chat_times = []
        # 每个玩家一个发送队列和一个发送线程：一方收得慢，不会卡住别人消息的转发
        self.q = msgqueue.Queue()
        self.dead = False
        threading.Thread(target=self._writer, daemon=True).start()

    def _writer(self):
        while True:
            item = self.q.get()
            if item is None:
                return
            try:
                self.conn.sendall(item)
            except OSError:
                self.dead = True
                return

    def send(self, text, op=1):
        if self.dead:
            raise OSError("连接已断开")
        if self.q.qsize() > 3000:        # 对方很久都收不动：断开，免得消息越积越多、延迟越来越大
            self.dead = True
            self.close()
            raise OSError("对方接收太慢")
        data = text.encode("utf-8") if isinstance(text, str) else text
        self.q.put(frame(op, data))

    def close(self):
        try:
            self.conn.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass
        self.q.put(None)


def sys_msg(kind, **kw):
    kw["sys"] = kind
    return json.dumps(kw, ensure_ascii=False)


def try_send(p, text):
    try:
        p.send(text)
    except OSError:
        pass


# ======================= 账号和战绩（SQLite） =======================
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
db = sqlite3.connect(DB_PATH, check_same_thread=False)
db_lock = threading.Lock()
with db_lock:
    db.executescript("""
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT UNIQUE COLLATE NOCASE, pw BLOB, salt BLOB,
        wins INTEGER DEFAULT 0, losses INTEGER DEFAULT 0, created REAL);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER, created REAL);
    CREATE TABLE IF NOT EXISTS matches (id INTEGER PRIMARY KEY, winner INTEGER, loser INTEGER, forfeit INTEGER, at REAL);
    CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY, user_id INTEGER, name TEXT, text TEXT, at REAL);
    CREATE TABLE IF NOT EXISTS profiles (user_id INTEGER PRIMARY KEY, data TEXT, rating REAL DEFAULT 1100, placed INTEGER DEFAULT 0);
    """)
    # 旧版数据库升级：加上切磋战绩
    for col in ("cwins", "closses", "muted"):
        try:
            db.execute(f"ALTER TABLE users ADD COLUMN {col} INTEGER DEFAULT 0")
        except sqlite3.OperationalError:
            pass
    try:
        db.execute("ALTER TABLE matches ADD COLUMN ranked INTEGER DEFAULT 1")
    except sqlite3.OperationalError:
        pass
    db.commit()
login_fails = {}      # 昵称 -> (失败次数, 解锁时间)
USER_COLS = "id, name, wins, losses, cwins, closses"


def hash_pw(pw, salt):
    return hashlib.pbkdf2_hmac("sha256", pw.encode("utf-8"), salt, 200_000)


def user_json(row):
    return {"name": row[1], "wins": row[2], "losses": row[3], "cwins": row[4] or 0, "closses": row[5] or 0}


def new_session(uid):
    token = secrets.token_urlsafe(32)
    db.execute("INSERT INTO sessions VALUES (?,?,?)", (token, uid, time.time()))
    db.commit()
    return token


def user_by_token(token):
    if not token:
        return None
    with db_lock:
        return db.execute(f"SELECT u.id, u.name, u.wins, u.losses, u.cwins, u.closses FROM sessions s "
                          "JOIN users u ON u.id = s.user_id WHERE s.token = ?", (token,)).fetchone()


def api_register(body):
    name, pw = str(body.get("name", "")).strip(), str(body.get("pass", ""))
    if not NAME_RE.match(name):
        return 400, {"err": "昵称限 2 到 12 个字：中文、字母、数字、下划线皆可"}
    if len(pw) < 6 or len(pw) > 64:
        return 400, {"err": "密码须 6 到 64 位"}
    salt = secrets.token_bytes(16)
    with db_lock:
        try:
            cur = db.execute("INSERT INTO users (name, pw, salt, created) VALUES (?,?,?,?)", (name, hash_pw(pw, salt), salt, time.time()))
        except sqlite3.IntegrityError:
            return 409, {"err": "这个昵称已经有人用了，换一个吧"}
        token = new_session(cur.lastrowid)
    log(f"新玩家注册：{name}")
    return 200, {"token": token, "name": name, "wins": 0, "losses": 0, "cwins": 0, "closses": 0}


def api_login(body):
    name, pw = str(body.get("name", "")).strip(), str(body.get("pass", ""))
    key = name.lower()
    fails, until = login_fails.get(key, (0, 0))
    if time.time() < until:
        return 429, {"err": f"密码错得太多，请 {int(until - time.time()) + 1} 秒后再试"}
    with db_lock:
        row = db.execute(f"SELECT {USER_COLS}, pw, salt FROM users WHERE name = ?", (name,)).fetchone()
        ok = row is not None and hmac.compare_digest(hash_pw(pw, row[7]), row[6])
        if ok:
            token = new_session(row[0])
    if not ok:
        fails += 1
        login_fails[key] = (fails, time.time() + 60 if fails >= 5 else 0)
        return 401, {"err": "昵称或密码不对，请重新输入"}
    login_fails.pop(key, None)
    return 200, {"token": token, **user_json(row)}


def api_me(token):
    row = user_by_token(token)
    return (200, user_json(row)) if row else (401, {"err": "登录已失效，请重新登录"})


def api_logout(body):
    with db_lock:
        db.execute("DELETE FROM sessions WHERE token = ?", (str(body.get("token", "")),))
        db.commit()
    return 200, {"ok": True}


def api_leaderboard(token):
    with db_lock:
        rows = db.execute(f"SELECT {USER_COLS} FROM users WHERE wins + losses + cwins + closses > 0 "
                          "ORDER BY wins DESC, losses ASC, cwins DESC, name LIMIT 100").fetchall()
        total = db.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    me = user_by_token(token)
    return 200, {"list": [{**user_json(r), "me": bool(me and me[0] == r[0])} for r in rows],
                 "players": total, "me": user_json(me) if me else None}


# ======================= 成长系统：墨锭、问剑阁、任务、排位 =======================
STARTER = "qingfeng"                         # 所有人一开始都有的角色
POOL = {"common": ["tieshan", "leiming"], "rare": ["feiying", "liuyun", "lingshuang"], "legend": ["moyu", "yuehua", "yanling"]}
ALL_CHARS = [STARTER] + [c for cs in POOL.values() for c in cs]
RARITY = {c: r for r, cs in POOL.items() for c in cs}
FULL_RATE = {"legend": 0.015, "rare": 0.035, "common": 0.07}    # 直接抽中完整角色的概率（合计 12%）
FRAG_RARITY = [("common", 0.5), ("rare", 0.32), ("legend", 0.18)]  # 其余 88% 是碎片，按稀有度分
FRAG_AMT = [(1, 0.6), (2, 0.3), (3, 0.1)]
CRAFT = {"common": 20, "rare": 30, "legend": 40}                 # 合成一个角色要的碎片
DRAW_COST, TEN_COST, PITY = 60, 540, 20                          # 连续 20 抽没出角色，第 21 抽必出一个没有的角色
DUP_INK, FRAG_INK, START_INK, TUTORIAL_INK = 90, 6, 500, 300   # 重复角色、已拥有角色的碎片自动换成墨锭
CPU_REWARD = {"easy": (10, 5), "normal": (20, 10), "hard": (40, 20)}
CPU_DAILY_CAP = 10                                               # 打电脑每天最多拿 10 局奖励
NET_REWARD, RANK_REWARD, FIRST_WIN = (60, 30), (80, 40), 150     # （赢, 输）；每天第一胜额外奖励
PLACEMENT = 5
TIERS = [("砺锋", 850), ("出鞘", 1000), ("破竹", 1150), ("惊鸿", 1300), ("踏月", 1450), ("刃影", 1600)]
DAILY_POOL = [("play3", "试剑 3 局（任意模式）", "games", 3, 120), ("win1", "赢下 1 局对战", "wins", 1, 100),
              ("net1", "与真人联机对战 1 局", "netgames", 1, 120), ("combo10", "一鼓作气打出 10 连击", "maxcombo", 10, 100),
              ("train300", "在木人桩上累计打出 300 伤害", "traindmg", 300, 80), ("ult2", "使出 2 次大招", "ults", 2, 100),
              ("hard1", "赢下 1 局劲敌电脑", "hardwins", 1, 150)]
WEEKLY = [("wwin10", "本周赢下 10 局", "wins", 10, 400), ("wrank5", "本周闯 5 场排位赛", "rankgames", 5, 300),
          ("wdays5", "本周有 5 天领到每日任务奖励", "dailydays", 5, 300)]
MAX_STATS = {"maxcombo"}
# 皮肤：每个角色一款稀有、一款传说，只改外观
SKINS = {"qf_qfx": ("qingfeng", "legend"), "qf_frost": ("qingfeng", "rare"), "qf_gold": ("qingfeng", "legend"), "fy_jade": ("feiying", "rare"), "fy_blood": ("feiying", "legend"),
         "ts_bronze": ("tieshan", "rare"), "ts_obsidian": ("tieshan", "legend"), "ls_plum": ("lingshuang", "rare"), "ls_aurora": ("lingshuang", "legend"),
         "ly_dusk": ("liuyun", "rare"), "ly_sky": ("liuyun", "legend"), "lm_violet": ("leiming", "rare"), "lm_sun": ("leiming", "legend"),
         "my_cinnabar": ("moyu", "rare"), "my_gold": ("moyu", "legend"), "yh_sakura": ("yuehua", "rare"), "yh_eclipse": ("yuehua", "legend"),
         "yl_raven": ("yanling", "rare"), "yl_phoenix": ("yanling", "legend")}
SKIN_RATE = {"legend": 0.03, "rare": 0.12}          # 其余 85% 给 1 到 3 个角色碎片；皮肤只出已拥有角色的
SKIN_COST, SKIN_TEN, SKIN_PITY, SKIN_DUP = 30, 270, 15, 20
sysrand = random.SystemRandom()


def today():
    return time.strftime("%Y-%m-%d")


def week_id():
    y, w, _ = datetime.date.today().isocalendar()
    return f"{y}-W{w}"


def rotation():
    """每周限免：每周一换三个角色，所有人都能用"""
    return random.Random("renying-" + week_id()).sample([c for c in ALL_CHARS if c != STARTER], 3)


def tier_of(r, placed):
    if placed < PLACEMENT:
        return {"tier": None, "label": f"定级赛 第 {placed}/{PLACEMENT} 场", "placed": placed, "idx": -1}
    if r >= TIERS[-1][1]:
        return {"tier": TIERS[-1][0], "div": "", "pts": int(r - TIERS[-1][1]), "label": f"{TIERS[-1][0]} · {int(r)}", "idx": 5, "rating": int(r), "placed": placed}
    idx = max([i for i, (_, lo) in enumerate(TIERS) if r >= lo] or [0])
    within = max(0.0, r - TIERS[idx][1])
    d = min(2, int(within // 50))
    pts = int((within - d * 50) * 2) if r >= TIERS[0][1] else 0
    div = ["三", "二", "一"][d]
    return {"tier": TIERS[idx][0], "div": div, "pts": pts, "label": f"{TIERS[idx][0]}{div}", "idx": idx, "rating": int(r), "placed": placed}


def roll_periods(d):
    t = today()
    if d.get("daily", {}).get("day") != t:
        rng = random.Random("daily-" + t)
        others = rng.sample([x for x in DAILY_POOL if x[0] != "play3"], 2)
        d["daily"] = {"day": t, "ids": ["play3"] + [x[0] for x in others], "p": {}, "claimed": [], "cpu": 0, "firstwin": False, "counted": False}
    wk = week_id()
    if d.get("weekly", {}).get("week") != wk:
        d["weekly"] = {"week": wk, "p": {}, "claimed": []}


def bump(d, stat, v):
    for per in (d["daily"]["p"], d["weekly"]["p"]):
        per[stat] = max(per.get(stat, 0), v) if stat in MAX_STATS else per.get(stat, 0) + v


def load_prof(uid):
    """读取（没有就新建）一个玩家的成长数据。调用时要持有 db_lock"""
    row = db.execute("SELECT data, rating, placed FROM profiles WHERE user_id = ?", (uid,)).fetchone()
    if row:
        d, rating, placed = json.loads(row[0]), row[1], row[2]
    else:
        d, rating, placed = {"ink": START_INK, "owned": [STARTER], "frags": {}, "pity": 0, "welfare": 0, "tutorial": 0}, 1100.0, 0
        db.execute("INSERT INTO profiles (user_id, data, rating, placed) VALUES (?,?,?,?)", (uid, json.dumps(d), rating, placed))
    for k, v in (("skins", []), ("equip", {}), ("spity", 0)):
        d.setdefault(k, v)
    roll_periods(d)
    return d, rating, placed


def save_prof(uid, d, rating=None, placed=None):
    db.execute("UPDATE profiles SET data = ? WHERE user_id = ?", (json.dumps(d, ensure_ascii=False), uid))
    if rating is not None:
        db.execute("UPDATE profiles SET rating = ?, placed = ? WHERE user_id = ?", (rating, placed, uid))


def rates_json():
    fr = 1 - sum(FULL_RATE.values())
    return {"full": {r: FULL_RATE[r] for r in FULL_RATE}, "frag": {r: round(fr * w, 4) for r, w in FRAG_RARITY},
            "pool": POOL, "craft": CRAFT, "cost": DRAW_COST, "ten": TEN_COST, "pity": PITY, "dup": DUP_INK, "fragInk": FRAG_INK,
            "skin": {"rate": SKIN_RATE, "cost": SKIN_COST, "ten": SKIN_TEN, "pity": SKIN_PITY, "dup": SKIN_DUP}}


def prof_json(d, rating, placed):
    def task_list(defs, per):
        return [{"id": x[0], "name": x[1], "target": x[3], "prog": min(x[3], per["p"].get(x[2], 0)), "reward": x[4],
                 "claimed": x[0] in per["claimed"]} for x in defs]
    return {"ink": d["ink"], "owned": d["owned"], "frags": d["frags"], "pity": d["pity"], "welfare": d["welfare"],
            "skins": d["skins"], "equip": d["equip"], "spity": d["spity"],
            "tutorial": d.get("tutorial", 0), "qfx": d.get("qfx", 0), "rank": tier_of(rating, placed), "rotation": rotation(), "rates": rates_json(),
            "daily": task_list([x for x in DAILY_POOL if x[0] in d["daily"]["ids"]], d["daily"]), "weekly": task_list(WEEKLY, d["weekly"]),
            "cpuLeft": max(0, CPU_DAILY_CAP - d["daily"]["cpu"])}


def with_prof(token, fn):
    """登录用户读写成长数据的通用流程"""
    u = user_by_token(token)
    if not u:
        return 401, {"err": "请先登录后再操作"}
    with db_lock:
        d, rating, placed = load_prof(u[0])
        res = fn(d)
        if isinstance(res, tuple):
            db.commit()
            return res
        save_prof(u[0], d)
        db.commit()
        return 200, {**(res or {}), "profile": prof_json(d, rating, placed)}


def api_profile(token):
    if not user_by_token(token):
        return 200, {"guest": True, "owned": [STARTER], "rotation": rotation(), "rates": rates_json()}
    return with_prof(token, lambda d: {})


def api_welfare(body, token):
    c = str(body.get("char", ""))
    def fn(d):
        if d["welfare"]:
            return 400, {"err": "新手福利已经领过了，每人只有一次"}
        if c not in ALL_CHARS or c in d["owned"]:
            return 400, {"err": "请选一个你还没有的角色"}
        d["owned"].append(c); d["welfare"] = 1; d["frags"].pop(c, None)
        return {"got": c}
    return with_prof(token, fn)


def pick_weighted(rng, items):
    r, acc = rng.random(), 0.0
    for v, w in items:
        acc += w
        if r < acc:
            return v
    return items[-1][0]


def draw_one(d, rng):
    unowned = [c for c in ALL_CHARS if c not in d["owned"]]
    full = None
    if d["pity"] >= PITY and unowned:
        full = rng.choice(unowned)
    else:
        r, acc = rng.random(), 0.0
        for rar in ("legend", "rare", "common"):
            acc += FULL_RATE[rar]
            if r < acc:
                full = rng.choice(POOL[rar])
                break
    if full:
        forced = d["pity"] >= PITY
        d["pity"] = 0
        if full in d["owned"]:
            d["ink"] += DUP_INK
            return {"type": "char", "char": full, "rarity": RARITY[full], "dup": True, "ink": DUP_INK}
        d["owned"].append(full)
        left = d["frags"].pop(full, 0)
        d["ink"] += left * FRAG_INK
        return {"type": "char", "char": full, "rarity": RARITY[full], "new": True, "pity": forced, "ink": left * FRAG_INK}
    d["pity"] += 1
    rar = pick_weighted(rng, FRAG_RARITY)
    c, n = rng.choice(POOL[rar]), pick_weighted(rng, FRAG_AMT)
    if c in d["owned"]:
        d["ink"] += n * FRAG_INK
        return {"type": "frag", "char": c, "rarity": rar, "n": n, "ink": n * FRAG_INK}
    d["frags"][c] = d["frags"].get(c, 0) + n
    return {"type": "frag", "char": c, "rarity": rar, "n": n, "have": d["frags"][c], "need": CRAFT[rar]}


def api_gacha(body, token):
    ten = body.get("n") == 10
    cost = TEN_COST if ten else DRAW_COST
    def fn(d):
        if d["ink"] < cost:
            return 400, {"err": f"囊中墨锭不够，需要 {cost}"}
        d["ink"] -= cost
        return {"results": [draw_one(d, sysrand) for _ in range(10 if ten else 1)]}
    return with_prof(token, fn)


def skin_one(d, rng):
    """皮肤只出你已经拥有的角色的"""
    mine = [k for k in SKINS if SKINS[k][0] in d["owned"] and k not in EXCLUSIVE_SKINS]
    unowned = [k for k in mine if k not in d["skins"]]
    pick = None
    if d["spity"] >= SKIN_PITY and unowned:
        leg = [k for k in unowned if SKINS[k][1] == "legend"]
        pick = rng.choice(leg) if leg and rng.random() < 0.2 else rng.choice([k for k in unowned if SKINS[k][1] == "rare"] or unowned)
    else:
        r = rng.random()
        rar = "legend" if r < SKIN_RATE["legend"] else "rare" if r < SKIN_RATE["legend"] + SKIN_RATE["rare"] else None
        pool = [k for k in mine if SKINS[k][1] == rar] if rar else []
        if pool:
            pick = rng.choice(pool)
    if pick:
        d["spity"] = 0
        if pick in d["skins"]:
            d["ink"] += SKIN_DUP
            return {"type": "skin", "skin": pick, "char": SKINS[pick][0], "rarity": SKINS[pick][1], "dup": True, "ink": SKIN_DUP}
        d["skins"].append(pick)
        return {"type": "skin", "skin": pick, "char": SKINS[pick][0], "rarity": SKINS[pick][1], "new": True}
    d["spity"] += 1
    need = [c for c in ALL_CHARS if c not in d["owned"]]
    if not need:
        d["ink"] += FRAG_INK
        return {"type": "ink", "ink": FRAG_INK}
    c, n = rng.choice(need), pick_weighted(rng, FRAG_AMT)
    d["frags"][c] = d["frags"].get(c, 0) + n
    return {"type": "frag", "char": c, "rarity": RARITY[c], "n": n, "have": d["frags"][c], "need": CRAFT[RARITY[c]]}


def api_skingacha(body, token):
    ten = body.get("n") == 10
    cost = SKIN_TEN if ten else SKIN_COST
    def fn(d):
        if d["ink"] < cost:
            return 400, {"err": f"囊中墨锭不够，需要 {cost}"}
        d["ink"] -= cost
        return {"results": [skin_one(d, sysrand) for _ in range(10 if ten else 1)]}
    return with_prof(token, fn)


def api_equip(body, token):
    c, k = str(body.get("char", "")), str(body.get("skin", ""))
    def fn(d):
        if c not in ALL_CHARS:
            return 400, {"err": "没有这个角色"}
        if k and (k not in d["skins"] or SKINS.get(k, ("",))[0] != c):
            return 400, {"err": "你还没有这款皮肤，不能装备"}
        if k:
            d["equip"][c] = k
        else:
            d["equip"].pop(c, None)
        return {}
    return with_prof(token, fn)


def api_craft(body, token):
    c = str(body.get("char", ""))
    def fn(d):
        if c not in RARITY or c in d["owned"]:
            return 400, {"err": "这个角色不能合成（已经拥有，或本就不能合）"}
        need = CRAFT[RARITY[c]]
        if d["frags"].get(c, 0) < need:
            return 400, {"err": f"碎片不够，合成需要 {need} 个"}
        d["frags"].pop(c); d["owned"].append(c)
        return {"got": c}
    return with_prof(token, fn)


def api_claim(body, token):
    tid = str(body.get("task", ""))
    def fn(d):
        dd = next((x for x in DAILY_POOL if x[0] == tid and tid in d["daily"]["ids"]), None)
        per, x = (d["daily"], dd) if dd else (d["weekly"], next((x for x in WEEKLY if x[0] == tid), None))
        if not x or x[0] in per["claimed"]:
            return 400, {"err": "这个任务现在不能领取"}
        if per["p"].get(x[2], 0) < x[3]:
            return 400, {"err": "任务还没完成，先去做了再来"}
        per["claimed"].append(x[0]); d["ink"] += x[4]
        if dd and not d["daily"]["counted"]:
            d["daily"]["counted"] = True
            d["weekly"]["p"]["dailydays"] = d["weekly"]["p"].get("dailydays", 0) + 1
        return {"gain": x[4]}
    return with_prof(token, fn)


def api_progress(body, token):
    """客户端在一局打完、或离开木人桩时上报：打电脑的胜负、最高连击、放了几次大招、木人桩伤害"""
    mode = str(body.get("mode", ""))
    def fn(d):
        gain = 0
        mc = int(body.get("maxcombo", 0) or 0)
        if 0 < mc < 200:
            bump(d, "maxcombo", mc)
        ults = int(body.get("ults", 0) or 0)
        if 0 < ults < 20:
            bump(d, "ults", ults)
        td = float(body.get("traindmg", 0) or 0)
        if mode == "train" and 0 < td < 20000:
            bump(d, "traindmg", td)
        if mode == "cpu":
            lv = str(body.get("level", "normal"))
            won = bool(body.get("won"))
            bump(d, "games", 1)
            if won:
                bump(d, "wins", 1)
                if lv == "hard":
                    bump(d, "hardwins", 1)
            if d["daily"]["cpu"] < CPU_DAILY_CAP and lv in CPU_REWARD:
                d["daily"]["cpu"] += 1
                gain += CPU_REWARD[lv][0 if won else 1]
            if won and not d["daily"]["firstwin"] and lv != "easy":
                d["daily"]["firstwin"] = True; gain += FIRST_WIN
            d["ink"] += gain
        return {"gain": gain}
    return with_prof(token, fn)


def api_tutorial(token):
    def fn(d):
        if d.get("tutorial"):
            return {"gain": 0}
        d["tutorial"] = 1; d["ink"] += TUTORIAL_INK
        return {"gain": TUTORIAL_INK}
    return with_prof(token, fn)


# 兑换码：每个账号每个码只能领一次。不区分大小写。想加新码就在这里加一行
REDEEM_CODES = {"ry666": {"ink": 1000}, "renying888": {"skin": "qf_gold"}}


def api_redeem(body, token):
    code = str(body.get("code", "")).strip().lower()[:32]
    def fn(d):
        r = REDEEM_CODES.get(code)
        if not r:
            return 400, {"err": "兑换码不对，请核对后再试"}
        used = d.setdefault("redeemed", [])
        if code in used:
            return 400, {"err": "这个兑换码你已经用过了，不能重复领"}
        k = r.get("skin")
        if k and k in d["skins"]:
            return 400, {"err": "你已经有这款皮肤了，无需再兑"}
        used.append(code)
        if r.get("ink"):
            d["ink"] += r["ink"]
        if k:
            d["skins"].append(k)
        return {"ink": r.get("ink", 0), "skin": k or ""}
    return with_prof(token, fn)


# 青锋行打通：守住第几波可以领的奖励（波数, 墨锭, 专属皮肤）。专属皮肤不进皮肤祈愿
QFX_REWARDS = [(3, 200, None), (6, 300, None), (10, 500, "qf_qfx")]
EXCLUSIVE_SKINS = {"qf_qfx"}


def api_qfx(body, token):
    try:
        n = max(0, min(99, int(body.get("wave", 0))))
    except (TypeError, ValueError):
        n = 0
    def fn(d):
        got, ink, skin = d.get("qfx", 0), 0, ""
        for w, g, k in QFX_REWARDS:
            if got < w <= n:
                ink += g
                if k and k not in d["skins"]:
                    d["skins"].append(k); skin = k
        d["qfx"] = max(got, n); d["ink"] += ink
        return {"ink": ink, "skin": skin}
    return with_prof(token, fn)


def api_ranklb(token):
    with db_lock:
        rows = db.execute("SELECT u.id, u.name, p.rating, p.placed FROM profiles p JOIN users u ON u.id = p.user_id "
                          "WHERE p.placed >= ? ORDER BY p.rating DESC LIMIT 100", (PLACEMENT,)).fetchall()
    me = user_by_token(token)
    return 200, {"list": [{"name": r[1], **tier_of(r[2], r[3]), "me": bool(me and me[0] == r[0])} for r in rows]}


def match_progress(win_user, lose_user, rk):
    """联机对战结束：发墨锭、推进任务、排位赛改等级分。调用时要持有 db_lock。返回 {用户id: 给这个人看的结算}"""
    out = {}
    users = [(u, u is win_user) for u in (win_user, lose_user) if u]
    loaded = {u[0]: load_prof(u[0]) for u, _ in users}
    if rk and win_user and lose_user:
        (dw, rw, pw), (dl, rl, pl) = loaded[win_user[0]], loaded[lose_user[0]]
        ew = 1 / (1 + 10 ** ((rl - rw) / 400))
        kw, kl = (64 if pw < PLACEMENT else 32), (64 if pl < PLACEMENT else 32)
        nw, nl = rw + kw * (1 - ew), max(600.0, rl - kl * (1 - ew))
        for uid, old, new, pl0 in ((win_user[0], rw, nw, pw), (lose_user[0], rl, nl, pl)):
            d = loaded[uid][0]
            before, after = tier_of(old, pl0), tier_of(new, pl0 + 1)
            out[uid] = {"rank": after, "delta": round(new - old), "before": before,
                        "promo": pl0 + 1 == PLACEMENT or (after["idx"] > before["idx"] and pl0 >= PLACEMENT)}
            loaded[uid] = (d, new, pl0 + 1)
    for u, won in users:
        d, rating, placed = loaded[u[0]]
        rew = RANK_REWARD if (rk and win_user and lose_user) else NET_REWARD
        gain = rew[0 if won else 1]
        for st in ("games", "netgames") + (("rankgames",) if rk and win_user and lose_user else ()):
            bump(d, st, 1)
        if won:
            bump(d, "wins", 1)
            if not d["daily"]["firstwin"]:
                d["daily"]["firstwin"] = True; gain += FIRST_WIN
        d["ink"] += gain
        save_prof(u[0], d, rating, placed)
        out.setdefault(u[0], {})["gain"] = gain
        out[u[0]]["profile"] = prof_json(d, rating, placed)
    return out


post_times = {}      # 用户 id -> 最近发言时间，用来防刷屏


def api_posts(query):
    try:
        after = int(query.get("after", "0") or 0)
    except ValueError:
        after = 0
    with db_lock:
        if after > 0:
            rows = db.execute("SELECT id, name, text, at FROM posts WHERE id > ? ORDER BY id LIMIT 100", (after,)).fetchall()
        else:
            rows = db.execute("SELECT id, name, text, at FROM posts ORDER BY id DESC LIMIT 80").fetchall()[::-1]
    return 200, {"list": [{"id": r[0], "name": r[1], "text": r[2], "at": r[3]} for r in rows]}


def api_post(body, token):
    u = user_by_token(token or str(body.get("token", ""))[:100])
    if not u:
        return 401, {"err": "登录后才能发言（游客只能旁观）"}
    text = re.sub(r"[\x00-\x1f\x7f]", " ", str(body.get("text", ""))).strip()[:200]
    if not text:
        return 400, {"err": "不能发空消息，写点什么吧"}
    with db_lock:
        muted = db.execute("SELECT muted FROM users WHERE id = ?", (u[0],)).fetchone()
    if muted and muted[0]:
        return 400, {"err": "你已被管理员禁言"}
    now = time.time()
    times = [t for t in post_times.get(u[0], []) if now - t < 60]
    if times and now - times[-1] < 2:
        return 429, {"err": "发得太快了，歇两秒再发"}
    if len(times) >= 15:
        return 429, {"err": "一分钟最多发 15 条，慢些说"}
    post_times[u[0]] = times + [now]
    with db_lock:
        cur = db.execute("INSERT INTO posts (user_id, name, text, at) VALUES (?,?,?,?)", (u[0], u[1], text, now))
        db.commit()
        pid = cur.lastrowid
        db.execute("DELETE FROM posts WHERE id <= ?", (pid - 2000,))   # 只保留最近 2000 条
        db.commit()
    return 200, {"post": {"id": pid, "name": u[1], "text": text, "at": now}}


def record_result(win_user, lose_user, forfeit=False, peers=(), rk=False):
    """记录一场对战。双方都登录算正式战绩；只有一方登录算他的切磋战绩；都没登录不记。rk=排位赛"""
    if not win_user and not lose_user:
        return
    if win_user and lose_user and win_user[0] == lose_user[0]:
        return
    ranked = bool(win_user and lose_user)
    with db_lock:
        if ranked:
            db.execute("UPDATE users SET wins = wins + 1 WHERE id = ?", (win_user[0],))
            db.execute("UPDATE users SET losses = losses + 1 WHERE id = ?", (lose_user[0],))
        else:
            if win_user:
                db.execute("UPDATE users SET cwins = cwins + 1 WHERE id = ?", (win_user[0],))
            if lose_user:
                db.execute("UPDATE users SET closses = closses + 1 WHERE id = ?", (lose_user[0],))
        db.execute("INSERT INTO matches (winner, loser, forfeit, at, ranked) VALUES (?,?,?,?,?)",
                   (win_user[0] if win_user else None, lose_user[0] if lose_user else None, int(forfeit), time.time(), int(ranked)))
        prog = match_progress(win_user, lose_user, rk)
        db.commit()
        ids = [u[0] for u in (win_user, lose_user) if u]
        rows = {r[0]: r for r in db.execute(f"SELECT {USER_COLS} FROM users WHERE id IN ({','.join('?' * len(ids))})", ids)}
    wn = win_user[1] if win_user else "游客"
    ln = lose_user[1] if lose_user else "游客"
    log(f"{'排位赛' if rk else '正式' if ranked else '切磋'}战绩：{wn} 胜 {ln}{'（对手离开）' if forfeit else ''}")
    for p in peers:
        if p and p.user and p.user[0] in rows:
            won = bool(win_user and p.user[0] == win_user[0])
            try_send(p, sys_msg("result", counted=True, ranked=ranked, won=won, forfeit=forfeit, me=user_json(rows[p.user[0]]),
                                prog=prog.get(p.user[0], {}), rk=bool(rk)))


# ======================= 房间 =======================
# 房间码 -> {"peers": [在线的 Peer], "slots": {角色: {"rt", "user", "away"}}, "v", "started", "active", "reports"}
rooms = {}
queue = []             # 快速匹配排队：[(peer, 版本)]
rqueue = []            # 排位赛排队：[{"p": peer, "v": 版本, "r": 等级分, "t": 开始排队的时间}]
rooms_lock = threading.Lock()


def new_code():
    for _ in range(1000):
        c = "".join(random.choice(CODE_CHARS) for _ in range(4))
        if c not in rooms:
            return c
    return None


def join_room(room, code, peer, role):
    peer.room, peer.role, peer.rt = code, role, secrets.token_urlsafe(12)
    room["slots"][role] = {"rt": peer.rt, "user": peer.user, "away": None}
    room["peers"].append(peer)


def make_room(version):
    return {"peers": [], "slots": {}, "v": version, "started": False, "active": False, "reports": {}}


def names_of(room):
    return {r: (s["user"][1] if s["user"] else "") for r, s in room["slots"].items()}


def tiers_of(room):
    out = {}
    with db_lock:
        for r, s in room["slots"].items():
            if s["user"]:
                _, rating, placed = load_prof(s["user"][0])
                out[r] = tier_of(rating, placed)["label"]
        db.commit()
    return out


def pair_ranked(now):
    """排位赛配对：等级分差距一开始限制在 150 以内，每多等 1 秒放宽 25。调用时要持有 rooms_lock，返回要发的消息"""
    rqueue[:] = [e for e in rqueue if now - e["p"].last < 12]
    after = []
    i = 0
    while i < len(rqueue):
        a = rqueue[i]
        best = None
        for b in rqueue[i + 1:]:
            if b["v"] != a["v"] or (a["p"].user and b["p"].user and a["p"].user[0] == b["p"].user[0]):
                continue
            win = 150 + 25 * (now - min(a["t"], b["t"]))
            if abs(a["r"] - b["r"]) <= win and (not best or abs(a["r"] - b["r"]) < abs(a["r"] - best["r"])):
                best = b
        if best and len(rooms) < MAX_ROOMS:
            rqueue.remove(a); rqueue.remove(best)
            code = new_code()
            room = rooms[code] = make_room(a["v"])
            room["ranked"] = True
            join_room(room, code, a["p"], "host")
            join_room(room, code, best["p"], "client")
            room["started"] = True
            tiers = tiers_of(room)
            for p in room["peers"]:
                after.append((p, sys_msg("room", code=code, role=p.role, rt=p.rt, matched=True, ranked=True)))
            for p in room["peers"]:
                after.append((p, sys_msg("ready", names=names_of(room), ranked=True, tiers=tiers)))
            log(f"排位赛配对成功，房间 {code}（{int(a['r'])} vs {int(best['r'])}）")
        else:
            i += 1
    return after


def queue_notify():
    for p, _ in list(queue):
        try_send(p, sys_msg("queue", n=len(queue)))


def finish_room(code, room, leaver_role, forfeit_ok=True):
    """房间结束：如果对战进行中，按报告或按离开判胜负。调用时要持有 rooms_lock，返回要在锁外执行的函数"""
    todo = []
    if room.get("active") and len(room["slots"]) == 2:
        room["active"] = False
        other_role = "client" if leaver_role == "host" else "host"
        reps = room.get("reports") or {}
        if reps:
            win_role, forfeit = next(iter(reps.values())), False
        elif forfeit_ok:
            win_role, forfeit = other_role, True
        else:
            win_role = None
        if win_role:
            lose_role = "client" if win_role == "host" else "host"
            wu, lu = room["slots"][win_role]["user"], room["slots"][lose_role]["user"]
            peers, rk = list(room["peers"]), bool(room.get("ranked"))
            todo.append(lambda: record_result(wu, lu, forfeit, peers, rk))
    return todo


def reaper():
    """每秒检查一次：掉线超过 60 秒还没回来的，判离开"""
    while True:
        time.sleep(1)
        todo, notify = [], []
        now = time.time()
        with rooms_lock:
            paired = pair_ranked(now) if len(rqueue) >= 2 else []
            for code, room in list(rooms.items()):
                for role, slot in room["slots"].items():
                    if slot["away"] and now > slot["away"]:
                        todo += finish_room(code, room, role)
                        notify += list(room["peers"])
                        del rooms[code]
                        log(f"房间 {code}：掉线的玩家没有回来")
                        break
        for f in todo:
            f()
        for p, m in paired:
            try_send(p, m)
        for p in notify:
            try_send(p, sys_msg("left"))
            p.close()


def ws_session(conn, headers, query):
    key = headers.get("sec-websocket-key", "")
    accept = base64.b64encode(hashlib.sha1((key + WS_GUID).encode()).digest()).decode()
    conn.sendall(("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                  f"Sec-WebSocket-Accept: {accept}\r\n\r\n").encode())
    conn.settimeout(IDLE_TIMEOUT)
    peer = Peer(conn)
    version = query.get("v", "")[:20]
    u = user_by_token(query.get("t", "")[:100])
    peer.user = (u[0], u[1]) if u else None

    after = []   # 加锁时决定、解锁后才发送的消息
    with rooms_lock:
        if query.get("resume"):
            # ---------- 断线重连 ----------
            code = re.sub(r"[^A-Z0-9]", "", query.get("resume", "").upper())[:4]
            room = rooms.get(code)
            role = next((r for r, s in (room or {}).get("slots", {}).items() if s["rt"] == query.get("rt")), None)
            if not room or not role:
                peer.send(sys_msg("noresume"))
                return
            if room["v"] != version:
                peer.send(sys_msg("version", need=room["v"]))
                return
            old = next((p for p in room["peers"] if p.role == role), None)
            if old:                               # 旧连接还挂着（比如网络闪断），换成新的
                room["peers"].remove(old)
                old.room = None
                old.close()
            slot = room["slots"][role]
            peer.room, peer.role, peer.rt, peer.user = code, role, slot["rt"], slot["user"]
            slot["away"] = None
            room["peers"].append(peer)
            others = [p for p in room["peers"] if p is not peer]
            after.append((peer, sys_msg("room", code=code, role=role, rt=peer.rt, resumed=True)))
            after.append((peer, sys_msg("ready", names=names_of(room), resumed=True)))
            after += [(p, sys_msg("back")) for p in others]
            log(f"房间 {code}：玩家重连成功")
        elif query.get("rank"):
            # ---------- 排位赛 ----------
            if not peer.user:
                peer.send(sys_msg("needlogin"))
                return
            with db_lock:
                _, rating, _ = load_prof(peer.user[0])
                db.commit()
            rqueue[:] = [e for e in rqueue if not (e["p"].user and e["p"].user[0] == peer.user[0])]
            rqueue.append({"p": peer, "v": version, "r": rating, "t": time.time()})
            log(f"有人开始排位（排队 {len(rqueue)} 人）")
            after += pair_ranked(time.time())
            if any(e["p"] is peer for e in rqueue):
                after.append((peer, sys_msg("queue", n=len(rqueue), ranked=True)))
        elif query.get("match"):
            # ---------- 快速匹配 ----------
            now = time.time()
            queue[:] = [(p, v) for p, v in queue if now - p.last < 12]
            other = next(((p, v) for p, v in queue if v == version), None)
            if other and len(rooms) < MAX_ROOMS:
                queue.remove(other)
                code = new_code()
                room = rooms[code] = make_room(version)
                join_room(room, code, other[0], "host")
                join_room(room, code, peer, "client")
                room["started"] = True
                for p in room["peers"]:
                    after.append((p, sys_msg("room", code=code, role=p.role, rt=p.rt, matched=True)))
                for p in room["peers"]:
                    after.append((p, sys_msg("ready", names=names_of(room))))
                log(f"快速匹配成功，房间 {code}")
            else:
                queue.append((peer, version))
                log(f"有人开始匹配（排队 {len(queue)} 人）")
                after.append((None, "queue"))
        elif query.get("create"):
            # ---------- 建房 ----------
            if len(rooms) >= MAX_ROOMS:
                peer.send(sys_msg("busy"))
                return
            code = new_code()
            room = rooms[code] = make_room(version)
            join_room(room, code, peer, "host")
            after.append((peer, sys_msg("room", code=code, role="host", rt=peer.rt)))
            log(f"房间 {code}：建房（当前 {len(rooms)} 个房间）")
        else:
            # ---------- 用房间码加入 ----------
            code = re.sub(r"[^A-Z0-9]", "", query.get("join", "").upper())[:4]
            room = rooms.get(code)
            if not room:
                peer.send(sys_msg("nf"))
                return
            if len(room["slots"]) >= 2:
                peer.send(sys_msg("full"))
                return
            if room["v"] != version:
                peer.send(sys_msg("version", need=room["v"]))
                return
            join_room(room, code, peer, "client")
            room["started"] = True
            after.append((peer, sys_msg("room", code=code, role="client", rt=peer.rt)))
            for p in room["peers"]:
                after.append((p, sys_msg("ready", names=names_of(room))))
            log(f"房间 {code}：有人加入")

    for p, m in after:
        if p is None:
            with rooms_lock:
                queue_notify()
        else:
            try_send(p, m)

    try:
        parts = b""
        while True:
            op, data, fin = read_frame(conn)
            peer.last = time.time()
            if op == 8:
                break
            if op == 9:
                peer.send(data, op=10)
                continue
            if op not in (0, 1):
                continue
            parts += data
            if len(parts) > MAX_FRAME:
                break
            if not fin:
                continue
            msg, parts = parts.decode("utf-8", "replace"), b""
            if msg.startswith('{"sp":'):          # 测速：服务器直接回复，量的是你到服务器的延迟
                peer.send('{"spo":' + msg[6:])
                continue
            if msg.startswith('{"bye"'):
                peer.bye = True
                break
            if msg.startswith('{"mstart"') or msg.startswith('{"report"'):
                handle_match_msg(peer, msg)
                continue
            if msg.startswith('{"chat"'):         # 聊天限速：10 秒最多 12 条
                now = time.time()
                peer.chat_times = [t for t in peer.chat_times if now - t < 10] + [now]
                if len(peer.chat_times) > 12 or len(msg) > 600:
                    continue
            with rooms_lock:
                room = rooms.get(peer.room) if peer.room else None
                others = [p for p in room["peers"] if p is not peer] if room and peer in room["peers"] else []
            for p in others:
                try_send(p, msg)
    except (ConnectionError, OSError, socket.timeout):
        pass
    finally:
        todo, notify_left, notify_away = [], [], []
        with rooms_lock:
            was_queued = any(p is peer for p, _ in queue)
            queue[:] = [(p, v) for p, v in queue if p is not peer]
            rqueue[:] = [e for e in rqueue if e["p"] is not peer]
            room = rooms.get(peer.room) if peer.room else None
            if room and peer in room["peers"]:
                room["peers"].remove(peer)
                others = list(room["peers"])
                if others and room["started"] and not peer.bye:
                    # 对战或选人时掉线：保留位置，等他回来
                    room["slots"][peer.role]["away"] = time.time() + RESUME_WAIT
                    notify_away = others
                    log(f"房间 {peer.room}：有人掉线，等待重连 {RESUME_WAIT} 秒")
                else:
                    # 两个人都不在了就不判胜负；主动离开的判对方赢
                    todo += finish_room(peer.room, room, peer.role, forfeit_ok=bool(others))
                    if others:
                        notify_left = others
                    del rooms[peer.room]
                    log(f"房间 {peer.room}：有人离开")
            if was_queued:
                log(f"有人取消匹配（排队 {len(queue)} 人）")
                queue_notify()
        for f in todo:
            f()
        for p in notify_away:
            try_send(p, sys_msg("away", t=RESUME_WAIT))
        for p in notify_left:
            try_send(p, sys_msg("left"))


def handle_match_msg(peer, msg):
    """mstart：一场对战开始；report：一场对战结束，谁赢了。双方报告一致才算数"""
    try:
        data = json.loads(msg)
    except ValueError:
        return
    record = None
    with rooms_lock:
        room = rooms.get(peer.room) if peer.room else None
        if not room or len(room["slots"]) < 2:
            return
        if "mstart" in data:
            room["active"] = True
            room["reports"] = {}
        elif "report" in data and room.get("active"):
            if data["report"] not in ("host", "client"):
                return
            room["reports"][peer.role] = data["report"]
            reps = room["reports"]
            if len(reps) == 2:
                room["active"] = False
                if reps["host"] == reps["client"]:
                    win = reps["host"]
                    lose = "client" if win == "host" else "host"
                    record = (room["slots"][win]["user"], room["slots"][lose]["user"], list(room["peers"]), bool(room.get("ranked")))
    if record:
        record_result(record[0], record[1], False, record[2], record[3])


# ======================= HTTP =======================
def http_reply(conn, status, ctype, body, cache="no-store"):
    conn.sendall(
        (f"HTTP/1.1 {status}\r\n"
         f"Content-Type: {ctype}\r\n"
         f"Content-Length: {len(body)}\r\n"
         f"Access-Control-Allow-Origin: *\r\n"
         f"Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
         f"Access-Control-Allow-Headers: Authorization, Content-Type\r\n"
         f"Cache-Control: {cache}\r\n"
         f"X-Content-Type-Options: nosniff\r\n"
         f"Connection: close\r\n\r\n").encode() + body
    )


def handle(conn, addr):
    try:
        conn.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        conn.settimeout(15)
        req = b""
        while b"\r\n\r\n" not in req:
            chunk = conn.recv(4096)
            if not chunk or len(req) > 32768:
                return
            req += chunk
        head, _, rest = req.partition(b"\r\n\r\n")
        lines = head.decode("latin-1").split("\r\n")
        parts = lines[0].split(" ")
        method = parts[0]
        target = parts[1] if len(parts) > 1 else "/"
        path, _, qs = target.partition("?")
        query = {}
        for kv in qs.split("&"):
            if "=" in kv:
                k, v = kv.split("=", 1)
                query[k] = unquote(v)
        headers = {}
        for line in lines[1:]:
            if ":" in line:
                k, v = line.split(":", 1)
                headers[k.strip().lower()] = v.strip()

        if method == "OPTIONS":
            http_reply(conn, "204 No Content", "text/plain", b"")
            return

        if path.startswith("/api/"):
            body = {}
            if method == "POST":
                n = min(int(headers.get("content-length", "0") or 0), 4096)
                while len(rest) < n:
                    chunk = conn.recv(n - len(rest))
                    if not chunk:
                        break
                    rest += chunk
                try:
                    body = json.loads(rest[:n].decode("utf-8") or "{}")
                except ValueError:
                    body = {}
                if not isinstance(body, dict):
                    body = {}
            token = headers.get("authorization", "").replace("Bearer ", "").strip()[:100]
            routes = {"/api/register": lambda: api_register(body), "/api/login": lambda: api_login(body),
                      "/api/logout": lambda: api_logout(body), "/api/me": lambda: api_me(token),
                      "/api/leaderboard": lambda: api_leaderboard(token), "/api/posts": lambda: api_posts(query),
                      "/api/post": lambda: api_post(body, token), "/api/profile": lambda: api_profile(token),
                      "/api/welfare": lambda: api_welfare(body, token), "/api/gacha": lambda: api_gacha(body, token),
                      "/api/craft": lambda: api_craft(body, token), "/api/claim": lambda: api_claim(body, token),
                      "/api/progress": lambda: api_progress(body, token), "/api/tutorial": lambda: api_tutorial(token),
                      "/api/ranklb": lambda: api_ranklb(token), "/api/skingacha": lambda: api_skingacha(body, token),
                      "/api/equip": lambda: api_equip(body, token), "/api/redeem": lambda: api_redeem(body, token), "/api/qfx": lambda: api_qfx(body, token)}
            posts = ("/api/register", "/api/login", "/api/logout", "/api/post", "/api/welfare", "/api/gacha", "/api/craft",
                     "/api/claim", "/api/progress", "/api/tutorial", "/api/skingacha", "/api/equip", "/api/redeem", "/api/qfx")
            if path in routes and (method == "POST") == (path in posts):
                code, obj = routes[path]()
            else:
                code, obj = 404, {"err": "not found"}
            status = {200: "200 OK", 400: "400 Bad Request", 401: "401 Unauthorized", 404: "404 Not Found",
                      409: "409 Conflict", 429: "429 Too Many Requests"}[code]
            http_reply(conn, status, "application/json; charset=utf-8", json.dumps(obj, ensure_ascii=False).encode("utf-8"))
        elif path == "/ws" and headers.get("upgrade", "").lower() == "websocket":
            ws_session(conn, headers, query)
        elif path in ("/", "/index.html", "/renying.html"):
            try:
                with open(GAME, "rb") as f:
                    http_reply(conn, "200 OK", "text/html; charset=utf-8", f.read())
            except FileNotFoundError:
                http_reply(conn, "404 Not Found", "text/plain; charset=utf-8", "找不到 index.html：请在项目目录先运行 python3 tools/build.py 生成页面".encode())
        elif re.fullmatch(r"/(assets/)?music/[a-z]+\.mp3|/assets/[a-z0-9-]+(\.min)?\.(js|png)", path):
            # 静态资源：只提供 assets 里“小写字母、数字、横线”命名的 js / png / mp3（旧网址 /music/x.mp3 也能用），浏览器缓存一天
            rel = path[len("/assets/"):] if path.startswith("/assets/") else path[1:]
            files = [os.path.join(ASSETS, *rel.split("/"))]
            if rel.startswith("music/"):
                files.append(os.path.join(HERE, *rel.split("/")))   # 以前的版本把音乐放在 server.py 旁边的 music 文件夹
            for fp in files:
                if os.path.isfile(fp):
                    with open(fp, "rb") as f:
                        http_reply(conn, "200 OK", ASSET_TYPES[os.path.splitext(rel)[1]], f.read(), "public, max-age=86400")
                    break
            else:
                http_reply(conn, "404 Not Found", "text/plain; charset=utf-8", b"not found")
        elif path == "/health":
            with rooms_lock:
                playing = sum(1 for r in rooms.values() if len(r["slots"]) == 2)
                online = playing * 2 + len(queue)
                body = json.dumps({"ok": True, "online": online, "rooms": len(rooms), "playing": playing, "waiting": len(queue),
                                   "lan": f"http://{lan_ip()}:{PORT}"}).encode()
            http_reply(conn, "200 OK", "application/json", body)
        else:
            http_reply(conn, "404 Not Found", "text/plain", b"not found")
    except (OSError, socket.timeout, ValueError):
        pass
    finally:
        try:
            conn.close()
        except OSError:
            pass


# ======================= 把隧道网址写到桌面 =======================
def watch_tunnel_url():
    last = None
    while True:
        try:
            with open(TUNNEL_LOG, "r", encoding="utf-8", errors="ignore") as f:
                urls = re.findall(r"https://[a-z0-9-]+\.trycloudflare\.com", f.read())
            if urls and urls[-1] != last:
                last = urls[-1]
                with open(URL_FILE, "w", encoding="utf-8") as f:
                    f.write(f"刃影 · 当前游戏网址（发给同学）：\n{last}\n\n"
                            f"连同一个 Wi-Fi 的同学，走局域网这条路更流畅：\nhttp://{lan_ip()}:{PORT}\n\n"
                            "电脑重启后网址会变，一切以本文件为准。\n")
                log(f"当前游戏网址已更新：{last}")
        except OSError:
            pass
        time.sleep(5)


def main():
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        srv.bind(("127.0.0.1" if os.environ.get("RENYING_LOCAL_ONLY") else "0.0.0.0", PORT))
    except OSError:
        print(f"端口 {PORT} 已被占用：服务器可能已经在运行了。")
        sys.exit(1)
    srv.listen(64)
    threading.Thread(target=watch_tunnel_url, daemon=True).start()
    threading.Thread(target=reaper, daemon=True).start()
    lip = lan_ip()
    log(f"刃影联机服务器已启动 (端口 {PORT})")
    log(f"  ➜ 本机访问:       http://localhost:{PORT}")
    log(f"  ➜ 同局域网/Wi-Fi: http://{lip}:{PORT}")
    log(f"（提示：同一 Wi-Fi 或热点下的同学打开上面任意一条网址，即可直接联机，无需外网！）")
    try:
        while True:
            conn, addr = srv.accept()
            threading.Thread(target=handle, args=(conn, addr), daemon=True).start()
    except KeyboardInterrupt:
        log("服务器已关闭")
    finally:
        srv.close()


if __name__ == "__main__":
    main()
