# Add a quarterly research snapshot

This directory is a template, not research evidence. It is ignored by discovery.

1. Copy this directory to `research/snapshots/YYYY-QN/`, for example `2027-Q1`.
2. Save the new, unchanged Deep Research report as `report.md`.
3. Rename `metadata.example.json` to `metadata.json` and replace every example value with the actual study details. The retrieval date is a placeholder, not a planned or inferred collection date. Set the real expected record count, or omit that field when unavailable. Keep `status: "draft"` during review.
4. Run `npm run ingest -- 2027-Q1` from the repository root.
5. Read `data/snapshots/2027-Q1/validation_report.md`. Resolve every ERROR. Review warnings, classification, taxonomy terms and source citations.
6. Set `status` to `published` after review. Run ingestion again, then inspect `data/combined/comparability_report.json` and the dashboard's Trends page. Only published snapshots enter the public archive and longitudinal comparisons.
7. Run `npm run rebuild` and `npm run test:e2e`.
8. Commit and push to `main`. GitHub Actions validates, tests, builds and deploys to Pages.

Do not edit an old report to add a quarter. Do not put synthetic jobs in this folder. Unknown skills must be reviewed and added explicitly to the shared taxonomy; ingestion never adds them automatically.

See [the full quarterly update guide](../../../docs/QUARTERLY_UPDATE.md) for supported table headers, taxonomy updates, composition warnings and rollback.
