// Reusable form widgets.
import { useState, useRef } from '/vendor/hooks.js';
import { html } from './util.js';
import { t } from './i18n.js';

// Simple fields are wrapped in a <label> so the caption names the input;
// fields holding several controls (`group`) become a labelled group instead.
export function Field({ label, help, children, wide, group }) {
  const cls = 'field' + (wide ? ' wide' : '');
  const inner = [
    label && html`<div class="label">${label}</div>`,
    children,
    help && html`<div class="help">${help}</div>`,
  ];
  if (label && !group) return html`<label class=${cls}>${inner}</label>`;
  return html`<div class=${cls} role=${label ? 'group' : undefined} aria-label=${label || undefined}>${inner}</div>`;
}

export function Text({ value, onChange, placeholder, type = 'text', disabled, list, cls }) {
  return html`<input type=${type} class=${cls || ''} value=${value ?? ''} placeholder=${placeholder || ''}
    disabled=${disabled} list=${list} onInput=${(e) => onChange(e.currentTarget.value)} />`;
}

export function Area({ value, onChange, rows = 4, placeholder, mono }) {
  return html`<textarea rows=${rows} class=${mono ? 'mono' : ''} placeholder=${placeholder || ''} value=${value ?? ''}
    onInput=${(e) => onChange(e.currentTarget.value)}></textarea>`;
}

// options: [{ value, label }]. Unknown current values are kept as an extra option.
export function Select({ value, onChange, options, placeholder }) {
  const known = options.some((o) => o.value === value);
  return html`<select value=${value ?? ''} onChange=${(e) => onChange(e.currentTarget.value)}>
    ${placeholder !== undefined && html`<option value="">${placeholder}</option>`}
    ${!known && value ? html`<option value=${value}>${value}</option>` : null}
    ${options.map((o) => html`<option value=${o.value}>${o.label}</option>`)}
  </select>`;
}

export function Check({ checked, onChange, label, title }) {
  return html`<label class="check" title=${title || ''}>
    <input type="checkbox" checked=${!!checked} onChange=${(e) => onChange(e.currentTarget.checked)} /> ${label}
  </label>`;
}

function move(list, i, d) {
  const j = i + d;
  if (j < 0 || j >= list.length) return list;
  const c = [...list];
  [c[i], c[j]] = [c[j], c[i]];
  return c;
}

export function RowTools({ list, i, onChange }) {
  return html`<span class="row-tools">
    <button type="button" class="icon" title=${t('up')} disabled=${i === 0} onClick=${() => onChange(move(list, i, -1))}>↑</button>
    <button type="button" class="icon" title=${t('down')} disabled=${i === list.length - 1} onClick=${() => onChange(move(list, i, 1))}>↓</button>
    <button type="button" class="icon danger" title=${t('remove')} onClick=${() => onChange(list.filter((_, k) => k !== i))}>✕</button>
  </span>`;
}

// ── Authors ─────────────────────────────────────────────────────────────────
// Hugo Blox pairs `authors` and `author_notes` by position. The editor shows
// them as one table so the notes can never drift out of line.

const CORR = 'Corresponding author';
const isCorr = (p) => p.toLowerCase() === CORR.toLowerCase();

function toRows(authors = [], notes = []) {
  return (authors || []).map((name, i) => {
    const parts = String((notes || [])[i] || '').split(/\s*[,;]\s*/).filter(Boolean);
    return { name: name === 'me' ? '' : String(name), me: name === 'me', corr: parts.some(isCorr), other: parts.filter((p) => !isCorr(p)).join(', ') };
  });
}

function fromRows(rows, withNotes) {
  const kept = rows.filter((r) => r.me || r.name.trim());
  const authors = kept.map((r) => (r.me ? 'me' : r.name.trim()));
  if (!withNotes) return { authors };
  const notes = kept.map((r) => [r.corr ? CORR : '', r.other.trim()].filter(Boolean).join(', '));
  while (notes.length && !notes[notes.length - 1]) notes.pop();
  return { authors, author_notes: notes.length ? notes : undefined };
}

export function AuthorsEditor({ authors, notes, withNotes, meName, onChange }) {
  const [rows, setRows] = useState(() => toRows(authors, notes));
  const commit = (next) => { setRows(next); onChange(fromRows(next, withNotes)); };
  const set = (i, patch) => commit(rows.map((r, k) => (k === i ? { ...r, ...patch } : patch.me ? { ...r, me: false } : r)));
  return html`<div class="authors">
    ${rows.map((r, i) => html`<div class=${'author-row' + (r.me ? ' is-me' : '')}>
      <span class="num">${i + 1}</span>
      ${r.me
        ? html`<input class="grow" value=${`${meName} (${t('me')})`} disabled />`
        : html`<input class="grow" value=${r.name} placeholder=${t('authorName')} aria-label=${`${t('authors')} ${i + 1}`} onInput=${(e) => set(i, { name: e.currentTarget.value })} />`}
      <${Check} checked=${r.me} label=${t('me')} onChange=${(v) => set(i, { me: v })} />
      ${withNotes && html`<${Check} checked=${r.corr} label=${t('corresponding')} title=${t('correspondingTitle')} onChange=${(v) => set(i, { corr: v })} />`}
      ${withNotes && html`<input class="note" value=${r.other} placeholder=${t('otherNotePh')} title=${t('otherNote')} onInput=${(e) => set(i, { other: e.currentTarget.value })} />`}
      <${RowTools} list=${rows} i=${i} onChange=${commit} />
    </div>`)}
    <button type="button" class="add" onClick=${() => commit([...rows, { name: '', me: false, corr: false, other: '' }])}>+ ${t('addAuthor')}</button>
  </div>`;
}

// ── Lists ───────────────────────────────────────────────────────────────────

export function LinksEditor({ value, onChange, types }) {
  const list = Array.isArray(value) ? value : [];
  const set = (i, patch) => onChange(list.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const options = types.map((ty) => ({ value: ty, label: t('link:' + ty) }));
  return html`<div class="rows">
    ${list.map((l, i) => html`<div class="row">
      <${Select} value=${l.type} options=${options} onChange=${(v) => set(i, { type: v })} />
      <input class="grow" value=${l.url || ''} placeholder="https://…" onInput=${(e) => set(i, { url: e.currentTarget.value })} />
      <${RowTools} list=${list} i=${i} onChange=${onChange} />
    </div>`)}
    <button type="button" class="add" onClick=${() => onChange([...list, { type: types[0], url: '' }])}>+ ${t('addLink')}</button>
  </div>`;
}

// fields: [{ key, label, placeholder, list, flex, render(value, set) }]
export function ObjectList({ value, onChange, fields, addLabel, blank = {} }) {
  const list = Array.isArray(value) ? value : [];
  const set = (i, key, v) => onChange(list.map((it, k) => (k === i ? { ...it, [key]: v } : it)));
  return html`<div class="rows">
    ${list.map((it, i) => html`<div class="row boxed">
      <div class="row-fields">
        ${fields.map((f) => html`<label class="mini" style=${`flex: ${f.flex || 1}`}>
          <span>${f.label}</span>
          ${f.render
            ? f.render(it[f.key], (v) => set(i, f.key, v))
            : html`<input value=${it[f.key] ?? ''} placeholder=${f.placeholder || ''} list=${f.list}
                onInput=${(e) => set(i, f.key, e.currentTarget.value)} />`}
        </label>`)}
      </div>
      <${RowTools} list=${list} i=${i} onChange=${onChange} />
    </div>`)}
    <button type="button" class="add" onClick=${() => onChange([...list, { ...blank }])}>+ ${addLabel}</button>
  </div>`;
}

export function StringList({ value, onChange, addLabel }) {
  const list = Array.isArray(value) ? value : [];
  return html`<div class="rows">
    ${list.map((s, i) => html`<div class="row">
      <input class="grow" value=${s} onInput=${(e) => onChange(list.map((x, k) => (k === i ? e.currentTarget.value : x)))} />
      <${RowTools} list=${list} i=${i} onChange=${onChange} />
    </div>`)}
    <button type="button" class="add" onClick=${() => onChange([...list, ''])}>+ ${addLabel}</button>
  </div>`;
}

// Comma-separated tags; keeps its own text so typing a comma is not swallowed.
export function TagsInput({ value, onChange }) {
  const [text, setText] = useState(() => (Array.isArray(value) ? value : value ? [value] : []).join(', '));
  return html`<input value=${text} onInput=${(e) => {
    const v = e.currentTarget.value;
    setText(v);
    const tags = v.split(/[,，;；]/).map((s) => s.trim()).filter(Boolean);
    onChange(tags.length ? tags : undefined);
  }} />`;
}

// ── Attachments ─────────────────────────────────────────────────────────────

export function FileSlot({ label, help, accept, url, name, image, disabled, onUpload, onRemove }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);
  const drop = (e) => {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files[0];
    if (f && !disabled) onUpload(f);
  };
  return html`<${Field} label=${label} help=${help} group=${true}>
    <div class=${'file-slot' + (over ? ' over' : '')} onDragOver=${(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave=${() => setOver(false)} onDrop=${drop}>
      ${url && image ? html`<a href=${url} target="_blank" rel="noopener"><img class="thumb" src=${url} alt="" /></a>` : null}
      ${url && !image ? html`<a href=${url} target="_blank" rel="noopener">${name}</a>` : null}
      ${!url && html`<span class="muted">${t('none')}</span>`}
      <span class="spacer"></span>
      <input type="file" accept=${accept} hidden ref=${input} onChange=${(e) => {
        const f = e.currentTarget.files[0];
        e.currentTarget.value = '';
        if (f) onUpload(f);
      }} />
      <button type="button" disabled=${disabled} onClick=${() => input.current.click()}>${url ? t('replace') : t('upload')}</button>
      ${url && html`<button type="button" class="danger-text" onClick=${onRemove}>${t('removeFile')}</button>`}
    </div>
  <//>`;
}

// ── Date helpers ────────────────────────────────────────────────────────────

export const dateInput = (v) => String(v || '').slice(0, 10);

export function toLocalInput(v) {
  const m = String(v || '').match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/);
  return m ? `${m[1]}T${m[2] || '09:00'}` : '';
}

// Keep the seconds and time-zone suffix the original value used ("…:00Z").
export function fromLocalInput(val, old) {
  if (!val) return undefined;
  const m = String(old || '').match(/T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:?\d{2})?$/);
  return val + ((m && m[1]) || ':00') + (m ? m[2] || '' : 'Z');
}
