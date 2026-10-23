#!/usr/bin/env python3
"""
刃影 打包脚本（只用 Python 自带的库）

源文件在 src/ 和 assets/，改完运行一次，生成仓库根目录下的网页：

  index.html            联网版：GitHub Pages 和 server.py 都用它。支持免服务器直连和联机服务器，
                        音乐从 assets/music 下载，青锋行按需从 assets/qingfengxing.html 加载。
  assets/qingfengxing.html  青锋行（三维小游戏）：由 src/qfx/ 里的 page.html 和按编号排好的各个 .js 拼成。
  renying-offline.html  离线版：一个文件就能玩（音乐、青锋行都打包在里面），双击打开，不能联机。
  renying.html          旧网址，自动跳到 index.html。
  cloudflare/worker.bundle.js  云端账号的 Cloudflare Worker：worker.js 加上武库规则（src/armory-core.js）拼成一个文件，
                        wrangler deploy 用它，在 Cloudflare 网页编辑器里整段粘贴也能用。

用法：
  python3 tools/build.py          生成网页
  python3 tools/build.py --check  只检查网页是不是最新的（CI 用），不是最新就返回 1
"""
import base64
import json
import os
import re
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


def compact_css(css):
    css = re.sub(r"/\*[\s\S]*?\*/", "", css)
    lines = [ln.strip() for ln in css.splitlines() if ln.strip()]
    return "\n".join(lines)


def compact_js(js):
    out = []
    in_block = False
    for ln in js.splitlines():
        s = ln.strip()
        if not s:
            continue
        if in_block:
            if "*/" in s:
                in_block = False
                rest = s.split("*/", 1)[1].strip()
                if rest:
                    out.append(rest)
            continue
        if s.startswith("/*"):
            if "*/" not in s:
                in_block = True
            else:
                rest = s.split("*/", 1)[1].strip()
                if rest:
                    out.append(rest)
            continue
        if s.startswith("//"):
            continue
        out.append(s)
    return "\n".join(out)


def music_data():
    folder = os.path.join(ASSETS, "music")
    data = {}
    for name in sorted(os.listdir(folder)):
        if name.endswith(".mp3"):
            data[name[:-4]] = "data:audio/mpeg;base64," + base64.b64encode(read(folder, name, mode="rb")).decode()
    return data


def ai_brain_data():
    """电脑 AI 的打击数据和训练出来的打法基因（tools/ai-framedata.mjs、tools/ai-train.mjs 生成）"""
    path = os.path.join(ROOT, "models", "ai-brain.json")
    if os.path.exists(path):
        return json.loads(read(path))
    return {}


QFX = os.path.join(SRC, "qfx")


def qfx_modules():
    return sorted(n for n in os.listdir(QFX) if re.match(r"^\d\d-[a-z0-9-]+\.js$", n))


def qfx_page():
    """青锋行：三维引擎原样放进来，游戏代码按文件名顺序拼进同一个闭包"""
    html = read(QFX, "page.html")
    game = "(function(){\n'use strict';\n" + "".join(f"/* === {n} === */\n" + read(QFX, n) for n in qfx_modules()) + "\n})();"
    for marker, text in (("<!--@three-->", "<script>\n" + read(ASSETS, "three.min.js") + "\n</script>"), ("<!--@game-->", "<script>\n" + game + "\n</script>")):
        if html.count(marker) != 1:
            raise SystemExit(f"src/qfx/page.html 里应该正好有一个 {marker}")
        html = html.replace(marker, text)
    return html


def page(offline):
    html = read(SRC, "page.html")
    build = {"offline": offline}
    qfx_b64 = base64.b64encode(qfx_page().encode("utf-8")).decode() if offline else ""
    parts = {
        "<!--@style-->\n": "<style>\n" + compact_css(read(SRC, "style.css")) + "\n</style>\n",
        "<!--@music-->\n": ("<script>window.MUSIC_DATA=" + json.dumps(music_data(), separators=(",", ":")) + ";</script>\n") if offline else "",
        "<!--@scripts-->\n": (
            "<script>window.RENYING_BUILD=" + json.dumps(build, separators=(",", ":")) + ";window.RENYING_AI_BRAIN=" + json.dumps(ai_brain_data(), separators=(",", ":")) + ";</script>\n"
            + "<script>\n" + read(ASSETS, "peerjs.min.js") + "\n</script>\n"
            + "<script>\n" + compact_js(read(SRC, "cloud.js")) + "\n</script>\n"
            + "<script>\n" + compact_js(read(SRC, "ai.js")) + "\n</script>\n"
            + "<script>\n" + compact_js(read(SRC, "game.js")) + "\n</script>\n"
            + "<script>\n" + compact_js(read(SRC, "net-p2p.js")) + "\n</script>\n"
            + "<script>\n" + compact_js(read(SRC, "social.js")) + "\n</script>\n"
            + "<script>\n" + compact_js(read(SRC, "armory-core.js")) + "\n</script>\n"
            + "<script>\n" + compact_js(read(SRC, "armory.js")) + "\n</script>\n"
            + "<script>\n" + compact_js(read(SRC, "anticheat.js")) + "\n</script>\n"
        ),
        "<!--@qfx-->\n": '<script id="qfxData" type="application/octet-stream">' + qfx_b64 + "</script>\n",
    }
    for marker, text in parts.items():
        if html.count(marker) != 1:
            raise SystemExit(f"src/page.html 里应该正好有一个 {marker.strip()}")
        html = html.replace(marker, text)
    return html


CORE_IMPORT = "import '../src/armory-core.js';\n"


def worker_bundle():
    """Cloudflare Worker：把 worker.js 引用的武库规则原样拼进去，浏览器和服务器用的是同一份规则"""
    src = read(ROOT, "cloudflare", "worker.js")
    if src.count(CORE_IMPORT) != 1:
        raise SystemExit("cloudflare/worker.js 里应该正好有一行 " + CORE_IMPORT.strip())
    head = "// 由 python3 tools/build.py 生成，不要直接改：改 cloudflare/worker.js 和 src/armory-core.js 再重新生成。\n"
    return head + src.replace(CORE_IMPORT, "/* === src/armory-core.js === */\n" + read(SRC, "armory-core.js") + "\n/* === cloudflare/worker.js === */\n")


def outputs():
    return {
        "index.html": page(offline=False),
        "renying-offline.html": page(offline=True),
        "renying.html": REDIRECT,
        "assets/qingfengxing.html": qfx_page(),
        "cloudflare/worker.bundle.js": worker_bundle(),
    }


def check_js():
    """有 node 的话检查一下 JS 语法（包括压缩后的产物，没有 node 就跳过）"""
    node = shutil.which("node")
    if not node:
        for cand in ("/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node"):
            if os.path.exists(cand):
                node = cand
                break
    if not node:
        return True
    ok = True
    for name in ("cloud.js", "ai.js", "game.js", "net-p2p.js", "social.js", "armory-core.js", "armory.js", "anticheat.js"):
        src_path = os.path.join(SRC, name)
        r = subprocess.run([node, "--check", src_path], capture_output=True, text=True)
        if r.returncode:
            print(f"src/{name} 语法错误：\n{r.stderr}")
            ok = False
            continue
        compacted = compact_js(read(SRC, name))
        rc = subprocess.run([node, "--check", "-"], input=compacted, capture_output=True, text=True)
        if rc.returncode:
            print(f"src/{name} 压缩后语法错误：\n{rc.stderr}")
            ok = False
    # 青锋行的各个文件共用一个闭包，拼起来再查
    game = "".join(read(QFX, n) for n in qfx_modules())
    r = subprocess.run([node, "--check", "-"], input="(function(){\n'use strict';\n" + game + "\n})();", capture_output=True, text=True)
    if r.returncode:
        print(f"src/qfx 语法错误：\n{r.stderr}")
        ok = False
    r = subprocess.run([node, "--input-type=module", "--check", "-"], input=worker_bundle(), capture_output=True, text=True)
    if r.returncode:
        print(f"cloudflare/worker.bundle.js 语法错误：\n{r.stderr}")
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
            print(f"已生成 {name}（{len(text.encode()) / 1024 / 1024:.2f} MB）")
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
