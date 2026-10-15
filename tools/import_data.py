#!/usr/bin/env python3
"""
刃影 数据导入脚本：将老站导出的 JSON 文件（users, profiles, matches, posts）
导入到当前站点的 SQLite 数据库 data/renying.db 中。

用法：
  python3 tools/import_data.py [导出文件路径，默认 renying-export.json] [--db 数据库路径，默认 data/renying.db]
"""
import argparse
import json
import os
import sqlite3
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_SRC = os.path.join(ROOT, "renying-export.json")
DEFAULT_DB = os.path.join(ROOT, "data", "renying.db")


def ensure_tables(db):
    db.executescript("""
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT UNIQUE COLLATE NOCASE, pw BLOB, salt BLOB,
        wins INTEGER DEFAULT 0, losses INTEGER DEFAULT 0, created REAL, cwins INTEGER DEFAULT 0, closses INTEGER DEFAULT 0, muted INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER, created REAL);
    CREATE TABLE IF NOT EXISTS matches (id INTEGER PRIMARY KEY, winner INTEGER, loser INTEGER, forfeit INTEGER, at REAL, ranked INTEGER DEFAULT 1);
    CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY, user_id INTEGER, name TEXT, text TEXT, at REAL);
    CREATE TABLE IF NOT EXISTS profiles (user_id INTEGER PRIMARY KEY, data TEXT, rating REAL DEFAULT 1100, placed INTEGER DEFAULT 0);
    """)
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


def import_data(json_path, db_path):
    if not os.path.exists(json_path):
        print(f"❌ 找不到导出文件：{json_path}")
        return False

    os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
    with open(json_path, "r", encoding="utf-8") as f:
        export_data = json.load(f)

    db = sqlite3.connect(db_path)
    ensure_tables(db)

    users = export_data.get("users", [])
    profiles = export_data.get("profiles", [])
    matches = export_data.get("matches", [])
    posts = export_data.get("posts", [])

    print(f"📦 正在从 {os.path.basename(json_path)} 导入到 {db_path}...")

    # 1. 导入 Users
    user_count = 0
    for u in users:
        uid = u["id"]
        name = u["name"]
        wins = u.get("wins", 0)
        losses = u.get("losses", 0)
        cwins = u.get("cwins", 0)
        closses = u.get("closses", 0)
        muted = u.get("muted", 0)
        created = u.get("created", time.time())

        row = db.execute("SELECT id, pw, salt FROM users WHERE id = ? OR name = ?", (uid, name)).fetchone()
        if row:
            db.execute("""UPDATE users SET name = ?, pw = NULL, salt = NULL, wins = ?, losses = ?, cwins = ?, closses = ?, muted = ?, created = ?
                          WHERE id = ?""",
                       (name, wins, losses, cwins, closses, muted, created, row[0]))
        else:
            db.execute("""INSERT INTO users (id, name, pw, salt, wins, losses, created, cwins, closses, muted)
                          VALUES (?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?)""",
                       (uid, name, wins, losses, created, cwins, closses, muted))
        user_count += 1

    # 2. 导入 Profiles
    profile_count = 0
    for p in profiles:
        uid = p["user_id"]
        pdata = p.get("data", {})
        if not isinstance(pdata, str):
            pdata = json.dumps(pdata, ensure_ascii=False)
        rating = p.get("rating", 1100.0)
        placed = p.get("placed", 0)

        db.execute("""INSERT INTO profiles (user_id, data, rating, placed)
                      VALUES (?, ?, ?, ?)
                      ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, rating = excluded.rating, placed = excluded.placed""",
                   (uid, pdata, rating, placed))
        profile_count += 1

    # 3. 导入 Matches
    match_count = 0
    for m in matches:
        mid = m["id"]
        winner = m.get("winner")
        loser = m.get("loser")
        forfeit = m.get("forfeit", 0)
        at = m.get("at", time.time())
        ranked = m.get("ranked", 1)

        db.execute("""INSERT OR REPLACE INTO matches (id, winner, loser, forfeit, at, ranked)
                      VALUES (?, ?, ?, ?, ?, ?)""",
                   (mid, winner, loser, forfeit, at, ranked))
        match_count += 1

    # 4. 导入 Posts
    post_count = 0
    for post in posts:
        pid = post["id"]
        user_id = post.get("user_id")
        name = post.get("name", "")
        text = post.get("text", "")
        at = post.get("at", time.time())

        db.execute("""INSERT OR REPLACE INTO posts (id, user_id, name, text, at)
                      VALUES (?, ?, ?, ?, ?)""",
                   (pid, user_id, name, text, at))
        post_count += 1

    db.commit()
    db.close()

    print(f"✓ 成功导入：")
    print(f"  - 玩家用户：{user_count} 位")
    print(f"  - 成长档案：{profile_count} 条")
    print(f"  - 历史对局：{match_count} 场")
    print(f"  - 社区消息：{post_count} 条")
    return True


def main():
    parser = argparse.ArgumentParser(description="刃影 历史数据导入工具")
    parser.add_argument("src", nargs="?", default=DEFAULT_SRC, help="导出的 JSON 文件路径")
    parser.add_argument("--db", default=DEFAULT_DB, help="目标 SQLite 数据库路径")
    args = parser.parse_args()

    success = import_data(args.src, args.db)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
