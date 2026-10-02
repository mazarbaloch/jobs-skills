# Quarterly Labour-Market Observatory

An interactive, reproducible quarterly observatory. Its initial snapshot is the supplied **Data, Analytics, Machine Learning and AI Job Market 2026: Finland, Rest of Europe and the United States** report. New reports enter through ingestion, without edits to React components, filters or chart counts. The existing dashboard and October 2026 evidence are preserved; no new jobs were researched.

For the next quarter, follow [QUARTERLY_UPDATE.md](docs/QUARTERLY_UPDATE.md). The reusable source template is [research/snapshots/_template](research/snapshots/_template/README.md).

**Interpretation:** purposive employer-posting sample. Results describe the analysed vacancies and are not estimates of total labour-market prevalence. This project contains no curriculum analysis or educational recommendations.

## Run locally

Requires Node.js 24 and npm.

```sh
npm ci
npm run dev
```

Open the local Vite URL. `npm install` also works; the committed lockfile pins verified dependencies.

```sh
npm run data:build      # Parse, normalize, validate, aggregate, publish static data
npm run ingest -- 2027-Q1 # Ingest a newly added report + metadata and rebuild all derived data
npm run data:validate   # Reparse source and verify generated artifacts
npm test               # Data, provenance, filter and export tests
npm run build          # Regenerate data, type-check, create dist/
npm run preview        # Serve production build
npm run rebuild        # Generation + validation + unit tests + production build
```

Browser verification:

```sh
npx playwright install chromium
npm run build
npm run test:e2e
```

Playwright starts the production preview automatically and exercises every section, filters, drill-down, empty states, preferred evidence, mobile overflow, keyboard controls, static downloads and browser ZIP generation.

## Pipeline and architecture

```text
research/snapshots/YYYY-QN/report.md + metadata.json (immutable sources)
 → scripts/parse_report.mjs
 → scripts/normalize.mjs + shared data/taxonomy configuration
 → structured jobs + long-form job skills with snapshot_job_id
 → scripts/validate_data.mjs
 → snapshot aggregates + cross-quarter persistence/comparability
 → data/snapshots/ + data/combined/ + generated catalogue
 → public/data/ static assets, loaded by selected period
 → existing React dashboard using shared src/analysis.mjs calculations
 → chart → supporting job IDs → original evidence → report
```

The supplied `report.md` and `research/original_deep_research_report.md` remain untouched. Their canonical baseline snapshot is `research/snapshots/2026-Q4/report.md`, also byte-identical. Snapshot sources are never written by rebuild. Source hashes and pre-migration evidence fingerprints preserve the audit trail. Generation is deterministic: no network requests, changing timestamps or manual aggregate edits.

```text
research/
  snapshots/2026-Q4/{report.md,metadata.json}   SOURCE
  snapshots/_template/                       SOURCE TEMPLATE
  migration/baseline.json                     IMMUTABLE BEFORE-MIGRATION FINGERPRINTS
data/
  taxonomy/                                  CANONICAL CONFIGURATION — SOURCE
  snapshots/2026-Q4/                          GENERATED JOBS, SKILLS, AGGREGATES, VALIDATION
  combined/                                  GENERATED LONGITUDINAL DATA AND COMPARABILITY
  catalog.json                               GENERATED DISCOVERY METADATA
  migration_validation_report.{json,md}       GENERATED BEFORE/AFTER AUDIT
  *.csv, *.json                              GENERATED LATEST-SNAPSHOT COMPATIBILITY EXPORTS
public/{data,research}/                       GENERATED DEPLOYMENT ASSETS
scripts/                                     PARSING, NORMALIZATION, VALIDATION, BUILD
src/                                         EXISTING UI + PERIOD LOADER, TRENDS, ARCHIVE
tests/fixtures/                              BASELINE EVIDENCE AND ISOLATED SYNTHETIC QUARTERS
docs/QUARTERLY_UPDATE.md                      HUMAN MAINTAINER GUIDE
```

| Path                                             | Purpose                                                                 |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| `research/`                                      | Immutable source report                                                 |
| `scripts/parse_report.mjs`                       | Header-based Markdown table parser with a raw-record interface          |
| `scripts/normalize.mjs`                          | Shared-taxonomy normalization and core/preferred classification         |
| `scripts/validate_data.mjs`                      | Structural audit and published-claim comparisons                        |
| `scripts/generate_aggregates.mjs`                | Frequencies and combinations                                            |
| `scripts/build_data.mjs`, `scripts/pipeline.mjs` | All-snapshot build and fail-before-publication orchestration            |
| `scripts/build_longitudinal.mjs`                 | Persistent-vacancy candidates, trend tables and composition diagnostics |
| `data/`                                          | Generated CSV/JSON datasets, manifest and validation reports            |
| `public/data/`, `public/research/`               | Deployable download assets                                              |
| `src/analysis.mjs`                               | Shared filtering, unique-job counts and CSV serialization               |
| `src/main.tsx`, `src/style.css`                  | Dashboard, reusable views and responsive styling                        |
| `tests/`                                         | Node data tests and Playwright browser tests                            |

React, TypeScript and Vite form a static application. Recharts renders the regional chart. Semantic buttons and HTML tables provide accessible bars, heatmaps, sortable records and evidence drill-down. React Markdown renders the report safely, displaying citation tokens as readable references. Mermaid blocks remain readable source code. `fflate` generates ZIP downloads in the browser.

`src/schemas.mjs` defines runtime Zod schemas; `src/types.ts` derives TypeScript types for snapshot metadata, jobs, job skills, taxonomy, validation, aggregates and trend observations. Ingestion validates source configuration and records, and the browser validates imported catalogue/bundle data. Only the selected snapshot is loaded initially. Trends lazily loads combined records with compact skill observations; no server/database is needed.

## Data model

`jobs.csv/json` has one record per snapshot observation: exact title, raw/normalized role family and seniority, company, country, region, location, experience, status/date, retrieval date, core evidence, preferred-only evidence and original skill codes. Every record retains the exact appendix row, line and citation, plus `snapshot_id`, `snapshot_label` and globally safe `snapshot_job_id` (for example `2026-Q4:F01`). Original IDs stay unchanged. Public URLs are nullable; none were available for the baseline.

Repeated vacancies are not errors or merged records. A conservative company/requisition, URL, or company/title/location/country fingerprint supplies `posting_identity`, `previously_seen`, `first_seen_snapshot` and `last_seen_snapshot`. It identifies possible repeats, not proven identity. Optional sector, industry, employment, remote status, salary, education, experience bounds, requisition and first/last-seen fields remain null when unprovided.

CSV arrays use semicolon-separated values inside quoted cells; JSON retains arrays. Quotes, commas, Unicode and multiline evidence are tested. Public URLs remain blank in CSV and null in JSON. Deep Research identifiers such as `turn21search1` are citation references, not public URLs.

`skills.csv/json` contains code, source name, analytical group, description and origin. Slash-combined definitions expand AWS/AZ/GCP, DKR/K8S and MLOPS/LLOPS without changing meanings. High-level groups are presentation choices, not additional requirements.

`job_skills.csv/json` has one row per **job × skill × requirement type**, including exact evidence, classification basis, source reference/line and subgroup metadata. A skill may appear as both core and preferred for one job; every frequency counts unique job IDs, including All mode.

All generated frequency tables include count, denominator, percentage and supporting IDs. Datasets cover overall/regional/role/seniority skills, roles by region, technologies, combinations and emerging titles. Saved aggregates use core evidence; the dashboard recalculates for the chosen evidence type.

## Normalization rules

Role aliases only expand ML Engineering → Machine Learning Engineering, GenAI/LLM → GenAI / LLM, MLOps/ML Platform → MLOps / ML Platform, and AI Platform/Infrastructure → AI Platform / Infrastructure. Other families and all exact titles remain unchanged.

| Source seniority                                 | Normalized group            |
| ------------------------------------------------ | --------------------------- |
| Junior, Entry/Graduate                           | Entry / Junior              |
| Mid                                              | Mid                         |
| Senior, Senior/VP                                | Senior                      |
| Staff, Lead, Principal, Staff/Principal, Lead/VP | Staff / Lead / Principal    |
| Mid/Senior, Senior/Lead, Entry/Mid               | Ambiguous: [original label] |
| Future unrecognized labels                       | Ambiguous: [original label] |

VP is an organizational rank; the explicit Senior/Lead word determines those two mappings. No experience thresholds are inferred. The 25 mixed-level records remain ambiguous instead of forcing the published four-way distribution.

Core/preferred rules:

1. Appendix normalized codes are treated as the report's core coding, even where the short core text does not repeat the skill name. Evidence basis identifies this as source-assigned coding, not independent verification of the posting.
2. Explicit Preferred-only matches produce preferred observations. A code matching only preferred text takes preferred classification. Explicit presence in both fields yields both types.
3. Related competencies never imply unnamed requirements: LLM does not imply agents, agents do not imply tool calling, ML does not imply a framework.
4. `DOM` occurs in records but is never defined in the report. It stays undefined, with requirement type **unspecified**. Its expansion is not guessed.
5. `R` lacks a paragraph definition, but explicit Python/R evidence supports the appendix code. This origin is documented.
6. `CLOUD`, `FT` (fine-tuning), `PROMPT` and named tools are explicit-text extensions, marked in the taxonomy. Complete lexical mappings are versioned in `data/taxonomy/skills.json`. The parser does not reinterpret all core prose; original codes remain authoritative. New concepts and aliases require human review; unknown codes block publication. Introduction/deprecation quarter and version fields prevent silent historical renaming or backfilling.
7. Tool extensions are LangChain, LangGraph, LlamaIndex, Semantic Kernel, PyTorch, TensorFlow, dbt and Spark/PySpark. Only explicit names count. Generic framework mentions never establish named tools.
8. Generic cloud uses explicit cloud wording, including multicloud, independently of AWS/Azure/GCP. Named providers do not backfill generic cloud. Overlapping categories must not be summed.
9. Unmapped preferred wording stays in the original Preferred-only field. Lexical extraction does not claim exhaustive semantic coverage.

Emerging-title selection uses explicit title terms AI, LLM, intelligence, agentic or forward deployed. It is a reproducible descriptive view, not evidence of historical novelty. Cross-role, production, specialised and similar signal categories are transparent analytical groupings, not universal claims about foundational skills.

## Baseline validation and migration findings

All **87** IDs are unique and complete. Regions match **31 Finland, 25 Rest of Europe, 31 USA**; all eleven role totals match. Every job-skill reference resolves. Every job has a source citation; public URLs are unavailable.

Seven published comparisons differ:

| Statistic                     | Report | Calculated | Reason                                                      |
| ----------------------------- | -----: | ---------: | ----------------------------------------------------------- |
| Entry / Junior                |      4 |          2 | Entry/Mid retained as ambiguous                             |
| Senior                        |     52 |         33 | Mixed levels retained                                       |
| Staff / Lead / Principal      |     22 |         18 | Mixed levels retained                                       |
| Communication                 |     76 |         72 | Appendix code count differs from prose                      |
| SQL                           |     16 |         17 | Appendix code count differs from prose                      |
| Generic cloud, overall        |     33 |         19 | Explicit core cloud text; no generic cloud code in appendix |
| Generic cloud, AI Engineering |     11 |          5 | Same cloud distinction                                      |

The data reproduce 25 agent postings, one title containing “Agentic AI”, and 13 agent records among 21 AI Engineering postings. Other requested AI Engineering skill comparisons match. Published numbers exist as validation expectations only, never chart inputs. `data/validation_report.md/json` contains every comparison, explanation and the source hash.

Discrepancies are audit findings, not structural failures. Duplicate/missing IDs, invalid relations and stale artifacts fail verification. Tests preserve observed differences instead of altering records to match prose.

Before/after migration compares every original job and job-skill field, independently of the new metadata. Result: **87 → 87 jobs, 866 → 866 skill observations, zero changed or missing fields**. Source reports are unchanged. There are **0 ERRORs and 9 WARNINGs**: the seven existing prose differences plus mixed seniority and undefined source concepts. See `data/migration_validation_report.md` and the snapshot validation report. Expected counts and prose claims now live in snapshot metadata rather than pipeline constants.

## Dashboard and filter semantics

Views cover overview, title variants, multi-role comparison, role × skill heatmap, regions, AI Engineering, agentic AI, GenAI, signal groupings, combinations, seniority, searchable records, downloads, quality, report and methodology. Charts expose supporting job records and exact evidence. Dialogs support keyboard access, focus management and Escape. Wide tables scroll within their panels on mobile.

The global period selector defaults to the latest **published** snapshot, discovered from the generated catalogue. Historical selections remain separate samples. Switching period resets filters; trend-point drill-down deliberately carries its filters into the selected period. A Research Archive lists each report, validation and downloads. Data-version information is populated from metadata.

Trends is dormant with one snapshot. With multiple snapshots it provides taxonomy-driven competency/technology views and role, region and seniority composition views. Global filters apply separately to each quarter. Counts and N accompany every share, and points open supporting records. Different methodology/taxonomy versions receive explicit warnings. Composition diagnostics expose every region, country, role, seniority and company share, optional sector shares, sample-size changes and configurable threshold warnings. They do not assign a representativeness score or establish market-wide trends.

Global filters select region, role, seniority, company, country, group and individual skill. Requirement type selects observations; it does **not** discard jobs just because no observation of that type exists. Skill filters select jobs matching that evidence type. Preferred alone retains the selected sample denominator; Preferred + MCP selects jobs with explicit preferred MCP.

Denominators use selected jobs or a named subgroup. Zero denominators display “—”. Core/preferred comparison tables deliberately show both types. Full-source audit tables and downloads are labelled independent of filters. Selection exports apply filters; record-table exports also apply local search. Groups below five and ten records receive distinct small-sample warnings.

## Deploy

Run `npm run build` and publish the **entire `dist/` directory** to any static host. No backend or secrets are needed. Relative Vite assets support a repository subpath such as `/jobs-skills/`. Serve over HTTP(S), not `file://`. All data/report downloads are included. Google Fonts is an optional typography enhancement with system-font fallback.

GitHub Pages already uses GitHub Actions. `.github/workflows/deploy-pages.yml` deploys automatically on **main** pushes and also supports manual dispatch. It uses the [current official Pages workflow approach](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages): configure Pages, validate/rebuild, run unit and browser tests, verify generated artifacts, upload `dist/`, then deploy in a separate job gated on successful build. ERROR-level data validation or a failed test prevents deployment. The actual Pages base path comes from `configure-pages` and is applied through `VITE_BASE_PATH`; the `/jobs-skills/` path is browser-tested. No history-based routes require a fallback server.

## Future dataset updates

Add `research/snapshots/2027-Q1/report.md` and `metadata.json`, then run `npm run ingest -- 2027-Q1`. Review validation, approve any new taxonomy terms, mark the reviewed snapshot published, rebuild/test, commit and push to main. No parser input-path or React changes are needed for a standard report. Follow [the full maintainer guide](docs/QUARTERLY_UPDATE.md) for exact steps, taxonomy evolution, composition checks and withdrawal/rollback.

Tests include full baseline regression, identity collisions, repeated postings, draft exclusion, invalid-source publication blocking, combined denominators, deterministic rebuilding, report immutability, runtime schema integrity and a two-quarter synthetic browser simulation. Synthetic data is confined to `tests/fixtures` (generated fixture outputs are ignored by Git), and production is explicitly checked for fixture contamination.

## Methodology and limitations

The source is purposive and senior-heavy, overrepresenting technology, consulting, finance and AI-intensive employers. It contains 87 high-confidence postings rather than the initial 250–300 target. Employer/ATS sources were preferred; multi-location postings count once. Four recently closed 2026 postings remain explicitly identified. All records were retrieved or rechecked 2 October 2026.

Missing skill evidence does not mean an employer does not value it. Employer detail varies, so technologies may be undercounted. Evaluation combines traditional and LLM evaluation. Regional differences reflect employer and role composition. Advertisements do not establish actual hiring decisions or negotiable requirements; there were no interviews. Broad official statistics in the original report provide context and never serve as vacancy denominators. Source-assigned codes are preserved even where their short evidence summaries do not fully explain them.
