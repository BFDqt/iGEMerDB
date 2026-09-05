import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const webRoot = join(projectRoot, 'public', 'data', 'web');

function fail(message) {
  throw new Error(`Web data validation failed: ${message}`);
}

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

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

const manifest = await readJson(join(webRoot, 'manifest.json'));
const coreText = await readFile(join(webRoot, manifest.paths.core), 'utf8');
const core = JSON.parse(coreText);
const counts = manifest.entity_counts;

if (core.teams.length !== counts.raw_teams)
  fail('core raw team count differs from manifest');
if (core.members.length || core.roster.length)
  fail('core bundle must not include the full people graph');
if (core.team_awards.length !== counts.raw_team_awards)
  fail('core award-result count differs from manifest');
if (core.awards.length !== counts.awards)
  fail('core award catalog count differs from manifest');

const compressedCoreBytes = gzipSync(coreText, { level: 9 }).byteLength;
if (compressedCoreBytes > 512_000)
  fail(`core bundle is ${compressedCoreBytes} gzip bytes; limit is 512000`);

const people = await readJson(join(webRoot, manifest.paths.people));
if (people.people.length !== counts.raw_members)
  fail('people bundle member count differs from manifest');
if (people.roster.length !== counts.raw_roster)
  fail('people bundle roster count differs from manifest');
for (const entry of people.roster) {
  if (!Number.isInteger(entry[1]) || !people.people[entry[1]])
    fail('people bundle contains an invalid local member index');
}

let teamRosterCount = 0;
for (let index = 0; index < manifest.buckets.team; index += 1) {
  const bundle = await readJson(join(webRoot, 'team', `${bucketName(index)}.json`));
  for (const entry of bundle.roster) {
    if (stableBucket(entry[0], manifest.buckets.team) !== index)
      fail(`team ${entry[0]} is stored in the wrong team bucket`);
    if (!bundle.people[entry[1]]) fail('team bucket has an invalid member index');
    teamRosterCount += 1;
  }
}
if (teamRosterCount !== counts.raw_roster)
  fail(
    `team buckets contain ${teamRosterCount} roster rows, expected ${counts.raw_roster}`,
  );

let personCount = 0;
let personRosterCount = 0;
for (let index = 0; index < manifest.buckets.person; index += 1) {
  const bundle = await readJson(join(webRoot, 'person', `${bucketName(index)}.json`));
  for (const person of bundle.people) {
    if (stableBucket(person[0], manifest.buckets.person) !== index)
      fail(`person ${person[0]} is stored in the wrong person bucket`);
    personCount += 1;
  }
  for (const entry of bundle.roster) {
    if (!bundle.people[entry[1]]) fail('person bucket has an invalid member index');
    personRosterCount += 1;
  }
}
if (personCount !== counts.raw_members)
  fail(
    `person buckets contain ${personCount} people, expected ${counts.raw_members}`,
  );
if (personRosterCount !== counts.raw_roster)
  fail(
    `person buckets contain ${personRosterCount} roster rows, expected ${counts.raw_roster}`,
  );

console.log(
  `Web data valid: core ${compressedCoreBytes} gzip bytes; ` +
    `${counts.teams} visible teams; ${counts.members} visible people; ` +
    `${counts.roster} visible memberships.`,
);
