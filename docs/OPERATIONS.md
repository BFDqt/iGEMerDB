# 运维手册（OPERATIONS）

发布通道与操作事实。与 README 的关系：README 是能力概览，本文件是可执行步骤。

## 通道矩阵

| 通道      | 触发                                        | 产物来源                          | 状态               |
| --------- | ------------------------------------------- | --------------------------------- | ------------------ |
| GitHub Pages | Quality Gate 在 master 成功后自动部署     | 按 `workflow_run.head_sha` 现场构建（含 `build:data`，子路径 base `/iGEMerDB/`） | **当前生产通道**   |
| Netlify   | 连接仓库后按 `netlify.toml` 构建            | 现场构建（build:data + vite build + 分片校验） | 备用，未连接       |
| SSH 双区域 | Quality Gate 成功后经 `deploy.yml`         | 下载 Gate 上传的 `production-dist-<sha>` artifact | **已实现、禁用中**（需 `production` 环境密钥与一次真实演练） |

## 日常发布（Pages，自动）

1. 推送 master → Quality Gate 运行（lint/tsc/75 前端测试/覆盖率阈值/50 采集器测试/快照校验/三个浏览器套件/axe 严格扫描）。
2. Gate 成功 → Pages 工作流按同一 `head_sha` 构建并发布。
3. 验证：`curl https://bfdqt.github.io/iGEMerDB/data/web/manifest.json` 的
   `generated_at` 应等于本次快照的生成时间。

## 数据刷新（每次重新发布前，live 赛季期间）

```powershell
.venv/Scripts/python.exe tools/igem_scraper/cli.py fetch-competitions
.venv/Scripts/python.exe tools/igem_scraper/cli.py fetch-teams 2026 --concurrency 4
.venv/Scripts/python.exe tools/igem_scraper/cli.py compute-stats
.venv/Scripts/python.exe tools/igem_scraper/cli.py export-raw --out public/data/igem.json
.venv/Scripts/python.exe tools/igem_scraper/cli.py validate --export public/data/igem.json
.venv/Scripts/python.exe .tmp/regen_dataset.py   # 重生成 docs/DATASET.md
npm run build:data && npm run validate:web-data
npm run check:all
```

48 小时 freshness 门禁：快照超过窗口后 master 的 CI 会红；PR 流水线自动
降级（`--ignore-stale-live`），因此**贡献者无需刷新数据，维护者在推送
master 前刷新即可**。

## 归档巡检与重放

```powershell
.venv/Scripts/python.exe tools/igem_scraper/cli.py runs            # 最近 run 列表
.venv/Scripts/python.exe tools/igem_scraper/cli.py replay team_roster --team-id <id>
```

run 出现 `failed` 表示该次同步中途异常，其归档数据不完整，不能作为溯源依据。

## SSH 双区域启用清单（待办）

1. GitHub 仓库创建 `production` 环境（建议配置 reviewer 保护）。
2. 配置 secrets：`REMOTE_HOST`、`REMOTE_HOST_2`、`REMOTE_USER`、
   `SSH_PRIVATE_KEY`、`REMOTE_PATH`、`PUBLIC_URL`、`PUBLIC_URL_2`。
3. `gh workflow enable deploy.yml`。
4. 先在 staging 单区演练：手动触发一次失败注入（改错健康检查 URL），
   确认回滚到 `releases/<previous>` 生效。
5. 服务器站点根目录指向 `<REMOTE_PATH>/current`。

## 手动回滚（SSH 通道）

```bash
# 在两台服务器上执行；<sha> 为上一个通过验证的发布
ln -sfn <REMOTE_PATH>/releases/<sha> <REMOTE_PATH>/current
curl -s <PUBLIC_URL>/.release   # 必须输出 <sha>
```

自动回滚只在 workflow 失败时触发；"健康检查通过但内容有错"必须手动回滚。

## 已知问题登记

- react-router 6.30.6 有 2 条 moderate 通告（CVE-2025-68470 绕过变体 +
  SSR deserializeErrors 注入）：本产品为纯 SPA，不使用 SSR 错误反序列化，
  也不存在 URL 驱动的外部重定向，攻击面不可达；升级需迁移 react-router 7。
- eslint-plugin-react 7.37.x 不支持 eslint 10（context API 崩溃），lint 固定
  在 eslint 9.39 并以 `.npmrc` 移除后的显式版本约束运行；待上游发版后升级。
- 本地 Windows 开发：4093–4192 等端口段可能被系统排除（重启后漂移），
  preview/e2e 端口冲突时先查
  `netsh interface ipv4 show excludedportrange protocol=tcp`。
- 归档保留：`cli.py runs --prune <N>` 每个 kind 只保留最近 N 个 run 及其
  响应，建议随数据刷新周期性执行（每次全量刷新约新增 1,300 条响应）。
- 导出内存：export-raw 当前全量载入后一次性序列化，数据持续增长时需改造
  为流式写出（已登记，非近期风险）。
