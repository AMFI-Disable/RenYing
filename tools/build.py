#!/usr/bin/env python3
"""
刃影 打包脚本（只用 Python 自带的库）

源文件在 src/ 和 assets/，改完运行一次，生成仓库根目录下的网页：

  index.html            联网版：GitHub Pages 和 server.py 都用它。支持免服务器直连和联机服务器，
                        音乐从 assets/music 下载，PeerJS 用到时才从 assets/peerjs.min.js 加载。
  renying-offline.html  离线版：一个文件就能玩（音乐、青锋行都打包在里面），双击打开，不能联机。
  renying.html          旧网址，自动跳到 index.html。

用法：
  python3 tools/build.py          生成网页
  python3 tools/build.py --check  只检查网页是不是最新的（CI 用），不是最新就返回 1
"""
import base64
import json
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "src")
ASSETS = os.path.join(ROOT, "assets")

REDIRECT = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>刃影</title>
<link rel="canonical" href="./">
<script>location.replace('./' + location.search + location.hash);</script>
<meta http-equiv="refresh" content="0; url=./">
</head>
<body style="background:#0a0b1c;color:#efe8d8;font-family:serif;text-align:center;padding-top:30vh">
<p>刃影已经搬到 <a href="./" style="color:#46d3ea">新地址</a>，正在跳转…</p>
</body>
</html>
"""


def read(*parts, mode="r"):
    path = os.path.join(*parts)
    if mode == "rb":
        with open(path, "rb") as f:
            return f.read()
    with open(path, "r", encoding="utf-8", newline="") as f:
        return f.read()


def music_data():
    folder = os.path.join(ASSETS, "music")
    data = {}
    for name in sorted(os.listdir(folder)):
        if name.endswith(".mp3"):
            data[name[:-4]] = "data:audio/mpeg;base64," + base64.b64encode(read(folder, name, mode="rb")).decode()
    return data


def hero_models_data():
    folder = os.path.join(ROOT, "models", "heroes")
    data = {}
    if os.path.exists(folder):
        for name in sorted(os.listdir(folder)):
            if name.endswith(".json"):
                try:
                    data[name[:-5]] = json.loads(read(folder, name))
                except Exception:
                    pass
    return data


def page(offline):
    html = read(SRC, "page.html")
    build = {"offline": offline}
    parts = {
        "<!--@style-->\n": "<style>\n" + read(SRC, "style.css") + "</style>\n",
        "<!--@music-->\n": ("<script>window.MUSIC_DATA = " + json.dumps(music_data()) + ";</script>\n") if offline else "",
        "<!--@scripts-->\n": (
            "<script>window.RENYING_BUILD = " + json.dumps(build) + "; window.RENYING_HERO_MODELS = " + json.dumps(hero_models_data()) + ";</script>\n"
            + ("" if offline else (
                "<script>\n" + read(ASSETS, "firebase-app-compat.js") + "\n</script>\n"
                "<script>\n" + read(ASSETS, "firebase-auth-compat.js") + "\n</script>\n"
                "<script>\n" + read(ASSETS, "firebase-firestore-compat.js") + "\n</script>\n"
            ))
            + "<script>\n" + read(ASSETS, "peerjs.min.js") + "\n</script>\n"
            + "<script>\n" + read(SRC, "cloud.js") + "</script>\n"
            + "<script>\n" + read(SRC, "game.js") + "</script>\n"
            + "<script>\n" + read(SRC, "net-p2p.js") + "</script>\n"
        ),
        "<!--@qfx-->\n": '<script id="qfxData" type="application/octet-stream">'
                         + base64.b64encode(read(ASSETS, "qingfengxing.html", mode="rb")).decode() + "</script>\n",
    }
    for marker, text in parts.items():
        if html.count(marker) != 1:
            raise SystemExit(f"src/page.html 里应该正好有一个 {marker.strip()}")
        html = html.replace(marker, text)
    return html


def outputs():
    return {
        "index.html": page(offline=False),
        "renying-offline.html": page(offline=True),
        "renying.html": REDIRECT,
    }


def check_js():
    """有 node 的话检查一下 JS 语法（没有就跳过）"""
    node = shutil.which("node")
    if not node:
        return True
    ok = True
    for name in ("cloud.js", "game.js", "net-p2p.js"):
        r = subprocess.run([node, "--check", os.path.join(SRC, name)], capture_output=True, text=True)
        if r.returncode:
            print(f"src/{name} 语法错误：\n{r.stderr}")
            ok = False
    return ok


def main():
    check = "--check" in sys.argv[1:]
    if not check_js():
        return 1
    stale = []
    for name, text in outputs().items():
        path = os.path.join(ROOT, name)
        try:
            same = read(path) == text
        except FileNotFoundError:
            same = False
        if same:
            continue
        stale.append(name)
        if not check:
            fd, tmp = tempfile.mkstemp(dir=ROOT, suffix=".tmp")
            with os.fdopen(fd, "w", encoding="utf-8", newline="") as f:
                f.write(text)
            os.chmod(tmp, 0o644)
            os.replace(tmp, path)
            print(f"已生成 {name}（{len(text.encode()) / 1024 / 1024:.1f} MB）")
    if check:
        if stale:
            print("这些网页不是最新的，运行 python3 tools/build.py 后再提交：" + "、".join(stale))
            return 1
        print("网页都是最新的。")
    elif not stale:
        print("网页都是最新的，不用改。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
