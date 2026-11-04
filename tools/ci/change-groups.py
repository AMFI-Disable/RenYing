#!/usr/bin/env python3
"""Classify changed paths for the pull-request test matrix."""
import subprocess
import sys


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


def matches(path, prefixes=(), exact=()):
    return path in exact or any(path.startswith(prefix) for prefix in prefixes)


def main():
    base, head, output_path = sys.argv[1:4]
    paths = changed_paths(base, head)
    groups = {
        "all": "tools/tests/test.mjs" in paths,
        "game": any(matches(path, ("src/data/", "src/game/", "tools/checks/"), (
            "src/ai.js", "src/anticheat.js", "src/net-p2p.js", "models/ai-brain.json",
            "tools/tests/combat-test.mjs", "tools/tests/rollback-test.mjs",
            "tools/tests/netplay-test.mjs", "tools/tests/anticheat-test.mjs",
            "tools/tests/ai-lingque-test.mjs", "tools/tests/test.mjs",
        )) for path in paths),
        "ai": any(matches(path, ("tools/ai/", "models/"), (
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
        "browser": any(matches(path, ("src/data/", "src/game/", "tools/audits/"), (
            "src/page.html", "src/style.css", "src/armory.js", "src/social.js",
            "index.html", "tools/build.py", "tools/tests/test.mjs",
        )) for path in paths),
        "offline": any(matches(path, ("src/qfx/", "src/data/", "src/game/", "assets/"), (
            "src/ai.js", "renying-offline.html", "tools/build.py", "tools/tests/rollback-test.mjs",
            "tools/tests/test.mjs",
        )) for path in paths),
    }
    with open(output_path, "a", encoding="utf-8") as output:
        for name, enabled in groups.items():
            output.write(f"{name}={'true' if enabled else 'false'}\n")


if __name__ == "__main__":
    main()
