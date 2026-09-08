import {
  BookOpen,
  Building2,
  Database,
  FlaskConical,
  Menu,
  Search,
  Trophy,
  UsersRound,
  X,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { database } from '../data';
import { SearchDialog } from './SearchDialog';

const navigation = [
  { to: '/teams', label: '队伍', icon: FlaskConical },
  { to: '/people', label: '成员', icon: UsersRound },
  { to: '/institutions', label: '机构', icon: Building2 },
  { to: '/competition', label: '年度', icon: Database },
  { to: '/awards', label: '奖项', icon: Trophy },
];

export function Layout({ children }: { children: ReactNode }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const shortcutLabel = /Mac|iPhone|iPad/i.test(navigator.platform)
    ? '⌘ K'
    : 'Ctrl K';

  useEffect(() => {
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [location.pathname]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="header-inner">
          <Link className="brand" to="/" aria-label="iGEMerDB 首页">
            <span className="brand-mark" aria-hidden="true">
              iG
            </span>
            <span>
              <strong>iGEMerDB</strong>
              <small>Public competition archive</small>
            </span>
          </Link>

          <nav className="desktop-nav" aria-label="主导航">
            {navigation.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => (isActive ? 'active' : undefined)}
              >
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="header-actions">
            <button
              className="search-trigger"
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="全站检索"
              aria-haspopup="dialog"
              aria-expanded={searchOpen}
              aria-controls="global-search-dialog"
            >
              <Search size={17} aria-hidden="true" />
              <span>全站检索</span>
              <kbd>{shortcutLabel}</kbd>
            </button>
            <button
              className="menu-trigger"
              type="button"
              aria-label={menuOpen ? '关闭导航' : '打开导航'}
              aria-expanded={menuOpen}
              aria-controls="mobile-navigation"
              onClick={() => setMenuOpen((value) => !value)}
            >
              {menuOpen ? (
                <X aria-hidden="true" />
              ) : (
                <Menu aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav
            id="mobile-navigation"
            className="mobile-nav"
            aria-label="移动端导航"
          >
            {navigation.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to}>
                <Icon size={18} aria-hidden="true" />
                {label}
              </NavLink>
            ))}
            <NavLink to="/about">
              <BookOpen size={18} aria-hidden="true" />
              关于与方法
            </NavLink>
          </nav>
        )}
      </header>

      <main id="main-content">{children}</main>

      <footer className="site-footer">
        <div className="footer-grid">
          <div>
            <Link className="footer-brand" to="/">
              iGEMerDB
            </Link>
            <p>面向公开竞赛资料的独立索引。本站不隶属于 iGEM Foundation。</p>
            <span className="footer-status">公开快照 · Preview</span>
          </div>
          <div>
            <span className="footer-label">DATASET</span>
            <p>
              {database.stats.minYear}–{database.stats.maxYear} ·{' '}
              {database.stats.teamCount.toLocaleString('zh-CN')} 支队伍 ·{' '}
              {database.stats.publishedPeopleCount.toLocaleString('zh-CN')}{' '}
              位公开成员
            </p>
          </div>
          <div className="footer-links">
            <Link to="/about">数据与方法</Link>
            <Link to="/about#privacy-corrections">隐私、纠错与撤回</Link>
            <a
              href="https://igem.org"
              target="_blank"
              rel="noreferrer noopener"
            >
              iGEM 官网
            </a>
            <a
              href="https://github.com/OIerDb-ng/OIerDb"
              target="_blank"
              rel="noreferrer noopener"
            >
              源代码
            </a>
          </div>
        </div>
      </footer>

      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
