// Review uncommitted changes. Nothing is committed or pushed from here.
import { useState, useEffect } from '/vendor/hooks.js';
import { html, api, errorText } from './util.js';
import { t } from './i18n.js';
import { Toolbar } from './shell.js';

function DiffView({ diff }) {
  if (diff.binary) return html`<p class="muted">${t('binary')}</p>`;
  return html`<pre class="diff">${diff.diff.split('\n').map((l) => html`<div class=${
    l.startsWith('+') ? 'add' : l.startsWith('-') ? 'del' : l.startsWith('@@') ? 'hunk' : ''}>${l || ' '}</div>`)}</pre>`;
}

function PublishBox({ root }) {
  const [msg, setMsg] = useState('Update website content');
  const [copied, setCopied] = useState(false);
  const commands = [`cd "${root}"`, 'git add -A', `git commit -m "${msg.replace(/"/g, "'")}"`, 'git push'];
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(commands.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked; the text can still be selected */ }
  };
  return html`<section class="section publish">
    <h3>${t('publishTitle')}</h3>
    <p class="help">${t('publishHelp')}</p>
    <label class="mini"><span>${t('commitMsg')}</span><input value=${msg} onInput=${(e) => setMsg(e.currentTarget.value)} /></label>
    <pre class="commands">${commands.join('\n')}</pre>
    <div class="row"><button type="button" onClick=${copy}>${copied ? t('copied') : t('copy')}</button></div>
    <p class="help">${t('publishNote')}</p>
  </section>`;
}

export function ChangesView({ ctx }) {
  const [list, setList] = useState(null);
  const [sel, setSel] = useState(null);
  const [diff, setDiff] = useState(null);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      setList(await api.get('/api/changes'));
      setError('');
    } catch (e) {
      setError(errorText(t, e));
    }
  };
  useEffect(() => { load(); }, []);

  const open = async (c) => {
    setSel(c.path);
    setDiff(null);
    try {
      setDiff(await api.get('/api/changes/diff?path=' + encodeURIComponent(c.path)));
      if (c.collection === 'publications' || c.collection === 'events') ctx.setPreviewPath(`${c.collection}/${c.slug}/`);
      else if (c.collection === 'profile') ctx.setPreviewPath('');
    } catch (e) {
      ctx.notify(errorText(t, e), 'error');
    }
  };

  const revert = async (c) => {
    if (!confirm(c.status === 'added' ? t('confirmRevertNew') : t('confirmRevert'))) return;
    try {
      await api.post('/api/changes/revert', { path: c.path });
      ctx.notify(t('reverted'));
      setSel(null);
      setDiff(null);
      await load();
      ctx.onSaved();
    } catch (e) {
      ctx.notify(errorText(t, e), 'error');
    }
  };

  const label = (c) => (c.collection === 'publications' || c.collection === 'events'
    ? `${t(c.collection)} · ${c.slug}` : c.collection === 'profile' ? t('profile') : t('other'));

  return html`<div class="editor">
    <${Toolbar} title=${t('changes')} actions=${[{ label: t('reload'), onClick: load }]} />
    <div class="editor-body">
      <p class="help">${t('changesIntro')}</p>
      ${error && html`<p class="error-text">${error}</p>`}
      ${list && !list.length && html`<p class="empty">${t('noPending')}</p>`}
      ${list && list.length > 0 && html`<div class="changes">
        <ul class="change-list">
          ${list.map((c) => html`<li class=${sel === c.path ? 'active' : ''} onClick=${() => open(c)}>
            <span class=${'badge ' + c.status}>${t('status:' + c.status)}</span>
            <span class="change-name"><b>${label(c)}</b><br /><span class="muted small">${c.file}</span></span>
          </li>`)}
        </ul>
        <div class="change-diff">
          ${!sel && html`<p class="muted">${t('pickFile')}</p>`}
          ${sel && diff && html`<div>
            <div class="row"><code class="small">${diff.path}</code><span class="spacer"></span>
              <button type="button" class="danger" onClick=${() => revert(diff)}>${t('revert')}</button></div>
            <${DiffView} diff=${diff} />
          </div>`}
        </div>
      </div>`}
      <${PublishBox} root=${ctx.root} />
    </div>
  </div>`;
}
