// Evaluate code mode recognition on LEX/YACC test cases
import fs from 'fs';
import { createCanvas } from '@napi-rs/canvas';

globalThis.OffscreenCanvas = class {
  constructor(w, h) { return createCanvas(w, h); }
};
globalThis.localStorage = { getItem: () => null, setItem: () => {} };

const src = fs.readFileSync('./ink/ink.js', 'utf8');
(0, eval)(src);

const Ink = globalThis.LogicInk;
const meta = JSON.parse(fs.readFileSync('./ink/ink-model.json'));
const buf = new Int8Array(fs.readFileSync('./ink/ink-model.bin'));
const T = {};
let o = 0;
for (const t of meta.tensors) {
  const n = t.shape.reduce((a, b) => a * b, 1);
  const f = new Float32Array(n);
  for (let i = 0; i < n; i++) f[i] = buf[o + i] * t.scale;
  T[t.name] = f;
  o += n;
}
Ink._setModel({ classes: meta.classes, T, meta });

const cases = JSON.parse(fs.readFileSync('./hw-data/jstest/cases_code.json', 'utf8'));
console.log(`Loaded ${cases.length} code eval cases`);

let correct = 0;
let totalChars = 0;
let editDist = 0;
const errors = [];

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i-1] === b[j-1]) dp[i][j] = dp[i-1][j-1];
      else dp[i][j] = 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

const t0 = Date.now();
for (const c of cases) {
  const result = Ink.recognise(c.strokes, c.lexicon, true, '', { mode: 'code' });
  const pred = result.text;
  const truth = c.truth;
  
  if (pred === truth) {
    correct++;
  } else {
    const ed = levenshtein(pred, truth);
    editDist += ed;
    totalChars += Math.max(pred.length, truth.length);
    errors.push({ truth, pred, ed });
  }
}
const elapsed = Date.now() - t0;

const exactAcc = correct / cases.length;
const ser = totalChars > 0 ? editDist / totalChars : 0;

console.log(`\n=== Code Mode Evaluation ===`);
console.log(`Exact match: ${correct}/${cases.length} = ${(exactAcc * 100).toFixed(2)}%`);
console.log(`Symbol error rate: ${(ser * 100).toFixed(2)}%`);
console.log(`Time: ${elapsed}ms (${(elapsed / cases.length).toFixed(1)}ms per case)`);

if (errors.length > 0) {
  console.log(`\nSample errors (first 10):`);
  errors.slice(0, 10).forEach(e => {
    console.log(`  Truth: "${e.truth}"`);
    console.log(`  Pred:  "${e.pred}"`);
    console.log(`  ED: ${e.ed}\n`);
  });
}
