import {
  ArrowUpRight,
  Building2,
  ChevronDown,
  Database,
  UsersRound,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { database } from '../data';
import {
  formatCountry,
  formatRegion,
  formatRole,
  formatSection,
  initials,
} from '../format';
import {
  Breadcrumbs,
  DatasetNotice,
  useDocumentTitle,
} from '../components/PageElements';

const statusLabels: Record<string, string> = {
  accepted: '已接受',
  registered: '已注册',
  withdrawn: '已撤回',
  disqualified: '取消资格',
  pending: '待审核',
};

const organiserLabels: Record<string, string> = {
  'higher-education': '高等教育机构',
  'high-school': '中学',
  community: '社区队伍',
};

function formatRetrievedAt(value: string) {
  if (!value) return '未记录';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN');
}

export function TeamDetailPage() {
  const { teamId } = useParams();
  const team = database.teamById.get(Number(teamId));
  const section = team ? formatSection(team.section).trim() : '';
  const region = team ? formatRegion(team.region).trim() : '';
  const apiBase = database.sourceUrl.replace(/\/$/, '');
  useDocumentTitle(team?.name ?? '队伍未找到');

  if (!team) {
    return (
      <div className="page-container not-found-inline">
        <span className="kicker">404 / TEAM</span>
        <h1>没有找到这支队伍</h1>
        <p>队伍编号“{teamId}”不在当前数据快照中。</p>
        <Link className="button-link" to="/teams">
          返回队伍目录
        </Link>
      </div>
    );
  }

  return (
    <div className="page-container detail-page">
      <Breadcrumbs
        items={[{ label: '队伍', to: '/teams' }, { label: team.name }]}
      />

      <header className="entity-header">
        <div>
          <div className="entity-status-line">
            <span className="kicker">
              TEAM / {team.year} / #{team.id}
            </span>
            <span
              className={`team-status prominent ${team.status || 'unknown'}`}
            >
              {statusLabels[team.status] || team.status || '状态未公开'}
            </span>
          </div>
          <h1>{team.name}</h1>
          <p>
            {[team.city, formatCountry(team.country), region || '区域未公开']
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        {team.wikiUrl && (
          <a
            className="button-link secondary"
            href={team.wikiUrl}
            target="_blank"
            rel="noreferrer noopener"
          >
            访问团队 Wiki <ArrowUpRight aria-hidden="true" />
          </a>
        )}
      </header>

      {team.status && team.status !== 'accepted' && (
        <aside className={`team-status-alert ${team.status}`}>
          <strong>
            {team.status === 'withdrawn'
              ? '该队伍记录已标记为撤回'
              : team.status === 'disqualified'
                ? '该队伍记录已标记为取消资格'
                : `该队伍当前状态：${statusLabels[team.status] || team.status}`}
          </strong>
          <p>
            本页作为档案保留，不应解读为该队伍在当年完成有效参赛。名单与奖项仍依快照中的公开返回值展示。
          </p>
        </aside>
      )}

      <section className="entity-facts five" aria-label="队伍摘要">
        <div>
          <span>参赛年份</span>
          <strong>{team.year}</strong>
        </div>
        <div>
          <span>参赛组别</span>
          <strong>{section || '未公开'}</strong>
        </div>
        <div>
          <span>公开成员记录</span>
          <strong>{team.publishedMemberCount}</strong>
        </div>
        <div>
          <span>机构记录</span>
          <strong>{team.institutions.length || '暂无'}</strong>
        </div>
        <div>
          <span>奖牌</span>
          <strong>{team.medal ? team.medal.toUpperCase() : '未公开'}</strong>
        </div>
      </section>

      <div className="detail-grid">
        <div className="detail-main">
          <section className="content-section">
            <div className="content-section-head">
              <div>
                <span className="kicker">PUBLIC ROSTER</span>
                <h2>公开成员</h2>
              </div>
              <span>{team.memberships.length} 条</span>
            </div>
            {team.memberships.length ? (
              <div className="people-list">
                {team.memberships
                  .slice()
                  .sort((a, b) => a.person.name.localeCompare(b.person.name))
                  .map((membership) => (
                    <Link
                      key={membership.person.id}
                      to={`/people/${membership.person.id}`}
                    >
                      <span className="avatar" aria-hidden="true">
                        {initials(membership.person.name)}
                      </span>
                      <span>
                        <strong>{membership.person.name}</strong>
                        <small>
                          {formatRole(membership.role)}
                          {membership.person.title
                            ? ` · ${membership.person.title}`
                            : ''}
                        </small>
                      </span>
                      <i>查看档案</i>
                    </Link>
                  ))}
              </div>
            ) : (
              <div className="inline-empty">
                <UsersRound aria-hidden="true" />
                <div>
                  <strong>当前没有公开成员记录</strong>
                  <p>这表示抓取快照未覆盖，不等于队伍没有成员。</p>
                </div>
              </div>
            )}
          </section>

          <section className="content-section">
            <div className="content-section-head">
              <div>
                <span className="kicker">OFFICIAL RESULTS</span>
                <h2>奖项结果</h2>
              </div>
              <span>{team.awardResults.length} 条</span>
            </div>
            {team.awardResults.length ? (
              <div className="team-results-list">
                {team.awardResults
                  .slice()
                  .sort(
                    (a, b) =>
                      a.decision.localeCompare(b.decision) ||
                      a.title.localeCompare(b.title),
                  )
                  .map((result) => (
                    <div key={result.awardUuid}>
                      <span>
                        {result.type === 'medal'
                          ? 'MEDAL'
                          : result.type.toUpperCase()}
                      </span>
                      <strong>{result.title}</strong>
                      <small>
                        {result.decision === 'winner' ? '获奖' : '提名'}
                      </small>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="inline-empty">
                <div>
                  <strong>没有公开的奖项结果</strong>
                  <p>
                    {team.year === database.stats.maxYear
                      ? '进行中赛季通常要等赛事结束后公布结果。'
                      : '官方接口没有返回这支队伍的奖项或奖牌记录。'}
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>

        <aside className="detail-aside">
          <section>
            <span className="kicker">LOCATION</span>
            <h2>地域信息</h2>
            <dl className="definition-list">
              <div>
                <dt>城市</dt>
                <dd>{team.city || '未公开'}</dd>
              </div>
              <div>
                <dt>国家 / 地区</dt>
                <dd>{formatCountry(team.country)}</dd>
              </div>
              <div>
                <dt>竞赛区域</dt>
                <dd>{region || '未公开'}</dd>
              </div>
              <div>
                <dt>组织类型</dt>
                <dd>
                  {organiserLabels[team.organiserType] ||
                    team.organiserType ||
                    '未分类'}
                </dd>
              </div>
            </dl>
          </section>

          <section>
            <span className="kicker">INSTITUTIONS</span>
            <h2>关联机构</h2>
            {team.institutions.length ? (
              <ul className="aside-link-list">
                {team.institutions.map((institution) => (
                  <li key={institution.id}>
                    <Building2 aria-hidden="true" />
                    <Link
                      to={`/institutions/${encodeURIComponent(institution.id)}`}
                    >
                      {institution.name}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted-copy">当前快照没有可关联的机构名称。</p>
            )}
          </section>

          <section>
            <span className="kicker">SOURCE FIELDS</span>
            <h2>记录标识</h2>
            <dl className="definition-list mono-values">
              <div>
                <dt>Team ID</dt>
                <dd>{team.id}</dd>
              </div>
              <div>
                <dt>Competition</dt>
                <dd>{team.competitionUuid.slice(0, 8)}…</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{statusLabels[team.status] || team.status || '未公开'}</dd>
              </div>
            </dl>
            <Link className="correction-link" to="/about#privacy-corrections">
              纠错或申请撤回展示
            </Link>
          </section>
        </aside>
      </div>

      <details className="provenance-panel">
        <summary>
          <span className="provenance-summary-icon">
            <Database aria-hidden="true" />
          </span>
          <span>
            <strong>来源与更新</strong>
            <small>核对当前队伍的基础字段、名单与奖项端点</small>
          </span>
          <ChevronDown aria-hidden="true" />
        </summary>
        <div className="provenance-body">
          <p>
            页面展示项目快照中保存的公开竞赛记录。如快照与官方实时端点不一致，以官方记录为准。
          </p>
          <div className="source-link-grid">
            <a
              href={`${apiBase}/teams/${team.id}`}
              target="_blank"
              rel="noreferrer noopener"
            >
              <span>
                <strong>队伍基础字段</strong>
                <small>检索：{formatRetrievedAt(team.detailFetchedAt)}</small>
              </span>
              <ArrowUpRight aria-hidden="true" />
            </a>
            <a
              href={`${apiBase}/teams/${team.id}/roster`}
              target="_blank"
              rel="noreferrer noopener"
            >
              <span>
                <strong>公开名单端点</strong>
                <small>检索：{formatRetrievedAt(team.rosterFetchedAt)}</small>
              </span>
              <ArrowUpRight aria-hidden="true" />
            </a>
            <a
              href={`${apiBase}/teams/${team.id}/awards`}
              target="_blank"
              rel="noreferrer noopener"
            >
              <span>
                <strong>队伍奖项端点</strong>
                <small>检索：{formatRetrievedAt(team.awardsFetchedAt)}</small>
              </span>
              <ArrowUpRight aria-hidden="true" />
            </a>
          </div>
          <dl className="provenance-meta">
            <div>
              <dt>快照生成</dt>
              <dd>
                {database.generatedAt
                  ? new Date(database.generatedAt).toLocaleString('zh-CN')
                  : '未记录'}
              </dd>
            </div>
            <div>
              <dt>队伍记录</dt>
              <dd>Team ID {team.id}</dd>
            </div>
          </dl>
        </div>
      </details>

      <DatasetNotice />
    </div>
  );
}
