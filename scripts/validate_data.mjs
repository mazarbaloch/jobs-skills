import {
  JobSchema,
  JobSkillSchema,
  ValidationIssueSchema,
  SnapshotAggregateSchema,
} from '../src/schemas.mjs';
import { frequency, distribution, identity } from '../src/analysis.mjs';
export function validateSnapshot(snapshot, taxonomy, aggregates = {}) {
  const { jobs, jobSkills, metadata, sourceHash } = snapshot,
    skills = taxonomy.skills,
    issues = [...snapshot.issues];
  const issue = (severity, code, message, job_id) =>
    issues.push({ severity, code, message, ...(job_id ? { job_id } : {}) });
  const duplicates = jobs.map((j) => j.job_id).filter((id, i, a) => a.indexOf(id) !== i);
  for (const id of duplicates) issue('ERROR', 'DUPLICATE_JOB_ID', `Duplicate job ID ${id}`, id);
  const safeIds = jobs.map(identity);
  if (new Set(safeIds).size !== safeIds.length)
    issue('ERROR', 'DUPLICATE_SNAPSHOT_JOB_ID', 'Composite observation IDs must be unique.');
  if (metadata.expected_records !== undefined && jobs.length !== metadata.expected_records)
    issue('ERROR', 'EXPECTED_COUNT', `Expected ${metadata.expected_records} jobs; parsed ${jobs.length}.`);
  if (metadata.source_sha256 && metadata.source_sha256 !== sourceHash)
    issue(
      'ERROR',
      'SOURCE_CHANGED',
      'Report hash differs from metadata. Historical research must remain immutable.',
    );
  if (!taxonomy.version.compatible_versions.includes(metadata.taxonomy_version))
    issue(
      'ERROR',
      'TAXONOMY_VERSION',
      `Taxonomy version ${metadata.taxonomy_version} is not declared compatible with canonical ${taxonomy.version.version}.`,
    );
  const quarter = `${metadata.retrieval_date.slice(0, 4)}-Q${Math.ceil(Number(metadata.retrieval_date.slice(5, 7)) / 3)}`;
  if (quarter !== metadata.snapshot_id)
    issue(
      'WARNING',
      'RETRIEVAL_QUARTER',
      `Retrieval falls in ${quarter}, different from snapshot ID. Check whether this is a deliberate recheck date.`,
    );
  for (const j of jobs) {
    const parsed = JobSchema.safeParse(j);
    if (!parsed.success)
      for (const e of parsed.error.issues)
        issue('ERROR', 'JOB_SCHEMA', `${e.path.join('.')}: ${e.message}`, j.job_id);
    if (j.snapshot_id !== metadata.snapshot_id || j.snapshot_job_id !== `${metadata.snapshot_id}:${j.job_id}`)
      issue('ERROR', 'SNAPSHOT_ID', 'Job snapshot metadata is inconsistent.', j.job_id);
    if (!taxonomy.config.regions.includes(j.region))
      issue('ERROR', 'INVALID_REGION', `Unrecognized region: ${j.region}`, j.job_id);
    if (!taxonomy.roles.some((r) => r.name === j.normalized_role_family))
      issue(
        'ERROR',
        'UNKNOWN_ROLE',
        `New role family ${j.normalized_role_family} requires human review.`,
        j.job_id,
      );
    if (!(j.seniority_raw in taxonomy.config.seniority))
      issue(
        'ERROR',
        'INVALID_SENIORITY',
        `Seniority ${j.seniority_raw} requires a documented normalization rule.`,
        j.job_id,
      );
    for (const code of j.normalized_skills) {
      const skill = skills.find((s) => s.skill_code === code);
      if (!skill) issue('ERROR', 'INVALID_SKILL', `Unknown skill code ${code}`, j.job_id);
      else if (skill.introduced_in > j.snapshot_id)
        issue('ERROR', 'TAXONOMY_TIMELINE', `${code} predates its introduced_in snapshot.`, j.job_id);
      else if (skill.deprecated_in && j.snapshot_id >= skill.deprecated_in)
        issue(
          'WARNING',
          'DEPRECATED_SKILL',
          `${code} is deprecated; preserve historical meaning and review new use.`,
          j.job_id,
        );
    }
  }
  const ids = new Set(safeIds),
    invalidReferences = jobSkills.filter(
      (r) => !ids.has(identity(r)) || !skills.some((s) => s.skill_code === r.skill_code),
    );
  for (const r of invalidReferences)
    issue('ERROR', 'ORPHAN_SKILL', `Unresolved relation ${identity(r)} / ${r.skill_code}`, r.job_id);
  const triples = jobSkills.map((r) => `${identity(r)}:${r.skill_code}:${r.requirement_type}`);
  if (new Set(triples).size !== triples.length)
    issue('ERROR', 'DUPLICATE_OBSERVATION', 'Duplicate job-skill requirement-type relation.');
  for (const r of jobSkills) {
    const parsed = JobSkillSchema.safeParse(r);
    if (!parsed.success)
      issue(
        'ERROR',
        'JOB_SKILL_SCHEMA',
        parsed.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
        r.job_id,
      );
    const job = jobs.find((j) => identity(j) === identity(r));
    if (job && (r.job_id !== job.job_id || r.snapshot_id !== job.snapshot_id))
      issue('ERROR', 'SKILL_METADATA', 'Job-skill snapshot metadata differs from parent.', r.job_id);
    if (r.requirement_type === 'preferred' && !job?.preferred_only)
      issue('ERROR', 'PREFERRED_EVIDENCE', 'Preferred classification needs preferred evidence.', r.job_id);
    if (
      skills.find((s) => s.skill_code === r.skill_code)?.undefined_concept &&
      r.requirement_type !== 'unspecified'
    )
      issue(
        'ERROR',
        'UNDEFINED_CLASSIFICATION',
        'An undefined source concept must remain unspecified.',
        r.job_id,
      );
  }
  for (const [region, count] of Object.entries(metadata.expected_regions || {}))
    if (jobs.filter((j) => j.region === region).length !== count)
      issue(
        'ERROR',
        'EXPECTED_REGION',
        `${region}: expected ${count}, calculated ${jobs.filter((j) => j.region === region).length}.`,
      );
  const counts = frequency(jobs, jobSkills, skills),
    ai = frequency(
      jobs.filter((j) => j.normalized_role_family === 'AI Engineering'),
      jobSkills,
      skills,
    );
  const comparisons = (metadata.reported_statistics || []).map((c) => {
    const fields = { region: 'region', role: 'normalized_role_family', seniority: 'seniority_group' };
    const calculated =
      c.category === 'records'
        ? jobs.length
        : fields[c.category]
          ? jobs.filter((j) => j[fields[c.category]] === c.label).length
          : c.category === 'core skill'
            ? counts.find((r) => r.skill_code === c.label)?.count || 0
            : c.category === 'AI Engineering'
              ? ai.find((r) => r.skill_code === c.label)?.count || 0
              : c.category === 'title' && c.label === 'Agentic AI in exact title'
                ? jobs.filter((j) => /agentic ai/i.test(j.exact_title)).length
                : null;
    if (calculated === null)
      issue('WARNING', 'UNSUPPORTED_CLAIM', `Claim comparator not configured: ${c.category} / ${c.label}`);
    return {
      ...c,
      calculated,
      difference: calculated === null ? null : calculated - c.stated,
      reason:
        calculated === c.stated
          ? 'Matches'
          : c.reason || 'The published claim differs from the structured appendix.',
    };
  });
  const discrepancies = comparisons.filter((c) => c.difference !== 0);
  for (const c of discrepancies)
    issue(
      'WARNING',
      'PUBLISHED_DISCREPANCY',
      `${c.category} / ${c.label}: stated ${c.stated}, calculated ${c.calculated}. ${c.reason}`,
    );
  if (jobs.some((j) => j.seniority_group.startsWith('Ambiguous')))
    issue(
      'WARNING',
      'AMBIGUOUS_SENIORITY',
      'Mixed seniority levels are retained and not forced into a single group.',
    );
  const undefinedCodes = [
    ...new Set(jobSkills.filter((r) => r.requirement_type === 'unspecified').map((r) => r.skill_code)),
  ];
  if (undefinedCodes.length)
    issue(
      'WARNING',
      'UNDEFINED_SOURCE_CODES',
      `Undefined source concepts retained as unspecified: ${undefinedCodes.join(', ')}`,
    );
  if (jobs.some((j) => !j.source_url))
    issue(
      'INFO',
      'SOURCE_URL_UNAVAILABLE',
      'Some source URLs are unavailable; citation references are preserved.',
    );
  const aggCheck = SnapshotAggregateSchema.safeParse(aggregates);
  if (!aggCheck.success) issue('ERROR', 'AGGREGATE_SCHEMA', aggCheck.error.message);
  for (const [name, list] of Object.entries(aggregates))
    for (const r of list) {
      const field = {
        skill_frequency_by_region: 'region',
        role_frequency_by_region: 'region',
        skill_frequency_by_role: 'normalized_role_family',
        skill_frequency_by_seniority: 'seniority_group',
      }[name];
      const cohort = field ? jobs.filter((j) => j[field] === r[field]) : jobs;
      const cohortIds = new Set(cohort.map(identity));
      if (
        r.snapshot_id !== metadata.snapshot_id ||
        r.count !== new Set(r.job_ids).size ||
        r.denominator !== cohort.length ||
        r.count > r.denominator ||
        r.job_ids.some((id) => !cohortIds.has(id)) ||
        Math.abs(r.percentage - (r.denominator ? (r.count / r.denominator) * 100 : 0)) > 1e-9
      )
        issue('ERROR', 'AGGREGATE_DENOMINATOR', `Invalid denominator or supporting IDs in ${name}.`);
    }
  const missingFields = Object.fromEntries(
    ['exact_title', 'company', 'country', 'region', 'source_reference', 'core_evidence'].map((k) => [
      k,
      jobs.filter((j) => !j[k]).length,
    ]),
  );
  issues.forEach((i) => ValidationIssueSchema.parse(i));
  return {
    snapshot_id: metadata.snapshot_id,
    source_sha256: sourceHash,
    records: jobs.length,
    duplicates,
    invalid_references: invalidReferences,
    missing_fields: missingFields,
    source_references_available: jobs.filter((j) => j.source_reference).length,
    source_urls_available: jobs.filter((j) => j.source_url).length,
    ambiguous_seniority: jobs.filter((j) => j.seniority_group.startsWith('Ambiguous')).map((j) => j.job_id),
    undefined_codes: undefinedCodes,
    core_preferred_status: distribution(jobSkills, 'requirement_type'),
    comparisons,
    discrepancies,
    distributions: {
      region: distribution(jobs, 'region'),
      role: distribution(jobs, 'normalized_role_family'),
      seniority: distribution(jobs, 'seniority_group'),
    },
    structural_pass: !issues.some((i) => i.severity === 'ERROR'),
    issues,
    errors: issues.filter((i) => i.severity === 'ERROR').length,
    warnings: issues.filter((i) => i.severity === 'WARNING').length,
    notes: [
      'Appendix-assigned codes and explicit preferred-only evidence retain their original classification.',
      'Generic cloud is counted separately from named providers.',
      'Missing evidence does not establish an absent capability. Every snapshot remains a purposive sample.',
    ],
  };
}
export function validationMarkdown(v) {
  return `# Snapshot validation: ${v.snapshot_id}\n\nRecords: ${v.records}. Errors: ${v.errors}. Warnings: ${v.warnings}.\n\nSource SHA-256: \`${v.source_sha256}\`\n\n| Severity | Code | Job | Finding |\n|---|---|---|---|\n${v.issues.map((i) => `| ${i.severity} | ${i.code} | ${i.job_id || ''} | ${i.message.replaceAll('|', '/')} |`).join('\n')}\n\n## Published claims\n\n| Scope | Statistic | Stated | Calculated | Difference |\n|---|---|---:|---:|---:|\n${v.comparisons.map((c) => `| ${c.category} | ${c.label} | ${c.stated} | ${c.calculated} | ${c.difference} |`).join('\n')}\n`;
}
