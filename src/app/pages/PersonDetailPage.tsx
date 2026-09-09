import {
  AtSign,
  ArrowUpRight,
  Building2,
  CalendarDays,
  ChevronDown,
  Database,
  Info,
  MapPin,
} from 'lucide-react';
import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { database } from '../data';
import { formatCountry, formatRole, initials } from '../format';
import {
  Breadcrumbs,
  DatasetNotice,
  useDocumentTitle,
} from '../components/PageElements';

export function PersonDetailPage() {
  const { personId } = useParams();
  const person = database.personById.get(personId ?? '');
  const apiBase = database.sourceUrl.replace(/\/$/, '');
  useDocumentTitle(person?.name ?? '成员未找到');
  // People pages carry real names: keep individual profiles out of search
  // engines unless a person is on an official public roster page anyway.
  // This is an explicit, documented product decision (docs/DATASET.md).
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex';
    document.head.appendChild(meta);
    return () => {
      meta.remove();
    };
  }, []);


  if (!person) {
    return (
      <div className="page-container not-found-inline">
        <span className="kicker">404 / PERSON</span>
        <h1>没有找到这位成员</h1>
        <p>这条成员记录不在当前公开数据快照中。</p>
        <Link className="button-link" to="/people">
          返回成员目录
        </Link>
      </div>
    );
  }

  return (
    <div className="page-container detail-page">
      <Breadcrumbs
        items={[{ label: '成员', to: '/people' }, { label: person.name }]}
      />
      <header className="person-profile-header">
        <span className="avatar profile" aria-hidden="true">
          {initials(person.name)}
        </span>
        <div>
          <span className="kicker">PUBLIC MEMBER PROFILE</span>
          <h1>{person.name}</h1>
          <p>
            {[person.title, person.institutionName]
              .filter(Boolean)
              .join(' · ') || '公开成员'}
          </p>
        </div>
      </header>

      <div className="detail-grid">
        <div className="detail-main">
          <section className="content-section">
            <div className="content-section-head">
              <div>
                <span className="kicker">PARTICIPATION</span>
                <h2>参赛记录</h2>
              </div>
              <span>{person.memberships.length} 条</span>
            </div>
            <aside className="profile-context-note">
              <Info aria-hidden="true" />
              <p>
                年份只表示参赛关系，角色来自当年队伍名单。当前职称与机构仅在右侧“公开资料”显示一次，不作为历史年度状态。
              </p>
            </aside>
            <div className="record-timeline">
              {person.memberships.map((membership) => (
                <article key={`${membership.team.id}-${membership.roleApi}`}>
                  <div className="timeline-year">{membership.year}</div>
                  <div>
                    <span>ROSTER ROLE</span>
                    <h3>
                      <Link to={`/teams/${membership.team.id}`}>
                        {membership.team.name}
                      </Link>
                    </h3>
                    <p>
                      名单角色：
                      {membership.roleApi.trim() ||
                        formatRole(membership.role) ||
                        '未公开'}
                      ；当前公开档案见右侧。
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>

        <aside className="detail-aside">
          <section>
            <span className="kicker">PROFILE FIELDS</span>
            <h2>公开资料</h2>
            <ul className="icon-fact-list">
              <li>
                <AtSign aria-hidden="true" />
                <span>
                  <small>用户名</small>
                  <b>{person.username || '未公开'}</b>
                </span>
              </li>
              <li>
                <Building2 aria-hidden="true" />
                <span>
                  <small>机构</small>
                  <b>{person.institutionName || '未公开'}</b>
                </span>
              </li>
              <li>
                <MapPin aria-hidden="true" />
                <span>
                  <small>国家 / 地区</small>
                  <b>{formatCountry(person.country)}</b>
                </span>
              </li>
              <li>
                <CalendarDays aria-hidden="true" />
                <span>
                  <small>iGEM since</small>
                  <b>{person.igemSince ?? '未公开'}</b>
                </span>
              </li>
            </ul>
          </section>
          <section>
            <span className="kicker">IDENTIFIER</span>
            <h2>记录标识</h2>
            <code className="identifier-block">{person.id}</code>
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
            <small>成员记录由其参赛队伍的公开名单端点索引</small>
          </span>
          <ChevronDown aria-hidden="true" />
        </summary>
        <div className="provenance-body">
          <p>
            当前数据集没有为成员档案伪造独立来源链接。下列链接指向包含该成员记录的队伍公开名单端点。
          </p>
          <div className="source-link-grid">
            {person.memberships.map((membership) => (
              <a
                key={membership.team.id}
                href={`${apiBase}/teams/${membership.team.id}/roster`}
                target="_blank"
                rel="noreferrer noopener"
              >
                <span>
                  {membership.year} · {membership.team.name}
                </span>
                <ArrowUpRight aria-hidden="true" />
              </a>
            ))}
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
              <dt>成员记录</dt>
              <dd>{person.id}</dd>
            </div>
          </dl>
        </div>
      </details>
      <DatasetNotice />
    </div>
  );
}
