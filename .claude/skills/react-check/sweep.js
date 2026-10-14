// react-check crash sweep. Paste the whole file into the browser tool's JavaScript runner on the app's start page.
// Visits every same-origin route by clicking the app's own links (no reloads), up to MAX pages and PER_PATTERN
// pages per route shape (/item/:id). Reports errors, blank renders (and stops there), blocked full-page loads and
// identical content for different params (a stale-state candidate). Falls back to hash/pushState navigation, marked
// `via: "direct"`, only when the current page has no link to a queued route. Ends with two Back steps.
await (async (MAX = 40, PER_PATTERN = 2, SETTLE_MS = 400) => {
  const errors = [];
  let at = location.href;
  const fmt = (x) => (x instanceof Error ? `${x.name}: ${x.message} @ ${(x.stack ?? '').split('\n')[1]?.trim() ?? ''}` : String(x));
  const push = (...a) => errors.push({ at, msg: a.map(fmt).join(' ').slice(0, 300) });
  const onErr = (e) => push(e.error ?? e.message);
  const onRej = (e) => push('unhandledrejection:', e.reason);
  const origError = console.error;
  addEventListener('error', onErr);
  addEventListener('unhandledrejection', onRej);
  console.error = (...a) => { push(...a); origError.apply(console, a); };

  // A click the router did not handle would reload the page (and end this script): block it and report it.
  let reloadBlocked = false;
  const guard = (e) => {
    const a = e.target.closest?.('a[href]');
    if (!a || e.defaultPrevented) return;
    const u = new URL(a.href);
    if (u.pathname === location.pathname && u.search === location.search && u.hash) return; // hash change: no reload
    e.preventDefault(); reloadBlocked = true;
  };
  addEventListener('click', guard);

  const root = document.querySelector('#root, #app, #__next, [data-reactroot]') ?? document.body;
  const settle = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, SETTLE_MS))));
  const shape = (href) => { const u = new URL(href); return (u.pathname + u.hash.split('?')[0]).replace(/[0-9a-f]{8}-[0-9a-f-]{27}|[0-9a-f]{12,}|\d+/gi, ':id'); };
  const usable = (a) => a.origin === location.origin && !a.target && !a.hasAttribute('download')
    && !/\.(json|csv|pdf|zip|png|jpe?g|svg|txt)$/i.test(a.pathname) && !/^\/api\//.test(a.pathname);
  const findLink = (href) => [...document.querySelectorAll('a[href]')].find((a) => a.href === href && a.offsetParent !== null);
  const text = () => (document.querySelector('main') ?? root).innerText.trim();

  const perShape = new Map(), queue = [], done = new Set(), rows = [], byShape = new Map();
  const enqueue = () => {
    for (const a of document.querySelectorAll('a[href]')) {
      if (!usable(a) || done.has(a.href) || queue.includes(a.href) || a.href === location.href) continue;
      const s = shape(a.href), n = perShape.get(s) ?? 0;
      if (n >= PER_PATTERN) continue;
      perShape.set(s, n + 1); queue.push(a.href);
    }
  };
  const check = (href, via, key = href) => {
    const row = { href: href.replace(location.origin, ''), via, errors: errors.filter((e) => e.at === key).map((e) => e.msg) };
    if (!root.innerText.trim()) row.blank = true;
    if (reloadBlocked) { row.wouldReload = true; reloadBlocked = false; }
    const s = shape(href), t = text().slice(0, 4000), prev = byShape.get(s);
    if (!row.blank && prev && prev.href !== href && prev.t === t) row.sameAs = prev.href.replace(location.origin, '');
    byShape.set(s, { href, t });
    rows.push(row);
  };

  done.add(location.href); enqueue();
  while (queue.length && done.size <= MAX) {
    const pick = queue.findIndex((h) => findLink(h)); // prefer a route the current page links to
    const href = queue.splice(pick < 0 ? 0 : pick, 1)[0];
    done.add(href); at = href;
    const a = findLink(href);
    let via = 'link';
    if (a) a.click();
    else {
      via = 'direct';
      const u = new URL(href);
      if (u.pathname === location.pathname && u.search === location.search) location.hash = u.hash;
      else { history.pushState(null, '', href); dispatchEvent(new PopStateEvent('popstate')); }
    }
    await settle();
    check(href, via);
    if (rows.at(-1).blank) break; // the app unmounted; later routes would only repeat it. Fix, reload, rerun.
    enqueue();
  }
  if (!rows.at(-1)?.blank) for (let i = 0; i < 2; i++) { at = `back#${i + 1}`; history.back(); await settle(); check(location.href, at, at); }

  removeEventListener('error', onErr); removeEventListener('unhandledrejection', onRej); removeEventListener('click', guard);
  console.error = origError;
  const bad = rows.filter((r) => r.errors.length || r.blank || r.wouldReload || r.sameAs);
  return { visited: rows.length, queuedButUnvisited: queue.length, problems: bad, ok: rows.filter((r) => !bad.includes(r)).map((r) => `${r.via} ${r.href}`) };
})();
