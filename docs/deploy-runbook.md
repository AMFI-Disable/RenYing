# 刃影部署、备份与恢复手册

写给负责部署的 Even，也写给以后接手的人。命令都在仓库根目录运行，每一行单独复制。

## 部署的是什么

| 部分 | 在哪 | 怎么上线 |
| :--- | :--- | :--- |
| 网页（联网版、离线版、青锋行） | GitHub Pages | 推到 main 就自动发布，不用手动操作 |
| 服务器 Worker `renying` | Cloudflare Workers | Even 手动部署（一般每天一次） |
| 数据库 `renying-db` | Cloudflare D1 | 表结构改动跟着 Worker 走：部署后第一次请求时 Worker 自己跑迁移（见「数据库迁移」） |
| 开放世界分线 `WorldLine` | Durable Object | 跟着 Worker 一起部署；分线里的数据是临时的，不用备份 |
| 口令和密钥 | Worker 的 Secret / 变量 | 只在 Cloudflare 后台或 `wrangler secret put` 里设，不进仓库 |

Worker 用到的 Secret 和变量（都可以不设，不设时对应功能关闭或用默认值）：

| 名字 | 做什么 | 说明在哪 |
| :--- | :--- | :--- |
| `ADMIN_SECRET` | 管理口令，建第一批管理员账号用 | `docs/admin.md` |
| `TURNSTILE_SITEKEY`、`TURNSTILE_SECRET` | 注册时的人机验证 | `docs/admin.md` |
| `TURN_KEY_ID`、`TURN_KEY_API_TOKEN` | 联机用的 Cloudflare TURN 中继 | `cloudflare/worker.js` |
| `CORS_ORIGINS` | 额外允许调用接口的网址，逗号分开 | `cloudflare/worker.js` |
| `LOG_SALT` | 登录记录里 IP 哈希用的密钥 | `cloudflare/worker.js` |

## 每次部署 Worker

1. 拉取最新代码：
```
git pull --rebase origin main
```
2. 确认生成的文件是最新的：
```
python3 tools/build.py --check
```
3. 部署前检查（wrangler.toml、管理后台 CSP、接口冒烟测试，包括在空库上跑一遍全部迁移）：
```
node tools/predeploy-check.mjs
```
4. 看这次有没有新的迁移文件（对比线上已经跑过的编号和 `cloudflare/migrations/` 里的文件）：
```
npx wrangler d1 execute renying-db --remote --command "SELECT max(id) AS ran FROM schema_migrations" --config cloudflare/wrangler.toml
```
```
ls cloudflare/migrations/*.sql
```
   如果报错说 `schema_migrations` 不存在，说明线上还是迁移文件出现以前的库，**这次所有迁移都是新的**。如果文件里最大的编号比 `ran` 大，也有新迁移。有新迁移就先做第 5 步，没有就跳到第 6 步。
5. 导出备份（有新迁移时必须做，见「备份与恢复」）：
```
npx wrangler d1 export renying-db --remote --output=backup-$(date +%Y%m%d-%H%M).sql --config cloudflare/wrangler.toml
```
6. 部署生产：
```
npx wrangler deploy --env="" --config cloudflare/wrangler.toml
```
7. 打一次健康检查。这一下也会让 Worker 跑完新的迁移，看到 `"ok":true` 就是成功：
```
curl -s https://renying.evengao6688.workers.dev/api/health
```
8. 有新迁移时，确认迁移都跑完了（编号应该和文件一样多）：
```
npx wrangler d1 execute renying-db --remote --command "SELECT id, name, applied_at FROM schema_migrations ORDER BY id" --config cloudflare/wrangler.toml
```

第 2、3 步任何一项失败就不要部署，把报错交给开发线程。

> `--env=""` 表示部署生产。不写也是部署生产，只是 wrangler 会提醒「有多个环境但没指定」，写上更不容易弄错。
> `--config cloudflare/wrangler.toml` 让命令在仓库根目录就能跑；也可以先 `cd cloudflare` 再去掉这一段。

## 先上 Staging

账号、存档、经济、迁移这类大改动，先在 staging 试一遍。staging 是独立的 Worker `renying-staging` 和独立的数据库，和生产完全分开。

只做一次的准备：

1. 建 staging 数据库，把输出里的 `database_id` 填进 `cloudflare/wrangler.toml` 的 `[env.staging]`（替换全 0 的占位）：
```
npx wrangler d1 create renying-db-staging
```
2. 设 staging 的管理口令，和生产用不同的口令：
```
npx wrangler secret put ADMIN_SECRET --env staging --config cloudflare/wrangler.toml
```

每次试改动：

3. 部署到 staging：
```
npx wrangler deploy --env staging --config cloudflare/wrangler.toml
```
4. 打一次健康检查，让 staging 跑完迁移（`<子域>` 换成你的 workers.dev 子域）：
```
curl -s https://renying-staging.<子域>.workers.dev/api/health
```

然后在网页里临时把服务器地址指向 staging，试登录、存档、开箱、开放世界；没问题再按「每次部署 Worker」上生产。

想用接近真实的数据试迁移：把生产的备份导进 staging（见「从导出文件恢复」，把库名换成 `renying-db-staging`），再部署 staging。

## 数据库迁移

迁移文件在 `cloudflare/migrations/`，规则写在那里的 `readme.md`。部署时要记住的几点：

- **不要运行 `npx wrangler d1 migrations apply`。** 迁移由 Worker 自己跑，记在 `schema_migrations` 表；wrangler 用的是另一张表，会从 `0001` 重跑，在 `0002` 上报「列已经有了」停下。`wrangler.toml` 里的 `migrations_dir` 只是给部署前检查找目录用的。
- 部署以后，每个 Worker 实例第一次收到请求时把没跑过的迁移按编号跑完。一个迁移文件是一个事务：中途出错就整个退回、什么都不改，那次请求报错，下一次请求再试。
- 生产库第一次部署带迁移的版本时，会把 `0001`～`0005` 记成已跑（表和列大多已经有了，只会新加 `users.deleted_at`），再跑 `0006`。
- **`0006` 会重建 `econ`、`mkt`、`sanctions` 三张表**（加 CHECK 约束：墨锭不为负、挂单状态只有 0/1/2 等）。部署这一版之前必须先导出备份。
- 跑过的迁移文件不要再改；要改就加下一个编号的新文件。
- 每个迁移文件末尾都用注释写了回滚 SQL。

## 回滚

### 先看能不能退回旧 Worker

**从这一版起，不能把 Worker 退回到账号安全改动（PBKDF2 密码、session token 只存哈希）以前的版本。** 实测：新 Worker 上线后，凡是登录过或新注册的账号，密码都换成了新的存法，旧 Worker 认不出来，这些人会登录失败；旧 Worker 也认不出新的登录状态，所有人都会被退出。

所以出问题时按这个顺序处理：

1. **能修就往前修**：开发线程修好后重新走「每次部署 Worker」。这是首选。
2. **退回到同样带新账号逻辑的上一版**：只有在上一版也是这次改动以后的版本时才可以。先查看版本列表：
```
npx wrangler deployments list --config cloudflare/wrangler.toml
```
   确认要退回的版本是这次改动以后部署的，再退回（把 `<版本号>` 换成列表里的 Version ID）：
```
npx wrangler rollback <版本号> --config cloudflare/wrangler.toml
```
   **不要不带版本号直接 `wrangler rollback`**：刚部署完这一版时，「上一版」就是改动以前的旧版。
3. **数据坏了**：按「备份与恢复」把数据库恢复到部署前的时间点。这会丢掉那之后的所有改动，要先在管理后台发公告。

### 迁移跑失败了

迁移失败时整个事务会退回，数据库保持原样，Worker 每次请求都会重试，日志里能看到报错（Cloudflare 后台 Workers → renying → Logs）。处理办法：

- 把报错交给开发线程，修好迁移文件（这时它还没跑成功，可以改）后重新部署；
- 或者按上面第 2 条退回到上一版。

### 迁移跑成功了，但结果不对

- 按迁移文件末尾的回滚 SQL，用 `npx wrangler d1 execute renying-db --remote --file=<回滚文件>` 执行。回滚 SQL 最后一句会删掉 `schema_migrations` 里这一行。执行前先导出一次备份。
- 或者按「备份与恢复」恢复到部署前的时间点。

### `compatibility_date` 出问题

把 `cloudflare/wrangler.toml` 里的 `compatibility_date` 改回旧日期，重新部署。

## 备份与恢复

| 方式 | 保留多久 | 用来做什么 |
| :--- | :--- | :--- |
| D1 Time Travel（Cloudflare 自动开着，不用设置） | 免费版 7 天，付费版 30 天 | 恢复到最近任意一分钟 |
| 手动导出 `wrangler d1 export` | 自己保存 | 有新迁移的部署前、大改动前留一份 |

### 手动导出

```
npx wrangler d1 export renying-db --remote --output=backup-$(date +%Y%m%d-%H%M).sql --config cloudflare/wrangler.toml
```

- 导出期间数据库会短暂不响应别的请求。现在数据量小，几秒就完；以后变大了，尽量挑人少的时候导。
- 导出的文件里有账号和密码哈希。`.gitignore` 已经忽略 `backup-*.sql`，**不要用别的名字放进仓库**；存在自己电脑或私有云盘里。

### 恢复到某个时间点（Time Travel）

1. 先记下现在的书签，万一恢复错了还能回来：
```
npx wrangler d1 time-travel info renying-db --config cloudflare/wrangler.toml
```
2. 恢复到指定时刻（时间换成要恢复到的时刻，UTC 或 Unix 时间戳；一般选部署前一分钟）：
```
npx wrangler d1 time-travel restore renying-db --timestamp=2026-10-28T00:00:00Z --config cloudflare/wrangler.toml
```

恢复会覆盖这个时刻之后的所有改动（之后的注册、存档、交易都会没有），所以要先发公告。数据库恢复以后，`schema_migrations` 也回到那个时刻：如果 Worker 还是新版，它会在下一次请求时把迁移再跑一遍。想停在旧结构上，要先按「回滚」处理 Worker。

### 从导出文件恢复

**不要直接导进生产库**，先导进一个空库确认没问题：

1. 建一个空库：
```
npx wrangler d1 create renying-db-restore
```
2. 导入备份（换成实际的备份文件名）：
```
npx wrangler d1 execute renying-db-restore --remote --file=backup-20261028-0900.sql
```
3. 核对账号数和最近的存档时间：
```
npx wrangler d1 execute renying-db-restore --remote --command "SELECT count(*) AS users, max(updated_at) AS last_save FROM users"
```
4. 确认没问题后，把 `cloudflare/wrangler.toml` 生产段的 `database_id` 换成新库的 id，再按「每次部署 Worker」部署。旧库先留几天再删。

## 恢复演练

计划里要求按本文件做一次，以后数据库有大改动时再做：

1. 在 staging 注册两个测试账号，存档、开几个箱子、挂一单市场。
2. 按「手动导出」导出 staging 数据库（库名换成 `renying-db-staging`，加 `--env staging`）。
3. 在管理后台删除其中一个账号，或者改掉它的墨锭。
4. 按「恢复到某个时间点」把 staging 恢复到第 3 步以前。
5. 确认两个账号的墨锭、饰品、存档、挂单都和第 1 步一样。
6. 把日期、用时和遇到的问题记在下面。

| 日期 | 谁做的 | 用时 | 结果和问题 |
| :--- | :--- | :--- | :--- |
| | | | |

## 测试和检查

| 命令 | 测什么 |
| :--- | :--- |
| `node tools/predeploy-check.mjs` | 部署前检查：wrangler.toml、迁移文件编号、管理后台 CSP、接口冒烟测试 |
| `node tools/econ-test.mjs` | 经济全套，也包括迁移：空库和老库各跑一遍，结果要和 `cloudflare/schema.sql` 一样；同时跑不重复；出错整个退回 |
| `node tools/sync-test.mjs` | 真 Worker 加多台设备的云存档合并 |

完整的测试矩阵见 README 的 Test Matrix。

## 出事时找谁

| 情况 | 先做什么 | 交给谁 |
| :--- | :--- | :--- |
| `/api/health` 不通 | 看 Cloudflare 后台 Workers → renying → Logs | Even |
| 大量玩家登录失败或存档丢失 | 按「回滚」的顺序处理，不要直接退回旧 Worker | Even + 开发线程 |
| 管理口令泄露 | 马上 `npx wrangler secret put ADMIN_SECRET` 换新口令，再查操作记录 | Even |
| CI 的部署前检查失败 | 不部署，把报错交给开发线程 | LnT |
