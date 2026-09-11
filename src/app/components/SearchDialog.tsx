import {
  ArrowRight,
  Building2,
  FlaskConical,
  Search,
  UsersRound,
  X,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { Link } from 'react-router-dom';
import { database, searchDatabase } from '../data';
import {
  ensureAllPeople,
  isCompletePeopleLoaded,
  isRuntimeCoreLoaded,
} from '../dataBundles';
import type { SearchResult } from '../types';

const typeMeta: Record<
  SearchResult['type'],
  { label: string; icon: typeof FlaskConical }
> = {
  team: { label: '队伍', icon: FlaskConical },
  person: { label: '成员', icon: UsersRound },
  institution: { label: '机构', icon: Building2 },
};

export function SearchDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [query, setQuery] = useState('');
  const [peopleRevision, setPeopleRevision] = useState(0);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleLoadError, setPeopleLoadError] = useState('');
  const results = useMemo(
    () => searchDatabase(database, query),
    [peopleRevision, query],
  );

  useEffect(() => {
    if (!open || !isRuntimeCoreLoaded() || isCompletePeopleLoaded()) return;
    let active = true;
    setPeopleLoading(true);
    setPeopleLoadError('');
    ensureAllPeople()
      .then(() => {
        if (active) setPeopleRevision((value) => value + 1);
      })
      .catch(() => {
        if (active) setPeopleLoadError('成员索引载入失败');
      })
      .finally(() => {
        if (active) setPeopleLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open]);

  useEffect(() => {
    // Native showModal traps focus but does not lock background scrolling.
    if (open) {
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = previousOverflow;
      };
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocusRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      dialog.showModal();
      requestAnimationFrame(() => inputRef.current?.focus());
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const completeClose = () => {
    setQuery('');
    onClose();
    requestAnimationFrame(() => returnFocusRef.current?.focus());
  };

  const requestClose = () => dialogRef.current?.close();

  const trapFocus = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== 'Tab') return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <dialog
      id="global-search-dialog"
      ref={dialogRef}
      className="search-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="global-search-title"
      aria-describedby="global-search-description"
      onClose={completeClose}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onKeyDown={trapFocus}
      onClick={(event) => {
        if (event.target === dialogRef.current) requestClose();
      }}
    >
      <div className="search-dialog-panel">
        <div className="sr-only">
          <h2 id="global-search-title">全站检索</h2>
          <p id="global-search-description">
            检索队伍、公开成员或机构名称记录。
          </p>
        </div>
        <div className="search-dialog-head">
          <label htmlFor="global-search">
            <Search aria-hidden="true" />
            <span className="sr-only">检索队伍、成员或机构</span>
          </label>
          <input
            ref={inputRef}
            id="global-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="输入队伍、成员或机构名称…"
            autoComplete="off"
            aria-controls="global-search-results"
          />
          <button type="button" onClick={requestClose} aria-label="关闭检索">
            <X aria-hidden="true" />
          </button>
        </div>

        <p className="sr-only" aria-live="polite">
          {results.length > 0
            ? `${results.length} 条匹配结果`
            : query.trim().length >= 2
              ? '没有匹配的记录'
              : ''}
        </p>
        <div id="global-search-results" className="search-dialog-body">
          {query.trim().length < 2 ? (
            <div className="search-prompt">
              <span>SEARCH INDEX</span>
              <p>至少输入两个字符。支持名称、城市、国家代码和用户名。</p>
            </div>
          ) : results.length ? (
            <ul className="search-results">
              {results.map((result) => {
                const meta = typeMeta[result.type];
                const Icon = meta.icon;
                return (
                  <li key={`${result.type}-${result.id}`}>
                    <Link to={result.href} onClick={requestClose}>
                      <span className="result-icon">
                        <Icon aria-hidden="true" />
                      </span>
                      <span className="result-copy">
                        <small>{meta.label}</small>
                        <strong>{result.title}</strong>
                        <span>{result.meta || '暂无补充信息'}</span>
                      </span>
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="search-prompt">
              <span>NO RESULT</span>
              <p>没有找到与“{query}”匹配的公开记录。</p>
            </div>
          )}
        </div>
        <div className="search-dialog-foot">
          <span className={peopleLoadError ? 'search-load-error' : undefined}>
            {peopleLoading
              ? '成员索引载入中…'
              : peopleLoadError || '按 Esc 关闭'}
          </span>
          <span>
            数据快照：{database.stats.minYear}–{database.stats.maxYear}
          </span>
        </div>
      </div>
    </dialog>
  );
}
