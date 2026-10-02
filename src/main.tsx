import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BarChart3,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Database,
  Download,
  ExternalLink,
  Filter,
  Layers,
  Menu,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { zipSync, strToU8 } from 'fflate';
import jobsData from '../data/jobs.json';
import skillsData from '../data/skills.json';
import rowsData from '../data/job_skills.json';
import validation from '../data/validation_report.json';
import manifest from '../data/manifest.json';
import report from '../research/original_deep_research_report.md?raw';
import { selectJobs, frequency, distribution, combine, observations, csv, regions } from './analysis.mjs';
import './style.css';

type Job = (typeof jobsData)[number];
type Metric = {
  label?: string;
  skill_name?: string;
  skill_code?: string;
  skill_group?: string;
  count: number;
  denominator: number;
  percentage: number;
  job_ids: string[];
};
type Drill = { title: string; jobs: Job[] };
const jobs: Job[] = jobsData,
  skills = skillsData,
  rows = rowsData;
const colors: Record<string, string> = { Finland: '#197568', 'Rest of Europe': '#4977ac', USA: '#bd793f' };
const skillColors: Record<string, string> = {
  Programming: '#48619d',
  'Software Engineering': '#197568',
  'Data & SQL': '#397a99',
  'Data Engineering': '#397a99',
  'Traditional ML': '#747044',
  'GenAI & LLM': '#8063a5',
  'Agentic AI': '#986487',
  Cloud: '#5577a4',
};
const pages = [
  'Overview',
  'Job titles',
  'Role explorer',
  'Role × skill',
  'Regions',
  'AI Engineering',
  'Agentic AI',
  'GenAI & LLMs',
  'Skill signals',
  'Skill combinations',
  'Seniority',
  'Job records',
  'Data & Downloads',
  'Data Quality',
  'Original Research Report',
  'Methodology & Limitations',
];
const emptyFilters: Record<string, string> = {
  region: '',
  normalized_role_family: '',
  seniority_group: '',
  company: '',
  country: '',
  skill_group: '',
  skill_code: '',
  requirement_type: 'core',
};
const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(1)}%` : '—');
const ratio = (r: Metric) => `${r.count} / ${r.denominator} · ${pct(r.count, r.denominator)}`;
const unique = (key: keyof Job) => [...new Set(jobs.map((j) => String(j[key])))].sort();
const allRoles = unique('normalized_role_family');
const labelFor = (code: string) => skills.find((s) => s.skill_code === code)?.skill_name || code;
const sourceReport = report.replace(
  /(?:cite|filecite)(.*?)/g,
  (_, s) => `[Source reference: ${s.split('').join(', ')}]`,
);
function Small({ n }: { n: number }) {
  return n < 10 ? (
    <span className="small-sample">
      {n < 5 ? 'Very small sample — interpret cautiously' : 'Small sample'} · n={n}
    </span>
  ) : null;
}
function Empty() {
  return (
    <div className="empty">
      <Search size={28} />
      <h3>No matching evidence</h3>
      <p>Try a broader selection or reset the global filters.</p>
    </div>
  );
}
function Panel({
  title,
  subtitle,
  children,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <section className={`panel ${wide ? 'wide' : ''}`}>
      <div className="panel-head">
        <h3>{title}</h3>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}
function Bars({
  data,
  onDrill,
  limit = 12,
}: {
  data: Metric[];
  onDrill: (r: Metric) => void;
  limit?: number;
}) {
  const shown = data.slice(0, limit);
  return !shown.length || !shown.some((r) => r.denominator) ? (
    <Empty />
  ) : (
    <div className="bars">
      {shown.map((r, i) => (
        <button
          className="bar-row"
          key={r.skill_code || r.label || i}
          onClick={() => onDrill(r)}
          title={`${r.skill_name || r.label}: ${ratio(r)}. Show supporting records.`}
        >
          <span className="bar-label">{r.skill_name || r.label}</span>
          <span className="bar-track">
            <span
              style={{
                width: `${r.percentage}%`,
                background: colors[r.label || ''] || skillColors[r.skill_group || ''] || '#28796d',
              }}
            />
          </span>
          <span className="bar-value">
            {r.count}
            <span> / {r.denominator}</span>
            <b>{pct(r.count, r.denominator)}</b>
          </span>
        </button>
      ))}
    </div>
  );
}
function App() {
  const [page, setPage] = useState('Overview'),
    [filters, setFilters] = useState(emptyFilters),
    [expanded, setExpanded] = useState(false),
    [navOpen, setNavOpen] = useState(false);
  const [drill, setDrill] = useState<Drill | null>(null),
    [detail, setDetail] = useState<Job | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([
    'AI Engineering',
    'Machine Learning Engineering',
  ]);
  const [zipStatus, setZipStatus] = useState(''),
    [search, setSearch] = useState(''),
    [sort, setSort] = useState('job_id'),
    [reverse, setReverse] = useState(false);
  const [titleFamily, setTitleFamily] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const selected = useMemo(() => selectJobs(jobs, rows, filters) as Job[], [filters]);
  const type = filters.requirement_type;
  const freq = useMemo(() => frequency(selected, rows, skills, type) as Metric[], [selected, type]);
  const activeCount = Object.entries(filters).filter(([k, v]) => v && k !== 'requirement_type').length;
  useEffect(() => {
    if (drill || detail) {
      if (!dialog.current?.open) dialog.current?.showModal();
    } else dialog.current?.close();
  }, [drill, detail]);
  function drillIds(title: string, ids: string[]) {
    setSearch('');
    setDrill({ title, jobs: selected.filter((j) => ids.includes(j.job_id)) });
    setDetail(null);
  }
  const drillMetric = (r: Metric) => drillIds(`${r.skill_name || r.label} · ${ratio(r)}`, r.job_ids);
  const counts = (subset: Job[]) => frequency(subset, rows, skills, type) as Metric[];
  const subsetSkill = (code: string, subset = selected) =>
    subset.filter((j) =>
      observations(rows, type).some((r) => r.job_id === j.job_id && r.skill_code === code),
    );
  function changePage(p: string) {
    setPage(p);
    setNavOpen(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function inputFilter(key: string, label: string, options: string[]) {
    return (
      <label className="filter-field" key={key}>
        <span>{label}</span>
        <select
          aria-label={label}
          value={filters[key]}
          onChange={(e) => setFilters({ ...filters, [key]: e.target.value })}
        >
          <option value="">Any {label.toLowerCase()}</option>
          {options.map((v) => (
            <option key={v} value={v}>
              {key === 'skill_code' ? `${v} · ${labelFor(v)}` : v}
            </option>
          ))}
        </select>
      </label>
    );
  }
  function download(content: string | Uint8Array, name: string, mime = 'text/plain') {
    const blob = new Blob([content as BlobPart], { type: mime }),
      url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function downloadZip() {
    setZipStatus('Preparing download…');
    try {
      const files: Record<string, Uint8Array> = {};
      await Promise.all(
        manifest.map(async (name) => {
          const r = await fetch(`${import.meta.env.BASE_URL}data/${name}`);
          if (!r.ok) throw Error(name);
          files[name] = new Uint8Array(await r.arrayBuffer());
        }),
      );
      files['original_deep_research_report.md'] = strToU8(report);
      download(zipSync(files), 'job-market-evidence.zip', 'application/zip');
      setZipStatus('ZIP downloaded');
    } catch {
      setZipStatus('Download failed. Try the individual files below.');
    }
  }
  function records(list: Job[], compact = false) {
    const filtered = list
      .filter(
        (j) =>
          !search ||
          `${j.job_id} ${j.exact_title} ${j.company} ${j.country} ${j.core_evidence}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      )
      .sort(
        (a, b) =>
          String(a[sort as keyof Job]).localeCompare(String(b[sort as keyof Job])) * (reverse ? -1 : 1),
      );
    return (
      <>
        <div className="table-toolbar">
          <label className="search">
            <Search size={16} />
            <input
              aria-label="Search job records"
              placeholder="Search title, employer, evidence…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <span>{filtered.length} records</span>
          <button
            className="text-button"
            onClick={() => download(csv(filtered), 'selected_jobs.csv', 'text/csv;charset=utf-8')}
          >
            Export selection <Download size={14} />
          </button>
        </div>
        {!filtered.length ? (
          <Empty />
        ) : (
          <div className="table-scroll">
            <table className="jobs-table">
              <thead>
                <tr>
                  {[
                    ['job_id', 'ID'],
                    ['exact_title', 'Employer title'],
                    ['company', 'Company'],
                    ['country', 'Country'],
                    ['region', 'Region'],
                    ['normalized_role_family', 'Role family'],
                    ['seniority_group', 'Seniority'],
                    ...(!compact
                      ? [
                          ['experience', 'Experience'],
                          ['posting_date_or_status', 'Status / date'],
                          ['core_evidence', 'Core evidence'],
                          ['preferred_only', 'Preferred evidence'],
                        ]
                      : []),
                  ].map(([key, label]) => (
                    <th key={key} aria-sort={sort === key ? (reverse ? 'descending' : 'ascending') : 'none'}>
                      <button
                        onClick={() => {
                          if (sort === key) setReverse(!reverse);
                          else {
                            setSort(key);
                            setReverse(false);
                          }
                        }}
                      >
                        {label}
                        {sort === key ? (reverse ? ' ↓' : ' ↑') : ''}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((j) => (
                  <tr key={j.job_id} onClick={() => setDetail(j)}>
                    <td className="mono">{j.job_id}</td>
                    <td>
                      <button className="title-link" onClick={() => setDetail(j)}>
                        {j.exact_title}
                        <ChevronRight size={14} />
                      </button>
                    </td>
                    <td>{j.company}</td>
                    <td>{j.country}</td>
                    <td>
                      <span className="region-dot" style={{ background: colors[j.region] }} />
                      {j.region}
                    </td>
                    <td>{j.normalized_role_family}</td>
                    <td>{j.seniority_group}</td>
                    {!compact && (
                      <>
                        <td>{j.experience}</td>
                        <td>{j.posting_date_or_status}</td>
                        <td>{j.core_evidence}</td>
                        <td>{j.preferred_only}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>
    );
  }
  function corePreferred(subset: Job[]) {
    return (
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Competency</th>
              <th>Core</th>
              <th>Preferred</th>
            </tr>
          </thead>
          <tbody>
            {frequency(subset, rows, skills, 'all')
              .filter((r) => r.count)
              .slice(0, 12)
              .map((s) => {
                const core = frequency(subset, rows, [s], 'core')[0],
                  preferred = frequency(subset, rows, [s], 'preferred')[0];
                return (
                  <tr key={s.skill_code}>
                    <th>{s.skill_name}</th>
                    {[core, preferred].map((r, i) => (
                      <td key={i}>
                        <button
                          className="cell-link"
                          onClick={() =>
                            drillIds(`${s.skill_name} · ${i ? 'preferred' : 'core'} · ${ratio(r)}`, r.job_ids)
                          }
                        >
                          {ratio(r)}
                        </button>
                      </td>
                    ))}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    );
  }
  function profile(subset: Job[], title: string) {
    return (
      <>
        <div className="section-lead">
          <div>
            <h2>{title}</h2>
            <p>
              {subset.length} / {selected.length} selected postings · {pct(subset.length, selected.length)} ·{' '}
              {[...new Set(subset.map((j) => j.company))].length} employers
            </p>
          </div>
          <Small n={subset.length} />
        </div>
        <div className="grid">
          <Panel title="Competency profile" subtitle="Click a competency to inspect the supporting evidence.">
            <Bars data={counts(subset).filter((r) => r.count)} onDrill={drillMetric} />
          </Panel>
          <Panel title="Regional distribution">
            <Bars data={distribution(subset, 'region')} onDrill={drillMetric} />
            <h4>Seniority</h4>
            <Bars data={distribution(subset, 'seniority_group')} onDrill={drillMetric} />
          </Panel>
          <Panel title="Technologies & platforms">
            <Bars
              data={counts(subset).filter(
                (r) =>
                  r.count &&
                  [
                    'Cloud',
                    'Programming',
                    'Data Platforms',
                    'Deployment & Infrastructure',
                    'Framework / Tool',
                  ].includes(r.skill_group || ''),
              )}
              onDrill={drillMetric}
            />
          </Panel>
          <Panel title="Core & preferred" subtitle="Separate observations; a job can appear in both columns.">
            {corePreferred(subset)}
          </Panel>
          <Panel title="Skill categories">
            <Bars data={groupMetrics(subset)} onDrill={drillMetric} />
          </Panel>
          <Panel title="Companies represented">
            <Bars data={distribution(subset, 'company')} onDrill={drillMetric} />
          </Panel>
          <Panel title="Underlying job records" wide>
            {records(subset, true)}
          </Panel>
        </div>
      </>
    );
  }
  function groupMetrics(subset: Job[]) {
    return [...new Set(skills.map((s) => s.skill_group))]
      .map((label) => {
        const ids = [
          ...new Set(
            observations(rows, type)
              .filter((r) => r.skill_group === label && subset.some((j) => j.job_id === r.job_id))
              .map((r) => r.job_id),
          ),
        ];
        return {
          label,
          count: ids.length,
          denominator: subset.length,
          percentage: subset.length ? (ids.length / subset.length) * 100 : 0,
          job_ids: ids,
        };
      })
      .filter((r) => r.count)
      .sort((a, b) => b.count - a.count);
  }
  function matrix(subsets: { label: string; jobs: Job[] }[], codes: string[]) {
    return (
      <div className="table-scroll">
        <table className="heatmap">
          <thead>
            <tr>
              <th>Sample / competency</th>
              {codes.map((c) => (
                <th key={c} title={labelFor(c)}>
                  {c}
                  <small>{labelFor(c)}</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {subsets.map((s) => (
              <tr key={s.label}>
                <th>
                  {s.label}
                  <small>n={s.jobs.length}</small>
                  <Small n={s.jobs.length} />
                </th>
                {frequency(
                  s.jobs,
                  rows,
                  skills.filter((k) => codes.includes(k.skill_code)),
                  type,
                )
                  .sort((a, b) => codes.indexOf(a.skill_code) - codes.indexOf(b.skill_code))
                  .map((r) => (
                    <td key={r.skill_code}>
                      <button
                        style={{ background: `rgba(25,117,104,${0.04 + (r.percentage / 100) * 0.35})` }}
                        title={`${s.label} · ${r.skill_name}: ${ratio(r)}`}
                        onClick={() => drillIds(`${s.label} → ${r.skill_name} · ${ratio(r)}`, r.job_ids)}
                      >
                        <b>{pct(r.count, r.denominator)}</b>
                        <span>
                          {r.count} / {r.denominator}
                        </span>
                      </button>
                    </td>
                  ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  const agentJobs = subsetSkill('AGT'),
    aiJobs = selected.filter((j) => j.normalized_role_family === 'AI Engineering');
  const metricByCode = (code: string) => freq.find((r) => r.skill_code === code)!;
  return (
    <div className="app-shell">
      <aside className={navOpen ? 'sidebar open' : 'sidebar'}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            changePage('Overview');
          }}
        >
          <span className="brand-icon">
            <BarChart3 size={23} />
          </span>
          <span>
            LABOUR MARKET
            <strong>
              Observatory<span className="brand-year"> / 2026</span>
            </strong>
          </span>
        </a>
        <div className="nav-caption">EXPLORE THE EVIDENCE</div>
        <nav aria-label="Dashboard sections">
          {pages.map((p, i) => (
            <React.Fragment key={p}>
              {i === 11 && <div className="nav-caption">RESEARCH & DATA</div>}
              <button
                className={page === p ? 'nav-item active' : 'nav-item'}
                onClick={() => changePage(p)}
                aria-current={page === p ? 'page' : undefined}
              >
                {i === 0 ? (
                  <BarChart3 size={16} />
                ) : i < 11 ? (
                  <Layers size={16} />
                ) : i === 14 ? (
                  <BookOpen size={16} />
                ) : (
                  <Database size={16} />
                )}
                <span>{p}</span>
                {page === p && <span className="nav-mark" />}
              </button>
            </React.Fragment>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="live-dot" /> SOURCE-BOUND ANALYSIS
          <p>
            One research report.
            <br />
            Every observation traceable.
          </p>
          <span>Retrieved 02 OCT 2026</span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button
            className="mobile-menu icon-button"
            aria-label="Open navigation"
            onClick={() => setNavOpen(!navOpen)}
          >
            <Menu />
          </button>
          <span>
            Research dashboard <ChevronRight size={13} /> <strong>{page}</strong>
          </span>
          <button className="text-button" onClick={() => changePage('Data & Downloads')}>
            <Download size={15} /> Download data
          </button>
        </header>
        <main>
          <div className="eyebrow">EMPLOYER-POSTING EVIDENCE · 2026 EDITION</div>
          <div className="hero">
            <div>
              <h1>
                {page === 'Overview' ? (
                  <>
                    Data, Analytics, Machine Learning
                    <br className="desktop-break" /> & AI Job Market 2026
                  </>
                ) : (
                  page
                )}
              </h1>
              <p className="hero-subtitle">
                Finland <span>·</span> Rest of Europe <span>·</span> United States
              </p>
            </div>
            <div className="edition">
              COLLECTED / RECHECKED<strong>2 October 2026</strong>
              <span>Descriptive sample analysis</span>
            </div>
          </div>
          <div className="method-notice">
            <ShieldCheck size={20} />
            <p>
              <strong>Read this as a sample.</strong> Purposive employer-posting sample. Results describe the
              analysed vacancies and are not estimates of total labour-market prevalence.
            </p>
            <button onClick={() => changePage('Methodology & Limitations')}>
              Methodology <ChevronRight size={16} />
            </button>
          </div>
          <section className="filter-panel" aria-label="Global filters">
            <div className="filter-title">
              <span>
                <SlidersHorizontal size={16} /> Global filters{' '}
                {activeCount > 0 && <b className="count-chip">{activeCount}</b>}
              </span>
              <div>
                <button className="text-button" onClick={() => setExpanded(!expanded)}>
                  {expanded ? 'Fewer filters' : 'More filters'} <Filter size={14} />
                </button>
                <button
                  className="text-button"
                  onClick={() => {
                    setFilters({ ...emptyFilters });
                    setSearch('');
                  }}
                >
                  Reset filters
                </button>
              </div>
            </div>
            <div className="filter-grid">
              {inputFilter('region', 'Region', regions)}
              {inputFilter('normalized_role_family', 'Role family', allRoles)}
              {inputFilter('seniority_group', 'Seniority', unique('seniority_group'))}
              <label className="filter-field">
                <span>Requirement type</span>
                <select
                  aria-label="Requirement type"
                  value={type}
                  onChange={(e) => setFilters({ ...filters, requirement_type: e.target.value })}
                >
                  <option value="core">Core</option>
                  <option value="preferred">Preferred</option>
                  <option value="all">All (incl. unspecified)</option>
                  <option value="unspecified">Unspecified</option>
                </select>
              </label>
              {expanded && (
                <>
                  {inputFilter('company', 'Company', unique('company'))}
                  {inputFilter('country', 'Country', unique('country'))}
                  {inputFilter(
                    'skill_group',
                    'Skill group',
                    [...new Set(skills.map((s) => s.skill_group))].sort(),
                  )}
                  {inputFilter('skill_code', 'Individual skill', skills.map((s) => s.skill_code).sort())}
                </>
              )}
            </div>
            <div className="selection">
              <span>
                <span className="live-dot" />
                <strong>{selected.length} jobs selected</strong> / {jobs.length} in source
              </span>
              <span>
                {type === 'all'
                  ? 'All evidence types'
                  : `${type.charAt(0).toUpperCase() + type.slice(1)} observations`}{' '}
                · denominators follow filters
              </span>
              <Small n={selected.length} />
            </div>
          </section>

          {page === 'Overview' && (
            <>
              <div className="kpi-grid">
                <button
                  className="kpi total"
                  onClick={() => setDrill({ title: 'Selected postings', jobs: selected })}
                >
                  <span>ANALYSED POSTINGS</span>
                  <strong>
                    {selected.length}
                    <small> / {jobs.length}</small>
                  </strong>
                  <p>
                    Traceable employer records <ChevronRight size={16} />
                  </p>
                </button>
                {regions.map((region) => {
                  const subset = selected.filter((j) => j.region === region);
                  return (
                    <button
                      className="kpi"
                      key={region}
                      style={{ borderTopColor: colors[region] }}
                      onClick={() => setDrill({ title: region, jobs: subset })}
                    >
                      <span>
                        <i style={{ background: colors[region] }} />
                        {region === 'USA' ? 'UNITED STATES' : region.toUpperCase()}
                      </span>
                      <strong>
                        {subset.length}
                        <small> / {selected.length}</small>
                      </strong>
                      <p>
                        {pct(subset.length, selected.length)} of selected sample <ChevronRight size={16} />
                      </p>
                    </button>
                  );
                })}
              </div>
              <div className="section-lead">
                <div>
                  <h2>The shape of this sample</h2>
                  <p>Explore what employers ask for. Select any bar to inspect the records.</p>
                </div>
                <span className="badge">{type.toUpperCase()} EVIDENCE</span>
              </div>
              <div className="grid">
                <Panel
                  title="Most observed competencies"
                  subtitle="Share of selected postings with an explicit coded observation."
                >
                  <Bars data={freq.filter((r) => r.count)} onDrill={drillMetric} limit={10} />
                </Panel>
                <Panel
                  title="Role-family landscape"
                  subtitle="Employer titles normalized to the report’s role families."
                >
                  <Bars data={distribution(selected, 'normalized_role_family')} onDrill={drillMetric} />
                </Panel>
                <Panel
                  title="Regional sample composition"
                  subtitle="Sample balance, not regional market share."
                >
                  <div className="donut">
                    <ResponsiveContainer width="100%" height={215}>
                      <PieChart>
                        <Pie
                          data={distribution(selected, 'region')}
                          dataKey="count"
                          nameKey="label"
                          isAnimationActive={false}
                          innerRadius={65}
                          outerRadius={94}
                          paddingAngle={3}
                          onClick={(r) => drillMetric(r as unknown as Metric)}
                        >
                          {distribution(selected, 'region').map((r) => (
                            <Cell key={r.label} fill={colors[r.label]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(v, _n, p) => [
                            `${v} / ${selected.length} · ${pct(Number(v), selected.length)}`,
                            p.payload.label,
                          ]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="donut-center">
                      <strong>{selected.length}</strong>
                      <span>postings</span>
                    </div>
                  </div>
                  <Bars data={distribution(selected, 'region')} onDrill={drillMetric} />
                </Panel>
                <Panel
                  title="Seniority in the source"
                  subtitle="Mixed levels stay ambiguous; no forced assignment."
                >
                  <Bars data={distribution(selected, 'seniority_group')} onDrill={drillMetric} />
                  <p className="panel-note">
                    The source sample is senior-heavy. Its level mix is not representative of the wider
                    market.
                  </p>
                </Panel>
                <Panel
                  title="Technology & platform landscape"
                  subtitle="Explicit technologies; generic cloud is a separate text-derived signal."
                >
                  <Bars
                    data={freq.filter(
                      (r) =>
                        r.count &&
                        [
                          'Cloud',
                          'Programming',
                          'Data Platforms',
                          'Deployment & Infrastructure',
                          'Framework / Tool',
                        ].includes(r.skill_group || ''),
                    )}
                    onDrill={drillMetric}
                  />
                </Panel>
                <Panel
                  title="Core versus preferred"
                  subtitle="Classification is retained separately, regardless of the display type filter."
                >
                  {corePreferred(selected)}
                </Panel>
              </div>
              <div className="insight-strip">
                <ShieldCheck size={25} />
                <div>
                  <h3>Auditable by design</h3>
                  <p>
                    {validation.discrepancies.length} differences between the report’s prose and the extracted
                    records are documented. The charts use the records.
                  </p>
                </div>
                <button className="secondary" onClick={() => changePage('Data Quality')}>
                  Inspect data quality <ChevronRight size={15} />
                </button>
              </div>
            </>
          )}

          {page === 'Job titles' && (
            <>
              <div className="section-lead">
                <div>
                  <h2>Titles tell part of the story</h2>
                  <p>
                    Exact wording is preserved. Emerging-title selection is lexical, not a historical claim.
                  </p>
                </div>
                <label className="filter-field">
                  <span>Title variants within family</span>
                  <select value={titleFamily} onChange={(e) => setTitleFamily(e.target.value)}>
                    <option value="">All families</option>
                    {allRoles.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="grid">
                <Panel title="Exact employer titles">
                  <Bars
                    data={distribution(
                      selected.filter((j) => !titleFamily || j.normalized_role_family === titleFamily),
                      'exact_title',
                    )}
                    onDrill={drillMetric}
                    limit={100}
                  />
                </Panel>
                <div>
                  <Panel title="Normalized role families">
                    <Bars data={distribution(selected, 'normalized_role_family')} onDrill={drillMetric} />
                  </Panel>
                  <Panel
                    title="Emerging-title signals"
                    subtitle="Titles containing AI, LLM, intelligence, agentic or forward deployed."
                  >
                    <Bars
                      data={distribution(selected, 'exact_title').filter((r) =>
                        /AI|LLM|intelligence|agentic|forward deployed/i.test(r.label),
                      )}
                      onDrill={drillMetric}
                      limit={100}
                    />
                  </Panel>
                </div>
              </div>
            </>
          )}
          {page === 'Role explorer' && (
            <>
              <div className="section-lead">
                <div>
                  <h2>Compare competency profiles</h2>
                  <p>Select one role for a detailed profile, or several for a comparison.</p>
                </div>
              </div>
              <div className="role-choices">
                {allRoles.map((role) => (
                  <label className={selectedRoles.includes(role) ? 'chosen' : ''} key={role}>
                    <input
                      type="checkbox"
                      checked={selectedRoles.includes(role)}
                      onChange={(e) =>
                        setSelectedRoles(
                          e.target.checked
                            ? [...selectedRoles, role]
                            : selectedRoles.filter((r) => r !== role),
                        )
                      }
                    />
                    {role}
                  </label>
                ))}
              </div>
              {selectedRoles.length > 1 && (
                <Panel title="Role comparison" subtitle="Each role is its own denominator." wide>
                  {matrix(
                    selectedRoles.map((label) => ({
                      label,
                      jobs: selected.filter((j) => j.normalized_role_family === label),
                    })),
                    ['SWE', 'PY', 'SQL', 'ML', 'GEN', 'AGT', 'DE', 'CLOUD', 'EVAL', 'MLOPS'],
                  )}
                </Panel>
              )}
              {!selectedRoles.length && <Empty />}
              {selectedRoles.map((role) => (
                <React.Fragment key={role}>
                  {profile(
                    selected.filter((j) => j.normalized_role_family === role),
                    role,
                  )}
                </React.Fragment>
              ))}
            </>
          )}
          {page === 'Role × skill' && (
            <Panel
              title="Role × skill heatmap"
              subtitle="Darker cells indicate a greater share within that role. Every cell includes n and supports evidence drill-down."
              wide
            >
              {matrix(
                allRoles.map((label) => ({
                  label,
                  jobs: selected.filter((j) => j.normalized_role_family === label),
                })),
                [
                  'COMM',
                  'SWE',
                  'PY',
                  'SQL',
                  'STAT',
                  'ML',
                  'DL',
                  'DE',
                  'GEN',
                  'RAG',
                  'AGT',
                  'API',
                  'CLOUD',
                  'MLOPS',
                  'EVAL',
                  'OBS',
                  'SEC',
                  'GOV',
                ],
              )}
            </Panel>
          )}
          {page === 'Regions' && (
            <>
              <div className="warning">
                Regional differences may reflect the purposive employer and role composition of the sample.
                Small cells are not national estimates.
              </div>
              <Panel
                title="Competency signals by region"
                subtitle="Generic cloud and named providers are distinct observations."
              >
                {matrix(
                  regions.map((label) => ({ label, jobs: selected.filter((j) => j.region === label) })),
                  [
                    'SWE',
                    'DE',
                    'ML',
                    'STAT',
                    'GEN',
                    'RAG',
                    'AGT',
                    'MLOPS',
                    'EVAL',
                    'OBS',
                    'SEC',
                    'GOV',
                    'CLOUD',
                    'AWS',
                    'AZ',
                    'GCP',
                    'DBX',
                    'SNOW',
                  ],
                )}
              </Panel>
              <div className="grid three">
                {regions.map((region) => (
                  <Panel
                    key={region}
                    title={region}
                    subtitle={`n=${selected.filter((j) => j.region === region).length}`}
                  >
                    <Small n={selected.filter((j) => j.region === region).length} />
                    <h4>Role-family distribution</h4>
                    <Bars
                      data={distribution(
                        selected.filter((j) => j.region === region),
                        'normalized_role_family',
                      )}
                      onDrill={drillMetric}
                    />
                    <h4>Seniority</h4>
                    <Bars
                      data={distribution(
                        selected.filter((j) => j.region === region),
                        'seniority_group',
                      )}
                      onDrill={drillMetric}
                    />
                  </Panel>
                ))}
              </div>
            </>
          )}
          {page === 'AI Engineering' && (
            <>
              <div className="narrative">
                <h2>What does AI Engineer mean in this 2026 sample?</h2>
                <p>
                  AI Engineering is heterogeneous. Read these titles through their competency bundles:
                  software, models, data, integration and operations. All results below come from records
                  classified as AI Engineering in the appendix.
                </p>
              </div>
              {profile(aiJobs, 'AI Engineering evidence')}
            </>
          )}
          {page === 'Agentic AI' && (
            <>
              <div className="narrative">
                <h2>A capability signal, and a title signal</h2>
                <p>
                  Agent requirements can appear across many role families. Generic GenAI or LLM evidence alone
                  does not establish an agent requirement.
                </p>
              </div>
              <div className="grid">
                <Panel
                  title="Agent capability versus exact title"
                  subtitle="Both measures use the currently selected job denominator."
                >
                  <Bars
                    data={[
                      { ...metricByCode('AGT'), skill_name: 'Agent capability in requirements' },
                      {
                        label: '“Agentic AI” in job title',
                        count: selected.filter((j) => /agentic ai/i.test(j.exact_title)).length,
                        denominator: selected.length,
                        percentage: selected.length
                          ? (selected.filter((j) => /agentic ai/i.test(j.exact_title)).length /
                              selected.length) *
                            100
                          : 0,
                        job_ids: selected
                          .filter((j) => /agentic ai/i.test(j.exact_title))
                          .map((j) => j.job_id),
                      },
                    ]}
                    onDrill={drillMetric}
                  />
                </Panel>
                <Panel
                  title="Agent-related stack"
                  subtitle="Denominator: selected jobs with agent observations."
                >
                  <Small n={agentJobs.length} />
                  <Bars
                    data={counts(agentJobs).filter((r) =>
                      ['GEN', 'AGT', 'TOOL', 'MCP', 'MAG', 'RAG', 'EVAL', 'GRD', 'OBS', 'SEC'].includes(
                        r.skill_code || '',
                      ),
                    )}
                    onDrill={drillMetric}
                  />
                </Panel>
                <Panel title="Roles containing agent observations">
                  <Bars data={distribution(agentJobs, 'normalized_role_family')} onDrill={drillMetric} />
                </Panel>
                <Panel title="Regional distribution">
                  <Bars data={distribution(agentJobs, 'region')} onDrill={drillMetric} />
                </Panel>
                <Panel title="Actual titles and agent evidence" wide>
                  {records(agentJobs, true)}
                </Panel>
              </div>
            </>
          )}
          {page === 'GenAI & LLMs' && (
            <>
              <div className="narrative">
                <h2>From models to applied systems</h2>
                <p>
                  Fine-tuning and prompt engineering are counted only from explicit evidence text. GenAI,
                  agents and multi-agent systems remain separate codes.
                </p>
              </div>
              <div className="grid">
                <Panel title="GenAI-related observations">
                  <Bars
                    data={freq.filter((r) =>
                      [
                        'GEN',
                        'RAG',
                        'FT',
                        'PROMPT',
                        'EMB',
                        'VEC',
                        'AGT',
                        'TOOL',
                        'MCP',
                        'MAG',
                        'EVAL',
                      ].includes(r.skill_code || ''),
                    )}
                    onDrill={drillMetric}
                  />
                </Panel>
                <Panel title="GenAI role-family distribution">
                  <Bars
                    data={distribution(subsetSkill('GEN'), 'normalized_role_family')}
                    onDrill={drillMetric}
                  />
                </Panel>
                <Panel title="Core & preferred in GenAI postings">{corePreferred(subsetSkill('GEN'))}</Panel>
                <Panel
                  title="Explicit framework / tool signals"
                  subtitle="No unnamed frameworks inferred from responsibilities."
                >
                  <Bars
                    data={freq.filter((r) => r.skill_group === 'Framework / Tool')}
                    onDrill={drillMetric}
                  />
                </Panel>
                <Panel title="GenAI records" wide>
                  {records(subsetSkill('GEN'), true)}
                </Panel>
              </div>
            </>
          )}
          {page === 'Skill signals' && (
            <>
              <div className="narrative">
                <h2>Signals at different levels of specificity</h2>
                <p>
                  These analytical groupings describe observations in this dataset. Frequency alone does not
                  make a skill universally foundational. Categories can overlap.
                </p>
              </div>
              <div className="grid">
                {Object.entries({
                  'Cross-role signal in this dataset': ['COMM', 'SWE', 'PY', 'SQL'],
                  'Role-specific signals': ['STAT', 'DE', 'DM', 'ML', 'BI'],
                  'Production / platform signals': [
                    'CLOUD',
                    'MLOPS',
                    'LLOPS',
                    'SERV',
                    'OBS',
                    'CICD',
                    'SEC',
                    'GOV',
                  ],
                  'Emerging AI signals': ['GEN', 'AGT', 'MCP', 'MAG', 'TOOL', 'RAG'],
                  'Framework / tool-specific signals': [
                    'LANGCHAIN',
                    'LANGGRAPH',
                    'LLAMAINDEX',
                    'SEMANTIC',
                    'PYTORCH',
                    'TENSORFLOW',
                    'DBT',
                    'SPARK',
                  ],
                  'Specialised / niche signals': ['CV', 'NLP', 'TS', 'REC', 'CAUS', 'OPT'],
                }).map(([title, codes]) => (
                  <Panel title={title} key={title}>
                    <Bars
                      data={freq.filter((r) => codes.includes(r.skill_code || ''))}
                      onDrill={drillMetric}
                    />
                  </Panel>
                ))}
              </div>
            </>
          )}
          {page === 'Skill combinations' && (
            <>
              <div className="narrative">
                <h2>Competencies observed together</h2>
                <p>
                  Every combination is an intersection of job IDs. Cloud means explicit generic cloud text. A
                  missing observation does not establish an absent capability.
                </p>
              </div>
              <Panel
                title="Ranked competency bundles"
                subtitle="Select a bundle to see the jobs containing every listed skill."
              >
                <Bars
                  data={combine(selected, rows, type).map((r) => ({
                    ...r,
                    label: r.skill_codes.map(labelFor).join(' + '),
                  }))}
                  onDrill={drillMetric}
                  limit={20}
                />
              </Panel>
            </>
          )}
          {page === 'Seniority' && (
            <>
              <div className="warning">
                The sample is senior-heavy. Mixed source labels remain visible as ambiguous levels; very small
                groups offer limited comparative evidence.
              </div>
              <Panel title="Source seniority distribution">
                <Bars data={distribution(selected, 'seniority_group')} onDrill={drillMetric} />
              </Panel>
              <Panel
                title="Skills by normalized seniority"
                subtitle="Counts use the source group, including ambiguous labels."
              >
                {matrix(
                  unique('seniority_group').map((label) => ({
                    label,
                    jobs: selected.filter((j) => j.seniority_group === label),
                  })),
                  ['SWE', 'PY', 'SQL', 'ML', 'GEN', 'AGT', 'DE', 'EVAL', 'MLOPS', 'COMM'],
                )}
              </Panel>
            </>
          )}
          {page === 'Job records' && (
            <Panel
              title="The evidence register"
              subtitle="Search, sort, export and open each record to inspect the exact appendix evidence."
              wide
            >
              {records(selected)}
            </Panel>
          )}
          {page === 'Data & Downloads' && (
            <>
              <div className="section-lead">
                <div>
                  <h2>Reusable, inspectable evidence</h2>
                  <p>
                    Source datasets and aggregates below cover the full report, independent of global filters.
                  </p>
                </div>
                <button className="primary" onClick={downloadZip}>
                  <Download size={16} /> Download all as ZIP
                </button>
              </div>
              <p role="status">{zipStatus}</p>
              <Panel
                title="Export the current selection"
                subtitle={`${selected.length} selected job records`}
              >
                <div className="actions">
                  <button
                    className="secondary"
                    onClick={() => download(csv(selected), 'selected_jobs.csv', 'text/csv;charset=utf-8')}
                  >
                    Selected jobs · CSV
                  </button>
                  <button
                    className="secondary"
                    onClick={() =>
                      download(JSON.stringify(selected, null, 2), 'selected_jobs.json', 'application/json')
                    }
                  >
                    Selected jobs · JSON
                  </button>
                </div>
              </Panel>
              <div className="downloads">
                {manifest.map((name) => (
                  <a key={name} href={`${import.meta.env.BASE_URL}data/${name}`} download={name}>
                    <span className="file-icon">{name.split('.').pop()?.toUpperCase()}</span>
                    <span>
                      <strong>{name}</strong>
                      <small>
                        {name.includes('validation')
                          ? 'Calculated versus stated values'
                          : 'Generated from the source appendix'}
                      </small>
                    </span>
                    <Download size={17} />
                  </a>
                ))}
              </div>
              <a
                className="secondary"
                href={`${import.meta.env.BASE_URL}research/original_deep_research_report.md`}
                download
              >
                Download unchanged research report <Download size={16} />
              </a>
            </>
          )}
          {page === 'Data Quality' && (
            <>
              <div className="section-lead">
                <div>
                  <h2>Discrepancies are part of the evidence</h2>
                  <p>
                    Quality checks refer to the complete source dataset; chart filters do not change this
                    audit.
                  </p>
                </div>
                <span className="badge">
                  <CheckCircle2 size={15} /> STRUCTURE PASSED
                </span>
              </div>
              <div className="quality-grid">
                {[
                  ['Records', validation.records],
                  ['Duplicate IDs', validation.duplicates.length],
                  ['Source references', `${validation.source_references_available} / ${validation.records}`],
                  ['Invalid relations', validation.invalid_references.length],
                  ['Ambiguous levels', validation.ambiguous_seniority.length],
                  ['Public source URLs', validation.source_urls_available],
                ].map(([l, v]) => (
                  <div className="quality-stat" key={l}>
                    <span>{l}</span>
                    <strong>{v}</strong>
                  </div>
                ))}
              </div>
              <div className="warning">
                {validation.discrepancies.length} published statistics cannot be reproduced exactly under the
                documented rules. No observations were changed to force agreement.
              </div>
              <Panel
                title="Published claims versus appendix calculations"
                subtitle="Includes overall, role, seniority, core-skill and AI Engineering checks."
              >
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Scope</th>
                        <th>Statistic</th>
                        <th>Stated</th>
                        <th>Calculated</th>
                        <th>Difference</th>
                        <th>Assessment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {validation.comparisons.map((r, i) => (
                        <tr key={i} className={r.difference ? 'discrepancy' : ''}>
                          <td>{r.category}</td>
                          <th>{r.label}</th>
                          <td>{r.stated}</td>
                          <td>{r.calculated}</td>
                          <td>
                            {r.difference > 0 ? '+' : ''}
                            {r.difference}
                          </td>
                          <td>{r.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
              <div className="grid">
                <Panel title="Missing-field checks">
                  <dl>
                    {Object.entries(validation.missing_fields).map(([k, v]) => (
                      <React.Fragment key={k}>
                        <dt>{k}</dt>
                        <dd>{v}</dd>
                      </React.Fragment>
                    ))}
                  </dl>
                </Panel>
                <Panel title="Core / preferred extraction status">
                  <p>
                    Normalized source codes form the core coding. Explicit preferred-only evidence is kept
                    separate. Undefined DOM remains unspecified.
                  </p>
                  <dl>
                    {validation.core_preferred_status.map((r) => (
                      <React.Fragment key={r.label}>
                        <dt>{r.label} observations</dt>
                        <dd>{r.count}</dd>
                      </React.Fragment>
                    ))}
                  </dl>
                </Panel>
                {Object.entries(validation.distributions).map(([key, value]) => (
                  <Panel key={key} title={`Full source: ${key}`}>
                    <Bars
                      data={value}
                      onDrill={(r) =>
                        setDrill({
                          title: `Full source · ${r.label}`,
                          jobs: jobs.filter((j) => r.job_ids.includes(j.job_id)),
                        })
                      }
                    />
                  </Panel>
                ))}
              </div>
              <Panel title="Provenance and interpretation">
                <ul>
                  {validation.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
                <p className="mono hash">Source SHA-256: {validation.source_sha256}</p>
              </Panel>
            </>
          )}
          {page === 'Original Research Report' && (
            <>
              <div className="warning">
                This is the original research source. Its prose statistics are retained even where the
                appendix audit finds a difference. Charts elsewhere use calculated data.
              </div>
              <a
                className="secondary"
                href={`${import.meta.env.BASE_URL}research/original_deep_research_report.md`}
                download
              >
                Download original Markdown <Download size={16} />
              </a>
              <article className="report panel">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{sourceReport}</ReactMarkdown>
              </article>
            </>
          )}
          {page === 'Methodology & Limitations' && (
            <article className="methodology panel">
              <div className="eyebrow">READING THIS RESEARCH</div>
              <h2>Methodology & Limitations</h2>
              <p>
                This dashboard derives from one supplied Deep Research report. Its {jobs.length} unique
                employer vacancies comprise{' '}
                {regions.map((r) => `${jobs.filter((j) => j.region === r).length} ${r}`).join(', ')}. All
                records were retrieved or rechecked on 2 October 2026. No new jobs or external posting URLs
                were added.
              </p>
              <h3>Purposive sampling, not market prevalence</h3>
              <p>
                The intended research target was 250–300 postings; the report assembled 87 high-confidence
                records. Employer career sites and ATS sources were preferred. Multi-location vacancies count
                once. The sample overrepresents large technology companies, consultancies, finance and
                AI-intensive employers. Regional differences depend on employer and role mix. Four recently
                closed 2026 vacancies are retained, with source status preserved.
              </p>
              <h3>From evidence to observations</h3>
              <p>
                The parser reads the three appendix tables, retaining each original row, line number,
                citation, title and evidence string. Role aliases are expanded without changing family
                membership. Assigned normalized codes are accepted as the report’s coding even when the short
                core-evidence text does not repeat the name.
              </p>
              <p>
                Core means required or central to responsibilities, not necessarily an employer heading named
                “required”. Preferred-only examples and nice-to-have mentions are classified separately. An
                explicit preferred match with no core text match takes precedence over a code. A skill can
                have both core and preferred observations, but each statistic counts distinct jobs once. All
                includes unspecified observations; DOM remains undefined. R is supported by explicit text.
                Generic cloud, fine-tuning, prompts and named frameworks are documented explicit-text
                extensions.
              </p>
              <h3>Conservative normalization</h3>
              <p>
                Junior and Entry/Graduate become Entry / Junior. Mid and Senior retain their meaning. Staff,
                Lead, Principal and Staff/Principal share a group. Senior/VP maps to Senior and Lead/VP to
                Staff / Lead / Principal using the explicit level word. Mid/Senior, Senior/Lead and Entry/Mid
                remain ambiguous. No experience thresholds are invented.
              </p>
              <h3>Counting and filter rules</h3>
              <p>
                Region, role, seniority, company and country select jobs. Skill and skill-group filters select
                jobs with a matching observation of the chosen requirement type. Requirement type selects
                observations without removing jobs merely for having no observation of that type. Charts count
                unique jobs, divide by the selected sample or named subgroup, and expose their underlying
                records. Zero denominators show “—”. Generic cloud is counted independently from AWS, Azure
                and GCP; these categories must not be added together.
              </p>
              <h3>Measurement limits</h3>
              <p>
                Missing skill evidence does not mean an employer does not value that skill. Postings vary
                substantially in detail, so technologies may be undercounted. Evaluation combines traditional
                model and LLM evaluation. Framework mentions may be examples. The sample is senior-heavy.
                Groups below five records carry a very small sample warning; below ten carry a small sample
                warning. Advertisements do not reveal final hiring decisions, negotiable requirements or
                successful candidates’ skills. No interviews were used. Broader official statistics in the
                report are context, never vacancy denominators.
              </p>
              <h3>Provenance and reproducibility</h3>
              <p>
                Deep Research references such as turn21search1 identify citations in the original report; they
                are not public links. Public URLs were unavailable and remain null. The unchanged report is
                downloadable. Run <code>npm run rebuild</code> to parse, validate, test and build.
                Published-statistic differences appear in Data Quality, including seniority ambiguity,
                communication, SQL and generic cloud.
              </p>
              <h3>Labour-Market Findings</h3>
              <p>
                In the analysed postings, titles overlap while competencies form distinct bundles. Use counts,
                denominators and the supporting job evidence to interpret these descriptive signals. This
                dashboard makes no educational or curriculum recommendations.
              </p>
            </article>
          )}
          <footer>
            <span>JOB MARKET OBSERVATORY / 2026</span>
            <p>Labour-market evidence. Source-bound, reproducible, and open to inspection.</p>
            <button className="text-button" onClick={() => changePage('Methodology & Limitations')}>
              Methodology & Limitations <ExternalLink size={13} />
            </button>
          </footer>
        </main>
      </div>
      <dialog
        aria-labelledby="evidence-dialog-title"
        ref={dialog}
        onCancel={() => {
          setDrill(null);
          setDetail(null);
        }}
        onClick={(e) => {
          if (e.target === dialog.current) {
            setDrill(null);
            setDetail(null);
          }
        }}
      >
        <div className="dialog-head">
          <div>
            <div className="eyebrow">EVIDENCE DRILL-DOWN</div>
            <h2 id="evidence-dialog-title">
              {detail ? `${detail.job_id} · ${detail.exact_title}` : drill?.title}
            </h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close evidence"
            onClick={() => {
              setDrill(null);
              setDetail(null);
            }}
          >
            <X />
          </button>
        </div>
        {detail ? (
          <div className="detail">
            {drill && (
              <button className="text-button" onClick={() => setDetail(null)}>
                ← Back to {drill.jobs.length} records
              </button>
            )}
            <dl>
              {Object.entries(detail)
                .filter(
                  ([k]) =>
                    ![
                      'source_row',
                      'normalized_skills',
                      'source_reference_raw',
                      'core_evidence',
                      'preferred_only',
                    ].includes(k),
                )
                .map(([k, v]) => (
                  <React.Fragment key={k}>
                    <dt>{k.replaceAll('_', ' ')}</dt>
                    <dd>{v === null ? 'Not available' : String(v)}</dd>
                  </React.Fragment>
                ))}
            </dl>
            <h3>Exact core evidence</h3>
            <blockquote>{detail.core_evidence}</blockquote>
            <h3>Exact preferred-only evidence</h3>
            <blockquote>{detail.preferred_only}</blockquote>
            <h3>Normalized observations</h3>
            <div className="observation-list">
              {rows
                .filter((r) => r.job_id === detail.job_id)
                .map((r) => (
                  <div key={`${r.skill_code}-${r.requirement_type}`}>
                    <strong>
                      {r.skill_code} · {r.skill_name}
                    </strong>
                    <span className={`tag ${r.requirement_type}`}>{r.requirement_type}</span>
                    <small>{r.evidence_basis}</small>
                  </div>
                ))}
            </div>
            <h3>Unchanged appendix row</h3>
            <pre>{detail.source_row}</pre>
            <p>
              Source reference: <strong>{detail.source_reference}</strong>. This is a citation in the original
              Deep Research report; no public URL was supplied.
            </p>
            <button
              className="secondary"
              onClick={() => {
                setDetail(null);
                setDrill(null);
                changePage('Original Research Report');
              }}
            >
              Open research report <BookOpen size={15} />
            </button>
          </div>
        ) : (
          drill && (
            <>
              <Small n={drill.jobs.length} />
              {records(drill.jobs)}
            </>
          )
        )}
      </dialog>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
