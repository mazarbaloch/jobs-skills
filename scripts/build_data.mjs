import { runBuild } from './pipeline.mjs';
try {
  const build = runBuild({ check: process.argv.includes('--check') });
  for (const s of build.snapshots)
    console.log(
      `${s.metadata.snapshot_id}: ${s.jobs.length} jobs; ${s.validation.errors} errors; ${s.validation.warnings} warnings; ${s.jobs.filter((j) => j.previously_seen).length} possible repeated postings.`,
    );
  console.log(
    `${build.published.length} published snapshot(s); latest ${build.published.at(-1)?.metadata.snapshot_id}. Baseline migration: ${build.migration?.passed ? 'PASS' : 'not applicable'}.`,
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
