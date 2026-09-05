# 测试与交付

测试只证明被断言的条件成立，不单独代表产品合格。本项目采用四层证据：领域与采集单元测试、生产数据门禁、真实 Chromium 自动化、人工截图与交互复核。

## 自动化门禁

`npm run check:all` 顺序执行：

1. ESLint 与严格 TypeScript；
2. Vitest / Testing Library；
3. 分片数据重建与 Vite 生产构建；
4. Python 采集器与刷新语义测试；
5. 完整发布快照及 Web 分片校验。

2026-09-06 本地最终结果（刷新 2026 live 数据后的完整重跑）：

| 门禁                            |                     结果 |
| ------------------------------- | -----------------------: |
| 前端测试                        |   5 个文件，23 / 23 通过 |
| 采集器测试                      |             22 / 22 通过 |
| TypeScript / ESLint             |              通过 / 通过 |
| 生产 JSON 引用、状态、freshness |                     通过 |
| Web 分片引用与数量守恒          |                     通过 |
| Vite 生产构建                   |  1,599 modules，约 4 秒 |
| 入口 JS                         | 259.87 kB；gzip 79.92 kB |
| CSS                             |  59.03 kB；gzip 11.04 kB |

关键回归覆盖：

- roster / award / detail v1→v2 删除上游已移除关系；
- 请求失败保留最后一次成功集合，live 年份禁用旧 resume；
- accepted 默认发布、withdrawn / disqualified 显式审计；
- 无证据 student 保持中性，Undergrad / Graduate 需要 title 证据；
- 官方机构保守归一化，Miami / Newcastle 不误合并；
- unknown 分类守恒，成员当前档案不伪造历史事实；
- SearchDialog 模态语义、焦点闭环、Esc 关闭与回焦；
- 核心数据、完整人员包和 320 个哈希分片的引用与数量守恒。

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
- [x] 前端 23 项与采集器 22 项测试全部通过；
- [x] 完整快照与 Web 分片校验通过；
- [x] 默认目录 5,280 条，显式 all 5,518 条，withdrawn 191 条浏览器复验通过（2026-09-06）；
- [x] Chromium 主路径、移动导航、焦点和视觉底线通过；
- [x] `dist/` 包含 SPA 入口、带 hash 的资源、完整审计快照和按需分片；
- [x] GitHub Actions 配置为上传质量门禁产生的精确 SHA artifact；
- [x] 部署配置为双区域 staging、原子 current 切换、健康检查与失败回滚；
- [x] 远端 Quality Gate 已于 2026-09-06 在公开镜像仓库 `BFDqt/iGEMerDB` 实际运行并通过（干净 checkout：前端 check、采集器测试、发布快照校验、Chromium e2e 全绿，产物 `production-dist-<sha>` 已上传）。上游 `OIerDb-ng/OIerDb` 为无写权限的第三方活跃项目，交付以镜像仓库为准；
- [ ] Tokyo / Hong Kong 的真实部署与回滚演练需要服务器密钥和生产权限；镜像仓库未配置 `production` 环境，deploy 工作流已被禁用（`gh workflow enable deploy.yml` + 配置密钥后可启用）；
- [ ] 2004–2007 历史奖项需要多来源补录，当前产品保持 Preview 标识。

## 2.0.0-beta.1 交付物

- 文件：`output/igemerdb-2.0.0-beta.1.zip`（`dist/` 生产产物，337 个文件）
- 大小：21,393,893 bytes
- SHA-256：`8E6F635EB38D0610545E2EC80F8A9636CB4FBBAC91C7F7023A38AF6E35DBE7EF`
- 打包时间：2026-09-06，对应本文件上方记录的全部本地门禁与浏览器验收结果。
