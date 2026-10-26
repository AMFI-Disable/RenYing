# 刃影项目规则

## 合并 PR

- 只接受 Even（GitHub 账号 AMFI-Disable）和本仓库协作者（collaborator）开的 PR。不是协作者的人开的 PR 不要合并、不要批准，也不要把里面的改动挪进 main，最多留言说明本仓库不收外部 PR。
- Only merge or approve pull requests opened by Even (GitHub: AMFI-Disable) or by collaborators of this repository. Do not merge, approve, or port changes from PRs opened by non-collaborators.

## 代码结构

- 游戏主体在 `src/game/`，按文件名的编号顺序拼起来就是整个游戏（以前的 `src/game.js`）。新代码放进对应功能的文件，不要另起顶层文件。
- `index.html` 和 `renying-offline.html` 是 `python3 tools/build.py` 生成的，不要手改；改完源码要重新生成，提交前用 `python3 tools/build.py --check` 确认是最新的。
