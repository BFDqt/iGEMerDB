export interface RawInstitution {
  id: string | number;
  name: string;
  country?: string | null;
  city?: string | null;
}

export interface RawTeamInstitution {
  id?: string | number | null;
  uuid?: string | null;
  name?: string | null;
  country?: string | null;
  city?: string | null;
}

export type TeamExportCategory =
  'accepted' | 'withdrawn' | 'disqualified' | 'demo-test' | 'review';

export interface RawTeam {
  id: number;
  name: string;
  year: number;
  competition_uuid: string;
  slug?: string | null;
  status?: string | null;
  export_category?: TeamExportCategory | null;
  default_visible?: boolean | null;
  section?: string | null;
  region?: string | null;
  country?: string | null;
  city?: string | null;
  organiser_type?: string | null;
  program?: string | null;
  village_uuid?: string | null;
  is_remote?: boolean | null;
  wiki_url?: string | null;
  medal?: string | null;
  canonical_id?: number | null;
  institutions?: RawTeamInstitution[] | null;
  all_member_count?: number;
  published_member_count?: number;
  student_member_count?: number;
  student_past_experience_count?: number;
  detail_fetched?: boolean;
  roster_fetched?: boolean;
  awards_fetched?: boolean;
  detail_fetched_at?: string | null;
  roster_fetched_at?: string | null;
  awards_fetched_at?: string | null;
  fetch_error?: string | null;
}

export interface RawMember {
  uuid: string;
  name: string;
  name_norm?: string | null;
  username?: string | null;
  institution?: string | null;
  title?: string | null;
  affiliation?: string | null;
  country?: string | null;
  igem_since?: number | null;
  first_seen_year?: number | null;
  last_seen_year?: number | null;
}

export interface RawRosterEntry {
  team_id: number;
  member_uuid: string;
  year?: number;
  role_api?: string | null;
  role_inferred?: string | null;
  is_student?: boolean | null;
  snapshot_institution?: string | null;
  snapshot_title?: string | null;
}

export interface RawAward {
  uuid: string;
  competition_uuid: string;
  title: string;
  description?: string | null;
  icon_url?: string | null;
  award_type?: string | null;
  award_subtype?: string | null;
  village_uuid?: string | null;
}

export interface RawTeamAward {
  team_id: number;
  award_uuid: string;
  title: string;
  decision: string;
  group?: string | null;
  award_type?: string | null;
  award_subtype?: string | null;
  icon_url?: string | null;
  village_uuid?: string | null;
}

export interface RawCompetition {
  uuid: string;
  year: number;
  wiki_slug?: string | null;
  status?: string | null;
}

export interface RawCoverage {
  year: number;
  competition_uuid: string;
  status?: string | null;
  team_count: number;
  detail_fetched_count: number;
  roster_fetched_count: number;
  teams_with_public_roster: number;
  awards_fetched_count: number;
  teams_with_awards: number;
  fetch_error_count: number;
  status_counts?: Record<string, number>;
  export_category_counts?: Record<string, number>;
  default_visible_count?: number;
}

export interface RawDatasetMeta {
  schema_version: number;
  generated_at: string;
  source: string;
  coverage: RawCoverage[];
  entity_counts?: {
    teams: number;
    members: number;
    roster: number;
    awards: number;
    team_awards: number;
    institutions: number;
    raw_teams?: number;
    raw_members?: number;
    raw_roster?: number;
    raw_team_awards?: number;
  };
  status_policy?: {
    team_statuses: string[];
    note: string;
  };
  export_policy?: {
    version: number;
    default_visible_categories: TeamExportCategory[];
    quarantined_categories: TeamExportCategory[];
    demo_test_name_allowlist: string[];
    note: string;
  };
}

export interface RawDataset {
  meta?: RawDatasetMeta;
  competitions?: RawCompetition[];
  institutions: RawInstitution[];
  teams: RawTeam[];
  members: RawMember[];
  roster: RawRosterEntry[];
  awards: RawAward[];
  team_awards?: RawTeamAward[];
}

export interface Membership {
  team: Team;
  person: Person;
  year: number;
  role: string;
  roleApi: string;
  isStudent: boolean;
  institutionSnapshot: string;
  titleSnapshot: string;
}

export interface Team {
  id: number;
  name: string;
  year: number;
  competitionUuid: string;
  slug: string;
  status: string;
  exportCategory: TeamExportCategory;
  defaultVisible: boolean;
  detailFetchedAt: string;
  rosterFetchedAt: string;
  awardsFetchedAt: string;
  section: string;
  region: string;
  country: string;
  city: string;
  organiserType: string;
  program: string;
  villageUuid: string;
  isRemote: boolean;
  wikiUrl: string;
  medal: string;
  canonicalId: number | null;
  publishedMemberCount: number;
  reportedMemberCount: number;
  studentMemberCount: number;
  pastExperienceCount: number;
  memberships: Membership[];
  institutions: Institution[];
  awardResults: TeamAward[];
  searchText: string;
}

export interface TeamAward {
  team: Team;
  awardUuid: string;
  title: string;
  decision: string;
  group: string;
  type: string;
  subtype: string;
  iconUrl: string;
  villageUuid: string;
}

export interface Competition {
  uuid: string;
  year: number;
  wikiSlug: string;
  status: string;
  teams: Team[];
  coverage?: RawCoverage;
}

export interface Person {
  id: string;
  name: string;
  username: string;
  institutionName: string;
  title: string;
  affiliation: string;
  country: string;
  igemSince: number | null;
  firstSeenYear: number | null;
  lastSeenYear: number | null;
  affiliationInstitution: Institution | null;
  memberships: Membership[];
  searchText: string;
}

export interface Institution {
  id: string;
  officialId: string | null;
  name: string;
  country: string;
  city: string;
  source: 'official-team' | 'member-affiliation';
  teams: Team[];
  people: Person[];
  searchText: string;
}

export interface DatasetStats {
  year: number;
  minYear: number;
  maxYear: number;
  yearCount: number;
  teamCount: number;
  rawTeamCount: number;
  hiddenTeamCount: number;
  acceptedTeamCount: number;
  withdrawnTeamCount: number;
  disqualifiedTeamCount: number;
  demoTestTeamCount: number;
  reviewTeamCount: number;
  publishedPeopleCount: number;
  membershipCount: number;
  countryCount: number;
  regionCount: number;
  institutionCount: number;
  officialInstitutionCount: number;
  memberAffiliationInstitutionCount: number;
  unknownCountryCount: number;
  unknownRegionCount: number;
  unknownSectionCount: number;
  unknownRoleMembershipCount: number;
  awardCount: number;
  teamAwardCount: number;
  winningResultCount: number;
  medalCount: number;
}

export interface Database {
  teams: Team[];
  rawTeams: Team[];
  people: Person[];
  institutions: Institution[];
  awards: RawAward[];
  teamAwards: TeamAward[];
  competitions: Competition[];
  generatedAt: string;
  sourceUrl: string;
  stats: DatasetStats;
  teamById: Map<number, Team>;
  personById: Map<string, Person>;
  institutionById: Map<string, Institution>;
}

export type SearchResult =
  | { type: 'team'; id: string; title: string; meta: string; href: string }
  | { type: 'person'; id: string; title: string; meta: string; href: string }
  | {
      type: 'institution';
      id: string;
      title: string;
      meta: string;
      href: string;
    };
