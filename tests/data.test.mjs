import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parseReport, seniority } from '../scripts/parse_report.mjs';
import { validate } from '../scripts/validate_data.mjs';
import { aggregates } from '../scripts/generate_aggregates.mjs';
import { selectJobs, frequency, combine, csv } from '../src/analysis.mjs';
const raw = readFileSync('research/original_deep_research_report.md', 'utf8');
const parsed = parseReport(raw),
  { jobs, skills, jobSkills } = parsed;
const report = validate(parsed);
test('source is byte-identical to supplied report and downloadable copy', () => {
  assert.deepEqual(readFileSync('report.md'), readFileSync('research/original_deep_research_report.md'));
  assert.deepEqual(
    readFileSync('report.md'),
    readFileSync('public/research/original_deep_research_report.md'),
  );
});
test('87 records; complete ID ranges with no duplicates', () => {
  assert.equal(jobs.length, 87);
  assert.equal(new Set(jobs.map((j) => j.job_id)).size, 87);
  assert.deepEqual(
    jobs.map((j) => j.job_id),
    [
      ['F', 31],
      ['E', 25],
      ['U', 31],
    ].flatMap(([p, n]) => Array.from({ length: n }, (_, i) => p + String(i + 1).padStart(2, '0'))),
  );
});
test('regions and role totals reproduce the source expectations', () => {
  for (const r of report.comparisons.filter((r) => ['region', 'role'].includes(r.category)))
    assert.equal(r.calculated, r.stated, r.label);
});
test('every observation references a valid job and taxonomy code and unique triple', () => {
  assert.equal(report.invalid_references.length, 0);
  assert.equal(
    new Set(jobSkills.map((r) => [r.job_id, r.skill_code, r.requirement_type].join(':'))).size,
    jobSkills.length,
  );
  assert.ok(jobSkills.every((r) => r.evidence_text && r.source_reference));
});
test('ambiguous seniority is retained; title or experience does not silently override it', () => {
  assert.equal(seniority('Mid/Senior'), 'Ambiguous: Mid/Senior');
  assert.equal(seniority('Entry/Mid'), 'Ambiguous: Entry/Mid');
  assert.equal(seniority('Senior/Lead'), 'Ambiguous: Senior/Lead');
  assert.equal(report.ambiguous_seniority.length, 25);
});
test('preferred-only skills never become core; undefined DOM stays unspecified', () => {
  const has = (id, code, type) =>
    jobSkills.some((r) => r.job_id === id && r.skill_code === code && r.requirement_type === type);
  assert.ok(has('F30', 'PY', 'preferred'));
  assert.ok(!has('F30', 'PY', 'core'));
  assert.ok(has('F29', 'MLOPS', 'preferred'));
  assert.ok(!has('F29', 'MLOPS', 'core'));
  assert.ok(has('F23', 'MCP', 'preferred'));
  assert.ok(!has('F23', 'MCP', 'core'));
  assert.ok(has('F28', 'AGT', 'preferred'));
  assert.ok(!has('F28', 'AGT', 'core'));
  assert.ok(
    jobSkills.filter((r) => r.skill_code === 'DOM').every((r) => r.requirement_type === 'unspecified'),
  );
});
test('important reported relationships calculated from job IDs', () => {
  const freq = frequency(jobs, jobSkills, skills);
  assert.equal(freq.find((r) => r.skill_code === 'AGT').count, 25);
  assert.equal(jobs.filter((j) => /agentic ai/i.test(j.exact_title)).length, 1);
  const ai = jobs.filter((j) => j.normalized_role_family === 'AI Engineering');
  assert.equal(ai.length, 21);
  assert.equal(frequency(ai, jobSkills, skills).find((r) => r.skill_code === 'AGT').count, 13);
  assert.equal(combine(jobs, jobSkills).find((r) => r.label === 'GEN + AGT').count, 19);
});
test('filters and subgroup denominators track independently selected records', () => {
  const filtered = selectJobs(jobs, jobSkills, {
    region: 'Finland',
    normalized_role_family: 'AI Engineering',
    skill_code: 'AGT',
    requirement_type: 'core',
  });
  const independent = jobs.filter(
    (j) =>
      j.region === 'Finland' &&
      j.normalized_role_family === 'AI Engineering' &&
      j.normalized_skills.includes('AGT'),
  );
  assert.deepEqual(
    filtered.map((j) => j.job_id),
    independent.map((j) => j.job_id),
  );
  for (const r of frequency(filtered, jobSkills, skills)) {
    assert.equal(r.denominator, independent.length);
    assert.ok(Math.abs(r.percentage - (r.count / r.denominator) * 100) < 1e-10);
    assert.ok(r.count <= r.denominator);
  }
  assert.equal(frequency(filtered, jobSkills, skills).find((r) => r.skill_code === 'AGT').percentage, 100);
  const preferred = selectJobs(jobs, jobSkills, {
    company: 'Norrin',
    skill_code: 'AGT',
    requirement_type: 'preferred',
  });
  assert.deepEqual(
    preferred.map((j) => j.job_id),
    ['F28'],
  );
  assert.equal(selectJobs(jobs, jobSkills, { requirement_type: 'preferred' }).length, 87);
});
test('all-mode de-duplicates core and preferred; zero denominators stay finite', () => {
  const all = frequency(jobs, jobSkills, skills, 'all');
  for (const r of all)
    assert.equal(
      r.count,
      new Set(jobSkills.filter((s) => s.skill_code === r.skill_code).map((s) => s.job_id)).size,
    );
  for (const r of frequency([], jobSkills, skills)) assert.equal(r.percentage, 0);
});
test('every generated aggregate has valid counts, denominators and supporting IDs', () => {
  for (const rows of Object.values(aggregates(parsed)))
    for (const r of rows) {
      assert.ok(r.denominator > 0);
      assert.equal(r.count, r.job_ids.length);
      assert.ok(r.count <= r.denominator);
      assert.ok(Math.abs(r.percentage - (r.count / r.denominator) * 100) < 1e-10);
    }
});
test('JSON exports preserve source strings and regenerate exactly', () => {
  for (const [name, value] of Object.entries({ jobs, skills, job_skills: jobSkills }))
    assert.deepEqual(JSON.parse(readFileSync(`data/${name}.json`)), value);
  assert.ok(jobs.every((j) => raw.split(/\r?\n/)[j.source_line - 1] === j.source_row));
});
function parseCSV(text) {
  const result = [];
  let row = [],
    cell = '',
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if (c === '\r' && text[i + 1] === '\n' && !quoted) {
      row.push(cell);
      result.push(row);
      row = [];
      cell = '';
      i++;
    } else cell += c;
  }
  return result;
}
test('CSV round trip handles commas, quotes, Unicode and multiline evidence', () => {
  const special = [{ a: 'A, B', b: 'Said "yes"\nTwo lines', c: 'Espoo · Europe' }];
  assert.deepEqual(parseCSV(csv(special)), [
    ['a', 'b', 'c'],
    ['A, B', 'Said "yes"\nTwo lines', 'Espoo · Europe'],
  ]);
  const exported = parseCSV(readFileSync('data/jobs.csv', 'utf8'));
  assert.equal(exported.length, 88);
  const titleIndex = exported[0].indexOf('exact_title');
  assert.equal(exported[1][titleIndex], jobs[0].exact_title);
  const skillExport = parseCSV(readFileSync('data/job_skills.csv', 'utf8'));
  assert.equal(skillExport.length, jobSkills.length + 1);
});
test('published discrepancies stay visible instead of being forced to match', () => {
  assert.equal(report.discrepancies.length, 7);
  assert.equal(
    report.comparisons.find((r) => r.category === 'core skill' && r.label === 'COMM').calculated,
    72,
  );
  assert.equal(
    report.comparisons.find((r) => r.category === 'core skill' && r.label === 'SQL').calculated,
    17,
  );
  assert.equal(
    report.comparisons.find((r) => r.category === 'core skill' && r.label === 'CLOUD').calculated,
    19,
  );
});
test('all deployed data assets match generated artifacts', () => {
  for (const file of readdirSync('data'))
    assert.deepEqual(readFileSync(`data/${file}`), readFileSync(`public/data/${file}`), file);
});
