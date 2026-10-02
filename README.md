# Job Market Observatory · 2026

An interactive, reproducible labour-market dashboard derived from the supplied **Data, Analytics, Machine Learning and AI Job Market 2026: Finland, Rest of Europe and the United States** report. The appendix is the authoritative vacancy dataset. No new jobs were researched and no public posting URLs were invented.

**Interpretation:** purposive employer-posting sample. Results describe the analysed vacancies and are not estimates of total labour-market prevalence. This project contains no curriculum analysis or educational recommendations.

## Run locally

Requires Node.js 22.12+ (verified with Node 24) and npm.

```sh
npm ci
npm run dev
```

Open the local Vite URL. `npm install` also works; the committed lockfile pins verified dependencies.

```sh
npm run data:build      # Parse, normalize, validate, aggregate, publish static data
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
research/original_deep_research_report.md
 → scripts/parse_report.mjs
 → structured jobs + taxonomy + long-form job skills
 → scripts/validate_data.mjs
 → scripts/generate_aggregates.mjs
 → data/ + identical public/data/ static assets
 → React dashboard using shared src/analysis.mjs calculations
 → chart → supporting job IDs → original evidence → report
```

The supplied `report.md` is preserved alongside the canonical research copy. Tests compare both byte-for-byte with the downloadable copy. Validation records the source SHA-256. Generation is deterministic: no network requests, changing timestamps or manual aggregate edits.

| Path                               | Purpose                                                      |
| ---------------------------------- | ------------------------------------------------------------ |
| `research/`                        | Immutable source report                                      |
| `scripts/parse_report.mjs`         | Table parser, taxonomy and lexical normalization rules       |
| `scripts/validate_data.mjs`        | Structural audit and published-claim comparisons             |
| `scripts/generate_aggregates.mjs`  | Frequencies and combinations                                 |
| `scripts/build_data.mjs`           | Pipeline orchestration and static asset publication          |
| `data/`                            | Generated CSV/JSON datasets, manifest and validation reports |
| `public/data/`, `public/research/` | Deployable download assets                                   |
| `src/analysis.mjs`                 | Shared filtering, unique-job counts and CSV serialization    |
| `src/main.tsx`, `src/style.css`    | Dashboard, reusable views and responsive styling             |
| `tests/`                           | Node data tests and Playwright browser tests                 |

React, TypeScript and Vite form a static application. Recharts renders the regional chart. Semantic buttons and HTML tables provide accessible bars, heatmaps, sortable records and evidence drill-down. React Markdown renders the report safely, displaying citation tokens as readable references. Mermaid blocks remain readable source code. `fflate` generates ZIP downloads in the browser.

## Data model

`jobs.csv/json` has one record per posting: exact title, raw/normalized role family and seniority, company, country, region, location, experience, status/date, retrieval date, core evidence, preferred-only evidence and original skill codes. Every record also retains the exact appendix row, source line, raw citation syntax, extracted `source_reference`, and `source_url: null`.

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
6. `CLOUD`, `FT` (fine-tuning), `PROMPT` and named tools are explicit-text extensions, marked in the taxonomy. Complete lexical mappings are versioned in `patterns` in `scripts/parse_report.mjs`. The parser does not reinterpret all core prose; original codes remain authoritative.
7. Tool extensions are LangChain, LangGraph, LlamaIndex, Semantic Kernel, PyTorch, TensorFlow, dbt and Spark/PySpark. Only explicit names count. Generic framework mentions never establish named tools.
8. Generic cloud uses explicit cloud wording, including multicloud, independently of AWS/Azure/GCP. Named providers do not backfill generic cloud. Overlapping categories must not be summed.
9. Unmapped preferred wording stays in the original Preferred-only field. Lexical extraction does not claim exhaustive semantic coverage.

Emerging-title selection uses explicit title terms AI, LLM, intelligence, agentic or forward deployed. It is a reproducible descriptive view, not evidence of historical novelty. Cross-role, production, specialised and similar signal categories are transparent analytical groupings, not universal claims about foundational skills.

## Validation findings

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

## Dashboard and filter semantics

Views cover overview, title variants, multi-role comparison, role × skill heatmap, regions, AI Engineering, agentic AI, GenAI, signal groupings, combinations, seniority, searchable records, downloads, quality, report and methodology. Charts expose supporting job records and exact evidence. Dialogs support keyboard access, focus management and Escape. Wide tables scroll within their panels on mobile.

Global filters select region, role, seniority, company, country, group and individual skill. Requirement type selects observations; it does **not** discard jobs just because no observation of that type exists. Skill filters select jobs matching that evidence type. Preferred alone retains the selected sample denominator; Preferred + MCP selects jobs with explicit preferred MCP.

Denominators use selected jobs or a named subgroup. Zero denominators display “—”. Core/preferred comparison tables deliberately show both types. Full-source audit tables and downloads are labelled independent of filters. Selection exports apply filters; record-table exports also apply local search. Groups below five and ten records receive distinct small-sample warnings.

## Deploy

Run `npm run build` and publish the **entire `dist/` directory** to any static host. No backend or secrets are needed. Relative Vite assets support a repository subpath such as `/jobs-skills/`. Serve over HTTP(S), not `file://`. All data/report downloads are included. Google Fonts is an optional typography enhancement with system-font fallback.

The GitHub Pages workflow is manual: set repository Settings → Pages → GitHub Actions, then run **Deploy dashboard** on the desired branch. It builds, validates and tests before uploading the site. The CI workflow verifies data and browser behavior on pushes and pull requests. Pushing the repository does not automatically enable Pages or publish the site.

## Future dataset updates

Never edit generated artifacts or replace the historical source. Archive a new report with a new filename, deliberately update the pipeline input path/retrieval handling, and version taxonomy/schema changes. Review table structure and core/preferred semantics. Update expectations and regression fixtures only for the new study, retaining real discrepancies. Run `npm run rebuild`, browser tests and Data Quality review. Commit the new source and outputs together while preserving the prior report.

## Methodology and limitations

The source is purposive and senior-heavy, overrepresenting technology, consulting, finance and AI-intensive employers. It contains 87 high-confidence postings rather than the initial 250–300 target. Employer/ATS sources were preferred; multi-location postings count once. Four recently closed 2026 postings remain explicitly identified. All records were retrieved or rechecked 2 October 2026.

Missing skill evidence does not mean an employer does not value it. Employer detail varies, so technologies may be undercounted. Evaluation combines traditional and LLM evaluation. Regional differences reflect employer and role composition. Advertisements do not establish actual hiring decisions or negotiable requirements; there were no interviews. Broad official statistics in the original report provide context and never serve as vacancy denominators. Source-assigned codes are preserved even where their short evidence summaries do not fully explain them.
