import {
  ArrowRight,
  Building2,
  Database,
  FlaskConical,
  Search,
  UsersRound,
} from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
  useDocumentTitle,
} from '../components/PageElements';

export function HomePage() {
  useDocumentTitle('');
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const regionRows = useMemo(() => {
    const counts = new Map<string, number>();
    for (const team of database.teams) {
      const key = team.region || '__unknown__';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({
        label:
          label === '__unknown__'
            ? '未公开'
            : label === 'oceania'
              ? '大洋洲'
              : formatRegion(label),
        value,
      }));
  }, []);

  const featuredTeams = useMemo(
    () =>
      [...database.teams]
        .filter((team) => team.publishedMemberCount > 0)
        .sort(
          (a, b) =>
            b.publishedMemberCount - a.publishedMemberCount ||
            a.name.localeCompare(b.name),
        )
        .slice(0, 6),
    [],
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = query.trim();
    navigate(value ? `/teams?q=${encodeURIComponent(value)}` : '/teams');
  };

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <span className="kicker">
            {database.stats.minYear}–{database.stats.maxYear} / SYNTHETIC
            BIOLOGY INDEX
          </span>
          <h1>让竞赛记录，成为可以查证的公共档案。</h1>
          <p>
            iGEMerDB
            将分散的队伍、公开成员、机构和奖项资料整理成一套可检索的竞赛索引。少一点榜单噱头，多一点来源与上下文。
          </p>
          <form className="hero-search" onSubmit={submit} role="search">
            <Search aria-hidden="true" />
            <label className="sr-only" htmlFor="hero-search">
              搜索队伍
            </label>
            <input
              id="hero-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索队伍名称、城市或国家代码"
            />
            <button type="submit">
              查找记录
              <ArrowRight aria-hidden="true" />
            </button>
          </form>
          <div className="hero-links">
            <Link to="/teams">浏览全部队伍</Link>
            <Link to="/about">了解数据方法</Link>
          </div>
        </div>

        <aside className="hero-dossier" aria-label="数据集摘要">
          <div className="dossier-head">
            <span>
              DATASET / {database.stats.minYear}–{database.stats.maxYear}
            </span>
            <b>{database.stats.yearCount} COMPETITIONS</b>
          </div>
          <div className="dossier-main">
            <strong>{formatNumber(database.stats.teamCount)}</strong>
            <span>TEAMS INDEXED</span>
          </div>
          <dl>
            <div>
              <dt>公开成员</dt>
              <dd>{formatNumber(database.stats.publishedPeopleCount)}</dd>
            </div>
            <div>
              <dt>国家 / 地区</dt>
              <dd>{database.stats.countryCount}</dd>
            </div>
            <div>
              <dt>区域</dt>
              <dd>{database.stats.regionCount}</dd>
            </div>
            <div>
              <dt>队伍奖项结果</dt>
              <dd>{formatNumber(database.stats.teamAwardCount)}</dd>
            </div>
          </dl>
          <p>快照状态：公开端点采集已执行 · 单条事实未全量人工核验</p>
        </aside>
      </section>

      <section className="stat-ribbon" aria-label="数据概览">
        <div>
          <span>01</span>
          <strong>{formatNumber(database.stats.teamCount)}</strong>
          <small>支队伍</small>
        </div>
        <div>
          <span>02</span>
          <strong>{formatNumber(database.stats.publishedPeopleCount)}</strong>
          <small>位公开成员</small>
        </div>
        <div>
          <span>03</span>
          <strong>{database.stats.countryCount}</strong>
          <small>个国家 / 地区</small>
        </div>
        <div>
          <span>04</span>
          <strong>{formatNumber(database.stats.teamAwardCount)}</strong>
          <small>条队伍奖项结果</small>
        </div>
      </section>

      <section className="home-section explore-section">
        <div className="section-heading">
          <div>
            <span className="kicker">EXPLORE THE ARCHIVE</span>
            <h2>从你关心的实体进入</h2>
          </div>
          <p>每条记录保留它与队伍、年份和机构之间的关系。</p>
        </div>
        <div className="explore-grid">
          <Link to="/teams" className="explore-item">
            <span className="explore-index">01</span>
            <FlaskConical aria-hidden="true" />
            <h3>队伍目录</h3>
            <p>按年份、地区、国家和参赛组别筛选快照中的历史队伍。</p>
            <b>
              查看 {formatNumber(database.stats.teamCount)} 支队伍{' '}
              <ArrowRight aria-hidden="true" />
            </b>
          </Link>
          <Link to="/people" className="explore-item">
            <span className="explore-index">02</span>
            <UsersRound aria-hidden="true" />
            <h3>公开成员</h3>
            <p>查看公开身份、所属队伍与采集时的机构信息。</p>
            <b>
              查看 {formatNumber(database.stats.publishedPeopleCount)} 位成员{' '}
              <ArrowRight aria-hidden="true" />
            </b>
          </Link>
          <Link to="/institutions" className="explore-item">
            <span className="explore-index">03</span>
            <Building2 aria-hidden="true" />
            <h3>机构名称索引</h3>
            <p>查看官方队伍机构字段，不把成员当前档案自动投射到历史队伍。</p>
            <b>
              查看 {database.stats.institutionCount} 条机构记录{' '}
              <ArrowRight aria-hidden="true" />
            </b>
          </Link>
        </div>
      </section>

      <section className="home-section data-section">
        <div className="distribution-panel">
          <div className="section-heading compact">
            <div>
              <span className="kicker">REGIONAL DISTRIBUTION</span>
              <h2>队伍区域分布</h2>
            </div>
            <Link to="/competition">完整年度视图</Link>
          </div>
          <DistributionBars rows={regionRows} />
        </div>
        <div className="method-panel">
          <Database aria-hidden="true" />
          <span className="kicker">DATA, NOT A SCOREBOARD</span>
          <h2>结果与定义分别存档</h2>
          <p>
            奖项定义、提名、获奖与奖牌是不同的事实。本站保留官方关系，但不使用人为权重拼出“综合分”。
          </p>
          <Link to="/about">
            阅读方法与限制 <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      </section>

      <section className="home-section featured-section">
        <div className="section-heading">
          <div>
            <span className="kicker">PUBLIC ROSTERS</span>
            <h2>成员覆盖较多的队伍</h2>
          </div>
          <p>这里只按公开成员记录数量排序，不代表竞赛成绩。</p>
        </div>
        <div className="featured-list">
          {featuredTeams.map((team, index) => (
            <Link key={team.id} to={`/teams/${team.id}`}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{team.name}</strong>
              <small>{formatCountry(team.country)}</small>
              <small>
                {team.year} · {formatSection(team.section)}
              </small>
              <b>{team.publishedMemberCount} 位公开成员</b>
              <ArrowRight aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>

      <div className="home-notice">
        <DatasetNotice />
      </div>
    </>
  );
}
