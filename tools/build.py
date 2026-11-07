#!/usr/bin/env python3
"""
刃影 打包脚本（只用 Python 自带的库）

源文件在 src/ 和 assets/，改完运行一次，生成仓库根目录下的网页：

  index.html            联网版：GitHub Pages 和 server.py 都用它。支持免服务器直连和联机服务器，
                        音乐从 assets/music 下载，青锋行按需从 assets/qingfengxing.html 加载。
  assets/qingfengxing.html  青锋行（三维小游戏）：由 src/qfx/ 里的 page.html 和按编号排好的各个 .js 拼成。
  renying-offline.html  离线版：一个文件就能玩（音乐、青锋行都打包在里面），双击打开，不能联机。
  renying.html          旧网址，只放一个进入 index.html 的链接（不自动跳转）。
  cloudflare/worker.js        Worker source：cloudflare/worker/ 下按编号排好的各个 .js 拼成。
  cloudflare/worker.bundle.js  云端账号的 Cloudflare Worker：worker.js 加上武库规则（src/armory-core.js）和管理网页
                        （cloudflare/admin.html，Worker 的 /admin）拼成一个文件，wrangler deploy 用它，
                        在 Cloudflare 网页编辑器里整段粘贴也能用。
  cloudflare/migrations.gen.js  D1 迁移：cloudflare/migrations/ 里的 .sql 拆成一句一句，worker.js 引用它，
                        Worker 第一次收到请求时把还没跑过的按编号跑完（记在 schema_migrations 表里）。

用法：
  python3 tools/build.py          生成网页
  python3 tools/build.py --check  只检查网页是不是最新的（CI 用），不是最新就返回 1
"""
# 文件结构（从上到下）：
#   1. 路径常量和旧网址页面模板
#   2. 读文件、找编号源文件的小工具
#   3. 压缩：去掉 CSS / JS 的注释和空行
#   4. 嵌进网页的数据：音乐、AI 训练结果
#   5. 青锋行（三维小游戏）页面
#   6. 游戏主网页（联网版 / 离线版）
#   7. Cloudflare Worker：管理网页、D1 迁移、整合包
#   8. 所有产物的清单
#   9. 语法检查（并发跑 node --check）
#  10. 入口：生成或 --check
#
# 找 bug 提示：产物和源码对不上时先跑 --check 看哪个文件旧了；
# 打包报"应该正好有一个 …"说明源文件里的占位标记被删了或写了两次。
import base64
import functools
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

# ===========================================================================
# 1. 路径常量和旧网址页面模板
# ===========================================================================
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "src")
ASSETS = os.path.join(ROOT, "assets")

# renying.html 的内容：旧网址只放一个按钮进新地址，不自动跳转
REDIRECT = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="referrer" content="no-referrer">
<title>刃影 · 已搬到新地址</title>
<link rel="canonical" href="./">
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0a0b1c; color: #efe8d8; font: 18px/1.7 "Noto Serif SC", "Songti SC", serif; text-align: center; padding: 16px; box-sizing: border-box; }
  a.go { display: inline-block; margin: 14px 0 6px; padding: 12px 34px; color: #0a0b1c; background: #e9c46a; text-decoration: none; font-size: 20px; letter-spacing: .1em; }
  a.go:focus-visible { outline: 3px solid #46d3ea; outline-offset: 3px; }
  .later { opacity: 0; animation: show .4s 3s forwards; color: rgba(239,232,216,.7); font-size: 15px; }
  @keyframes show { to { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { .later { opacity: 1; animation: none; } }
</style>
</head>
<body>
<main>
<h1 style="font-size:26px;margin:0">刃影已经搬到新地址</h1>
<a class="go" id="go" href="./">进入刃影</a>
<p class="later" role="status">旧地址不再自动跳转，请点上面的「进入刃影」，以后直接收藏新地址就好。</p>
</main>
<!-- 不自动跳转；有 JS 时只把邀请链接里的房间号（?… 和 #…）带到按钮上，关掉 JS 也能点进去 -->
<script>document.getElementById('go').href = './' + location.search + location.hash;</script>
</body>
</html>
"""


# ===========================================================================
# 2. 读文件、找编号源文件的小工具
# ===========================================================================
# 同一次打包里一个文件会被读好几次（游戏主体要用来压缩、查语法、取管理网页的名字），
# 所以读出来的内容缓存起来；打包期间源文件不会变，缓存是安全的。
@functools.lru_cache(maxsize=None)
def read(*parts, mode="r"):
    path = os.path.join(*parts)
    if mode == "rb":
        with open(path, "rb") as f:
            return f.read()
    with open(path, "r", encoding="utf-8", newline="") as f:
        # 统一成 LF 再返回：Windows 上 git 检出的是 CRLF，不归一化的话下面按 \n 拼的标记行永远对不上
        return f.read().replace("\r\n", "\n").replace("\r", "\n")



# 文件名形如 "07-ai-story.js"：两位数字开头，拼接时按文件名排序
def numbered(*parts):
    return sorted(n for n in os.listdir(os.path.join(SRC, *parts)) if re.match(r"^\d\d-[a-z0-9-]+\.js$", n))


def style_parts():
    folder = os.path.join(SRC, "styles")
    modules = []
    if os.path.isdir(folder):
        modules = sorted(n for n in os.listdir(folder) if re.match(r"^\d\d-[a-z0-9-]+\.css$", n))
    return [os.path.join(SRC, "style.css")] + [os.path.join(folder, n) for n in modules]


def style_source():
    return "".join(read(path) for path in style_parts())


def worker_parts():
    folder = os.path.join(ROOT, "cloudflare", "worker")
    return sorted(n for n in os.listdir(folder) if re.match(r"^\d\d-[a-z0-9-]+\.js$", n))


def worker_source():
    parts = worker_parts()
    if not parts:
        raise SystemExit("cloudflare/worker/ 里没有按编号排好的 Worker 源文件")
    return "".join(read(ROOT, "cloudflare", "worker", name) for name in parts)


def data_parts():
    """src/data/ 下的数据表：先是本层按编号排好的文件（定义表和 defHero 这类登记函数），再是各子目录（heroes/ 每位侠客一个文件）"""
    base = os.path.join(SRC, "data")
    subs = sorted(d for d in os.listdir(base) if os.path.isdir(os.path.join(base, d)))
    return [("data", n) for n in numbered("data")] + [("data", d, n) for d in subs for n in numbered("data", d)]


def game_parts():
    """先是 src/data/ 的数据表，再是 src/game/ 下按编号排好的文件，拼起来就是整个游戏主体（原来的 src/game.js）"""
    return data_parts() + [("game", n) for n in numbered("game")]


def game_source():
    return "".join(read(SRC, *p) for p in game_parts())

# ===========================================================================
# 3. 压缩：去掉 CSS / JS 的注释和空行
# ===========================================================================
# 注意 compact_js 只删"整行"的 // 注释和 /* */ 块（不解析字符串），
# 所以源码里多行模板字符串的某一行如果正好以 // 或 /* 开头，会被误删。写代码时避开这种写法。
def compact_css(css):
    css = re.sub(r"/\*[\s\S]*?\*/", "", css)
    lines = [ln.strip() for ln in css.splitlines() if ln.strip()]
    return "\n".join(lines)


@functools.lru_cache(maxsize=None)
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


# ===========================================================================
# 4. 嵌进网页的数据：音乐、AI 训练结果
# ===========================================================================
def music_data():
    folder = os.path.join(ASSETS, "music")
    data = {}
    for name in sorted(os.listdir(folder)):
        if name.endswith(".mp3"):
            data[name[:-4]] = "data:audio/mpeg;base64," + base64.b64encode(read(folder, name, mode="rb")).decode()
    return data


def ai_brain_data():
    """电脑 AI 的打击数据和训练出来的打法基因（tools/ai/ai-framedata.mjs、tools/ai/ai-train.mjs 生成）"""
    path = os.path.join(SRC, "models", "ai-brain.json")
    if os.path.exists(path):
        return json.loads(read(path))
    return {}


# ===========================================================================
# 5. 青锋行（三维小游戏）页面
# ===========================================================================
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


# ===========================================================================
# 6. 游戏主网页（联网版 / 离线版）
# ===========================================================================
# src/page.html 里有几个占位标记，按下面 parts 的顺序换成样式和脚本。
# 脚本的先后顺序有讲究：后面的文件会用到前面定义的全局变量，不要随便调换。
def page(offline):
    html = read(SRC, "page.html")
    build = {"offline": offline}
    qfx_b64 = base64.b64encode(qfx_page().encode("utf-8")).decode() if offline else ""
    parts = {
        "<!--@style-->\n": "<style>\n" + compact_css(style_source()) + "\n</style>\n",
        "<!--@music-->\n": ("<script>window.MUSIC_DATA=" + json.dumps(music_data(), separators=(",", ":")) + ";</script>\n") if offline else "",
        "<!--@scripts-->\n": (
            "<script>window.RENYING_BUILD=" + json.dumps(build, separators=(",", ":")) + ";window.RENYING_AI_BRAIN=" + json.dumps(ai_brain_data(), separators=(",", ":")) + ";</script>\n"
            + "<script>\n" + compact_js(read(SRC, "errlog.js")) + "\n</script>\n"
            + "<script>\n" + read(ASSETS, "peerjs.min.js") + "\n</script>\n"
            + "<script>\n" + compact_js(read(SRC, "cloud.js")) + "\n</script>\n"
            + "<script>\n" + compact_js(read(SRC, "i18n.js")) + "\n</script>\n"
            + "<script>\n" + compact_js(read(SRC, "ai.js")) + "\n</script>\n"
            + "<script>\n" + compact_js(game_source()) + "\n</script>\n"
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


# ===========================================================================
# 7. Cloudflare Worker：管理网页、D1 迁移、整合包
# ===========================================================================
# worker 源码里这几行是占位：打包时换成真正的内容
CORE_IMPORT = "import '../src/armory-core.js';\n"
MIG_IMPORT = "import { MIGRATIONS } from './migrations.gen.js';\n"
CHRON_IMPORT = "import '../src/data/13-chron.js';\n"
ADMIN_LINE = "const ADMIN_PAGE = { html: '', sha: '' };\n"
NAMES_MARK = "/*@names*/null"


def admin_names():
    """管理网页里饰品、侠客的名字：原有皮肤从 src/game/ 读，侠客从 src/data/heroes/ 读，武库的新皮肤从 src/armory-core.js 读"""
    game, core = game_source(), read(SRC, "armory-core.js")
    a = game.index("const SKINS = {")
    b = game.index("\n};", a)
    skins = dict(re.findall(r"^ {2}([a-z]{2}_[a-z0-9]+): \{ char: '[a-z]+', rarity: '[a-z]+', name: '([^']+)'", game[a:b], re.M))
    skins.update(re.findall(r"^ {4}\['([a-z]{2}_p[0-9]+)', '[a-z]+', '([^']+)'", core, re.M))
    skins.update(re.findall(r"^ {4}([a-z]{2}_[a-z0-9]+): \{ char: '[a-z]+', name: '([^']+)'", core, re.M))
    # 星座武器箱的 36 款是照表生成的：星座名在 C.ZODIAC，档位名在 C.ZOD_TIERS，谁分到哪三个星座在 C.ZOD_OF
    zod = dict(re.findall(r"^ {4}\['([a-z]{3})', '([^']+)', '#", core, re.M))
    tiers = re.findall(r"\['[a-z]+', '([^']+)'\]", re.search(r"C\.ZOD_TIERS = \[(.*?)\];", core).group(1))
    zof = re.findall(r"([a-z]{2}): \['([a-z]{3})', '([a-z]{3})', '([a-z]{3})'\]", re.search(r"C\.ZOD_OF = \{(.*?)\};", core, re.S).group(1))
    if len(zod) != 12 or len(tiers) != 3 or len(zof) != 12:
        raise SystemExit(f"星座皮肤的名字没读全：星座 {len(zod)} 个、档位 {len(tiers)} 个、侠客 {len(zof)} 个（src/armory-core.js 的 C.ZODIAC / C.ZOD_TIERS / C.ZOD_OF 写法变了？）")
    for pre, *codes in zof:
        for i, code in enumerate(codes):
            skins[f"{pre}_z{code}"] = f"{zod[code]}·{tiers[i]}"
    heroes = dict(re.findall(r"^  id: '([a-z]+)',[^\n]*\n(?:  [^\n]*\n)*?  char: \{\s*name: '([^']+)'", game, re.M))
    if len(skins) < 60 or len(heroes) < 12:
        raise SystemExit(f"管理网页要的名字没读全：皮肤 {len(skins)} 款、侠客 {len(heroes)} 个（src/game/ 的 SKINS、src/data/heroes/ 或 src/armory-core.js 的写法变了？）")
    return {"skins": skins, "heroes": heroes}


def admin_page():
    """管理网页：填上名字表，再算出页面里那一段脚本的 sha256（Worker 只许浏览器跑这一段）。返回 (网页, 脚本, sha256)"""
    html = read(ROOT, "cloudflare", "admin.html")
    if html.count(NAMES_MARK) != 1:
        raise SystemExit("cloudflare/admin.html 里应该正好有一个 " + NAMES_MARK)
    html = html.replace(NAMES_MARK, json.dumps(admin_names(), ensure_ascii=False, separators=(",", ":")))
    scripts = re.findall(r"(?i)<script\b[^>]*>(.*?)</script\b[^>]*>", html, re.S)
    if len(scripts) != 1 or len(re.findall(r"(?i)<script\b", html)) != 1:
        raise SystemExit("cloudflare/admin.html 里应该正好有一段 <script>（不带属性）")
    return html, scripts[0], base64.b64encode(hashlib.sha256(scripts[0].encode("utf-8")).digest()).decode()


def migrations():
    """cloudflare/migrations/0001_xxx.sql …：去掉 -- 注释（包括文件末尾写的回滚 SQL），按分号拆成一句一句。sum 是这些句子的 sha256 前 16 位，改了跑过的文件 Worker 会提示"""
    d = os.path.join(ROOT, "cloudflare", "migrations")
    files = sorted(f for f in os.listdir(d) if f.endswith(".sql"))
    out = []
    for i, f in enumerate(files, 1):
        m = re.fullmatch(r"(\d{4})_([a-z0-9_]+)\.sql", f)
        if not m or int(m.group(1)) != i:
            raise SystemExit(f"cloudflare/migrations/{f}：文件名要是 0001_xxx.sql 这样，从 0001 开始连续编号")
        sql = "\n".join(re.sub(r"--.*$", "", line) for line in read(d, f).split("\n"))
        if re.search(r"'[^'\n]*;[^'\n]*'", sql):
            raise SystemExit(f"cloudflare/migrations/{f}：字符串里不要写分号（按分号拆句子）")
        stmts = [" ".join(x.split()) for x in sql.split(";") if x.strip()]
        if not stmts:
            raise SystemExit(f"cloudflare/migrations/{f} 是空的")
        out.append({"id": i, "name": f[:-4], "sum": hashlib.sha256("\n".join(stmts).encode("utf-8")).hexdigest()[:16], "sql": stmts})
    return out


def migrations_js():
    body = ",\n".join("  " + json.dumps(m, ensure_ascii=False) for m in migrations())
    return ("// 由 python3 tools/build.py 从 cloudflare/migrations/*.sql 生成，不要直接改：改 .sql（或者加新的）再重新生成。\n"
            "export const MIGRATIONS = [\n" + body + "\n];\n")


def worker_bundle():
    """Cloudflare Worker：把编号源码拼起来，再嵌入武库规则、迁移、长卷表和管理网页"""
    src = worker_source()
    for line in (CORE_IMPORT, ADMIN_LINE, MIG_IMPORT, CHRON_IMPORT):
        if src.count(line) != 1:
            raise SystemExit("cloudflare/worker.js 里应该正好有一行 " + line.strip())
    html, _, sha = admin_page()
    src = src.replace(ADMIN_LINE, "const ADMIN_PAGE = { html: " + json.dumps(html, ensure_ascii=False) + ", sha: '" + sha + "' };\n")
    src = src.replace(MIG_IMPORT, migrations_js().split("\n", 1)[1].replace("export const", "const", 1))
    src = src.replace(CHRON_IMPORT, "/* === src/data/13-chron.js === */\n" + read(SRC, "data", "13-chron.js") + "\n")   # 全服肉鸽的长卷节点表：浏览器和服务器用同一份
    head = "// 由 python3 tools/build.py 生成，不要直接改：改 cloudflare/worker/*.js、cloudflare/admin.html、cloudflare/migrations/*.sql、src/armory-core.js 和 src/data/13-chron.js 再重新生成。\n"
    return head + src.replace(CORE_IMPORT, "/* === src/armory-core.js === */\n" + read(SRC, "armory-core.js") + "\n/* === cloudflare/worker.js === */\n")


# ===========================================================================
# 8. 所有产物的清单：{仓库里的路径: 内容}
# ===========================================================================
def outputs():
    return {
        "index.html": page(offline=False),
        "renying-offline.html": page(offline=True),
        "renying.html": REDIRECT,
        "assets/qingfengxing.html": qfx_page(),
        "cloudflare/worker.js": worker_source(),
        "cloudflare/worker.bundle.js": worker_bundle(),
        "cloudflare/migrations.gen.js": migrations_js(),
    }


# ===========================================================================
# 9. 语法检查
# ===========================================================================
def _node_path():
    """找 node：先看 PATH，再看 macOS / Linux 的常见安装位置；找不到返回 None"""
    node = shutil.which("node")
    if node:
        return node
    for cand in ("/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node"):
        if os.path.exists(cand):
            return cand
    return None


def _run(args, stdin=None):
    """跑一个子进程，返回 (退出码, stdout, stderr)；统一用 UTF-8 解码，坏字节替换掉不报错"""
    r = subprocess.run(args, input=stdin, capture_output=True, text=True, encoding="utf-8", errors="replace")
    return r.returncode, r.stdout, r.stderr


def check_js():
    """有 node 的话检查一下 JS 语法（包括压缩后的产物，没有 node 就跳过）

    每个检查都是一次独立的 `node --check`，互不依赖，所以放进线程池并发跑（以前一个一个跑要 3~4 秒）。
    结果按原来的顺序打印，出错信息和以前一字不差。
    """
    node = _node_path()
    if not node:
        return True

    # ---- 1. 列出所有检查：(出错时的标题, 命令参数, 标准输入) ----
    jobs = []
    for name in ("cloud.js", "i18n.js", "ai.js", "net-p2p.js", "social.js", "armory-core.js", "armory.js", "anticheat.js"):
        # 源文件本身，和 compact_js 压缩后的样子各查一遍（压缩出错说明 compact_js 把代码切坏了）
        jobs.append((f"src/{name} 语法错误：", [node, "--check", os.path.join(SRC, name)], None, name))
        jobs.append((f"src/{name} 压缩后语法错误：", [node, "--check", "-"], compact_js(read(SRC, name)), name))
    # 游戏主体拆成了 src/game/ 下的多个文件：每个单独查一遍，再把拼起来压缩后的整体查一遍
    for part in game_parts():
        jobs.append((f"src/{'/'.join(part)} 语法错误：", [node, "--check", os.path.join(SRC, *part)], None, None))
    jobs.append(("src/data/ + src/game/ 拼起来压缩后语法错误：", [node, "--check", "-"], compact_js(game_source()), None))
    # src/data/ 的数据表：必填字段、不认识的字段、编号唯一、引用存在（tools/checks/data-check.mjs），有错就不生成网页
    # CI 里再加 --strict-copy：英文词条的中文在源码里找不到也算错；本机只提醒
    strict = ["--strict-copy"] if os.environ.get("CI") else []
    jobs.append((None, [node, os.path.join(ROOT, "tools", "checks", "data-check.mjs"), *strict], None, None))
    # 青锋行的各个文件共用一个闭包，拼起来再查
    qfx_game = "".join(read(QFX, n) for n in qfx_modules())
    jobs.append(("src/qfx 语法错误：", [node, "--check", "-"], "(function(){\n'use strict';\n" + qfx_game + "\n})();", None))
    jobs.append(("cloudflare/worker.bundle.js 语法错误：", [node, "--input-type=module", "--check", "-"], worker_bundle(), None))
    jobs.append(("cloudflare/admin.html 的脚本语法错误：", [node, "--check", "-"], admin_page()[1], None))

    # ---- 2. 并发执行 ----
    from concurrent.futures import ThreadPoolExecutor
    # data-check.mjs 最慢（约 1 秒），先提交，让它最早开始跑；结果仍按 jobs 的顺序取
    order = sorted(range(len(jobs)), key=lambda i: jobs[i][0] is not None)
    with ThreadPoolExecutor(max_workers=min(16, (os.cpu_count() or 2) * 2)) as pool:
        futures = {i: pool.submit(_run, jobs[i][1], jobs[i][2]) for i in order}
        results = [futures[i].result() for i in range(len(jobs))]

    # ---- 3. 按原来的顺序汇报 ----
    ok = True
    broken_src = set()   # 源文件本身就坏了的，不再重复报"压缩后"的错（和以前的 continue 一样）
    for (title, _, stdin, src_name), (code, out, err) in zip(jobs, results):
        if not code:
            continue
        if src_name and stdin is not None and src_name in broken_src:
            continue
        if src_name and stdin is None:
            broken_src.add(src_name)
        print(out + err if title is None else f"{title}\n{err}")
        ok = False
    return ok


# ===========================================================================
# 10. 入口：生成或 --check
# ===========================================================================
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
