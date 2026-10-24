// Turn the reference .l/.y files in ../lexyacc-bank into board specs, then check them:
//   1. board parse of the reference → assemble → real flex/bison/gcc → the bank tests  (the assembler is faithful)
//   2. the board simulator on the same spec → the bank tests                           (the simulator agrees)
//   3. writes bank.js, which the board loads (question, sources, tests, reference files, starting spec)
// node bench/build-bank.cjs [--no-real]
global.window = global; require('../vendor/jison.min.js');
const L = require('../lexyacc-core.js');
const fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
const BANK = path.join(__dirname, '../../lexyacc-bank'), OUT = path.join(__dirname, '../bank.js');
const noReal = process.argv.includes('--no-real');

function splitSections(src) {
  // returns [defsPart, rulesPart, userPart]; %% at line start
  const parts = src.split(/^%%[ \t]*$/m);
  return [parts[0] || '', parts[1] || '', parts.slice(2).join('%%') || ''];
}
function cBlock(defsPart) { const m = /%\{([\s\S]*?)%\}/.exec(defsPart); return m ? m[1] : ''; }
function parseL(src) {
  const [d, r, u] = splitSections(src);
  const decls = cBlock(d).split('\n').filter((x) => !/^\s*#/.test(x) && !/extern\s+int\s+yylval/.test(x) && !/^\s*(int|void)\s+yy\w+\s*\(/.test(x)).join('\n').trim();
  const defs = d.replace(/%\{[\s\S]*?%\}/, '').split('\n').map((x) => x.replace(/\/\*.*?\*\//g, '')).filter((x) => /^[A-Za-z_]\w*\s+\S/.test(x) && !/^%/.test(x))
    .map((x) => { const m = /^([A-Za-z_]\w*)\s+(.+)$/.exec(x.trim()); return { name: m[1], pattern: m[2].trim() }; });
  const options = (d.match(/^%option.*$/gm) || []);
  // rules: pattern = up to first unquoted/unbracketed whitespace at line start; action = rest (may span lines inside { })
  const rules = []; const s = r; let i = 0;
  while (i < s.length) {
    while (i < s.length && /[\s]/.test(s[i])) i++;
    if (i >= s.length) break;
    if (s.startsWith('/*', i)) { const e = s.indexOf('*/', i); i = e < 0 ? s.length : e + 2; continue; }
    let j = i, inQ = false, inB = false;
    while (j < s.length) {
      const c = s[j];
      if (c === '\\') { j += 2; continue; }
      if (inQ) { if (c === '"') inQ = false; j++; continue; }
      if (inB) { if (c === ']') inB = false; j++; continue; }
      if (c === '"') inQ = true; else if (c === '[') { inB = true; if (s[j + 1] === '^') j++; if (s[j + 1] === ']') j++; }
      else if (c === ' ' || c === '\t' || c === '\n') break;
      j++;
    }
    const pattern = s.slice(i, j); i = j;
    while (i < s.length && (s[i] === ' ' || s[i] === '\t')) i++;
    let action = '';
    if (s[i] === '\n') { /* action on next line (manual style) */ i++; while (i < s.length && /[ \t]/.test(s[i])) i++; }
    if (s[i] === '{') {
      let dep = 0, k = i;
      for (; k < s.length; k++) {
        const c = s[k];
        if (c === '"' || c === "'") { const q = c; k++; while (k < s.length && s[k] !== q) { if (s[k] === '\\') k++; k++; } continue; }
        if (c === '{') dep++; else if (c === '}') { dep--; if (!dep) break; }
      }
      action = s.slice(i, k + 1); i = k + 1;
      while (i < s.length && s[i] !== '\n') i++;
    } else { const e = s.indexOf('\n', i); action = s.slice(i, e < 0 ? s.length : e); i = e < 0 ? s.length : e; }
    rules.push({ pattern, action: action.trim() });
  }
  // endCode: statements in main() after yylex()
  let endCode = '', startCode = '';
  const mm = /main\s*\([^)]*\)\s*\{([\s\S]*)\}\s*$/.exec(u.trim());
  if (mm) { const body = mm[1]; const k = body.search(/yylex\s*\(\s*\)\s*;/); if (k >= 0) { startCode = body.slice(0, k).trim(); endCode = body.slice(body.indexOf(';', k) + 1).replace(/return\s+0\s*;/, '').trim(); } }
  const extraFns = u.replace(/int\s+yywrap\s*\([^)]*\)\s*\{[^}]*\}/, '').replace(/(int|void)\s+main\s*\([^)]*\)\s*\{[\s\S]*$/, '').trim();
  return { decls, defs, rules, endCode, startCode, options, extraFns };
}
function parseY(src) {
  const [d, r, u] = splitSections(src);
  const decls = cBlock(d).split('\n').filter((x) => !/^\s*#/.test(x) && !/^\s*(int|void)\s+yy(lex|error|wrap)\s*\(/.test(x)).join('\n').trim();
  const prec = d.replace(/%\{[\s\S]*?%\}/, '').split('\n').map((x) => x.trim()).filter((x) => /^%(left|right|nonassoc|start)\b/.test(x)).join('\n');
  const tokens = (d.match(/^%token.*$/gm) || []).join('\n');
  const em = /yyerror\s*\([^)]*\)\s*\{[\s\S]*?printf\s*\(\s*"((?:[^"\\]|\\.)*)"/.exec(u);
  const onError = em ? em[1].replace(/\\n/g, '\n').trim() : 'Invalid';
  const yb = /yyerror\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/.exec(u); const onErrorContinues = !!(yb && !/exit\s*\(/.test(yb[1]));
  let mainCode = '';
  const mm = /main\s*\([^)]*\)\s*\{([\s\S]*)\}\s*$/.exec(u.trim());
  if (mm) mainCode = mm[1].replace(/return\s+0\s*;/, '').trim();
  if (/^yyparse\s*\(\s*\)\s*;$/.test(mainCode)) mainCode = '';
  const extraFns = u.replace(/(void|int)\s+yyerror\s*\([^)]*\)\s*\{[\s\S]*?\n\}/, '').replace(/(int|void)\s+main\s*\([^)]*\)\s*\{[\s\S]*$/, '').trim();
  return { decls, prec, tokens, grammar: r.trim(), onError, onErrorContinues, mainCode, extraFns };
}
function realRun(files, input) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lyb'));
  for (const [f, c] of Object.entries(files)) fs.writeFileSync(path.join(d, f), c);
  const l = Object.keys(files).find((f) => f.endsWith('.l')), y = Object.keys(files).find((f) => f.endsWith('.y'));
  try { cp.execSync(`cd ${d} && flex ${l} && ` + (y ? `bison -dy ${y} 2>/dev/null && gcc -w lex.yy.c y.tab.c -o a` : `gcc -w lex.yy.c -o a`), { stdio: 'pipe' }); }
  catch (e) { return { build: false, err: String(e.stderr || e.stdout).slice(0, 400) }; }
  try { return { build: true, out: cp.execSync(`cd ${d} && timeout 3 ./a`, { input, stdio: ['pipe', 'pipe', 'pipe'] }).toString() }; }
  catch (e) { return { build: true, out: String(e.stdout || '') }; }
}
const contains = (out, exp) => exp != null && String(exp).split('\n').map((x) => x.trim()).filter(Boolean).every((x) => out.includes(x));

const bank = JSON.parse(fs.readFileSync(path.join(BANK, 'bank.json'), 'utf8'));
const items = []; const stats = { n: 0, asmReal: 0, asmRealTests: 0, sim: 0, simTests: 0, skippedExtra: 0, fails: [] };
for (const q of bank) {
  const dir = path.join(BANK, 'q', q.id);
  const lf = path.join(dir, q.id + '.l'), yf = path.join(dir, q.id + '.y');
  if (!fs.existsSync(lf)) continue;
  const lsrc = fs.readFileSync(lf, 'utf8'), ysrc = fs.existsSync(yf) ? fs.readFileSync(yf, 'utf8') : null;
  const pl = parseL(lsrc), py = ysrc ? parseY(ysrc) : null;
  const tests = [];
  const td = path.join(dir, 'tests');
  if (fs.existsSync(td)) fs.readdirSync(td).filter((f) => f.endsWith('.in')).sort().forEach((f) => { const o = path.join(td, f.replace(/\.in$/, '.out')); tests.push({ input: fs.readFileSync(path.join(td, f), 'utf8'), expect: fs.existsSync(o) ? fs.readFileSync(o, 'utf8') : null }); });
  const spec = { name: q.id.replace(/[^A-Za-z0-9]/g, '_'), mode: py ? 'yacc' : 'lex', defs: pl.defs, rules: pl.rules,
    decls: py ? py.decls : pl.decls, lexDecls: py ? pl.decls : '', endCode: pl.endCode, startCode: pl.startCode,
    prec: py ? [py.tokens, py.prec].filter(Boolean).join('\n') : '', grammar: py ? py.grammar : '', onError: py ? py.onError : null, onErrorContinues: py ? py.onErrorContinues : false, mainCode: py ? py.mainCode : '' };
  const needsExtra = !!(pl.extraFns || (py && py.extraFns) || pl.options.length);
  stats.n++;
  const an = L.analyse(Object.assign({ tests: tests.map((t) => t.input) }, spec));
  // simulator vs expected
  let simPass = 0;
  for (const t of tests) {
    const r = spec.mode === 'lex' ? L.runLex(spec, t.input) : L.runYacc(spec, t.input, an);
    const ok = contains(r.output, t.expect);
    if (ok) simPass++;
  }
  stats.simTests += tests.length; stats.sim += simPass === tests.length ? 1 : 0;
  // assembled vs real
  let asmPass = null;
  if (!noReal && !needsExtra) {
    asmPass = 0; const asm = L.assemble(spec, an);
    for (const t of tests) { const r = realRun(asm.files, t.input); if (r.build && contains(r.out, t.expect)) asmPass++; else if (!r.build) { stats.fails.push(q.id + ' ASM BUILD: ' + r.err.split('\n')[0]); break; } }
    stats.asmRealTests += asmPass; if (asmPass === tests.length) stats.asmReal++; else stats.fails.push(q.id + ' asm real ' + asmPass + '/' + tests.length);
  } else if (needsExtra) stats.skippedExtra++;
  if (simPass !== tests.length) stats.fails.push(q.id + ' sim ' + simPass + '/' + tests.length + (an.ok ? '' : ' [checker: ' + an.issues.filter((x) => x.sev === 'err').map((x) => x.msg.slice(0, 70)).join(' | ') + ']'));
  items.push({ id: q.id, title: q.title, kind: q.kind, question: q.question, sources: q.sources, tests: tests.map((t) => ({ input: t.input, expect: t.expect })),
    ref: Object.assign({ [q.id + '.l']: lsrc }, ysrc ? { [q.id + '.y']: ysrc } : {}), spec, simOK: simPass === tests.length, needsExtra });
}
fs.writeFileSync(OUT, '// generated by bench/build-bank.cjs from ../lexyacc-bank (do not edit)\nwindow.LY_BANK = ' + JSON.stringify(items) + ';\n');
console.log(JSON.stringify({ questions: stats.n, simAllPass: stats.sim, simTests: stats.simTests, asmRealAllPass: stats.asmReal, skippedExtraCode: stats.skippedExtra }, null, 0));
stats.fails.forEach((f) => console.log('  ✗ ' + f));
