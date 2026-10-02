import { optionalFields } from './parse_report.mjs';
export function seniority(raw, config) {
  return config.seniority[raw] || `Ambiguous: ${raw}`;
}
export function normalizeJobs(parsed, metadata, taxonomy) {
  const { skills, roles, config } = taxonomy,
    issues = [...parsed.issues];
  const resolve = (token) => skills.find((s) => s.skill_code === token || s.aliases.includes(token));
  for (const code of parsed.definitions)
    if (!resolve(code))
      issues.push({
        severity: 'ERROR',
        code: 'UNKNOWN_TAXONOMY_DEFINITION',
        skill_code: code,
        message: `New report taxonomy term ${code} requires human review before publication.`,
      });
  const jobs = parsed.jobs.map((raw) => {
    const tokens = (raw.normalized_skills_raw || '').split(',').map((s) => s.trim());
    if (tokens.some((s) => !s) || new Set(tokens).size !== tokens.length)
      issues.push({
        severity: 'ERROR',
        code: 'MALFORMED_SKILL_LIST',
        job_id: raw.job_id,
        message: 'Skill list contains an empty or duplicated code.',
      });
    const normalized_skills = tokens.map((code) => resolve(code)?.skill_code || code);
    if (new Set(normalized_skills).size !== normalized_skills.length)
      issues.push({
        severity: 'ERROR',
        code: 'DUPLICATE_SKILL_ALIAS',
        job_id: raw.job_id,
        message: 'Multiple source tokens resolve to the same canonical code.',
      });
    const normalized_role_family =
      roles.find((r) => r.name === raw.role_family_raw || r.aliases.includes(raw.role_family_raw))?.name ||
      raw.role_family_raw;
    const refs = [...(raw.source_reference_raw || '').matchAll(/turn\w+/g)].map((m) => m[0]);
    const directURL = raw.source_url || raw.source_reference_raw?.match(/https?:\/\/[^\s)\]>]+/)?.[0] || null;
    const source_reference = refs.length
      ? refs.join('; ')
      : ['—', 'n/s', ''].includes(raw.source_reference_raw)
        ? ''
        : raw.source_reference_raw;
    const extra = Object.fromEntries(
      optionalFields.map((k) => {
        const v = raw[k];
        return [
          k,
          !v || v === '—'
            ? null
            : ['salary_min', 'salary_max', 'years_experience_min', 'years_experience_max'].includes(k)
              ? Number(v)
              : v,
        ];
      }),
    );
    return {
      ...raw,
      ...extra,
      normalized_role_family,
      seniority_group: seniority(raw.seniority_raw, taxonomy.config),
      normalized_skills,
      source_reference,
      source_url: directURL,
      snapshot_id: metadata.snapshot_id,
      snapshot_label: metadata.label,
      retrieval_date: metadata.retrieval_date,
      snapshot_job_id: `${metadata.snapshot_id}:${raw.job_id}`,
    };
  });
  const jobSkills = [];
  for (const j of jobs) {
    const matches = (s, text) =>
      s.text_pattern ? new RegExp(s.text_pattern, s.text_pattern_flags).test(text || '') : false;
    const activeSkills = skills.filter((s) => s.introduced_in <= metadata.snapshot_id);
    const candidates = new Set([
      ...j.normalized_skills,
      ...activeSkills.filter((s) => matches(s, j.preferred_only)).map((s) => s.skill_code),
      ...activeSkills
        .filter((s) => s.core_text_extension && matches(s, j.core_evidence))
        .map((s) => s.skill_code),
    ]);
    for (const code of candidates) {
      const s = resolve(code);
      if (!s) {
        issues.push({
          severity: 'ERROR',
          code: 'UNKNOWN_SKILL',
          job_id: j.job_id,
          skill_code: code,
          message: `New taxonomy term ${code} requires human review. Add an approved definition or correct the source metadata before publication.`,
        });
        continue;
      }
      const coded = j.normalized_skills.includes(code),
        coreText = matches(s, j.core_evidence),
        preferred = matches(s, j.preferred_only);
      const types = s.undefined_concept
        ? ['unspecified']
        : coded && preferred && !coreText
          ? ['preferred']
          : coded || coreText
            ? preferred
              ? ['core', 'preferred']
              : ['core']
            : ['preferred'];
      for (const requirement_type of types)
        jobSkills.push({
          job_id: j.job_id,
          skill_code: code,
          skill_name: s.skill_name,
          skill_group: s.skill_group,
          requirement_type,
          evidence_text:
            requirement_type === 'preferred'
              ? j.preferred_only
              : coded
                ? `Normalised skills: ${j.normalized_skills_raw}\nCore evidence: ${j.core_evidence}`
                : j.core_evidence,
          evidence_basis: s.undefined_concept
            ? 'Undefined code; classification unavailable'
            : requirement_type === 'preferred'
              ? 'Explicit preferred-only text'
              : coded
                ? 'Report-assigned normalized code'
                : 'Explicit core text extension',
          region: j.region,
          role_family: j.normalized_role_family,
          seniority_group: j.seniority_group,
          source_reference: j.source_reference,
          source_line: j.source_line,
          snapshot_id: j.snapshot_id,
          snapshot_label: j.snapshot_label,
          retrieval_date: j.retrieval_date,
          snapshot_job_id: j.snapshot_job_id,
        });
    }
  }
  return { metadata, jobs, jobSkills, skills, sourceHash: parsed.sourceHash, issues };
}
