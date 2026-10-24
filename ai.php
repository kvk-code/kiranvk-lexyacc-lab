<?php
// LEX–YACC Lab: AI tutor relay. The student's own NVIDIA NIM key is relayed for ONE call and is never stored or logged.
// Reuses the Wumpus/Logic Lab server library (config outside the web root, NVIDIA model + fallback chain, usage locking).
// POST {test_key}                                                   → {ok, ms, model}
// POST {user_key, kind:"unstuck"|"ask"|"issue", level?, context:{…}, question?, repair?} → {ok, text, model, ms}
declare(strict_types=1);
require __DIR__ . '/../../ai/wumpus/lib.php';
header('X-Content-Type-Options: nosniff');
const LY_VERSION = '1.0.0';

$cfg = wj_load_config();
$nv = wj_provider_by_id($cfg, 'nvidia');
$model = $nv ? (string)$nv['model'] : 'nvidia/nemotron-3-ultra-550b-a55b';
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') wj_json(['version' => LY_VERSION, 'model' => $model]);
$in = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($in)) wj_json(['ok' => false, 'reason' => 'bad-json'], 400);
$key = trim((string)($in['user_key'] ?? ($in['test_key'] ?? '')));
if (!wj_valid_user_key($key)) wj_json(['ok' => false, 'reason' => 'bad-key', 'detail' => 'An NVIDIA key looks like nvapi-… (get one free at build.nvidia.com).']);

$ipOk = wj_with_usage(function (&$u) {
    $m = wj_minute_key(); $ip = wj_ip_hash();
    $u['ly_ip'] = array_filter($u['ly_ip'] ?? [], fn($v) => ($v['m'] ?? 0) === $m);
    $c = ($u['ly_ip'][$ip]['n'] ?? 0) + 1;
    if ($c > 150) return false;          // a whole class shares one college NAT IP
    $u['ly_ip'][$ip] = ['m' => $m, 'n' => $c];
    return true;
});
if ($ipOk === false) wj_json(['ok' => false, 'reason' => 'slow-down', 'detail' => 'Too many questions in one minute. Wait a moment.']);

$SYS = <<<TXT
You are a patient tutor for the CSL411 Compiler Lab (KTU S7 B.Tech CSE, NSS College of Engineering, Palakkad).
Students write LEX and YACC programs exactly in the style of the department lab manual. You help one student who is
building a LEX (+ YACC) program on a self-study board. The board gives you JSON: the question, the student's LEX
rules (pattern + action), their YACC productions and declarations, and the CHECKER's findings.

The style we use (never go beyond it):
- LEX file: %{ #include "y.tab.h"  extern int yylval; %}  then rules like
  [0-9]+  { yylval=atoi(yytext); return NUMBER; }     [ \\t]  ;     \\n  return 0;   (or return NL;)     .  return yytext[0];
  then %% and int yywrap(){ return 1; }. A LEX-only program prints/counts in the actions and main() calls yylex().
- YACC file: %token NAMES, %left '+' '-' then %left '*' '/' for precedence, productions written  S : A S B | ;
  with actions at the END of an alternative: { \$\$=\$1+\$3; } or { printf("Valid\\n"); exit(0); },
  yyerror prints the invalid message, main(){ yyparse(); }. Build: lex x.l ; yacc -d x.y ; cc lex.yy.c y.tab.c ; ./a.out
- NEVER suggest: %union, %type, %define, %code, the error token / error recovery, start conditions (%x, BEGIN),
  REJECT, yymore, mid-rule actions, %expect, locations, C++ or reentrant options, flex-only options.

Rules for you:
1. The checker is always right about errors and conflicts. Never contradict it. Explain its finding in simple words.
   The board also gives you lexRuleMeaning (what each LEX rule really does) and runs (what the program did on the sample
   inputs: the tokens YACC received, ACCEPTED or SYNTAX ERROR, and the output). These are facts from a simulator: trust
   them over your own reading of the rules. A LEX rule whose action is `;` deliberately DISCARDS what it matches (that is
   how comment text, blanks and newlines are skipped); never call it "missing an action" or "doing nothing" as a fault.
   If the checker says ready and the runs give the expected results, the program WORKS: say so first, then only suggest
   an improvement if the question needs something the runs did not test (and say exactly which input would fail).
   A SYNTAX ERROR on an input that is invalid for the question (an unclosed comment, a wrong string) is the parser working
   correctly, not a fault. If a run has matchesExpected=true it is right; false means it differs from the reference program.
   Never invent a problem. Never use a token or nonterminal in a suggested line unless you also say where it comes from.
6. YACC facts you must respect: a grammar sees ONLY the tokens LEX returns (lexRuleMeaning / tokensYaccReceived), never
   the characters LEX discarded, so you cannot "consume the text between" two tokens in YACC if LEX skipped it, and there is
   no `.` wildcard in a production. Every symbol in a production is a %token, a quoted 'c' char that LEX returns with
   return yytext[0];, or a nonterminal that has its own production.
2. Teach, don't hand over the program. Point at the row / production by number. Level 1 = a nudge or guiding
   question. Level 2 = say exactly which rule or production is wrong or missing and why. Level 3 = give the ONE line
   (one LEX rule or one production) they need next, in the style above, and say why.
3. Short: at most 120 words. Plain sentences. No headings, no markdown bold, no tables. Put code in `backticks`.
4. Simple English. If the student mixes Malayalam, still answer in simple English.
5. If the question is not about this LEX/YACC program, say in one sentence that you can only help with it here.
TXT;

$kind = in_array($in['kind'] ?? '', ['unstuck', 'ask', 'issue'], true) ? $in['kind'] : null;
$isTest = isset($in['test_key']);
if (!$isTest && !$kind) wj_json(['ok' => false, 'reason' => 'bad-request'], 400);
$ctx = is_array($in['context'] ?? null) ? $in['context'] : [];
$ctxJson = mb_substr(json_encode($ctx, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), 0, 10000);
$q = mb_substr(trim((string)($in['question'] ?? '')), 0, 600);
$lvl = max(1, min(3, (int)($in['level'] ?? 1)));
// ground truth from the board's simulator: does the program already work on the sample inputs?
$runs = is_array($ctx['runs'] ?? null) ? $ctx['runs'] : [];
$chk = implode(' ', array_map('strval', (array)($ctx['checker'] ?? [])));
$checkerClean = !preg_match('/\bERR(OR)?:/', $chk);
// a SYNTAX ERROR on an input that SHOULD be rejected (an unclosed comment, a bad string) is correct behaviour, so only
// a mismatch with the reference program's expected output, or an unsimulable run, counts against the program
$bad = array_filter($runs, fn($r) => is_array($r) && (($r['matchesExpected'] ?? null) === false || preg_match('/not simulable/', (string)($r['result'] ?? ''))));
$works = $checkerClean && $runs && !$bad;
$fact = $works ? "\n\nFACT FROM THE BOARD: the checker has no errors and the program behaved as written on every sample input (see runs). Treat the program as WORKING. Start by saying it works. Only if the question needs a case the samples do not cover, name that exact input and what would go wrong; otherwise say nothing needs fixing." : '';
$user = $isTest ? 'Reply with exactly: ready'
    : ($kind === 'unstuck'
        ? "Board state:\n$ctxJson\n\nThe student pressed Unstuck (level $lvl of 3). The step they are on is: " . (string)($ctx['step'] ?? 'tokens') . ". " .
          $fact . ' ' . ($lvl === 1 ? 'Give a nudge: one guiding question or the idea of what to do next. Do not write code.'
          : ($lvl === 2 ? 'Say exactly which LEX rule row or which production is wrong or missing, and why. You may name the token or symbol, but do not write the full line.'
          : 'Give the ONE next line they need (one LEX rule `pattern  action` or one production `head : body { action }`), in the lab style, then one sentence why.'))
        : ($kind === 'issue'
            ? "Board state:\n$ctxJson\n\nExplain this checker finding to the student in at most 3 short sentences, using their actual rules and productions, and hint at the fix without writing the whole corrected program:\n" . mb_substr((string)($in['issue'] ?? ''), 0, 500)
            : "Board state:\n$ctxJson$fact\n\nStudent's question: $q"));

$rep = $in['repair'] ?? null;
if (!$isTest && is_array($rep) && isset($rep['draft'], $rep['issues']) && is_array($rep['issues'])) {
    $iss = implode("\n", array_map(fn($x) => '- ' . mb_substr((string)$x, 0, 300), array_slice($rep['issues'], 0, 6)));
    $user .= "\n\nYour previous answer was:\n" . mb_substr((string)$rep['draft'], 0, 2500) . "\n\nThe board's checker found these problems with it:\n$iss\n\nRewrite the answer so every problem is fixed, keep the lab style and the length limit, and do not mention this correction.";
}
$body = [
    'model' => $model, 'temperature' => 0.3, 'max_tokens' => $isTest ? 200 : 700,
    'messages' => [['role' => 'system', 'content' => $SYS], ['role' => 'user', 'content' => $user]],
    'chat_template_kwargs' => ['enable_thinking' => false],
    'reasoning_effort' => 'low',
];
$chain = array_values(array_unique(array_merge([$model], array_filter((array)($nv['fallback_models'] ?? []), 'is_string'))));
$t0 = microtime(true); $used = $model; $raw = false; $http = 0; $cerr = '';
foreach ($chain as $ci => $m) {
    $body['model'] = $m; $used = $m;
    $ch = curl_init('https://integrate.api.nvidia.com/v1/chat/completions');
    curl_setopt_array($ch, [
        CURLOPT_POST => true, CURLOPT_POSTFIELDS => json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Authorization: Bearer ' . $key, 'Accept: application/json'],
        CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => $ci < count($chain) - 1 ? ($isTest ? 7 : (int)($nv['primary_timeout_s'] ?? 20)) : 45,
        CURLOPT_CONNECTTIMEOUT => 8, CURLOPT_SSL_VERIFYPEER => true,
    ]);
    $raw = curl_exec($ch); $http = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $cerr = curl_error($ch); curl_close($ch);
    if ($http === 401 || $http === 403) break;
    $jj = ($raw !== false && $http >= 200 && $http < 300) ? json_decode((string)$raw, true) : null;
    $cc = $jj['choices'][0]['message']['content'] ?? '';
    if (is_array($cc)) $cc = implode('', array_map(fn($x) => $x['text'] ?? '', $cc));
    if (trim((string)$cc) !== '') break;
}
$ms = (int)round((microtime(true) - $t0) * 1000);
$ok = false; $text = ''; $err = '';
if ($raw === false) $err = 'network: ' . substr($cerr, 0, 100);
elseif ($http === 401 || $http === 403) $err = 'NVIDIA rejected the key';
elseif ($http === 429) $err = 'NVIDIA rate limit. Try again in a minute';
elseif ($http < 200 || $http >= 300) $err = 'NVIDIA error ' . $http;
else {
    $j = json_decode((string)$raw, true);
    $c = $j['choices'][0]['message']['content'] ?? '';
    if (is_array($c)) $c = implode('', array_map(fn($x) => $x['text'] ?? '', $c));
    $text = trim(preg_replace('/<think>.*?<\/think>/s', '', (string)$c));
    $text = preg_replace('/\*\*|^#+\s*/m', '', $text);
    if ($text === '') $err = 'empty answer'; else $ok = true;
}
wj_with_usage(function (&$u) use ($ok, $isTest, $kind) {
    $d = &$u['days'][wj_today()];
    $k = $isTest ? 'tests' : $kind;
    $d['lexyacc'][$k] = ($d['lexyacc'][$k] ?? 0) + 1;
    if (!$ok) $d['lexyacc']['errors'] = ($d['lexyacc']['errors'] ?? 0) + 1;
    return true;
});
if (!$ok) wj_json(['ok' => false, 'reason' => 'provider', 'detail' => $err, 'ms' => $ms]);
wj_json(['ok' => true, 'text' => mb_substr($text, 0, 1800), 'model' => $used, 'ms' => $ms]);
