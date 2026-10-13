// Turn a DOI or a BibTeX entry into publication front matter.
import { HttpError } from './content.mjs';

const TYPES = {
  'journal-article': 'article-journal', 'article-journal': 'article-journal', article: 'article-journal',
  'proceedings-article': 'paper-conference', 'paper-conference': 'paper-conference',
  inproceedings: 'paper-conference', conference: 'paper-conference',
  'book-chapter': 'chapter', chapter: 'chapter', incollection: 'chapter', inbook: 'chapter',
  book: 'book', monograph: 'book', 'edited-book': 'book',
  dissertation: 'thesis', thesis: 'thesis', phdthesis: 'thesis', mastersthesis: 'thesis',
  report: 'report', techreport: 'report',
  'posted-content': 'manuscript', manuscript: 'manuscript', unpublished: 'manuscript', misc: 'manuscript',
};

const pad = (n) => String(n).padStart(2, '0');
const num = (v) => (/^\d+$/.test(String(v ?? '').trim()) ? Number(v) : v || undefined);
const dash = (p) => (p ? String(p).replace(/(\w)\s*-{1,3}\s*(\w)/g, '$1–$2') : undefined);
const first = (v) => (Array.isArray(v) ? v[0] : v);
const stripTags = (s) => String(s || '')
  .replace(/<jats:title>[\s\S]*?<\/jats:title>/g, '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export function normalizeDoi(input) {
  const m = String(input || '').trim().match(/10\.\d{4,9}\/\S+/);
  return m ? m[0].replace(/[.,;]+$/, '') : null;
}

// Replace the profile owner in an author list with `me`.
export function markMe(authors, profile) {
  const name = profile?.name || {};
  const norm = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z\u3400-\u9fff]/g, '');
  const given = name.given || '';
  const family = name.family || '';
  const full = new Set([given + family, family + given, name.display, name.alternate].filter(Boolean).map(norm));
  let idx = authors.findIndex((a) => full.has(norm(a)));
  if (idx < 0 && given && family) {
    // Initials such as "P. Xiao" or "Xiao P.-Y."
    const fam = norm(family);
    const ini = norm(given)[0];
    idx = authors.findIndex((a) => {
      const parts = a.split(/[\s,.-]+/).filter(Boolean).map(norm);
      return parts.includes(fam) && parts.some((p) => p !== fam && p.length <= 2 && p[0] === ini);
    });
  }
  return idx < 0 ? authors : authors.map((a, i) => (i === idx ? 'me' : a));
}

// ── DOI ─────────────────────────────────────────────────────────────────────

async function fetchText(url, accept) {
  const res = await fetch(url, {
    headers: { Accept: accept, 'User-Agent': 'academic-cv-editor/1.0' },
    redirect: 'follow',
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function cslDate(csl) {
  for (const k of ['issued', 'published-print', 'published-online', 'published', 'created']) {
    const parts = csl[k]?.['date-parts']?.[0];
    if (parts && parts[0]) return `${parts[0]}-${pad(parts[1] || 1)}-${pad(parts[2] || 1)}`;
  }
  return '';
}

function cslToData(csl, doi) {
  const type = TYPES[csl.type] || 'article-journal';
  const authors = (csl.author || csl.editor || [])
    .map((a) => a.literal || [a.given, a.family].filter(Boolean).join(' '))
    .filter(Boolean);
  return {
    title: stripTags(first(csl.title)),
    authors,
    date: cslDate(csl),
    publication_types: [type],
    publication: {
      name: stripTags(first(csl['container-title'])),
      volume: num(csl.volume),
      issue: num(csl.issue),
      pages: dash(csl.page) || csl['article-number'],
      publisher: ['chapter', 'book', 'report', 'thesis'].includes(type) ? csl.publisher : undefined,
    },
    abstract: stripTags(csl.abstract) || undefined,
    hugoblox: { ids: { doi } },
  };
}

export async function lookupDoi(input, profile) {
  const doi = normalizeDoi(input);
  if (!doi) throw new HttpError(400, 'Not a valid DOI', 'doi_invalid');
  const path = doi.split('/').map(encodeURIComponent).join('/');
  let csl;
  try {
    csl = JSON.parse(await fetchText(`https://doi.org/${path}`, 'application/vnd.citationstyles.csl+json'));
  } catch {
    try {
      csl = JSON.parse(await fetchText(`https://api.crossref.org/works/${path}`, 'application/json')).message;
    } catch {
      throw new HttpError(404, `No metadata found for DOI ${doi}`, 'doi_not_found');
    }
  }
  let bib = '';
  try {
    bib = formatBib(parseBibtex(await fetchText(`https://doi.org/${path}`, 'application/x-bibtex')));
  } catch { /* citation file is optional */ }
  const data = cslToData(csl, doi);
  data.authors = markMe(data.authors, profile);
  return { data, bib };
}

// ── BibTeX ──────────────────────────────────────────────────────────────────

export function parseBibtex(src) {
  src = String(src || '');
  const head = /@(\w+)\s*[{(]\s*([^,\s]*)\s*,?/g;
  let m;
  do { m = head.exec(src); } while (m && ['comment', 'preamble', 'string'].includes(m[1].toLowerCase()));
  if (!m) throw new HttpError(400, 'No BibTeX entry found', 'bib_invalid');
  let i = head.lastIndex;
  const fields = [];
  const skip = (re) => { while (i < src.length && re.test(src[i])) i++; };
  while (i < src.length) {
    skip(/[\s,]/);
    if (i >= src.length || src[i] === '}' || src[i] === ')') break;
    const nameRe = /[A-Za-z][\w:-]*/y;
    nameRe.lastIndex = i;
    const name = nameRe.exec(src);
    if (!name) break;
    i = nameRe.lastIndex;
    skip(/\s/);
    if (src[i] !== '=') break;
    i++;
    skip(/\s/);
    const start = i;
    for (;;) {
      if (src[i] === '{') {
        let depth = 0;
        do {
          if (src[i] === '{') depth++;
          else if (src[i] === '}') depth--;
          i++;
        } while (depth > 0 && i < src.length);
      } else if (src[i] === '"') {
        i++;
        let depth = 0;
        while (i < src.length && !(src[i] === '"' && depth === 0)) {
          if (src[i] === '{') depth++;
          else if (src[i] === '}') depth--;
          i++;
        }
        i++;
      } else {
        while (i < src.length && !/[,}#)\s]/.test(src[i])) i++;
      }
      let j = i;
      while (/\s/.test(src[j] || '')) j++;
      if (src[j] !== '#') break;
      i = j + 1;
      skip(/\s/);
    }
    fields.push({ name: name[0].toLowerCase(), raw: src.slice(start, i).trim() });
  }
  return { type: m[1].toLowerCase(), key: m[2], fields };
}

export function formatBib(entry) {
  const lines = entry.fields.map((f) => `  ${f.name} = ${f.raw}`);
  return `@${entry.type}{${entry.key},\n${lines.join(',\n')}\n}`;
}

// LaTeX accent commands -> Unicode combining marks.
const ACCENT = { "'": '\u0301', '`': '\u0300', '^': '\u0302', '"': '\u0308', '~': '\u0303', '=': '\u0304',
  '.': '\u0307', u: '\u0306', v: '\u030c', H: '\u030b', c: '\u0327', k: '\u0328', r: '\u030a' };
const LETTER = { o: 'ø', O: 'Ø', ss: 'ß', ae: 'æ', AE: 'Æ', aa: 'å', AA: 'Å', l: 'ł', L: 'Ł', i: 'ı' };
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export function latexToText(raw) {
  let s = String(raw).trim();
  if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('"') && s.endsWith('"'))) s = s.slice(1, -1);
  s = s
    .replace(/\\([`'^"~=.])\s*\{?\s*\\?([A-Za-z])\s*\}?/g, (_, a, ch) => (ch === 'i' ? 'ı' : ch) + ACCENT[a])
    .replace(/\\([uvHckr])\s*\{\s*\\?([A-Za-z])\s*\}/g, (_, a, ch) => ch + ACCENT[a])
    .replace(/\\(ss|ae|AE|aa|AA|o|O|l|L)(?![A-Za-z])\s*(\{\})?/g, (_, c) => LETTER[c])
    .replace(/\\([&%$#_{}])/g, '$1')
    .replace(/\\[a-zA-Z]+\*?\s*\{([^{}]*)\}/g, '$1')
    .replace(/---/g, '—')
    .replace(/--/g, '–')
    .replace(/~/g, ' ')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.normalize('NFC');
}

function splitAuthors(s) {
  return s.split(/\s+and\s+/i).map((n) => n.trim()).filter(Boolean).map((n) => {
    if (!n.includes(',')) return n;
    const [last, given = ''] = n.split(',').map((x) => x.trim());
    return /[\u3400-\u9fff]/.test(last) ? last + given : `${given} ${last}`.trim();
  });
}

function bibDate(f) {
  const iso = (f.date || '').match(/^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?/);
  if (iso) return `${iso[1]}-${pad(iso[2] || 1)}-${pad(iso[3] || 1)}`;
  const year = (f.year || '').match(/\d{4}/)?.[0];
  if (!year) return '';
  let month = parseInt(f.month, 10);
  if (!month && f.month) month = MONTHS.indexOf(f.month.slice(0, 3).toLowerCase()) + 1;
  return `${year}-${pad(month || 1)}-${pad(parseInt(f.day, 10) || 1)}`;
}

export function bibtexToData(text, profile) {
  const entry = parseBibtex(text);
  const f = Object.fromEntries(entry.fields.map((x) => [x.name, latexToText(x.raw)]));
  const type = TYPES[entry.type] || 'article-journal';
  const doi = normalizeDoi(f.doi || (/doi\.org/.test(f.url || '') ? f.url : ''));
  const data = {
    title: f.title,
    authors: markMe(splitAuthors(f.author || f.editor || ''), profile),
    date: bibDate(f),
    publication_types: [type],
    publication: {
      name: f.journal || f.journaltitle || f.booktitle || f.school || f.institution,
      volume: num(f.volume),
      issue: num(f.number || f.issue),
      pages: dash(f.pages),
      publisher: f.publisher,
    },
    abstract: f.abstract,
  };
  if (doi) data.hugoblox = { ids: { doi } };
  else if (f.url) data.links = [{ type: 'source', url: f.url }];
  return { data, bib: formatBib(entry) };
}
