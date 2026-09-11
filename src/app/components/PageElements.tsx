import { ChevronLeft, ChevronRight, Database, SearchX } from 'lucide-react';
import { useLayoutEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { database } from '../data';

export function useDocumentTitle(title: string) {
  useLayoutEffect(() => {
    const previous = document.title;
    document.title = title
      ? `${title} — iGEMerDB`
      : 'iGEMerDB — iGEM 竞赛资料库';
    return () => {
      document.title = previous;
    };
  }, [title]);
}

export function PageHeader({
  kicker,
  title,
  description,
  action,
}: {
  kicker: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="page-header-copy">
        <span className="kicker">{kicker}</span>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="page-header-action">{action}</div>}
    </header>
  );
}

export function Breadcrumbs({
  items,
}: {
  items: Array<{ label: string; to?: string }>;
}) {
  return (
    <nav className="breadcrumbs" aria-label="面包屑">
      <Link to="/">首页</Link>
      {items.map((item) => (
        <span key={`${item.label}-${item.to ?? 'current'}`}>
          <i aria-hidden="true">/</i>
          {item.to ? (
            <Link to={item.to}>{item.label}</Link>
          ) : (
            <b>{item.label}</b>
          )}
        </span>
      ))}
    </nav>
  );
}

export function DatasetNotice({ compact = false }: { compact?: boolean }) {
  const incompleteYears = database.competitions.filter((competition) => {
    const coverage = competition.coverage;
    return (
      coverage &&
      (coverage.detail_fetched_count !== coverage.team_count ||
        coverage.roster_fetched_count !== coverage.team_count ||
        coverage.awards_fetched_count !== coverage.team_count ||
        coverage.fetch_error_count > 0)
    );
  });
  return (
    <aside className={compact ? 'dataset-notice compact' : 'dataset-notice'}>
      <Database aria-hidden="true" />
      <div>
        <strong>覆盖范围提示</strong>
        <p>
          当前快照索引 {database.stats.minYear}–{database.stats.maxYear} 年、共{' '}
          {database.stats.yearCount}{' '}
          届赛事；“已采集”仅表示公开端点请求完成，不等于单条记录已经人工核实。
          {incompleteYears.length
            ? ` ${incompleteYears.map((item) => item.year).join('、')} 年仍有采集缺口。`
            : ` ${database.stats.maxYear} 年为进行中赛季，数据会随官方记录变化。`}
        </p>
      </div>
    </aside>
  );
}

export function EmptyState({
  title = '没有匹配的记录',
  description = '尝试清除筛选条件或换一个关键词。',
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="empty-state">
      <SearchX aria-hidden="true" />
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

export function Pagination({
  page,
  total,
  pageSize,
  onChange,
}: {
  page: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (pageCount <= 1) return null;

  const pages = Array.from(
    { length: pageCount },
    (_, index) => index + 1,
  ).filter(
    (value) =>
      value === 1 || value === pageCount || Math.abs(value - page) <= 1,
  );

  return (
    <nav className="pagination" aria-label="分页">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        aria-label="上一页"
      >
        <ChevronLeft aria-hidden="true" />
      </button>
      {pages.map((value, index) => {
        const previous = pages[index - 1];
        return (
          <span key={value} className="pagination-slot">
            {previous && value - previous > 1 && <i>…</i>}
            <button
              type="button"
              className={value === page ? 'active' : undefined}
              aria-current={value === page ? 'page' : undefined}
              onClick={() => onChange(value)}
            >
              {value}
            </button>
          </span>
        );
      })}
      <button
        type="button"
        disabled={page >= pageCount}
        onClick={() => onChange(page + 1)}
        aria-label="下一页"
      >
        <ChevronRight aria-hidden="true" />
      </button>
    </nav>
  );
}

export function DistributionBars<T extends { label: string; value: number; detail?: string }>({
  rows,
  hrefFor,
}: {
  rows: T[];
  hrefFor?: (row: T) => string | undefined;
}) {
  const maximum = Math.max(...rows.map((row) => row.value), 1);
  return (
    <div className="distribution-bars">
      {rows.map((row) => {
        const href = hrefFor?.(row);
        return (
        <div className="distribution-row" key={row.label}>
          <div>
            {href ? (
              <Link to={href}>{row.label}</Link>
            ) : (
              <span>{row.label}</span>
            )}
            <strong>{row.detail ?? row.value}</strong>
          </div>
          <div className="bar-track" aria-hidden="true">
            <span style={{ width: `${(row.value / maximum) * 100}%` }} />
          </div>
        </div>
        );
      })}
    </div>
  );
}
