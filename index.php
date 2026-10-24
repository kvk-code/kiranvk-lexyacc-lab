<?php
// LEX–YACC Lab shell. Every asset is cache-busted by mtime so a deploy shows on the next load.
header('Cache-Control: no-cache, no-store, must-revalidate');
$v = fn($f) => $f . '?v=' . @filemtime(__DIR__ . '/' . $f);
?><!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>LEX–YACC Lab · CSL411 Compiler Lab (KTU S7) · kiranvk.me</title>
<meta name="description" content="Build LEX and YACC programs step by step: tokens and regular expressions first, then the grammar. Every step is checked in the browser, with Unstuck hints and an optional AI tutor. CSL411 Compiler Lab, KTU S7.">
<link rel="canonical" href="https://kiranvk.me/compiler-lab/lexyacc/">
<meta name="robots" content="index, follow">
<meta property="og:type" content="website">
<meta property="og:site_name" content="kiranvk.me">
<meta property="og:url" content="https://kiranvk.me/compiler-lab/lexyacc/">
<meta property="og:title" content="LEX–YACC Lab · CSL411 Compiler Lab (KTU S7)">
<meta property="og:description" content="Practise LEX and YACC for the KTU S7 Compiler Lab exam: 52 past questions, a browser checker and an AI tutor. Free, no login.">
<meta property="og:image" content="https://kiranvk.me/compiler-lab/lexyacc/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="627">
<meta property="og:image:alt" content="LEX–YACC Lab: practise for the CSL411 lab exam step by step">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="<?= $v('style.css') ?>">
<script>(function(){try{var p=JSON.parse(localStorage.getItem('kvkme.prefs')||'{}'),t=p.theme||'auto';if(t==='auto')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';if(t==='dark')document.documentElement.setAttribute('data-theme','dark');}catch(e){}})();</script>
</head>
<body>
<!-- ═══ wrap:v2-bar ═══ -->
<!-- v2-bar.html — slim v2-styled top bar injected into deep-linked game apps
     so they feel continuous with the new site. Loads its own font/color
     tokens so it works even on pages with no shared CSS. -->
<style id="v2-bar-style">
  :root { --v2b-ink:#2b2620; --v2b-paper:#e9e2d3; --v2b-accent:#a8532a; --v2b-line:#d3c8b4; }
  html[data-theme="dark"] { --v2b-ink:#ddd3c2; --v2b-paper:#1b1714; --v2b-accent:#e0905e; --v2b-line:#3e362d; }
  #v2-bar { position: fixed; top: 0; left: 0; right: 0; z-index: 9999;
    display: flex; align-items: center; gap: 14px; padding: 10px 18px;
    background: color-mix(in srgb, var(--v2b-paper) 92%, transparent); backdrop-filter: blur(8px);
    border-bottom: 1px solid var(--v2b-line);
    font-family: 'Instrument Serif', Georgia, serif; color: var(--v2b-ink);
    font-size: 16px; letter-spacing: -.005em;
  }
  #v2-bar .wm { font-weight: 400; font-size: 18px; text-decoration: none; color: var(--v2b-ink); }
  #v2-bar .wm span { color: var(--v2b-accent); }
  #v2-bar .sep { color: #b6a892; margin: 0 2px; }
  #v2-bar a.up { text-decoration: none; color: var(--v2b-ink); border-bottom: 1px dashed transparent; padding: 2px 0; transition: border-color .15s; }
  #v2-bar a.up:hover { border-bottom-color: var(--v2b-accent); }
  #v2-bar .spacer { flex: 1; }
  #v2-bar .search-link { font-family: 'JetBrains Mono', monospace; font-size: 12px; letter-spacing: .05em; text-transform: uppercase; color: var(--v2b-ink); text-decoration: none; padding: 4px 10px; border: 1px solid var(--v2b-line); border-radius: 999px; }
  #v2-bar .search-link:hover { border-color: var(--v2b-accent); color: var(--v2b-accent); }
  body { padding-top: 46px !important; }
  @media (max-width: 500px) { #v2-bar { font-size: 14px; padding: 8px 12px; } #v2-bar .search-link { display: none; } }
  @media print { #v2-bar { display: none; } body { padding-top: 0 !important; } }
</style>
<div id="v2-bar" role="banner">
  <a class="wm" href="/">kvk<span>.</span></a>
  <span class="sep">/</span>
  <a class="up" href="/s7-compiler">S7 Compiler Lab</a>
  <div class="spacer"></div>
  <a class="search-link" href="/search">Search ⌘K</a>
</div>

<!-- ═══ wrap:v2-theme ═══ (replaced 2026-10-11: the board carries its own calm site-palette in style.css; the generic paper/white override was too bright) -->

<header class="top">
  <div class="brand"><span class="logo">%%</span><div><b>LEX–YACC Lab</b><small>CSL411 Compiler Lab · tokens → grammar → a working program</small></div></div>
  <div class="top-act">
    <button class="btn ghost" id="btn-theme" title="Light / dark (shared with kiranvk.me)" aria-label="Toggle dark theme">◐</button>
    <button class="btn ghost" id="btn-new" title="Start a new program">＋ New</button>
    <button class="btn ghost" id="btn-key" title="Your NVIDIA key for the AI tutor"><span class="dot" id="key-dot"></span> AI tutor</button>
  </div>
</header>

<main class="wrap">
  <section class="card qcard">
    <div class="row between">
      <h2>0 · The question</h2>
      <div class="row gap">
        <select id="bank" aria-label="Pick a question from the bank"><option value="">Pick a past question…</option></select>
        <div class="seg" id="mode" role="radiogroup" aria-label="Program type">
          <button data-m="yacc" class="on">LEX + YACC</button><button data-m="lex">LEX only</button>
        </div>
      </div>
    </div>
    <textarea id="question" rows="3" placeholder="Paste the question here, e.g.  Write a YACC program to recognise strings of the language aⁿbⁿ, n ≥ 1."></textarea>
    <div class="row gap note" id="q-src"></div>
  </section>

  <section class="card vidcard" aria-label="Walkthrough video">
    <div class="vidtext">
      <h2>Walkthrough <span class="vidlen">3:55 · watch first</span></h2>
      <p class="vidnote">The whole lab in one video: picking a past question, the LEX token rules, the YACC grammar, trying inputs in the browser, and the final .l + .y files. The optional AI-tutor key has its own video under <b>AI tutor</b>.</p>
      <p class="vidlink"><a href="https://youtu.be/RR00V0inefU" target="_blank" rel="noopener">Watch on YouTube ↗</a></p>
    </div>
    <div class="vidframe"><iframe src="https://www.youtube-nocookie.com/embed/RR00V0inefU" title="LEX + YACC Compiler Lab, step by step" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>
  </section>

  <nav class="steps" id="steps">
    <button data-s="tok" class="on"><b>1</b> Tokens <small>LEX: pattern → action</small></button>
    <button data-s="gram"><b>2</b> Grammar <small>YACC: productions</small></button>
    <button data-s="try"><b>3</b> Try it <small>run inputs</small></button>
    <button data-s="asm"><b>4</b> Program <small>.l + .y, one click</small></button>
  </nav>

  <div class="grid">
    <div class="main-col">
      <!-- STEP 1: tokens -->
      <section class="card step" id="step-tok">
        <h2>1 · Tokens: what LEX reads and what it passes on</h2>
        <p class="note">One row per kind of lexeme, <b>in order</b>: on a tie LEX picks the <b>earlier</b> row, otherwise the <b>longest</b> match wins.
        <span class="yo">In a LEX+YACC program each useful row ends with <code>return NAME;</code> — that NAME is the token YACC sees.</span></p>
        <div class="defs-wrap"><details id="defs-box"><summary>Definitions (optional, e.g. <code>digit [0-9]</code>, used as <code>{digit}</code>)</summary><div id="defs"></div><button class="btn small" id="add-def">＋ definition</button></details></div>
        <div class="rules-head"><span>#</span><span>Pattern (regular expression)</span><span>Action (C code)</span><span></span></div>
        <div id="rules"></div>
        <div class="row gap wrapit">
          <button class="btn" id="add-rule">＋ Add rule</button>
          <span class="note">Quick add:</span>
          <button class="chip" data-q="ws">[ \t] ;</button>
          <button class="chip yo" data-q="nl0">\n return 0;</button>
          <button class="chip yo" data-q="nlNL">\n return NL;</button>
          <button class="chip yo" data-q="num">[0-9]+ yylval=atoi…</button>
          <button class="chip yo" data-q="any">. return yytext[0];</button>
        </div>
        <div class="lexonly">
          <label class="lbl">C declarations: counters and variables (go inside <code>%{ … %}</code>)</label>
          <input id="decls" class="mono" placeholder="int count=0, v=0;">
          <label class="lbl">After <code>yylex();</code> in main() (print the counts, etc.)</label>
          <input id="endcode" class="mono" placeholder='printf("vowels=%d consonants=%d\n", v, c);'>
        </div>
        <div class="probe">
          <label class="lbl">See the token stream for a sample input</label>
          <input id="probe" class="mono" placeholder="aabb">
          <div id="stream" class="stream"></div>
        </div>
      </section>

      <!-- STEP 2: grammar -->
      <section class="card step hidden" id="step-gram">
        <h2>2 · Grammar: the YACC productions</h2>
        <p class="note">Write productions the YACC way: <code>S : A S B</code> on one line, <code>| alternative</code> on the next, <code>;</code> to end. An empty alternative is just <code>|</code> with nothing after it. Characters go in single quotes: <code>'+'</code>. Put actions at the end: <code>{ $$=$1+$3; }</code>.</p>
        <label class="lbl">Declarations: precedence, lowest first (optional)</label>
        <textarea id="prec" class="mono" rows="2" placeholder="%left '+' '-'&#10;%left '*' '/'"></textarea>
        <label class="lbl">Productions <span class="note">(the first head is the start symbol)</span></label>
        <div class="gram-edit"><div class="gutter" id="gutter"></div><textarea id="grammar" class="mono" rows="9" spellcheck="false" placeholder="stmt : S NL      { printf(&quot;Valid string\n&quot;); exit(0); }&#10;     ;&#10;S    : A S B&#10;     |&#10;     ;"></textarea></div>
        <div class="row gap wrapit"><button class="btn small" id="ink-gram">✍ Write a production by hand</button><span class="note">Tokens from step 1: <span id="toklist" class="mono"></span></span></div>
        <label class="lbl">yyerror() message (printed when the input is not in the language)</label>
        <input id="onerr" class="mono" placeholder="Invalid string">
        <details class="more"><summary>main() body (default: <code>yyparse();</code>)</summary><textarea id="maincode" class="mono" rows="2" placeholder='printf("Enter the string:\n");&#10;yyparse();'></textarea></details>
      </section>

      <!-- STEP 3: try -->
      <section class="card step hidden" id="step-try">
        <h2>3 · Try it</h2>
        <p class="note">The board runs your rules and grammar right here in the browser, the way LEX and YACC would. One input per box; the newline at the end counts.</p>
        <div id="tests"></div>
        <div class="row gap"><button class="btn" id="add-test">＋ Add input</button><button class="btn primary" id="run-all">▶ Run all</button></div>
        <div id="run-out"></div>
      </section>

      <!-- STEP 4: assemble -->
      <section class="card step hidden" id="step-asm">
        <h2>4 · Your program, in the lab-manual format</h2>
        <p class="note">Your rows and productions, wrapped in the same skeleton as the lab manual. Copy them to the lab machine (or an online LEX/YACC runner) and build with the commands below.</p>
        <div id="asm-warn"></div>
        <div id="asm-files"></div>
        <div class="cmds"><b>Build &amp; run</b><pre id="asm-cmds" class="mono"></pre></div>
        <div class="row gap"><button class="btn" id="dl-zip">⬇ Download files</button><button class="btn ghost" id="show-ref">Compare with the reference solution</button></div>
        <div id="ref"></div>
      </section>

      <!-- shared handwriting dock -->
      <section class="card hidden" id="ink-dock">
        <div class="row between"><b>✍ Write: <span id="ink-target" class="mono"></span></b><button class="btn small ghost" id="ink-close">Close</button></div>
        <div id="inkpad" class="inkpad"></div>
      </section>
    </div>

    <aside class="side">
      <section class="card checker" id="checker">
        <div class="row between"><h2>Checker</h2><span id="verdict" class="pill">…</span></div>
        <ul id="issues"></ul>
      </section>
      <section class="card tutor" id="tutor">
        <div class="row between"><h2>Unstuck</h2><span class="note" id="tutor-model"></span></div>
        <div class="row gap"><button class="btn" data-l="1">① Nudge</button><button class="btn" data-l="2">② What's wrong</button><button class="btn" data-l="3">③ Next line</button></div>
        <div class="ask row gap"><input id="ask" placeholder="Ask about your program…"><button class="btn primary" id="ask-go">Ask</button></div>
        <div id="tutor-out"></div>
      </section>
    </aside>
  </div>
</main>
<p class="src-link" style="text-align:center;font-size:.85rem;opacity:.8;margin:18px 0 28px">Free and open source: <a href="https://github.com/kvk-code/kiranvk-lexyacc-lab" rel="noopener" target="_blank">Source on GitHub</a> (MIT) · contributions welcome</p>

<div class="modal hidden" id="modal"><div class="box">
  <h3>AI tutor: your own free NVIDIA key</h3>
  <p class="note">Get a free key at <a href="https://build.nvidia.com" target="_blank" rel="noopener">build.nvidia.com</a> (it starts with <code>nvapi-</code>). It stays in <b>this browser only</b>, and each question is relayed once to NVIDIA and never stored. Everything except Unstuck and Ask works without a key.</p>
  <div class="vidframe modal-vid"><iframe src="https://www.youtube-nocookie.com/embed/qy1mGmAkTbY" title="Get your free NVIDIA API key — step by step" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>
  <p class="vidlink">Prefer to watch? <a href="https://youtu.be/qy1mGmAkTbY" target="_blank" rel="noopener">Get your free NVIDIA API key — step by step (3 min) ↗</a></p>
  <input id="key" class="mono" placeholder="nvapi-…" autocomplete="off">
  <div class="row gap"><button class="btn primary" id="key-save">Save &amp; test</button><button class="btn ghost" id="key-clear">Remove key</button><span style="flex:1"></span><button class="btn ghost" id="key-close">Close</button></div>
  <div id="key-st" class="note"></div>
</div></div>

<script src="<?= $v('vendor/jison.min.js') ?>"></script>
<script src="<?= $v('lexyacc-core.js') ?>"></script>
<script src="<?= $v('bank.js') ?>"></script>
<script src="<?= $v('ink/ink.js') ?>"></script>
<script src="<?= $v('ink/code-ink.js') ?>"></script>
<script>window.INK_BASE = 'ink/';</script>
<script src="<?= $v('app.js') ?>"></script>
</body>
</html>
