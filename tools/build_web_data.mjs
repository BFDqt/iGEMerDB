import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = join(projectRoot, 'public', 'data', 'igem.json');
const outputRoot = join(projectRoot, 'public', 'data', 'web');

const TEAM_BUCKETS = 64;
const PERSON_BUCKETS = 256;

const source = JSON.parse(await readFile(sourcePath, 'utf8'));

function stableBucket(value, buckets) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % buckets;
}

function bucketName(index) {
  return index.toString(16).padStart(2, '0');
}

async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(value));
  await rename(temporaryPath, path);
}

const memberById = new Map(source.members.map((member) => [member.uuid, member]));
const visibleTeamIds = new Set(
  source.teams.filter((team) => team.default_visible !== false).map((team) => team.id),
);
const visibleRoster = source.roster.filter((entry) =>
  visibleTeamIds.has(entry.team_id),
);
const visibleMemberIds = new Set(
  visibleRoster.map((entry) => entry.member_uuid),
);
const rosterByTeam = new Map();
const rosterByPerson = new Map();
const publishedMemberCounts = new Map();

for (const entry of source.roster) {
  const teamEntries = rosterByTeam.get(entry.team_id) ?? [];
  teamEntries.push(entry);
  rosterByTeam.set(entry.team_id, teamEntries);

  const personEntries = rosterByPerson.get(entry.member_uuid) ?? [];
  personEntries.push(entry);
  rosterByPerson.set(entry.member_uuid, personEntries);
  publishedMemberCounts.set(
    entry.team_id,
    (publishedMemberCounts.get(entry.team_id) ?? 0) + 1,
  );
}

const entityCounts = {
  teams: visibleTeamIds.size,
  members: visibleMemberIds.size,
  roster: visibleRoster.length,
  institutions: source.institutions.length,
  awards: source.awards.length,
  team_awards: (source.team_awards ?? []).filter((result) =>
    visibleTeamIds.has(result.team_id),
  ).length,
  raw_teams: source.teams.length,
  raw_members: source.members.length,
  raw_roster: source.roster.length,
  raw_team_awards: source.team_awards?.length ?? 0,
};

const core = {
  meta: {
    ...source.meta,
    entity_counts: entityCounts,
    web_bundle: {
      version: 1,
      team_buckets: TEAM_BUCKETS,
      person_buckets: PERSON_BUCKETS,
    },
  },
  competitions: source.competitions,
  // Keep the compact official catalog so nested team names can resolve back
  // to stable official IDs. Member-profile affiliation strings stay outside
  // this catalog and never become team relationships.
  institutions: source.institutions,
  teams: source.teams.map((team) => {
    const {
      detail_fetched: _detailFetched,
      roster_fetched: _rosterFetched,
      awards_fetched: _awardsFetched,
      fetch_error: _fetchError,
      listed_at: _listedAt,
      all_member_count: _reportedMembers,
      student_member_count: _studentMembers,
      student_past_experience_count: _pastExperience,
      ...coreTeam
    } = team;
    return {
      ...coreTeam,
      institutions: (team.institutions ?? []).map((institution) => ({
        id: institution.id ?? null,
        uuid: institution.uuid ?? null,
        name: institution.name ?? null,
        country: institution.country ?? null,
        city: institution.city ?? null,
      })),
      published_member_count: publishedMemberCounts.get(team.id) ?? 0,
    };
  }),
  members: [],
  roster: [],
  awards: source.awards,
  team_awards: source.team_awards ?? [],
};

function compactPeople(members, roster) {
  const localIndex = new Map(members.map((member, index) => [member.uuid, index]));
  return {
    schema_version: 1,
    people: members.map((member) => [
      member.uuid,
      member.name,
      member.username ?? '',
      member.institution ?? '',
      member.title ?? '',
      member.affiliation ?? '',
      member.country ?? '',
      member.igem_since ?? null,
    ]),
    roster: roster
      .filter((entry) => localIndex.has(entry.member_uuid))
      .map((entry) => [
        entry.team_id,
        localIndex.get(entry.member_uuid),
        entry.year ?? null,
        entry.role_inferred || 'Other',
        entry.role_api || '',
        entry.is_student ? 1 : 0,
      ]),
  };
}

await writeJsonAtomic(join(outputRoot, 'core.json'), core);
await writeJsonAtomic(
  join(outputRoot, 'people.json'),
  compactPeople(source.members, source.roster),
);

const teamBuckets = Array.from({ length: TEAM_BUCKETS }, () => ({
  members: new Map(),
  roster: [],
}));

for (const team of source.teams) {
  const bucket = teamBuckets[stableBucket(team.id, TEAM_BUCKETS)];
  for (const entry of rosterByTeam.get(team.id) ?? []) {
    const member = memberById.get(entry.member_uuid);
    if (member) bucket.members.set(member.uuid, member);
    bucket.roster.push(entry);
  }
}

await Promise.all(
  teamBuckets.map((bucket, index) =>
    writeJsonAtomic(
      join(outputRoot, 'team', `${bucketName(index)}.json`),
      compactPeople([...bucket.members.values()], bucket.roster),
    ),
  ),
);

const personBuckets = Array.from({ length: PERSON_BUCKETS }, () => ({
  members: [],
  roster: [],
}));

for (const member of source.members) {
  const bucket = personBuckets[stableBucket(member.uuid, PERSON_BUCKETS)];
  bucket.members.push(member);
  bucket.roster.push(...(rosterByPerson.get(member.uuid) ?? []));
}

await Promise.all(
  personBuckets.map((bucket, index) =>
    writeJsonAtomic(
      join(outputRoot, 'person', `${bucketName(index)}.json`),
      compactPeople(bucket.members, bucket.roster),
    ),
  ),
);

const manifest = {
  generated_at: source.meta?.generated_at ?? '',
  source_schema_version: source.meta?.schema_version ?? null,
  bundle_schema_version: 1,
  entity_counts: entityCounts,
  paths: {
    core: 'core.json',
    people: 'people.json',
    team_bucket: 'team/{bucket}.json',
    person_bucket: 'person/{bucket}.json',
  },
  buckets: {
    team: TEAM_BUCKETS,
    person: PERSON_BUCKETS,
  },
};

await writeJsonAtomic(join(outputRoot, 'manifest.json'), manifest);

console.log(
  `Built web data: ${entityCounts.teams} visible teams, ` +
    `${entityCounts.members} visible people, ${entityCounts.roster} visible roster relations ` +
    `(${entityCounts.raw_teams} raw teams retained for audit).`,
);
