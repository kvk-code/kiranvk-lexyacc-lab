// Core regression tests: the checker's verdicts on known-good and known-bad programs, and the simulator on the manual's examples.
global.window = global; require('../vendor/jison.min.js');
const L = require('../lexyacc-core.js');
let fail = 0; const t = (name, cond, extra) => { if (!cond) { fail++; console.log('✗ ' + name + (extra ? '  ' + extra : '')); } else console.log('✓ ' + name); };
const has = (an, re) => an.issues.some((x) => re.test(x.msg));

const anbn = { rules: [{ pattern: 'a', action: 'return A;' }, { pattern: 'b', action: 'return B;' }, { pattern: '\\n', action: 'return NL;' }, { pattern: '.', action: 'return yytext[0];' }],
  grammar: 'stmt : S NL { printf("Valid string\\n"); exit(0); }\n;\nS : A S B\n  |\n  ;', onError: 'Invalid string' };
let an = L.analyse(anbn);
t('anbn: ok, no conflicts', an.ok && an.conflicts === 0);
t('anbn: aabb accepted', L.runYacc(anbn, 'aabb\n', an).output === 'Valid string\n');
t('anbn: aab rejected', L.runYacc(anbn, 'aab\n', an).output === 'Invalid string\n');

const calc = { rules: [{ pattern: '[0-9]+', action: 'yylval=atoi(yytext); return NUMBER;' }, { pattern: '[ \\t]', action: ';' }, { pattern: '\\n', action: 'return 0;' }, { pattern: '.', action: 'return yytext[0];' }],
  prec: "%left '+' '-'\n%left '*' '/'", grammar: "S : E { printf(\"Result=%d\\n\", $1); }\n;\nE : E '+' E { $$=$1+$3; }\n | E '-' E { $$=$1-$3; }\n | E '*' E { $$=$1*$3; }\n | E '/' E { $$=$1/$3; }\n | '(' E ')' { $$=$2; }\n | NUMBER { $$=$1; }\n;", onError: 'Invalid' };
an = L.analyse(calc);
t('calc: precedence 2+3*4=14', L.runYacc(calc, '2+3*4\n', an).output === 'Result=14\n');
t('calc: left assoc 8-3-2=3', L.runYacc(calc, '8-3-2\n', an).output === 'Result=3\n');
t('calc: no prec → shift/reduce warned', has(L.analyse(Object.assign({}, calc, { prec: '' })), /shift\/reduce/));

// mistakes students make
t('missing return → error', !L.analyse({ rules: [{ pattern: 'a', action: 'printf("a");' }], grammar: 'S : A ;' }).ok);
t('undefined token B', has(L.analyse({ rules: [{ pattern: 'a', action: 'return A;' }, { pattern: '\\n', action: 'return 0;' }], grammar: 'S : A S B | ;' }), /"B".*neither a token/));
t('char literal used, no yytext[0] rule', has(L.analyse({ rules: [{ pattern: '[0-9]+', action: 'return NUM;' }, { pattern: '\\n', action: 'return 0;' }], grammar: "E : E '+' NUM | NUM ;" }), /no LEX rule returns single characters/));
t('no base case', has(L.analyse({ rules: [{ pattern: 'a', action: 'return A;' }, { pattern: '\\n', action: 'return 0;' }], grammar: 'S : A S ;' }), /can never finish/));
t('shadowed keyword rule', has(L.analyse({ mode: 'lex', rules: [{ pattern: '[a-z]+', action: 'printf("id");' }, { pattern: 'if', action: 'printf("kw");' }] }), /never used/));
t('empty-match pattern', has(L.analyse({ mode: 'lex', rules: [{ pattern: '[0-9]*', action: ';' }] }), /empty string/));
t('double quotes in grammar', has(L.analyse({ rules: [{ pattern: '.', action: 'return yytext[0];' }], grammar: 'S : "a" ;' }), /single quotes/));
t('%union rejected', has(L.analyse({ rules: [{ pattern: '.', action: 'return yytext[0];' }], prec: '%union { int i; }', grammar: "S : 'a' ;" }), /not used in our lab/));
t('token also a head', has(L.analyse({ rules: [{ pattern: 'a', action: 'return S;' }], grammar: 'S : S | ;' }), /both|token but also/));
t('bad regex', has(L.analyse({ mode: 'lex', rules: [{ pattern: '[a-z', action: ';' }] }), /not closed/));
t('definitions {digit}', L.analyse({ mode: 'lex', defs: [{ name: 'digit', pattern: '[0-9]' }], rules: [{ pattern: '{digit}+', action: ';' }] }).ok);

// LEX-only
const vc = { mode: 'lex', decls: 'int v=0, c=0;', rules: [{ pattern: '[aeiouAEIOU]', action: 'v++;' }, { pattern: '[a-zA-Z]', action: 'c++;' }, { pattern: '.|\\n', action: ';' }], endCode: 'printf("Vowels=%d Consonants=%d\\n", v, c);' };
t('lex: vowels/consonants', L.runLex(vc, 'hello world\n').output === 'Vowels=3 Consonants=7\n', JSON.stringify(L.runLex(vc, 'hello world\n')));
const up = { mode: 'lex', rules: [{ pattern: '[a-z]', action: 'printf("%c", yytext[0]-32);' }] };
t('lex: yytext[0]-32 upper + ECHO', L.runLex(up, 'ab1\n').output === 'AB1\n', JSON.stringify(L.runLex(up, 'ab1\n').output));
const asm = L.assemble(calc).files['prog.y'];
t('assemble: %token NUMBER + %left kept', /%token NUMBER/.test(asm) && /%left '\*' '\/'/.test(asm));
console.log(fail ? fail + ' FAILED' : 'all core tests pass'); process.exit(fail ? 1 : 0);
