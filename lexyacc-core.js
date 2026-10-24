// LEX–YACC Lab core: checker, simulator and assembler for the lab-manual subset of LEX and YACC.
// Browser: window.LexYacc. Node: module.exports (used by the bench tests).
// The deterministic checker decides ✓/×; the AI tutor only explains. The simulator is best effort.
// Real flex/bison/gcc is the authority, and bench/test-bank.mjs compares the two on every bank question.
(function (root) {
  'use strict';
  const getJison = () => (root.Jison || (typeof require === 'function' ? require('jison') : null));
  const unesc = (ch) => ({ n: '\n', t: '\t', r: '\r', 0: '\0' })[ch] ?? ch;
  const printable = (c) => (c === '\n' ? '\\n' : c === '\t' ? '\\t' : c);

  // ─────────── LEX pattern → JS RegExp ───────────
  function lexToRegex(pat, defs, depth) {
    depth = depth || 0;
    if (depth > 8) throw new Error('definitions refer to each other in a loop');
    let out = '', i = 0; const n = pat.length;
    if (pat[0] === '<') throw new Error('start conditions like <STATE> are not used in our lab programs');
    while (i < n) {
      const c = pat[i];
      if (c === '"') {
        let j = i + 1, lit = '';
        while (j < n && pat[j] !== '"') { if (pat[j] === '\\' && j + 1 < n) { lit += unesc(pat[j + 1]); j += 2; } else lit += pat[j++]; }
        if (j >= n) throw new Error('a " quote is not closed');
        out += '(?:' + lit.replace(/[.*+?^${}()|[\]\\\/-]/g, '\\$&') + ')'; i = j + 1; continue;
      }
      if (c === '[') {
        let j = i + 1, cls = '[';
        if (pat[j] === '^') { cls += '^'; j++; }
        if (pat[j] === ']') { cls += '\\]'; j++; }
        while (j < n && pat[j] !== ']') {
          if (pat[j] === '\\' && j + 1 < n) { const e = pat[j + 1]; cls += e === 'n' ? '\\n' : e === 't' ? '\\t' : e === 'r' ? '\\r' : /[A-Za-z0-9 ]/.test(e) ? e : '\\' + e; j += 2; continue; }
          cls += (pat[j] === '[' || pat[j] === '/') ? '\\' + pat[j] : pat[j]; j++;
        }
        if (j >= n) throw new Error('a [ character class is not closed with ]');
        out += cls + ']'; i = j + 1; continue;
      }
      if (c === '{') {
        const m = /^\{([A-Za-z_][A-Za-z0-9_]*)\}/.exec(pat.slice(i));
        if (m) {
          if (!defs || !(m[1] in defs)) throw new Error('{' + m[1] + '} is used but not defined in the definitions section');
          out += '(?:' + lexToRegex(defs[m[1]], defs, depth + 1) + ')'; i += m[0].length; continue;
        }
        const r = /^\{(\d+)(,(\d*))?\}/.exec(pat.slice(i));
        if (r) { out += r[0]; i += r[0].length; continue; }
        throw new Error('a { here is neither {name} nor a repeat count like {2,4}');
      }
      if (c === '\\') {
        if (i + 1 >= n) throw new Error('the pattern ends with a lone \\');
        const e = pat[i + 1]; out += e === 'n' ? '\\n' : e === 't' ? '\\t' : e === 'r' ? '\\r' : /[A-Za-z0-9]/.test(e) ? e : '\\' + e; i += 2; continue;
      }
      if (c === '.') { out += '[^\\n]'; i++; continue; }
      if (c === '/') throw new Error('trailing context (a/b) is not used in our lab programs; write a slash as "/"');
      if (c === '$' && i === n - 1) throw new Error('$ (end of line) is not used in our lab programs; match \\n instead');
      if (c === ' ' || c === '\t') throw new Error('a space ends a LEX pattern; write a space as " " or [ ]');
      if (c === '^' && i !== 0) { out += '\\^'; i++; continue; }
      out += c; i++;
    }
    return out;
  }

  // ─────────── what a LEX action does ───────────
  function actionInfo(act) {
    const a = String(act || '').trim();
    const info = { returns: null, yylval: null, skip: false };
    if (!a || /^\{?\s*;?\s*\}?$/.test(a)) { info.skip = true; return info; }
    let m;
    if (/return\s*\(?\s*yytext\s*\[\s*0\s*\]/.test(a) || /return\s*\(?\s*\*\s*yytext/.test(a)) info.returns = 'CHAR';
    else if ((m = /return\s*\(?\s*'(\\?.)'\s*\)?/.exec(a))) info.returns = 'LIT:' + unesc(m[1].replace(/^\\/, ''));
    else if (/return\s*\(?\s*0\s*\)?\s*;/.test(a)) info.returns = 'ZERO';
    else if ((m = /return\s*\(?\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)?\s*;?/.exec(a))) info.returns = m[1];
    if (/yylval\s*=\s*ato[if]\s*\(/.test(a)) info.yylval = 'num';
    else if (/yylval\s*=/.test(a)) info.yylval = 'other';
    return info;
  }

  // ─────────── C action → JS (simulation subset) ───────────
  function cToJs(code) {
    let s = String(code || '').trim();
    if (s.startsWith('{') && s.endsWith('}')) s = s.slice(1, -1);
    s = s.replace(/'(\\?.)'/g, (m, ch) => String((ch.length === 2 ? unesc(ch[1]) : ch).charCodeAt(0)))
      .replace(/\b(?:int|char|float|double)\s*\*?\s*([A-Za-z_]\w*)\s*\[\s*\d*\s*\]\s*=\s*\{([^}]*)\}/g, 'var $1=[$2]')
      .replace(/\b(?:int|char|float|double)\s+([A-Za-z_]\w*)\s*\[\s*\d*\s*\]\s*;/g, 'var $1=[];')
      .replace(/\b(?:unsigned\s+|signed\s+|static\s+|const\s+)*(?:int|char|float|double|long|short)\s*\*?\s+(?=[A-Za-z_])/g, 'var ')
      .replace(/\bfprintf\s*\(\s*(?:stdout|yyout|stderr)\s*,/g, 'yy.printf(')
      .replace(/\bprintf\s*\(/g, 'yy.printf(').replace(/\bputs\s*\(/g, 'yy.puts(').replace(/\bputchar\s*\(/g, 'yy.putchar(')
      .replace(/\bexit\s*\(\s*[^)]*\)/g, 'yy.exit()')
      .replace(/\b(atoi|atof|strlen|strcmp|toupper|tolower|isdigit|isalpha|isupper|islower)\s*\(/g, 'yy.$1(')
      .replace(/\bECHO\b\s*;?/g, 'yy.printf("%s", yytext);')
      .replace(/\byytext\s*\[\s*([^\]]+)\]/g, 'yy.ch(yytext,$1)');
    return s;
  }
  function cGlobals(decl) {
    const G = {};
    String(decl || '').replace(/^\s*extern\b.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/#.*$/gm, '').split(';').forEach((st) => {
      const m = /^\s*(?:unsigned\s+|static\s+)*(int|char|float|double|long)\s+([\s\S]+)$/.exec(st);
      if (!m || /\(/.test(m[2].split('=')[0])) return;
      m[2].split(',').forEach((v) => {
        const mm = /^\s*\*?\s*([A-Za-z_]\w*)\s*(\[[^\]]*\])?\s*(?:=\s*(.+))?$/.exec(v);
        if (!mm || mm[1] === 'yylval') return;
        let val = mm[2] ? [] : 0;
        if (mm[3] != null) { const t = mm[3].trim(); if (/^-?\d+(\.\d+)?$/.test(t)) val = Number(t); else if (/^'.'$/.test(t)) val = t.charCodeAt(1); else if (/^".*"$/.test(t)) val = t.slice(1, -1); }
        G[mm[1]] = val;
      });
    });
    return G;
  }
  function cFormat(fmt, args) {
    let k = 0;
    return String(fmt).replace(/%([-+ 0#]*)(\d*)(?:\.(\d+))?(?:l{0,2}|h)?([dicsfuxXeg%])/g, (m, fl, w, p, t) => {
      if (t === '%') return '%';
      const v = args[k++]; let s;
      if (t === 'd' || t === 'i' || t === 'u') s = String(Math.trunc(Number(v) || 0));
      else if (t === 'c') s = typeof v === 'number' ? String.fromCharCode(v) : String(v ?? '').charAt(0);
      else if (t === 's') s = Array.isArray(v) ? cstr(v) : String(v ?? '');
      else if (t === 'f') s = (Number(v) || 0).toFixed(p != null ? +p : 6);
      else if (t === 'x' || t === 'X') { s = (Math.trunc(Number(v) || 0) >>> 0).toString(16); if (t === 'X') s = s.toUpperCase(); }
      else s = String(v);
      if (w && s.length < +w) s = fl.includes('-') ? s.padEnd(+w) : s.padStart(+w, fl.includes('0') ? '0' : ' ');
      return s;
    });
  }
  const cstr = (a) => { let o = ''; for (const c of a) { if (c === 0 || c === '\0' || c == null) break; o += typeof c === 'number' ? String.fromCharCode(c) : String(c); } return o; };
  class ExitSignal {}
  function makeRuntime(G, out) {
    const C = (c) => (typeof c === 'number' ? String.fromCharCode(c) : String(c));
    return {
      G,
      printf: (f, ...a) => { out.push(cFormat(f, a)); return 0; },
      puts: (s) => { out.push(String(s) + '\n'); return 0; },
      putchar: (c) => { out.push(C(c)); return c; },
      exit: () => { throw new ExitSignal(); },
      atoi: (s) => parseInt(s, 10) || 0, atof: (s) => parseFloat(s) || 0, strlen: (s) => (Array.isArray(s) ? cstr(s).length : String(s).length),
      strcmp: (a, b) => (a === b ? 0 : a < b ? -1 : 1),
      toupper: (c) => (typeof c === 'number' ? C(c).toUpperCase().charCodeAt(0) : C(c).toUpperCase()),
      tolower: (c) => (typeof c === 'number' ? C(c).toLowerCase().charCodeAt(0) : C(c).toLowerCase()),
      isdigit: (c) => /[0-9]/.test(C(c)), isalpha: (c) => /[A-Za-z]/.test(C(c)), isupper: (c) => /[A-Z]/.test(C(c)), islower: (c) => /[a-z]/.test(C(c)),
      ch: (s, i) => { const c = String(s).charCodeAt(i); return isNaN(c) ? 0 : c; },
    };
  }
  // sloppy-mode Function so `with` gives actions bare access to C globals and yytext/yyleng
  // eslint-disable-next-line no-new-func
  const compileAction = (js) => new Function('yy', '__s', 'with (yy.G) { with (__s) { ' + js + '\n } }');

  // ─────────── LEX side ───────────
  function compileLex(spec) {
    const defs = {};
    (spec.defs || []).forEach((d) => { if (d && d.name && String(d.name).trim()) defs[String(d.name).trim()] = String(d.pattern || '').trim(); });
    const rules = (spec.rules || []).map((r, i) => {
      const pat = String(r.pattern || '').trim(), o = { i, pattern: pat, action: String(r.action || '').trim(), re: null, err: null, info: actionInfo(r.action) };
      if (!pat) { o.err = 'the pattern is empty'; return o; }
      try { o.src = lexToRegex(pat, defs); o.re = new RegExp(o.src, 'y'); o.re.lastIndex = 0; o.empty = o.re.test(''); o.re.lastIndex = 0; }
      catch (e) { o.err = String(e.message).replace(/^Invalid regular expression: \/.*\/[a-z]*: /, 'not a valid pattern: '); }
      return o;
    });
    return { rules, defs };
  }
  function scan(lex, text) {
    const res = []; let pos = 0;
    while (pos < text.length) {
      let best = null, bestLen = 0;
      for (const r of lex.rules) {
        if (!r.re || r.empty) continue;
        r.re.lastIndex = pos; const m = r.re.exec(text);
        if (m && m[0].length > bestLen) { best = r; bestLen = m[0].length; }
      }
      if (!best) { res.push({ rule: null, text: text[pos], pos }); pos += 1; continue; }
      res.push({ rule: best, text: text.substr(pos, bestLen), pos }); pos += bestLen;
    }
    return res;
  }
  const charSym = (ch) => 'CH_' + ch.charCodeAt(0);
  const showSym = (s) => (/^CH_\d+$/.test(s) ? "'" + printable(String.fromCharCode(+s.slice(3))) + "'" : s === '$end' ? 'end of input' : s);

  // ─────────── YACC side ───────────
  function gErr(msg, line) { const e = new Error(msg); e.line = line; return e; }
  function tokenizeGrammar(src) {
    const toks = []; let i = 0, line = 1; const n = src.length;
    while (i < n) {
      const c = src[i];
      if (c === '\n') { line++; i++; continue; }
      if (/\s/.test(c)) { i++; continue; }
      if (c === '/' && src[i + 1] === '*') { const j = src.indexOf('*/', i + 2), e = j < 0 ? n : j + 2; line += (src.slice(i, e).match(/\n/g) || []).length; i = e; continue; }
      if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
      if (c === '{') {
        let d = 0, j = i;
        for (; j < n; j++) {
          if (src[j] === '{') d++;
          else if (src[j] === '}') { d--; if (!d) break; }
          else if (src[j] === '"' || src[j] === "'") { const q = src[j]; j++; while (j < n && src[j] !== q) { if (src[j] === '\\') j++; j++; } }
        }
        if (j >= n) throw gErr('an action { … } is not closed with }', line);
        const v = src.slice(i, j + 1); toks.push({ t: 'act', v, line }); line += (v.match(/\n/g) || []).length; i = j + 1; continue;
      }
      if (c === "'") {
        const m = /^'(\\.|[^'\\])'/.exec(src.slice(i));
        if (!m) throw gErr("a character literal must look like '+' (one character between single quotes)", line);
        toks.push({ t: 'chr', v: unesc(m[1].replace(/^\\/, '')), line }); i += m[0].length; continue;
      }
      if (c === '"') throw gErr('YACC uses single quotes for characters: write \'+\' not "+" (or return a named token from LEX)', line);
      if (c === ':' || c === '|' || c === ';') { toks.push({ t: c, line }); i++; continue; }
      if (c === '%') {
        const m = /^%(prec|empty)\b/.exec(src.slice(i));
        if (m) { toks.push({ t: '%' + m[1], line }); i += m[0].length; continue; }
        throw gErr('only %prec may appear inside the rules (%token / %left go in the declarations box)', line);
      }
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
      if (m) { toks.push({ t: 'id', v: m[0], line }); i += m[0].length; continue; }
      if (c === '$') throw gErr('$$ and $1 belong inside an action { … }', line);
      throw gErr('unexpected character ' + JSON.stringify(c) + ' in the grammar', line);
    }
    return toks;
  }
  function parseRules(src) {
    const toks = tokenizeGrammar(src), rules = []; let i = 0, cur = null;
    while (i < toks.length) {
      let t = toks[i];
      if (t.t === 'id' && toks[i + 1] && toks[i + 1].t === ':') { cur = { lhs: t.v, line: t.line, alts: [] }; rules.push(cur); i += 2; }
      else if (t.t === '|' && cur) i++;
      else if (t.t === ';') { i++; cur = null; continue; }
      else if (!cur) throw gErr(t.t === 'id' ? 'a production must start with its head and a colon, e.g. "' + t.v + ' : …"' : 'a production must start with a nonterminal and a colon, like  S : A S B', t.line);
      const alt = { rhs: [], action: null, prec: null, line: (toks[i] || t).line };
      while (i < toks.length) {
        t = toks[i];
        if (t.t === '|' || t.t === ';') break;
        if (t.t === 'id' && toks[i + 1] && toks[i + 1].t === ':') break;
        if (t.t === 'id' || t.t === 'chr') { alt.rhs.push({ k: t.t, v: t.v }); if (alt.action) alt.mid = true; i++; continue; }
        if (t.t === 'act') { if (alt.action) alt.mid = true; alt.action = t.v; i++; continue; }
        if (t.t === '%prec') { const s = toks[i + 1]; if (!s || (s.t !== 'id' && s.t !== 'chr')) throw gErr('%prec must be followed by a token', t.line); alt.prec = { k: s.t, v: s.v }; i += 2; continue; }
        if (t.t === ':') throw gErr('a second ":" here; each production has one head', t.line);
        i++;
      }
      cur.alts.push(alt);
      if (toks[i] && toks[i].t === ';') { i++; cur = null; }
    }
    return rules;
  }
  function parseDecls(src) {
    const res = { prec: [], tokens: new Set(), start: null, issues: [] };
    String(src || '').split('\n').forEach((ln, k) => {
      const l = ln.trim(); if (!l) return;
      const m = /^%(left|right|nonassoc|token|start|type|union)\b(.*)$/.exec(l);
      if (!m) { res.issues.push({ sev: 'err', where: 'decl', msg: 'Declarations line ' + (k + 1) + ': each line here starts with %token, %left, %right, %nonassoc or %start.' }); return; }
      if (m[1] === 'type' || m[1] === 'union') { res.issues.push({ sev: 'err', where: 'decl', msg: '%' + m[1] + ' is not used in our lab programs; yylval is a plain int.' }); return; }
      const syms = [], re = /'(\\.|[^'\\])'|([A-Za-z_][A-Za-z0-9_]*)|(\S+)/g; let mm;
      while ((mm = re.exec(m[2]))) {
        if (mm[1] != null) syms.push({ k: 'chr', v: unesc(mm[1].replace(/^\\/, '')) });
        else if (mm[2] != null) syms.push({ k: 'id', v: mm[2] });
        else res.issues.push({ sev: 'err', where: 'decl', msg: 'Declarations line ' + (k + 1) + ': "' + mm[3] + '" is not a token; write characters in single quotes, like \'+\'.' });
      }
      if (m[1] === 'token') syms.forEach((s) => s.k === 'id' && res.tokens.add(s.v));
      else if (m[1] === 'start') res.start = syms[0] ? syms[0].v : null;
      else res.prec.push({ assoc: m[1], syms });
    });
    return res;
  }
  function gramText(spec) {
    if (Array.isArray(spec.grammar)) return spec.grammar.map((r) => String(r.text || '') + (String(r.action || '').trim() ? ' ' + braced(r.action) : '')).join('\n');
    return String(spec.grammar || '');
  }
  const braced = (a) => { a = String(a || '').trim(); return !a ? '' : a.startsWith('{') ? a : '{ ' + a + ' }'; };
  function literalOf(p) {
    if (/^"[^"\\]*"$/.test(p)) return p.slice(1, -1);
    if (/^[A-Za-z0-9_]+$/.test(p)) return p;
    if (/^(\[[A-Za-z][A-Za-z]\])+$/.test(p)) return p.replace(/\[([A-Za-z])[A-Za-z]\]/g, '$1');
    return null;
  }

  // ─────────── the checker ───────────
  function analyse(spec) {
    const issues = [], lex = compileLex(spec), yaccMode = spec.mode !== 'lex';
    const add = (sev, where, msg, extra) => issues.push(Object.assign({ sev, where, msg }, extra || {}));
    const res = { lex, issues, conflicts: 0, parser: null, lexTokens: new Set(), charReturns: new Set(), returnsChar: false };
    if (!lex.rules.length) add('err', 'tok', 'There are no LEX rules yet. Add one row per kind of lexeme: a pattern and an action.');
    lex.rules.forEach((r) => {
      if (r.err) add('err', 'tok', 'Rule ' + (r.i + 1) + ': ' + r.err + '.', { row: r.i });
      else if (r.empty) add('err', 'tok', 'Rule ' + (r.i + 1) + ' (' + r.pattern + ') can match an empty string, and LEX would loop on it forever. Use + instead of *.', { row: r.i });
    });
    lex.rules.forEach((r, j) => {
      if (!r.re || r.err) return;
      const lit = literalOf(r.pattern); if (lit == null) return;
      for (let i = 0; i < j; i++) {
        const q = lex.rules[i]; if (!q.re || q.empty) continue;
        q.re.lastIndex = 0; const m = q.re.exec(lit);
        if (m && m[0].length === lit.length) { add('err', 'tok', 'Rule ' + (j + 1) + ' (' + r.pattern + ') is never used. Rule ' + (i + 1) + ' (' + q.pattern + ') also matches "' + lit + '" and comes first, and on a tie LEX picks the EARLIER rule. Move rule ' + (j + 1) + ' above rule ' + (i + 1) + '.', { row: j }); break; }
      }
    });
    let hasZero = false;
    lex.rules.forEach((r) => {
      const ret = r.info.returns; if (!ret) return;
      if (ret === 'CHAR') res.returnsChar = true;
      else if (ret === 'ZERO') hasZero = true;
      else if (ret.startsWith('LIT:')) res.charReturns.add(ret.slice(4));
      else if (!/^[0-9]/.test(ret)) res.lexTokens.add(ret);
    });
    if (yaccMode && lex.rules.length && !res.lexTokens.size && !res.returnsChar && !res.charReturns.size) add('err', 'tok', 'No LEX rule returns a token, so YACC receives nothing. In a LEX+YACC program each useful rule ends with  return NAME;  (or  return yytext[0];  for single characters).');
    if (!yaccMode) lex.rules.forEach((r) => { if (r.info.returns && r.info.returns !== 'ZERO') add('warn', 'tok', 'Rule ' + (r.i + 1) + ' returns a value, but this is a LEX-only program: yylex() stops at the first return. LEX-only rules usually just print or count.', { row: r.i }); });
    const samples = (spec.tests || []).map((t) => (typeof t === 'string' ? t : (t && t.input) || '')).join('\n');
    if (samples && lex.rules.some((r) => r.re)) {
      const un = new Set(); scan(lex, samples).forEach((tk) => { if (!tk.rule) un.add(tk.text); });
      if (un.size) add('warn', 'tok', 'No rule matches ' + [...un].slice(0, 6).map((c) => '"' + printable(c) + '"').join(', ') + ' in the test inputs. LEX then prints (ECHOes) those characters' + (yaccMode ? ', and YACC never sees them' : '') + '. Add a rule for them, e.g.  [ \\t] ;  to skip blanks.');
    }
    if (yaccMode && lex.rules.length && !hasZero && !lex.rules.some((r) => r.re && !r.empty && (r.re.lastIndex = 0, r.re.test('\n')))) add('warn', 'tok', 'No rule handles the newline. In the lab programs it is usually  \\n return 0;  (end of input) or  \\n return NL;  when the grammar uses NL.');
    if (!yaccMode) { finish(res); return res; }

    const decl = parseDecls(spec.prec); decl.issues.forEach((x) => issues.push(x));
    let rules;
    try { rules = parseRules(gramText(spec)); }
    catch (e) { add('err', 'gram', 'Grammar line ' + (e.line || '?') + ': ' + e.message + '.', { line: e.line }); finish(res); return res; }
    if (!rules.length) { add('err', 'gram', 'There are no productions yet. Write them in YACC form, e.g.  S : A S B | ;'); finish(res); return res; }
    res.rules = rules;
    const heads = new Set(rules.map((r) => r.lhs)), known = new Set([...decl.tokens, ...res.lexTokens]);
    rules.forEach((r) => r.alts.forEach((a) => { if (a.mid) add('warn', 'gram', 'Grammar line ' + a.line + ': an action in the MIDDLE of a production is not used in our lab programs. Keep the { } at the end.', { line: a.line }); }));
    const undef = new Map();
    rules.forEach((r) => r.alts.forEach((a) => a.rhs.forEach((s) => { if (s.k === 'id' && !heads.has(s.v) && !known.has(s.v) && !undef.has(s.v)) undef.set(s.v, a.line); })));
    undef.forEach((line, v) => add('err', 'gram', '"' + v + '" (grammar line ' + line + ') is neither a token nor a nonterminal: no LEX rule returns ' + v + ' and no production has ' + v + ' on the left. ' + (/^[A-Z_0-9]+$/.test(v) ? 'If it is a token, add a LEX rule ending in  return ' + v + ';' : 'If it is a nonterminal, give it a production  ' + v + ' : … ;'), { line, sym: v }));
    heads.forEach((h) => { if (res.lexTokens.has(h)) add('err', 'gram', '"' + h + '" is returned by LEX as a token but also has a production. A name is either a token or a nonterminal, never both.', { sym: h }); });
    const usedChars = new Set();
    rules.forEach((r) => r.alts.forEach((a) => a.rhs.forEach((s) => s.k === 'chr' && usedChars.add(s.v))));
    if (usedChars.size && !res.returnsChar) {
      const miss = [...usedChars].filter((c) => !res.charReturns.has(c));
      if (miss.length) add('err', 'tok', 'The grammar uses ' + miss.map((c) => "'" + printable(c) + "'").join(' ') + ', but no LEX rule returns single characters. Add  . return yytext[0];  as the LAST rule (or one rule per character).');
    }
    const usedIds = new Set(); rules.forEach((r) => r.alts.forEach((a) => a.rhs.forEach((s) => s.k === 'id' && usedIds.add(s.v))));
    res.lexTokens.forEach((t) => { if (!usedIds.has(t) && !heads.has(t)) add('warn', 'gram', 'LEX returns ' + t + ' but no production uses it. If ' + t + ' appears in the input, YACC reports a syntax error there.', { sym: t }); });
    const start = decl.start || rules[0].lhs;
    if (decl.start && !heads.has(decl.start)) add('err', 'decl', '%start ' + decl.start + ' has no production.');
    const byHead = new Map(); rules.forEach((r) => { if (!byHead.has(r.lhs)) byHead.set(r.lhs, []); byHead.get(r.lhs).push(...r.alts); });
    const reach = new Set([start]), st = [start];
    while (st.length) { const h = st.pop(); (byHead.get(h) || []).forEach((a) => a.rhs.forEach((s) => { if (s.k === 'id' && heads.has(s.v) && !reach.has(s.v)) { reach.add(s.v); st.push(s.v); } })); }
    heads.forEach((h) => { if (!reach.has(h)) add('warn', 'gram', h + ' can never be reached from the start symbol ' + start + ' (the head of the first production). Is it misspelt where it should be used?', { sym: h }); });
    const prod = new Set(); let ch = true;
    while (ch) { ch = false; byHead.forEach((alts, h) => { if (!prod.has(h) && alts.some((a) => a.rhs.every((s) => s.k === 'chr' || !heads.has(s.v) || prod.has(s.v)))) { prod.add(h); ch = true; } }); }
    const dead = [...heads].filter((h) => !prod.has(h));
    const roots = dead.filter((h) => (byHead.get(h) || []).some((a) => a.rhs.some((x) => x.k === 'id' && x.v === h)));
    (roots.length ? roots : dead).forEach((h) => add('err', 'gram', h + ' can never finish: every alternative of ' + h + ' needs ' + h + ' again, so no input is ever accepted. Add a base case: an alternative with only tokens (e.g. ' + h + ' : A B), or an empty one.', { sym: h }));
    const others = dead.filter((h) => !roots.includes(h) && roots.length);
    if (others.length) add('warn', 'gram', others.join(', ') + (others.length > 1 ? ' depend' : ' depends') + ' on ' + roots.join(', ') + ', so ' + (others.length > 1 ? 'they' : 'it') + ' cannot finish either. Fixing ' + roots.join(', ') + ' fixes this too.');
    if (!issues.some((x) => x.sev === 'err' && (x.where === 'gram' || x.where === 'decl'))) {
      try { buildParser(res, rules, decl, start); } catch (e) { add('err', 'gram', 'Could not build the parser: ' + e.message); }
    }
    finish(res); return res;
  }
  function finish(res) { const o = { err: 0, warn: 1, ok: 2 }; res.issues.sort((a, b) => o[a.sev] - o[b.sev]); res.ok = !res.issues.some((x) => x.sev === 'err'); }

  function buildParser(res, rules, decl, start) {
    const Jison = getJison(); if (!Jison) throw new Error('the parser generator did not load');
    const sym = (s) => (s.k === 'chr' ? charSym(s.v) : s.v);
    const bnf = {}, prodList = [];
    rules.forEach((r) => {
      bnf[r.lhs] = bnf[r.lhs] || [];
      r.alts.forEach((a) => {
        const idx = prodList.length;
        let fn = null;
        if (a.action) { try { fn = compileAction(cToJs(a.action).replace(/\$\$/g, '__s.$$$$').replace(/\$(\d+)/g, '__s.v[$1]')); } catch (e) { res.issues.push({ sev: 'warn', where: 'gram', line: a.line, msg: 'Grammar line ' + a.line + ': the board cannot simulate this action (' + e.message + '). It is still copied into your .y file unchanged.' }); } }
        prodList.push({ lhs: r.lhs, rhs: a.rhs, line: a.line, action: a.action, fn });
        const n = a.rhs.length, vals = []; for (let k = 1; k <= n; k++) vals.push('$' + k);
        const alt = [a.rhs.map(sym).join(' '), '$$ = yy.reduce(' + idx + ', [null' + (n ? ',' + vals.join(',') : '') + ']);'];
        if (a.prec) alt.push({ prec: sym(a.prec) });
        bnf[r.lhs].push(alt);
      });
    });
    const terms = new Set();
    prodList.forEach((p) => p.rhs.forEach((s) => { if (s.k === 'chr' || !bnf[s.v]) terms.add(sym(s)); }));
    decl.prec.forEach((p) => p.syms.forEach((s) => terms.add(sym(s))));
    const operators = decl.prec.map((p) => [p.assoc, ...p.syms.map(sym)]);
    const msgs = [], old = Jison.print; Jison.print = function () { msgs.push([].join.call(arguments, ' ')); };
    let gen;
    try { gen = new Jison.Generator({ bnf, operators, tokens: [...terms].join(' '), startSymbol: start }, { type: 'lalr' }); }
    finally { Jison.print = old; }
    res.conflicts = gen.conflicts; res.prodList = prodList; res.start = start;
    if (gen.conflicts) {
      const seen = new Set();
      msgs.join('\n').split('Conflict in grammar: ').slice(1).forEach((m) => {
        const tok = (/lookahead token is\s*(\S+)/.exec(m) || [])[1] || '?';
        const acts = (m.match(/- (reduce|shift)/g) || []);
        const kind = acts.length && acts.every((x) => /reduce/.test(x)) ? 'reduce/reduce' : 'shift/reduce';
        const key = kind + tok; if (seen.has(key)) return; seen.add(key);
        res.issues.push({ sev: 'warn', where: 'gram', conflict: kind, msg: kind + ' conflict when the next token is ' + showSym(tok) + '. ' + (kind === 'shift/reduce'
          ? 'The grammar is ambiguous here (e.g. E : E \'+\' E reads a+b+c two ways). YACC shifts by default, which may group things wrongly. For operators, declare precedence: %left \'+\' \'-\' and then %left \'*\' \'/\' (later lines bind tighter).'
          : 'Two productions can finish on the same input, and YACC uses the one written first. Usually two nonterminals derive the same thing; merge them.') });
      });
    }
    res.parser = gen.createParser();
  }

  // ─────────── running ───────────
  function runLex(spec, input) {
    const lex = compileLex(spec), out = [], G = cGlobals(spec.decls), yy = makeRuntime(G, out), trace = [];
    const acts = lex.rules.map((r) => { if (r.info.skip) return null; try { return compileAction(cToJs(r.action)); } catch (e) { return 'bad'; } });
    let stopped = null, nosim = false;
    try {
      if (spec.startCode) compileAction(cToJs(spec.startCode))(yy, {});
      for (const tk of scan(lex, input)) {
        trace.push({ rule: tk.rule ? tk.rule.i : -1, text: tk.text });
        if (!tk.rule) { out.push(tk.text); continue; }
        const f = acts[tk.rule.i]; if (!f) continue;
        if (f === 'bad') { stopped = 'rule ' + (tk.rule.i + 1) + ': this action cannot be simulated in the browser'; break; }
        if (f(yy, { yytext: tk.text, yyleng: tk.text.length }) !== undefined) { stopped = 'return'; break; }
      }
      // a `return` inside an action ends yylex(), and main() then runs the code after yylex()
      if ((!stopped || stopped === 'return') && spec.endCode) compileAction(cToJs(spec.endCode))(yy, {});
    } catch (e) { if (!(e instanceof ExitSignal)) { stopped = 'runtime error: ' + e.message; nosim = e instanceof ReferenceError; } }
    return { output: out.join(''), trace, stopped, nosim: nosim || /cannot be simulated/.test(stopped || '') };
  }
  // LEX as YACC drives it: lazily, one token per yylex() call, so printf output from LEX and YACC actions interleaves like the real program
  function makeLexer(an, input, yy, out) {
    const acts = an.lex.rules.map((r) => { try { return compileAction(cToJs(r.action).replace(/\breturn\b[^;]*;?/g, '').replace(/\byylval\s*=/g, 'yy.yylval=')); } catch (e) { return 'bad'; } });
    const toks = scan(an.lex, input); let i = 0; const stream = [];
    function next() {
      while (i < toks.length) {
        const tk = toks[i++];
        if (!tk.rule) { out.push(tk.text); stream.push({ echo: true, text: tk.text }); continue; }
        const info = tk.rule.info, f = acts[tk.rule.i]; yy.yylval = 0;
        if (f === 'bad') { const e = new Error('LEX rule ' + (tk.rule.i + 1) + ' uses C the board cannot simulate'); e.nosim = true; throw e; }
        if (f) f(yy, { yytext: tk.text, yyleng: tk.text.length });
        if (!info.returns) { stream.push({ skip: true, text: tk.text, rule: tk.rule.i }); continue; }
        if (info.returns === 'ZERO') { stream.push({ end: true, text: tk.text, rule: tk.rule.i }); i = toks.length; return null; }
        const name = info.returns === 'CHAR' ? charSym(tk.text[0]) : info.returns.startsWith('LIT:') ? charSym(info.returns.slice(4)) : info.returns;
        const val = info.yylval ? yy.yylval : (info.returns === 'CHAR' ? tk.text.charCodeAt(0) : yy.yylval);
        const t = { tok: name, text: tk.text, val, rule: tk.rule.i }; stream.push(t); return t;
      }
      return null;
    }
    return { next, stream };
  }
  function tokenStream(spec, input, an) {
    an = an || analyse(spec); const out = [], yy = makeRuntime(cGlobals([spec.lexDecls, spec.decls].filter(Boolean).join('\n')), out), lx = makeLexer(an, input, yy, out);
    try { while (lx.next()); } catch (e) { /* show what we have */ }
    return lx.stream;
  }
  function runYacc(spec, input, an) {
    an = an || analyse(spec);
    const out = [], G = cGlobals([spec.lexDecls, spec.decls].filter(Boolean).join('\n')), yy = makeRuntime(G, out);
    if (!an.parser) return { accepted: false, error: { at: 'build', msg: 'fix the errors first' }, tokens: tokenStream(spec, input, an), reductions: [], output: '' };
    const lx = makeLexer(an, input, yy, out), stream = lx.stream, reductions = [];
    let k = 0, last = null, exited = false;
    const p = an.parser, symbols = p.symbols_ || {};
    p.yy = {
      reduce(idx, v) {
        reductions.push(idx);
        const pr = an.prodList[idx], s = { $$: v.length > 1 ? v[1] : 0, v };
        if (pr.fn) { pr.fn(yy, s); }
        return s.$$;
      },
    };
    p.lexer = {
      setInput() { k = 0; this.yytext = ''; this.yylloc = { first_line: 1, last_line: 1, first_column: 0, last_column: 0 }; this.yylineno = 0; this.yyleng = 0; this.match = ''; },
      lex() {
        const t = lx.next(); k++;
        if (!t) { last = { tok: '$end', text: 'end of input' }; return 1; }
        last = t; this.yytext = t.val; this.match = t.text; this.yyleng = String(t.text).length;
        return (t.tok in symbols) ? t.tok : 2;
      },
      showPosition() { return ''; }, options: {}, yylloc: {},
    };
    let accepted = false, error = null;
    const mc = String(spec.mainCode || ''), mk = mc.search(/yyparse\s*\(\s*\)\s*;/);
    const before = mk >= 0 ? mc.slice(0, mk) : '', after = mk >= 0 ? mc.slice(mc.indexOf(';', mk) + 1).replace(/return\s+0\s*;/, '') : '';
    const runC = (c) => { if (c.trim()) try { compileAction(cToJs(c))(yy, {}); } catch (e) { if (!(e instanceof ExitSignal)) out.push('[board: could not simulate main(): ' + e.message + ']'); } };
    runC(before);
    try { p.parse(input); accepted = true; runC(after); }
    catch (e) {
      if (e instanceof ExitSignal) { exited = true; accepted = true; }
      else if (e && e.hash) {
        error = { at: last ? (last.tok === '$end' ? 'end of input' : '"' + printable(String(last.text)) + '" (' + showSym(last.tok) + ')') : '?', index: k, expected: (e.hash.expected || []).map((x) => showSym(String(x).replace(/^'|'$/g, ''))) };
        if (spec.onError != null) out.push(String(spec.onError).replace(/\\n/g, '\n').replace(/\n?$/, '\n'));
        if (spec.onErrorContinues) runC(after);
      } else error = { at: 'runtime', nosim: !!(e && (e.nosim || e instanceof ReferenceError || e instanceof SyntaxError)), msg: String(e && e.message) };
    }
    return { accepted, exited, error, output: out.join(''), tokens: stream, reductions: reductions.map((i) => an.prodList[i]) };
  }

  // ─────────── the assembler: lab-manual skeleton ───────────
  function assemble(spec, an) {
    an = an || analyse(spec);
    const name = String(spec.name || 'prog').replace(/[^A-Za-z0-9_]/g, '') || 'prog', yacc = spec.mode !== 'lex';
    const defs = (spec.defs || []).filter((d) => d && String(d.name || '').trim()).map((d) => String(d.name).trim() + '\t' + String(d.pattern).trim()).join('\n');
    const rules = (spec.rules || []).filter((r) => String(r.pattern || '').trim()).map((r) => {
      let a = String(r.action || '').trim(); if (!a) a = ';';
      if (!a.startsWith('{') && a !== ';') a = '{ ' + a + ' }';
      return String(r.pattern).trim() + '\t' + a;
    }).join('\n');
    const decls = String(spec.decls || '').trim();
    let l = '%{\n#include<stdio.h>\n#include<stdlib.h>\n';
    if (yacc) l += '#include "y.tab.h"\nextern int yylval;\n' + (String(spec.lexDecls || '').trim() ? String(spec.lexDecls).trim() + '\n' : ''); else if (decls) l += decls + '\n';
    l += '%}\n' + (defs ? defs + '\n' : '') + '%%\n' + rules + '\n%%\nint yywrap(){ return 1; }\n';
    if (!yacc) {
      l += 'int main(){\n' + (spec.startCode ? '    ' + String(spec.startCode).trim().replace(/\n/g, '\n    ') + '\n' : '') + '    yylex();\n' + (spec.endCode ? '    ' + String(spec.endCode).trim().replace(/\n/g, '\n    ') + '\n' : '') + '    return 0;\n}\n';
      return { files: { [name + '.l']: l }, commands: ['lex ' + name + '.l', 'cc lex.yy.c -o ' + name, './' + name] };
    }
    const heads = new Set((an.rules || []).map((r) => r.lhs)), toks = [];
    an.lexTokens.forEach((t) => { if (!heads.has(t)) toks.push(t); });
    (an.rules || []).forEach((r) => r.alts.forEach((a) => a.rhs.forEach((s) => { if (s.k === 'id' && !heads.has(s.v) && !toks.includes(s.v)) toks.push(s.v); })));
    parseDecls(spec.prec).tokens.forEach((t) => { if (!toks.includes(t)) toks.push(t); });
    const precLines = String(spec.prec || '').split('\n').map((x) => x.trim()).filter((x) => x && !/^%token\b/.test(x));
    let g = gramText(spec).trim(); if (g && !/;\s*$/.test(g)) g += '\n;';
    const msg = String(spec.onError == null ? 'Invalid' : spec.onError).replace(/\\n/g, '\n').replace(/\n+$/, '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
    let y = '%{\n#include<stdio.h>\n#include<stdlib.h>\nint yylex();\nvoid yyerror(const char *s);\n' + (decls ? decls + '\n' : '') + '%}\n';
    if (toks.length) y += '%token ' + toks.join(' ') + '\n';
    if (precLines.length) y += precLines.join('\n') + '\n';
    y += '%%\n' + g + '\n%%\nvoid yyerror(const char *s){\n    printf("' + msg + '\\n");\n' + (spec.onErrorContinues ? '' : '    exit(0);\n') + '}\n';
    y += 'int main(){\n' + (spec.mainCode ? '    ' + String(spec.mainCode).trim().replace(/\n/g, '\n    ') + '\n' : '    yyparse();\n') + '    return 0;\n}\n';
    return { files: { [name + '.l']: l, [name + '.y']: y }, commands: ['lex ' + name + '.l', 'yacc -d ' + name + '.y', 'cc lex.yy.c y.tab.c -o ' + name, './' + name] };
  }

  const api = { tokenStream, lexToRegex, actionInfo, compileLex, scan, analyse, runLex, runYacc, assemble, parseRules, parseDecls, cToJs, cGlobals, cFormat, showSym, charSym, gramText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.LexYacc = api;
})(typeof window !== 'undefined' ? window : globalThis);
