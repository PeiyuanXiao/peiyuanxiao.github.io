// Publication-specific fields, DOI/BibTeX import and data clean-up.
import { useState } from '/vendor/hooks.js';
import { html, api, clone, errorText, slugify, uniqueSlug, year } from './util.js';
import { t } from './i18n.js';
import { Field, Text, Area, Select, Check, AuthorsEditor, LinksEditor, TagsInput, dateInput } from './fields.js';
import { Section } from './shell.js';

export const CATEGORIES = ['Research paper', 'Review paper', 'Excavation reports'];
const TYPES = ['article-journal', 'paper-conference', 'chapter', 'book', 'thesis', 'report', 'manuscript'];
export const PUB_LINKS = ['pdf', 'code', 'dataset', 'preprint', 'slides', 'video', 'poster', 'source', 'site', 'project'];

export const blankPublication = () => ({ authors: ['me'], publication_types: ['article-journal'] });

export function normalizePublication(data) {
  const p = data.publication;
  if (p) for (const k of ['volume', 'issue']) if (/^\d+$/.test(String(p[k] ?? '').trim())) p[k] = Number(p[k]);
  if (Array.isArray(data.links)) {
    data.links = data.links.filter((l) => String(l.url || '').trim());
    if (!data.links.length) data.links = undefined;
  }
  if (typeof data.title === 'string') data.title = data.title.trim();
  return data;
}

// "Use as template": keep authors, venue, type and category; clear the rest.
export function publicationTemplate(data) {
  const d = clone(data);
  for (const k of ['title', 'date', 'hugoblox', 'links', 'summary', 'abstract', 'featured']) delete d[k];
  if (d.publication) d.publication = { name: d.publication.name, publisher: d.publication.publisher };
  return d;
}

export function suggestPublicationSlug(data, taken) {
  // Titles without Latin letters (e.g. Chinese) fall back to paper-<year>.
  const fromTitle = slugify(data.title, 4);
  const base = /[a-z]/.test(fromTitle) ? fromTitle : ['paper', year(data.date)].filter(Boolean).join('-');
  return uniqueSlug(base, taken);
}

export function ImportPanel({ onImport }) {
  const [doi, setDoi] = useState('');
  const [bib, setBib] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const run = async (fn) => {
    setBusy(true);
    setMsg(null);
    try {
      onImport(await fn());
      setMsg({ ok: true, text: t('importDone') });
    } catch (e) {
      setMsg({ ok: false, text: errorText(t, e) });
    } finally {
      setBusy(false);
    }
  };
  return html`<section class="section import">
    <h3>${t('importTitle')}</h3>
    <p class="help">${t('importHelp')}</p>
    <div class="row">
      <input class="grow" value=${doi} placeholder=${t('doiPlaceholder')} onInput=${(e) => setDoi(e.currentTarget.value)}
        onKeyDown=${(e) => e.key === 'Enter' && doi.trim() && run(() => api.get('/api/lookup/doi?doi=' + encodeURIComponent(doi.trim())))} />
      <button type="button" class="primary" disabled=${busy || !doi.trim()}
        onClick=${() => run(() => api.get('/api/lookup/doi?doi=' + encodeURIComponent(doi.trim())))}>${busy ? t('fetching') : t('fetch')}</button>
    </div>
    <textarea rows="3" class="mono" value=${bib} placeholder=${t('bibPlaceholder')} onInput=${(e) => setBib(e.currentTarget.value)}></textarea>
    <div class="row">
      <button type="button" disabled=${busy || !bib.trim()} onClick=${() => run(() => api.post('/api/lookup/bibtex', { text: bib }))}>${t('parseBib')}</button>
      ${msg && html`<span class=${msg.ok ? 'ok-text' : 'error-text'}>${msg.text}</span>`}
    </div>
  </section>`;
}

const oneLine = (v) => v.replace(/[\r\n]+/g, ' ');

export function PublicationFields({ data, set, version, meName, bib, setBib }) {
  const pub = data.publication || {};
  const type = (data.publication_types || [])[0] || '';
  const cats = Array.isArray(data.categories) ? data.categories : data.categories ? [data.categories] : [];
  const ids = (data.hugoblox && data.hugoblox.ids) || {};
  const [bibBusy, setBibBusy] = useState(false);
  const [bibMsg, setBibMsg] = useState('');
  const setCategory = (v) => {
    const rest = cats.slice(1);
    set(['categories'], v ? [v, ...rest] : rest.length ? rest : undefined);
  };
  const bibFromDoi = async () => {
    setBibBusy(true);
    setBibMsg('');
    try {
      const r = await api.get('/api/lookup/doi?doi=' + encodeURIComponent(ids.doi));
      if (r.bib) setBib(r.bib);
      else setBibMsg(t('doi_not_found'));
    } catch (e) {
      setBibMsg(errorText(t, e));
    } finally {
      setBibBusy(false);
    }
  };
  const showPublisher = ['chapter', 'book', 'report', 'thesis'].includes(type) || pub.publisher;

  return html`
    <${Section}>
      <${Field} label=${t('title')} wide>
        <${Area} rows="2" value=${data.title} onChange=${(v) => set(['title'], oneLine(v))} />
      <//>
      <${Field} label=${t('authors')} help=${t('authorsHelp')} wide group=${true}>
        <${AuthorsEditor} key=${version} authors=${data.authors} notes=${data.author_notes} withNotes=${true} meName=${meName}
          onChange=${(r) => { set(['authors'], r.authors); set(['author_notes'], r.author_notes); }} />
      <//>
      <${Field} label=${t('date')} help=${t('dateHelp')}>
        <input type="date" value=${dateInput(data.date)} onInput=${(e) => set(['date'], e.currentTarget.value)} />
      <//>
      <${Field} label=${t('pubType')}>
        <${Select} value=${type} options=${TYPES.map((v) => ({ value: v, label: t('type:' + v) }))}
          onChange=${(v) => set(['publication_types'], v ? [v] : undefined)} />
      <//>
      <${Field} label=${t('category')} help=${t('categoryHelp')}>
        <${Select} value=${cats[0] || ''} placeholder=${t('chooseOne')} onChange=${setCategory}
          options=${CATEGORIES.map((v) => ({ value: v, label: t('cat:' + v) }))} />
      <//>
      <${Field} help=${t('featuredHelp')}>
        <${Check} checked=${data.featured} label=${t('featured')} onChange=${(v) => set(['featured'], v)} />
      <//>
    <//>
    <${Section}>
      <${Field} label=${t('venue')} help=${t('venueHelp')} wide>
        <${Text} value=${pub.name} onChange=${(v) => set(['publication', 'name'], v)} />
      <//>
      <${Field} label=${t('volume')}><${Text} value=${pub.volume} onChange=${(v) => set(['publication', 'volume'], v)} /><//>
      <${Field} label=${t('issue')}><${Text} value=${pub.issue} onChange=${(v) => set(['publication', 'issue'], v)} /><//>
      <${Field} label=${t('pages')}><${Text} value=${pub.pages} placeholder="448–457" onChange=${(v) => set(['publication', 'pages'], v)} /><//>
      ${showPublisher && html`<${Field} label=${t('publisher')}>
        <${Text} value=${pub.publisher} onChange=${(v) => set(['publication', 'publisher'], v)} />
      <//>`}
    <//>
    <${Section}>
      <${Field} label=${t('doi')} help=${t('doiHelp')}>
        <${Text} value=${ids.doi} placeholder="10.xxxx/xxxxx" onChange=${(v) => set(['hugoblox', 'ids', 'doi'], v.trim())} />
      <//>
      <${Field} label=${t('arxiv')}>
        <${Text} value=${ids.arxiv} placeholder="2401.01234" onChange=${(v) => set(['hugoblox', 'ids', 'arxiv'], v.trim())} />
      <//>
      <${Field} label=${t('links')} help=${t('linksHelp')} wide group=${true}>
        <${LinksEditor} value=${data.links} types=${PUB_LINKS} onChange=${(v) => set(['links'], v)} />
      <//>
    <//>
    <${Section}>
      <${Field} label=${t('summary')} help=${t('summaryHelp')} wide>
        <${Area} rows="2" value=${data.summary} onChange=${(v) => set(['summary'], oneLine(v))} />
      <//>
      <${Field} label=${t('abstract')} help=${t('abstractHelp')} wide>
        <${Area} rows="6" value=${data.abstract} onChange=${(v) => set(['abstract'], v)} />
      <//>
      <${Field} label=${t('tags')} help=${t('tagsHelp')} wide>
        <${TagsInput} key=${version} value=${data.tags} onChange=${(v) => set(['tags'], v)} />
      <//>
      <${Field} label=${t('bib')} help=${t('bibHelp')} wide>
        <${Area} rows="5" mono=${true} value=${bib} onChange=${setBib} />
        <div class="row">
          <button type="button" disabled=${!ids.doi || bibBusy} onClick=${bibFromDoi}>${bibBusy ? t('fetching') : t('bibFromDoi')}</button>
          ${bibMsg && html`<span class="error-text">${bibMsg}</span>`}
        </div>
      <//>
    <//>`;
}
