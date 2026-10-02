import { existsSync } from 'node:fs';
import { SnapshotId } from '../src/schemas.mjs';
import { runBuild } from './pipeline.mjs';
try {
  const id = SnapshotId.parse(process.argv[2]);
  if (!existsSync(`research/snapshots/${id}/metadata.json`))
    throw Error(`Missing research/snapshots/${id}/metadata.json`);
  const result = runBuild();
  const s = result.snapshots.find((s) => s.metadata.snapshot_id === id);
  console.log(
    `Parsed: ${s.jobs.length} jobs\nErrors: ${s.validation.errors}\nWarnings: ${s.validation.warnings}\nPossible repeated postings: ${s.jobs.filter((j) => j.previously_seen).length}\nComposition warnings: ${result.longitudinal.comparability.comparisons.find((c) => c.to_snapshot === id)?.warnings.length || 0}\nReview data/snapshots/${id}/validation_report.md`,
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
