import { AlertTriangle } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { database } from '../data';
import { formatCountry, formatSection } from '../format';
import {
  Breadcrumbs,
  DatasetNotice,
  useDocumentTitle,
} from '../components/PageElements';

export function InstitutionDetailPage() {
  const { institutionId } = useParams();
  const institution = database.institutionById.get(institutionId ?? '');
  useDocumentTitle(institution?.name ?? '机构未找到');

  if (!institution) {
    return (
      <div className="page-container not-found-inline">
        <span className="kicker">404 / INSTITUTION</span>
        <h1>没有找到这个机构</h1>
        <p>机构标识不在当前数据快照中，或名称已被归一化合并。</p>
        <Link className="button-link" to="/institutions">
          返回机构索引
        </Link>
      </div>
    );
  }

  return (
    <div className="page-container detail-page">
      <Breadcrumbs
        items={[
          { label: '机构', to: '/institutions' },
          { label: institution.name },
        ]}
      />
      <header className="entity-header institution-hero">
        <div>
          <span className="kicker">OFFICIAL TEAM INSTITUTION RECORD</span>
          <h1>{institution.name}</h1>
          <p>
            {[institution.city, formatCountry(institution.country)]
              .filter(Boolean)
              .join(' · ') || '地域信息未公开'}
          </p>
        </div>
      </header>
      <section className="entity-facts three">
        <div>
          <span>关联队伍</span>
          <strong>{institution.teams.length}</strong>
        </div>
        <div>
          <span>官方机构标识</span>
          <strong>{institution.officialId ? '已记录' : '未记录'}</strong>
        </div>
        <div>
          <span>名称记录来源</span>
          <strong>队伍机构字段</strong>
        </div>
      </section>

      <aside className="entity-caveat">
        <AlertTriangle aria-hidden="true" />
        <p>
          这是快照中的官方队伍机构名称聚合页，不代表已完成权威实体消歧。成员当前档案中的机构不会自动关联到其历史队伍。
          <Link to="/about#privacy-corrections">查看限制或提交纠错</Link>
        </p>
      </aside>

      <div className="two-column-sections">
        <section className="content-section">
          <div className="content-section-head">
            <div>
              <span className="kicker">ASSOCIATED TEAMS</span>
              <h2>官方字段关联队伍</h2>
            </div>
            <span>{institution.teams.length} 条</span>
          </div>
          {institution.teams.length ? (
            <div className="simple-record-list">
              {institution.teams
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((team) => (
                  <Link key={team.id} to={`/teams/${team.id}`}>
                    <span>
                      <strong>{team.name}</strong>
                      <small>{team.city || formatCountry(team.country)}</small>
                    </span>
                    <b>{formatSection(team.section) || '组别未公开'}</b>
                  </Link>
                ))}
            </div>
          ) : (
            <p className="muted-copy">没有可关联的队伍记录。</p>
          )}
        </section>

        <section className="content-section">
          <div className="content-section-head">
            <div>
              <span className="kicker">IDENTITY POLICY</span>
              <h2>机构识别边界</h2>
            </div>
            <span>CONSERVATIVE MATCHING</span>
          </div>
          <ol className="institution-method-list">
            <li>
              <strong>01</strong>
              <p>优先使用官方机构 ID，同一 ID 作为同一机构记录。</p>
            </li>
            <li>
              <strong>02</strong>
              <p>缺少 ID 时仅按国家与规范名称精确匹配，不重排名称词序。</p>
            </li>
            <li>
              <strong>03</strong>
              <p>无法确定的别名保持分开，交由后续人工审核。</p>
            </li>
          </ol>
        </section>
      </div>
      <DatasetNotice />
    </div>
  );
}
