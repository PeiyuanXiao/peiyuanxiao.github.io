// Format-preserving read/write of YAML front matter (Markdown) and plain YAML files.
// Only the values that actually changed are touched, so quotes, comments, key
// order and line endings of the original file are kept and git diffs stay small.
import { Document, parseDocument, isMap, isSeq, isScalar, visit } from 'yaml';

const STRINGIFY = { lineWidth: 0, flowCollectionPadding: false, indentSeq: true };

// ── File splitting ──────────────────────────────────────────────────────────

export function splitMarkdown(text) {
  const bom = text.startsWith('\ufeff') ? '\ufeff' : '';
  if (bom) text = text.slice(1);
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const norm = text.replace(/\r\n/g, '\n');
  const m = norm.match(/^---[ \t]*\n([\s\S]*?\n)?---[ \t]*(?:\n|$)([\s\S]*)$/);
  if (!m) return { bom, eol, yaml: '', body: norm };
  return { bom, eol, yaml: m[1] || '', body: m[2] };
}

export function joinMarkdown({ bom = '', eol = '\n', yaml, body = '' }) {
  if (yaml && !yaml.endsWith('\n')) yaml += '\n';
  return bom + `---\n${yaml}---\n${body}`.replace(/\n/g, eol);
}

export function splitYaml(text) {
  const bom = text.startsWith('\ufeff') ? '\ufeff' : '';
  if (bom) text = text.slice(1);
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  return { bom, eol, yaml: text.replace(/\r\n/g, '\n') };
}

export function joinYaml({ bom = '', eol = '\n', yaml }) {
  return bom + yaml.replace(/\n/g, eol);
}

// ── Value comparison ────────────────────────────────────────────────────────

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function isEmpty(v) {
  if (v === undefined || v === null || v === '') return true;
  if (Array.isArray(v)) return v.length === 0;
  if (isObj(v)) return Object.values(v).every(isEmpty);
  return false;
}

// Loose equality: '' == missing, 43 == "43". Avoids rewriting values whose
// meaning did not change (e.g. a number round-tripped through a text input).
export function same(a, b) {
  if (isEmpty(a) && isEmpty(b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => same(x, b[i]));
  }
  if (isObj(a) && isObj(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (!same(a[k], b[k])) return false;
    return true;
  }
  if (isObj(a) || isObj(b) || Array.isArray(a) || Array.isArray(b)) return false;
  return String(a) === String(b);
}

// Drop empty values recursively (used when building brand-new files).
export function prune(v) {
  if (Array.isArray(v)) return v.map(prune);
  if (isObj(v)) {
    const out = {};
    for (const [k, x] of Object.entries(v)) if (!isEmpty(x)) out[k] = prune(x);
    return out;
  }
  return v;
}

// ── Node creation ───────────────────────────────────────────────────────────

// Strings that YAML 1.1 parsers would read as booleans, dates or numbers get
// double quotes, matching the style already used in the content files.
const RISKY = /^(y|n|yes|no|on|off|true|false|null|~)$|^\d{4}-\d{2}-\d{2}|^[\d.+-]+$/i;

const hasNewline = (str) => str.indexOf('\n') !== -1;
const textType = (str) => (hasNewline(str) ? 'BLOCK_LITERAL' : 'QUOTE_DOUBLE');

// House style for newly created values: map values double-quoted (multi-line
// text as a | block), list items plain unless ambiguous, flow lists quoted.
function styleNew(node) {
  visit(node, {
    Pair(_, pair) {
      if (isScalar(pair.value) && typeof pair.value.value === 'string') pair.value.type = textType(pair.value.value);
    },
    Seq(_, seq) {
      if (!seq.flow) return;
      for (const it of seq.items) if (isScalar(it) && typeof it.value === 'string') it.type = 'QUOTE_DOUBLE';
    },
    Scalar(_, sc) {
      if (typeof sc.value === 'string' && (!sc.type || sc.type === 'PLAIN') && RISKY.test(sc.value)) sc.type = 'QUOTE_DOUBLE';
    },
  });
}

// Copy scalar quote styles from an existing node with the same shape.
function copyStyle(node, tpl) {
  if (!tpl) return;
  if (isScalar(node) && isScalar(tpl)) {
    if (typeof node.value !== 'string' || !tpl.type) return;
    if (hasNewline(node.value) && tpl.type.startsWith('QUOTE')) return;
    node.type = tpl.type;
    if (node.type === 'PLAIN' && RISKY.test(node.value)) node.type = 'QUOTE_DOUBLE';
  } else if (isMap(node) && isMap(tpl)) {
    for (const p of node.items) {
      const match = tpl.items.find((q) => q.key && p.key && q.key.value === p.key.value);
      if (match) copyStyle(p.value, match.value);
    }
  } else if (isSeq(node) && isSeq(tpl)) {
    node.flow = tpl.flow;
    node.items.forEach((it, i) => copyStyle(it, tpl.items[i] || tpl.items[tpl.items.length - 1]));
  }
}

function makeNode(doc, value, tpl) {
  const node = doc.createNode(value);
  styleNew(node);
  copyStyle(node, tpl);
  return node;
}

// ── Applying changes ────────────────────────────────────────────────────────

function pruneEmptyParents(doc, path) {
  for (let p = path.slice(0, -1); p.length; p = p.slice(0, -1)) {
    const n = doc.getIn(p, true);
    if ((isMap(n) || isSeq(n)) && n.items.length === 0) doc.deleteIn(p);
    else break;
  }
}

function apply(doc, path, a, b) {
  if (same(a, b)) return;
  const node = path.length ? doc.getIn(path, true) : doc.contents;
  const inList = typeof path[path.length - 1] === 'number';

  // Emptied map keys are removed; emptied list items stay as empty strings so
  // that position-based lists (author_notes) keep their alignment.
  if (isEmpty(b) && !inList) {
    if (path.length) {
      doc.deleteIn(path);
      pruneEmptyParents(doc, path);
    }
    return;
  }
  if (isEmpty(b) && inList && !isObj(a) && !Array.isArray(a)) b = '';

  if (isObj(a) && isObj(b) && (isMap(node) || !path.length)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) apply(doc, [...path, k], a[k], b[k]);
    return;
  }
  if (Array.isArray(a) && Array.isArray(b) && isSeq(node)) {
    const common = Math.min(a.length, b.length);
    for (let i = 0; i < common; i++) apply(doc, [...path, i], a[i], b[i]);
    if (b.length < a.length) node.items.splice(b.length);
    for (let i = a.length; i < b.length; i++) node.items.push(makeNode(doc, b[i], node.items[node.items.length - 1]));
    return;
  }
  const isScalarValue = b === null || typeof b !== 'object';
  if (isScalar(node) && isScalarValue) {
    node.value = b; // keeps the node's quote style
    if (typeof b === 'string') {
      if (hasNewline(b) && node.type && node.type.startsWith('QUOTE')) node.type = 'BLOCK_LITERAL';
      else if (node.type === 'PLAIN' && RISKY.test(b)) node.type = 'QUOTE_DOUBLE';
    }
    return;
  }
  if (!path.length) {
    doc.contents = makeNode(doc, b);
    return;
  }
  doc.setIn(path, makeNode(doc, b, node));
}

// ── Public API ──────────────────────────────────────────────────────────────

export function parseData(yamlText) {
  const doc = parseDocument(yamlText);
  if (doc.errors.length) throw new Error('YAML error: ' + doc.errors[0].message);
  return { doc, data: doc.toJS() || {} };
}

// Returns the updated YAML text (the original text when nothing differs).
export function updateYaml(yamlText, newData) {
  const { doc, data } = parseData(yamlText);
  if (same(data, newData)) return yamlText;
  if (!doc.contents) doc.contents = doc.createNode({});
  apply(doc, [], data, newData);
  return doc.toString(STRINGIFY);
}

// Build YAML for a new file, with keys in the given preferred order.
export function createYaml(data, order = []) {
  const clean = prune(data);
  const ordered = {};
  for (const k of order) if (k in clean) ordered[k] = clean[k];
  for (const k of Object.keys(clean)) if (!(k in ordered)) ordered[k] = clean[k];
  const doc = new Document(ordered);
  // Short type lists read best in flow style, as in the existing files.
  for (const pair of doc.contents.items) {
    if (pair.key && pair.key.value === 'publication_types' && isSeq(pair.value)) pair.value.flow = true;
  }
  styleNew(doc.contents);
  return doc.toString(STRINGIFY);
}
