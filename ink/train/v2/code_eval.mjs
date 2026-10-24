// Eval for the LEX/YACC code ink, using the same code-ink.js the browser runs.
//   MODEL_DIR=<dir with code-model.* + code-lm.json> node code_eval.mjs [cases.json]
import fs from 'fs'; import { createCanvas } from '@napi-rs/canvas';
globalThis.OffscreenCanvas = class { constructor(w, h) { return createCanvas(w, h); } };
const DIR = process.env.MODEL_DIR || './ink';
if (process.env.P) globalThis.CODE_INK_P = JSON.parse(process.env.P); (0, eval)(fs.readFileSync(DIR + '/code-ink.js', 'utf8'));
const E = globalThis.CodeInkEngine;
const meta = JSON.parse(fs.readFileSync(DIR + '/code-model.json')), buf = new Int8Array(fs.readFileSync(DIR + '/code-model.bin'));
E._set(E._unpack(meta, buf), JSON.parse(fs.readFileSync(DIR + '/code-lm.json')));
const cases = JSON.parse(fs.readFileSync(process.argv[2] || 'code_cases.json'));
const norm = (s) => s.replace(/\s+/g, '');
function ed(a, b) { const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; }
const R = {}; let ms = 0, nStroke = 0; const bad = [];
for (const c of cases) {
  const t0 = performance.now(); const r = E.recogniseCode(c.strokes, { field: c.field, lexicon: c.lexicon, final: true }); ms += performance.now() - t0; nStroke += c.strokes.length;
  const f = (R[c.field] = R[c.field] || { n: 0, ok: 0, top3: 0, err: 0, tot: 0 });
  f.n++; const ok = norm(r.text) === norm(c.truth); if (ok) f.ok++; else bad.push(c.field.padEnd(10) + JSON.stringify(c.truth) + '  →  ' + JSON.stringify(r.text));
  if ((r.readings || []).slice(0, 3).some((x) => norm(x.text) === norm(c.truth))) f.top3++;
  f.err += ed([...norm(r.text)], [...norm(c.truth)]); f.tot += norm(c.truth).length;
}
const out = {};
for (const [k, f] of Object.entries(R)) { out[k] = { lines: f.n, exact: +(100 * f.ok / f.n).toFixed(1), top3: +(100 * f.top3 / f.n).toFixed(1), ser: +(100 * f.err / f.tot).toFixed(1) }; }
const all = Object.values(R).reduce((a, f) => ({ n: a.n + f.n, ok: a.ok + f.ok }), { n: 0, ok: 0 });
out.all = { lines: all.n, exact: +(100 * all.ok / all.n).toFixed(1), msPerStroke: +(ms / nStroke).toFixed(1) };
console.log(JSON.stringify(out));
if (process.env.SHOW) console.log(bad.slice(0, +process.env.SHOW).join('\n'));
