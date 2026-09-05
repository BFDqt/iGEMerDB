# iGEMerDB

iGEM 队伍、公开成员、机构与奖项资料的可检索索引。

本次重构将旧 OIerDb 前端和无法运行的 iGEM 示例层完全移出运行路径，以抓取器导出的真实快照为单一事实源。产品不再生成缺乏依据的“评分”或“排名”，缺失数据会在界面中明确标注。

当前快照生成于 2026-09-06，覆盖 2004–2026 共 23 届赛事。原始审计层保留 5,518 支队伍，其中 5,280 支 accepted 队伍进入默认产品视图；191 支 withdrawn、28 支 disqualified 和 19 条 Example/Test 记录被明确隔离但不物理删除。快照还保存 81,719 位公开成员、106,345 条原始名单关系和 7,517 条队伍奖项结果。数据来自 [iGEM Public API](https://api.igem.org/v1/competitions?page=1)，名单公开范围遵循 iGEM 的[官方队伍名单说明](https://competition.igem.org/registration/team-roster)。逐年覆盖、例外和校验摘要见 [数据快照报告](docs/DATASET.md)。

## 当前交付

- 2004–2026 全年度队伍目录，支持年份、名称、城市、地区、国家和组别筛选；
- 逐队公开名单，可查看成员的跨年参赛、角色和机构关系；
- 机构名称索引：官方队伍机构以 ID、国家和保守名称规则建立实体；成员当前 affiliation 不会生成历史队伍关系；
- 年度视图：可切换 23 届赛事，查看区域、组别、国家 / 地区和奖牌分布；
- 奖项结果：分别保存奖项定义、获奖、提名和金银铜牌的队伍关系；
- 全站检索、URL 可分享筛选、桌面与移动响应式布局；
- 数据覆盖提示、方法说明、404 和键盘可访问交互；
- TypeScript 严格模式、ESLint、Vitest、Python `unittest` 和生产构建。
- GitHub Actions 质量门禁、无头 Chromium 端到端测试和双节点部署流程。

2026 是进行中的赛季，数据会随官方记录变化；名单只包含官方接口公开的成员。详见站内“关于与方法”和 [架构文档](docs/ARCHITECTURE.md)。

## 本地开发

要求 Node.js 20.19+（或兼容的 22/24）和 npm 10+。

```powershell
npm ci
npm run dev
```

Vite 会输出本地访问地址。浏览器启动只读取压缩后不超过 500 KiB 的 `/data/web/core.json`；队伍和成员详情按稳定哈希桶读取，完整人员索引仅在人员目录或全站检索需要时加载。`public/data/web/` 分片不入库，`predev` / `prebuild` 会从已提交的完整快照自动重建。`/data/igem.json` 作为完整离线审计快照保留，不再阻塞每个入口。浏览器不会在运行时请求数据库或密钥。

## 工程检查

```powershell
# 运行完整交付检查
npm run check

# 前端 + 采集器 + 发布数据完整性
npm run check:all

# 分项执行
npm run lint
npm run typecheck
npm run test
npm run build
```

| 命令                        | 作用                             |
| --------------------------- | -------------------------------- |
| `npm run dev`               | 启动开发服务器                   |
| `npm run test`              | 运行前端领域层与关键路由测试     |
| `npm run test:watch`        | 监听模式运行测试                 |
| `npm run lint`              | 检查新前端源码                   |
| `npm run typecheck`         | 严格 TypeScript 检查             |
| `npm run build`             | 生成 `dist/` 生产产物            |
| `npm run build:data`        | 从完整快照生成核心包与按需分片   |
| `npm run check`             | 顺序执行 lint、类型、测试和构建  |
| `npm run check:all`         | 再执行采集器测试与数据发布门禁   |
| `npm run test:e2e`          | 对已启动的预览站点运行浏览器验收 |
| `npm run validate:web-data` | 校验分片守恒与核心包体积         |

详细计数见 [数据快照报告](docs/DATASET.md)，验证矩阵见 [测试与交付](docs/TESTING.md)，三路审计后的保留 / 重构 / 删除结论见 [重构结论与产品验收](docs/REFACTOR-ACCEPTANCE.md)。

## 目录结构

```text
src/
├── app/
│   ├── components/     # 布局、检索、分页和通用页面元素
│   ├── pages/          # 首页、目录、详情、年度、奖项和方法页
│   ├── data.ts         # 异步载入快照 → 只读关系索引
│   ├── format.ts       # 国家、地区、角色与展示格式
│   └── types.ts        # 原始数据和领域模型
├── main.tsx            # 唯一应用入口
└── styles.css          # 设计令牌、布局与响应式规则

tools/igem_scraper/
├── igem_scraper/       # Python 采集、规范化、存储和导出
├── data/               # 本地 SQLite 工作库（默认不提交）
└── tests/              # 采集器核心单元测试

public/data/
├── igem.json           # 完整、可下载的审计快照
└── web/                # 核心目录、人员索引和按需哈希桶
```

## 更新数据

生产前端读取：

```text
public/data/igem.json
```

更新流程是：采集到新数据库 → `validate` 校验所有年度、状态、freshness 与逐队阶段 → 原子导出完整快照 → `validate-export` 校验发布投影 → `build:data` 生成浏览器分片 → `validate:web-data` 检查守恒与包体 → 执行完整门禁和真实 Chromium 验收。单元测试使用固定 fixture，CI 同时解析生产快照与所有发布分片。具体命令见 [采集器文档](tools/igem_scraper/README.md)。

## 设计说明

界面采用编辑部 / 资料库式网格：米白纸面、墨绿色文本与强调色、直角区块、细分隔线、衬线标题和等宽元数据。实现参考了 [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) 的可访问性与交付检查原则，同时避免渐变、玻璃拟态、过度圆角和模板化 SaaS 卡片。

关键可访问性措施包括：

- 语义化标题、导航、表格、表单标签和原生 `dialog`；
- 全局可见焦点和跳到主内容链接；
- `Ctrl/⌘ + K` 全站检索；
- 支持 `prefers-reduced-motion`；
- 已验收 390px、768px、1024px 和 1440px 断点设计。

## 部署

```powershell
npm ci
npm run check
```

质量工作流会上传已经通过浏览器验收的 `dist/`，部署工作流只下载这一个产物。SSH 发布先把两个区域都写入 `releases/<commit>`，再原子切换 `current` 软链接；激活或健康检查失败时恢复上一版本。服务器站点根目录需要指向配置的 `<REMOTE_PATH>/current`。`netlify.toml` 另包含 SPA 回退、分片缓存和基础安全响应头。

## 许可与声明

项目延续 [AGPL-3.0](LICENSE) 许可。公开部署修改版本时需遵守同等开源义务。

iGEMerDB 是独立社区索引，不隶属于或代表 iGEM Foundation。iGEM 名称及相关标识归其权利人所有。
