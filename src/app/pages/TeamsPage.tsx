import { Search, SlidersHorizontal } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { database, normalizeText } from '../data';
import {
  formatCountry,
  formatNumber,
  formatRegion,
  formatSection,
  regionLabels,
  sectionLabels,
  uniqueValues,
} from '../format';
import {
  DatasetNotice,
  EmptyState,
  PageHeader,
  Pagination,
  useDocumentTitle,
} from '../components/PageElements';

const PAGE_SIZE = 30;

const statusLabels: Record<string, string> = {
  accepted: '已接受',
  registered: '已注册',
  withdrawn: '已撤回',
  disqualified: '取消资格',
  pending: '待审核',
};

export function TeamsPage() {
  useDocumentTitle('队伍目录');
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const year = params.get('year') ?? '';
  const region = params.get('region') ?? '';
  const country = params.get('country') ?? '';
  const section = params.get('section') ?? '';
  const defaultStatus = database.rawTeams.some(
    (team) => team.status === 'accepted',
  )
    ? 'accepted'
    : 'all';
  const status = params.get('status') ?? defaultStatus;
  const sort = params.get('sort') ?? 'year';
  const requestedPage = Number(params.get('page') ?? '1');

  const countries = useMemo(
    () => uniqueValues(database.rawTeams.map((team) => team.country)),
    [],
  );
  const statuses = useMemo(
    () => uniqueValues(database.rawTeams.map((team) => team.status)),
    [],
  );

  const filtered = useMemo(() => {
    const normalizedQuery = normalizeText(query);
    const sourceTeams =
      status === 'accepted' ? database.teams : database.rawTeams;
    const result = sourceTeams.filter(
      (team) =>
        (!normalizedQuery || team.searchText.includes(normalizedQuery)) &&
        (!year || team.year === Number(year)) &&
        (!region || team.region === region) &&
        (!country || team.country === country) &&
        (!section || team.section === section) &&
        (status === 'all' || team.status === status),
    );
    return [...result].sort((a, b) => {
      if (sort === 'members') {
        return (
          b.publishedMemberCount - a.publishedMemberCount ||
          a.name.localeCompare(b.name)
        );
      }
      if (sort === 'country') {
        return (
          a.country.localeCompare(b.country) || a.name.localeCompare(b.name)
        );
      }
      if (sort === 'year') {
        return b.year - a.year || a.name.localeCompare(b.name);
      }
      return a.name.localeCompare(b.name);
    });
  }, [country, query, region, section, sort, status, year]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(
    Math.max(Number.isFinite(requestedPage) ? requestedPage : 1, 1),
    pageCount,
  );
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const update = (key: string, value: string) => {
    // Filter/search keystrokes replace instead of pushing: ten typed
    // characters should not create ten back-button history entries.
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value) next.set(key, value);
        else next.delete(key);
        if (key !== 'page') next.set('page', '1');
        return next;
      },
      { replace: true },
    );
  };

  const clear = () => setParams({});
  const hasFilters = Boolean(
    query || year || region || country || section || status !== defaultStatus,
  );

  return (
    <div className="page-container">
      <PageHeader
        kicker={`TEAM DIRECTORY / ${database.stats.minYear}–${database.stats.maxYear}`}
        title="队伍目录"
        description="按年份、地区、组别与队伍状态浏览公开记录；默认隔离已撤回和取消资格的条目。"
        action={
          <span className="record-count">
            {formatNumber(filtered.length)} 条记录
          </span>
        }
      />

      <DatasetNotice compact />

      <section className="filter-panel team-filters" aria-label="队伍筛选">
        <div className="filter-search">
          <Search aria-hidden="true" />
          <label className="sr-only" htmlFor="team-query">
            搜索队伍
          </label>
          <input
            id="team-query"
            value={query}
            onChange={(event) => update('q', event.target.value)}
            placeholder="搜索队伍、城市或国家代码"
          />
        </div>
        <label>
          <span>年份</span>
          <select
            aria-label="年份"
            value={year}
            onChange={(event) => update('year', event.target.value)}
          >
            <option value="">全部年份</option>
            {database.competitions.map((competition) => (
              <option key={competition.uuid} value={competition.year}>
                {competition.year}
                {competition.status === 'live' ? ' · 进行中' : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>地区</span>
          <select
            aria-label="地区"
            value={region}
            onChange={(event) => update('region', event.target.value)}
          >
            <option value="">全部地区</option>
            {Object.entries(regionLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>国家 / 地区</span>
          <select
            aria-label="国家 / 地区"
            value={country}
            onChange={(event) => update('country', event.target.value)}
          >
            <option value="">全部国家 / 地区</option>
            {countries.map((value) => (
              <option key={value} value={value}>
                {formatCountry(value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>组别</span>
          <select
            aria-label="组别"
            value={section}
            onChange={(event) => update('section', event.target.value)}
          >
            <option value="">全部组别</option>
            {Object.entries(sectionLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>队伍状态</span>
          <select
            aria-label="队伍状态"
            value={status}
            onChange={(event) => update('status', event.target.value)}
          >
            <option value="all">全部（含撤回 / 取消资格）</option>
            {statuses.map((value) => (
              <option key={value} value={value}>
                {statusLabels[value] ?? value}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>排序</span>
          <select
            aria-label="排序"
            value={sort}
            onChange={(event) => update('sort', event.target.value)}
          >
            <option value="name">队名 A–Z</option>
            <option value="year">年份（新到旧）</option>
            <option value="country">国家 / 地区</option>
            <option value="members">公开成员数</option>
          </select>
        </label>
        {hasFilters && (
          <button className="clear-filters" type="button" onClick={clear}>
            <SlidersHorizontal aria-hidden="true" />
            清除筛选
          </button>
        )}
      </section>

      {pageItems.length ? (
        <div
          className="table-wrap"
          role="region"
          aria-label="队伍目录结果"
          tabIndex={0}
        >
          <table className="data-table team-table">
            <thead>
              <tr>
                <th>队伍</th>
                <th>年份</th>
                <th>地区</th>
                <th>国家 / 地区</th>
                <th>组别</th>
                <th>状态</th>
                <th className="numeric">公开成员</th>
                <th aria-label="查看详情" />
              </tr>
            </thead>
            <tbody>
              {pageItems.map((team) => {
                const sectionLabel = formatSection(team.section).trim();
                const regionLabel = formatRegion(team.region).trim();
                return (
                  <tr key={team.id}>
                    <td>
                      <Link className="primary-link" to={`/teams/${team.id}`}>
                        {team.name}
                      </Link>
                      <small>{team.city || `Team ID ${team.id}`}</small>
                    </td>
                    <td>{team.year}</td>
                    <td>{regionLabel || '未公开'}</td>
                    <td>{formatCountry(team.country)}</td>
                    <td>
                      <span className="tag">
                        {sectionLabel || '未公开 / 待公布'}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`tag team-status ${team.status || 'unknown'}`}
                      >
                        {statusLabels[team.status] || team.status || '未公开'}
                      </span>
                    </td>
                    <td className="numeric">{team.publishedMemberCount}</td>
                    <td>
                      <Link className="row-action" to={`/teams/${team.id}`}>
                        查看
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState />
      )}

      <div className="pagination-row">
        <p>
          第 {page} / {pageCount} 页 · 共 {formatNumber(filtered.length)} 条
        </p>
        <Pagination
          page={page}
          total={filtered.length}
          pageSize={PAGE_SIZE}
          onChange={(value) => update('page', String(value))}
        />
      </div>
    </div>
  );
}
