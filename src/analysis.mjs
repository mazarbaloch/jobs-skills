export const regions = ['Finland', 'Rest of Europe', 'USA'];
export function observations(rows, type = 'core') {
  return rows.filter((r) => type === 'all' || r.requirement_type === type);
}
export function selectJobs(jobs, rows, filters = {}) {
  const eligible = observations(rows, filters.requirement_type || 'core');
  return jobs.filter(
    (j) =>
      ['region', 'normalized_role_family', 'seniority_group', 'company', 'country'].every(
        (k) => !filters[k] || j[k] === filters[k],
      ) &&
      (!filters.search ||
        `${j.job_id} ${j.exact_title} ${j.company} ${j.core_evidence}`
          .toLowerCase()
          .includes(filters.search.toLowerCase())) &&
      (!filters.skill_code ||
        eligible.some((r) => r.job_id === j.job_id && r.skill_code === filters.skill_code)) &&
      (!filters.skill_group ||
        eligible.some((r) => r.job_id === j.job_id && r.skill_group === filters.skill_group)),
  );
}
export function frequency(jobs, rows, skills, type = 'core') {
  const ids = new Set(jobs.map((j) => j.job_id));
  const allowed = observations(rows, type).filter((r) => ids.has(r.job_id));
  return skills
    .map((s) => {
      const job_ids = [...new Set(allowed.filter((r) => r.skill_code === s.skill_code).map((r) => r.job_id))];
      return {
        ...s,
        count: job_ids.length,
        denominator: jobs.length,
        percentage: jobs.length ? (100 * job_ids.length) / jobs.length : 0,
        job_ids,
      };
    })
    .sort((a, b) => b.count - a.count || a.skill_code.localeCompare(b.skill_code));
}
export function distribution(jobs, key) {
  return [...new Set(jobs.map((j) => j[key]))]
    .map((label) => {
      const job_ids = jobs.filter((j) => j[key] === label).map((j) => j.job_id);
      return {
        label,
        count: job_ids.length,
        denominator: jobs.length,
        percentage: jobs.length ? (100 * job_ids.length) / jobs.length : 0,
        job_ids,
      };
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
export const combinations = [
  ['ML', 'SWE'],
  ['PY', 'CLOUD'],
  ['SWE', 'CLOUD'],
  ['GEN', 'AGT'],
  ['DE', 'CLOUD'],
  ['GEN', 'API'],
  ['GEN', 'RAG'],
  ['AGT', 'EVAL'],
  ['PY', 'SQL'],
  ['AGT', 'OBS'],
  ['AGT', 'SEC'],
  ['GEN', 'RAG', 'EVAL'],
  ['ML', 'CLOUD', 'MLOPS'],
  ['AGT', 'TOOL'],
];
export function combine(jobs, rows, type = 'core') {
  const allowed = observations(rows, type);
  return combinations
    .map((codes) => {
      const job_ids = jobs
        .filter((j) =>
          codes.every((code) => allowed.some((r) => r.job_id === j.job_id && r.skill_code === code)),
        )
        .map((j) => j.job_id);
      return {
        label: codes.join(' + '),
        skill_codes: codes,
        count: job_ids.length,
        denominator: jobs.length,
        percentage: jobs.length ? (100 * job_ids.length) / jobs.length : 0,
        job_ids,
      };
    })
    .sort((a, b) => b.count - a.count);
}
export function csv(rows) {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]);
  const cell = (v) => '"' + String(Array.isArray(v) ? v.join('; ') : (v ?? '')).replaceAll('"', '""') + '"';
  return (
    [keys.map(cell).join(','), ...rows.map((r) => keys.map((k) => cell(r[k])).join(','))].join('\r\n') +
    '\r\n'
  );
}
