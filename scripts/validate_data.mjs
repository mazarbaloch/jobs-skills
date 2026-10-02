import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { frequency, distribution } from '../src/analysis.mjs';
import { parseReport } from './parse_report.mjs';
export function validate({ jobs, skills, jobSkills, sourceHash }) {
  const comparisons = [];
  const check = (
    category,
    label,
    stated,
    calculated,
    reason = 'The prose and structured appendix differ; original advertisements were not re-researched.',
  ) =>
    comparisons.push({
      category,
      label,
      stated,
      calculated,
      difference: calculated - stated,
      reason: stated === calculated ? 'Matches' : reason,
    });
  check('records', 'All jobs', 87, jobs.length);
  const regionExpected = { Finland: 31, 'Rest of Europe': 25, USA: 31 };
  for (const [label, n] of Object.entries(regionExpected))
    check('region', label, n, jobs.filter((j) => j.region === label).length);
  const roleExpected = {
    'Machine Learning Engineering': 24,
    'AI Engineering': 21,
    'Data Science': 19,
    'Data Engineering': 9,
    'AI Platform / Infrastructure': 6,
    'GenAI / LLM': 2,
    'MLOps / ML Platform': 2,
    'Data & Analytics': 1,
    'Analytics Engineering': 1,
    'Agentic AI': 1,
    'Other emerging AI': 1,
  };
  for (const [label, n] of Object.entries(roleExpected))
    check('role', label, n, jobs.filter((j) => j.normalized_role_family === label).length);
  for (const [label, n] of Object.entries({
    'Entry / Junior': 4,
    Mid: 9,
    Senior: 52,
    'Staff / Lead / Principal': 22,
  }))
    check(
      'seniority',
      label,
      n,
      jobs.filter((j) => j.seniority_group === label).length,
      'Mixed labels (e.g. Mid/Senior, Entry/Mid, Senior/Lead) remain ambiguous. They are not forced into a single level.',
    );
  const expected = {
    COMM: 76,
    SWE: 58,
    ML: 45,
    PY: 43,
    DE: 42,
    GEN: 41,
    CLOUD: 33,
    EVAL: 31,
    AGT: 25,
    OBS: 24,
    GOV: 22,
    AWS: 21,
    DL: 20,
    API: 19,
    MLOPS: 19,
    STAT: 18,
    SEC: 17,
    SQL: 16,
    AZ: 15,
    CICD: 15,
    SERV: 15,
    RAG: 13,
    GCP: 12,
  };
  const counts = frequency(jobs, jobSkills, skills);
  for (const [code, n] of Object.entries(expected))
    check(
      'core skill',
      code,
      n,
      counts.find((r) => r.skill_code === code)?.count || 0,
      code === 'CLOUD'
        ? 'Generic cloud is counted only when explicitly present in Core evidence. Named providers are separate; the appendix has no CLOUD code.'
        : 'Counts use appendix codes, with preferred-only separation; narrative totals are not substituted.',
    );
  const ai = frequency(
    jobs.filter((j) => j.normalized_role_family === 'AI Engineering'),
    jobSkills,
    skills,
  );
  for (const [code, n] of Object.entries({
    SWE: 18,
    GEN: 17,
    AGT: 13,
    API: 12,
    PY: 11,
    CLOUD: 11,
    ML: 10,
    DE: 8,
  }))
    check('AI Engineering', code, n, ai.find((r) => r.skill_code === code)?.count || 0);
  check(
    'title',
    'Agentic AI in exact title',
    1,
    jobs.filter((j) => /agentic ai/i.test(j.exact_title)).length,
  );
  const duplicates = jobs.map((j) => j.job_id).filter((id, i, a) => a.indexOf(id) !== i);
  const invalidReferences = jobSkills.filter(
    (r) => !jobs.some((j) => j.job_id === r.job_id) || !skills.some((s) => s.skill_code === r.skill_code),
  );
  const missingFields = Object.fromEntries(
    ['exact_title', 'company', 'country', 'region', 'source_reference', 'core_evidence'].map((k) => [
      k,
      jobs.filter((j) => !j[k]).length,
    ]),
  );
  return {
    source_sha256: sourceHash,
    records: jobs.length,
    duplicates,
    invalid_references: invalidReferences,
    missing_fields: missingFields,
    source_references_available: jobs.filter((j) => j.source_reference).length,
    source_urls_available: jobs.filter((j) => j.source_url).length,
    ambiguous_seniority: jobs.filter((j) => j.seniority_group.startsWith('Ambiguous')).map((j) => j.job_id),
    undefined_codes: ['DOM'],
    core_preferred_status: distribution(jobSkills, 'requirement_type'),
    comparisons,
    discrepancies: comparisons.filter((c) => c.difference !== 0),
    distributions: {
      region: distribution(jobs, 'region'),
      role: distribution(jobs, 'normalized_role_family'),
      seniority: distribution(jobs, 'seniority_group'),
    },
    structural_pass:
      jobs.length === 87 &&
      !duplicates.length &&
      !invalidReferences.length &&
      Object.values(missingFields).every((n) => n === 0),
    notes: [
      'DOM is not defined in the supplied taxonomy and remains unspecified. R is supported by explicit R text.',
      'Appendix-assigned codes are retained even where the short core evidence does not repeat the skill name. No external vacancy verification was performed.',
      'Cloud means explicit generic cloud text, not the union of AWS/Azure/GCP.',
      'No public posting URLs are present in the appendix; source_url is null.',
      'Mixed seniority is retained. Senior/VP maps to Senior; Lead/VP maps to Staff / Lead / Principal based on the explicit seniority word.',
    ],
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = JSON.parse(readFileSync('data/validation_report.json', 'utf8'));
  const parsed = parseReport(readFileSync('research/original_deep_research_report.md', 'utf8'));
  for (const [file, value] of Object.entries({
    jobs: parsed.jobs,
    skills: parsed.skills,
    job_skills: parsed.jobSkills,
  })) {
    if (JSON.stringify(JSON.parse(readFileSync(`data/${file}.json`))) !== JSON.stringify(value))
      throw Error(`${file} differs from the source; run npm run data:build`);
  }
  const fresh = validate(parsed);
  if (JSON.stringify(fresh) !== JSON.stringify(report))
    throw Error('Validation artifact is stale; run npm run data:build');
  console.log(
    `${fresh.records} records; structural validation ${fresh.structural_pass ? 'PASS' : 'FAIL'}; ${fresh.discrepancies.length} documented statistical differences.`,
  );
  if (!fresh.structural_pass) process.exitCode = 1;
}
