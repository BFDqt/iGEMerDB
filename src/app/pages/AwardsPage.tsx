import { Search } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { database, normalizeText } from '../data';
import { formatNumber } from '../format';
import {
  EmptyState,
  PageHeader,
  useDocumentTitle,
} from '../components/PageElements';

const typeLabels: Record<string, string> = {
  medal: '奖牌',
  special: '专项奖',
  village: 'Village 奖',
  grand: '总冠军',
};

export function AwardsPage() {
  useDocumentTitle('奖项结果');
  const [params, setParams] = useSearchParams();
  const resultYears = useMemo(
    () =>
      [...new Set(database.teamAwards.map((result) => result.team.year))].sort(
        (a, b) => b - a,
      ),
    [],
  );
  const year =
    params.get('year') ?? String(resultYears[0] ?? database.stats.maxYear);
  const query = params.get('q') ?? '';
  const category = params.get('category') ?? '';
  const decision = params.get('decision') ?? 'winner';
  const categories = useMemo(
    () =>
      [
        ...new Set(
          database.teamAwards.map((result) => result.type).filter(Boolean),
        ),
      ].sort(),
    [],
  );

  const filtered = useMemo(() => {
    const normalized = normalizeText(query);
    return database.teamAwards.filter(
      (result) =>
        result.team.year === Number(year) &&
        (!category || result.type === category) &&
        (!decision || result.decision === decision) &&
        (!normalized ||
          normalizeText(`${result.title} ${result.team.name}`).includes(
            normalized,
          )),
    );
  }, [category, decision, query, year]);

  const groups = useMemo(() => {
    const grouped = new Map<
      string,
      {
        title: string;
        type: string;
        decision: string;
        teams: typeof database.teams;
      }
    >();
    for (const result of filtered) {
      const key = `${result.type}\u0000${result.decision}\u0000${result.title}`;
      const group = grouped.get(key) ?? {
        title: result.title,
        type: result.type,
        decision: result.decision,
        teams: [],
      };
      group.teams.push(result.team);
      grouped.set(key, group);
    }
    return [...grouped.values()].sort(
      (a, b) =>
        (a.type === 'medal' ? -1 : b.type === 'medal' ? 1 : 0) ||
        a.title.localeCompare(b.title),
    );
  }, [filtered]);

  const update = (key: string, value: string) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  };

  return (
    <div className="page-container awards-page">
      <PageHeader
        kicker={`AWARD RESULTS / ${year}`}
        title="奖项与获奖队伍"
        description="队伍结果来自官方公开奖项接口；获奖、提名和奖牌分别保留，不把奖项定义误当成结果。"
        action={
          <span className="record-count">
            {formatNumber(filtered.length)} 条队伍结果
          </span>
        }
      />

      <section className="filter-panel awards-filters" aria-label="奖项筛选">
        <div className="filter-search">
          <Search aria-hidden="true" />
          <label className="sr-only" htmlFor="award-query">
            搜索奖项或队伍
          </label>
          <input
            id="award-query"
            value={query}
            onChange={(event) => update('q', event.target.value)}
            placeholder="搜索奖项或队伍"
          />
        </div>
        <label>
          <span>年份</span>
          <select
            value={year}
            onChange={(event) => update('year', event.target.value)}
          >
            {database.competitions.map((competition) => (
              <option key={competition.uuid} value={competition.year}>
                {competition.year}
                {competition.status === 'live' ? ' · 进行中' : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>结果</span>
          <select
            value={decision}
            onChange={(event) => update('decision', event.target.value)}
          >
            <option value="winner">获奖</option>
            <option value="nominee">提名</option>
            <option value="">全部结果</option>
          </select>
        </label>
        <label>
          <span>类别</span>
          <select
            value={category}
            onChange={(event) => update('category', event.target.value)}
          >
            <option value="">全部类别</option>
            {categories.map((value) => (
              <option key={value} value={value}>
                {typeLabels[value] ?? value}
              </option>
            ))}
          </select>
        </label>
      </section>

      <div className="catalogue-note">
        <strong>RESULTS + CATALOGUE</strong>
        <p>
          当前数据库共保存 {formatNumber(database.stats.teamAwardCount)}{' '}
          条队伍结果与 {formatNumber(database.stats.awardCount)}{' '}
          条逐年奖项定义。
        </p>
      </div>

      {groups.length ? (
        <div className="award-list">
          {groups.map((group, index) => (
            <details key={`${group.type}-${group.decision}-${group.title}`}>
              <summary>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <strong>{group.title}</strong>
                <small>
                  {typeLabels[group.type] ?? group.type} ·{' '}
                  {group.decision === 'winner' ? '获奖' : '提名'} ·{' '}
                  {group.teams.length} 队
                </small>
                <i aria-hidden="true">+</i>
              </summary>
              <div>
                <p>官方结果关联到以下队伍：</p>
                <ul className="award-team-links">
                  {group.teams
                    .slice()
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((team) => (
                      <li key={team.id}>
                        <Link to={`/teams/${team.id}`}>{team.name}</Link>
                      </li>
                    ))}
                </ul>
              </div>
            </details>
          ))}
        </div>
      ) : (
        <EmptyState
          title="该条件下没有公开结果"
          description="进行中的赛季通常要等赛事结束后才会公布奖项。"
        />
      )}
    </div>
  );
}
