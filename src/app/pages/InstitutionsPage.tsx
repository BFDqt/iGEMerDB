import { AlertTriangle, Search, SlidersHorizontal } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { database, normalizeText } from '../data';
import { formatCountry, formatNumber, uniqueValues } from '../format';
import {
  DatasetNotice,
  EmptyState,
  PageHeader,
  Pagination,
  useDocumentTitle,
} from '../components/PageElements';

const PAGE_SIZE = 36;

export function InstitutionsPage() {
  useDocumentTitle('机构名称索引');
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const year = params.get('year') ?? '';
  const country = params.get('country') ?? '';
  const sort = params.get('sort') ?? 'name';
  const requestedPage = Number(params.get('page') ?? '1');
  const countries = useMemo(
    () =>
      uniqueValues(
        database.institutions.map((institution) => institution.country),
      ),
    [],
  );

  const filtered = useMemo(() => {
    const normalized = normalizeText(query);
    const result = database.institutions.filter(
      (institution) =>
        (!normalized || institution.searchText.includes(normalized)) &&
        (!year ||
          institution.teams.some((team) => team.year === Number(year))) &&
        (!country || institution.country === country),
    );
    return [...result].sort((a, b) => {
      if (sort === 'teams')
        return b.teams.length - a.teams.length || a.name.localeCompare(b.name);
      if (sort === 'people')
        return (
          b.people.length - a.people.length || a.name.localeCompare(b.name)
        );
      return a.name.localeCompare(b.name);
    });
  }, [country, query, sort, year]);
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
        kicker={`INSTITUTION INDEX / ${database.stats.minYear}–${database.stats.maxYear}`}
        title="机构名称索引"
        description="仅索引默认可见队伍的官方机构字段；当前结果不是经权威消歧的机构主体库。"
        action={
          <span className="record-count">
            {formatNumber(filtered.length)} 条记录
          </span>
        }
      />
      <DatasetNotice compact />
      <aside className="index-caveat" aria-label="机构名称质量提示">
        <AlertTriangle aria-hidden="true" />
        <p>
          <strong>按“名称记录”使用本目录。</strong>
          显式官方 ID 优先；缺少 ID
          时仅做国家与名称精确匹配。别名可能分开，不使用会导致跨国误合并的激进归一化。
        </p>
        <Link to="/about#privacy-corrections">报告问题</Link>
      </aside>

      <section
        className="filter-panel institution-filters"
        aria-label="机构筛选"
      >
        <div className="filter-search">
          <Search aria-hidden="true" />
          <label className="sr-only" htmlFor="institution-query">
            搜索机构
          </label>
          <input
            id="institution-query"
            value={query}
            onChange={(event) => update('q', event.target.value)}
            placeholder="搜索机构、城市或国家代码"
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
          <span>排序</span>
          <select
            value={sort}
            onChange={(event) => update('sort', event.target.value)}
          >
            <option value="name">名称 A–Z</option>
            <option value="teams">关联队伍数</option>
            <option value="people">公开成员数</option>
          </select>
        </label>
        {(query || year || country) && (
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
        <div className="institution-grid">
          {pageItems.map((institution) => (
            <Link
              key={institution.id}
              to={`/institutions/${encodeURIComponent(institution.id)}`}
              className="institution-card"
            >
              <span className="institution-source">官方队伍机构字段</span>
              <h2>{institution.name || '未命名机构记录'}</h2>
              <p>
                {[institution.city, formatCountry(institution.country)]
                  .filter(Boolean)
                  .join(' · ') || '地域信息未公开'}
              </p>
              <dl>
                <div>
                  <dt>关联队伍</dt>
                  <dd>{institution.teams.length}</dd>
                </div>
                <div>
                  <dt>官方标识</dt>
                  <dd>{institution.officialId ? '已记录' : '未记录'}</dd>
                </div>
              </dl>
            </Link>
          ))}
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
