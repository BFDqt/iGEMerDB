# 架构说明

## 设计目标

1. 真实快照是唯一事实源，页面不生成数据文件中不存在的成绩。
2. 原始数据与 UI 分离，所有关系在一个纯函数中构建，便于测试和替换快照。
3. 生产页面不直连采集接口，不把数据库或密钥暴露给浏览器。
4. 数据缺失是一等状态：`0` 表示确认计数为零，`—` 或提示文本表示没有可靠数据。

## 数据流

```text
api.igem.org / public team data
              │
              ▼
Python scraper ──► PostgreSQL / SQLite
              │
              ▼
   validate + export-raw + validate-export
              │
              ▼
   full audit snapshot /data/igem.json
              │
              ▼
   build_web_data → core + on-demand shards
              │
              ▼
   browser fetch /data/web/core.json
              │
              ▼
   buildDatabase(core) pure function
      │        │         │          │
      ▼        ▼         ▼          ▼
    teams    people   institutions results
      └────────── relations ──────────┘
              │
              ▼
       React read-only views
              │
              ├── team detail → one team roster bucket
              ├── person detail → one person bucket
              └── people/search → compact people index on demand
```

## 领域模型

- `Team`：保留队伍 ID、年份、地域、组别和来源字段；关联公开名单与机构。
- `Person`：以官方 member UUID 为主键；关联一个或多个 `Membership`。
- `Membership`：成员、队伍、年份、官方原始角色与有证据的派生角色关系。成员当前公开机构和职务不冒充参赛年度历史快照。
- `Institution`：以官方机构 ID 和国家上下文为主键候选；成员当前 affiliation 不会自动生成历史队伍—机构关系。
- `RawAward`：逐年奖项定义，不代表任何队伍获得该奖。
- `TeamAward`：官方逐队接口返回的获奖、提名或奖牌关系，关联到 `Team`。
- `Competition` / `RawCoverage`：赛事状态与每个采集阶段的完成计数。

`src/main.tsx` 只读取核心目录，再调用 `buildDatabase` 建立 `Map` 索引；详情查询为 O(1)。核心目录包含队伍、赛事、机构和奖项关系，但不包含 10 万级名单图。队伍详情和成员详情按稳定哈希桶读取需要的公开名单；人员目录和包含成员的全站检索才异步载入紧凑人员索引。完整快照仍作为下载和审计资产发布，但不再是每个入口的启动依赖。

`tools/build_web_data.mjs` 从同一份已校验快照生成核心包、完整紧凑人员包、64 个队伍桶和 256 个成员桶。`tools/validate_web_data.mjs` 校验所有分片的引用与数量守恒，并把核心包的 gzip 上限固定为 512,000 字节，防止数据增长重新拖垮首屏。

## 机构归一化

机构名称只做 Unicode、空白和大小写层面的保守标准化；不删除 `University/of/the`，不排序词项，也不做模糊编辑距离合并。官方 ID 不同或国家不同的机构不会自动合并。成员档案中的机构字符串只属于当前个人资料，不会升级为官方机构实体，也不会附到其全部历史队伍。

## 增量同步语义

每次同步某一年时，先把该年的 `Team.is_listed` 重置为 false，再仅对官方当前清单返回的队伍设为 true。对一次成功返回的队伍详情、名单和奖项，数据库在同一事务中执行精确 replace-set：上游已经移除的关系会被删除，而不是永久残留。进行中赛季不会因为旧的 resume 标记而停止刷新。失败请求保留上一份成功数据并记录错误，避免把网络失败误当成官方空集合。

原始 `student` 只推出中性 `Student`；`Undergrad` 和 `Graduate` 必须有公开 title 中的明确学历证据。角色规则版本和来源端点写入导出 provenance。

## 前端边界

- `components/` 只包含可复用交互和结构；
- `pages/` 负责 URL 状态、筛选和页面组合；
- `data.ts` 不依赖 React；
- `format.ts` 不改变数据含义，只负责展示；
- CSS 设计令牌集中在 `:root`，页面不使用运行时 CSS-in-JS。

## 交付门禁

- `npm run check`：ESLint、严格 TypeScript、Vitest 与生产构建；
- `npm run test:scraper`：采集、迁移、角色推断和数据门禁单元测试；
- `npm run validate:data`：独立验证发布 JSON 的覆盖率、唯一性和跨实体引用；
- `npm run validate:web-data`：验证核心包体积、完整人员包和全部哈希桶的守恒；
- `tools/e2e/smoke.py`：真实 Chromium 中验证关键路径、控制台、移动导航与横向溢出；
- GitHub Actions 在 pull request 和 push 上复现以上检查，部署工作流必须先通过同一发布门禁。

## 安全与隐私

- 不提交 `.env`、数据库和 Python 缓存；
- 生产只发布导出的 JSON，不发布 SQLite 数据库；
- 只展示来源中已经公开的成员字段，并把当前公开资料与历史参赛事实分开；
- 站内提供数据纠错、隐私和移除说明；每条队伍事实链接到对应官方详情、名单或奖项端点；
- 外链使用 `noopener noreferrer`；
- Netlify 配置限制 frame、MIME 嗅探、权限 API 和跨来源 referrer；
- 没有用户输入持久化、账号系统或任意代码执行入口。
