import { useEffect, useState, type ReactNode } from 'react';
import { Download } from 'lucide-react';
import { CatalogSchema, SnapshotBundleSchema, LongitudinalBundleSchema } from './schemas.mjs';
import { selectJobs, frequency, distribution } from './analysis.mjs';
import type { Catalog, SnapshotBundle, SelectSnapshot, Navigation, LongitudinalBundle } from './types';
export const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`;
export const dateLabel = (date: string) =>
  new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
export async function fetchJSON(path: string, signal?: AbortSignal) {
  const response = await fetch(asset(path), { signal });
  if (!response.ok) throw Error(`Unable to load ${path} (${response.status})`);
  return response.json();
}
export function Observatory({
  children,
}: {
  children: (
    bundle: SnapshotBundle,
    catalog: Catalog,
    onSelect: SelectSnapshot,
    navigation: Navigation,
  ) => ReactNode;
}) {
  const [catalog, setCatalog] = useState<Catalog | null>(null),
    [bundle, setBundle] = useState<SnapshotBundle | null>(null),
    [selected, setSelected] = useState(''),
    [error, setError] = useState(''),
    [navigation, setNavigation] = useState<Navigation>({});
  useEffect(() => {
    const controller = new AbortController();
    fetchJSON('data/catalog.json', controller.signal)
      .then((raw) => {
        const parsed = CatalogSchema.parse(raw);
        if (!parsed.snapshots.some((s) => s.snapshot_id === parsed.latest_snapshot_id))
          throw Error('Latest snapshot is absent from the catalogue.');
        setCatalog(parsed);
        setSelected(parsed.latest_snapshot_id);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!catalog || !selected) return;
    const controller = new AbortController();
    const entry = catalog.snapshots.find((s) => s.snapshot_id === selected)!;
    setBundle(null);
    setError('');
    Promise.all([
      fetchJSON(entry.bundle_path, controller.signal),
      fetch(asset(entry.report_path), { signal: controller.signal }).then((r) => {
        if (!r.ok) throw Error('Research report unavailable');
        return r.text();
      }),
    ])
      .then(([data, report]) => {
        const parsed = SnapshotBundleSchema.parse({ ...data, report });
        if (parsed.metadata.snapshot_id !== selected || parsed.jobs.some((j) => j.snapshot_id !== selected))
          throw Error('Snapshot bundle contains mixed periods.');
        if (!parsed.validation.structural_pass || parsed.validation.errors)
          throw Error('Snapshot has blocking validation errors.');
        setBundle(parsed);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      });
    return () => controller.abort();
  }, [catalog, selected]);
  const onSelect: SelectSnapshot = (id, options = {}) => {
    setNavigation(options);
    setSelected(id);
  };
  if (error)
    return (
      <main>
        <h1>Evidence could not be loaded</h1>
        <p role="alert">{error}</p>
        <button className="primary" onClick={() => window.location.reload()}>
          Retry
        </button>
      </main>
    );
  if (!catalog || !bundle)
    return (
      <main>
        <h1>Labour-Market Observatory</h1>
        <p role="status">Loading validated snapshot evidence…</p>
      </main>
    );
  return children(bundle, catalog, onSelect, navigation);
}
export function Archive({ catalog, onSelect }: { catalog: Catalog; onSelect: SelectSnapshot }) {
  return (
    <>
      <div className="narrative">
        <h2>Research Archive</h2>
        <p>
          Immutable research reports and separately validated quarterly samples. New published snapshots
          appear after ingestion.
        </p>
      </div>
      <div className="grid">
        {[...catalog.snapshots].reverse().map((s) => (
          <section className="panel" key={s.snapshot_id}>
            <h3>
              {s.label} · {s.snapshot_id}
            </h3>
            <p>
              {s.records} jobs · retrieved {dateLabel(s.retrieval_date)}
            </p>
            <p>
              Taxonomy v{s.taxonomy_version} · Methodology v{s.methodology_version}
            </p>
            <p>{s.notes}</p>
            <div className="actions">
              <button
                className="secondary"
                onClick={() => onSelect(s.snapshot_id, { page: 'Original Research Report' })}
              >
                View report
              </button>
              <button className="secondary" onClick={() => onSelect(s.snapshot_id, { page: 'Data Quality' })}>
                View validation
              </button>
              <a className="secondary" href={asset(`data/snapshots/${s.snapshot_id}/jobs.csv`)} download>
                Download jobs <Download size={14} />
              </a>
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
export function LongitudinalDownloads({ catalog }: { catalog: Catalog }) {
  return (
    <>
      <h2>Longitudinal data & shared taxonomy</h2>
      <p>These files contain separate snapshot observations. Repeated vacancies are preserved, not merged.</p>
      <div className="downloads">
        {catalog.downloads
          .filter((p) => p.startsWith('combined/') || p.startsWith('taxonomy/') || p.startsWith('migration_'))
          .map((path) => (
            <a key={path} href={asset(`data/${path}`)} download>
              <span>
                <strong>{path}</strong>
                <small>Generated longitudinal data or canonical configuration</small>
              </span>
              <Download size={16} />
            </a>
          ))}
      </div>
    </>
  );
}
export function Trends({
  catalog,
  filters,
  onSelect,
}: {
  catalog: Catalog;
  filters: Record<string, string>;
  onSelect: SelectSnapshot;
}) {
  const [data, setData] = useState<LongitudinalBundle | null>(null),
    [error, setError] = useState(''),
    [mode, setMode] = useState('skill'),
    [code, setCode] = useState(catalog.skills[0]?.skill_code || '');
  useEffect(() => {
    if (catalog.snapshots.length < 2) return;
    const controller = new AbortController();
    fetchJSON('data/combined/dashboard.json', controller.signal)
      .then((raw) => setData(LongitudinalBundleSchema.parse(raw)))
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      });
    return () => controller.abort();
  }, [catalog]);
  if (catalog.snapshots.length < 2)
    return (
      <section className="panel">
        <h2>Trends</h2>
        <p className="trend-empty">
          Trend analysis becomes available when at least two comparable snapshots have been collected.
        </p>
        <p>
          The archive currently contains {catalog.snapshots.length} published snapshot. No trend is inferred
          from one sample.
        </p>
      </section>
    );
  if (error) return <p role="alert">{error}</p>;
  if (!data) return <p role="status">Loading quarterly observations…</p>;
  const availableSkills = catalog.skills.filter(
    (s) => !filters.skill_group || s.skill_group === filters.skill_group,
  );
  const selectedCode =
    filters.skill_code ||
    (availableSkills.some((s) => s.skill_code === code) ? code : availableSkills[0]?.skill_code) ||
    code;
  const field = mode === 'role' ? 'normalized_role_family' : mode === 'region' ? 'region' : 'seniority_group';
  const perSnapshot = catalog.snapshots.map((snapshot) => {
    const jobs = selectJobs(data.jobs, data.jobSkills, { ...filters, snapshot_id: snapshot.snapshot_id });
    const values =
      mode === 'skill'
        ? frequency(
            jobs,
            data.jobSkills,
            catalog.skills.filter(
              (s) => s.skill_code === selectedCode && s.introduced_in <= snapshot.snapshot_id,
            ),
            filters.requirement_type,
          )
        : distribution(jobs, field);
    return { snapshot, jobs, values };
  });
  const methods = new Set(catalog.snapshots.map((s) => `${s.methodology_version}/${s.taxonomy_version}`));
  return (
    <>
      <div className="narrative">
        <h2>Observed share in the analysed quarterly sample</h2>
        <p>
          Global filters apply separately inside each quarter. Every point shows count and denominator.
          Changes may reflect employer, role, seniority, regional or posting-detail composition.
        </p>
      </div>
      {methods.size > 1 && (
        <div className="warning">
          These snapshots use different methodology or taxonomy versions. Values are shown separately; they
          must not be treated as a single continuous labour-market trend.
        </div>
      )}
      <div className="filter-grid trend-controls">
        <label className="filter-field">
          <span>Trend view</span>
          <select aria-label="Trend view" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="skill">Skills / technologies / AI competencies</option>
            <option value="role">Role families</option>
            <option value="region">Regional composition</option>
            <option value="seniority">Seniority composition</option>
          </select>
        </label>
        {mode === 'skill' && (
          <label className="filter-field">
            <span>Trend competency</span>
            <select
              aria-label="Trend competency"
              value={selectedCode}
              disabled={Boolean(filters.skill_code)}
              onChange={(e) => setCode(e.target.value)}
            >
              {availableSkills.map((s) => (
                <option key={s.skill_code} value={s.skill_code}>
                  {s.skill_code} · {s.skill_name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <section className="panel">
        <div className="table-scroll">
          <table className="trend-table">
            <thead>
              <tr>
                <th>Snapshot</th>
                <th>Observation</th>
                <th>Count / N</th>
                <th>Share</th>
                <th>Sampling versions</th>
              </tr>
            </thead>
            <tbody>
              {perSnapshot.flatMap(({ snapshot, jobs, values }) =>
                values.length
                  ? values.map((r, index) => (
                      <tr key={`${snapshot.snapshot_id}-${index}`}>
                        <th>
                          {snapshot.label}
                          <small className="block">{snapshot.snapshot_id}</small>
                        </th>
                        <td>{'skill_name' in r ? r.skill_name : r.label}</td>
                        <td>
                          <button
                            className="cell-link"
                            onClick={() =>
                              onSelect(snapshot.snapshot_id, {
                                page: 'Job records',
                                filters: {
                                  ...filters,
                                  ...(mode === 'skill'
                                    ? { skill_code: selectedCode }
                                    : { [field]: 'label' in r ? String(r.label) : '' }),
                                },
                              })
                            }
                          >
                            {r.count} / {r.denominator}
                          </button>
                          {r.denominator < 10 && (
                            <small className="small-sample">
                              {r.denominator < 5
                                ? 'Very small sample — interpret cautiously'
                                : 'Small sample'}
                            </small>
                          )}
                        </td>
                        <td>
                          {r.denominator ? r.percentage.toFixed(1) + '%' : '—'}
                          <div className="trend-track">
                            <span style={{ width: `${r.percentage}%` }} />
                          </div>
                        </td>
                        <td>
                          Methodology {snapshot.methodology_version}
                          <br />
                          Taxonomy {snapshot.taxonomy_version}
                        </td>
                      </tr>
                    ))
                  : [
                      <tr key={snapshot.snapshot_id}>
                        <th>{snapshot.label}</th>
                        <td colSpan={4}>
                          {jobs.length
                            ? 'This competency was not yet in the taxonomy for this snapshot.'
                            : 'No selected observations in this snapshot.'}
                        </td>
                      </tr>,
                    ],
              )}
            </tbody>
          </table>
        </div>
      </section>
      <h2>Sample composition & comparability</h2>
      <p>{catalog.comparability.interpretation}</p>
      {catalog.comparability.comparisons.map((c) => (
        <section className="panel" key={c.to_snapshot}>
          <h3>
            {c.from_snapshot} → {c.to_snapshot}
          </h3>
          {c.warnings.length ? (
            <ul className="composition-warnings">
              {c.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : (
            <p>
              No configured composition thresholds were crossed. This does not establish representativeness or
              full comparability.
            </p>
          )}
          <details>
            <summary>Inspect all composition changes</summary>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Dimension</th>
                    <th>Group</th>
                    <th>Before</th>
                    <th>After</th>
                  </tr>
                </thead>
                <tbody>
                  {c.changes.map((r, i) => (
                    <tr key={i}>
                      <td>{r.dimension}</td>
                      <th>{r.label}</th>
                      <td>
                        {r.before.count} / {r.before.denominator} · {r.before.percentage.toFixed(1)}%
                      </td>
                      <td>
                        {r.after.count} / {r.after.denominator} · {r.after.percentage.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>
      ))}
    </>
  );
}
