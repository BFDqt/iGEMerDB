# 测试与交付

测试只证明被断言的条件成立，不单独代表产品合格。本项目采用四层证据：领域与采集单元测试、生产数据门禁、真实 Chromium 自动化、人工截图与交互复核。

## 自动化门禁

`npm run check:all` 顺序执行：

1. ESLint 与严格 TypeScript；
2. Vitest / Testing Library（`npm run test:coverage` 另带覆盖率阈值门禁）；
3. 分片数据重建与 Vite 生产构建；
4. Python 采集器与刷新语义测试；
5. 完整发布快照及 Web 分片校验。

CI 的 Quality Gate 在此之外还运行三个真实浏览器验收脚本（smoke、
premium UI、弱网 release acceptance）与严格 axe 无障碍扫描
（11 条路由 × 1440/390 视口，任何违规即失败）。

2026-09-06 测试面扩展后的本地结果：

| 门禁                            |                          结果 |
| ------------------------------- | ----------------------------: |
| 前端测试                        |  12 个文件，75 / 75 通过      |
| 前端覆盖率                      | 95.9% lines / 78.2% branches |
| 采集器测试                      |                50 / 50 通过   |
| TypeScript / ESLint             |                   通过 / 通过 |
| 生产 JSON 引用、状态、freshness |                          通过 |
| Web 分片引用与数量守恒          |                          通过 |
| Vite 生产构建                   |        1,599 modules，约 4 秒 |
| axe 严格扫描                    |         22 个扫描，0 违规     |

关键回归覆盖：

- roster / award / detail v1→v2 删除上游已移除关系；
- 请求失败保留最后一次成功集合，live 年份禁用旧 resume；
- accepted 默认发布、withdrawn / disqualified 显式审计；
- 无证据 student 保持中性，Undergrad / Graduate 需要 title 证据；
- 官方机构保守归一化，Miami / Newcastle 不误合并；
- unknown 分类守恒，成员当前档案不伪造历史事实；
- SearchDialog 模态语义、焦点闭环、Esc 关闭与回焦；
- 核心数据、完整人员包和 320 个哈希分片的引用与数量守恒；
- 分片加载运行时：FNV 哈希分桶、紧凑元组展开、失败与重试路径；
- 导出投影：隔离类别保留、未收录队伍裁剪、原子写入；
- 机构目录计数与页面级筛选、翻页和空结果语义。

## 真实浏览器验收

基础端到端脚本 `tools/e2e/smoke.py` 验证首页真实计数、URL 筛选、全站搜索、Aachen 奖项详情、soft 404、移动导航、控制台和横向溢出。2026-09-06 最终运行通过，本机未降速首页进入可交互状态为 707 ms。

高级 UI 脚本 `tools/e2e/premium_ui_smoke.py` 验证原生 dialog、焦点约束、关闭回焦、默认 accepted 状态、详情页两列移动事实、方法页宽表和字体下限。结果：

- 首页、队伍、About 和移动详情的元信息低于 12 px：0；
- `p` / `td` / `li` 正文低于 14 px：0；
- console error / page error：0；
- 390 px 页面级横向溢出：0；About 数据表在自身可滚动区域内横向展示。

生产式验收脚本 `tools/e2e/release_acceptance.py` 通过自带 gzip SPA 服务器运行，并模拟 512 KiB/s 下载、256 KiB/s 上传、150 ms 延迟、4 倍 CPU 降速。2026-09-06 结果：

| 冷入口          | 可见主标题 | 浏览器实际传输                        |
| --------------- | ---------: | ------------------------------------ |
| 首页            |   2,473 ms | core 432,314 bytes gzip              |
| Aachen 队伍详情 |   3,768 ms | core + 队伍分片 77,556 bytes gzip    |
| 完整人员目录    |  14,004 ms | core + people 3,804,993 bytes gzip   |

三个入口都没有请求 `/data/igem.json`。机构目录计数断言由 core.json 按前端同一实体规则推导，不再硬编码快照数值。人员目录仍是明确的性能债，不将其包装成“已经优化完成”；它已被隔离为按需重载路由，不再拖慢首页、队伍目录和详情。

## 浏览器与人工验收矩阵

| 场景                        |            1440 |   1024 |    768 |             390 |
| --------------------------- | --------------: | -----: | -----: | --------------: |
| 首页信息层级                | 自动 + 人工截图 | 无溢出 | 无溢出 | 自动 + 人工截图 |
| 队伍默认 / raw 状态         | 自动 + 人工截图 | 无溢出 | 无溢出 |            自动 |
| 队伍详情、名单、奖项、来源  | 自动 + 人工截图 |      — |      — | 自动 + 人工截图 |
| 机构名称索引与质量提示      | 自动 + 人工截图 |      — |      — |               — |
| 年度 unknown 与名单条目口径 | 自动 + 人工截图 |      — |      — |               — |
| 方法、隐私与逐年覆盖        | 自动 + 人工截图 |      — |      — | 自动 + 人工截图 |
| 全站搜索与键盘焦点          | 自动 + 人工截图 |      — |      — |            自动 |
| soft 404                    |            自动 |      — |      — |               — |

机器可读证据：`output/final-product/release-evidence.json`、`output/ui-premium/browser-evidence.json`。人工截图位于 `output/final-product/` 与 `output/ui-premium/`。

## 发布前清单

- [x] 锁文件、Node / npm engine 与生产构建可复现；
- [x] 前端 75 项与采集器 50 项测试全部通过（计数以 CI 输出为准）；
- [x] 完整快照与 Web 分片校验通过；
- [x] 默认目录 5,280 条，显式 all 5,518 条，withdrawn 191 条浏览器复验通过（2026-09-06）；
- [x] Chromium 主路径、移动导航、焦点和视觉底线通过；
- [x] axe 严格模式（全路由 × 双视口）零违规；发现的 4 类真实问题
  （移动端检索按钮无可访问名称、--muted/--signal/CTA 对比度）已修复；
- [x] `dist/` 包含 SPA 入口、带 hash 的资源、完整审计快照和按需分片；
- [x] GitHub Actions 配置为上传质量门禁产生的精确 SHA artifact；
- [x] 部署配置为双区域 staging、原子 current 切换、健康检查与失败回滚；
- [x] 远端 Quality Gate 已于 2026-09-06 在公开镜像仓库 `BFDqt/iGEMerDB` 实际运行并通过（干净 checkout：前端 check、采集器测试、发布快照校验、Chromium e2e 全绿，产物 `production-dist-<sha>` 已上传）。上游 `OIerDb-ng/OIerDb` 为无写权限的第三方活跃项目，交付以镜像仓库为准；
- [ ] Tokyo / Hong Kong 的真实部署与回滚演练需要服务器密钥和生产权限；镜像仓库未配置 `production` 环境，deploy 工作流已被禁用（`gh workflow enable deploy.yml` + 配置密钥后可启用）；
- [x] 阶段 1 可重放管线：每个上游响应 gzip 存档（run 1：1,294 条），`cli.py replay` 可重放任意展示记录的来源响应；PR 流水线以 `--ignore-stale-live` 降级新鲜度检查，默认分支推送仍强制 48 小时门禁；
- [ ] 2004–2007 历史奖项需要多来源补录，当前产品保持 Preview 标识。

## 2.0.0-beta.1 交付物

- 文件：`igemerdb-2.0.0-beta.1.zip`（`dist/` 生产产物，337 个文件），随 GitHub
  Release `v2.0.0-beta.1` 发布。注意：GitHub Pages 由同一 commit 以子路径
  base（`/iGEMerDB/`）重新构建部署，资源路径与 zip 内的根路径构建不同——
  两者经由同一门禁验证，但不是同一份文件。
- 大小：21,425,409 bytes
- SHA-256：`42EF002E393ECC0F75C749FE2002E1ACBEF42177EAC109745321BB5AADECF35C`
- 打包时间：2026-09-09，对应 2026-09-08 刷新的 live 快照（5,280 支默认可见队伍、
  81,823 位公开成员）与全部本地门禁、浏览器验收、严格 axe 扫描及远端 Quality Gate 结果。
