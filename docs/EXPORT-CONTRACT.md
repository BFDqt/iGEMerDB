# 导出数据契约（EXPORT CONTRACT）

`public/data/igem.json` 与 `public/data/web/` 是本产品的数据公共 API：官方消费方是
`src/app/data.ts` 与 `src/app/dataBundles.ts`，任何研究者也可以直接下载使用。
本文件是字段字典与演进规则；schema 变更必须先改这里。

## 版本策略

- `meta.schema_version` 标识完整快照的结构版本。**当前：3。**
- 历史版本：v1/v2 把所有 `student` 角色推断为本科生、无 `export_category`；
  v3 引入 `export_category`/`default_visible`、provenance 与 replace-set 时间戳。
- bump 到新版本的检查单：①导出器（export_raw.py）写入新结构；②`validate.py`
  的版本校验改为兼容区间并补新断言；③前端消费方（data.ts 的 v<3 回退分支）
  更新；④本文件登记变更条目。**不允许在前端保留"未知版本回退"却不同步登记。**
- 阶段 2 历史奖项补录入场约定（预留）：`team_awards[].source`（来源 URL）+
  `meta.data_sources[]`（来源清单与解析器版本），伴随 schema_version=4；
  未 bump 前不得混入非 API 来源的记录。

## igem.json 顶层结构

| 键 | 类型 | 说明 |
| --- | --- | --- |
| `meta` | object | schema_version / generated_at / source / provenance / freshness / status_policy / export_policy / coverage（见下） |
| `competitions` | array | `{uuid, year, wiki_slug, status(archived\|live), fetched_at}` |
| `institutions` | array | `{id, name, country, city}` — id 为官方 ID 或"国家:规范名"回退 |
| `teams` | array | 全部 raw 队伍（含隔离记录），见下 |
| `members` | array | 出现在已发布名单中的成员档案 |
| `roster` | array | `{team_id, member_uuid, role_api, role_inferred, is_student, snapshot_institution, snapshot_title}` |
| `awards` | array | 当年奖项**定义**目录（不等于获奖结果） |
| `team_awards` | array | 逐队官方奖项结果（见枚举） |

## 关键枚举（封闭值域，实测值）

- `teams[].status`：`accepted` / `withdrawn` / `disqualified`（官方原值保留）
- `teams[].export_category`：`accepted` / `withdrawn` / `disqualified` / `demo-test` / `review`
  （发布策略投影；默认视图只含 accepted）
- `teams[].medal`：`gold` / `silver` / `bronze` / `''`（未获奖为空）
- `team_awards[].decision`：`winner`（5,292）/ `nominee`（2,225）。
  **统计"获奖"必须用 `decision == 'winner'`**——42% 的记录是提名。
- `team_awards[].award_type`：`medal` / `special` / `village` / `grand-prize` /
  `finalist` / `community`；奖牌 = `award_type == 'medal'` 且 `decision == 'winner'`
- `team_awards[].group`：`null`（大多数）/ `undergrad` / `overgrad` / `high-school` 等
  （仅组别奖项有意义，null 表示"不分组"）
- `roster[].role_inferred`：`Student` / `Undergrad` / `Graduate` / `PI` / `Advisor` / `Other`
  （Student 为中性派生；Undergrad/Graduate 必须有公开 title 证据）

## 空值约定（现状，第三方注意）

历史上未统一：同一记录内 `affiliation=null` 但 `institution=""` 很常见。
**判断"缺失"请同时容错 null 与空串**（`x or '-'` 与 `if x is None` 会得到不同结果）。
导出器未做归一以免破坏既有消费方；这是已登记的 hygiene 债。

## web 分片（public/data/web/）

| 文件 | 说明 |
| --- | --- |
| `manifest.json` | `{generated_at, source_schema_version, bundle_schema_version, entity_counts, buckets, paths}` — **分片契约的声明处** |
| `core.json` | 首屏目录（结构与 igem.json 相同，members/roster 为空占位） |
| `people.json` | 完整人员索引（紧凑元组编码，见下） |
| `team/<bucket>.json`、`person/<bucket>.json` | 稳定名分片（bucket = FNV-1a(id) % 64/256，两位十六进制文件名） |

- 紧凑元组：人员为 8 元组 `[uuid, name, username, institution, title,
  affiliation, country, igem_since]`；名单行为 `[team_id, person_index, year,
  role_inferred, role_api, is_student]`（person_index 越界的行静默丢弃）。
- 前端启动时读取 manifest 并校验 bucket 布局与 entity_counts 与 core.json 一致，
  不一致直接报错（防布局漂移静默吞数据）。
- 缓存：分片为稳定文件名 + `max-age=3600, stale-while-revalidate=86400`。
  数据刷新后最长约 25 小时内可能出现"新 core + 旧缓存分片"的代次混用窗口；
  已登记为已知问题，长期方案是分片路径携带快照代次。

## 变更纪律

1. 先改本文件（契约先行），再改导出器与校验器；
2. `schema_version` 不变的结构变更必须是纯增量（新增可选字段）；
3. 每次发布由 `validate:data` + `validate:web-data` + 前端测试三重把关。
