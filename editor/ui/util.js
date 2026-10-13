// API client and small data helpers shared by the views.
import { h } from '/vendor/preact.js';
import htm from '/vendor/htm.js';

export const html = htm.bind(h);

async function request(method, url, { json, raw } = {}) {
  const opts = { method, headers: { 'x-editor': '1' } };
  if (raw !== undefined) opts.body = raw;
  else if (json !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(json);
  }
  let res;
  try {
    res = await fetch(url, opts);
  } catch {
    const err = new Error('network');
    err.code = 'network';
    throw err;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || res.statusText);
    err.code = data.code;
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, json) => request('POST', url, { json }),
  put: (url, json) => request('PUT', url, { json }),
  del: (url) => request('DELETE', url),
  upload: (url, file) => request('PUT', url, { raw: file }),
};

export const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

export function getIn(obj, path) {
  return path.reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

// Immutable set: returns a copy of obj with path set to value.
export function setIn(obj, path, value) {
  if (!path.length) return value;
  const [k, ...rest] = path;
  const base = obj == null ? (typeof k === 'number' ? [] : {}) : Array.isArray(obj) ? [...obj] : { ...obj };
  base[k] = setIn(base[k], rest, value);
  return base;
}

export const fileExt = (file) => (file.name.split('.').pop() || '').toLowerCase();

const STOP = new Set(['a', 'an', 'the', 'of', 'in', 'on', 'for', 'and', 'to', 'from', 'with', 'at', 'by', 'its', 'as', 'new']);

export function slugify(text, maxWords = 5) {
  const words = String(text || '')
    .normalize('NFD')
    .replace(/[^A-Za-z0-9 ]+/g, ' ')
    .toLowerCase()
    .split(/ +/)
    .filter((w) => w && !STOP.has(w));
  return words.slice(0, maxWords).join('-').slice(0, 60).replace(/-+$/, '');
}

// Make a folder name unique among existing ones.
export function uniqueSlug(base, taken) {
  if (!base) return '';
  let s = base;
  for (let i = 2; taken.includes(s); i++) s = `${base}-${i}`;
  return s;
}

export const year = (date) => String(date || '').slice(0, 4);

export function errorText(t, e) {
  if (e.code === 'network') return t('networkError');
  if (e.status === 409 && /changed outside/.test(e.message)) return t('conflict');
  if (e.code && t(e.code) !== e.code) return t(e.code);
  return t('error') + e.message;
}
