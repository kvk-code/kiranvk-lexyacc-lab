// LEX–YACC Lab: the board UI. Core logic lives in lexyacc-core.js (window.LexYacc). This file is DOM plus state.
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const vis = (s) => String(s).replace(/\n/g, '⏎').replace(/\t/g, '⇥');
  const LS = 'lexyacc.v1.board', KKEY = 'lexyacc.v1.nvkey';
  const BANK = window.LY_BANK || [];
  // the code-symbol handwriting model is not accurate enough yet (eval 2026-10-11): ✍ stays off until it passes; ?ink=1 turns it on for testing
  // ✍ pad: on by default as a BETA (it learns from use); ?ink=0 hides it
  const INK_ON = !/[?&]ink=0\b/.test(location.search);
  if (!INK_ON) document.documentElement.classList.add('no-ink');
  let nvKey = localStorage.getItem(KKEY) || localStorage.getItem('logiclab.v1.nvkey') || '';

  // ───────── state ─────────
  const blank = () => ({ question: '', bankId: '', mode: 'yacc', name: 'prog', defs: [], rules: [{ pattern: '', action: '' }], decls: '', endCode: '', prec: '', grammar: '', onError: 'Invalid', mainCode: '', tests: [{ input: '' }], step: 'tok', probe: '' });
  let S = load() || blank();
  function load() { try { return JSON.parse(localStorage.getItem(LS)); } catch (e) { return null; } }
  let saveT = null; const save = () => { clearTimeout(saveT); saveT = setTimeout(() => localStorage.setItem(LS, JSON.stringify(S)), 250); };
  const spec = () => ({ name: S.name, mode: S.mode, lexDecls: S.lexDecls || '', defs: S.defs, rules: S.rules, decls: S.decls, endCode: S.endCode, prec: S.prec, grammar: S.grammar, onError: S.onError, mainCode: S.mainCode, tests: S.tests.map((t) => t.input).filter(Boolean) });
  let AN = null;

  // ───────── bank picker ─────────
  function fillBank() {
    const sel = $('#bank'), groups = {};
    const label = (s) => (/^man/.test(s) ? 'Lab manual' : /^ktu/.test(s) ? 'KTU external, Feb 2023' : /^int/.test(s) ? 'Internal exam, Oct 2026' : /^ts/.test(s) ? 'Test series Sets 1–8' : /^ext-/.test(s) ? 'External examiner sets, 2023' : 'Other');
    BANK.forEach((q) => { (groups[label(q.id)] = groups[label(q.id)] || []).push(q); });
    sel.innerHTML = '<option value="">Pick a past question…</option>' + Object.entries(groups).map(([g, qs]) => '<optgroup label="' + esc(g) + '">' + qs.map((q) => '<option value="' + esc(q.id) + '">' + esc((q.kind === 'YACC' ? '[LEX+YACC] ' : '[LEX] ') + q.title) + '</option>').join('') + '</optgroup>').join('');
    sel.value = S.bankId || '';
    sel.onchange = () => {
      const q = BANK.find((x) => x.id === sel.value); if (!q) return;
      const dirty = S.rules.some((r) => r.pattern || r.action) || S.grammar.trim();
      if (dirty && !confirm('Start this question? Your current rows and grammar will be cleared (copy them first if you need them).')) { sel.value = S.bankId || ''; return; }
      S = blank(); S.bankId = q.id; S.question = q.question; S.mode = q.kind === 'YACC' ? 'yacc' : 'lex'; S.name = q.spec.name;
      S.tests = q.tests.map((t) => ({ input: t.input, expect: t.expect }));
      if (!S.tests.length) S.tests = [{ input: '' }];
      S.probe = (q.tests[0] && q.tests[0].input.split('\n')[0]) || '';
      save(); renderAll();
    };
  }
  function srcLine() {
    const q = BANK.find((x) => x.id === S.bankId);
    $('#q-src').innerHTML = q ? 'From: ' + esc((q.sources || []).join(' · ')) + ' · ' + q.tests.length + ' test inputs loaded in step 3 · a reference solution is in step 4.' : '';
  }

  // ───────── mode + steps ─────────
  function setMode(m) { S.mode = m; document.body.classList.toggle('mode-lex', m === 'lex'); $$('#mode button').forEach((b) => b.classList.toggle('on', b.dataset.m === m)); if (m === 'lex' && S.step === 'gram') go('tok'); }
  function go(step) {
    S.step = step; save();
    $$('#steps button').forEach((b) => b.classList.toggle('on', b.dataset.s === step));
    ['tok', 'gram', 'try', 'asm'].forEach((s) => $('#step-' + s).classList.toggle('hidden', s !== step));
    if (step === 'try') renderTests();
    if (step === 'asm') renderAsm();
    if (step === 'gram') syncGutter();
  }

  // ───────── step 1: rules ─────────
  function ruleRow(r, i, kind) {
    const isDef = kind === 'def';
    const div = document.createElement('div'); div.className = 'rule'; div.dataset.i = i;
    div.innerHTML = '<span class="n">' + (i + 1) + '</span>' +
      (isDef ? '<input class="mono" data-f="name" placeholder="digit" value="' + esc(r.name) + '"><input class="mono" data-f="pattern" placeholder="[0-9]" value="' + esc(r.pattern) + '">'
        : '<input class="mono" data-f="pattern" placeholder="[0-9]+" value="' + esc(r.pattern) + '" aria-label="pattern ' + (i + 1) + '"><input class="mono" data-f="action" placeholder="' + (S.mode === 'lex' ? 'count++;' : 'yylval=atoi(yytext); return NUMBER;') + '" value="' + esc(r.action) + '" aria-label="action ' + (i + 1) + '">') +
      '<span class="tools">' + (isDef ? '' : '<button class="ink" data-t="ink" title="Write the pattern by hand">✍</button><button class="ink" data-t="inka" title="Write the action by hand">✍a</button><button data-t="up" title="Move up">↑</button><button data-t="down" title="Move down">↓</button>') + '<button data-t="del" title="Delete">✕</button></span>' +
      (isDef ? '' : '<span class="ret"></span>');
    div.addEventListener('input', (e) => { const f = e.target.dataset.f; if (!f) return; (isDef ? S.defs : S.rules)[i][f] = e.target.value; save(); recheck(); });
    div.addEventListener('click', (e) => {
      const t = e.target.dataset.t; if (!t) return;
      const arr = isDef ? S.defs : S.rules;
      if (t === 'del') { arr.splice(i, 1); if (!isDef && !arr.length) arr.push({ pattern: '', action: '' }); }
      if (t === 'up' && i > 0) [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
      if (t === 'down' && i < arr.length - 1) [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]];
      if (t === 'ink') { openInk(div.querySelector('[data-f=pattern]'), 'rule ' + (i + 1) + ' pattern', null, 'pattern'); return; }
      if (t === 'inka') { openInk(div.querySelector('[data-f=action]'), 'rule ' + (i + 1) + ' action', null, 'action'); return; }
      save(); renderRules(); recheck();
    });
    return div;
  }
  function renderRules() {
    const box = $('#rules'); box.innerHTML = ''; S.rules.forEach((r, i) => box.appendChild(ruleRow(r, i)));
    const db = $('#defs'); db.innerHTML = ''; S.defs.forEach((d, i) => db.appendChild(ruleRow(d, i, 'def')));
    if (S.defs.length) $('#defs-box').open = true;
  }
  const QUICK = { ws: { pattern: '[ \\t]', action: ';' }, nl0: { pattern: '\\n', action: 'return 0;' }, nlNL: { pattern: '\\n', action: 'return NL;' }, num: { pattern: '[0-9]+', action: 'yylval=atoi(yytext); return NUMBER;' }, any: { pattern: '.', action: 'return yytext[0];' } };

  // ───────── step 2: grammar ─────────
  function syncGutter() {
    const ta = $('#grammar'), n = Math.max(ta.value.split('\n').length, 9), bad = new Set(AN ? AN.issues.filter((x) => x.where === 'gram' && x.line && x.sev === 'err').map((x) => x.line) : []);
    $('#gutter').innerHTML = Array.from({ length: n }, (_, i) => '<span' + (bad.has(i + 1) ? ' class="err"' : '') + '>' + (i + 1) + '</span>').join('');
    $('#gutter').scrollTop = ta.scrollTop;
  }
  function tokList() {
    if (!AN) return '';
    const t = [...AN.lexTokens]; if (AN.returnsChar) t.push("'c' (any single char)"); AN.charReturns.forEach((c) => t.push("'" + c + "'"));
    return t.length ? t.join('  ') : '(none yet: add return NAME; to your LEX rows)';
  }

  // ───────── the checker panel ─────────
  function recheck() {
    let sp = spec();
    try { AN = LexYacc.analyse(sp); } catch (e) { AN = { ok: false, issues: [{ sev: 'err', where: 'tok', msg: 'Internal error: ' + e.message }], lexTokens: new Set(), charReturns: new Set(), lex: { rules: [] } }; }
    const list = $('#issues'), iss = AN.issues.slice();
    const ruleEmpty = !S.rules.some((r) => r.pattern.trim());
    if (AN.ok && !ruleEmpty) {
      if (S.mode === 'yacc' && AN.parser) iss.push({ sev: 'ok', where: 'gram', msg: 'Tokens and grammar fit together. YACC builds the parser with ' + (AN.conflicts ? AN.conflicts + ' conflict(s)' : 'no conflicts') + '. Go to step 3 and try some inputs.' });
      else if (S.mode === 'lex') iss.push({ sev: 'ok', where: 'tok', msg: 'All patterns are valid. Go to step 3 and try some inputs.' });
    }
    list.innerHTML = iss.length ? iss.map((x, k) => '<li class="' + x.sev + '"><span class="src">' + (x.where === 'tok' ? 'LEX · CHECKER' : x.where === 'decl' ? 'DECLARATIONS · CHECKER' : 'YACC · CHECKER') + '</span>' + esc(x.msg) + (x.sev !== 'ok' ? '<div class="why"><button class="btn small ghost" data-explain="' + k + '">Explain this (AI)</button></div>' : '') + '</li>').join('') : '<li>Start with step 1: one row per kind of lexeme.</li>';
    list._iss = iss;
    const errs = AN.issues.filter((x) => x.sev === 'err').length, warns = AN.issues.filter((x) => x.sev === 'warn').length;
    const v = $('#verdict'); v.className = 'pill ' + (errs ? 'err' : warns ? 'warn' : 'ok'); v.textContent = errs ? errs + ' to fix' : warns ? warns + ' warning' + (warns > 1 ? 's' : '') : '✓ ready';
    // per-row marks + returned token
    $$('#rules .rule').forEach((row) => {
      const i = +row.dataset.i, r = AN.lex.rules[i]; row.classList.remove('err', 'warn');
      const mine = AN.issues.filter((x) => x.row === i); if (mine.some((x) => x.sev === 'err')) row.classList.add('err'); else if (mine.length) row.classList.add('warn');
      const ret = row.querySelector('.ret'); if (!ret || !r) return;
      const inf = r.info;
      ret.innerHTML = !S.rules[i].pattern.trim() ? '' : r.err ? '' : inf.skip ? 'matches and <b>skips</b> it (nothing reaches YACC)' : !inf.returns ? (S.mode === 'lex' ? 'runs the action, then keeps scanning' : 'runs the action, then keeps scanning (no token for YACC)')
        : inf.returns === 'ZERO' ? 'returns <b>0</b> = end of input for YACC' : inf.returns === 'CHAR' ? 'passes the character itself, e.g. <b>\'+\'</b>' : inf.returns.startsWith('LIT:') ? 'passes <b>\'' + esc(inf.returns.slice(4)) + '\'</b>' : 'passes token <b>' + esc(inf.returns) + '</b>' + (inf.yylval ? ' with its value in yylval' : '');
    });
    // step badges
    const tokErr = AN.issues.some((x) => x.where === 'tok' && x.sev === 'err'), gramErr = AN.issues.some((x) => (x.where === 'gram' || x.where === 'decl') && x.sev === 'err');
    badge('tok', ruleEmpty ? '' : tokErr ? 'err' : 'ok'); badge('gram', !S.grammar.trim() ? '' : gramErr ? 'err' : AN.conflicts ? 'warn' : 'ok');
    $('#toklist').textContent = tokList();
    probe(); syncGutter();
    if (S.step === 'asm') renderAsm();
  }
  function badge(step, st) { const b = $('#steps button[data-s="' + step + '"]'); let s = b.querySelector('.badge'); if (!s) { s = document.createElement('span'); s.className = 'badge'; b.prepend(s); } s.className = 'badge ' + st; s.textContent = st === 'ok' ? '✓' : st === 'err' ? '×' : st === 'warn' ? '!' : ''; }

  // token stream for the sample input
  function probe() {
    const out = $('#stream'), txt = S.probe; if (!txt || !AN || !AN.lex) { out.innerHTML = ''; return; }
    const input = txt.endsWith('\n') ? txt : txt + '\n';
    let toks;
    try {
      if (S.mode === 'yacc') toks = LexYacc.tokenStream(spec(), input, AN);
      else toks = LexYacc.scan(AN.lex, input).map((t) => (t.rule ? { skip: true, text: t.text, rule: t.rule.i } : { echo: true, text: t.text }));
    } catch (e) { out.textContent = e.message; return; }
    out.innerHTML = toks.map((t) => t.tok ? '<span class="tk tok" title="rule ' + (t.rule + 1) + '">' + esc(LexYacc.showSym(t.tok)) + (t.tok.startsWith('CH_') ? '' : ' <i>' + esc(vis(t.text)) + (typeof t.val === 'number' && t.val && !/^CH_/.test(t.tok) && /\d/.test(t.text) ? '=' + t.val : '') + '</i>') + '</span>'
      : t.end ? '<span class="tk end" title="rule ' + (t.rule + 1) + '">0 (end) ' + esc(vis(t.text)) + '</span>'
      : t.echo ? '<span class="tk echo" title="no rule matches: LEX prints it">echo ' + esc(vis(t.text)) + '</span>'
      : '<span class="tk skip" title="rule ' + (t.rule + 1) + '">' + esc(vis(t.text)) + '</span>').join('') +
      (S.mode === 'yacc' ? '' : '<div class="note" style="flex-basis:100%">In a LEX-only program nothing is passed on; step 3 shows what the actions print.</div>');
  }

  // ───────── step 3: run ─────────
  function renderTests() {
    const box = $('#tests'); box.innerHTML = '';
    S.tests.forEach((t, i) => {
      const d = document.createElement('div'); d.className = 'test';
      d.innerHTML = '<textarea class="mono" rows="' + Math.min(6, Math.max(1, t.input.split('\n').length - 1)) + '" placeholder="aabb">' + esc(t.input.replace(/\n$/, '')) + '</textarea><button class="btn" data-r>▶ Run</button><button class="btn ghost" data-d title="Remove">✕</button><div class="res neutral hidden"></div>';
      const ta = d.querySelector('textarea');
      ta.oninput = () => { t.input = ta.value + '\n'; delete t.expect; save(); };
      d.querySelector('[data-r]').onclick = () => runOne(i, d);
      d.querySelector('[data-d]').onclick = () => { S.tests.splice(i, 1); if (!S.tests.length) S.tests.push({ input: '' }); save(); renderTests(); };
      box.appendChild(d);
    });
  }
  function runOne(i, d) {
    const t = S.tests[i], res = d.querySelector('.res'); res.classList.remove('hidden');
    if (!AN || !AN.ok) { res.className = 'res rej'; res.innerHTML = 'Fix the checker’s errors first (right-hand panel).'; return; }
    const input = t.input.endsWith('\n') ? t.input : t.input + '\n';
    let r;
    try { r = S.mode === 'yacc' ? LexYacc.runYacc(spec(), input, AN) : LexYacc.runLex(spec(), input); } catch (e) { res.className = 'res rej'; res.textContent = 'Could not simulate: ' + e.message; return; }
    let html = '';
    if (S.mode === 'yacc') {
      res.className = 'res ' + (r.error ? (r.error.at === 'runtime' ? 'neutral' : 'rej') : 'acc');
      html += r.error && r.error.at === 'runtime' ? '<b>The board cannot simulate this program</b> (' + esc(r.error.msg) + '). It uses C beyond simple actions (a helper function, sscanf, arrays…). The check of tokens and grammar above still holds. Run the assembled files in the lab to see the output.'
        : r.error ? '<b>✗ Syntax error</b> at ' + esc(r.error.at) + (r.error.expected && r.error.expected.length ? '. YACC expected ' + esc(r.error.expected.slice(0, 8).join(', ')) + '.' : '') + ' yyerror() is called.'
        : '<b>✓ Accepted</b>' + (r.exited ? ' (an action called exit)' : ' (yyparse returned 0)');
      if (r.reductions.length) html += '<details class="derv"><summary>Reductions YACC made (' + r.reductions.length + '), bottom-up</summary>' + r.reductions.map((p) => esc(p.lhs + ' → ' + (p.rhs.length ? p.rhs.map((s) => (s.k === 'chr' ? "'" + s.v + "'" : s.v)).join(' ') : 'ε'))).join('<br>') + '</details>';
    } else { res.className = 'res neutral'; html += r.nosim ? '<b>The board cannot simulate this action</b> (' + esc(r.stopped) + '). It uses C beyond simple actions (a helper function, sscanf…). Run the assembled file in the lab to see the output.' : r.stopped && r.stopped !== 'return' ? '<b>Stopped:</b> ' + esc(r.stopped) : '<b>Output</b>'; }
    html += '<pre>' + esc(r.output || '(no output)') + '</pre>';
    if (t.expect != null) { const ok = String(t.expect).split('\n').map((x) => x.trim()).filter(Boolean).every((x) => r.output.includes(x)); html += '<div class="expect ' + (ok ? 'ok' : 'bad') + '">' + (ok ? '✓ output has what the reference program prints' : '✗ the reference program prints: ' + esc(String(t.expect).trim())) + '</div>'; }
    res.innerHTML = html;
  }

  // ───────── step 4: assemble ─────────
  let lastAsm = null;
  function renderAsm() {
    if (!AN) recheck();
    const errs = AN.issues.filter((x) => x.sev === 'err');
    $('#asm-warn').innerHTML = errs.length ? '<div class="res rej">The checker still has ' + errs.length + ' error(s). The files below will not build until they are fixed.</div>' : AN.conflicts ? '<div class="res neutral">YACC will report ' + AN.conflicts + ' conflict(s). It still builds, but see the checker.</div>' : '';
    try { lastAsm = LexYacc.assemble(spec(), AN); } catch (e) { $('#asm-files').textContent = e.message; return; }
    $('#asm-files').innerHTML = Object.entries(lastAsm.files).map(([f, c]) => '<div class="file"><div class="fh"><span>' + esc(f) + '</span><button class="btn" data-copy="' + esc(f) + '">Copy</button></div><pre>' + esc(c) + '</pre></div>').join('');
    $('#asm-cmds').textContent = '$ ' + lastAsm.commands.join('\n$ ');
    $$('#asm-files [data-copy]').forEach((b) => (b.onclick = () => { navigator.clipboard.writeText(lastAsm.files[b.dataset.copy]).then(() => { b.textContent = 'Copied ✓'; setTimeout(() => (b.textContent = 'Copy'), 1200); }); }));
    $('#show-ref').classList.toggle('hidden', !BANK.find((x) => x.id === S.bankId));
  }
  function download() {
    if (!lastAsm) return;
    Object.entries(lastAsm.files).forEach(([f, c], k) => setTimeout(() => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([c], { type: 'text/plain' })); a.download = f; a.click(); }, k * 400));
  }

  // ───────── handwriting ─────────
  // a LEX pattern has no spaces outside "quotes": the pad's word gaps would end the pattern early
  function squeezePattern(v) { let o = '', q = false; for (const c of String(v)) { if (c === '"') q = !q; if (!q && /\s/.test(c)) continue; o += c; } return o.replace(/\[([^\]]*)\]/g, (m, b) => '[' + b.replace(/(^|[0-9\-])O(?=[0-9\-\]])/g, '$10') + ']'); }
  let inkTarget = null, inkPad = null;
  function openInk(input, label, onDone, field) {
    field = field || (/pattern/.test(label) ? 'pattern' : /production/.test(label) ? 'production' : 'action');
    if (!window.LogicInk) { alert('The handwriting pad did not load.'); return; }
    inkTarget = input; $('#ink-target').textContent = label; $('#ink-dock').classList.remove('hidden'); document.body.classList.add('inking');
    const host = $('#inkpad'); host.innerHTML = '';
    const lex = () => { const names = new Set(['yylval', 'atoi', 'yytext', 'return', 'printf', 'exit']); if (AN) { AN.lexTokens.forEach((t) => names.add(t)); (AN.rules || []).forEach((r) => names.add(r.lhs)); } return [...names]; };
    if (window.LogicInk.loadModel) window.LogicInk.loadModel(window.INK_BASE || 'ink/');
    inkPad = window.LogicInk.attach(host, { input, mode: 'code', field, base: window.INK_BASE || 'ink/', lexicon: lex, submitLabel: 'Use this', onSubmit: () => { $('#ink-dock').classList.add('hidden'); document.body.classList.remove('inking'); if (/pattern/.test(label)) input.value = squeezePattern(input.value); if (onDone) onDone(input.value); else { input.dispatchEvent(new Event('input', { bubbles: true })); input.focus(); } return { ok: null }; }, context: () => ({ track: 'lexyacc', field, label, q: S.bankId || null }), verdict: true });
    // keep the row being written visible above the sheet (once, when the pad opens — never while writing)
    const rr = input.getBoundingClientRect(); if (rr.bottom > innerHeight - 440) scrollBy({ top: rr.bottom - (innerHeight - 460), behavior: 'instant' });
  }

  // ───────── AI tutor ─────────
  function boardContext() {
    const sp = spec();
    return { step: { tok: 'tokens (LEX rules)', gram: 'grammar (YACC productions)', try: 'trying inputs', asm: 'assembled program' }[S.step], question: S.question, programType: S.mode === 'yacc' ? 'LEX + YACC' : 'LEX only',
      lexRules: sp.rules.map((r, i) => (i + 1) + ': ' + r.pattern + '    ' + r.action), definitions: sp.defs.map((d) => d.name + ' ' + d.pattern), cDeclarations: sp.decls,
      afterYylex: S.mode === 'lex' ? sp.endCode : undefined, declarations: S.mode === 'yacc' ? sp.prec : undefined,
      grammar: S.mode === 'yacc' ? sp.grammar.split('\n').map((l, i) => (i + 1) + ': ' + l).join('\n') : undefined, yyerrorMessage: S.mode === 'yacc' ? sp.onError : undefined,
      checker: (AN ? AN.issues : []).map((x) => x.sev.toUpperCase() + ': ' + x.msg), tokensLexPasses: AN ? tokList() : '',
      // what each LEX rule DOES, as the checker computed it (the model must not guess: `;` = discard on purpose)
      lexRuleMeaning: AN && AN.lex ? AN.lex.rules.map((r, i) => { const inf = r.info || {}; return 'rule ' + (i + 1) + ': ' + (r.err ? 'invalid pattern' : inf.skip ? 'matches and DISCARDS the text (action `;` = skip; intentional, YACC never sees it)' : !inf.returns ? 'runs its C action, returns nothing' : inf.returns === 'ZERO' ? 'returns 0 = end of input for YACC' : inf.returns === 'CHAR' ? 'returns the character itself' : 'returns token ' + inf.returns.replace(/^LIT:/, "'") ); }) : [],
      // what the board SIMULATED on the sample inputs (ground truth: if they are accepted with the right output, the program works)
      runs: boardRuns(sp) };
  }
  function boardRuns(sp) {
    if (!AN || !AN.ok) return 'not run: the checker has errors';
    const exp = S.tests.filter((t) => t.input).map((t) => t.expect);
    return sp.tests.slice(0, 4).map((t, k) => {
      const input = t.endsWith('\n') ? t : t + '\n', want = exp[k];
      const verdict = (out) => (want == null ? undefined : String(want).split('\n').map((x) => x.trim()).filter(Boolean).every((x) => out.includes(x)));
      try {
        if (S.mode === 'yacc') { const r = LexYacc.runYacc(sp, input, AN); const toks = (r.tokens || []).filter((x) => x.tok).map((x) => LexYacc.showSym(x.tok)).join(' ');
          return { input, tokensYaccReceived: toks, result: r.error ? (r.error.at === 'runtime' ? 'not simulable in the browser' : 'SYNTAX ERROR at ' + r.error.at) : 'ACCEPTED', output: r.output, expectedOutput: want, matchesExpected: verdict(r.output) }; }
        const r = LexYacc.runLex(sp, input); return { input, result: r.nosim ? 'not simulable in the browser' : 'ran', output: r.output, expectedOutput: want, matchesExpected: verdict(r.output) };
      } catch (e) { return { input, result: 'not simulable: ' + e.message }; }
    });
  }
  function msg(cls, src, text) { const d = document.createElement('div'); d.className = 'msg ' + cls; d.innerHTML = '<span class="src">' + esc(src) + '</span>' + fmt(text); $('#tutor-out').prepend(d); return d; }
  const fmt = (t) => esc(t).replace(/`([^`]+)`/g, '<code>$1</code>');
  async function ai(payload, label) {
    if (!nvKey) { msg('local', 'NO KEY', 'The Unstuck tutor needs your free NVIDIA key (top right: AI tutor). The checker on the right works without it.'); openKey(); return; }
    const d = msg('', label + ' · AI TUTOR', ''); d.innerHTML = '<span class="src">' + esc(label) + ' · AI TUTOR</span><span class="spin"></span> thinking…';
    try {
      const r = await fetch('ai.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ user_key: nvKey, context: boardContext() }, payload)) });
      const j = await r.json();
      if (!j.ok) { d.className = 'msg local'; d.innerHTML = '<span class="src">AI TUTOR</span>' + esc(j.detail || j.reason || 'failed'); return; }
      const clean = guard(j.text);
      d.innerHTML = '<span class="src">' + esc(label) + ' · AI TUTOR · ' + esc((j.model || '').split('/').pop()) + ' · ' + (j.ms / 1000).toFixed(1) + ' s</span>' + fmt(clean);
    } catch (e) { d.className = 'msg local'; d.innerHTML = '<span class="src">AI TUTOR</span>Network error: ' + esc(e.message); }
  }
  // never show students features outside the lab subset, even if the model drifts
  function guard(t) {
    const banned = /%union|%type\b|%define|%code|\bBEGIN\b|%x\b|\bREJECT\b|\byymore\b|%expect/;
    return banned.test(t) ? t + '\n\n(Note from the board: this answer mentions a feature we do not use in the lab: ' + (t.match(banned) || [''])[0] + '. Stick to the lab-manual style.)' : t;
  }
  function openKey() { $('#modal').classList.remove('hidden'); $('#key').value = nvKey; $('#key').focus(); }
  function setKeyState() { $('#key-dot').classList.toggle('on', !!nvKey); }

  // ───────── wiring ─────────
  function renderAll() {
    $('#question').value = S.question; $('#decls').value = S.decls; $('#endcode').value = S.endCode; $('#prec').value = S.prec; $('#grammar').value = S.grammar;
    $('#onerr').value = S.onError; $('#maincode').value = S.mainCode; $('#probe').value = S.probe || ''; $('#bank').value = S.bankId || '';
    setMode(S.mode); renderRules(); recheck(); srcLine(); $('#ref').innerHTML = ''; go(S.step || 'tok');
  }
  function toggleTheme() {
    const dark = document.documentElement.getAttribute('data-theme') !== 'dark';
    if (dark) document.documentElement.setAttribute('data-theme', 'dark'); else document.documentElement.removeAttribute('data-theme');
    try { const p = JSON.parse(localStorage.getItem('kvkme.prefs') || '{}'); p.theme = dark ? 'dark' : 'light'; localStorage.setItem('kvkme.prefs', JSON.stringify(p)); } catch (e) { }
    if (inkPad && inkPad.run) inkPad.run(false);
  }
  function bind() {
    $('#btn-theme').onclick = toggleTheme;
    $('#question').oninput = (e) => { S.question = e.target.value; save(); };
    $$('#mode button').forEach((b) => (b.onclick = () => { setMode(b.dataset.m); save(); renderRules(); recheck(); }));
    $$('#steps button').forEach((b) => (b.onclick = () => go(b.dataset.s)));
    $('#add-rule').onclick = () => { S.rules.push({ pattern: '', action: '' }); save(); renderRules(); recheck(); $$('#rules .rule input')[S.rules.length * 2 - 2].focus(); };
    $('#add-def').onclick = () => { S.defs.push({ name: '', pattern: '' }); save(); renderRules(); };
    $$('[data-q]').forEach((b) => (b.onclick = () => { const q = QUICK[b.dataset.q]; const empty = S.rules.findIndex((r) => !r.pattern && !r.action); if (empty >= 0) S.rules[empty] = Object.assign({}, q); else S.rules.push(Object.assign({}, q)); save(); renderRules(); recheck(); }));
    const bindIn = (id, k) => ($(id).oninput = (e) => { S[k] = e.target.value; save(); recheck(); });
    bindIn('#decls', 'decls'); bindIn('#endcode', 'endCode'); bindIn('#prec', 'prec'); bindIn('#onerr', 'onError'); bindIn('#maincode', 'mainCode');
    let gt = null; $('#grammar').oninput = (e) => { S.grammar = e.target.value; save(); syncGutter(); clearTimeout(gt); gt = setTimeout(recheck, 300); };
    $('#grammar').onscroll = () => { $('#gutter').scrollTop = $('#grammar').scrollTop; };
    $('#grammar').addEventListener('keydown', (e) => { if (e.key === 'Tab') { e.preventDefault(); const ta = e.target, s = ta.selectionStart; ta.setRangeText('    ', s, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input')); } });
    $('#probe').oninput = (e) => { S.probe = e.target.value; save(); probe(); };
    $('#ink-gram').onclick = () => {
      // write one production line; it is appended to the grammar box through a hidden line input
      let line = $('#gram-line'); if (!line) { line = document.createElement('input'); line.id = 'gram-line'; line.className = 'mono'; line.placeholder = 'the pad writes here: S : A S B'; $('#ink-gram').parentNode.after(line); }
      line.classList.remove('hidden'); line.value = '';
      openInk(line, 'one production line', (v) => { v = String(v || '').trim(); line.classList.add('hidden'); line.value = ''; if (!v) return; S.grammar = S.grammar.replace(/\s+$/, '') + (S.grammar.trim() ? '\n' : '') + v; $('#grammar').value = S.grammar; save(); recheck(); });
    };
    $('#ink-close').onclick = () => { $('#ink-dock').classList.add('hidden'); document.body.classList.remove('inking'); };
    $('#add-test').onclick = () => { S.tests.push({ input: '' }); save(); renderTests(); };
    $('#run-all').onclick = () => $$('#tests .test').forEach((d, i) => runOne(i, d));
    $('#dl-zip').onclick = download;
    $('#show-ref').onclick = () => { const q = BANK.find((x) => x.id === S.bankId); if (!q) return; $('#ref').innerHTML = '<p class="note">The reference solution from the question bank (built and tested with flex, bison and gcc). Yours may differ and still be right: what matters is the output on the test inputs.</p>' + Object.entries(q.ref).map(([f, c]) => '<div class="file"><div class="fh"><span>reference · ' + esc(f) + '</span></div><pre>' + esc(c) + '</pre></div>').join(''); };
    $('#btn-new').onclick = () => { if (!confirm('Start a new, empty program?')) return; S = blank(); save(); renderAll(); };
    $('#btn-key').onclick = openKey;
    $('#key-close').onclick = () => $('#modal').classList.add('hidden');
    $('#key-clear').onclick = () => { nvKey = ''; localStorage.removeItem(KKEY); setKeyState(); $('#key').value = ''; $('#key-st').textContent = 'Key removed from this browser.'; };
    $('#key-save').onclick = async () => {
      const k = $('#key').value.trim(); $('#key-st').innerHTML = '<span class="spin"></span> testing…';
      try { const j = await (await fetch('ai.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ test_key: k }) })).json();
        if (j.ok) { nvKey = k; localStorage.setItem(KKEY, k); setKeyState(); $('#key-st').textContent = '✓ Works (' + (j.ms / 1000).toFixed(1) + ' s). Unstuck and Ask are on.'; setTimeout(() => $('#modal').classList.add('hidden'), 900); }
        else $('#key-st').textContent = '✗ ' + (j.detail || j.reason); } catch (e) { $('#key-st').textContent = '✗ ' + e.message; }
    };
    $$('#tutor [data-l]').forEach((b) => (b.onclick = () => ai({ kind: 'unstuck', level: +b.dataset.l }, ['', 'NUDGE', 'WHAT’S WRONG', 'NEXT LINE'][+b.dataset.l])));
    const ask = () => { const q = $('#ask').value.trim(); if (!q) return; msg('q', 'YOU ASKED', q); $('#ask').value = ''; ai({ kind: 'ask', question: q }, 'ANSWER'); };
    $('#ask-go').onclick = ask; $('#ask').onkeydown = (e) => { if (e.key === 'Enter') ask(); };
    $('#issues').onclick = (e) => { const k = e.target.dataset.explain; if (k == null) return; const x = $('#issues')._iss[+k]; ai({ kind: 'issue', issue: x.msg }, 'EXPLAIN'); };
    document.addEventListener('keydown', (e) => { if (e.altKey && e.key === 'b') document.body.classList.toggle('big'); });
  }
  fillBank(); bind(); setKeyState(); renderAll();
  window.LYBoard = { get state() { return S; }, recheck, go };
})();
