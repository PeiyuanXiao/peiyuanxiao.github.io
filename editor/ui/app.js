// Website editor UI: sidebar of items, the active editor, and the live preview.
import { render } from '/vendor/preact.js';
import { useState, useEffect, useRef } from '/vendor/hooks.js';
import { html, api, errorText, year } from './util.js';
import { t, getLang, setLang } from './i18n.js';
import { BundleEditor } from './editor.js';
import { ProfileEditor } from './profile.js';
import { ChangesView } from './changes.js';

function Sidebar({ lists, view, go, query, setQuery, dirty }) {
  const q = query.trim().toLowerCase();
  const match = (i) => !q || `${i.title} ${i.venue || ''} ${i.slug}`.toLowerCase().includes(q);
  const shortCat = (c) => (c ? t('cat:' + c).replace(/ \(.*\)$/, '') : '');
  const item = (col, i) => {
    const active = view.col === col && view.slug === i.slug;
    const meta = col === 'publications' ? [year(i.date), shortCat(i.category)] : [i.date, i.venue];
    return html`<li class=${active ? 'active' : ''} title=${i.title} onClick=${() => go({ col, slug: i.slug })}>
      <div class="item-title">${i.featured && html`<span class="star">★</span>`}${i.title}</div>
      <div class="item-meta">${meta.filter(Boolean).join(' · ')}${active && dirty && html`<span class="dot" title=${t('unsaved')}></span>`}</div>
      ${i.error && html`<div class="error-text small">${i.error}</div>`}
    </li>`;
  };
  const group = (col, newKey) => html`<div class="nav-group">
    <div class="nav-head">
      <span>${t(col)} <span class="count">${lists[col].length}</span></span>
      <button type="button" class="small" onClick=${() => go({ col, slug: null })}>+ ${t(newKey)}</button>
    </div>
    <ul class="nav-list">${lists[col].filter(match).map((i) => item(col, i))}</ul>
  </div>`;
  return html`<nav class="sidebar">
    <ul class="nav-list flat">
      <li class=${view.col === 'profile' ? 'active' : ''} onClick=${() => go({ col: 'profile' })}>
        <div class="item-title">${t('profile')}</div>
      </li>
    </ul>
    <input class="search" type="search" placeholder=${t('search')} value=${query} onInput=${(e) => setQuery(e.currentTarget.value)} />
    ${group('publications', 'newPub')}
    ${group('events', 'newEvent')}
  </nav>`;
}

function Welcome({ go }) {
  return html`<div class="welcome">
    <h2>${t('welcomeTitle')}</h2>
    <p>${t('welcomeIntro')}</p>
    <div class="row">
      <button type="button" class="primary" onClick=${() => go({ col: 'publications', slug: null })}>+ ${t('newPub')}</button>
      <button type="button" onClick=${() => go({ col: 'events', slug: null })}>+ ${t('newEvent')}</button>
      <button type="button" onClick=${() => go({ col: 'profile' })}>${t('profile')}</button>
    </div>
    <ol class="tips">${['tip1', 'tip2', 'tip3', 'tip4'].map((k) => html`<li>${t(k)}</li>`)}</ol>
  </div>`;
}

function PreviewPane({ preview, reachable, path, frameKey, reload }) {
  const src = preview.url ? preview.url.replace(/\/?$/, '/') + path : null;
  const errors = preview.errors || [];
  let status;
  if (!reachable) status = html`<span class="error-text">${t('networkError')}</span>`;
  else if (errors.length) {
    status = html`<details class="preview-errors" open>
      <summary class="error-text">${preview.ready ? t('previewError') : t('previewDown')}</summary>
      <pre>${errors.join('\n')}</pre>
    </details>`;
  } else if (!preview.ready) status = html`<span class="muted">${t('previewStarting')}</span>`;
  else if (preview.building) status = html`<span class="muted">${t('previewBuilding')}</span>`;
  else status = html`<span class="ok-text">● ${t('previewOk')}</span>`;
  return html`<aside class="preview">
    <div class="preview-bar">
      <div class="preview-status">${status}</div>
      ${src && html`<button type="button" class="small" onClick=${reload}>${t('reload')}</button>`}
      ${src && html`<a class="button small" href=${src} target="_blank" rel="noopener">${t('openInBrowser')}</a>`}
    </div>
    ${src && preview.ready
      ? html`<iframe key=${frameKey} src=${src} title="preview"></iframe>`
      : html`<div class="preview-empty muted">${t('previewStarting')}</div>`}
  </aside>`;
}

function App() {
  const [, rerender] = useState(0);
  const [meta, setMeta] = useState(null);
  const [lists, setLists] = useState({ publications: [], events: [] });
  const [changeCount, setChangeCount] = useState(0);
  const [view, setView] = useState({ col: null, slug: null, template: null, nonce: 0 });
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState(null);
  const [preview, setPreview] = useState({ url: null, ready: false, errors: [] });
  const [reachable, setReachable] = useState(true);
  const [showPreview, setShowPreview] = useState(() => window.innerWidth > 1100);
  const [previewPath, setPreviewPath] = useState('');
  const [frameKey, setFrameKey] = useState(0);
  const [dirty, setDirtyState] = useState(false);
  const dirtyRef = useRef(false);
  const toastTimer = useRef(null);

  const setDirty = (v) => { dirtyRef.current = v; setDirtyState(v); };
  const notify = (text, kind = 'ok') => {
    setToast({ text, kind });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), kind === 'error' ? 8000 : 3000);
  };
  const refreshLists = async () => {
    try {
      const [publications, events] = await Promise.all([api.get('/api/items/publications'), api.get('/api/items/events')]);
      setLists({ publications, events });
    } catch (e) {
      notify(errorText(t, e), 'error');
    }
  };
  const refreshChanges = async () => {
    try { setChangeCount((await api.get('/api/changes')).length); } catch { /* shown elsewhere */ }
  };

  useEffect(() => {
    api.get('/api/meta').then(setMeta).catch((e) => notify(errorText(t, e), 'error'));
    refreshLists();
    refreshChanges();
    const onUnload = (e) => { if (dirtyRef.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, []);

  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      try {
        const p = await api.get('/api/preview');
        if (!stopped) { setPreview(p); setReachable(true); }
      } catch {
        if (!stopped) setReachable(false);
      }
    };
    poll();
    const id = setInterval(poll, 2500);
    return () => { stopped = true; clearInterval(id); };
  }, []);

  useEffect(() => { document.title = t('appTitle'); });

  const go = (next) => {
    if (dirtyRef.current && !confirm(t('unsavedLeave'))) return;
    setDirty(false);
    setView((v) => ({ slug: null, template: null, ...next, nonce: v.nonce + 1 }));
  };

  const ctx = {
    meName: (meta && meta.name && meta.name.display) || 'Me',
    root: (meta && meta.root) || '',
    notify,
    setDirty,
    setPreviewPath,
    taken: (col) => (lists[col] || []).map((i) => i.slug),
    onSaved: () => { refreshLists(); refreshChanges(); },
    onCreated: (col, slug) => {
      refreshLists();
      refreshChanges();
      setDirty(false);
      setView((v) => ({ col, slug, template: null, nonce: v.nonce + 1 }));
      setTimeout(() => setFrameKey((k) => k + 1), 3000);
    },
    onDeleted: () => {
      refreshLists();
      refreshChanges();
      setView((v) => ({ col: null, slug: null, template: null, nonce: v.nonce + 1 }));
    },
    onDuplicate: (col, template) => go({ col, slug: null, template }),
  };

  const switchLang = (l) => { setLang(l); rerender((n) => n + 1); };

  let main;
  if (view.col === 'publications' || view.col === 'events') {
    main = html`<${BundleEditor} key=${view.nonce} col=${view.col} slug=${view.slug} template=${view.template} ctx=${ctx} />`;
  } else if (view.col === 'profile') {
    main = html`<${ProfileEditor} key=${view.nonce} ctx=${ctx} />`;
  } else if (view.col === 'changes') {
    main = html`<${ChangesView} key=${view.nonce} ctx=${ctx} />`;
  } else {
    main = html`<${Welcome} go=${go} />`;
  }

  return html`<div class=${'app' + (showPreview ? ' with-preview' : '')}>
    <header class="topbar">
      <button type="button" class="brand" onClick=${() => go({ col: null })}>${t('appTitle')}</button>
      <span class="spacer"></span>
      <button type="button" class=${'changes-btn' + (view.col === 'changes' ? ' active' : '')} onClick=${() => go({ col: 'changes' })}>
        ${t('changes')} ${changeCount > 0 && html`<span class="badge warn">${changeCount}</span>`}
      </button>
      <div class="seg" role="group" aria-label=${t('language')}>
        <button type="button" class=${getLang() === 'zh' ? 'on' : ''} onClick=${() => switchLang('zh')}>中文</button>
        <button type="button" class=${getLang() === 'en' ? 'on' : ''} onClick=${() => switchLang('en')}>EN</button>
      </div>
      <button type="button" onClick=${() => setShowPreview((s) => !s)}>${showPreview ? t('hidePreview') : t('showPreview')}</button>
    </header>
    <${Sidebar} lists=${lists} view=${view} go=${go} query=${query} setQuery=${setQuery} dirty=${dirty} />
    <main class="main">${main}</main>
    ${showPreview && html`<${PreviewPane} preview=${preview} reachable=${reachable} path=${previewPath}
      frameKey=${frameKey} reload=${() => setFrameKey((k) => k + 1)} />`}
    ${toast && html`<div class=${'toast ' + toast.kind} role="status" onClick=${() => setToast(null)}>${toast.text}</div>`}
  </div>`;
}

setLang(getLang());
render(html`<${App} />`, document.getElementById('app'));
