// Local website editor. Start with `编辑网站.bat` in the repo root, or:
//   node editor/server.mjs --open
// Serves the editor UI on http://localhost:4313 and runs `hugo server` for the
// live preview. Only listens on localhost; nothing is committed or pushed.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import * as content from './lib/content.mjs';
import { lookupDoi, bibtexToData } from './lib/citation.mjs';
import * as git from './lib/git.mjs';

const { ROOT, HttpError } = content;
const PORT = Number(process.env.EDITOR_PORT) || 4313;
const HUGO_PORT = Number(process.env.HUGO_PORT) || 1313;
const UI = path.join(import.meta.dirname, 'ui');
const MODULES = path.join(import.meta.dirname, 'node_modules');
const VENDOR = {
  '/vendor/preact.js': 'preact/dist/preact.module.js',
  '/vendor/hooks.js': 'preact/hooks/dist/hooks.module.js',
  '/vendor/htm.js': 'htm/dist/htm.module.js',
};
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.pdf': 'application/pdf',
};

// ── Hugo live preview ───────────────────────────────────────────────────────

const preview = { url: null, ready: false, building: false, errors: [], external: false };
let hugo = null;

function portInUse(port) {
  return new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1');
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => resolve(false));
  });
}

function onHugoLine(line) {
  const url = line.match(/Web Server is available at (\S+)/);
  if (url) { preview.url = url[1]; preview.ready = true; console.log(`Preview: ${preview.url}`); }
  if (/Change detected/.test(line)) { preview.building = true; preview.errors = []; }
  if (/^Total in|Built in/.test(line.trim())) preview.building = false;
  if (/\bERROR\b|^Error:|Rebuild failed/.test(line)) {
    preview.building = false;
    preview.errors.push(line.replace(/^.*?ERROR\s*/, '').slice(0, 600));
    if (preview.errors.length > 20) preview.errors.shift();
    console.log('[hugo] ' + line);
  }
}

async function startHugo() {
  if (await portInUse(HUGO_PORT)) {
    Object.assign(preview, { url: `http://localhost:${HUGO_PORT}/`, ready: true, external: true });
    console.log(`Using the preview server that is already running at ${preview.url}`);
    return;
  }
  console.log('Starting the Hugo preview server ...');
  hugo = spawn('hugo', ['server', '--disableFastRender', '--port', String(HUGO_PORT)], { cwd: ROOT, windowsHide: true });
  let rest = '';
  const onData = (buf) => {
    const lines = (rest + buf.toString()).split(/\r?\n/);
    rest = lines.pop();
    lines.filter((l) => l.trim()).forEach(onHugoLine);
  };
  hugo.stdout.on('data', onData);
  hugo.stderr.on('data', onData);
  hugo.on('error', (e) => preview.errors.push(`Could not start Hugo: ${e.message}`));
  hugo.on('exit', (code) => {
    Object.assign(preview, { url: null, ready: false });
    preview.errors.push(`Hugo stopped (exit code ${code}).`);
    hugo = null;
  });
}

function stopHugo() {
  if (hugo) hugo.kill();
}
process.on('exit', stopHugo);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) process.on(sig, () => process.exit(0));

// ── HTTP helpers ────────────────────────────────────────────────────────────

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}
const json = (res, status, obj) => send(res, status, JSON.stringify(obj), 'application/json; charset=utf-8');

function serveFile(res, file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, 'Not found');
  send(res, 200, fs.readFileSync(file), MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
}

function readBody(req, limit = 60 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, 'File too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
const readJson = async (req) => JSON.parse((await readBody(req, 5 * 1024 * 1024)).toString('utf8') || '{}');

// Block other websites from talking to this server: the Host must be ours
// (DNS rebinding) and writes need a custom header (forces a CORS preflight).
function allowed(req) {
  const host = req.headers.host || '';
  if (host !== `localhost:${PORT}` && host !== `127.0.0.1:${PORT}`) return false;
  if (!['GET', 'HEAD'].includes(req.method) && req.headers['x-editor'] !== '1') return false;
  return true;
}

// ── Routes ──────────────────────────────────────────────────────────────────

const routes = [];
const route = (method, pattern, handler) => routes.push({ method, re: new RegExp(`^${pattern}$`), handler });

route('GET', '/api/meta', () => {
  const { data } = content.readProfile();
  return { name: data.name || {}, root: ROOT, collections: Object.keys(content.COLLECTIONS) };
});
route('GET', '/api/preview', () => preview);

route('GET', '/api/items/([a-z]+)', (req, [col]) => content.listItems(col));
route('POST', '/api/items/([a-z]+)', async (req, [col]) => {
  const { slug, data, body, bib } = await readJson(req);
  return content.createItem(col, slug, { data, body, bib });
});
route('GET', '/api/items/([a-z]+)/([a-z0-9-]+)', (req, [col, slug]) => content.readItem(col, slug));
route('PUT', '/api/items/([a-z]+)/([a-z0-9-]+)', async (req, [col, slug]) => content.saveItem(col, slug, await readJson(req)));
route('DELETE', '/api/items/([a-z]+)/([a-z0-9-]+)', (req, [col, slug]) => { content.trashItem(col, slug); return { ok: true }; });
route('PUT', '/api/items/([a-z]+)/([a-z0-9-]+)/files/([a-z]+)', async (req, [col, slug, kind], url) =>
  content.saveAttachment(col, slug, kind, await readBody(req), url.searchParams.get('ext')));
route('DELETE', '/api/items/([a-z]+)/([a-z0-9-]+)/files/([a-z]+)', (req, [col, slug, kind]) => content.removeAttachment(col, slug, kind));

route('GET', '/api/profile', () => content.readProfile());
route('PUT', '/api/profile', async (req) => content.saveProfile(await readJson(req)));
route('PUT', '/api/profile/avatar', async (req, _, url) => ({ avatar: content.saveAvatar(await readBody(req), url.searchParams.get('ext')) }));

route('GET', '/api/lookup/doi', (req, _, url) => lookupDoi(url.searchParams.get('doi'), content.readProfile().data));
route('POST', '/api/lookup/bibtex', async (req) => bibtexToData((await readJson(req)).text, content.readProfile().data));

route('GET', '/api/changes', () => git.changes());
route('GET', '/api/changes/diff', (req, _, url) => git.diff(url.searchParams.get('path')));
route('POST', '/api/changes/revert', async (req) => { await git.revert((await readJson(req)).path); return { ok: true }; });

async function handle(req, res) {
  if (!allowed(req)) return send(res, 403, 'Forbidden');
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;
  try {
    for (const r of routes) {
      const m = r.method === req.method && p.match(r.re);
      if (m) return json(res, r.method === 'POST' && p.startsWith('/api/items/') ? 201 : 200, await r.handler(req, m.slice(1), url));
    }
    if (req.method !== 'GET') return send(res, 404, 'Not found');

    const file = p.match(/^\/files\/item\/([a-z]+)\/([a-z0-9-]+)\/([^/]+)$/);
    if (file) return serveFile(res, content.bundleFile(file[1], file[2], decodeURIComponent(file[3])));
    if (p === '/files/avatar') return serveFile(res, content.avatarPath());
    if (VENDOR[p]) return serveFile(res, path.join(MODULES, VENDOR[p]));

    const name = p === '/' ? 'index.html' : p.slice(1);
    if (!/^[a-z0-9-]+\.(html|js|css|svg)$/.test(name)) return send(res, 404, 'Not found');
    return serveFile(res, path.join(UI, name));
  } catch (e) {
    const status = e.status || (e instanceof SyntaxError ? 400 : 500);
    if (status >= 500) console.error(e);
    return json(res, status, { error: e.message, code: e.code });
  }
}

function openBrowser(url) {
  const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

const server = http.createServer(handle);
const editorUrl = `http://localhost:${PORT}/`;
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log(`The editor is already running at ${editorUrl}`);
    if (process.argv.includes('--open')) openBrowser(editorUrl);
    process.exit(0);
  }
  throw e;
});
server.listen(PORT, '127.0.0.1', async () => {
  console.log(`Website editor: ${editorUrl}`);
  console.log('Keep this window open while editing. Close it (or press Ctrl+C) to stop.');
  await startHugo();
  if (process.argv.includes('--open')) openBrowser(editorUrl);
});
