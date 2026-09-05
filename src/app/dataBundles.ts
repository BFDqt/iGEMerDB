import { database, initializeDatabase } from './data';
import type { Database, RawDataset, RawMember, RawRosterEntry } from './types';

type CompactPerson = [
  uuid: string,
  name: string,
  username: string,
  institution: string,
  title: string,
  affiliation: string,
  country: string,
  igemSince: number | null,
  firstSeenYear: number | null,
  lastSeenYear: number | null,
];

type CompactRoster = [
  teamId: number,
  personIndex: number,
  year: number | null,
  inferredRole: string,
  apiRole: string,
  isStudent: 0 | 1,
];

interface CompactPeopleBundle {
  schema_version: number;
  people: CompactPerson[];
  roster: CompactRoster[];
}

const TEAM_BUCKETS = 64;
const PERSON_BUCKETS = 256;
const dataRoot = `${import.meta.env.BASE_URL}data/web`;

let coreDataset: RawDataset | undefined;
let completePeopleLoaded = false;
let revision = 0;
const members = new Map<string, RawMember>();
const roster = new Map<string, RawRosterEntry>();
const pending = new Map<string, Promise<Database>>();
const loadedFeatures = new Set<string>();
const listeners = new Set<() => void>();

function rosterKey(entry: Pick<RawRosterEntry, 'team_id' | 'member_uuid'>) {
  return `${entry.team_id}\u0000${entry.member_uuid}`;
}

function stableBucket(value: string | number, buckets: number): number {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % buckets;
}

function bucketName(index: number): string {
  return index.toString(16).padStart(2, '0');
}

function expandBundle(bundle: CompactPeopleBundle) {
  const expandedMembers: RawMember[] = bundle.people.map((person) => ({
    uuid: person[0],
    name: person[1],
    username: person[2] || null,
    institution: person[3] || null,
    title: person[4] || null,
    affiliation: person[5] || null,
    country: person[6] || null,
    igem_since: person[7],
    first_seen_year: person[8],
    last_seen_year: person[9],
  }));
  const expandedRoster: RawRosterEntry[] = bundle.roster.flatMap((entry) => {
    const person = expandedMembers[entry[1]];
    if (!person) return [];
    return [
      {
        team_id: entry[0],
        member_uuid: person.uuid,
        year: entry[2] ?? undefined,
        role_inferred: entry[3] || 'Other',
        role_api: entry[4] || '',
        is_student: Boolean(entry[5]),
      },
    ];
  });
  return { members: expandedMembers, roster: expandedRoster };
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${dataRoot}/${path}`);
  if (!response.ok) {
    throw new Error(`数据分片加载失败（HTTP ${response.status}）`);
  }
  return (await response.json()) as T;
}

function publishDatabase(): Database {
  if (!coreDataset) throw new Error('核心数据尚未载入');
  const next = initializeDatabase({
    ...coreDataset,
    members: [...members.values()],
    roster: [...roster.values()],
  });
  revision += 1;
  for (const listener of listeners) listener();
  return next;
}

function mergeBundle(bundle: CompactPeopleBundle): Database {
  const expanded = expandBundle(bundle);
  for (const member of expanded.members) members.set(member.uuid, member);
  for (const entry of expanded.roster) roster.set(rosterKey(entry), entry);
  return publishDatabase();
}

function loadOnce(key: string, path: string): Promise<Database> {
  if (!coreDataset) {
    // Unit tests initialize the fixture directly and do not need network data.
    return Promise.resolve(database);
  }
  if (loadedFeatures.has(key)) return Promise.resolve(database);
  const existing = pending.get(key);
  if (existing) return existing;
  const request = fetchJson<CompactPeopleBundle>(path)
    .then((bundle) => {
      const next = mergeBundle(bundle);
      loadedFeatures.add(key);
      return next;
    })
    .finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

export async function loadCoreDatabase(): Promise<Database> {
  const core = await fetchJson<RawDataset>('core.json');
  coreDataset = core;
  members.clear();
  roster.clear();
  loadedFeatures.clear();
  completePeopleLoaded = false;
  const next = initializeDatabase(core);
  revision += 1;
  for (const listener of listeners) listener();
  return next;
}

export function ensureAllPeople(): Promise<Database> {
  if (completePeopleLoaded || !coreDataset) return Promise.resolve(database);
  const key = 'people:all';
  const existing = pending.get(key);
  if (existing) return existing;
  const request = fetchJson<CompactPeopleBundle>('people.json')
    .then((bundle) => {
      members.clear();
      roster.clear();
      completePeopleLoaded = true;
      loadedFeatures.clear();
      return mergeBundle(bundle);
    })
    .finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

export function ensureTeamPeople(teamId: number): Promise<Database> {
  if (completePeopleLoaded || !coreDataset) return Promise.resolve(database);
  const bucket = stableBucket(teamId, TEAM_BUCKETS);
  return loadOnce(`team:${bucket}`, `team/${bucketName(bucket)}.json`);
}

export function ensurePerson(personId: string): Promise<Database> {
  if (completePeopleLoaded || !coreDataset) return Promise.resolve(database);
  const bucket = stableBucket(personId, PERSON_BUCKETS);
  return loadOnce(`person:${bucket}`, `person/${bucketName(bucket)}.json`);
}

export function subscribeDatabase(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getDatabaseRevision(): number {
  return revision;
}

export function isCompletePeopleLoaded(): boolean {
  return completePeopleLoaded;
}

export function isRuntimeCoreLoaded(): boolean {
  return Boolean(coreDataset);
}
