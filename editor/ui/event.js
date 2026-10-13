// Talk (event) fields and data clean-up.
import { html, clone, slugify, uniqueSlug, year } from './util.js';
import { t } from './i18n.js';
import { Field, Text, Area, Check, AuthorsEditor, LinksEditor, TagsInput, dateInput, toLocalInput, fromLocalInput } from './fields.js';
import { Section } from './shell.js';

const EVENT_LINKS = ['slides', 'video', 'poster', 'pdf', 'code', 'event', 'site'];

export const blankEvent = () => ({ authors: ['me'], event_all_day: false });

export function normalizeEvent(data) {
  if (!data.date && data.event_start) data.date = String(data.event_start).slice(0, 10);
  if (Array.isArray(data.links)) {
    data.links = data.links.filter((l) => String(l.url || '').trim());
    if (!data.links.length) data.links = undefined;
  }
  if (typeof data.title === 'string') data.title = data.title.trim();
  return data;
}

export function eventTemplate(data) {
  const d = clone(data);
  for (const k of ['title', 'summary', 'abstract', 'links', 'featured']) delete d[k];
  return d;
}

// "Society for American Archaeology (SAA) 91st Annual Meeting" -> "saa-2026"
export function suggestEventSlug(data, taken) {
  const name = String(data.event_name || '');
  const acronym = (name.match(/\(([A-Za-z][A-Za-z-]{1,12})\)/) || [])[1];
  const words = slugify(name || data.title, 3);
  const base = acronym ? acronym.toLowerCase() : /[a-z]/.test(words) ? words : '';
  const y = year(data.date || data.event_start);
  return uniqueSlug([base || 'talk', y].filter(Boolean).join('-'), taken);
}

const oneLine = (v) => v.replace(/[\r\n]+/g, ' ');

export function EventFields({ data, set, version, meName }) {
  const addr = data.address || {};
  return html`
    <${Section}>
      <${Field} label=${t('talkTitle')} wide>
        <${Area} rows="2" value=${data.title} onChange=${(v) => set(['title'], oneLine(v))} />
      <//>
      <${Field} label=${t('eventName')} wide>
        <${Text} value=${data.event_name} onChange=${(v) => set(['event_name'], v)} />
      <//>
      <${Field} label=${t('eventUrl')} wide>
        <${Text} value=${data.event_url} placeholder="https://…" onChange=${(v) => set(['event_url'], v.trim())} />
      <//>
      <${Field} label=${t('location')} wide>
        <${Text} value=${data.location} placeholder=${t('locationPh')} onChange=${(v) => set(['location'], v)} />
      <//>
      <${Field} label=${t('city')}><${Text} value=${addr.city} onChange=${(v) => set(['address', 'city'], v)} /><//>
      <${Field} label=${t('region')}><${Text} value=${addr.region} onChange=${(v) => set(['address', 'region'], v)} /><//>
      <${Field} label=${t('country')}><${Text} value=${addr.country} onChange=${(v) => set(['address', 'country'], v)} /><//>
    <//>
    <${Section}>
      <${Field} label=${t('talkDate')} help=${t('talkDateHelp')}>
        <input type="date" value=${dateInput(data.date)} onInput=${(e) => set(['date'], e.currentTarget.value)} />
      <//>
      <${Field} label=${t('eventStart')}>
        <input type="datetime-local" value=${toLocalInput(data.event_start)}
          onInput=${(e) => set(['event_start'], fromLocalInput(e.currentTarget.value, data.event_start))} />
      <//>
      <${Field} label=${t('eventEnd')}>
        <input type="datetime-local" value=${toLocalInput(data.event_end)}
          onInput=${(e) => set(['event_end'], fromLocalInput(e.currentTarget.value, data.event_end || data.event_start))} />
      <//>
      <${Field}>
        <${Check} checked=${data.event_all_day} label=${t('allDay')} onChange=${(v) => set(['event_all_day'], v)} />
        <${Check} checked=${data.featured} label=${t('featuredTalk')} onChange=${(v) => set(['featured'], v)} />
      <//>
      <${Field} label=${t('speakers')} wide group=${true}>
        <${AuthorsEditor} key=${version} authors=${data.authors} withNotes=${false} meName=${meName}
          onChange=${(r) => set(['authors'], r.authors)} />
      <//>
    <//>
    <${Section}>
      <${Field} label=${t('summary')} help=${t('summaryHelp')} wide>
        <${Area} rows="2" value=${data.summary} onChange=${(v) => set(['summary'], oneLine(v))} />
      <//>
      <${Field} label=${t('abstract')} help=${t('abstractHelp')} wide>
        <${Area} rows="5" value=${data.abstract} onChange=${(v) => set(['abstract'], v)} />
      <//>
      <${Field} label=${t('tags')} help=${t('tagsHelp')} wide>
        <${TagsInput} key=${version} value=${data.tags} onChange=${(v) => set(['tags'], v)} />
      <//>
      <${Field} label=${t('links')} wide group=${true}>
        <${LinksEditor} value=${data.links} types=${EVENT_LINKS} onChange=${(v) => set(['links'], v)} />
      <//>
    <//>`;
}
