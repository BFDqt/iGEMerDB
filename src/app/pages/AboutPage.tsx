import {
  ArrowUpRight,
  Check,
  Database,
  FileJson,
  MoveHorizontal,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { database } from '../data';
import { PageHeader, useDocumentTitle } from '../components/PageElements';

export function AboutPage() {
  useDocumentTitle('关于与方法');
  return (
    <div className="page-container about-page">
      <PageHeader
        kicker="ABOUT / METHODOLOGY"
        title="数据范围、方法与边界"
        description="一个可信的资料库不仅要告诉你它有什么，也应该清楚说明它缺什么。"
        action={
          <span className="record-count status-label">PUBLIC PREVIEW</span>
        }
      />

      <section className="about-intro">
        <div>
          <span className="kicker">THE PROJECT</span>
          <h2>iGEMerDB 是什么</h2>
        </div>
        <div>
          <p>
            iGEMerDB 是面向 iGEM
            公开竞赛资料的独立索引，目标是帮助参赛者、研究者与社区成员更快找到队伍、公开成员、机构和奖项上下文。
          </p>
          <p>
            本站不隶属于 iGEM
            Foundation，也不对参赛者或机构进行能力排名。页面中的数据来自项目内抓取器生成的本地快照。
          </p>
        </div>
      </section>

      <section className="methodology-section">
        <div className="section-heading">
          <div>
            <span className="kicker">PIPELINE</span>
            <h2>数据如何进入页面</h2>
          </div>
          <p>抓取、规范化、导出和展示各自保持清晰边界。</p>
        </div>
        <ol className="pipeline-list">
          <li>
            <span>01</span>
            <Database aria-hidden="true" />
            <div>
              <h3>采集</h3>
              <p>
                抓取器从公开竞赛接口读取赛事、队伍、公开名单、奖项定义与逐队结果。
              </p>
            </div>
          </li>
          <li>
            <span>02</span>
            <RefreshCw aria-hidden="true" />
            <div>
              <h3>规范化</h3>
              <p>保留原始字段，再对名称、角色和跨表标识做可回溯的处理。</p>
            </div>
          </li>
          <li>
            <span>03</span>
            <FileJson aria-hidden="true" />
            <div>
              <h3>静态导出</h3>
              <p>
                从 SQLite 导出前端可读取的 JSON 快照，避免页面直连抓取接口。
              </p>
            </div>
          </li>
          <li>
            <span>04</span>
            <ShieldCheck aria-hidden="true" />
            <div>
              <h3>验证与呈现</h3>
              <p>
                自动校验只是底线；语义正确性、实体消歧与产品可用性仍需人工验收。
              </p>
            </div>
          </li>
        </ol>
      </section>

      <section className="coverage-table-section">
        <div className="panel-heading">
          <span className="kicker">CURRENT SNAPSHOT</span>
          <h2>当前快照规模</h2>
        </div>
        <div className="coverage-table">
          <div>
            <span>队伍目录</span>
            <strong>{database.stats.teamCount.toLocaleString('zh-CN')}</strong>
            <small>
              {database.stats.minYear}–{database.stats.maxYear} 年公开队伍
            </small>
            <Check aria-label="已纳入" />
          </div>
          <div>
            <span>公开成员</span>
            <strong>
              {database.stats.publishedPeopleCount.toLocaleString('zh-CN')}
            </strong>
            <small>来自逐队公开名单，共 {database.stats.yearCount} 届</small>
            <Check aria-label="已纳入" />
          </div>
          <div>
            <span>机构索引</span>
            <strong>
              {database.stats.institutionCount.toLocaleString('zh-CN')}
            </strong>
            <small>仅来自默认可见队伍的官方机构字段</small>
            <Check aria-label="部分覆盖" />
          </div>
          <div>
            <span>队伍奖项结果</span>
            <strong>
              {database.stats.teamAwardCount.toLocaleString('zh-CN')}
            </strong>
            <small>含获奖、提名与奖牌关系</small>
            <Check aria-label="已纳入" />
          </div>
        </div>
      </section>

      <section className="coverage-matrix-section">
        <div className="panel-heading">
          <span className="kicker">YEAR-BY-YEAR COVERAGE</span>
          <h2>逐年请求完成情况</h2>
        </div>
        <p className="table-scroll-hint" id="coverage-scroll-hint">
          <MoveHorizontal aria-hidden="true" />
          窄屏下可横向滑动查看全部列；“完成”表示端点请求已执行，不代表内容经人工核验。
        </p>
        <div
          className="table-wrap"
          role="region"
          aria-label="逐年采集请求完成情况"
          aria-describedby="coverage-scroll-hint"
          tabIndex={0}
        >
          <table className="data-table coverage-matrix">
            <thead>
              <tr>
                <th>年份</th>
                <th>状态</th>
                <th className="numeric">默认队伍</th>
                <th className="numeric">Raw 队伍</th>
                <th className="numeric">详情请求</th>
                <th className="numeric">名单请求</th>
                <th className="numeric">名单有数据</th>
                <th className="numeric">奖项请求</th>
                <th className="numeric">奖项有结果</th>
                <th className="numeric">错误</th>
              </tr>
            </thead>
            <tbody>
              {database.competitions.map((competition) => {
                const coverage = competition.coverage;
                return (
                  <tr key={competition.uuid}>
                    <td>{competition.year}</td>
                    <td>
                      <span className="tag">
                        {competition.status === 'live' ? '进行中' : '已归档'}
                      </span>
                    </td>
                    <td className="numeric">{competition.teams.length}</td>
                    <td className="numeric">
                      {coverage?.team_count ??
                        database.rawTeams.filter(
                          (team) => team.year === competition.year,
                        ).length}
                    </td>
                    <td className="numeric">
                      {coverage?.detail_fetched_count ?? '—'}
                    </td>
                    <td className="numeric">
                      {coverage?.roster_fetched_count ?? '—'}
                    </td>
                    <td className="numeric">
                      {coverage?.teams_with_public_roster ?? '—'}
                    </td>
                    <td className="numeric">
                      {coverage?.awards_fetched_count ?? '—'}
                    </td>
                    <td className="numeric">
                      {coverage?.teams_with_awards ?? '—'}
                    </td>
                    <td className="numeric">
                      {coverage?.fetch_error_count ?? '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="limitations-section">
        <div>
          <span className="kicker">KNOWN LIMITATIONS</span>
          <h2>已知限制</h2>
        </div>
        <ul>
          <li>
            <strong>01</strong>
            <span>
              <b>公开名单不等于所有参与者</b>
              快照只能索引采集时公开端点返回的记录；未公开、已撤回或尚未同步的成员不会出现。
            </span>
          </li>
          <li>
            <strong>02</strong>
            <span>
              <b>机构名称可能存在别名</b>
              目录只使用官方队伍机构字段并保留其显式 ID；缺少可靠 ID
              时采用保守匹配，因此别名可能分开，但不做跨国家或词序重排式的危险自动合并。
            </span>
          </li>
          <li>
            <strong>03</strong>
            <span>
              <b>进行中赛季会变化</b>
              {database.stats.maxYear} 年仍为 live
              状态；官方发生变化后，需要重新生成快照才会在本站反映。
            </span>
          </li>
          <li>
            <strong>04</strong>
            <span>
              <b>快照不是永久真相</b>
              官方接口可能修订或撤回记录；本站显示采集时点，不替代 iGEM
              官方档案。
            </span>
          </li>
        </ul>
      </section>

      <section className="privacy-section" id="privacy-corrections">
        <div>
          <span className="kicker">PRIVACY / CORRECTIONS</span>
          <h2>隐私、纠错与撤回</h2>
        </div>
        <div className="privacy-copy">
          <ShieldCheck aria-hidden="true" />
          <div>
            <p>
              本站索引公开竞赛资料，但“来自公开页面”不等于不需要治理。如记录存在身份归属错误、过时信息，或当事人希望撤回展示，请提交纠错请求。
            </p>
            <p>
              请附上记录链接、需要修正或撤回的字段及可供核验的官方依据；不要在公开
              Issue 中提交额外的敏感个人信息。
            </p>
            <a
              className="button-link secondary"
              href="https://github.com/OIerDb-ng/OIerDb/issues/new?labels=data-correction&title=%5BData%20correction%5D%20"
              target="_blank"
              rel="noreferrer noopener"
            >
              提交数据纠错 <ArrowUpRight aria-hidden="true" />
            </a>
          </div>
        </div>
      </section>

      <section className="source-links">
        <div>
          <span className="kicker">SOURCE & LICENSE</span>
          <h2>来源与许可</h2>
        </div>
        <div>
          <a href="https://igem.org" target="_blank" rel="noreferrer noopener">
            iGEM 官方网站 <ArrowUpRight aria-hidden="true" />
          </a>
          <a
            href="https://teams.igem.org"
            target="_blank"
            rel="noreferrer noopener"
          >
            iGEM Teams <ArrowUpRight aria-hidden="true" />
          </a>
          <a
            href={database.sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
          >
            iGEM Public API <ArrowUpRight aria-hidden="true" />
          </a>
          <p>
            快照生成时间：
            {database.generatedAt
              ? new Date(database.generatedAt).toLocaleString('zh-CN')
              : '未记录'}
            。项目代码延续 AGPL-3.0 许可。
          </p>
        </div>
      </section>

      <div className="about-cta">
        <span>READY TO EXPLORE?</span>
        <h2>
          浏览 {database.stats.teamCount.toLocaleString('zh-CN')} 支历史队伍
        </h2>
        <Link className="button-link" to="/teams">
          打开队伍目录
        </Link>
      </div>
    </div>
  );
}
