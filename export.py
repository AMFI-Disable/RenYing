#!/usr/bin/env python3
"""刃影 数据导出：把玩家、成长数据、对局记录和社区消息导出成一个 JSON 文件（不含密码和登录凭证）
用法：sudo python3 export.py   → 生成 ~/renying-export.json
"""
import json, os, sqlite3, time
SRC = "/opt/renying/data/renying.db"
OUT = os.path.expanduser("~ubuntu/renying-export.json") if os.path.isdir(os.path.expanduser("~ubuntu")) else "renying-export.json"
# 先做一份一致的快照，避免服务器正在写的时候读到一半
src = sqlite3.connect(f"file:{SRC}?mode=ro", uri=True)
db = sqlite3.connect(":memory:")
src.backup(db); src.close()
db.row_factory = sqlite3.Row
def rows(sql):
    try:
        return [dict(r) for r in db.execute(sql)]
    except sqlite3.OperationalError:
        return []
users = rows("SELECT id, name, wins, losses, cwins, closses, muted, created FROM users ORDER BY id")
profiles = rows("SELECT user_id, data, rating, placed FROM profiles ORDER BY user_id")
for p in profiles:
    try:
        p["data"] = json.loads(p["data"])
    except (TypeError, ValueError):
        pass
out = {
    "exported_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    "users": users,
    "profiles": profiles,
    "matches": rows("SELECT * FROM matches ORDER BY id"),
    "posts": rows("SELECT id, user_id, name, text, at FROM posts ORDER BY id"),
}
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
try:
    os.chown(OUT, 1000, 1000)
except OSError:
    pass
print(f"✓ 导出完成：{OUT}")
print(f"  玩家 {len(users)} 个，成长数据 {len(profiles)} 条，对局 {len(out['matches'])} 场，社区消息 {len(out['posts'])} 条")
