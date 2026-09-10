import type {
  Competition,
  Database,
  Institution,
  Membership,
  Person,
  RawDataset,
  RawInstitution,
  RawTeamInstitution,
  SearchResult,
  Team,
  TeamAward,
  TeamExportCategory,
} from './types';

export function normalizeText(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[_–—-]+/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export const UNKNOWN_CATEGORY = 'unknown';

// Upstream-provided URLs (team wiki links, API base) flow into href sinks.
// Only http(s) is acceptable; anything else (javascript:, data:, ...) is
// dropped rather than rendered.
export function safeExternalUrl(value: string | null | undefined): string {
  if (!value) return '';
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? parsed.toString()
      : '';
  } catch {
    return '';
  }
}

const invalidInstitutionNames = new Set([
  'college',
  'company',
  'high school',
  'highschool',
  'igem',
  'independent',
  'individual',
  'institute',
  'institution',
  'n a',
  'na',
  'nan',
  'nil',
  'no',
  'none',
  'not applicable',
  'not available',
  'null',
  'school',
  'student',
  'student team',
  'team',
  'undefined',
  'university',
  'unknown',
  '个人',
  '公司',
  '学生',
  '学校',
  '高中',
  '脱产',
]);

export function normalizeCategory(value: string | null | undefined): string {
  return (
    value
      ?.trim()
      .toLocaleLowerCase()
      .replace(/[_\s]+/g, '-') || UNKNOWN_CATEGORY
  );
}

export function normalizeInstitutionName(
  value: string | null | undefined,
): string {
  // Institution identity must preserve word order and semantic words such as
  // "University". Only typography, punctuation and casing are normalized.
  return normalizeText(value);
}

export function isMeaningfulInstitutionName(
  value: string | null | undefined,
): boolean {
  const normalized = normalizeInstitutionName(value);
  if (!normalized || invalidInstitutionNames.has(normalized)) return false;
  if (!/\p{L}/u.test(normalized)) return false;
  if (normalized.includes('igem') && !normalized.includes('igem foundation'))
    return false;

  const semanticTokens = normalized
    .split(' ')
    .filter((token) => token !== 'igem' && !/^\d{4}$/.test(token));
  return (
    semanticTokens.length > 0 &&
    !invalidInstitutionNames.has(semanticTokens.join(' '))
  );
}

function uniquePush<T>(collection: T[], value: T): void {
  if (!collection.includes(value)) collection.push(value);
}

function institutionInput(
  input: RawInstitution | RawTeamInstitution,
):
  | (Required<Pick<RawInstitution, 'id' | 'name'>> &
      Pick<RawInstitution, 'country' | 'city'>)
  | null {
  const rawId = input.id ?? ('uuid' in input ? input.uuid : null);
  const name = (
    input.name?.trim() || (rawId == null ? '' : String(rawId).trim())
  )
    .replace(/^[\s.,;:|/\\-]+|[\s.,;:|/\\-]+$/g, '')
    .trim();
  if (!isMeaningfulInstitutionName(name)) return null;
  return {
    id: rawId ?? '',
    name,
    country: input.country?.trim().toUpperCase() ?? '',
    city: input.city ?? '',
  };
}

function normalizeMembershipRole(
  roleInferred: string | null | undefined,
  roleApi: string | null | undefined,
  isStudent: boolean,
  schemaVersion: number,
): string {
  const inferred = roleInferred?.trim() ?? '';
  const inferredKey = normalizeText(inferred);
  const apiKey = normalizeText(roleApi);

  // Schema v1/v2 inferred every generic student as an undergraduate. Preserve
  // the raw API role, but expose a neutral role until evidence exists.
  if (
    schemaVersion < 3 &&
    inferredKey === 'undergrad' &&
    (apiKey === 'student' || apiKey === 'student leader')
  ) {
    return 'Student';
  }

  const inferredRoles: Record<string, string> = {
    advisor: 'Advisor',
    graduate: 'Graduate',
    instructor: 'Instructor',
    other: 'Other',
    pi: 'PI',
    student: 'Student',
    undergrad: 'Undergrad',
    unknown: 'Unknown',
  };
  if (inferredRoles[inferredKey]) return inferredRoles[inferredKey];

  const apiRoles: Record<string, string> = {
    advisor: 'Advisor',
    'community mentor': 'Advisor',
    instructor: 'Instructor',
    other: 'Other',
    'primary pi': 'PI',
    'secondary pi': 'PI',
    student: 'Student',
    'student leader': 'Student',
  };
  return apiRoles[apiKey] ?? (isStudent ? 'Student' : 'Unknown');
}

function normalizeExportCategory(
  value: string | null | undefined,
  status: string | null | undefined,
  schemaVersion: number,
): TeamExportCategory {
  const category = normalizeCategory(value);
  if (
    category === 'accepted' ||
    category === 'withdrawn' ||
    category === 'disqualified' ||
    category === 'demo-test' ||
    category === 'review'
  ) {
    return category;
  }
  const normalizedStatus = normalizeCategory(status);
  if (
    normalizedStatus === 'accepted' ||
    normalizedStatus === 'withdrawn' ||
    normalizedStatus === 'disqualified'
  ) {
    return normalizedStatus;
  }
  return schemaVersion < 3 ? 'accepted' : 'review';
}

export function buildDatabase(raw: RawDataset): Database {
  const schemaVersion = raw.meta?.schema_version ?? 0;
  const rawTeams: Team[] = raw.teams.map((item) => {
    const exportCategory = normalizeExportCategory(
      item.export_category,
      item.status,
      schemaVersion,
    );
    return {
      id: item.id,
      name: item.name,
      year: item.year,
      competitionUuid: item.competition_uuid,
      slug: item.slug ?? '',
      status: normalizeCategory(item.status),
      exportCategory,
      defaultVisible:
        item.default_visible ??
        (schemaVersion < 3
          ? !['withdrawn', 'disqualified'].includes(exportCategory)
          : exportCategory === 'accepted'),
      detailFetchedAt: item.detail_fetched_at?.trim() ?? '',
      rosterFetchedAt: item.roster_fetched_at?.trim() ?? '',
      awardsFetchedAt: item.awards_fetched_at?.trim() ?? '',
      section: normalizeCategory(item.section),
      region: normalizeCategory(item.region),
      country: item.country?.trim().toUpperCase() || UNKNOWN_CATEGORY,
      city: item.city ?? '',
      organiserType: item.organiser_type ?? '',
      program: item.program ?? '',
      villageUuid: item.village_uuid ?? '',
      isRemote: item.is_remote ?? false,
      wikiUrl: safeExternalUrl(item.wiki_url),
      medal: item.medal ?? '',
      canonicalId: item.canonical_id ?? null,
      publishedMemberCount: item.published_member_count ?? 0,
      reportedMemberCount: item.all_member_count ?? 0,
      studentMemberCount: item.student_member_count ?? 0,
      pastExperienceCount: item.student_past_experience_count ?? 0,
      memberships: [],
      institutions: [],
      awardResults: [],
      searchText: normalizeText(
        [item.name, item.country, item.city, item.region, item.section].join(
          ' ',
        ),
      ),
    };
  });
  rawTeams.sort((a, b) => a.name.localeCompare(b.name));
  const teams = rawTeams.filter((team) => team.defaultVisible);
  const teamById = new Map(rawTeams.map((team) => [team.id, team]));

  const rawPeople: Person[] = raw.members.map((item) => ({
    id: item.uuid,
    name: item.name,
    username: item.username ?? '',
    institutionName: item.institution?.trim() ?? '',
    title: item.title?.trim() ?? '',
    affiliation: item.affiliation?.trim() ?? '',
    country: item.country ?? '',
    igemSince: item.igem_since ?? null,
    firstSeenYear: item.first_seen_year ?? null,
    lastSeenYear: item.last_seen_year ?? null,
    affiliationInstitution: null,
    memberships: [],
    searchText: normalizeText(
      [
        item.name,
        item.username,
        item.institution,
        item.title,
        item.country,
      ].join(' '),
    ),
  }));
  rawPeople.sort((a, b) => a.name.localeCompare(b.name));
  const personById = new Map(rawPeople.map((person) => [person.id, person]));

  for (const item of raw.roster) {
    const team = teamById.get(item.team_id);
    const person = personById.get(item.member_uuid);
    if (!team || !person) continue;

    const membership: Membership = {
      team,
      person,
      year: item.year ?? team.year,
      role: normalizeMembershipRole(
        item.role_inferred,
        item.role_api,
        item.is_student === true,
        schemaVersion,
      ),
      roleApi: item.role_api?.trim() ?? '',
      isStudent: item.is_student === true,
      institutionSnapshot: item.snapshot_institution?.trim() ?? '',
      titleSnapshot: item.snapshot_title?.trim() ?? '',
    };
    team.memberships.push(membership);
    person.memberships.push(membership);
  }
  if (raw.roster.length > 0) {
    const loadedTeamIds = new Set(raw.roster.map((item) => item.team_id));
    for (const teamId of loadedTeamIds) {
      const team = teamById.get(teamId);
      if (team) team.publishedMemberCount = team.memberships.length;
    }
  }
  for (const person of rawPeople) {
    const years = person.memberships.map((membership) => membership.year);
    if (!years.length) continue;
    person.firstSeenYear ??= Math.min(...years);
    person.lastSeenYear ??= Math.max(...years);
  }
  const people = raw.roster.length
    ? rawPeople.filter((person) =>
        person.memberships.some((membership) => membership.team.defaultVisible),
      )
    : rawPeople;

  const teamAwards: TeamAward[] = [];
  for (const item of raw.team_awards ?? []) {
    const team = teamById.get(item.team_id);
    if (!team) continue;
    const result: TeamAward = {
      team,
      awardUuid: item.award_uuid,
      title: item.title,
      decision: item.decision,
      group: item.group ?? '',
      type: item.award_type ?? '',
      subtype: item.award_subtype ?? '',
      iconUrl: item.icon_url ?? '',
      villageUuid: item.village_uuid ?? '',
    };
    team.awardResults.push(result);
    if (team.defaultVisible) teamAwards.push(result);
    if (
      !team.medal &&
      result.type === 'medal' &&
      result.decision === 'winner'
    ) {
      team.medal = result.subtype || result.title;
    }
  }

  const institutions: Institution[] = [];
  const officialById = new Map<string, Institution>();
  const officialByNameCountry = new Map<string, Institution | null>();
  const officialByName = new Map<string, Institution | null>();
  const fallbackOfficialByIdentity = new Map<string, Institution>();
  const memberAffiliationByName = new Map<string, Institution>();

  const updateInstitutionMetadata = (
    institution: Institution,
    normalized: NonNullable<ReturnType<typeof institutionInput>>,
  ) => {
    if (!institution.country && normalized.country)
      institution.country = normalized.country;
    if (!institution.city && normalized.city)
      institution.city = normalized.city;
    institution.searchText = normalizeText(
      [institution.name, institution.country, institution.city].join(' '),
    );
  };

  const indexUniqueInstitution = (
    index: Map<string, Institution | null>,
    key: string,
    institution: Institution,
  ) => {
    if (!key) return;
    if (!index.has(key)) {
      index.set(key, institution);
      return;
    }
    if (index.get(key) !== institution) index.set(key, null);
  };

  const createInstitution = (
    normalized: NonNullable<ReturnType<typeof institutionInput>>,
    id: string,
    source: Institution['source'],
    officialId: string | null,
  ): Institution => {
    const institution: Institution = {
      id,
      officialId,
      name: normalized.name,
      country: normalized.country ?? '',
      city: normalized.city ?? '',
      source,
      teams: [],
      people: [],
      searchText: normalizeText(
        [normalized.name, normalized.country, normalized.city].join(' '),
      ),
    };
    institutions.push(institution);
    return institution;
  };

  const registerOfficialInstitution = (
    input: RawInstitution | RawTeamInstitution,
  ): Institution | null => {
    const normalized = institutionInput(input);
    if (!normalized) return null;

    const explicitId = String(normalized.id).trim();
    const nameKey = normalizeInstitutionName(normalized.name);
    const nameCountryKey = `${normalized.country || UNKNOWN_CATEGORY}\u0000${nameKey}`;
    if (explicitId) {
      const existing = officialById.get(explicitId);
      if (existing) {
        updateInstitutionMetadata(existing, normalized);
        return existing;
      }
    } else {
      const countryMatch = officialByNameCountry.get(nameCountryKey);
      if (countryMatch) {
        updateInstitutionMetadata(countryMatch, normalized);
        return countryMatch;
      }
      if (!normalized.country) {
        const uniqueNameMatch = officialByName.get(nameKey);
        if (uniqueNameMatch) {
          updateInstitutionMetadata(uniqueNameMatch, normalized);
          return uniqueNameMatch;
        }
      }
      const fallbackMatch = fallbackOfficialByIdentity.get(nameCountryKey);
      if (fallbackMatch) {
        updateInstitutionMetadata(fallbackMatch, normalized);
        return fallbackMatch;
      }
    }

    const id =
      explicitId ||
      `official:${normalized.country || UNKNOWN_CATEGORY}:${nameKey}`;
    const institution = createInstitution(
      normalized,
      id,
      'official-team',
      explicitId || null,
    );
    if (explicitId) officialById.set(explicitId, institution);
    else fallbackOfficialByIdentity.set(nameCountryKey, institution);
    indexUniqueInstitution(officialByNameCountry, nameCountryKey, institution);
    indexUniqueInstitution(officialByName, nameKey, institution);
    return institution;
  };

  for (const item of raw.institutions ?? []) registerOfficialInstitution(item);

  for (const rawTeam of raw.teams) {
    const team = teamById.get(rawTeam.id);
    if (!team) continue;
    for (const item of rawTeam.institutions ?? []) {
      if (!item.name && !item.id && !item.uuid) continue;
      const institution = registerOfficialInstitution(item);
      if (!institution) continue;
      uniquePush(team.institutions, institution);
      if (team.defaultVisible) uniquePush(institution.teams, team);
    }
  }

  for (const person of people) {
    if (!isMeaningfulInstitutionName(person.institutionName)) continue;
    const nameKey = normalizeInstitutionName(person.institutionName);
    let institution = memberAffiliationByName.get(nameKey);
    if (!institution) {
      const normalized = institutionInput({
        id: '',
        name: person.institutionName,
      });
      if (!normalized) continue;
      institution = createInstitution(
        normalized,
        `member-affiliation:${nameKey}`,
        'member-affiliation',
        null,
      );
      memberAffiliationByName.set(nameKey, institution);
    }
    uniquePush(institution.people, person);
    person.affiliationInstitution = institution;
  }

  institutions.sort((a, b) => a.name.localeCompare(b.name));
  const officialInstitutions = institutions.filter(
    (institution) =>
      institution.source === 'official-team' && institution.teams.length > 0,
  );
  const institutionById = new Map(
    officialInstitutions.map((item) => [item.id, item]),
  );
  const years = teams.map((team) => team.year);
  const uniqueYears = [...new Set(years)].sort((a, b) => a - b);
  const teamsByYear = new Map<number, Team[]>();
  for (const team of teams) {
    const yearTeams = teamsByYear.get(team.year) ?? [];
    yearTeams.push(team);
    teamsByYear.set(team.year, yearTeams);
  }
  const coverageByYear = new Map(
    (raw.meta?.coverage ?? []).map((item) => [item.year, item]),
  );
  const maxYear = years.length ? Math.max(...years) : 0;
  const competitions: Competition[] = (
    raw.competitions ??
    uniqueYears.map((year) => ({
      uuid: teamsByYear.get(year)?.[0]?.competitionUuid ?? String(year),
      year,
      status: year === maxYear ? 'live' : 'archived',
      wiki_slug: String(year),
    }))
  )
    .map((item) => ({
      uuid: item.uuid,
      year: item.year,
      wikiSlug: item.wiki_slug ?? String(item.year),
      status: normalizeCategory(item.status),
      teams: teamsByYear.get(item.year) ?? [],
      coverage: coverageByYear.get(item.year),
    }))
    .filter((item) => item.teams.length > 0)
    .sort((a, b) => b.year - a.year);

  const awards = [...(raw.awards ?? [])].sort((a, b) =>
    a.title.localeCompare(b.title),
  );
  const entityCounts = raw.meta?.entity_counts;
  const rawOfficialInstitutionCount = institutions.filter(
    (institution) => institution.source === 'official-team',
  ).length;
  const officialInstitutionCount = officialInstitutions.length;
  const memberAffiliationInstitutionCount = institutions.filter(
    (institution) =>
      institution.source === 'member-affiliation' &&
      institution.people.length > 0,
  ).length;
  const declaredOfficialInstitutionCount = entityCounts?.institutions ?? 0;

  return {
    teams,
    rawTeams,
    people,
    institutions: officialInstitutions,
    awards,
    teamAwards,
    competitions,
    generatedAt: raw.meta?.generated_at ?? '',
    // Display-only metadata; hrefs use the hardcoded constant below so a
    // tampered meta.source can never become a link target.
    sourceUrl: safeExternalUrl(raw.meta?.source) || 'https://api.igem.org/v1',
    stats: {
      year: years.length ? Math.max(...years) : 0,
      minYear: years.length ? Math.min(...years) : 0,
      maxYear,
      yearCount: uniqueYears.length,
      teamCount: rawTeams.length ? teams.length : entityCounts?.teams || 0,
      rawTeamCount:
        rawTeams.length || entityCounts?.raw_teams || entityCounts?.teams || 0,
      hiddenTeamCount: rawTeams.length
        ? rawTeams.length - teams.length
        : Math.max(
            (entityCounts?.raw_teams || entityCounts?.teams || 0) -
              (entityCounts?.teams || 0),
            0,
          ),
      acceptedTeamCount: rawTeams.filter((team) => team.status === 'accepted')
        .length,
      withdrawnTeamCount: rawTeams.filter((team) => team.status === 'withdrawn')
        .length,
      disqualifiedTeamCount: rawTeams.filter(
        (team) => team.status === 'disqualified',
      ).length,
      demoTestTeamCount: rawTeams.filter(
        (team) => team.exportCategory === 'demo-test',
      ).length,
      reviewTeamCount: rawTeams.filter(
        (team) => team.exportCategory === 'review',
      ).length,
      publishedPeopleCount: raw.members.length
        ? people.length
        : entityCounts?.members || 0,
      membershipCount: raw.roster.length
        ? raw.roster.filter(
            (membership) =>
              teamById.get(membership.team_id)?.defaultVisible === true,
          ).length
        : entityCounts?.roster || 0,
      countryCount: new Set(
        teams
          .map((team) => team.country)
          .filter((value) => value !== UNKNOWN_CATEGORY),
      ).size,
      regionCount: new Set(
        teams
          .map((team) => team.region)
          .filter((value) => value !== UNKNOWN_CATEGORY),
      ).size,
      institutionCount:
        rawOfficialInstitutionCount > 0
          ? officialInstitutions.length
          : declaredOfficialInstitutionCount,
      officialInstitutionCount:
        rawOfficialInstitutionCount > 0
          ? officialInstitutionCount
          : declaredOfficialInstitutionCount,
      memberAffiliationInstitutionCount,
      unknownCountryCount: teams.filter(
        (team) => team.country === UNKNOWN_CATEGORY,
      ).length,
      unknownRegionCount: teams.filter(
        (team) => team.region === UNKNOWN_CATEGORY,
      ).length,
      unknownSectionCount: teams.filter(
        (team) => team.section === UNKNOWN_CATEGORY,
      ).length,
      unknownRoleMembershipCount: raw.roster.length
        ? people.reduce(
            (count, person) =>
              count +
              person.memberships.filter(
                (membership) =>
                  membership.team.defaultVisible &&
                  membership.role === 'Unknown',
              ).length,
            0,
          )
        : 0,
      awardCount: awards.length || entityCounts?.awards || 0,
      teamAwardCount: (raw.team_awards ?? []).length
        ? teamAwards.length
        : entityCounts?.team_awards || 0,
      winningResultCount: teamAwards.filter(
        (item) => item.decision === 'winner' && item.type !== 'medal',
      ).length,
      medalCount: teamAwards.filter(
        (item) => item.decision === 'winner' && item.type === 'medal',
      ).length,
    },
    teamById,
    personById,
    institutionById,
  };
}

function searchScore(text: string, query: string): number {
  if (text === query) return 100;
  if (text.startsWith(query)) return 60;
  const boundaryIndex = text.indexOf(` ${query}`);
  if (boundaryIndex >= 0) return 40 - boundaryIndex / 1000;
  const index = text.indexOf(query);
  return index >= 0 ? 20 - index / 1000 : -1;
}

interface SearchIndexEntry {
  text: string;
  scoreBoost: number;
  result: SearchResult;
}

const searchIndexes = new WeakMap<Database, SearchIndexEntry[]>();
const searchCaches = new WeakMap<Database, Map<string, SearchResult[]>>();

function getSearchIndex(database: Database): SearchIndexEntry[] {
  const existing = searchIndexes.get(database);
  if (existing) return existing;

  const index: SearchIndexEntry[] = [
    ...database.teams.map((team) => ({
      text: team.searchText,
      scoreBoost: 0,
      result: {
        type: 'team' as const,
        id: String(team.id),
        title: team.name,
        meta: [
          team.year,
          team.city,
          team.country === UNKNOWN_CATEGORY ? '' : team.country,
        ]
          .filter(Boolean)
          .join(' · '),
        href: `/teams/${team.id}`,
      },
    })),
    ...database.people.map((person) => ({
      text: person.searchText,
      scoreBoost: 2,
      result: {
        type: 'person' as const,
        id: person.id,
        title: person.name,
        meta: [person.title, person.institutionName]
          .filter(Boolean)
          .join(' · '),
        href: `/people/${person.id}`,
      },
    })),
    ...database.institutions.map((institution) => ({
      text: institution.searchText,
      scoreBoost: 1,
      result: {
        type: 'institution' as const,
        id: institution.id,
        title: institution.name,
        meta: [institution.city, institution.country]
          .filter(Boolean)
          .join(' · '),
        href: `/institutions/${encodeURIComponent(institution.id)}`,
      },
    })),
  ];
  searchIndexes.set(database, index);
  return index;
}

export function searchDatabase(
  database: Database,
  value: string,
  limit = 9,
): SearchResult[] {
  const query = normalizeText(value);
  const resultLimit = Math.max(0, Math.floor(limit));
  if (query.length < 2 || resultLimit === 0) return [];

  let cache = searchCaches.get(database);
  if (!cache) {
    cache = new Map();
    searchCaches.set(database, cache);
  }
  const cacheKey = `${query}\u0000${resultLimit}`;
  const cached = cache.get(cacheKey);
  if (cached) return [...cached];

  const candidates: Array<{ entry: SearchIndexEntry; score: number }> = [];
  for (const entry of getSearchIndex(database)) {
    const rawScore = searchScore(entry.text, query);
    if (rawScore < 0) continue;
    const candidate = { entry, score: rawScore + entry.scoreBoost };
    const insertionIndex = candidates.findIndex(
      (existing) =>
        candidate.score > existing.score ||
        (candidate.score === existing.score &&
          candidate.entry.result.title.localeCompare(
            existing.entry.result.title,
          ) < 0),
    );
    if (insertionIndex < 0) candidates.push(candidate);
    else candidates.splice(insertionIndex, 0, candidate);
    if (candidates.length > resultLimit) candidates.pop();
  }

  const results = candidates.map((candidate) => candidate.entry.result);
  if (cache.size >= 64) cache.delete(cache.keys().next().value as string);
  cache.set(cacheKey, results);
  return [...results];
}

export let database: Database;

export function initializeDatabase(raw: RawDataset): Database {
  database = buildDatabase(raw);
  return database;
}

export async function loadDatabase(
  sourceUrl = `${import.meta.env.BASE_URL}data/igem.json`,
): Promise<Database> {
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`数据文件加载失败（HTTP ${response.status}）`);
  }
  return initializeDatabase((await response.json()) as RawDataset);
}
