# D1 迁移

这里放 D1 数据库的迁移文件，`wrangler.toml` 里的 `migrations_dir` 指向这个目录。

- 文件名按 `0001_说明.sql`、`0002_说明.sql` 这样编号，wrangler 按编号顺序执行，执行过的记在数据库的 `d1_migrations` 表里，不会重复执行。
- 一个文件只做一件事；改表之前先导出一次备份（见 `docs/deploy-runbook.md`）。
- 每个迁移在文件末尾用注释写好回滚 SQL。
- 先在 staging 跑：`npx wrangler d1 migrations apply renying-db-staging --env staging --remote`，没问题再跑生产：`npx wrangler d1 migrations apply renying-db --remote`。

目前还是空的：现在的表由 Worker 启动时建好（`cloudflare/worker.js` 的 `ensureSchema`），以后会改成这里的迁移文件。
