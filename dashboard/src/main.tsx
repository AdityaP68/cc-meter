import { StrictMode, useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { get, post, type Check, type Facets, type Filters } from './api';
import { makeModelColors, ModelColors } from './charts';
import { HealthPage, FilterBar, RollupsPage, SessionPage, SessionsPage, useApi } from './pages';
import './styles.css';

const DEFAULT: Filters = { range: '30d', project: '', model: '', source: '' };

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? { ...fallback, ...JSON.parse(v) } : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, v: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage can be unavailable */
  }
}

function useHash(): string {
  const [h, setH] = useState(location.hash || '#/');
  useEffect(() => {
    const on = () => setH(location.hash || '#/');
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return h;
}

function App() {
  const hash = useHash();
  const [filters, setFilters] = useState<Filters>(() => load('ccmeter.filters', DEFAULT));
  const [reload, setReload] = useState(0);
  const [theme, setTheme] = useState<string>(() => load<{ t: string }>('ccmeter.theme', { t: '' }).t);
  const [busy, setBusy] = useState(false);
  const facets = useApi<Facets>('/api/facets', [reload]);
  const doctor = useApi<{ checks: Check[] }>('/api/doctor', [reload]);

  useEffect(() => window.scrollTo(0, 0), [hash]);
  useEffect(() => save('ccmeter.filters', filters), [filters]);
  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
    save('ccmeter.theme', { t: theme });
  }, [theme]);

  const colors = useMemo(() => makeModelColors(facets.data?.models ?? []), [facets.data]);
  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      await post('/api/refresh');
    } finally {
      setBusy(false);
      setReload((n) => n + 1);
    }
  }, []);

  const issues = (doctor.data?.checks ?? []).filter((c) => c.level === 'warn' || c.level === 'error');
  const [, route = '', arg = ''] = hash.split('/');
  const page = route === 'session' ? 'session' : route === 'rollups' ? 'rollups' : route === 'health' ? 'health' : 'sessions';

  return (
    <ModelColors.Provider value={colors}>
      <header className="top">
        <div className="top-in">
          <a className="brand" href="#/">ccmeter</a>
          <nav aria-label="Pages">
            <a href="#/" aria-current={page === 'sessions' || page === 'session' ? 'page' : undefined}>Sessions</a>
            <a href="#/rollups" aria-current={page === 'rollups' ? 'page' : undefined}>Rollups</a>
            <a href="#/health" aria-current={page === 'health' ? 'page' : undefined}>Health{issues.length > 0 && <span className="badge warn" title={issues.map((i) => i.title).join('\n')}>⚠ {issues.length}</span>}</a>
          </nav>
          <span className="grow" />
          <span className="muted small local" title="The dashboard only listens on 127.0.0.1; nothing leaves this machine">local only</span>
          <button className="btn small" onClick={refresh} disabled={busy}>{busy ? 'Refreshing…' : 'Refresh'}</button>
          <button className="btn small" onClick={() => setTheme(theme === 'dark' ? 'light' : theme === 'light' ? '' : 'dark')} title="Theme: dark / light / follow system">Theme: {theme || 'system'}</button>
        </div>
      </header>
      <main>
        {page !== 'session' && page !== 'health' && <FilterBar f={filters} set={setFilters} facets={facets.data} />}
        {issues.length > 0 && page !== 'health' && (
          <div className={`banner ${issues.some((i) => i.level === 'error') ? 'error' : 'warn'}`}>
            <b>⚠ {issues.length} health {issues.length === 1 ? 'warning' : 'warnings'}:</b> {issues.map((i) => i.title).join(' · ')} <a href="#/health">Details</a>
          </div>
        )}
        {page === 'sessions' && <SessionsPage f={filters} reload={reload} />}
        {page === 'rollups' && <RollupsPage f={filters} reload={reload} />}
        {page === 'session' && <SessionPage id={arg} reload={reload} />}
        {page === 'health' && <HealthPage reload={reload} />}
      </main>
    </ModelColors.Provider>
  );
}

void get;
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
