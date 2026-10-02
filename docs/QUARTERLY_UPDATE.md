# Updating the quarterly labour-market observatory

This guide is for the person receiving the next research report. Adding a quarter is a data operation. You should not need to edit React components, chart counts, filter options or routes.

## 1. Prepare the research

Obtain the new quarterly Deep Research report through your research process. Preserve the same labour-market-only scope, explicit employer evidence, source citations and separation of core versus preferred requirements. Record changes in sample design rather than silently treating the new sample as identical to the previous one. This repository does not search for or collect new vacancies.

The report must contain structured Markdown job tables. Column order may vary. Supported required headers are:

| Header            | Accepted alternative   |
| ----------------- | ---------------------- |
| ID                | Job ID                 |
| Exact title       | Title                  |
| Family            | Role family            |
| Company           | —                      |
| Country           | —                      |
| Region            | —                      |
| Location          | —                      |
| Seniority         | —                      |
| Experience        | —                      |
| Post date/status  | Posting date or status |
| Core evidence     | —                      |
| Preferred-only    | Preferred only         |
| Normalised skills | Normalized skills      |
| Source            | Source reference       |

Snake-case equivalents are supported. IDs may be reused between quarters (F01, E01, U01), but must be unique inside a quarter. Normalized skills are comma-separated codes or approved aliases. Do not use empty or duplicated entries. Extra source columns may include `source_url`, sector, industry, employment type, remote status, salary bounds/currency, education requirement, experience bounds, requisition ID and first/last seen dates. Unprovided optional fields remain null; they are never inferred. Escape literal pipes within Markdown cells as `\|`.

If the report structure differs materially, extend **only the parser interface** and add fixtures. Do not work around a parser error by silently dropping records or modifying dashboard code.

## 2. Add the report and metadata

Start on the main branch and update it:

```sh
git switch main
git pull --ff-only
npm ci
```

Copy `research/snapshots/_template/` to `research/snapshots/2027-Q1/`. Save the new source as `report.md` and rename `metadata.example.json` to `metadata.json`.

Snapshot IDs follow `YYYY-Q1` through `YYYY-Q4`. The folder and metadata ID must match. The ID describes the sampled quarter, while `retrieval_date` records the actual collection/recheck date. An out-of-quarter retrieval is flagged for review rather than silently changed.

Fill in the label, real retrieval date, record count, notes and versions. `expected_regions` is optional, for example an object with Finland, Rest of Europe and USA counts. Do not copy the baseline's 87/31/25/31 expectations into a new study. `reported_statistics` can capture prose claims to audit; it never supplies chart values.

Keep `status: "draft"` while reviewing. Drafts are parsed and validated but do not enter the public catalogue, longitudinal analysis or vacancy persistence tracking. Use `published` only after resolving errors and reviewing warnings. `withdrawn` preserves the source but removes it from publication during the next rebuild.

## 3. Ingest and review

```sh
npm run ingest -- 2027-Q1
```

This rebuilds all snapshots and longitudinal outputs deterministically. It prints the requested quarter's parsed count, ERROR/WARNING counts, likely repeated postings and composition warnings. Inspect:

- `data/snapshots/2027-Q1/validation_report.md` and `.json`
- `data/snapshots/2027-Q1/jobs.csv` and `job_skills.csv`
- `data/combined/comparability_report.json` after marking the snapshot published

ERROR means publication is blocked. Examples include unknown skill/role codes, invalid seniority, duplicated IDs, malformed skill lists, missing citations, incorrect expected counts or invalid denominators. The command exits unsuccessfully and does not replace public assets with invalid data. For metadata/schema failures, inspect `data/ingestion_errors.json`; for parsed-record failures, inspect the snapshot validation report.

WARNING means the source needs interpretation, not automatic correction. Typical examples are mixed seniority, undefined source concepts retained as unspecified, deprecated codes, out-of-quarter rechecks and differences between prose and appendix calculations. Do not change records just to reproduce a published number.

INFO preserves context such as missing public URLs. Citation references can exist without public URLs. Never invent URLs from Deep Research citation IDs.

For an immutable source fingerprint, copy `source_sha256` from the validation report into the metadata once the source is accepted. Rebuilding never writes or rewrites your report or metadata. The baseline's source is already fingerprinted, and its old evidence fields also have independent migration fingerprints.

## 4. Handle taxonomy changes deliberately

The source of record is `data/taxonomy/`, not generated `data/skills.json`.

- `skills.json`: canonical codes, names, groups, descriptions, origin, aliases, introduction/deprecation quarter and version; explicit lexical matching rules are also versioned here.
- `role_families.json`: canonical family names and aliases.
- `taxonomy_version.json`: current and explicitly compatible versions.
- `normalization.json`: regions, seniority mappings and composition-warning thresholds.

Unknown codes trigger ERROR and require a person to decide whether the term is a typo, an alias of an existing concept or a genuinely new concept. Add a new item explicitly only after review. Give it a stable code, meaningful description, `introduced_in`, version and aliases. Use null for `deprecated_in` until needed. `core_text_extension` should normally be false: the report-assigned code is evidence; adding a regex must not infer unrelated requirements. Use a narrowly supported pattern only when deliberately extending explicit-text extraction.

Do not rename old concepts silently or reuse an old code for a new meaning. Prefer aliases. For a materially different concept, create a new code and document its relationship. Update the taxonomy version and compatibility list deliberately. Existing metadata continues to record the version used for that snapshot. Skills introduced after an older snapshot are absent from that snapshot's coding, not counted as historical zeros in trend comparisons. Original baseline evidence changes will fail the migration check.

Methodology versions are separate. Change `methodology_version` when collection or coding rules materially change and describe the difference in notes. Different versions produce visible comparison warnings; no automatic representativeness score is calculated.

## 5. Review composition and repeated vacancies

Composition is calculated per snapshot for region, country, role, seniority, company and sector when supplied. Every comparison records both counts and denominators.

The default diagnostic warnings flag:

- a share change of at least 10 percentage points;
- a relative change of at least 50% with at least a 3-point absolute change (useful for shrinking junior groups);
- sample-size change of at least 25%;
- different methodology or taxonomy versions.

These are configurable review thresholds, not significance tests or a sampling-quality score. Company-level changes expose concentration shifts. Smaller changes and small samples still require judgement. The full composition table remains available even when no threshold is crossed.

Likely persistent vacancies match normalized company plus requisition ID when available, otherwise source URL, otherwise exact title + location + country. These are **possible matches**, not proven vacancy identities. Observe `posting_identity`, `previously_seen`, `first_seen_snapshot` and `last_seen_snapshot`. Each observation retains its separate `snapshot_job_id`, such as `2027-Q1:F01`; no historical observation is merged away. Draft and withdrawn quarters do not affect published persistence tracking.

## 6. Validate the published selection locally

After review, set the new snapshot's status to `published`, then run:

```sh
npm run ingest -- 2027-Q1
npm run rebuild
npm run test:e2e
npm run dev
```

Check that the latest period changed, the previous quarter remains selectable, filters use the selected quarter's denominator, Trends shows separate counts/N, archive links open the right reports and selected/all-snapshot downloads work. The automated two-quarter fixture lives only under `tests/fixtures`; never copy it into real research folders.

For the same base path as GitHub Pages in PowerShell:

```powershell
$env:VITE_BASE_PATH = '/jobs-skills/'
npm run build
npm run test:e2e
Remove-Item Env:VITE_BASE_PATH
```

The production directory is `dist/`. The workflow gets the actual Pages base path from `configure-pages`, so its tests cover the deployment path.

## 7. Commit, push and check deployment

```sh
git add .
git commit -m "Add 2027 Q1 labour-market snapshot"
git push origin main
```

Pushes to main run `.github/workflows/deploy-pages.yml`: install → rebuild and validate → tests → production build → browser/path tests → reproducibility check → artifact upload → Pages deployment. Any ERROR or failed check stops deployment. Pages is configured to use GitHub Actions, not a branch's docs folder.

Wait for **Deploy GitHub Pages** to succeed in Actions. Then check the live site, period selector and one CSV/report download. CI success alone is not confirmation that the Pages deployment job completed.

## 8. Roll back a problem

If validation fails before pushing, public assets are not replaced. Correct the metadata, configuration or parser and rebuild. Do not delete or overwrite historical research reports.

If a newly published quarter should be withdrawn, set its metadata status to `withdrawn`, rebuild, commit and push. Its source and derived snapshot audit remain in the repository, while the latest valid published snapshot becomes the default. Review the withdrawal in notes. Stale generated public files for unpublished snapshots are removed during rebuild.

For an application regression, use `git revert <bad-commit>` and push the revert to main; avoid rewriting shared history. Preserve any archived research evidence when selecting what to revert. You can also rerun the Pages workflow on main after restoring the intended state.

## Source versus generated files

**Edit intentionally:** `research/snapshots/*/report.md` (new immutable sources only), each metadata file, `data/taxonomy/*`, and documented pipeline code. `research/migration/baseline.json` is a preserved audit fingerprint, not a value to update to make checks pass.

**Never edit by hand:** `data/snapshots/*`, `data/combined/*`, `data/catalog.json`, legacy flat `data/*` exports, migration reports, `public/data/*`, `public/research/*` and `dist/`. Regenerate them. The old flat data URLs point to the latest published snapshot for backward compatibility; snapshot-specific URLs are permanent. The legacy original-report URL continues to serve the original baseline report.
