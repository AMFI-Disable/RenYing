# Contributing / 参与开发

The full rules are in [contributing.md](https://github.com/AMFI-Disable/RenYing/blob/main/.github/contributing.md) in the repository. The short version:

- **Who can merge:** only pull requests from the maintainer (Even, `AMFI-Disable`) and repository collaborators are merged. Everyone is welcome to open [issues](https://github.com/AMFI-Disable/RenYing/issues).
- **Edit sources, not generated files.** After changing `src/`, `assets/` or `cloudflare/`, run `python3 tools/build.py` and commit the generated files with the change.
- **Commit messages:** `type: word word word` (three lowercase words).
- **File names:** lowercase for every tracked file.
- **Markdown headings:** Title Case.
- **Docs stay in sync:** `readme.md` ↔ `readme.zh-cn.md`, and this wiki ↔ `docs/wiki/`.
- **Describe RenYing on its own terms**, without comparing it to other games.
- **Security problems** go through [security.md](https://github.com/AMFI-Disable/RenYing/blob/main/.github/security.md), never public issues.

## 中文

- 只合并 Even（`AMFI-Disable`）和协作者的 PR，任何人都可以提 issue。
- 改源码后跑 `python3 tools/build.py`，生成的文件和源码一起提交。
- 提交信息 `类型: 三个小写单词`，文件名全小写，Markdown 标题 Title Case。
- 两份 readme、Wiki 和 `docs/wiki/` 要同步。
- 介绍刃影时只写它自己，不要写成照着别的游戏做的。
- 安全问题按 security.md 私下报告。

## Editing This Wiki / 编辑 Wiki

The wiki is a separate git repository:

```bash
git clone https://github.com/AMFI-Disable/RenYing.wiki.git
```

Page names use `Title-Case-With-Dashes.md` (GitHub wiki needs `Home.md`). The copy in the main repository, `docs/wiki/`, uses the same names in lowercase because the main repository only allows lowercase file names.
