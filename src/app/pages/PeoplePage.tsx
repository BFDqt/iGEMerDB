import { Search, SlidersHorizontal } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { database, normalizeText } from '../data';
import {
  formatCountry,
  formatNumber,
  formatRole,
  initials,
  uniqueValues,
} from '../format';
import {
  DatasetNotice,
  EmptyState,
  PageHeader,
  Pagination,
  useDocumentTitle,
} from '../components/PageElements';

const PAGE_SIZE = 24;

export function PeoplePage() {
  useDocumentTitle('公开成员');
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const year = params.get('year') ?? '';
  const country = params.get('country') ?? '';
  const role = params.get('role') ?? '';
  const requestedPage = Number(params.get('page') ?? '1');
  const countries = useMemo(
    () => uniqueValues(database.people.map((person) => person.country)),
    [],
  );
  const roles = useMemo(
    () =>
      uniqueValues(
        database.people.flatMap((person) =>
          person.memberships.map((membership) => membership.role),
        ),
      ),
    [],
  );

  const filtered = useMemo(() => {
    const normalized = normalizeText(query);
    return database.people.filter(
      (person) =>
        (!normalized || person.searchText.includes(normalized)) &&
        (!year ||
          person.memberships.some(
            (membership) => membership.year === Number(year),
          )) &&
        (!country || person.country === country) &&
        (!role ||
          person.memberships.some((membership) => membership.role === role)),
    );
  }, [country, query, role, year]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(
    Math.max(Number.isFinite(requestedPage) ? requestedPage : 1, 1),
    pageCount,
  );
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const update = (key: string, value: string) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set(key, value);
      else next.delete(key);
      if (key !== 'page') next.set('page', '1');
      return next;
    });
  };

  return (
    <div className="page-container">
      <PageHeader
        kicker={`PUBLIC PEOPLE / ${database.stats.minYear}–${database.stats.maxYear}`}
        title="公开成员"
        description="成员记录来自公开队伍名单；仅展示快照中已成功采集的个人资料。"
        action={
          <span className="record-count">
            {formatNumber(filtered.length)} 条记录
          </span>
        }
      />
      <DatasetNotice compact />

      <section className="filter-panel people-filters" aria-label="成员筛选">
        <div className="filter-search">
          <Search aria-hidden="true" />
          <label className="sr-only" htmlFor="people-query">
            搜索成员
          </label>
          <input
            id="people-query"
            value={query}
            onChange={(event) => update('q', event.target.value)}
            placeholder="搜索姓名、用户名或机构"
          />
        </div>
        <label>
          <span>年份</span>
          <select
            value={year}
            onChange={(event) => update('year', event.target.value)}
          >
            <option value="">全部年份</option>
            {database.competitions.map((competition) => (
              <option key={competition.uuid} value={competition.year}>
                {competition.year}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>国家 / 地区</span>
          <select
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
          <span>角色</span>
          <select
            value={role}
            onChange={(event) => update('role', event.target.value)}
          >
            <option value="">全部角色</option>
            {roles.map((value) => (
              <option key={value} value={value}>
                {formatRole(value)}
              </option>
            ))}
          </select>
        </label>
        {(query || year || country || role) && (
          <button
            className="clear-filters"
            type="button"
            onClick={() => setParams({})}
          >
            <SlidersHorizontal aria-hidden="true" /> 清除筛选
          </button>
        )}
      </section>

      {pageItems.length ? (
        <div className="person-grid">
          {pageItems.map((person) => {
            const membership = person.memberships[0];
            return (
              <Link
                key={person.id}
                to={`/people/${person.id}`}
                className="person-card"
              >
                <span className="avatar large" aria-hidden="true">
                  {initials(person.name)}
                </span>
                <span className="person-card-copy">
                  <small>
                    {membership ? formatRole(membership.role) : '公开成员'}
                  </small>
                  <strong>{person.name}</strong>
                  <span>{person.institutionName || '机构未公开'}</span>
                </span>
                <span className="person-card-meta">
                  <b>{formatCountry(person.country)}</b>
                  <i>{person.memberships.length} 条参赛记录</i>
                </span>
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyState />
      )}

      <div className="pagination-row">
        <p>
          第 {page} / {pageCount} 页 · 共 {filtered.length} 条
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
