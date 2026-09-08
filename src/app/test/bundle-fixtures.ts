export type CompactPersonRow = [
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

export type CompactRosterRow = [
  teamId: number,
  personIndex: number,
  year: number | null,
  inferredRole: string,
  apiRole: string,
  isStudent: 0 | 1,
];

export interface CompactPeopleBundleLike {
  schema_version: number;
  people: CompactPersonRow[];
  roster: CompactRosterRow[];
}

export function memberRow(uuid: string, name: string): CompactPersonRow {
  return [uuid, name, '', '', '', '', '', null, null, null];
}

export function buildCompactBundle(
  people: CompactPersonRow[],
  roster: CompactRosterRow[],
): CompactPeopleBundleLike {
  return { schema_version: 1, people, roster };
}
