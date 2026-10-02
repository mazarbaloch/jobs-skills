import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, unlinkSync } from 'node:fs';
import { resolve, dirname, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { SnapshotMetadataSchema, SkillSchema, RoleFamilySchema, SnapshotId } from '../src/schemas.mjs';
import { parseReport } from './parse_report.mjs';
import { normalizeJobs } from './normalize.mjs';
import { validateSnapshot, validationMarkdown } from './validate_data.mjs';
import { aggregates } from './generate_aggregates.mjs';
import { trackPostings, buildLongitudinalData } from './build_longitudinal.mjs';
import { distribution, csv } from '../src/analysis.mjs';
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const json = (value) => JSON.stringify(value, null, 2) + '\n';
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function loadTaxonomy(root = process.cwd()) {
  const dir = resolve(root, 'data/taxonomy');
  const skills = read(`${dir}/skills.json`).map((s) => SkillSchema.parse(s)),
    roles = read(`${dir}/role_families.json`).map((r) => RoleFamilySchema.parse(r)),
    version = read(`${dir}/taxonomy_version.json`),
    config = read(`${dir}/normalization.json`);
  for (const [list, key] of [
    [skills, 'skill_code'],
    [roles, 'name'],
  ]) {
    const known = new Map();
    for (const entry of list)
      for (const token of new Set([entry[key], ...entry.aliases])) {
        if (known.has(token)) throw Error(`Duplicate taxonomy alias/code ${token}`);
        known.set(token, entry[key]);
      }
  }
  for (const s of skills) if (s.text_pattern) new RegExp(s.text_pattern, s.text_pattern_flags);
  if (!version.compatible_versions.includes(version.version))
    throw Error('Current taxonomy version must be declared compatible.');
  return { skills, roles, version, config };
}
export function readSnapshot(directory, taxonomy) {
  const metadata = SnapshotMetadataSchema.parse(read(`${directory}/metadata.json`));
  const report = readFileSync(`${directory}/report.md`, 'utf8');
  const snapshot = normalizeJobs(parseReport(report), metadata, taxonomy);
  snapshot.skills = taxonomy.skills.filter((s) => s.introduced_in <= metadata.snapshot_id);
  return { ...snapshot, report };
}
export function aggregateSnapshot(snapshot) {
  const tables = aggregates(snapshot);
  for (const [key, field] of Object.entries({
    role_frequency: 'normalized_role_family',
    region_frequency: 'region',
    country_frequency: 'country',
    seniority_frequency: 'seniority_group',
    company_frequency: 'company',
  }))
    tables[key] = distribution(snapshot.jobs, field);
  if (snapshot.jobs.some((j) => j.sector))
    tables.sector_frequency = distribution(
      snapshot.jobs.map((j) => ({ ...j, sector: j.sector || 'Not specified' })),
      'sector',
    );
  return Object.fromEntries(
    Object.entries(tables).map(([name, list]) => [
      name,
      list.map((r) => ({ ...r, snapshot_id: snapshot.metadata.snapshot_id })),
    ]),
  );
}
export function migrationReport(snapshot, baseline) {
  const project = (record, fields) => Object.fromEntries(fields.map((k) => [k, record[k]]));
  const actualJobs = new Map(snapshot.jobs.map((j) => [j.job_id, digest(project(j, baseline.job_fields))]));
  const actualSkills = new Map(
    snapshot.jobSkills.map((r) => [
      `${r.job_id}:${r.skill_code}:${r.requirement_type}`,
      digest(project(r, baseline.job_skill_fields)),
    ]),
  );
  const differences = [];
  for (const [kind, expected, actual, key] of [
    ['job', baseline.jobs, actualJobs, 'job_id'],
    ['job-skill', baseline.job_skills, actualSkills, 'key'],
  ]) {
    for (const row of expected)
      if (actual.get(row[key]) !== row.sha256)
        differences.push({ kind, key: row[key], change: actual.has(row[key]) ? 'changed' : 'missing' });
    for (const id of actual.keys())
      if (!expected.some((row) => row[key] === id)) differences.push({ kind, key: id, change: 'added' });
  }
  if (snapshot.sourceHash !== baseline.source_sha256)
    differences.push({ kind: 'source', key: snapshot.metadata.snapshot_id, change: 'changed' });
  return {
    snapshot_id: snapshot.metadata.snapshot_id,
    before_jobs: baseline.jobs.length,
    after_jobs: snapshot.jobs.length,
    before_job_skills: baseline.job_skills.length,
    after_job_skills: snapshot.jobSkills.length,
    compared_job_fields: baseline.job_fields,
    compared_job_skill_fields: baseline.job_skill_fields,
    differences,
    passed: differences.length === 0,
    notes:
      'All pre-migration fields compared using immutable evidence fingerprints. Additive snapshot, optional and tracking metadata is excluded. No original IDs, classifications, evidence or roles changed.',
  };
}
export function prepareBuild(root = process.cwd(), sourceRoot = resolve(root, 'research/snapshots')) {
  const taxonomy = loadTaxonomy(root),
    names = readdirSync(sourceRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
      .map((d) => d.name)
      .sort();
  if (!names.length) throw Error('No research snapshots found.');
  const loaded = names.map((name) => {
    SnapshotId.parse(name);
    const s = readSnapshot(resolve(sourceRoot, name), taxonomy);
    if (s.metadata.snapshot_id !== name)
      throw Error(`Directory ${name} differs from metadata snapshot_id ${s.metadata.snapshot_id}`);
    return s;
  });
  const tracked = new Map(
    trackPostings(loaded.filter((s) => s.metadata.status === 'published')).map((s) => [
      s.metadata.snapshot_id,
      s,
    ]),
  );
  const snapshots = loaded.map((s) => tracked.get(s.metadata.snapshot_id) || trackPostings([s])[0]);
  for (const s of snapshots) {
    s.aggregates = aggregateSnapshot(s);
    s.validation = validateSnapshot(s, taxonomy, s.aggregates);
  }
  const baselinePath = resolve(root, 'research/migration/baseline.json');
  let migration = null;
  if (existsSync(baselinePath)) {
    const baseline = read(baselinePath),
      snapshot = snapshots.find((s) => s.metadata.snapshot_id === baseline.snapshot_id);
    if (snapshot) {
      migration = migrationReport(snapshot, baseline);
      if (!migration.passed) {
        snapshot.validation.issues.push({
          severity: 'ERROR',
          code: 'BASELINE_MIGRATION',
          message: 'Original baseline evidence changed. See migration validation report.',
        });
        snapshot.validation.errors++;
        snapshot.validation.structural_pass = false;
      }
    }
  }
  const published = snapshots.filter((s) => s.metadata.status === 'published');
  const longitudinal = buildLongitudinalData(published, taxonomy.config);
  const legacyPath = resolve(root, 'research/original_deep_research_report.md');
  return {
    snapshots,
    published,
    taxonomy,
    migration,
    longitudinal,
    legacyReport: existsSync(legacyPath) ? readFileSync(legacyPath, 'utf8') : null,
  };
}
export function outputFiles(build) {
  const { snapshots, published, taxonomy, longitudinal, migration } = build;
  if (snapshots.some((s) => !s.validation.structural_pass))
    throw Error('ERROR-level validation issues block dashboard publication.');
  if (!published.length) throw Error('No validated published snapshot is available.');
  const files = new Map(),
    downloads = [];
  const put = (path, content) => files.set(path, content);
  const dataset = (prefix, name, value) => {
    put(`${prefix}/${name}.json`, json(value));
    put(`${prefix}/${name}.csv`, csv(value));
  };
  const exportSnapshot = (s, prefix) => {
    dataset(prefix, 'jobs', s.jobs);
    dataset(prefix, 'job_skills', s.jobSkills);
    dataset(prefix, 'skills', s.skills);
    for (const [name, list] of Object.entries(s.aggregates)) dataset(prefix, name, list);
    put(`${prefix}/aggregates.json`, json(s.aggregates));
    put(`${prefix}/validation_report.json`, json(s.validation));
    put(`${prefix}/validation_report.md`, validationMarkdown(s.validation));
  };
  for (const s of snapshots) exportSnapshot(s, `data/snapshots/${s.metadata.snapshot_id}`);
  const latest = published.at(-1);
  // Preserve existing flat download URLs as aliases to the latest published snapshot.
  exportSnapshot(latest, 'data');
  dataset('data/combined', 'jobs', longitudinal.jobs);
  dataset('data/combined', 'job_skills', longitudinal.jobSkills);
  for (const [name, list] of Object.entries(longitudinal.tables)) dataset('data/combined', name, list);
  put('data/combined/comparability_report.json', json(longitudinal.comparability));
  if (migration) {
    put('data/migration_validation_report.json', json(migration));
    put(
      'data/migration_validation_report.md',
      `# Baseline migration validation\n\nSnapshot: ${migration.snapshot_id}\n\n${migration.before_jobs} → ${migration.after_jobs} jobs; ${migration.before_job_skills} → ${migration.after_job_skills} job-skill observations.\n\nDifferences: ${migration.differences.length}. Result: ${migration.passed ? 'PASS' : 'FAIL'}.\n\n${migration.notes}\n`,
    );
  }
  const flatManifest = [...files.keys()]
    .filter((p) => /^data\/[^/]+$/.test(p))
    .map((p) => p.slice(5))
    .sort();
  put('data/manifest.json', json(flatManifest));
  for (const [path, content] of [...files]) {
    if (
      path.startsWith('data/snapshots/') &&
      !published.some((s) => path.startsWith(`data/snapshots/${s.metadata.snapshot_id}/`))
    )
      continue;
    put(`public/${path}`, content);
    if (path !== 'data/manifest.json') downloads.push(path.slice(5));
  }
  for (const name of ['skills', 'role_families', 'taxonomy_version', 'normalization']) {
    const value =
      name === 'skills'
        ? taxonomy.skills
        : name === 'role_families'
          ? taxonomy.roles
          : name === 'taxonomy_version'
            ? taxonomy.version
            : taxonomy.config;
    put(`public/data/taxonomy/${name}.json`, json(value));
    downloads.push(`taxonomy/${name}.json`);
  }
  const entries = published.map((s) => {
    const id = s.metadata.snapshot_id,
      prefix = `snapshots/${id}`;
    const manifest = downloads.filter((path) => path.startsWith(`${prefix}/`));
    const entry = {
      ...s.metadata,
      records: s.jobs.length,
      source_sha256: s.sourceHash,
      errors: s.validation.errors,
      warnings: s.validation.warnings,
      report_path: `research/snapshots/${id}/report.md`,
      bundle_path: `data/${prefix}/dashboard.json`,
      validation_path: `data/${prefix}/validation_report.json`,
      downloads: manifest,
    };
    put(`public/research/snapshots/${id}/report.md`, s.report);
    put(
      `public/data/${prefix}/dashboard.json`,
      json({
        metadata: entry,
        jobs: s.jobs,
        jobSkills: s.jobSkills,
        skills: s.skills,
        validation: s.validation,
      }),
    );
    return entry;
  });
  if (build.legacyReport) put('public/research/original_deep_research_report.md', build.legacyReport);
  const catalog = {
    schema_version: '1.0',
    latest_snapshot_id: latest.metadata.snapshot_id,
    taxonomy_version: taxonomy.version.version,
    snapshots: entries,
    downloads: downloads.sort(),
    skills: taxonomy.skills,
    role_families: taxonomy.roles,
    comparability: longitudinal.comparability,
  };
  put('data/catalog.json', json(catalog));
  put('public/data/catalog.json', json(catalog));
  const compactRows = longitudinal.jobSkills.map(
    ({ job_id, snapshot_job_id, snapshot_id, skill_code, skill_group, requirement_type }) => ({
      job_id,
      snapshot_job_id,
      snapshot_id,
      skill_code,
      skill_group,
      requirement_type,
    }),
  );
  put('public/data/combined/dashboard.json', json({ jobs: longitudinal.jobs, jobSkills: compactRows }));
  return files;
}
export function runBuild({
  root = process.cwd(),
  sourceRoot = resolve(root, 'research/snapshots'),
  check = false,
} = {}) {
  let build;
  try {
    build = prepareBuild(root, sourceRoot);
  } catch (error) {
    if (!check) {
      mkdirSync(resolve(root, 'data'), { recursive: true });
      writeFileSync(
        resolve(root, 'data/ingestion_errors.json'),
        json({ issues: [{ severity: 'ERROR', code: 'INPUT_SCHEMA', message: error.message }] }),
      );
    }
    throw error;
  }
  const invalid = build.snapshots.filter((s) => !s.validation.structural_pass);
  if (invalid.length) {
    if (!check)
      for (const s of invalid) {
        const dir = resolve(root, `data/snapshots/${s.metadata.snapshot_id}`);
        mkdirSync(dir, { recursive: true });
        writeFileSync(`${dir}/validation_report.json`, json(s.validation));
        writeFileSync(`${dir}/validation_report.md`, validationMarkdown(s.validation));
      }
    throw Error(
      invalid
        .map(
          (s) =>
            `${s.metadata.snapshot_id}: ${s.validation.errors} ERROR(s). Inspect data/snapshots/${s.metadata.snapshot_id}/validation_report.md`,
        )
        .join('\n'),
    );
  }
  const files = outputFiles(build);
  for (const [path, content] of files) {
    const full = resolve(root, path);
    if (check) {
      if (!existsSync(full) || readFileSync(full, 'utf8') !== content)
        throw Error(`Generated artifact is stale or missing: ${path}. Run npm run data:build.`);
    } else {
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, content);
    }
  }
  // Remove only stale files in generated public trees; never touch research or canonical taxonomy.
  if (!check) {
    for (const folder of ['public/data', 'public/research/snapshots']) {
      const base = resolve(root, folder);
      if (existsSync(base))
        for (const file of readdirSync(base, { recursive: true, withFileTypes: true }).filter((f) =>
          f.isFile(),
        )) {
          const full = resolve(file.parentPath, file.name),
            relative = full
              .slice(resolve(root).length + 1)
              .split(sep)
              .join('/');
          if (!full.startsWith(base + sep)) throw Error('Generated cleanup escaped its root.');
          if (!files.has(relative)) unlinkSync(full);
        }
    }
    const diagnostic = resolve(root, 'data/ingestion_errors.json');
    if (existsSync(diagnostic)) unlinkSync(diagnostic);
  }
  return build;
}
