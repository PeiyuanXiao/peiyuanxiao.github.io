// Editor for data/authors/me.yaml and the profile photo.
import { useState, useEffect } from '/vendor/hooks.js';
import { html, api, clone, setIn, errorText, fileExt } from './util.js';
import { t } from './i18n.js';
import { Field, Text, Area, ObjectList, StringList, FileSlot } from './fields.js';
import { Toolbar, Section, useSaveShortcut, useDirty } from './shell.js';

const ICONS = ['at-symbol', 'brands/github', 'academicons/orcid', 'academicons/researchgate', 'academicons/osf',
  'academicons/google-scholar', 'brands/x', 'brands/linkedin', 'brands/bluesky', 'academicons/cv'];

function normalizeProfile(data) {
  const keep = (list, test) => (Array.isArray(list) ? list.filter(test) : list);
  data.interests = keep(data.interests, (s) => String(s || '').trim());
  data.affiliations = keep(data.affiliations, (a) => String(a.name || '').trim());
  data.links = keep(data.links, (l) => String(l.url || '').trim());
  data.education = keep(data.education, (e) => String(e.degree || e.institution || '').trim());
  return data;
}

export function ProfileEditor({ ctx }) {
  const [item, setItem] = useState(null);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [stamp, setStamp] = useState(Date.now());

  const load = async () => {
    setLoadError('');
    try {
      const p = await api.get('/api/profile');
      setItem(p);
      setDraft(clone(p.data));
    } catch (e) {
      setLoadError(errorText(t, e));
    }
  };
  useEffect(() => { load(); ctx.setPreviewPath(''); }, []);

  const dirty = !!(item && draft && JSON.stringify(draft) !== JSON.stringify(item.data));
  useDirty(ctx, dirty);
  const set = (path, value) => setDraft((s) => setIn(s, path, value));

  const save = async () => {
    if (!draft || busy) return;
    if (!dirty) return ctx.notify(t('noChanges'));
    setBusy(true);
    try {
      const r = await api.put('/api/profile', { data: normalizeProfile(clone(draft)), baseHash: item.hash });
      ctx.notify(r.changed ? t('saved') : t('noChanges'));
      await load();
      ctx.onSaved();
    } catch (e) {
      ctx.notify(errorText(t, e), 'error');
    } finally {
      setBusy(false);
    }
  };
  useSaveShortcut(save);

  const uploadAvatar = async (file) => {
    try {
      const r = await api.upload(`/api/profile/avatar?ext=${encodeURIComponent(fileExt(file))}`, file);
      setItem((p) => ({ ...p, avatar: r.avatar }));
      setStamp(Date.now());
      ctx.notify(t('saved'));
      ctx.onSaved();
    } catch (e) {
      ctx.notify(errorText(t, e), 'error');
    }
  };

  if (loadError) return html`<div class="pane-msg"><p class="error-text">${loadError}</p><button type="button" onClick=${load}>${t('reloadItem')}</button></div>`;
  if (!draft) return html`<div class="pane-msg muted">${t('loading')}</div>`;

  const name = draft.name || {};
  const actions = [
    { label: busy ? t('saving') : t('save'), kind: 'primary', onClick: save, disabled: busy },
    dirty && { label: t('discard'), onClick: () => confirm(t('confirmDiscard')) && setDraft(clone(item.data)) },
  ];
  return html`<div class="editor">
    <${Toolbar} title=${t('profile')} subtitle="data/authors/me.yaml" dirty=${dirty} actions=${actions} />
    <div class="editor-body">
      <${Section}>
        <${Field} label=${t('displayName')}><${Text} value=${name.display} onChange=${(v) => set(['name', 'display'], v)} /><//>
        <${Field} label=${t('givenName')}><${Text} value=${name.given} onChange=${(v) => set(['name', 'given'], v)} /><//>
        <${Field} label=${t('familyName')}><${Text} value=${name.family} onChange=${(v) => set(['name', 'family'], v)} /><//>
        <${Field} label=${t('altName')}><${Text} value=${name.alternate} onChange=${(v) => set(['name', 'alternate'], v)} /><//>
        <${Field} label=${t('role')}><${Text} value=${draft.role} onChange=${(v) => set(['role'], v)} /><//>
        <${Field} label=${t('pronouns')}><${Text} value=${name.pronouns} onChange=${(v) => set(['name', 'pronouns'], v)} /><//>
        <${Field} label=${t('statusIcon')}><${Text} value=${draft.status && draft.status.icon} onChange=${(v) => set(['status', 'icon'], v)} /><//>
        <${FileSlot} label=${t('avatar')} help=${t('avatarHelp')} accept="image/*" image=${true}
          url=${item.avatar && `/files/avatar?v=${stamp}`} name=${item.avatar} onUpload=${uploadAvatar} />
      <//>
      <${Section}>
        <${Field} label=${t('bio')} help=${t('bioHelp')} wide>
          <${Area} rows="14" value=${draft.bio} onChange=${(v) => set(['bio'], v)} />
        <//>
      <//>
      <${Section} title=${t('affiliations')}>
        <${Field} wide>
          <${ObjectList} value=${draft.affiliations} onChange=${(v) => set(['affiliations'], v)} addLabel=${t('addItem')}
            fields=${[{ key: 'name', label: t('orgName'), flex: 2 }, { key: 'url', label: t('url'), flex: 2, placeholder: 'https://…' }]} />
        <//>
      <//>
      <${Section} title=${t('interests')}>
        <${Field} wide><${StringList} value=${draft.interests} onChange=${(v) => set(['interests'], v)} addLabel=${t('addItem')} /><//>
      <//>
      <${Section} title=${t('profileLinks')}>
        <${Field} wide>
          <datalist id="icon-list">${ICONS.map((i) => html`<option value=${i}>${t('icon:' + i)}</option>`)}</datalist>
          <${ObjectList} value=${draft.links} onChange=${(v) => set(['links'], v)} addLabel=${t('addItem')}
            fields=${[{ key: 'icon', label: t('icon'), list: 'icon-list' }, { key: 'url', label: t('url'), flex: 2 },
              { key: 'label', label: t('label') }]} />
        <//>
      <//>
      <${Section} title=${t('education')}>
        <${Field} wide>
          <${ObjectList} value=${draft.education} onChange=${(v) => set(['education'], v)} addLabel=${t('addItem')}
            fields=${[{ key: 'degree', label: t('degree'), flex: 2 }, { key: 'institution', label: t('institution'), flex: 3 },
              { key: 'year', label: t('yearText') }, { key: 'start', label: t('start') }, { key: 'end', label: t('end') }]} />
        <//>
      <//>
    </div>
  </div>`;
}
