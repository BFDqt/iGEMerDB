import {
  buildDatabase,
  database,
  normalizeInstitutionName,
  normalizeText,
  searchDatabase,
  UNKNOWN_CATEGORY,
} from './data';
import type { RawDataset } from './types';

describe('data index', () => {
  it('builds the multi-year fixture with schema-v3 metadata and awards', () => {
    expect(database.stats).toMatchObject({
      year: 2026,
      minYear: 2008,
      maxYear: 2026,
      yearCount: 8,
      teamCount: 26,
      rawTeamCount: 30,
      hiddenTeamCount: 4,
      acceptedTeamCount: 27,
      withdrawnTeamCount: 2,
      disqualifiedTeamCount: 1,
      demoTestTeamCount: 1,
      publishedPeopleCount: 582,
      membershipCount: 622,
      awardCount: 37,
      teamAwardCount: 55,
      winningResultCount: 12,
      medalCount: 19,
    });
    const aachen = database.teamById.get(5587);
    expect(aachen).toMatchObject({ medal: 'gold' });
    expect(aachen?.awardResults.length).toBeGreaterThan(0);
    expect(database.institutions.length).toBeGreaterThanOrEqual(26);
  });

  it('links public roster entries in both directions', () => {
    const team = database.teamById.get(5587);
    expect(team).toBeDefined();
    expect(team?.publishedMemberCount).toBeGreaterThan(0);
    const membership = team?.memberships[0];
    expect(membership?.person.memberships).toContain(membership);
    expect(membership?.team).toBe(team);
  });

  it('normalizes accents, punctuation, dashes and case for search', () => {
    expect(normalizeText('  Île–de_France  ')).toBe('ile de france');
    expect(searchDatabase(database, 'Alexa')[0]).toMatchObject({
      type: 'person',
      title: 'Alexa Stermann',
    });
    expect(searchDatabase(database, 'a')).toEqual([]);
  });

  it('keeps official team institutions separate from member affiliations', () => {
    const institution = database.institutionById.get('RWTH Aachen University');
    expect(institution).toBeDefined();
    expect(institution?.source).toBe('official-team');
    expect(institution?.people).toHaveLength(0);
    expect(institution?.teams.some((team) => team.id === 5587)).toBe(true);

    const memberRecord = database.people.find(
      (person) => person.institutionName === 'RWTH Aachen University',
    )?.affiliationInstitution;
    expect(memberRecord?.people.length).toBeGreaterThan(0);
    expect(memberRecord?.teams).toHaveLength(0);
    expect(database.institutions).not.toContain(memberRecord);
    expect(database.institutionById.has(memberRecord?.id ?? '')).toBe(false);
  });
});

describe('buildDatabase resilience', () => {
  it('ignores orphan roster rows instead of crashing', () => {
    const minimal: RawDataset = {
      institutions: [],
      teams: [],
      members: [],
      awards: [],
      roster: [
        {
          team_id: 404,
          member_uuid: 'missing',
          year: 2025,
          role_api: 'student',
          role_inferred: 'Undergrad',
          is_student: true,
        },
      ],
    };
    expect(buildDatabase(minimal).stats.teamCount).toBe(0);
  });

  it('builds cross-year memberships and official team-award relations', () => {
    const raw: RawDataset = {
      competitions: [
        { uuid: 'c-2024', year: 2024, status: 'archived' },
        { uuid: 'c-2025', year: 2025, status: 'archived' },
      ],
      institutions: [],
      teams: [
        { id: 1, name: 'Example', year: 2024, competition_uuid: 'c-2024' },
        { id: 2, name: 'Example', year: 2025, competition_uuid: 'c-2025' },
      ],
      members: [{ uuid: 'person-1', name: 'Ada Example' }],
      roster: [
        {
          team_id: 1,
          member_uuid: 'person-1',
          role_api: 'student',
          role_inferred: 'Undergrad',
          is_student: true,
        },
        {
          team_id: 2,
          member_uuid: 'person-1',
          year: 2025,
          role_api: 'student',
          role_inferred: 'Undergrad',
          is_student: true,
        },
      ],
      awards: [],
      team_awards: [
        {
          team_id: 2,
          award_uuid: 'gold-2025',
          title: 'Gold',
          decision: 'winner',
          award_type: 'medal',
          award_subtype: 'gold',
        },
      ],
    };
    const result = buildDatabase(raw);
    expect(result.stats).toMatchObject({
      minYear: 2024,
      maxYear: 2025,
      yearCount: 2,
      medalCount: 1,
    });
    expect(result.personById.get('person-1')?.memberships).toHaveLength(2);
    expect(result.personById.get('person-1')).toMatchObject({
      firstSeenYear: 2024,
      lastSeenYear: 2025,
    });
    expect(
      result.personById
        .get('person-1')
        ?.memberships.every((membership) => membership.role === 'Student'),
    ).toBe(true);
    expect(result.teamById.get(2)?.medal).toBe('gold');
    expect(result.teamById.get(2)?.awardResults[0]?.title).toBe('Gold');
  });

  it('does not merge institutions by sorted words or across countries', () => {
    const names = [
      ['University of Miami', 'USA', 'Coral Gables'],
      ['Miami University', 'USA', 'Oxford'],
      ['Newcastle University', 'GBR', 'Newcastle upon Tyne'],
      ['University of Newcastle', 'AUS', 'Newcastle'],
    ] as const;
    const raw: RawDataset = {
      institutions: names.map(([name, country, city]) => ({
        id: name,
        name,
        country,
        city,
      })),
      teams: names.map(([name, country, city], index) => ({
        id: index + 1,
        name: `Team ${index + 1}`,
        year: 2025,
        competition_uuid: 'c-2025',
        country,
        city,
        institutions: [{ name, country, city }],
      })),
      members: [],
      roster: [],
      awards: [],
    };

    const result = buildDatabase(raw);
    expect(result.institutions).toHaveLength(4);
    expect(normalizeInstitutionName('University of Miami')).not.toBe(
      normalizeInstitutionName('Miami University'),
    );
    expect(result.institutionById.get('Newcastle University')).toMatchObject({
      country: 'GBR',
      teams: [{ id: 3 }],
    });
    expect(result.institutionById.get('University of Newcastle')).toMatchObject(
      {
        country: 'AUS',
        teams: [{ id: 4 }],
      },
    );
  });

  it('quarantines obvious affiliation garbage and never creates team edges from profiles', () => {
    const officialName = 'Massachusetts Institute of Technology';
    const raw: RawDataset = {
      institutions: [
        {
          id: 'mit-official',
          name: officialName,
          country: 'USA',
          city: 'Cambridge',
        },
      ],
      teams: [
        {
          id: 1,
          name: 'MIT Test',
          year: 2025,
          competition_uuid: 'c-2025',
          country: 'USA',
          institutions: [
            { name: officialName, country: 'USA', city: 'Cambridge' },
          ],
        },
      ],
      members: [
        { uuid: 'valid', name: 'Valid Person', institution: officialName },
        { uuid: 'none', name: 'None Person', institution: 'None' },
        { uuid: 'dots', name: 'Dots Person', institution: '..' },
        { uuid: 'student', name: 'Student Person', institution: 'Student' },
        { uuid: 'year', name: 'Year Person', institution: '2025 iGEM' },
        { uuid: 'cn', name: 'Generic Person', institution: '学生' },
        {
          uuid: 'team-name',
          name: 'Team Person',
          institution: '2025 iGEM BWYA-China',
        },
      ],
      roster: [],
      awards: [],
    };

    const result = buildDatabase(raw);
    const official = result.institutionById.get('mit-official');
    const affiliation = result.personById.get('valid')?.affiliationInstitution;
    expect(official).toMatchObject({ source: 'official-team', people: [] });
    expect(official?.teams.map((team) => team.id)).toEqual([1]);
    expect(affiliation).toMatchObject({
      source: 'member-affiliation',
      teams: [],
    });
    expect(affiliation?.id).not.toBe(official?.id);
    expect(
      result.institutions.every((item) => item.source === 'official-team'),
    ).toBe(true);
    expect(result.institutionById.has(affiliation?.id ?? '')).toBe(false);
    expect(result.personById.get('none')?.affiliationInstitution).toBeNull();
    expect(result.personById.get('dots')?.affiliationInstitution).toBeNull();
    expect(result.personById.get('student')?.affiliationInstitution).toBeNull();
    expect(result.personById.get('year')?.affiliationInstitution).toBeNull();
    expect(result.personById.get('cn')?.affiliationInstitution).toBeNull();
    expect(
      result.personById.get('team-name')?.affiliationInstitution,
    ).toBeNull();
    expect(
      result.institutions.some((institution) =>
        ['none', 'student', '2025 igem'].includes(
          normalizeInstitutionName(institution.name),
        ),
      ),
    ).toBe(false);
  });

  it('materializes missing categories so distributions conserve their total', () => {
    const raw: RawDataset = {
      institutions: [],
      teams: [
        {
          id: 1,
          name: 'Known',
          year: 2025,
          competition_uuid: 'c',
          section: 'undergrad',
        },
        { id: 2, name: 'Missing', year: 2025, competition_uuid: 'c' },
      ],
      members: [],
      roster: [],
      awards: [],
    };
    const result = buildDatabase(raw);
    const sectionCounts = new Map<string, number>();
    for (const team of result.teams) {
      sectionCounts.set(
        team.section,
        (sectionCounts.get(team.section) ?? 0) + 1,
      );
    }

    expect(result.teamById.get(2)).toMatchObject({
      country: UNKNOWN_CATEGORY,
      region: UNKNOWN_CATEGORY,
      section: UNKNOWN_CATEGORY,
    });
    expect(result.stats).toMatchObject({
      unknownCountryCount: 2,
      unknownRegionCount: 2,
      unknownSectionCount: 1,
    });
    expect(
      [...sectionCounts.values()].reduce((sum, count) => sum + count, 0),
    ).toBe(result.teams.length);
  });

  it('uses declared counts and per-team roster counts for a core-only payload', () => {
    const raw: RawDataset = {
      meta: {
        schema_version: 3,
        generated_at: '2026-07-22T00:00:00Z',
        source: 'https://api.igem.org/v1',
        coverage: [],
        entity_counts: {
          teams: 1,
          members: 80,
          roster: 120,
          awards: 7,
          team_awards: 12,
          institutions: 3,
        },
      },
      institutions: [],
      teams: [
        {
          id: 1,
          name: 'Core Team',
          year: 2026,
          competition_uuid: 'c-2026',
          status: 'accepted',
          export_category: 'accepted',
          default_visible: true,
          published_member_count: 14,
        },
      ],
      members: [],
      roster: [],
      awards: [],
      team_awards: [],
    };
    const result = buildDatabase(raw);
    expect(result.teamById.get(1)?.publishedMemberCount).toBe(14);
    expect(result.stats).toMatchObject({
      publishedPeopleCount: 80,
      membershipCount: 120,
      awardCount: 7,
      teamAwardCount: 12,
      institutionCount: 3,
      officialInstitutionCount: 3,
    });
  });

  it('only replaces published counts for teams present in a partial roster shard', () => {
    const raw: RawDataset = {
      meta: {
        schema_version: 3,
        generated_at: '',
        source: '',
        coverage: [],
      },
      institutions: [],
      teams: [
        {
          id: 1,
          name: 'Loaded Team',
          year: 2026,
          competition_uuid: 'c',
          status: 'accepted',
          export_category: 'accepted',
          default_visible: true,
          published_member_count: 9,
        },
        {
          id: 2,
          name: 'Unloaded Team',
          year: 2026,
          competition_uuid: 'c',
          status: 'accepted',
          export_category: 'accepted',
          default_visible: true,
          published_member_count: 5,
        },
      ],
      members: [{ uuid: 'member', name: 'Loaded Member' }],
      roster: [
        {
          team_id: 1,
          member_uuid: 'member',
          role_api: 'student',
          role_inferred: 'Student',
          is_student: true,
        },
      ],
      awards: [],
    };
    const result = buildDatabase(raw);
    expect(result.teamById.get(1)?.publishedMemberCount).toBe(1);
    expect(result.teamById.get(2)?.publishedMemberCount).toBe(5);
  });

  it('keeps explicit schema-v3 roles and treats absent roles as unknown', () => {
    const raw: RawDataset = {
      meta: {
        schema_version: 3,
        generated_at: '',
        source: '',
        coverage: [],
      },
      institutions: [],
      teams: [
        {
          id: 1,
          name: 'Roles',
          year: 2026,
          competition_uuid: 'c',
          status: 'accepted',
          export_category: 'accepted',
          default_visible: true,
        },
      ],
      members: [
        { uuid: 'student', name: 'Student' },
        { uuid: 'unknown', name: 'Unknown' },
      ],
      roster: [
        {
          team_id: 1,
          member_uuid: 'student',
          role_api: 'student',
          role_inferred: 'Student',
          is_student: true,
        },
        { team_id: 1, member_uuid: 'unknown', is_student: false },
      ],
      awards: [],
    };
    const result = buildDatabase(raw);
    expect(result.personById.get('student')?.memberships[0]?.role).toBe(
      'Student',
    );
    expect(result.personById.get('unknown')?.memberships[0]?.role).toBe(
      'Unknown',
    );
    expect(result.stats.unknownRoleMembershipCount).toBe(1);
  });

  it('keeps quarantined teams auditable while excluding them from default indexes', () => {
    const raw: RawDataset = {
      meta: {
        schema_version: 3,
        generated_at: '',
        source: '',
        coverage: [],
      },
      institutions: [],
      teams: [
        {
          id: 1,
          name: 'Accepted',
          year: 2026,
          competition_uuid: 'c',
          status: 'accepted',
          export_category: 'accepted',
          default_visible: true,
        },
        {
          id: 2,
          name: 'Withdrawn',
          year: 2026,
          competition_uuid: 'c',
          status: 'withdrawn',
          export_category: 'withdrawn',
          default_visible: false,
        },
        {
          id: 3,
          name: 'Registry Example',
          year: 2026,
          competition_uuid: 'c',
          status: 'accepted',
          export_category: 'demo-test',
          default_visible: false,
        },
        {
          id: 4,
          name: 'Disqualified',
          year: 2026,
          competition_uuid: 'c',
          status: 'disqualified',
          export_category: 'disqualified',
          default_visible: false,
        },
      ],
      members: [
        { uuid: 'visible', name: 'Visible Person' },
        { uuid: 'hidden', name: 'Hidden Person' },
      ],
      roster: [
        {
          team_id: 1,
          member_uuid: 'visible',
          role_api: 'student',
          role_inferred: 'Student',
          is_student: true,
        },
        {
          team_id: 2,
          member_uuid: 'hidden',
          role_api: 'student',
          role_inferred: 'Student',
          is_student: true,
        },
      ],
      awards: [],
    };
    const result = buildDatabase(raw);

    expect(result.teams.map((team) => team.id)).toEqual([1]);
    expect(result.rawTeams).toHaveLength(4);
    expect(result.teamById.get(2)).toMatchObject({
      status: 'withdrawn',
      defaultVisible: false,
    });
    expect(result.people.map((person) => person.id)).toEqual(['visible']);
    expect(result.personById.has('hidden')).toBe(true);
    expect(result.competitions[0]?.teams.map((team) => team.id)).toEqual([1]);
    expect(result.stats).toMatchObject({
      teamCount: 1,
      rawTeamCount: 4,
      hiddenTeamCount: 3,
      acceptedTeamCount: 2,
      withdrawnTeamCount: 1,
      disqualifiedTeamCount: 1,
      demoTestTeamCount: 1,
      membershipCount: 1,
    });
  });
});
