import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { buildFixture } from './fixture-build.mjs';
import {
  runBuild,
  prepareBuild,
  outputFiles,
  migrationReport,
  loadTaxonomy,
  aggregateSnapshot,
} from '../scripts/pipeline.mjs';
import { parseReport } from '../scripts/parse_report.mjs';
import { normalizeJobs } from '../scripts/normalize.mjs';
import { validateSnapshot } from '../scripts/validate_data.mjs';
import { compositionReport } from '../scripts/build_longitudinal.mjs';
import { selectJobs, frequency } from '../src/analysis.mjs';
import { SnapshotMetadataSchema, JobSchema, JobSkillSchema } from '../src/schemas.mjs';
const { root, build } = buildFixture('unit');
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
test('baseline migration preserves every old field and every classification', () => {
  const production = prepareBuild();
  assert.equal(production.migration.passed, true);
  assert.equal(production.migration.differences.length, 0);
  assert.equal(production.migration.after_jobs, 87);
  assert.equal(production.migration.after_job_skills, 866);
  const s = production.snapshots.find((s) => s.metadata.snapshot_id === '2026-Q4');
  for (const name of ['jobs', 'job_skills']) {
    const old = read(`tests/fixtures/baseline/${name}.json`),
      actual = name === 'jobs' ? s.jobs : s.jobSkills;
    for (let i = 0; i < old.length; i++)
      for (const key of Object.keys(old[i]))
        assert.deepEqual(actual[i][key], old[i][key], `${name} ${i} ${key}`);
  }
});
test('snapshot metadata, schemas, discovery and latest selection are data driven', () => {
  const catalog = read(`${root}/public/data/catalog.json`);
  assert.equal(catalog.latest_snapshot_id, '2027-Q1');
  assert.equal(catalog.snapshots.length, 2);
  for (const s of build.snapshots) {
    SnapshotMetadataSchema.parse(s.metadata);
    assert.equal(s.validation.errors, 0);
    for (const j of s.jobs) {
      JobSchema.parse(j);
      assert.equal(j.snapshot_job_id, `${s.metadata.snapshot_id}:${j.job_id}`);
    }
    s.jobSkills.forEach((r) => JobSkillSchema.parse(r));
  }
  assert.throws(() =>
    SnapshotMetadataSchema.parse({ ...build.snapshots[0].metadata, snapshot_id: '../evil' }),
  );
});
test('combined observations preserve repeat vacancies without composite-ID collisions', () => {
  assert.equal(build.longitudinal.jobs.length, 6);
  assert.equal(new Set(build.longitudinal.jobs.map((j) => j.snapshot_job_id)).size, 6);
  const repeat = build.longitudinal.jobs.filter((j) => j.job_id === 'F01');
  assert.equal(repeat.length, 2);
  assert.equal(repeat[0].posting_identity, repeat[1].posting_identity);
  assert.equal(repeat[0].previously_seen, false);
  assert.equal(repeat[1].previously_seen, true);
  assert.equal(repeat[1].first_seen_snapshot, '2026-Q4');
  assert.equal(repeat[0].last_seen_snapshot, '2027-Q1');
});
test('snapshot filtering and trend denominators cannot join same raw IDs across quarters', () => {
  const { jobs, jobSkills } = build.longitudinal;
  const old = selectJobs(jobs, jobSkills, {
    snapshot_id: '2026-Q4',
    skill_code: 'SQL',
    requirement_type: 'core',
  });
  const current = selectJobs(jobs, jobSkills, {
    snapshot_id: '2027-Q1',
    skill_code: 'SQL',
    requirement_type: 'core',
  });
  assert.deepEqual(
    old.map((j) => j.snapshot_job_id),
    ['2026-Q4:U01'],
  );
  assert.deepEqual(
    current.map((j) => j.snapshot_job_id),
    ['2027-Q1:E01'],
  );
  const agent = build.longitudinal.tables.skill_frequency_by_snapshot.filter((r) => r.skill_code === 'AGT');
  assert.deepEqual(
    agent.map((r) => [r.snapshot_id, r.count, r.denominator]),
    [
      ['2026-Q4', 1, 2],
      ['2027-Q1', 1, 4],
    ],
  );
  for (const list of Object.values(build.longitudinal.tables))
    for (const r of list) {
      assert.ok(r.snapshot_id);
      assert.ok(r.count <= r.denominator);
      assert.equal(r.count, new Set(r.job_ids).size);
      assert.ok(r.job_ids.every((id) => id.startsWith(`${r.snapshot_id}:`)));
    }
});
test('new canonical skills appear only from their introduced quarter without React changes', () => {
  const trend = build.longitudinal.tables.skill_frequency_by_snapshot.filter((r) => r.skill_code === 'SYNTH');
  assert.equal(trend.length, 1);
  assert.equal(trend[0].snapshot_id, '2027-Q1');
  assert.equal(trend[0].count, 1);
});
test('unknown skill blocks publication and leaves prior public assets unchanged', () => {
  const separate = buildFixture('unknown'),
    reportPath = `${separate.root}/research/snapshots/2027-Q1/report.md`,
    catalogPath = `${separate.root}/public/data/catalog.json`,
    before = readFileSync(catalogPath);
  writeFileSync(reportPath, readFileSync(reportPath, 'utf8').replace('PY,GEN,SYNTH', 'PY,GEN,UNKNOWNTERM'));
  assert.throws(() => runBuild({ root: separate.root }), /ERROR/);
  assert.deepEqual(readFileSync(catalogPath), before);
  assert.ok(
    read(`${separate.root}/data/snapshots/2027-Q1/validation_report.json`).issues.some(
      (i) => i.severity === 'ERROR' && i.skill_code === 'UNKNOWNTERM',
    ),
  );
});
test('validation catches region, role, seniority, schema, count and malformed-list failures', () => {
  const taxonomy = loadTaxonomy(root),
    s = build.snapshots[0],
    raw = parseReport(s.report);
  raw.jobs[0].region = 'Mars';
  raw.jobs[0].role_family_raw = 'Unknown Role';
  raw.jobs[0].seniority_raw = 'Something';
  raw.jobs[0].normalized_skills_raw = 'PY,,AGT';
  raw.jobs[0].source_reference_raw = '';
  const normalized = normalizeJobs(raw, { ...s.metadata, expected_records: 3 }, taxonomy),
    v = validateSnapshot(normalized, taxonomy);
  for (const code of [
    'INVALID_REGION',
    'UNKNOWN_ROLE',
    'INVALID_SENIORITY',
    'MALFORMED_SKILL_LIST',
    'JOB_SCHEMA',
    'EXPECTED_COUNT',
  ])
    assert.ok(
      v.issues.some((i) => i.code === code),
      code,
    );
});
test('validation rejects orphan, duplicate IDs, invalid classifications and corrupt denominators', () => {
  const taxonomy = loadTaxonomy(root),
    s = structuredClone(build.snapshots[0]);
  s.jobs.push(s.jobs[0]);
  s.jobSkills[0].snapshot_job_id = '2026-Q4:MISSING';
  s.jobSkills[0].requirement_type = 'mandatory';
  s.aggregates.skill_frequency_overall[0].denominator = 999;
  const v = validateSnapshot(s, taxonomy, s.aggregates);
  for (const code of ['DUPLICATE_JOB_ID', 'ORPHAN_SKILL', 'JOB_SKILL_SCHEMA', 'AGGREGATE_DENOMINATOR'])
    assert.ok(
      v.issues.some((i) => i.code === code),
      code,
    );
});
test('composition and methodology differences remain explicit warnings, not scores', () => {
  assert.ok(build.longitudinal.comparability.comparisons[0].warnings.some((w) => w.includes('Sample size')));
  const snapshots = structuredClone(build.snapshots);
  snapshots[1].metadata.methodology_version = '2.0';
  const compare = compositionReport(snapshots, build.taxonomy.config);
  assert.equal(compare.comparisons[0].comparable_versions, false);
  assert.ok(compare.comparisons[0].warnings.some((w) => w.includes('different methodology')));
});
test('draft snapshots never become latest or leak into published tracking', () => {
  const separate = buildFixture('draft'),
    file = `${separate.root}/research/snapshots/2027-Q1/metadata.json`;
  const metadata = read(file);
  metadata.status = 'draft';
  writeFileSync(file, JSON.stringify(metadata));
  const result = runBuild({ root: separate.root });
  assert.equal(result.published.length, 1);
  const catalog = read(`${separate.root}/public/data/catalog.json`);
  assert.equal(catalog.latest_snapshot_id, '2026-Q4');
  assert.equal(result.published[0].jobs[0].last_seen_snapshot, '2026-Q4');
});
test('rebuild is byte-deterministic and never mutates source reports or taxonomy', () => {
  const sources = [
    'research/snapshots/2026-Q4/report.md',
    'research/snapshots/2027-Q1/report.md',
    'data/taxonomy/skills.json',
  ];
  const hash = (p) =>
    createHash('sha256')
      .update(readFileSync(`${root}/${p}`))
      .digest('hex');
  const before = sources.map(hash),
    one = outputFiles(runBuild({ root })),
    two = outputFiles(runBuild({ root }));
  assert.deepEqual([...one], [...two]);
  assert.deepEqual(sources.map(hash), before);
  assert.doesNotThrow(() => runBuild({ root, check: true }));
});
test('no synthetic fixture records or taxonomy terms are present in production', () => {
  const production = prepareBuild();
  assert.ok(production.snapshots.every((s) => s.jobs.every((j) => !j.company.startsWith('TEST '))));
  assert.ok(production.taxonomy.skills.every((s) => s.skill_code !== 'SYNTH'));
});
