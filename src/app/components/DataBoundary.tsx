import { Database, RotateCw } from 'lucide-react';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { useParams } from 'react-router-dom';
import {
  ensureAllPeople,
  ensurePerson,
  ensureTeamPeople,
  isRuntimeCoreLoaded,
} from '../dataBundles';

interface BoundaryProps {
  children: ReactNode;
  load: () => Promise<unknown>;
  label: string;
  // Primitive identity of the entity this boundary loads. Resetting on a
  // string change avoids the flip-flop that callback-identity comparison
  // hits while a navigation's params land across renders.
  resetKey: string;
}

function DataBoundary({ children, load, label, resetKey }: BoundaryProps) {
  const runtime = isRuntimeCoreLoaded();
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    runtime ? 'loading' : 'ready',
  );
  const [errorDetail, setErrorDetail] = useState('');

  // Navigating between two entities of the same route keeps this component
  // mounted; reset synchronously during render so the previous entity's
  // "not found" frame never flashes while the next shard loads.
  const [previousResetKey, setPreviousResetKey] = useState(resetKey);
  if (previousResetKey !== resetKey) {
    setPreviousResetKey(resetKey);
    setStatus('loading');
  }

  // Navigating between two entities of the same route keeps this component
  // mounted; reset synchronously during render so the previous entity's
  // "not found" frame never flashes while the next shard loads. (Spell out
  // the state type: useState(load) would treat the callback as a lazy
  // initializer and store its Promise instead.)


  useEffect(() => {
    if (!runtime) return;
    let active = true;
    setStatus('loading');
    load()
      .then(() => {
        if (active) setStatus('ready');
      })
      .catch((error: unknown) => {
        if (!active) return;
        console.error('route data shard failed:', error);
        setErrorDetail(error instanceof Error ? error.message : String(error));
        setStatus('error');
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
          ? `${errorDetail || '未知错误'}——核心目录仍然可用，可重试这一条记录的数据分片。`
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

export function PeopleDataBoundary({ children }: { children: ReactNode }) {
  const load = useCallback(() => ensureAllPeople(), []);
  return (
    <DataBoundary load={load} label="成员索引" resetKey="people">
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
    <DataBoundary load={load} label="队伍名单" resetKey={String(id)}>
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
    <DataBoundary load={load} label="成员档案" resetKey={personId}>
      {children}
    </DataBoundary>
  );
}
