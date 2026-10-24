# Character trigram LMs per field for the code ink decoder → ink/code-lm.json
# Text: TRAIN-split bank lines (eval question ids excluded) + lab-manual idioms. Never the eval lines.
import json,collections,sys,os
sys.path.insert(0,os.path.dirname(__file__)); from gen_lines import bank_lines
OUT='./ink/code-lm.json'
IDIOMS={
 'pattern':['[0-9]+','[a-zA-Z_][a-zA-Z0-9_]*','[a-zA-Z]+','[a-z]+','[A-Z]+','[ \\t]','[ \\t]+','\\n','.','[0-9]','[a-zA-Z]','[aeiouAEIOU]','[+-]?[0-9]+',
  '[0-9]+"."[0-9]+','[+\\-*/]','"if"','"else"','"while"','"for"','"int"','"float"','"char"','"return"','[01]+','a','b','x','y','[a]','[b]','.|\\n','[ \\t\\n]','"+"','"-"','"*"','"/"',
  '"="','"=="','"<="','">="','"!="','"&&"','"||"','"("','")"','";"','[A-Z][a-z]*','[0-9]+[.][0-9]+','[a-z][a-z0-9]*','[^ \\t\\n]+','[ ]+','\\t','[a-zA-Z0-9]+','"//".*','[aA]','[bB]'],
 'action':['return 0;','return yytext[0];',';','yylval=atoi(yytext); return NUMBER;','{ yylval=atoi(yytext); return NUMBER; }','{ return yytext[0]; }','{ return 0; }','ECHO;',
  'count++;','{ count++; }','printf("%s",yytext);','return NL;','return ID;','return NUMBER;','return A;','return B;','return IF;','return WHILE;','return FOR;','return LETTER;',
  'return DIGIT;','v++;','c++;','lines++;','words++;','chars+=yyleng;','printf("Valid\\n");','printf("Invalid\\n");','{ printf("%s is a keyword\\n",yytext); }',
  '{ printf("%s is an identifier\\n",yytext); }','{ v++; }','{ c++; }','{ lines++; }','{ words++; chars+=yyleng; }','return OP;','return RELOP;','yylval=yytext[0]; return ID;'],
 'production':['S : A S B','| A B','| ;',';','E : E \'+\' E','| E \'-\' E','| E \'*\' E','| E \'/\' E','| \'(\' E \')\'','| NUMBER','| ID','stmt : S NL','S : A S B | ;',
  'E : E \'+\' T | T ;','T : T \'*\' F | F ;','F : \'(\' E \')\' | ID ;','{ $$=$1+$3; }','{ $$=$1-$3; }','{ $$=$1*$3; }','{ $$=$1/$3; }','{ $$=$2; }','{ $$=$1; }',
  '{ printf("Valid\\n"); exit(0); }','stmt : E NL { printf("%d\\n",$1); exit(0); }','expr : expr \'+\' term | term ;','term : term \'*\' factor | factor ;','factor : NUMBER | \'(\' expr \')\' ;',
  'S : E { printf("Result=%d\\n",$1); }','start : letter rest ;','rest : letter rest | digit rest | ;','S : a S b | ;','E : E \'+\' E { $$=$1+$3; }'],
}
def build(texts):
    u=collections.Counter(); b=collections.Counter(); bc=collections.Counter(); t=collections.Counter(); tc=collections.Counter(); V=set()
    for s in texts:
        s='  '+s+'\n'
        for i in range(2,len(s)):
            c=s[i]; h1=s[i-1]; h2=s[i-2]; V.add(c)
            u[c]+=1; b[h1+c]+=1; bc[h1]+=1; t[h2+h1+c]+=1; tc[h2+h1]+=1
    return {'u':dict(u),'un':sum(u.values()),'b':dict(b),'bc':dict(bc),'t':dict(t),'tc':dict(tc),'V':len(V)+20}
if __name__=='__main__':
    L=bank_lines(); out={}
    for f in ('pattern','action','production'):
        texts=[x[3] for x in L if x[0]=='train' and x[2]==f]
        texts+=IDIOMS[f]*3
        # productions are also written with spaces collapsed or around ':' — add both forms
        if f=='production': texts+=[x.replace(' : ',': ').replace(': ',' : ') for x in texts]
        out[f]=build(texts); print(f,len(texts),'lines',out[f]['V'],'chars')
    json.dump(out,open(OUT,'w'),separators=(',',':')); print(os.path.getsize(OUT),'bytes')
