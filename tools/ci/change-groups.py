#!/usr/bin/env python3
"""Classify changed paths for the pull-request test matrix."""
# 给 .github/workflows/ci.yml 用：根据这次改了哪些文件，决定要跑哪几组测试。
#
# 用法：python3 tools/ci/change-groups.py <base-sha> <head-sha> <$GITHUB_OUTPUT>
# 输出：往 $GITHUB_OUTPUT 追加 all=true/false、game=…、ai=… 这样的行，ci.yml 里读这些开关。
#
# 找 bug 提示：某组测试该跑没跑，多半是下面 groups 里的路径前缀或文件名没写全；
# 新加的测试文件或源码目录要记得加进对应的组。
import subprocess
import sys


# 列出 base...head 之间改过的文件；base 是全 0（新分支第一次推送）时，只比最后一个提交
def changed_paths(base, head):
    if base and set(base) != {"0"}:
        revisions = [f"{base}...{head}"]
    else:
        revisions = [f"{head}^", head]
    result = subprocess.run(
        ["git", "diff", "--name-only", *revisions],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.splitlines()


# path 恰好是 exact 里的某个文件，或者以 prefixes 里某个目录开头
def matches(path, prefixes=(), exact=()):
    return path in exact or any(path.startswith(prefix) for prefix in prefixes)


def main():
    base, head, output_path = sys.argv[1:4]
    paths = changed_paths(base, head)
    # 每一组：改到列出的目录（第一个元组）或文件（第二个元组），就要跑这一组测试
    groups = {
        "all": "tools/tests/test.mjs" in paths,
        "game": any(matches(path, ("src/data/", "src/game/", "tools/checks/"), (
            "src/ai.js", "src/anticheat.js", "src/net-p2p.js", "src/models/ai-brain.json",
            "tools/tests/combat-test.mjs", "tools/tests/rollback-test.mjs",
            "tools/tests/netplay-test.mjs", "tools/tests/anticheat-test.mjs",
            "tools/tests/ai-lingque-test.mjs", "tools/tests/test.mjs",
        )) for path in paths),
        "ai": any(matches(path, ("tools/ai/", "src/models/"), (
            "src/ai.js", "tools/tests/test-ai.mjs",
        )) for path in paths),
        "cloud": any(matches(path, ("cloudflare/", "src/game/24-account", "src/game/19-progress-02-"), (
            "src/cloud.js", "tools/tests/cloud-test.mjs", "tools/tests/sync-test.mjs",
            "tools/tests/world-test.mjs", "tools/tests/test.mjs",
        )) for path in paths),
        "economy": any(matches(path, ("src/armory", "cloudflare/", "src/game/19-progress-03-"), (
            "src/anticheat.js", "src/cloud.js", "tools/tests/econ-test.mjs", "tools/tests/test.mjs",
        )) for path in paths),
        "worker": any(matches(path, ("cloudflare/",), (
            "src/armory-core.js", "src/armory.js", "src/cloud.js",
            "tools/tests/predeploy-check.mjs", "tools/tests/world-test.mjs",
            "tools/tests/rollback-test.mjs", "tools/tests/test.mjs", "tools/build.py",
        )) for path in paths),
        "browser": any(matches(path, ("src/data/", "src/game/", "src/styles/", "tools/audits/"), (
            "src/page.html", "src/style.css", "src/armory.js", "src/social.js",
            "index.html", "tools/build.py", "tools/tests/test.mjs",
        )) for path in paths),
        "offline": any(matches(path, ("src/qfx/", "src/data/", "src/game/", "assets/"), (
            "src/ai.js", "renying-offline.html", "tools/build.py", "tools/tests/rollback-test.mjs",
            "tools/tests/test.mjs",
        )) for path in paths),
    }
    # 一行一个 key=value，GitHub Actions 的标准输出格式
    with open(output_path, "a", encoding="utf-8") as output:
        for name, enabled in groups.items():
            output.write(f"{name}={'true' if enabled else 'false'}\n")


if __name__ == "__main__":
    main()
