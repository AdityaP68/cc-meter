import { useEffect, useMemo, useRef, useState } from 'react';
import { DOC_GROUPS, DOC_PAGES, DOC_SLUGS, type DocPage } from './docs-content';
import { headingDomId, renderMarkdown } from './docs-markdown';

/* The Docs section: #/docs (index) and #/docs/<slug>[/<heading>]. The content is compiled in (docs-content.ts), so
   nothing here calls /api and the pages work offline. */

const safeDecode = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };

function scrollToHeading(anchor: string): void {
  document.getElementById(headingDomId(anchor))?.scrollIntoView?.();
}

function Sidebar({ current, onIndex }: { current: string; onIndex: boolean }) {
  return (
    <>
      <aside className="docs-side">
        <nav className="docs-nav" aria-label="Documentation">
          <a href="#/docs" aria-current={onIndex ? 'page' : undefined}>All docs</a>
          {DOC_GROUPS.map((g) => (
            <div key={g.name} className="docs-group">
              <div className="docs-group-h">{g.name}</div>
              {DOC_PAGES.filter((p) => p.group === g.name).map((p) => (
                <a key={p.slug} href={`#/docs/${p.slug}`} aria-current={current === p.slug ? 'page' : undefined}>{p.title}</a>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <label className="docs-select">
        <span className="small muted">Documentation page</span>
        <select value={current} onChange={(e) => { location.hash = e.target.value ? `#/docs/${e.target.value}` : '#/docs'; }}>
          <option value="">All docs</option>
          {DOC_GROUPS.map((g) => (
            <optgroup key={g.name} label={g.name}>
              {DOC_PAGES.filter((p) => p.group === g.name).map((p) => <option key={p.slug} value={p.slug}>{p.title}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
    </>
  );
}

function DocsIndex() {
  return (
    <article className="docs-article">
      <h1 tabIndex={-1}>Documentation</h1>
      <p className="docs-lead">How sessionscope works, what its numbers mean, and how to use it. These pages are part of the dashboard, need no network, and are also readable as plain markdown in <code>docs/guide/</code> in the repository.</p>
      {DOC_GROUPS.map((g) => (
        <section key={g.name} className="docs-index-group" aria-labelledby={`docs-g-${g.name}`}>
          <h2 id={`docs-g-${g.name}`}>{g.name}</h2>
          <p className="muted small">{g.blurb}</p>
          <ul className="docs-cards">
            {DOC_PAGES.filter((p) => p.group === g.name).map((p) => (
              <li key={p.slug}>
                <a className="docs-card" href={`#/docs/${p.slug}`}>
                  <span className="docs-card-t">{p.title}</span>
                  <span className="docs-card-s">{p.summary}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </article>
  );
}

function NotFound({ slug }: { slug: string }) {
  return (
    <article className="docs-article">
      <h1 tabIndex={-1}>Page not found</h1>
      <p>There is no documentation page called <code>{slug}</code>.</p>
      <p><a href="#/docs">Back to the documentation index</a></p>
    </article>
  );
}

function DocArticle({ page, anchor }: { page: DocPage; anchor: string }) {
  const doc = useMemo(() => renderMarkdown(page.body, { knownSlugs: DOC_SLUGS }), [page]);
  const at = DOC_PAGES.findIndex((p) => p.slug === page.slug);
  // Open the contents list on wide screens; on a phone it would push the page itself below the fold.
  const [tocOpen] = useState(() => !window.matchMedia?.('(max-width: 720px)').matches);
  const prev = DOC_PAGES[at - 1];
  const next = DOC_PAGES[at + 1];

  // Jump to a heading named in the address. The app scrolls to the top on every route change after this effect has run,
  // so wait a tick; the cleanup cancels it if the route changes again first.
  useEffect(() => {
    if (!anchor) return;
    const t = window.setTimeout(() => { scrollToHeading(anchor); }, 0);
    return () => window.clearTimeout(t);
  }, [page.slug, anchor]);

  return (
    <article className="docs-article">
      <div className="docs-eyebrow">{page.group}</div>
      <h1 tabIndex={-1}>{page.title}</h1>
      {doc.outline.length >= 3 && (
        <details className="docs-toc" open={tocOpen}>
          <summary>On this page</summary>
          <nav aria-label="On this page">
            {doc.outline.map((o) => {
              const href = `#/docs/${page.slug}/${o.anchor}`;
              return (
                <a key={o.id} href={href} onClick={(e) => { if (location.hash === href) { e.preventDefault(); scrollToHeading(o.anchor); } }}>{o.text}</a>
              );
            })}
          </nav>
        </details>
      )}
      <div className="md">{doc.nodes}</div>
      <nav className="docs-pn" aria-label="Previous and next page">
        {prev ? <a className="prev" href={`#/docs/${prev.slug}`}><span className="small muted">Previous</span><span>{prev.title}</span></a> : <span />}
        {next ? <a className="next" href={`#/docs/${next.slug}`}><span className="small muted">Next</span><span>{next.title}</span></a> : <span />}
      </nav>
    </article>
  );
}

export function DocsPage({ hash }: { hash: string }) {
  const [, , rawSlug = '', rawAnchor = ''] = hash.split('/');
  const slug = safeDecode(rawSlug.split('?')[0]!).toLowerCase();
  const anchor = safeDecode(rawAnchor.split('?')[0]!);
  const page = slug ? DOC_PAGES.find((p) => p.slug === slug) : undefined;

  // The sticky header wraps to a different height on narrow screens: publish it so headings and the sidebar clear it.
  useEffect(() => {
    const top = document.querySelector<HTMLElement>('.top');
    if (!top) return;
    const set = () => { document.documentElement.style.setProperty('--header-h', `${top.offsetHeight}px`); };
    set();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(set);
    ro.observe(top);
    return () => { ro.disconnect(); document.documentElement.style.removeProperty('--header-h'); };
  }, []);

  // After moving to another docs page (Next, Previous, the sidebar) the clicked link is gone: put keyboard and screen-reader focus on the new h1.
  const shown = useRef<string | null>(null);
  useEffect(() => {
    if (shown.current !== null && shown.current !== slug) document.querySelector<HTMLElement>('.docs-article h1')?.focus({ preventScroll: true });
    shown.current = slug;
  }, [slug]);

  return (
    <div className="docs">
      <Sidebar current={page ? page.slug : ''} onIndex={!slug} />
      {!slug ? <DocsIndex /> : page ? <DocArticle key={page.slug} page={page} anchor={anchor} /> : <NotFound slug={slug.slice(0, 80)} />}
    </div>
  );
}
