# Generate code eval set for LEX/YACC handwriting recognition.
# ~150 realistic LEX/YACC fragments rendered as synthetic stroke lines.
import json, random, math, pickle, os, sys
random.seed(42)

# Symbol stroke generators (similar to gen_eval.py but for code symbols)
def J(p, s=0.06): return [p[0]+random.gauss(0,s), p[1]+random.gauss(0,s)]
def draw_line(a, b, n=12): return [J([a[0]+(b[0]-a[0])*i/n, a[1]+(b[1]-a[1])*i/n], 0.015) for i in range(n+1)]
def arc(cx, cy, rx, ry, a0, a1, n=24): return [[cx+rx*math.cos(math.radians(a0+(a1-a0)*i/n)), cy+ry*math.sin(math.radians(a0+(a1-a0)*i/n))] for i in range(n+1)]

def rnd():
    return random.uniform(-.08, .08)

def gen_glyph(sym):
    """Generate stroke data for a symbol."""
    # Letters
    if len(sym) == 1 and sym.isalpha():
        return gen_letter(sym)
    if len(sym) == 1 and sym.isdigit():
        return gen_digit(sym)
    # Code symbols
    if sym == '[': return [draw_line([0.1,0+rnd()], [0.1,1+rnd()])+draw_line([0.1,1],[0.9,1+rnd()])[1:]+draw_line([0.9,1+rnd()], [0.9,0+rnd()])[1:]]
    if sym == ']': return [draw_line([0.9,0+rnd()], [0.9,1+rnd()])+draw_line([0.9,1+rnd()], [0.1,1+rnd()])[1:]+draw_line([0.1,1+rnd()], [0.1,0+rnd()])[1:]]
    if sym == '{': return [arc(0.7,0.3,0.5,0.3,180,270)+arc(0.2,0.5,0.5,0.3,90,180)[1:]]
    if sym == '}': return [arc(0.3,0.3,0.5,0.3,-90,0)+arc(0.8,0.5,0.5,0.3,0,90)[1:]]
    if sym == '*': return [draw_line([0.5,0+rnd()], [0.5,1+rnd()]), draw_line([0,0.3+rnd()], [1,0.7+rnd()]), draw_line([1,0.3+rnd()], [0,0.7+rnd()])]
    if sym == ';': return [draw_line([0.5,0.1+rnd()], [0.5,0.15+rnd()], 4), draw_line([0.5,0.4+rnd()], [0.3,0.9+rnd()], 8)]
    if sym == ':': return [draw_line([0.5,0.2+rnd()], [0.5,0.25+rnd()], 4), draw_line([0.5,0.6+rnd()], [0.5,0.65+rnd()], 4)]
    if sym == "'": return [draw_line([0.5,0+rnd()], [0.4,0.3+rnd()], 6)]
    if sym == '"': return [draw_line([0.3,0+rnd()], [0.25,0.3+rnd()], 6), draw_line([0.7,0+rnd()], [0.65,0.3+rnd()], 6)]
    if sym == '/': return [draw_line([0.8,0+rnd()], [0.2,1+rnd()])]
    if sym == '\\': return [draw_line([0.2,0+rnd()], [0.8,1+rnd()])]
    if sym == '.': return [draw_line([0.5,0.8+rnd()], [0.5,0.85+rnd()], 4)]
    if sym == '_': return [draw_line([0.1,0.9+rnd()], [0.9,0.9+rnd()])]
    if sym == '%': return [draw_line([0.8,0+rnd()], [0.2,1+rnd()]), arc(0.25,0.25,0.15,0.15,0,360,12), arc(0.75,0.75,0.15,0.15,0,360,12)]
    if sym == '$': return [arc(0.5,0.3,0.35,0.25,180,360,12)+arc(0.5,0.7,0.35,0.25,0,180,12)[1:]+draw_line([0.5,0],[0.5,1])[1:]]
    if sym == '^': return [draw_line([0,0.7+rnd()], [0.5,0.1+rnd()])+draw_line([0.5,0.1+rnd()], [1,0.7+rnd()])[1:]]
    if sym == '?': return [arc(0.5,0.3,0.35,0.25,180,0,12)+draw_line([0.85,0.3+rnd()], [0.5,0.6+rnd()], 6)[1:], draw_line([0.5,0.8+rnd()], [0.5,0.85+rnd()], 4)]
    if sym == '!': return [draw_line([0.5,0+rnd()], [0.5,0.7+rnd()]), draw_line([0.5,0.85+rnd()], [0.5,0.9+rnd()], 4)]
    if sym == '&': return [arc(0.35,0.35,0.25,0.3,90,270,12)+arc(0.55,0.65,0.3,0.3,-30,90,12)[1:]+draw_line([0.75,0.45+rnd()], [0.2,1+rnd()], 6)[1:]]
    if sym == '#': return [draw_line([0.3,0+rnd()], [0.25,1+rnd()]), draw_line([0.7,0+rnd()], [0.65,1+rnd()]), draw_line([0,0.35+rnd()], [1,0.35+rnd()]), draw_line([0,0.65+rnd()], [1,0.65+rnd()])]
    if sym == '|': return [draw_line([0.5,0+rnd()], [0.5,1+rnd()])]
    if sym == '+': return [draw_line([0.5,0+rnd()], [0.5,1+rnd()]), draw_line([0,0.5+rnd()], [1,0.5+rnd()])]
    if sym == '-': return [draw_line([0,0.5+rnd()], [1,0.5+rnd()])]
    if sym == '=': return [draw_line([0,0.35+rnd()], [1,0.35+rnd()]), draw_line([0,0.65+rnd()], [1,0.65+rnd()])]
    if sym == '<': return [draw_line([0.9,0+rnd()], [0.1,0.5+rnd()])+draw_line([0.1,0.5+rnd()], [0.9,1+rnd()])[1:]]
    if sym == '>': return [draw_line([0.1,0+rnd()], [0.9,0.5+rnd()])+draw_line([0.9,0.5+rnd()], [0.1,1+rnd()])[1:]]
    if sym == '(': return [arc(0.7,0.5,0.4,0.5,120,240,20)]
    if sym == ')': return [arc(0.3,0.5,0.4,0.5,-60,60,20)]
    if sym == ',': return [draw_line([0.5,0.7+rnd()], [0.3,0.95+rnd()], 6)]
    return gen_letter(sym[0]) if sym else []

def gen_letter(ch):
    """Generate a simple letter glyph."""
    r = lambda: random.uniform(-.05, .05)
    ch = ch.lower()
    if ch == 'a': return [arc(0.5,0.5,0.35,0.4,200,360,16)+draw_line([0.85,0.5+r()], [0.85,1+r()])[1:], draw_line([0.15,0.6+r()], [0.85,0.6+r()])]
    if ch == 'b': return [draw_line([0.15,0+r()], [0.15,1+r()]), arc(0.5,0.65,0.35,0.3,270,90,16)]
    if ch == 'c': return [arc(0.55,0.5,0.4,0.45,220,320,20)]
    if ch == 'd': return [arc(0.45,0.65,0.35,0.3,90,270,16), draw_line([0.8,0+r()], [0.8,1+r()])]
    if ch == 'e': return [draw_line([0.15,0.5+r()], [0.85,0.5+r()]), arc(0.5,0.5,0.35,0.45,200,350,20)]
    if ch == 'f': return [arc(0.6,0.2,0.2,0.15,180,270,10), draw_line([0.4,0.2+r()], [0.4,1+r()]), draw_line([0.15,0.5+r()], [0.7,0.5+r()])]
    if ch == 'g': return [arc(0.5,0.5,0.35,0.35,200,360,16)+draw_line([0.85,0.5+r()], [0.85,0.85+r()])[1:], arc(0.5,0.85,0.3,0.2,0,180,12)]
    if ch == 'h': return [draw_line([0.15,0+r()], [0.15,1+r()]), draw_line([0.15,0.5+r()], [0.7,0.5+r()])+draw_line([0.7,0.5+r()], [0.7,1+r()])[1:]]
    if ch == 'i': return [draw_line([0.5,0.2+r()], [0.5,1+r()]), draw_line([0.5,0.05+r()], [0.5,0.1+r()], 4)]
    if ch == 'j': return [arc(0.4,0.85,0.2,0.15,0,180,10), draw_line([0.6,0.2+r()], [0.6,0.85+r()]), draw_line([0.6,0.05+r()], [0.6,0.1+r()], 4)]
    if ch == 'k': return [draw_line([0.2,0+r()], [0.2,1+r()]), draw_line([0.8,0+r()], [0.2,0.5+r()])+draw_line([0.2,0.5+r()], [0.8,1+r()])[1:]]
    if ch == 'l': return [draw_line([0.5,0+r()], [0.5,1+r()])]
    if ch == 'm': return [draw_line([0.1,0.3+r()], [0.1,1+r()]), arc(0.3,0.4,0.2,0.2,180,0,10)+draw_line([0.5,0.4+r()], [0.5,1+r()])[1:], arc(0.7,0.4,0.2,0.2,180,0,10)+draw_line([0.9,0.4+r()], [0.9,1+r()])[1:]]
    if ch == 'n': return [draw_line([0.2,0.3+r()], [0.2,1+r()]), arc(0.5,0.4,0.3,0.25,180,0,12)+draw_line([0.8,0.4+r()], [0.8,1+r()])[1:]]
    if ch == 'o': return [arc(0.5,0.55,0.35,0.4,0,360,20)]
    if ch == 'p': return [draw_line([0.2,0.3+r()], [0.2,1.1+r()]), arc(0.5,0.5,0.3,0.3,270,90,16)]
    if ch == 'q': return [arc(0.5,0.5,0.35,0.4,0,360,20), draw_line([0.7,0.7+r()], [0.9,1+r()], 6)]
    if ch == 'r': return [draw_line([0.2,0.3+r()], [0.2,1+r()]), arc(0.4,0.4,0.2,0.2,180,90,10)+draw_line([0.6,0.35+r()], [0.8,0.35+r()])[1:]]
    if ch == 's': return [arc(0.5,0.35,0.3,0.25,200,360,14)+arc(0.5,0.65,0.3,0.25,0,160,14)[1:]]
    if ch == 't': return [draw_line([0.5,0.1+r()], [0.5,1+r()]), draw_line([0.2,0.3+r()], [0.8,0.3+r()])]
    if ch == 'u': return [draw_line([0.2,0.3+r()], [0.2,0.75+r()]), arc(0.5,0.75,0.3,0.2,180,0,12)+draw_line([0.8,0.75+r()], [0.8,0.3+r()])[1:]]
    if ch == 'v': return [draw_line([0.1,0.1+r()], [0.5,1+r()])+draw_line([0.5,1+r()], [0.9,0.1+r()])[1:]]
    if ch == 'w': return [draw_line([0.05,0.1+r()], [0.25,1+r()])+draw_line([0.25,1+r()], [0.45,0.4+r()])[1:], draw_line([0.45,0.4+r()], [0.65,1+r()])+draw_line([0.65,1+r()], [0.85,0.1+r()])[1:]]
    if ch == 'x': return [draw_line([0.15,0+r()], [0.85,1+r()]), draw_line([0.85,0+r()], [0.15,1+r()])]
    if ch == 'y': return [draw_line([0.2,0.1+r()], [0.5,0.6+r()])+draw_line([0.5,0.6+r()], [0.8,0.1+r()])[1:], draw_line([0.5,0.6+r()], [0.3,1.1+r()])]
    if ch == 'z': return [draw_line([0.15,0.15+r()], [0.85,0.15+r()]), draw_line([0.85,0.15+r()], [0.15,0.85+r()]), draw_line([0.15,0.85+r()], [0.85,0.85+r()])]
    # Uppercase
    if ch.isupper(): return gen_upper(ch)
    return [arc(0.5,0.55,0.35,0.4,0,360,20)]  # fallback circle

def gen_upper(ch):
    r = lambda: random.uniform(-.05, .05)
    if ch == 'A': return [draw_line([0,1+r()], [0.5,0+r()])+draw_line([0.5,0+r()], [1,1+r()])[1:], draw_line([0.25,0.6+r()], [0.75,0.6+r()])]
    if ch == 'B': return [draw_line([0.15,0+r()], [0.15,1+r()]), arc(0.5,0.3,0.35,0.25,270,90,14), arc(0.5,0.7,0.35,0.25,270,90,14)]
    if ch == 'C': return [arc(0.6,0.5,0.45,0.5,220,320,20)]
    if ch == 'D': return [draw_line([0.15,0+r()], [0.15,1+r()]), arc(0.45,0.5,0.35,0.5,270,90,20)]
    if ch == 'E': return [draw_line([0.15,0+r()], [0.15,1+r()]), draw_line([0.15,0+r()], [0.85,0+r()]), draw_line([0.15,0.5+r()], [0.7,0.5+r()]), draw_line([0.15,1+r()], [0.85,1+r()])]
    if ch == 'F': return [draw_line([0.15,0+r()], [0.15,1+r()]), draw_line([0.15,0+r()], [0.85,0+r()]), draw_line([0.15,0.5+r()], [0.7,0.5+r()])]
    if ch == 'G': return [arc(0.6,0.5,0.45,0.5,220,320,20), draw_line([0.8,0.5+r()], [0.5,0.5+r()])]
    if ch == 'H': return [draw_line([0.2,0+r()], [0.2,1+r()]), draw_line([0.8,0+r()], [0.8,1+r()]), draw_line([0.2,0.5+r()], [0.8,0.5+r()])]
    if ch == 'I': return [draw_line([0.5,0+r()], [0.5,1+r()]), draw_line([0.3,0+r()], [0.7,0+r()]), draw_line([0.3,1+r()], [0.7,1+r()])]
    if ch == 'J': return [arc(0.4,0.85,0.25,0.15,0,180,12), draw_line([0.65,0+r()], [0.65,0.85+r()])]
    if ch == 'K': return [draw_line([0.2,0+r()], [0.2,1+r()]), draw_line([0.85,0+r()], [0.2,0.5+r()])+draw_line([0.2,0.5+r()], [0.85,1+r()])[1:]]
    if ch == 'L': return [draw_line([0.2,0+r()], [0.2,1+r()]), draw_line([0.2,1+r()], [0.85,1+r()])]
    if ch == 'M': return [draw_line([0.1,1+r()], [0.1,0+r()]), draw_line([0.1,0+r()], [0.5,0.6+r()])+draw_line([0.5,0.6+r()], [0.9,0+r()])[1:], draw_line([0.9,0+r()], [0.9,1+r()])]
    if ch == 'N': return [draw_line([0.2,0+r()], [0.2,1+r()]), draw_line([0.2,0+r()], [0.8,1+r()]), draw_line([0.8,1+r()], [0.8,0+r()])]
    if ch == 'O': return [arc(0.5,0.5,0.4,0.5,0,360,24)]
    if ch == 'P': return [draw_line([0.2,0+r()], [0.2,1+r()]), arc(0.5,0.3,0.3,0.3,270,90,16)]
    if ch == 'Q': return [arc(0.5,0.5,0.4,0.5,0,360,24), draw_line([0.65,0.7+r()], [0.9,1+r()], 6)]
    if ch == 'R': return [draw_line([0.2,0+r()], [0.2,1+r()]), arc(0.5,0.3,0.3,0.3,270,90,16), draw_line([0.5,0.5+r()], [0.85,1+r()])]
    if ch == 'S': return [arc(0.5,0.3,0.35,0.25,200,360,14)+arc(0.5,0.7,0.35,0.25,0,160,14)[1:]]
    if ch == 'T': return [draw_line([0.5,0+r()], [0.5,1+r()]), draw_line([0.1,0+r()], [0.9,0+r()])]
    if ch == 'U': return [draw_line([0.2,0+r()], [0.2,0.7+r()]), arc(0.5,0.7,0.3,0.3,180,0,14)+draw_line([0.8,0.7+r()], [0.8,0+r()])[1:]]
    if ch == 'V': return [draw_line([0.1,0+r()], [0.5,1+r()])+draw_line([0.5,1+r()], [0.9,0+r()])[1:]]
    if ch == 'W': return [draw_line([0.05,0+r()], [0.25,1+r()])+draw_line([0.25,1+r()], [0.45,0.3+r()])[1:], draw_line([0.45,0.3+r()], [0.65,1+r()])+draw_line([0.65,1+r()], [0.85,0+r()])[1:]]
    if ch == 'X': return [draw_line([0.15,0+r()], [0.85,1+r()]), draw_line([0.85,0+r()], [0.15,1+r()])]
    if ch == 'Y': return [draw_line([0.15,0+r()], [0.5,0.5+r()])+draw_line([0.5,0.5+r()], [0.85,0+r()])[1:], draw_line([0.5,0.5+r()], [0.5,1+r()])]
    if ch == 'Z': return [draw_line([0.15,0+r()], [0.85,0+r()]), draw_line([0.85,0+r()], [0.15,1+r()]), draw_line([0.15,1+r()], [0.85,1+r()])]
    return [arc(0.5,0.5,0.4,0.5,0,360,24)]

def gen_digit(d):
    r = lambda: random.uniform(-.05, .05)
    if d == '0': return [arc(0.5,0.5,0.35,0.5,0,360,20)]
    if d == '1': return [draw_line([0.3,0.15+r()], [0.5,0+r()]), draw_line([0.5,0+r()], [0.5,1+r()]), draw_line([0.3,1+r()], [0.7,1+r()])]
    if d == '2': return [arc(0.5,0.3,0.35,0.25,200,360,16)+draw_line([0.85,0.3+r()], [0.15,1+r()])[1:], draw_line([0.15,1+r()], [0.85,1+r()])]
    if d == '3': return [arc(0.45,0.3,0.3,0.25,200,340,14), arc(0.45,0.7,0.3,0.25,200,340,14)]
    if d == '4': return [draw_line([0.15,0+r()], [0.15,0.6+r()]), draw_line([0.15,0.6+r()], [0.85,0.6+r()]), draw_line([0.7,0+r()], [0.7,1+r()])]
    if d == '5': return [draw_line([0.85,0+r()], [0.15,0+r()]), draw_line([0.15,0+r()], [0.15,0.5+r()]), arc(0.5,0.7,0.35,0.3,200,360,16)]
    if d == '6': return [arc(0.55,0.3,0.3,0.25,200,340,14)+arc(0.5,0.65,0.35,0.3,0,360,18)[1:]]
    if d == '7': return [draw_line([0.15,0+r()], [0.85,0+r()]), draw_line([0.85,0+r()], [0.4,1+r()])]
    if d == '8': return [arc(0.5,0.3,0.3,0.25,0,360,16), arc(0.5,0.7,0.35,0.25,0,360,16)]
    if d == '9': return [arc(0.5,0.35,0.35,0.3,0,360,18), arc(0.45,0.7,0.3,0.25,200,340,14)[1:]]
    return [arc(0.5,0.5,0.35,0.5,0,360,20)]

def layout_line(tokens):
    """Lay out tokens as a line of strokes with random positioning."""
    out = []
    x = 0
    for tok in tokens:
        S = gen_glyph(tok)
        if not S: continue
        pts = [p for s in S for p in s]
        x0 = min(p[0] for p in pts)
        x1 = max(p[0] for p in pts)
        y0 = min(p[1] for p in pts)
        y1 = max(p[1] for p in pts)
        h = max(y1 - y0, 1e-3)
        w = max(x1 - x0, 1e-3)
        # Scale to target height
        H = random.uniform(28, 42)
        sc = H / h
        yb = 50 + random.gauss(0, 3)
        ox = x - x0 * sc
        oy = yb - y1 * sc
        for s in S:
            out.append([[p[0]*sc+ox, p[1]*sc+oy] for p in s])
        x += w * sc + random.uniform(8, 18)
    return out

# LEX/YACC test lines
LEX_YACC_LINES = [
    # LEX patterns
    "[0-9]+",
    "[a-zA-Z_][a-zA-Z0-9_]*",
    "[ \\t]+",
    "\"if\"",
    "\"else\"",
    "\"return\"",
    "[0-9]+\\.[0-9]+",
    "[a-z]+",
    "[A-Z][a-z]*",
    "[0-9]{3}",
    "\"/*\"",
    "\"*/\"",
    "//.*",
    "[0-9]+",
    "[a-zA-Z][a-zA-Z0-9]*",
    "[ \\t\\n]+",
    "\"+\"",
    "\"-\"",
    "\"*\"",
    "\"/\"",
    "\"(\"",
    "\")\"",
    "\";\"",
    "\",\"",
    # YACC productions
    "expr : expr '+' term",
    "expr : expr '-' term",
    "term : term '*' factor",
    "term : term '/' factor",
    "factor : '(' expr ')'",
    "factor : NUMBER",
    "S : A S B",
    "S : 'a' S 'b'",
    "S : S '+' S",
    "S : S '*' S",
    "S : '(' S ')'",
    "S : A S B |",
    "expr : term",
    "term : factor",
    "factor : NUMBER",
    "factor : ID",
    # YACC actions
    "{ $$ = $1 + $3; }",
    "{ $$ = $1 - $3; }",
    "{ $$ = $1 * $3; }",
    "{ $$ = $1 / $3; }",
    "{ return NUMBER; }",
    "{ printf(\"%d\", $1); }",
    "{ $$ = $1; }",
    # Declarations
    "%left '+' '-'",
    "%left '*' '/'",
    "%right '^'",
    "%nonassoc '<' '>'",
    "%token NUMBER",
    "%token ID",
    "%token IF ELSE WHILE",
    "%start program",
    "%type <val> expr",
    "%type <ival> term",
    # Mixed
    "expr : expr '+' expr { $$ = $1 + $3; }",
    "stmt : IF '(' expr ')' stmt",
    "stmt : WHILE '(' expr ')' stmt",
    "stmt : '{' stmts '}'",
    "stmts : stmt",
    "stmts : stmts stmt",
    "program : stmts",
    "program : decls stmts",
    "decls : decl",
    "decls : decls decl",
    "decl : TYPE ID ';'",
    "decl : TYPE ID '=' expr ';'",
    # More patterns
    "\"\\\\n\"",
    "\"\\\\t\"",
    "[a-zA-Z_][a-zA-Z0-9_]*",
    "[0-9]+",
    "[ \\t]+",
    "\"if\" { return IF; }",
    "\"else\" { return ELSE; }",
    "\"while\" { return WHILE; }",
    "[0-9]+ { yylval = atoi(yytext); return NUMBER; }",
    "[a-z]+ { yylval = strdup(yytext); return ID; }",
    # Edge cases
    "{ }",
    "[ ]",
    "''",
    "\"\"",
    ":",
    ";",
    "|",
    "%%",
    "%%%",
    "%{",
    "%}",
    "/* comment */",
    "// line comment",
    "#include",
    "#define",
    "a_b_c",
    "_private",
    "__init__",
    "x123",
    "var_1",
    "MAX_SIZE",
    "MIN_VAL",
    "count++",
    "i--",
    "a+b",
    "x*y",
    "p/q",
    "m%n",
    "a&b",
    "x|y",
    "p^q",
    "~x",
    "!flag",
    "a==b",
    "x!=y",
    "p<=q",
    "r>=s",
    "a&&b",
    "x||y",
    "arr[0]",
    "arr[i+1]",
    "obj.field",
    "ptr->member",
    "func(a,b)",
    "f(x,y,z)",
    "g()",
    "if(x)",
    "while(i<n)",
    "for(i=0;i<n;i++)",
    "return x;",
    "return 0;",
    "break;",
    "continue;",
    "int x;",
    "char c;",
    "float f;",
    "double d;",
    "void f()",
    "int main()",
    "char *s",
    "int a[10]",
    "struct S {",
    "union U {",
    "enum E {",
    "typedef int INT;",
    "sizeof(x)",
    "&x",
    "*p",
    "a?b:c",
    "x<<2",
    "y>>3",
    "a+=b",
    "x-=y",
    "p*=q",
    "r/=s",
]

# Deduplicate and take ~150
seen = set()
unique = []
for line in LEX_YACC_LINES:
    if line not in seen:
        seen.add(line)
        unique.append(line)

# Pad to 150 if needed
while len(unique) < 150:
    # Generate variations
    base = random.choice(LEX_YACC_LINES)
    var = base + random.choice(["", " ", "  "])
    if var not in seen:
        seen.add(var)
        unique.append(var)

cases = []
for line in unique[:150]:
    # Tokenize for stroke generation
    tokens = list(line)
    strokes = layout_line(tokens)
    # Extract lexicon (identifiers)
    import re
    lex = sorted(set(re.findall(r'[A-Z_][A-Z0-9_]*', line)))
    cases.append({
        'truth': line,
        'lexicon': lex,
        'strokes': strokes,
        'mode': 'code'
    })

out_path = './hw-data/jstest/cases_code.json'
os.makedirs(os.path.dirname(out_path), exist_ok=True)
json.dump(cases, open(out_path, 'w'))
print(f'Generated {len(cases)} code eval cases → {out_path}')
