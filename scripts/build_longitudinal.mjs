import { createHash } from 'node:crypto';
import { distribution } from '../src/analysis.mjs';
export function postingIdentity(j) {
  const norm = (v) => (v || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
  const parts = j.requisition_id
    ? [j.company, j.requisition_id]
    : j.source_url
      ? [j.company, j.source_url]
      : [j.company, j.exact_title, j.location, j.country];
  return createHash('sha256').update(parts.map(norm).join('|')).digest('hex').slice(0, 24);
}
export function trackPostings(snapshots) {
  const groups = new Map();
  for (const s of snapshots)
    for (const j of s.jobs) {
      const key = postingIdentity(j);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(j.snapshot_id);
    }
  return snapshots.map((s) => ({
    ...s,
    jobs: s.jobs.map((j) => {
      const seen = [...new Set(groups.get(postingIdentity(j)))].sort();
      return {
        ...j,
        posting_identity: postingIdentity(j),
        previously_seen: seen[0] < j.snapshot_id,
        first_seen_snapshot: seen[0],
        last_seen_snapshot: seen.at(-1),
      };
    }),
  }));
}
export function compositionReport(snapshots, config) {
  const comparisons = [];
  for (let i = 1; i < snapshots.length; i++) {
    const a = snapshots[i - 1],
      b = snapshots[i],
      changes = [],
      warnings = [];
    for (const field of [
      'region',
      'country',
      'normalized_role_family',
      'seniority_group',
      'company',
      'sector',
    ]) {
      const labels = [...new Set([...a.jobs, ...b.jobs].map((j) => j[field]).filter(Boolean))].sort();
      for (const label of labels) {
        const countA = a.jobs.filter((j) => j[field] === label).length,
          countB = b.jobs.filter((j) => j[field] === label).length,
          shareA = a.jobs.length ? (countA / a.jobs.length) * 100 : 0,
          shareB = b.jobs.length ? (countB / b.jobs.length) * 100 : 0;
        const change = {
          dimension: field,
          label,
          before: { count: countA, denominator: a.jobs.length, percentage: shareA },
          after: { count: countB, denominator: b.jobs.length, percentage: shareB },
          percentage_point_change: shareB - shareA,
        };
        changes.push(change);
        if (
          Math.abs(shareB - shareA) >= config.composition_warning_percentage_points ||
          (shareA > 0 &&
            Math.abs(shareB - shareA) >= config.composition_warning_min_pp &&
            Math.abs(shareB - shareA) / shareA >= config.composition_warning_relative_fraction)
        )
          warnings.push(
            `${field}: ${label} changed from ${countA}/${a.jobs.length} (${shareA.toFixed(1)}%) to ${countB}/${b.jobs.length} (${shareB.toFixed(1)}%) of the sample.`,
          );
      }
    }
    if (
      Math.abs(b.jobs.length - a.jobs.length) / Math.max(1, a.jobs.length) >=
      config.sample_size_warning_fraction
    )
      warnings.push(`Sample size changed from ${a.jobs.length} to ${b.jobs.length} observations.`);
    if (a.metadata.methodology_version !== b.metadata.methodology_version)
      warnings.push(
        'These snapshots were collected using different methodology versions. Interpret separately; do not treat the difference as a continuous market trend.',
      );
    if (a.metadata.taxonomy_version !== b.metadata.taxonomy_version)
      warnings.push(
        'Taxonomy versions differ. Check introduced, deprecated and migrated concepts before comparison.',
      );
    comparisons.push({
      from_snapshot: a.metadata.snapshot_id,
      to_snapshot: b.metadata.snapshot_id,
      comparable_versions:
        a.metadata.methodology_version === b.metadata.methodology_version &&
        a.metadata.taxonomy_version === b.metadata.taxonomy_version,
      changes,
      warnings,
    });
  }
  return {
    thresholds: config,
    interpretation:
      'Diagnostic warnings, not a representativeness score. Quarterly changes may reflect sample, employer, role, region, seniority, posting-detail or methodology differences.',
    comparisons,
  };
}
export function buildLongitudinalData(snapshots, config) {
  const jobs = snapshots.flatMap((s) => s.jobs),
    jobSkills = snapshots.flatMap((s) => s.jobSkills);
  const tables = {};
  const names = {
    skill_frequency_overall: 'skill_frequency_by_snapshot',
    role_frequency: 'role_frequency_by_snapshot',
    region_frequency: 'region_frequency_by_snapshot',
  };
  for (const s of snapshots)
    for (const [name, list] of Object.entries(s.aggregates)) {
      const key = names[name] || name;
      (tables[key] ??= []).push(...list);
    }
  return { jobs, jobSkills, tables, comparability: compositionReport(snapshots, config) };
}
