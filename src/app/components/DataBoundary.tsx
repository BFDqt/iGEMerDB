import { Database, RotateCw } from 'lucide-react';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';
import { useParams } from 'react-router-dom';
import {
  ensureAllPeople,
  ensurePerson,
  ensureTeamPeople,
  getDatabaseRevision,
  isRuntimeCoreLoaded,
  subscribeDatabase,
} from '../dataBundles';

interface BoundaryProps {
  children: ReactNode;
  load: () => Promise<unknown>;
  label: string;
}

function DataBoundary({ children, load, label }: BoundaryProps) {
  const runtime = isRuntimeCoreLoaded();
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    runtime ? 'loading' : 'ready',
  );

  useEffect(() => {
    if (!runtime) return;
    let active = true;
    setStatus('loading');
    load()
      .then(() => {
        if (active) setStatus('ready');
      })
      .catch(() => {
        if (active) setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [attempt, load, runtime]);

  if (status === 'ready') return children;

  return (
    <section className="route-data-status" aria-live="polite">
      <Database aria-hidden="true" />
      <span className="kicker">ON-DEMAND ARCHIVE</span>
      <h1>{status === 'error' ? '数据分片载入失败' : `正在载入${label}`}</h1>
      <p>
        {status === 'error'
          ? '核心目录仍然可用，你可以重试这一条记录的数据分片。'
          : '只下载当前页面需要的数据，不再让每个入口等待完整资料库。'}
      </p>
      {status === 'error' && (
        <button type="button" onClick={() => setAttempt((value) => value + 1)}>
          <RotateCw aria-hidden="true" /> 重新载入
        </button>
      )}
    </section>
  );
}

export function DatabaseRevisionBoundary({
  children,
}: {
  children: ReactNode;
}) {
  useSyncExternalStore(
    subscribeDatabase,
    getDatabaseRevision,
    getDatabaseRevision,
  );
  return children;
}

export function PeopleDataBoundary({ children }: { children: ReactNode }) {
  const load = useCallback(() => ensureAllPeople(), []);
  return (
    <DataBoundary load={load} label="成员索引">
      {children}
    </DataBoundary>
  );
}

export function TeamDataBoundary({ children }: { children: ReactNode }) {
  const { teamId } = useParams();
  const id = Number(teamId);
  const load = useCallback(
    () => (Number.isFinite(id) ? ensureTeamPeople(id) : Promise.resolve()),
    [id],
  );
  return (
    <DataBoundary load={load} label="队伍名单">
      {children}
    </DataBoundary>
  );
}

export function PersonDataBoundary({ children }: { children: ReactNode }) {
  const { personId = '' } = useParams();
  const load = useCallback(
    () => (personId ? ensurePerson(personId) : Promise.resolve()),
    [personId],
  );
  return (
    <DataBoundary load={load} label="成员档案">
      {children}
    </DataBoundary>
  );
}
