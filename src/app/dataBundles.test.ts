import { afterEach, describe, expect, it, vi } from 'vitest';
import { database, initializeDatabase, loadDatabase } from './data';
import source from './test/fixtures/test_export.json';
import {
  buildCompactBundle,
  memberRow,
} from './test/bundle-fixtures';
import type { RawDataset } from './types';
import {
  ensureAllPeople,
  ensurePerson,
  ensureTeamPeople,
  getDatabaseRevision,
  isCompletePeopleLoaded,
  isRuntimeCoreLoaded,
  loadCoreDatabase,
  subscribeDatabase,
} from './dataBundles';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(handler: (url: string) => unknown): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    const body = handler(url);
    if (body === undefined) {
      return Promise.resolve(new Response('not found', { status: 404 }));
    }
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('dataBundles runtime loading', () => {
  it('resolves bundle requests before the core loads without fetching', async () => {
    expect(isRuntimeCoreLoaded()).toBe(false);
    const fetchMock = stubFetch(() => undefined);

    await ensureTeamPeople(5587);
    await ensurePerson('any-person');
    await ensureAllPeople();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(isCompletePeopleLoaded()).toBe(false);
    expect(getDatabaseRevision()).toBe(0);
  });

  it('loads the core dataset, resets partial state, and publishes a revision', async () => {
    const fetchMock = stubFetch((url) =>
      url.endsWith('core.json') ? source : undefined,
    );

    const revisionBefore = getDatabaseRevision();
    const loaded = await loadCoreDatabase();

    expect(fetchMock).toHaveBeenCalledWith('/data/web/core.json');
    expect(loaded.stats.teamCount).toBe(26);
    expect(isRuntimeCoreLoaded()).toBe(true);
    expect(getDatabaseRevision()).toBeGreaterThan(revisionBefore);
  });

  it('expands compact team bundles into the shared person index', async () => {
    const fetchMock = stubFetch((url) =>
      url.endsWith('core.json')
        ? source
        : url.endsWith('team/36.json')
          ? buildCompactBundle([memberRow('mem-team-a', 'Member Team A')], [
              [5587, 0, 2025, 'Student', 'student', 1],
            ])
          : undefined,
    );

    await loadCoreDatabase();
    fetchMock.mockClear();

    const revisionBefore = getDatabaseRevision();
    const next = await ensureTeamPeople(5587);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/data/web/team/36.json');
    expect(next.personById.get('mem-team-a')).toMatchObject({
      name: 'Member Team A',
      institutionName: '',
      igemSince: null,
    });
    const membership = next
      .teamById.get(5587)
      ?.memberships.find((entry) => entry.person.id === 'mem-team-a');
    expect(membership).toMatchObject({ role: 'Student', isStudent: true });
    expect(getDatabaseRevision()).toBeGreaterThan(revisionBefore);
  });

  it('reuses one bucket request for every team hashing into it', async () => {
    stubFetch((url) =>
      url.endsWith('core.json')
        ? source
        : url.endsWith('team/36.json')
          ? buildCompactBundle([], [])
          : undefined,
    );
    await loadCoreDatabase();
    const fetchMock = stubFetch((url) =>
      url.endsWith('core.json')
        ? source
        : url.endsWith('team/36.json')
          ? buildCompactBundle([], [])
          : undefined,
    );

    await ensureTeamPeople(5587);
    await ensureTeamPeople(7); // same FNV-1a bucket (54) as 5587
    await ensureTeamPeople(5587);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('expands person bundles and drops out-of-range roster rows', async () => {
    stubFetch((url) =>
      url.endsWith('core.json')
        ? source
        : url.endsWith('person/8a.json')
          ? buildCompactBundle([memberRow('mem-person-a', 'Person A')], [
              [5587, 0, 2024, 'PI', 'primary-pi', 0],
              [5587, 9, 2024, '', '', 0], // person index 9 does not exist
              [9999, 0, 2024, '', '', 0], // team unknown to the fixture
            ])
          : undefined,
    );
    await loadCoreDatabase();

    const next = await ensurePerson('5058c88a-5e99-47f7-adc3-5604574e13d4');

    const person = next.personById.get('mem-person-a');
    expect(person?.memberships).toHaveLength(1);
    expect(person?.memberships[0]).toMatchObject({
      role: 'PI',
      isStudent: false,
    });
    expect(person?.memberships[0]?.team.id).toBe(5587);
  });

  it('maps blank roles to Other and preserves populated optional fields', async () => {
    stubFetch((url) =>
      url.endsWith('core.json')
        ? source
        : url.endsWith('team/09.json')
          ? buildCompactBundle(
              [
                [
                  'mem-blank',
                  'Blank Role',
                  'blankuser',
                  'Some Lab',
                  'Student',
                  'Some University',
                  'DEU',
                  2023,
                  2023,
                  2025,
                ],
              ],
              [[3298, 0, null, '', '', 0]],
            )
          : undefined,
    );
    await loadCoreDatabase();

    const next = await ensureTeamPeople(3298); // fixture team in bucket 9

    const membership = next
      .teamById.get(3298)
      ?.memberships.find((entry) => entry.person.id === 'mem-blank');
    expect(membership).toMatchObject({ role: 'Other', isStudent: false });
    expect(membership?.person.username).toBe('blankuser');
    expect(membership?.person.institutionName).toBe('Some Lab');
  });

  it('replaces the partial index with the complete people bundle', async () => {
    stubFetch((url) =>
      url.endsWith('core.json')
        ? source
        : url.endsWith('team/36.json')
          ? buildCompactBundle([memberRow('mem-team-a', 'Member Team A')], [
              [5587, 0, 2025, 'Student', 'student', 1],
            ])
          : undefined,
    );
    await loadCoreDatabase();
    await ensureTeamPeople(5587);
    stubFetch((url) =>
      url.endsWith('core.json')
        ? source
        : url.endsWith('people.json')
          ? buildCompactBundle([memberRow('mem-complete', 'Complete Person')], [
              [5540, 0, 2025, 'Student', 'student', 1],
            ])
          : undefined,
    );

    const next = await ensureAllPeople();

    expect(isCompletePeopleLoaded()).toBe(true);
    expect(next.personById.has('mem-complete')).toBe(true);
    expect(next.personById.has('mem-team-a')).toBe(false);
    // Complete people make every narrow ensure* call a no-op.
    await ensureTeamPeople(5587);
    await ensurePerson('5058c88a-5e99-47f7-adc3-5604574e13d4');
    expect(isCompletePeopleLoaded()).toBe(true);
  });

  it('propagates shard failures as localised errors', async () => {
    stubFetch(() => undefined);
    await expect(loadCoreDatabase()).rejects.toThrow(
      '数据分片加载失败（HTTP 404）',
    );

    stubFetch((url) => (url.endsWith('core.json') ? source : undefined));
    await loadCoreDatabase();
    stubFetch(() => undefined);
    await expect(ensureTeamPeople(5587)).rejects.toThrow(
      '数据分片加载失败（HTTP 404）',
    );
  });

  it('notifies subscribers on every publish until they unsubscribe', async () => {
    stubFetch((url) => (url.endsWith('core.json') ? source : undefined));
    const listener = vi.fn();
    const unsubscribe = subscribeDatabase(listener);

    await loadCoreDatabase();
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    await loadCoreDatabase();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('loadDatabase', () => {
  it('initializes the database from a fetched full snapshot', async () => {
    const payload = structuredClone(source) as RawDataset;
    const fetchMock = stubFetch((url) =>
      url.endsWith('/data/igem.json') ? payload : undefined,
    );

    const loaded = await loadDatabase();

    expect(fetchMock).toHaveBeenCalledWith('/data/igem.json');
    expect(loaded.stats.rawTeamCount).toBe(30);
    expect(database.stats.rawTeamCount).toBe(30);
  });

  it('surfaces non-200 responses as localised errors', async () => {
    stubFetch(() => undefined);
    await expect(loadDatabase()).rejects.toThrow(
      '数据文件加载失败（HTTP 404）',
    );
  });
});

describe('fixture-backed database stays consistent after bundle tests', () => {
  it('re-initializes the canonical fixture database', () => {
    const restored = initializeDatabase(source as RawDataset);
    expect(restored.stats.teamCount).toBe(26);
    expect(restored.personById.has('mem-team-a')).toBe(false);
  });
});
