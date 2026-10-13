// Self-test for the editor's file handling. Run: node editor/test.mjs
// Checks that every content file survives a read/write round trip unchanged
// and that typical edits only touch the lines they should.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { splitMarkdown, splitYaml, parseData, updateYaml, createYaml } from './lib/yamlfile.mjs';
import { bibtexToData, markMe } from './lib/citation.mjs';
import { ROOT, COLLECTIONS } from './lib/content.mjs';

const STRINGIFY = { lineWidth: 0, flowCollectionPadding: false, indentSeq: true };
let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; } catch (e) { console.error(`FAIL ${name}\n  ${e.message}`); process.exitCode = 1; }
};
const changedLines = (a, b) => b.split('\n').filter((l, i) => l !== a.split('\n')[i]);

// 1. Round trip of every real file.
const files = [path.join(ROOT, 'data/authors/me.yaml')];
for (const { dir } of Object.values(COLLECTIONS)) {
  for (const slug of fs.readdirSync(path.join(ROOT, dir))) {
    const f = path.join(ROOT, dir, slug, 'index.md');
    if (fs.existsSync(f)) files.push(f);
  }
}
for (const f of files) {
  test(`round trip ${path.relative(ROOT, f)}`, () => {
    const text = fs.readFileSync(f, 'utf8');
    const { yaml } = f.endsWith('.md') ? splitMarkdown(text) : splitYaml(text);
    const { doc, data } = parseData(yaml);
    assert.equal(doc.toString(STRINGIFY), yaml, 'serializer changes the file');
    assert.equal(updateYaml(yaml, structuredClone(data)), yaml, 'no-op save changes the file');
  });
}

// 2. Edits stay surgical.
const sample = `title: "Old"
authors:
  - me
  - Hao Li
author_notes:
  - ''
  - 'Corresponding author'
publication:
  volume: 43
links:
  - type: pdf
    url: "https://a.b/c.pdf"
`;
const base = parseData(sample).data;
test('scalar edit keeps quotes', () => {
  const out = updateYaml(sample, { ...base, title: 'New: title' });
  assert.deepEqual(changedLines(sample, out), ['title: "New: title"']);
});
test('number typed as text is not rewritten', () => {
  const d = structuredClone(base);
  d.publication.volume = '43';
  assert.equal(updateYaml(sample, d), sample);
});
test('clearing a note keeps list alignment', () => {
  const d = structuredClone(base);
  d.author_notes[1] = '';
  assert.deepEqual(parseData(updateYaml(sample, d)).data.author_notes, ['', '']);
});
test('appended link copies sibling quoting', () => {
  const d = structuredClone(base);
  d.links.push({ type: 'code', url: 'https://x.y' });
  assert.match(updateYaml(sample, d), /- type: code\n {4}url: "https:\/\/x\.y"\n$/);
});
test('new file uses house style', () => {
  const out = createYaml({ title: 'T', date: '2024-01-01', publication_types: ['article-journal'], authors: ['me'] }, ['title', 'authors']);
  assert.equal(out, 'title: "T"\nauthors:\n  - me\ndate: "2024-01-01"\npublication_types: ["article-journal"]\n');
});

// 3. Citation import.
const profile = { name: { given: 'Peiyuan', family: 'Xiao', display: 'Peiyuan Xiao', alternate: '肖培源' } };
test('BibTeX with accents and Last, First names', () => {
  const { data } = bibtexToData(String.raw`@article{k, title={On {Quina}}, author={Xiao, Peiyuan and Monod, H{\'e}l{\`e}ne},
    journal={J}, volume={7}, pages={1--9}, year={2024}, month=apr}`, profile);
  assert.deepEqual(data.authors, ['me', 'Hélène Monod']);
  assert.equal(data.date, '2024-04-01');
  assert.equal(data.publication.pages, '1–9');
});
test('owner detection', () => {
  assert.deepEqual(markMe(['肖培源', '李浩'], profile), ['me', '李浩']);
  assert.deepEqual(markMe(['P.-Y. Xiao'], profile), ['me']);
  assert.deepEqual(markMe(['Pei Xu'], profile), ['Pei Xu']);
});

console.log(`${passed} passed${process.exitCode ? ', some FAILED' : ''} (${files.length} content files checked)`);
