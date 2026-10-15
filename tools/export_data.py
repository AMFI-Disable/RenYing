#!/usr/bin/env python3
"""
刃影 数据导出工具：将玩家用户、成长数据、对局记录和社区消息导出成 JSON 文件（不含密码和登录凭证）。
用法：
  python3 tools/export_data.py [输出路径，默认 renying-export.json] [--db 数据库路径，默认 data/renying.db]
"""
import argparse
import json
import os
import sqlite3
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DB = "/opt/renying/data/renying.db" if os.path.exists("/opt/renying/data/renying.db") else os.path.join(ROOT, "data", "renying.db")
DEFAULT_OUT = os.path.join(ROOT, "renying-export.json")


def export_data(db_path, out_path):
    if not os.path.exists(db_path):
        print(f"❌ 数据库不存在：{db_path}")
        return False

    src = sqlite3.connect(f"file:{os.path.abspath(db_path)}?mode=ro", uri=True)
    db = sqlite3.connect(":memory:")
    src.backup(db)
    src.close()
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

    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    print(f"✓ 导出完成：{out_path}")
    print(f"  玩家 {len(users)} 个，成长数据 {len(profiles)} 条，对局 {len(out['matches'])} 场，社区消息 {len(out['posts'])} 条")
    return True


def main():
    parser = argparse.ArgumentParser(description="刃影 数据库导出工具")
    parser.add_argument("out", nargs="?", default=DEFAULT_OUT, help="输出 JSON 文件路径")
    parser.add_argument("--db", default=DEFAULT_DB, help="源 SQLite 数据库路径")
    args = parser.parse_args()

    success = export_data(args.db, args.out)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
