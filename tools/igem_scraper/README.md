# iGEM 数据采集器

Python + SQLAlchemy 实现的 iGEM 公开数据采集管线。它负责读取竞赛、队伍、公开成员名单、奖项定义和逐队获奖 / 提名 / 奖牌结果，写入 PostgreSQL 或 SQLite，再导出前端使用的静态 JSON 快照。

## 环境准备

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r tools/igem_scraper/requirements.txt
Copy-Item tools/igem_scraper/.env.example tools/igem_scraper/.env
```

`.env` 至少需要 `DATABASE_URL`。本地验证可使用：

```dotenv
DATABASE_URL=sqlite:///data/igem_full.db
```

相对 SQLite 路径固定以 `tools/igem_scraper/` 为基准，因此从仓库根目录或采集器目录执行命令都会使用同一个数据库，不会因当前工作目录改变而误建新库。

生产数据建议使用 PostgreSQL。不要提交 `.env` 或数据库文件。

## 采集流程

所有命令均从仓库根目录运行：

```powershell
# 建表
python tools/igem_scraper/cli.py init-db

# 同步竞赛年份和 UUID
python tools/igem_scraper/cli.py fetch-competitions

# 采集单年。archived 年份默认断点续跑；live 年份始终刷新
python tools/igem_scraper/cli.py fetch-teams 2025 --concurrency 4

# 小批量验证
python tools/igem_scraper/cli.py fetch-teams 2025 --limit 10 --concurrency 2

# 采集全部赛事；live 年份不会因既有完成标记而被永久跳过
python tools/igem_scraper/cli.py fetch-all --start-year 2004 --end-year 2026 --concurrency 10

# 重新计算队伍成员统计
python tools/igem_scraper/cli.py compute-stats

# 角色映射规则更新后，离线重算名单角色与队伍统计
python tools/igem_scraper/cli.py repair-roles

# 单独刷新所有年度的奖项定义（也会自动执行旧奖项主键迁移）
python tools/igem_scraper/cli.py fetch-awards

# 导出前端快照
python tools/igem_scraper/cli.py export-raw \
  --out public/data/igem.json

# 发布前门禁；缺失阶段、过期 live 数据、未知状态、错误角色或引用错误均返回非零
python tools/igem_scraper/cli.py validate --export public/data/igem.json

# CI 可独立校验发布 JSON，不需要分发工作数据库
python tools/igem_scraper/cli.py validate-export public/data/igem.json
```

采集器遵守 `REQUESTS_PER_SECOND`、超时和重试配置。`--concurrency` 只限制并发任务数，不能替代请求速率控制。

逐队名单、获奖结果和机构详情采用“成功响应后事务性替换”：只有官方请求成功后才删除旧关系并写入新集合；请求失败会保留上一次可用数据并记录分阶段错误。因此，官方删除的成员或奖项不会在下一次成功刷新后继续作为幽灵记录存在。空数组也是有效的权威结果。

角色映射不再把一般 `student` 推断成本科生。只有公开 title 明确包含 undergraduate / bachelor 或 graduate / master / doctoral 等证据时才派生具体教育阶段，否则保留中性的 `Student`。原始 `role_api` 始终随导出保留。

## 导出结构

导出 JSON 包含：

- `teams`：年度队伍及地域、组别、Wiki、公开成员计数；
- `members`：公开成员档案；
- `roster`：成员与队伍的多对多关系；
- `institutions`：队伍公开的机构字段；
- `awards`：当年奖项定义，不等于获奖结果。
- `team_awards`：逐队官方获奖、提名与奖牌关系；
- `competitions`：赛事年份、UUID 和 archived / live 状态；
- `meta.coverage`：每年队伍数、详情 / 名单 / 奖项完成数和错误数。
- `meta.provenance`：官方端点模板、各类记录对应的抓取时间字段和角色规则版本；
- `meta.freshness`：live 年份和发布允许的最大数据年龄；
- `meta.status_policy`：保留 accepted / withdrawn / disqualified 官方状态的解释。
- `meta.export_policy`：默认主视图与隔离审计记录的确定性规则。

每个队伍同时导出 listing、详情、名单和奖项的完成状态及最后成功时间。`generated_at` 仅代表生成文件的时间，不能替代上游抓取时间。

原始归档不会删除 withdrawn、disqualified 或已确认的 Example/Test 记录。每队通过 `export_category` 和 `default_visible` 明确区分：默认产品目录与统计只纳入 accepted 正式记录；隔离记录仍保留在同一导出中，供审计或显式筛选查看。demo/test 只使用窄范围显式名称允许表，不使用可能误伤真实队伍的宽泛子串匹配。

前端在 `src/app/data.ts` 中对这些数组建立只读关系索引。

## 验证

```powershell
Push-Location tools/igem_scraper
..\..\.venv\Scripts\python.exe -m unittest discover -s tests -v
$env:DATABASE_URL = 'sqlite:///data/igem_full.db'
..\..\.venv\Scripts\python.exe cli.py validate --export ..\..\public\data\igem.json
Pop-Location
```

测试覆盖文本规范化、保守角色映射、SQLite 迁移、跨工作目录配置、live freshness、状态门禁，以及 roster / award / detail 的 v1→v2 删除语义。CI 会校验静态快照，但不会联网证明官方端点本身完整；联网同步和领域抽检仍是独立发布条件。
