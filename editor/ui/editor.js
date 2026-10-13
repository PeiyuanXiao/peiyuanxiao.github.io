// Editor for one publication or talk (a folder with index.md and attachments).
import { useState, useEffect } from '/vendor/hooks.js';
import { html, api, clone, setIn, errorText, fileExt } from './util.js';
import { t } from './i18n.js';
import { Field, Area, FileSlot } from './fields.js';
import { Toolbar, Section, useSaveShortcut, useDirty } from './shell.js';
import { PublicationFields, ImportPanel, normalizePublication, publicationTemplate, suggestPublicationSlug, blankPublication } from './publication.js';
import { EventFields, normalizeEvent, eventTemplate, suggestEventSlug, blankEvent } from './event.js';

const KINDS = {
  publications: { Fields: PublicationFields, normalize: normalizePublication, template: publicationTemplate,
    suggest: suggestPublicationSlug, blank: blankPublication, newLabel: 'newPub' },
  events: { Fields: EventFields, normalize: normalizeEvent, template: eventTemplate,
    suggest: suggestEventSlug, blank: blankEvent, newLabel: 'newEvent' },
};
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;

const snapshot = (item) => ({ data: clone(item.data), body: String(item.body || '').trim(), bib: String(item.bib || '').trim() });

export function BundleEditor({ col, slug, template, ctx }) {
  const kind = KINDS[col];
  const isNew = !slug;
  const [item, setItem] = useState(null);
  const [draft, setDraft] = useState(null);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [newSlug, setNewSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [stamp, setStamp] = useState(Date.now());

  const load = async () => {
    setLoadError('');
    setConflict(false);
    try {
      const it = isNew
        ? { data: template ? clone(template) : kind.blank(), body: '', bib: '', files: {}, hash: null }
        : await api.get(`/api/items/${col}/${slug}`);
      setItem(it);
      setDraft(snapshot(it));
      setVersion((v) => v + 1);
      setStamp(Date.now());
    } catch (e) {
      setLoadError(errorText(t, e));
    }
  };
  useEffect(() => {
    load();
    if (!isNew) ctx.setPreviewPath(`${col}/${slug}/`);
  }, []);

  const base = item && snapshot(item);
  const dirty = !!(draft && base && JSON.stringify(draft) !== JSON.stringify(base));
  useDirty(ctx, dirty);

  const d = draft ? draft.data : {};
  useEffect(() => {
    if (isNew && draft && !slugTouched) setNewSlug(kind.suggest(draft.data, ctx.taken(col)));
  }, [d.title, d.event_name, d.date, d.event_start]);

  const set = (path, value) => setDraft((s) => ({ ...s, data: setIn(s.data, path, value) }));

  const onImport = (r) => {
    const imported = Object.fromEntries(Object.entries(r.data).filter(([, v]) => v !== undefined && v !== ''));
    setDraft((s) => ({ ...s, data: { ...s.data, ...imported }, bib: r.bib || s.bib }));
    setVersion((v) => v + 1);
  };

  const save = async () => {
    if (!draft || busy) return;
    const data = kind.normalize(clone(draft.data));
    if (!String(data.title || '').trim()) return ctx.notify(t('needTitle'), 'error');
    if (!data.date) return ctx.notify(t('needDate'), 'error');
    if (isNew) {
      if (!newSlug) return ctx.notify(t('needSlug'), 'error');
      if (!SLUG_RE.test(newSlug)) return ctx.notify(t('badSlug'), 'error');
      if (ctx.taken(col).includes(newSlug)) return ctx.notify(t('slugExists'), 'error');
    } else if (!dirty) {
      return ctx.notify(t('noChanges'));
    }
    if (col === 'publications' && !(data.authors || []).includes('me') && !confirm(t('noMeWarn'))) return;
    setBusy(true);
    try {
      if (isNew) {
        await api.post(`/api/items/${col}`, { slug: newSlug, data, body: draft.body, bib: draft.bib });
        ctx.setDirty(false);
        ctx.notify(t('created'));
        ctx.onCreated(col, newSlug);
      } else {
        const body = draft.body === base.body ? undefined : draft.body ? `\n${draft.body}\n` : '';
        const r = await api.put(`/api/items/${col}/${slug}`, { data, body, bib: draft.bib, baseHash: item.hash });
        ctx.notify(r.changed ? t('saved') : t('noChanges'));
        await load();
        ctx.onSaved();
      }
    } catch (e) {
      if (e.status === 409 && !isNew) setConflict(true);
      ctx.notify(errorText(t, e), 'error');
    } finally {
      setBusy(false);
    }
  };
  useSaveShortcut(save);

  const remove = async () => {
    if (!confirm(t('confirmDelete', { title: draft.data.title || slug }))) return;
    try {
      await api.del(`/api/items/${col}/${slug}`);
      ctx.setDirty(false);
      ctx.notify(t('deleted'));
      ctx.onDeleted(col);
    } catch (e) {
      ctx.notify(errorText(t, e), 'error');
    }
  };

  const discard = () => {
    if (!confirm(t('confirmDiscard'))) return;
    setDraft(snapshot(item));
    setVersion((v) => v + 1);
  };

  const attach = async (request) => {
    try {
      const files = await request;
      setItem((it) => ({ ...it, files }));
      setStamp(Date.now());
      ctx.notify(t('saved'));
      ctx.onSaved();
    } catch (e) {
      ctx.notify(errorText(t, e), 'error');
    }
  };
  const upload = (which, file) =>
    attach(api.upload(`/api/items/${col}/${slug}/files/${which}?ext=${encodeURIComponent(fileExt(file))}`, file));
  const removeFile = (which) => attach(api.del(`/api/items/${col}/${slug}/files/${which}`));

  if (loadError) {
    return html`<div class="pane-msg"><p class="error-text">${loadError}</p><button type="button" onClick=${load}>${t('reloadItem')}</button></div>`;
  }
  if (!draft) return html`<div class="pane-msg muted">${t('loading')}</div>`;

  const Fields = kind.Fields;
  const fileUrl = (name) => name && `/files/item/${col}/${slug}/${encodeURIComponent(name)}?v=${stamp}`;
  const actions = [
    { label: busy ? t('saving') : isNew ? t('create') : t('save'), kind: 'primary', onClick: save, disabled: busy },
    conflict && { label: t('reloadItem'), onClick: load },
    !isNew && dirty && { label: t('discard'), onClick: discard },
    !isNew && { label: t('duplicate'), onClick: () => ctx.onDuplicate(col, kind.template(draft.data)) },
    !isNew && { label: t('delete'), kind: 'danger', onClick: remove },
  ];

  return html`<div class="editor">
    <${Toolbar} title=${isNew ? t(kind.newLabel) : draft.data.title || slug} subtitle=${isNew ? '' : `${col}/${slug}`}
      dirty=${dirty} actions=${actions} />
    <div class="editor-body">
      ${isNew && col === 'publications' && html`<${ImportPanel} onImport=${onImport} />`}
      ${isNew && html`<${Section}>
        <${Field} label=${t('slug')} help=${t('slugHelp', { col })} wide>
          <input class="mono" value=${newSlug} onInput=${(e) => {
            setSlugTouched(true);
            setNewSlug(e.currentTarget.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'));
          }} />
        <//>
      <//>`}
      <${Fields} data=${draft.data} set=${set} version=${version} meName=${ctx.meName}
        bib=${draft.bib} setBib=${(v) => setDraft((s) => ({ ...s, bib: v }))} />
      <${Section} title=${t('files')}>
        ${isNew
          ? html`<p class="help">${t('saveFirst')}</p>`
          : html`
            <${FileSlot} label=${t('cover')} help=${t('coverHelp')} accept="image/*" image=${true}
              url=${fileUrl(item.files.image)} name=${item.files.image}
              onUpload=${(f) => upload('image', f)} onRemove=${() => removeFile('image')} />
            ${col === 'publications' && html`<${FileSlot} label=${t('pdf')} help=${t('pdfHelp')} accept="application/pdf"
              url=${fileUrl(item.files.pdf)} name=${item.files.pdf}
              onUpload=${(f) => upload('pdf', f)} onRemove=${() => removeFile('pdf')} />`}`}
      <//>
      <details class="section" open=${!!base.body}>
        <summary>${t('body')}</summary>
        <p class="help">${t('bodyHelp')}</p>
        <${Area} rows="6" mono=${true} value=${draft.body} onChange=${(v) => setDraft((s) => ({ ...s, body: v }))} />
      </details>
    </div>
  </div>`;
}
