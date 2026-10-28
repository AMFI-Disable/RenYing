# D1 迁移

D1 数据库的表结构都写在这里，一个文件一次改动，按编号往后加。

## 怎么跑

不用手动跑。Worker 每个实例第一次收到请求时自己跑：

1. 建 `schema_migrations` 表（`id`、`name`、`sum`、`applied_at`），记着跑过哪些。
2. 把还没跑过的文件按编号一个一个跑。一个文件是一个事务：第一句先往 `schema_migrations` 插这一行，后面才是文件里的 SQL。中途出错整个退回，什么都不改，那次请求报错，下一次请求再试。
3. 两个实例同时跑同一个文件：后到的那个插不进 `schema_migrations`、整个退回，再读一次看到别人跑完了，就接着往下。

迁移文件出现以前就有的库（生产库）也一样：`0001` 全是 `CREATE … IF NOT EXISTS`，表已经有了就跳过；`ALTER TABLE … ADD COLUMN` 遇到以前的 Worker 已经加过的列，也跳过这一句。所以生产库第一次部署这一版时，会把 `0001` ~ `0005` 记上（实际只加 `users.deleted_at` 一列），再跑 `0006` 重建三张表加 CHECK。

`python3 tools/build.py` 把这里的 `.sql` 拆成一句一句，写进 `cloudflare/migrations.gen.js`（`worker.js` 引用它）和 `cloudflare/worker.bundle.js`。这两个是生成的，不要直接改。

**不要用 `npx wrangler d1 migrations apply`。** wrangler 用的是另一张表（`d1_migrations`），不知道 Worker 已经跑过哪些，会从 `0001` 重跑，在 `0002` 的 `ALTER TABLE` 上报“列已经有了”停下来。`wrangler.toml` 里留着 `migrations_dir` 只是给部署前检查（`tools/predeploy-check.mjs`）找这个目录用。

## 加一个迁移

1. 新建下一个编号的文件，比如 `0007_xxx.sql`（小写字母、数字、下划线）。一个文件只做一件事。
2. 每句用分号结尾；字符串里不要写分号（打包时按分号拆句子）。`--` 后面是注释，打包时去掉。
3. 加列用 `ALTER TABLE 表 ADD COLUMN 列 …`。改约束只能重建表：新建 `表_new`、`INSERT … SELECT` 搬数据、`DROP` 旧表、`RENAME`、重建索引，照 `0006` 的写法。**`users` 被 `sessions`、`devices` 用外键指着，D1 默认开着外键，`DROP TABLE users` 会连带删掉所有登录，不要重建它。**
4. 文件末尾用注释写好回滚 SQL。
5. 同步改 `cloudflare/schema.sql`（所有迁移跑完以后的样子），运行 `python3 tools/build.py`，再跑 `node tools/econ-test.mjs`：它会在空库和老库上各跑一遍，核对结果和 `schema.sql` 一样。
6. 跑过的文件不要再改。改了 Worker 不会重跑，只会在日志里提示 `sum` 对不上。

改表之前先导出一次数据库备份，大改动先部署到 staging（`npx wrangler deploy --env staging`）试一遍。部署、备份、恢复和回滚的完整步骤见 `docs/deploy-runbook.md`。

## 现在有的

| 文件 | 做什么 |
| --- | --- |
| `0001_init.sql` | 迁移文件出现以前 Worker 启动时建的所有表和索引 |
| `0002_password_columns.sql` | `users` 加 `password_algo`、`password_updated_at`（密码换成 PBKDF2） |
| `0003_slow_request_timing.sql` | `errs` 加 `ms`、`ms_sum`（慢请求耗时） |
| `0004_session_device.sql` | `sessions` 加 `dev` 和索引（登录属于哪台设备） |
| `0005_account_soft_delete.sql` | `users` 加 `deleted_at` 和索引（删除账号只记时间） |
| `0006_check_constraints.sql` | 重建 `econ`、`mkt`、`sanctions`，加 CHECK（墨锭不为负、挂单状态只有 0/1/2、标价至少 1、记过次数不为负…） |
