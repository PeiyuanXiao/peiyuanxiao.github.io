// Reading and writing the site's content: publication and talk bundles
// (content/<collection>/<slug>/index.md + attachments) and the author profile.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { splitMarkdown, joinMarkdown, splitYaml, joinYaml, parseData, updateYaml, createYaml } from './yamlfile.mjs';

export const ROOT = path.resolve(import.meta.dirname, '../..');
const TRASH = path.join(ROOT, 'editor', '.trash');
const NEW_EOL = process.platform === 'win32' ? '\r\n' : '\n';

export const COLLECTIONS = {
  publications: {
    dir: 'content/publications',
    order: ['title', 'authors', 'author_notes', 'date', 'publication_types', 'categories', 'publication',
      'featured', 'summary', 'abstract', 'tags', 'hugoblox', 'links'],
  },
  events: {
    dir: 'content/events',
    order: ['title', 'date', 'event_name', 'event_url', 'location', 'address', 'summary', 'abstract',
      'event_start', 'event_end', 'event_all_day', 'authors', 'tags', 'featured', 'links'],
  },
};
const PROFILE = 'data/authors/me.yaml';
const AVATAR_DIR = 'assets/media/authors';
const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif'];

export class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

const sha1 = (buf) => crypto.createHash('sha1').update(buf).digest('hex');
const isImage = (name) => IMAGE_EXT.includes(path.extname(name).slice(1).toLowerCase());

function collection(col) {
  const c = COLLECTIONS[col];
  if (!c) throw new HttpError(404, `Unknown collection: ${col}`);
  return c;
}

export function validSlug(slug) {
  return typeof slug === 'string' && /^[a-z0-9][a-z0-9-]{0,79}$/.test(slug);
}

function bundleDir(col, slug) {
  if (!validSlug(slug)) throw new HttpError(400, `Invalid folder name: ${slug}`);
  return path.join(ROOT, collection(col).dir, slug);
}

// Deleted or replaced files go to editor/.trash instead of disappearing.
export function toTrash(p, label) {
  if (!fs.existsSync(p)) return;
  fs.mkdirSync(TRASH, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.renameSync(p, path.join(TRASH, `${stamp}_${label}`));
}

function featuredImage(dir) {
  if (!fs.existsSync(dir)) return null;
  return fs.readdirSync(dir).find((f) => /featured/i.test(f) && isImage(f)) || null;
}

// ── Bundles ─────────────────────────────────────────────────────────────────

export function listItems(col) {
  const base = path.join(ROOT, collection(col).dir);
  const items = [];
  for (const slug of fs.readdirSync(base)) {
    const file = path.join(base, slug, 'index.md');
    if (!fs.existsSync(file)) continue;
    try {
      const { data } = parseData(splitMarkdown(fs.readFileSync(file, 'utf8')).yaml);
      items.push({
        slug,
        title: data.title || slug,
        date: String(data.date || ''),
        featured: !!data.featured,
        category: Array.isArray(data.categories) ? data.categories[0] : data.categories || '',
        venue: data.publication?.name || data.event_name || '',
        image: featuredImage(path.join(base, slug)),
      });
    } catch (e) {
      items.push({ slug, title: slug, date: '', error: e.message });
    }
  }
  return items.sort((a, b) => b.date.localeCompare(a.date));
}

export function readItem(col, slug) {
  const dir = bundleDir(col, slug);
  const file = path.join(dir, 'index.md');
  if (!fs.existsSync(file)) throw new HttpError(404, `Not found: ${slug}`);
  const buf = fs.readFileSync(file);
  const parts = splitMarkdown(buf.toString('utf8'));
  const { data } = parseData(parts.yaml);
  const bibFile = path.join(dir, 'cite.bib');
  return {
    slug,
    data,
    body: parts.body,
    hash: sha1(buf),
    files: {
      image: featuredImage(dir),
      pdf: fs.existsSync(path.join(dir, `${slug}.pdf`)) ? `${slug}.pdf` : null,
    },
    bib: fs.existsSync(bibFile) ? fs.readFileSync(bibFile, 'utf8') : '',
  };
}

function writeBib(dir, slug, bib) {
  if (bib === undefined) return false;
  const file = path.join(dir, 'cite.bib');
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (current.replace(/\r\n/g, '\n').trim() === bib.replace(/\r\n/g, '\n').trim()) return false;
  if (!bib.trim()) {
    toTrash(file, `${slug}_cite.bib`);
  } else {
    fs.writeFileSync(file, bib.replace(/\r\n/g, '\n').trim().replace(/\n/g, NEW_EOL) + NEW_EOL);
  }
  return true;
}

export function saveItem(col, slug, { data, body, baseHash, bib }) {
  const dir = bundleDir(col, slug);
  const file = path.join(dir, 'index.md');
  if (!fs.existsSync(file)) throw new HttpError(404, `Not found: ${slug}`);
  const buf = fs.readFileSync(file);
  if (baseHash && sha1(buf) !== baseHash) {
    throw new HttpError(409, 'The file was changed outside the editor. Reload it before saving.');
  }
  const parts = splitMarkdown(buf.toString('utf8'));
  const yaml = updateYaml(parts.yaml, data);
  const newBody = body === undefined ? parts.body : body;
  let changed = false;
  let hash = sha1(buf);
  if (yaml !== parts.yaml || newBody !== parts.body) {
    const out = Buffer.from(joinMarkdown({ ...parts, yaml, body: newBody }), 'utf8');
    fs.writeFileSync(file, out);
    hash = sha1(out);
    changed = true;
  }
  if (writeBib(dir, slug, bib)) changed = true;
  return { hash, changed };
}

export function createItem(col, slug, { data, body = '', bib }) {
  const dir = bundleDir(col, slug);
  if (fs.existsSync(dir)) throw new HttpError(409, `A folder named "${slug}" already exists.`);
  const yaml = createYaml(data, collection(col).order);
  const text = body.trim() ? `\n${body.trim()}\n` : '';
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.md'), joinMarkdown({ eol: NEW_EOL, yaml, body: text }));
  writeBib(dir, slug, bib);
  return readItem(col, slug);
}

export function trashItem(col, slug) {
  const dir = bundleDir(col, slug);
  if (!fs.existsSync(dir)) throw new HttpError(404, `Not found: ${slug}`);
  toTrash(dir, `${col}_${slug}`);
}

export function saveAttachment(col, slug, kind, buf, ext) {
  const dir = bundleDir(col, slug);
  if (!fs.existsSync(dir)) throw new HttpError(404, `Not found: ${slug}`);
  ext = String(ext || '').toLowerCase().replace(/^\./, '');
  if (kind === 'image') {
    if (!IMAGE_EXT.includes(ext)) throw new HttpError(400, `Unsupported image type: .${ext}`);
    const old = featuredImage(dir);
    if (old) toTrash(path.join(dir, old), `${slug}_${old}`);
    fs.writeFileSync(path.join(dir, `featured.${ext === 'jpeg' ? 'jpg' : ext}`), buf);
  } else if (kind === 'pdf') {
    if (ext !== 'pdf') throw new HttpError(400, 'Please choose a PDF file.');
    toTrash(path.join(dir, `${slug}.pdf`), `${slug}.pdf`);
    fs.writeFileSync(path.join(dir, `${slug}.pdf`), buf);
  } else {
    throw new HttpError(400, `Unknown attachment: ${kind}`);
  }
  return readItem(col, slug).files;
}

export function removeAttachment(col, slug, kind) {
  const dir = bundleDir(col, slug);
  const name = kind === 'image' ? featuredImage(dir) : kind === 'pdf' ? `${slug}.pdf` : null;
  if (name) toTrash(path.join(dir, name), `${slug}_${name}`);
  return readItem(col, slug).files;
}

// Absolute path of a file inside a bundle (for thumbnails / opening PDFs).
export function bundleFile(col, slug, name) {
  if (!/^[\w.-]+$/.test(name) || name.startsWith('.')) throw new HttpError(400, 'Bad file name');
  const file = path.join(bundleDir(col, slug), name);
  if (!fs.existsSync(file)) throw new HttpError(404, 'Not found');
  return file;
}

// ── Profile ─────────────────────────────────────────────────────────────────

function avatarFile() {
  const dir = path.join(ROOT, AVATAR_DIR);
  if (!fs.existsSync(dir)) return null;
  const name = fs.readdirSync(dir).find((f) => /^me\./i.test(f) && isImage(f));
  return name ? path.join(dir, name) : null;
}

export function readProfile() {
  const buf = fs.readFileSync(path.join(ROOT, PROFILE));
  const { data } = parseData(splitYaml(buf.toString('utf8')).yaml);
  const avatar = avatarFile();
  return { data, hash: sha1(buf), avatar: avatar ? path.basename(avatar) : null };
}

export function saveProfile({ data, baseHash }) {
  const file = path.join(ROOT, PROFILE);
  const buf = fs.readFileSync(file);
  if (baseHash && sha1(buf) !== baseHash) {
    throw new HttpError(409, 'The file was changed outside the editor. Reload it before saving.');
  }
  const parts = splitYaml(buf.toString('utf8'));
  const yaml = updateYaml(parts.yaml, data);
  if (yaml === parts.yaml) return { hash: sha1(buf), changed: false };
  const out = Buffer.from(joinYaml({ ...parts, yaml }), 'utf8');
  fs.writeFileSync(file, out);
  return { hash: sha1(out), changed: true };
}

export function saveAvatar(buf, ext) {
  ext = String(ext || '').toLowerCase().replace(/^\./, '');
  if (!IMAGE_EXT.includes(ext)) throw new HttpError(400, `Unsupported image type: .${ext}`);
  const old = avatarFile();
  if (old) toTrash(old, `avatar_${path.basename(old)}`);
  fs.mkdirSync(path.join(ROOT, AVATAR_DIR), { recursive: true });
  fs.writeFileSync(path.join(ROOT, AVATAR_DIR, `me.${ext === 'jpeg' ? 'jpg' : ext}`), buf);
  return readProfile().avatar;
}

export function avatarPath() {
  const f = avatarFile();
  if (!f) throw new HttpError(404, 'No avatar');
  return f;
}
