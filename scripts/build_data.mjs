import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { parseReport } from './parse_report.mjs';
import { validate } from './validate_data.mjs';
import { aggregates } from './generate_aggregates.mjs';
import { csv } from '../src/analysis.mjs';
const source = 'research/original_deep_research_report.md';
const parsed = parseReport(readFileSync(source, 'utf8'));
for (const dir of ['data', 'public/data', 'public/research']) mkdirSync(dir, { recursive: true });
const write = (name, data) => writeFileSync(`data/${name}`, data);
for (const [name, rows] of Object.entries({
  jobs: parsed.jobs,
  skills: parsed.skills,
  job_skills: parsed.jobSkills,
  ...aggregates(parsed),
})) {
  write(`${name}.json`, JSON.stringify(rows, null, 2) + '\n');
  write(`${name}.csv`, csv(rows));
}
const validation = validate(parsed);
write('validation_report.json', JSON.stringify(validation, null, 2) + '\n');
write(
  'validation_report.md',
  `# Appendix validation\n\nSource SHA-256: \`${parsed.sourceHash}\`\n\n${validation.records} records. Structural validation: ${validation.structural_pass ? 'PASS' : 'FAIL'}. ${validation.discrepancies.length} differences; no records altered to match prose.\n\n${validation.notes.map((n) => '- ' + n).join('\n')}\n\n| Category | Statistic | Stated | Calculated | Difference | Explanation |\n|---|---|---:|---:|---:|---|\n${validation.comparisons.map((r) => `| ${r.category} | ${r.label} | ${r.stated} | ${r.calculated} | ${r.difference} | ${r.reason} |`).join('\n')}\n`,
);
copyFileSync(source, 'public/research/original_deep_research_report.md');
const manifest = readdirSync('data')
  .filter((f) => /\.(csv|json|md)$/.test(f) && f !== 'manifest.json')
  .sort();
write('manifest.json', JSON.stringify(manifest, null, 2) + '\n');
for (const name of [...manifest, 'manifest.json']) copyFileSync(`data/${name}`, `public/data/${name}`);
console.log(
  `Extracted ${parsed.jobs.length} jobs, ${parsed.skills.length} taxonomy entries, ${parsed.jobSkills.length} job-skill observations. ${validation.discrepancies.length} documented differences.`,
);
if (!validation.structural_pass) throw Error('Structural validation failed');
