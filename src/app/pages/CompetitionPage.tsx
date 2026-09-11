import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { database } from '../data';
import {
  formatCountry,
  formatNumber,
  formatRegion,
  formatSection,
} from '../format';
import {
  DatasetNotice,
  DistributionBars,
  PageHeader,
  useDocumentTitle,
} from '../components/PageElements';

const UNKNOWN = '__unknown__';

function countBy(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = value || UNKNOWN;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function regionLabel(value: string) {
  if (value === UNKNOWN) return '未公开';
  if (value === 'oceania') return '大洋洲';
  return formatRegion(value);
}

function sectionLabel(value: string) {
  return value === UNKNOWN ? '未公开 / 待公布' : formatSection(value);
}

export function CompetitionPage() {
  const [params, setParams] = useSearchParams();
  const requestedYear = Number(params.get('year') ?? database.stats.maxYear);
  const competition =
    database.competitions.find((item) => item.year === requestedYear) ??
    database.competitions[0];
  const year = competition?.year ?? database.stats.maxYear;
  const teams = competition?.teams ?? [];
  const rosterEntryCount = teams.reduce(
    (total, team) => total + team.publishedMemberCount,
    0,
  );
  useDocumentTitle(`${year} 年度`);
  const regions = useMemo(
    () =>
      countBy(teams.map((team) => team.region)).map(([raw, value]) => ({
        label: regionLabel(raw),
        value,
        raw,
      })),
    [teams],
  );
  const sections = useMemo(
    () =>
      countBy(teams.map((team) => team.section)).map(([label, value]) => ({
        label: sectionLabel(label),
        value,
      })),
    [teams],
  );
  const countries = useMemo(
    () => countBy(teams.map((team) => team.country)),
    [teams],
  );
  const medals = useMemo(
    () =>
      countBy(teams.map((team) => team.medal)).map(([label, value]) => ({
        label:
          label === UNKNOWN
            ? '未公开 / 无返回'
            : label.charAt(0).toUpperCase() + label.slice(1),
        value,
      })),
    [teams],
  );

  return (
    <div className="page-container competition-page">
      <PageHeader
        kicker={`COMPETITION / ${year}`}
        title={`${year} 年度概览`}
        description={`从公开快照观察地域、组别与奖牌分布；当前赛事状态为 ${competition?.status === 'live' ? '进行中' : '已归档'}。`}
        action={
          <label className="year-picker">
            <span className="sr-only">选择年份</span>
            <select
              value={year}
              onChange={(event) =>
                setParams({ year: event.target.value }, { replace: true })
              }
            >
              {database.competitions.map((item) => (
                <option key={item.uuid} value={item.year}>
                  {item.year} {item.status === 'live' ? '· 进行中' : ''}
                </option>
              ))}
            </select>
          </label>
        }
      />

      <section className="competition-masthead">
        <div>
          <span>YEAR</span>
          <strong>{year}</strong>
        </div>
        <dl>
          <div>
            <dt>队伍</dt>
            <dd>{formatNumber(teams.length)}</dd>
          </div>
          <div>
            <dt>国家 / 地区（已知）</dt>
            <dd>{countries.filter(([value]) => value !== UNKNOWN).length}</dd>
          </div>
          <div>
            <dt>竞赛区域（已知）</dt>
            <dd>
              {
                countBy(teams.map((team) => team.region)).filter(
                  ([value]) => value !== UNKNOWN,
                ).length
              }
            </dd>
          </div>
          <div>
            <dt>公开名单条目</dt>
            <dd>{formatNumber(rosterEntryCount)}</dd>
          </div>
        </dl>
      </section>

      <DatasetNotice compact />

      <div className="analytics-grid">
        <section className="analytics-panel">
          <div className="panel-heading">
            <span className="kicker">REGION</span>
            <h2>区域分布</h2>
          </div>
          <DistributionBars
            rows={regions}
            hrefFor={(row) =>
              row.raw === 'unknown'
                ? undefined
                : `/teams?year=${year}&region=${encodeURIComponent(row.raw)}`
            }
          />
        </section>
        <section className="analytics-panel">
          <div className="panel-heading">
            <span className="kicker">SECTION</span>
            <h2>参赛组别</h2>
          </div>
          <DistributionBars rows={sections} />
        </section>
      </div>

      <section className="content-section country-section">
        <div className="content-section-head">
          <div>
            <span className="kicker">COUNTRY / REGION</span>
            <h2>队伍地域明细</h2>
          </div>
          <span>{countries.length} 个分类（含未公开）</span>
        </div>
        <div className="country-grid">
          {countries.map(([country, count], index) => {
            const content = (
              <>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <strong>
                  {country === UNKNOWN ? '未公开' : formatCountry(country)}
                </strong>
                <small>{country === UNKNOWN ? 'NO VALUE' : country}</small>
                <b>{count} 支</b>
              </>
            );
            return country === UNKNOWN ? (
              <div className="country-grid-record unavailable" key={country}>
                {content}
              </div>
            ) : (
              <Link key={country} to={`/teams?year=${year}&country=${country}`}>
                {content}
              </Link>
            );
          })}
        </div>
      </section>

      <section className="method-callout">
        <span className="kicker">MEDAL RESULTS</span>
        <h2>{year} 年奖牌记录</h2>
        {medals.length ? (
          <DistributionBars rows={medals} />
        ) : (
          <p>
            {competition?.status === 'live'
              ? '本赛季尚未公布奖牌结果。'
              : '官方公开接口未返回该年度的奖牌记录。'}
          </p>
        )}
        <Link to={`/awards?year=${year}`}>查看本年度奖项与获奖队伍</Link>
      </section>
    </div>
  );
}
