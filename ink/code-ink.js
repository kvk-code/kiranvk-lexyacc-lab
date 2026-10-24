// LEX–YACC Lab: handwriting recogniser for CODE (regular expressions, LEX actions, YACC productions). Runs on the device.
// Separate from the Logic Lab model. Pipeline:
//   strokes → glyph units (shared segmenter in ink.js) → CNN class scores (code-model.bin, 75 classes; look-alike glyphs
//   such as 0/O/o and 1/l/I/| are ONE class) → beam search over characters with
//     • a character trigram language model per field (pattern | action | production), trained on the lab bank + idioms,
//     • line geometry (case by size, ' vs , and - vs _ by height on the line),
//     • LEX syntax state (quotes, [..] classes with valid ascending ranges, brace/paren balance),
//     • the board's lexicon (token and nonterminal names) and whole-line macros of common patterns (forced alignment).
// Exposes CodeInk.{loadCodeModel, recogniseCode}. The pad UI (ink.js attach) calls it when opts.mode === 'code'.
(function (root) {
  'use strict';
  const R = 32, BOX = 26, SS = 4;
  let M = null, loading = null, LMS = null;
  async function loadCodeModel(base) {
    if (M) return M;
    if (loading) return loading;
    loading = (async () => {
      const v = root.CODE_INK_V || 1;
      const meta = await (await fetch(base + 'code-model.json?v=' + v)).json();
      const buf = new Int8Array(await (await fetch(base + 'code-model.bin?v=' + v)).arrayBuffer());
      M = unpack(meta, buf);
      LMS = await (await fetch(base + 'code-lm.json?v=' + v)).json();
      return M;
    })();
    return loading;
  }
  function unpack(meta, buf) {
    const T = {}; let o = 0;
    for (const t of meta.tensors) { const n = t.shape.reduce((a, b) => a * b, 1), f = new Float32Array(n); for (let i = 0; i < n; i++) f[i] = buf[o + i] * t.scale; T[t.name] = f; o += n; }
    return { classes: meta.classes, groups: meta.groups, T, meta };
  }
  function conv3(inp, C, H, W, w, b, O) {
    const out = new Float32Array(O * H * W);
    for (let o = 0; o < O; o++) {
      const bo = b[o];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let s = bo;
        for (let c = 0; c < C; c++) {
          const wb = ((o * C + c) * 3) * 3, ib = c * H * W;
          for (let ky = -1; ky <= 1; ky++) { const yy = y + ky; if (yy < 0 || yy >= H) continue; const row = ib + yy * W, wr = wb + (ky + 1) * 3;
            for (let kx = -1; kx <= 1; kx++) { const xx = x + kx; if (xx < 0 || xx >= W) continue; s += inp[row + xx] * w[wr + kx + 1]; } }
        }
        out[(o * H + y) * W + x] = s > 0 ? s : 0;
      }
    }
    return out;
  }
  function pool2(inp, C, H, W) {
    const h = H >> 1, w = W >> 1, out = new Float32Array(C * h * w);
    for (let c = 0; c < C; c++) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (c * H + 2 * y) * W + 2 * x; out[(c * h + y) * w + x] = Math.max(inp[i], inp[i + 1], inp[i + W], inp[i + W + 1]);
    }
    return out;
  }
  function forward(img, aspect) {
    const T = M.T, S = M.meta.ch;
    let x = conv3(img, 1, 32, 32, T['c1.weight'], T['c1.bias'], S[0]);
    x = pool2(conv3(x, S[0], 32, 32, T['c2.weight'], T['c2.bias'], S[1]), S[1], 32, 32);
    x = conv3(x, S[1], 16, 16, T['c3.weight'], T['c3.bias'], S[2]);
    x = pool2(conv3(x, S[2], 16, 16, T['c4.weight'], T['c4.bias'], S[3]), S[3], 16, 16);
    x = pool2(conv3(x, S[3], 8, 8, T['c5.weight'], T['c5.bias'], S[4]), S[4], 8, 8);
    const nin = x.length + 1, F1 = T['f1.weight'], nh = T['f1.bias'].length, feat = new Float32Array(nh), a = Math.max(-3, Math.min(3, aspect));
    for (let j = 0; j < nh; j++) { let s = T['f1.bias'][j]; const r = j * nin; for (let i = 0; i < x.length; i++) s += F1[r + i] * x[i]; s += F1[r + x.length] * a; feat[j] = s > 0 ? s : 0; }
    const F2 = T['f2.weight'], nc = T['f2.bias'].length, lg = new Float32Array(nc); let mx = -1e9;
    for (let k = 0; k < nc; k++) { let s = T['f2.bias'][k]; for (let j = 0; j < nh; j++) s += F2[k * nh + j] * feat[j]; lg[k] = s; if (s > mx) mx = s; }
    let z = 0; for (let k = 0; k < nc; k++) z += Math.exp(lg[k] - mx);
    const lz = mx + Math.log(z); for (let k = 0; k < nc; k++) lg[k] -= lz;
    return { logp: lg, feat };
  }
  let cv = null;
  function render(strokes) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const s of strokes) for (const [x, y] of s) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const w = Math.max(x1 - x0, 1e-3), h = Math.max(y1 - y0, 1e-3), sc = BOX / Math.max(w, h);
    const ox = (R - w * sc) / 2 - x0 * sc, oy = (R - h * sc) / 2 - y0 * sc, N = R * SS;
    if (!cv) { cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(N, N) : Object.assign(document.createElement('canvas'), { width: N, height: N }); }
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.clearRect(0, 0, N, N); g.strokeStyle = g.fillStyle = '#fff'; g.lineWidth = 2.2 * SS; g.lineCap = g.lineJoin = 'round';
    for (const s of strokes) {
      g.beginPath();
      s.forEach(([x, y], i) => { const px = (x * sc + ox) * SS, py = (y * sc + oy) * SS; i ? g.lineTo(px, py) : g.moveTo(px, py); });
      if (s.length === 1) { const [x, y] = s[0]; g.arc((x * sc + ox) * SS, (y * sc + oy) * SS, 1.1 * SS, 0, 7); g.fill(); } else g.stroke();
    }
    const d = g.getImageData(0, 0, N, N).data, hi = new Float32Array(N * N);
    for (let i = 0; i < N * N; i++) hi[i] = d[i * 4 + 3] / 255;
    const tmp = new Float32Array(R * N), img = new Float32Array(R * R), wts = [];
    for (let k = -4; k < 4; k++) wts.push(Math.max(0, 1 - Math.abs(k + 0.5) / 4));
    const ws = wts.reduce((a, b) => a + b, 0);
    for (let y = 0; y < N; y++) for (let X = 0; X < R; X++) { let s = 0; const c = X * SS + 2; for (let k = -4; k < 4; k++) { const xx = c + k; if (xx >= 0 && xx < N) s += hi[y * N + xx] * wts[k + 4]; } tmp[y * R + X] = s / ws; }
    for (let Y = 0; Y < R; Y++) for (let X = 0; X < R; X++) { let s = 0; const c = Y * SS + 2; for (let k = -4; k < 4; k++) { const yy = c + k; if (yy >= 0 && yy < N) s += tmp[yy * R + X] * wts[k + 4]; } img[Y * R + X] = Math.round(Math.min(1, s / ws) * 255) / 255; }
    return { img, aspect: Math.log(w / h) };
  }

  // ───────── segmentation: strokes → glyph units ─────────
  function units(strokes) {
    const bx = strokes.map((s) => { let a = 1e9, b = -1e9, t = 1e9, u = -1e9; for (const [x, y] of s) { a = Math.min(a, x); b = Math.max(b, x); t = Math.min(t, y); u = Math.max(u, y); } return { a, b, t, u }; });
    const order = strokes.map((_, i) => i).sort((i, j) => (bx[i].a + bx[i].b) - (bx[j].a + bx[j].b));
    const G = [];
    for (const k of order) {
      const { a, b, t, u } = bx[k], g = G[G.length - 1];
      if (g) {
        const ov = Math.min(b, g.b) - Math.max(a, g.a), w = Math.min(b - a, g.b - g.a);
        const c = (a + b) / 2, gc = (g.a + g.b) / 2;
        // overlapping a lot, or one stroke's centre inside the other's span (crossing strokes of + * x # t f)
        const wa = b - a, wg = g.b - g.a, thin = Math.min(wa, wg) < 0.35 * Math.max(wa, wg, 1), vov = Math.min(u, g.u) - Math.max(t, g.t);
        // overlapping a lot, or a thin stroke crossing a wider one at its middle (the bars of + * x # t f)
        if (ov > 0.45 * Math.max(w, 1) || (thin && vov > 0 && ((g.a <= c && c <= g.b) || (a <= gc && gc <= b)))) { g.s.push(k); g.a = Math.min(a, g.a); g.b = Math.max(b, g.b); g.t = Math.min(t, g.t); g.u = Math.max(u, g.u); continue; }
      }
      G.push({ s: [k], a, b, t, u });
    }
    return G;
  }

  // ───────── character language model (trigram, interpolated) ─────────
  function lmScore(lm, h2, h1, c) {
    const V = lm.V;
    const u = (lm.u[c] || 0) + 0.1, uz = lm.un + 0.1 * V;
    const b = lm.b[h1 + c] || 0, bz = lm.bc[h1] || 0;
    const t = lm.t[h2 + h1 + c] || 0, tz = lm.tc[h2 + h1] || 0;
    const pu = u / uz, pb = bz ? b / bz : 0, pt = tz ? t / tz : 0;
    const p = 0.55 * pt + 0.3 * pb + 0.15 * pu;
    return Math.log(Math.max(p, 1e-6));
  }

  // ───────── decoder ─────────
  const isL = (c) => /^[A-Za-z_]$/.test(c), isD = (c) => /^[0-9]$/.test(c);
  const OPEN = { '(': ')', '[': ']', '{': '}' };
  const MULTI = '"!?;:=ij%';
  const P = Object.assign({ cb: 3.5, mm: 0.3, mo: 5.0, lmw: 0.7, mac: 3.0 }, root.CODE_INK_P || {});   // char bonus, merge cost (multi-part / other), LM weight, macro bonus   // symbols whose parts sit side by side or stacked as separate units
  const KW = ['return', 'yylval', 'atoi', 'yytext', 'yyleng', 'printf', 'exit', 'NUMBER', 'ID', 'NL', 'int', 'char', 'float', 'void', 'main', 'if', 'else', 'while', 'for', 'count'];
  const MACROS = {
    pattern: ['[0-9]+', '[a-zA-Z_][a-zA-Z0-9_]*', '[a-zA-Z][a-zA-Z0-9]*', '[a-zA-Z]+', '[a-z]+', '[A-Z]+', '[ \\t]', '[ \\t]+', '\\n', '.', '[0-9]', '[a-zA-Z]', '[aeiouAEIOU]',
      '[+-]?[0-9]+', '[0-9]+"."[0-9]+', '[+\\-*/]', '"if"', '"else"', '"while"', '"for"', '"int"', '[01]+', 'a', 'b', '[a]', '[b]', '.|\\n', '[ \\t\\n]'],
    action: ['return 0;', 'return yytext[0];', ';', 'yylval=atoi(yytext); return NUMBER;', '{ yylval=atoi(yytext); return NUMBER; }', '{ return yytext[0]; }', '{ return 0; }',
      'ECHO;', 'count++;', '{ count++; }', 'printf("%s",yytext);', 'return NL;', 'return ID;', 'return NUMBER;'],
    production: [],
  };
  // the characters a class can stand for
  function charsOf(cls) { const g = M.groups[cls]; return g ? g.split('') : [cls]; }
  function recogniseCode(strokes, opts) {
    if (!M || !strokes.length) return { text: '', tokens: [], readings: [] };
    opts = opts || {};
    const field = opts.field || 'pattern', lexicon = opts.lexicon || [], final = !!opts.final;
    const lm = LMS[field] || LMS.action;
    const U = units(strokes);
    const hs = U.map((u) => u.u - u.t).sort((a, b) => a - b), hmed = Math.max(8, hs[hs.length >> 1] || 20);
    const tallH = hs.filter((h) => h >= 0.6 * hmed); let tH = tallH.length ? tallH[tallH.length >> 1] : hmed;
    if (U.length <= 3) tH = Math.max(tH, opts.lineH || 40);   // too few glyphs to measure the writing size: assume the pad's usual size
    const bottoms = U.filter((u) => u.u - u.t >= 0.5 * tH).map((u) => u.u).sort((a, b) => a - b); const base = bottoms.length ? bottoms[bottoms.length >> 1] : Math.max(...U.map((u) => u.u));
    const ws = U.map((u) => u.b - u.a).sort((a, b) => a - b), wmed = Math.max(6, ws[ws.length >> 1] || 14);
    const cache = new Map();
    const cls = (i, len) => {
      const k = i + ':' + len; if (cache.has(k)) return cache.get(k);
      const ss = []; for (let q = i; q < i + len; q++) U[q].s.forEach((si) => ss.push(strokes[si]));
      const { img, aspect } = render(ss); const r = forward(img, aspect);
      const t = Math.min(...U.slice(i, i + len).map((u) => u.t)), u = Math.max(...U.slice(i, i + len).map((u) => u.u));
      const geo = { h: u - t, top: t, bot: u, mid: (t + u) / 2 };
      // character options with geometry priors
      const opt = [];
      const order = Array.from(r.logp.keys()).sort((a, b) => r.logp[b] - r.logp[a]);
      for (const k of order.slice(0, 7)) {
        const lp = r.logp[k]; if (lp < Math.log(0.002)) continue;
        for (const ch of charsOf(M.classes[k])) opt.push({ ch, lp: lp + geoPrior(ch, geo), cls: M.classes[k] });
      }
      const v = { opt, feat: r.feat, geo }; cache.set(k, v); return v;
    };
    function geoPrior(ch, g) {
      const small = g.h < 0.72 * tH, tiny = g.h < 0.3 * tH, high = g.bot < base - 0.45 * tH, low = g.mid > base - 0.25 * tH;
      if (ch === "'" || ch === '`') return high ? 0.8 : -3;
      if (ch === ',') return high ? -3 : 0.5;
      if (ch === '_') return low ? 0.8 : -2.5;
      if (ch === '-') return low ? -1.5 : 0.5;
      if (ch === '.') return tiny ? 0 : -3;
      if ('cksuvwxzpo'.includes(ch)) return small ? 0.7 : -1.2;
      if ('CKSUVWXZPO0'.includes(ch)) return small ? -1.2 : 0.4;
      if (ch === '|') return g.h > 1.1 * tH ? 0.6 : -0.6;
      if (ch === 'l' || ch === '1' || ch === 'I') return g.h > 1.1 * tH ? -0.4 : 0;
      return 0;
    }
    const lexSet = new Set([...lexicon, ...KW]);
    const lexPre = new Set(); lexSet.forEach((w) => { for (let k = 1; k <= w.length; k++) lexPre.add(w.slice(0, k)); });
    const near1 = (a, b) => { if (Math.abs(a.length - b.length) > 1 || a === b) return false; let i = 0, j = 0, e = 0; while (i < a.length && j < b.length) { if (a[i] === b[j]) { i++; j++; continue; } if (++e > 1) return false; if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; } } return e + (a.length - i) + (b.length - j) <= 1; };
    const lexArr = [...lexSet].filter((w) => w.length >= 4);
    const idScore = (w) => (lexSet.has(w) ? 2.0 : w.length >= 4 && lexArr.some((k) => near1(w, k)) ? -2.5 : 0);
    const gapAt = (i) => (i > 0 ? U[i].a - U[i - 1].b : 0);
    const spaceOK = field !== 'pattern';
    // beam state
    let beams = [{ i: 0, s: '', sc: 0, q: '', br: 0, rng: null, stk: [], id: '', segs: [] }];
    const done = [];
    const LMW = P.lmw;
    for (let step = 0; step < 200 && beams.length; step++) {
      const nxt = [];
      for (const b of beams) {
        if (b.i >= U.length) { done.push(b); continue; }
        for (let len = 1; len <= 3 && b.i + len <= U.length; len++) {
          if (len > 1 && U[b.i + len - 1].a - U[b.i + len - 2].b > 0.35 * hmed) break;
          const c = cls(b.i, len);
          const sp = spaceOK && b.s && gapAt(b.i) > 0.9 * wmed ? ' ' : '';
          for (const o of c.opt) {
            const ch = o.ch;
            let sc = b.sc + o.lp + P.cb - (len - 1) * (MULTI.includes(ch) ? P.mm : P.mo);
            let s = b.s + sp; const h2 = (' ' + ' ' + s).slice(-2, -1), h1 = (' ' + s).slice(-1);
            sc += LMW * lmScore(lm, h2, h1, ch);
            let q = b.q, br = b.br, stk = b.stk, id = b.id;
            // syntax state
            if (q) { if (ch === q) q = ''; }
            else if (ch === '"' || (ch === "'" && field !== 'pattern')) q = ch;
            else if (field === 'pattern' && ch === '[' && !br) { br = 1; }
            else if (field === 'pattern' && ch === ']' && br) {
              br = 0;
            } else if (OPEN[ch]) stk = stk.concat(ch);
            else if (ch === ')' || ch === '}' || (ch === ']' && field !== 'pattern')) { if (stk.length && OPEN[stk[stk.length - 1]] === ch) stk = stk.slice(0, -1); else sc -= 4; }
            // ranges inside a character class must be same-kind and ascending: a-z, A-Z, 0-9
            if (br && s.length >= 2 && s[s.length - 1] === '-' && s[s.length - 2] !== '[' && s[s.length - 2] !== '\\') {
              const a = s[s.length - 2], kind = (x) => (/[a-z]/.test(x) ? 1 : /[A-Z]/.test(x) ? 2 : /[0-9]/.test(x) ? 3 : 0);
              if (kind(a) && (kind(a) !== kind(ch) || ch < a)) sc -= 6; else if (kind(a)) sc += 1.5;
            }
            if (br && ch === ' ' ) sc -= 0;
            // identifiers: lexicon bonus on completion, prefix bonus while typing
            if (!q && (isL(ch) || (id && isD(ch)))) { id = (sp ? '' : id) + ch; if (lexPre.has(id)) sc += 0.4; }
            else { if (id) sc += idScore(id); id = ''; }
            nxt.push({ i: b.i + len, s: s + ch, sc, q, br, rng: null, stk, id, segs: b.segs.concat([{ u0: b.i, len, ch, cls: o.cls, opt: c.opt, sp: !!sp }]) });
          }
        }
      }
      nxt.sort((a, b) => b.sc - a.sc);
      const seen = new Set(); beams = [];
      for (const b of nxt) { const k = b.i + '|' + b.s.slice(-3) + '|' + b.q + b.br + b.stk.join(''); if (seen.has(k)) continue; seen.add(k); beams.push(b); if (beams.length >= 48) break; }
    }
    for (const b of done) {
      if (b.id) b.sc += idScore(b.id);
      b.sc += LMW * lmScore(lm, (' ' + b.s).slice(-2, -1), b.s.slice(-1), '\n');
      if (final || true) { if (b.q) b.sc -= 6; if (b.br) b.sc -= 5; b.sc -= 4 * b.stk.length; }
    }
    // whole-line macros (and lexicon-built productions) by forced alignment
    const macroList = (MACROS[field] || []).slice();
    if (field === 'production' && opts.productions) opts.productions.forEach((p) => macroList.push(p));
    for (const m of macroList) {
      const r = align(m.replace(/ /g, ''), U.length, cls);
      if (r) { let lmS = 0; { let h = '  '; for (const ch of m) { lmS += lmScore(lm, h[0], h[1], ch); h = h[1] + ch; } }
        const sc = r.sc + P.mac + LMW * lmS; done.push({ s: spaceOK ? m : m, sc, segs: r.segs, macro: true }); }
    }
    done.sort((a, b) => b.sc - a.sc);
    const readings = [];
    for (const b of done) { const t = snapLine(b.s.trim(), field, lexSet); if (!readings.some((r) => r.text.replace(/\s/g, '') === t.replace(/\s/g, ''))) readings.push({ text: t, sc: +b.sc.toFixed(2), segs: b.segs }); if (readings.length >= 5) break; }
    if (!readings.length) return { text: '', tokens: [], readings: [] };
    const top = readings[0];
    const tokens = (top.segs || []).map((g) => ({ tok: g.ch, spaceBefore: !!g.sp, alts: dedupe(g.opt).slice(0, 8).map((o) => ({ tok: o.ch, lp: o.lp, cls: o.cls })), units: Array.from({ length: g.len }, (_, q) => g.u0 + q), strokes: Array.from({ length: g.len }, (_, q) => U[g.u0 + q].s).flat(), cand: { feat: (cache.get(g.u0 + ':' + g.len) || {}).feat } }));
    return { text: top.text, tokens, readings };
  }

  // ───────── post-correction (cheap, deterministic) ─────────
  function snapLine(t, field, lexSet) {
    const words = [...lexSet].filter((w) => w.length >= 4);
    const ed1 = (a, b) => { if (Math.abs(a.length - b.length) > 1) return false; let i = 0, j = 0, e = 0; while (i < a.length && j < b.length) { if (a[i] === b[j]) { i++; j++; continue; } if (++e > 1) return false; if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; } } return e + (a.length - i) + (b.length - j) <= 1; };
    let inQ = false, out = '', k = 0;
    while (k < t.length) {
      const c = t[k];
      if (c === '"') { inQ = !inQ; out += c; k++; continue; }
      if (!inQ && /[A-Za-z_]/.test(c)) {
        let w = ''; while (k < t.length && /[A-Za-z0-9_]/.test(t[k])) w += t[k++];
        if (!lexSet.has(w) && w.length >= 4) { const m = words.find((x) => ed1(w, x)); if (m) w = m; }
        out += w; continue;
      }
      out += c; k++;
    }
    if (field !== 'pattern') {
      out = out.replace(/,(\s*\})/g, ';$1').replace(/,\s*$/, ';').replace(/\)\s*(\})/g, '); $1').replace(/\);\s*;/g, ');')
               .replace(/\b(printf|atoi|strlen|exit)\s*[\\|{\[]/g, '$1(');
      if (/^\{.*[^;\s]\s*\}$/.test(out) && !/;\s*\}$/.test(out)) out = out.replace(/\s*\}$/, '; }');
    }
    return out;
  }
  const dedupe = (opt) => { const o = [], s = new Set(); for (const x of (opt || []).slice().sort((a, b) => b.lp - a.lp)) if (!s.has(x.ch)) { s.add(x.ch); o.push(x); } return o; };
  // forced alignment of a target string to the units: dp over (units used, chars produced); each char takes 1..3 units
  function align(target, nU, cls) {
    const n = target.length; if (n === 0 || n > nU || nU > 3 * n) return null;
    const NEG = -1e9, dp = Array.from({ length: nU + 1 }, () => new Float64Array(n + 1).fill(NEG)), bk = Array.from({ length: nU + 1 }, () => new Int8Array(n + 1));
    dp[0][0] = 0;
    for (let i = 0; i < nU; i++) for (let j = 0; j < n; j++) {
      if (dp[i][j] <= NEG / 2) continue;
      for (let len = 1; len <= 3 && i + len <= nU; len++) {
        const c = cls(i, len), o = c.opt.find((x) => x.ch === target[j]);
        const lp = o ? o.lp : Math.log(1e-4) - 3;
        const v = dp[i][j] + lp + P.cb - (len - 1) * (MULTI.includes(target[j]) ? P.mm : P.mo);
        if (v > dp[i + len][j + 1]) { dp[i + len][j + 1] = v; bk[i + len][j + 1] = len; }
      }
    }
    if (dp[nU][n] <= NEG / 2) return null;
    const segs = []; let i = nU, j = n;
    while (j > 0) { const len = bk[i][j]; i -= len; j -= 1; const c = cls(i, len); segs.unshift({ u0: i, len, ch: target[j], cls: (c.opt.find((x) => x.ch === target[j]) || {}).cls, opt: c.opt }); }
    // a macro must explain the ink well: average per-char log-prob above a floor
    if ((dp[nU][n] - n * P.cb) / n < Math.log(0.02)) return null;
    return { sc: dp[nU][n], segs };
  }
  const MODEL_VERSION = () => (M && M.meta && M.meta.version) || 'code-v2';
  const api = { MODEL_VERSION, loadCodeModel, recogniseCode, render, forward, units, _set: (m, lms) => { M = m; LMS = lms; }, _unpack: unpack, align };
  root.CodeInkEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
