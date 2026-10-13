// Pieces shared by every editor view: toolbar, Ctrl+S, dirty tracking.
import { useEffect, useRef } from '/vendor/hooks.js';
import { html } from './util.js';
import { t } from './i18n.js';

export function useSaveShortcut(save) {
  const ref = useRef(save);
  ref.current = save;
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        ref.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function useDirty(ctx, dirty) {
  useEffect(() => { ctx.setDirty(dirty); }, [dirty]);
  useEffect(() => () => ctx.setDirty(false), []);
}

// actions: [{ label, onClick, kind: 'primary' | 'danger' | undefined, disabled }]
export function Toolbar({ title, subtitle, dirty, actions }) {
  return html`<div class="toolbar">
    <div class="toolbar-title">
      <h2 title=${title}>${title}</h2>
      ${subtitle && html`<div class="muted small">${subtitle}</div>`}
    </div>
    ${dirty && html`<span class="badge warn">${t('unsaved')}</span>`}
    <div class="toolbar-actions">
      ${actions.filter(Boolean).map((a) => html`<button type="button" class=${a.kind || ''} disabled=${a.disabled}
        onClick=${a.onClick}>${a.label}</button>`)}
    </div>
  </div>`;
}

export function Section({ title, children }) {
  return html`<section class="section">
    ${title && html`<h3>${title}</h3>`}
    <div class="grid">${children}</div>
  </section>`;
}
