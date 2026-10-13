// Read-only view of uncommitted content changes, plus per-file revert.
// Committing and pushing is left to the user.
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ROOT, HttpError, toTrash } from './content.mjs';

const run = promisify(execFile);
const SCOPE = ['content', 'data', 'assets/media'];
const TEXT_EXT = ['.md', '.yaml', '.yml', '.bib', '.txt', '.toml', '.json'];

async function git(args) {
  const { stdout } = await run('git', ['-c', 'core.quotepath=off', ...args], {
    cwd: ROOT, maxBuffer: 32 * 1024 * 1024, windowsHide: true,
  });
  return stdout;
}

// Which editor item a changed file belongs to.
function describe(p) {
  const m = p.match(/^content\/(publications|events)\/([^/]+)\/(.+)$/);
  if (m) return { collection: m[1], slug: m[2], file: m[3] };
  if (p === 'data/authors/me.yaml') return { collection: 'profile', file: 'me.yaml' };
  if (p.startsWith('assets/media/authors/')) return { collection: 'profile', file: path.basename(p) };
  return { collection: 'other', file: p };
}

export async function changes() {
  const out = await git(['status', '--porcelain=v1', '-uall', '--', ...SCOPE]);
  return out.split('\n').filter(Boolean).map((line) => {
    const code = line.slice(0, 2);
    let p = line.slice(3);
    if (p.includes(' -> ')) p = p.split(' -> ')[1];
    p = p.replace(/^"|"$/g, '');
    const status = code === '??' || code.includes('A') ? 'added' : code.includes('D') ? 'deleted' : 'modified';
    return { path: p, status, ...describe(p) };
  });
}

async function find(p) {
  const entry = (await changes()).find((c) => c.path === p);
  if (!entry) throw new HttpError(404, 'This file has no uncommitted changes.');
  return entry;
}

export async function diff(p) {
  const entry = await find(p);
  const abs = path.join(ROOT, entry.path);
  const isText = TEXT_EXT.includes(path.extname(entry.path).toLowerCase());
  if (entry.status === 'added') {
    if (!isText) return { ...entry, binary: true, diff: '' };
    const lines = fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
    return { ...entry, diff: lines.map((l) => '+' + l).join('\n') };
  }
  if (!isText) return { ...entry, binary: true, diff: '' };
  const out = await git(['diff', '--no-color', '--no-ext-diff', 'HEAD', '--', entry.path]);
  // Drop the technical header lines; keep hunks.
  const body = out.replace(/\r\n/g, '\n').split('\n').filter((l) => !/^(diff --git|index |--- |\+\+\+ |old mode|new mode|\\ No newline)/.test(l));
  return { ...entry, diff: body.join('\n').trim() };
}

export async function revert(p) {
  const entry = await find(p);
  if (entry.status === 'added') {
    const abs = path.join(ROOT, entry.path);
    toTrash(abs, `reverted_${entry.path.replace(/[\\/]/g, '_')}`);
    const dir = path.dirname(abs);
    if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
  } else {
    await git(['restore', '--source=HEAD', '--staged', '--worktree', '--', entry.path]);
  }
}
