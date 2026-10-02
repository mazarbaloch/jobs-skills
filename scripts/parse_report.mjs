import { createHash } from 'node:crypto';
// Parsing owns Markdown only. Taxonomy and classification belong to normalization.
const headers = {
  id: 'job_id',
  'job id': 'job_id',
  'exact title': 'exact_title',
  title: 'exact_title',
  family: 'role_family_raw',
  'role family': 'role_family_raw',
  company: 'company',
  country: 'country',
  region: 'region',
  location: 'location',
  seniority: 'seniority_raw',
  experience: 'experience',
  'post date/status': 'posting_date_or_status',
  'posting date or status': 'posting_date_or_status',
  'core evidence': 'core_evidence',
  'preferred-only': 'preferred_only',
  'preferred only': 'preferred_only',
  'normalised skills': 'normalized_skills_raw',
  'normalized skills': 'normalized_skills_raw',
  source: 'source_reference_raw',
  'source reference': 'source_reference_raw',
  'source url': 'source_url',
};
const required = [
  'job_id',
  'exact_title',
  'role_family_raw',
  'company',
  'country',
  'region',
  'location',
  'seniority_raw',
  'experience',
  'posting_date_or_status',
  'core_evidence',
  'preferred_only',
  'normalized_skills_raw',
  'source_reference_raw',
];
export const optionalFields = [
  'sector',
  'industry',
  'employment_type',
  'remote_status',
  'salary_min',
  'salary_max',
  'salary_currency',
  'education_requirement',
  'years_experience_min',
  'years_experience_max',
  'requisition_id',
  'first_seen',
  'last_seen',
];
export function parseReport(report) {
  const jobs = [],
    issues = [],
    definitions = [];
  let columns = null;
  const lines = report.split(/\r?\n/);
  const cells = (line) =>
    line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split(/(?<!\\)\|/)
      .map((s) => s.trim().replaceAll('\\|', '|'));
  for (const [i, line] of lines.entries()) {
    if (line.startsWith('Normalised-skill codes used below'))
      for (const m of line.matchAll(/\*\*([^*]+)\*\*/g)) definitions.push(...m[1].split('/'));
    if (!line.trim().startsWith('|')) {
      columns = null;
      continue;
    }
    const c = cells(line);
    if (c.every((v) => /^:?-+:?$/.test(v))) continue;
    const candidate = c.map((v) => headers[v.toLowerCase()] || v.toLowerCase().replaceAll(' ', '_'));
    if (candidate.includes('job_id') && candidate.includes('exact_title')) {
      columns = candidate;
      const missing = required.filter((k) => !columns.includes(k));
      if (missing.length)
        issues.push({
          severity: 'ERROR',
          code: 'TABLE_COLUMNS',
          message: `Line ${i + 1}: missing ${missing.join(', ')}`,
        });
      continue;
    }
    if (!columns) continue;
    if (c.length !== columns.length) {
      issues.push({
        severity: 'ERROR',
        code: 'TABLE_WIDTH',
        message: `Line ${i + 1}: expected ${columns.length} cells, found ${c.length}`,
      });
      continue;
    }
    const raw = Object.fromEntries(columns.map((key, index) => [key, c[index]]));
    jobs.push({ ...raw, source_line: i + 1, source_row: line });
  }
  if (!jobs.length)
    issues.push({
      severity: 'ERROR',
      code: 'NO_RECORDS',
      message: 'No structured evidence records were parsed. Expected named job evidence table headers.',
    });
  return { jobs, issues, definitions, sourceHash: createHash('sha256').update(report).digest('hex') };
}
