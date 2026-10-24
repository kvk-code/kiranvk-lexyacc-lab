global.window = global; require('../vendor/jison.min.js'); const L = require('../lexyacc-core.js');
const fs=require('fs'),cp=require('child_process'),os=require('os'),path=require('path');
function real(files, input){const d=fs.mkdtempSync(path.join(os.tmpdir(),'ly'));for(const[f,c]of Object.entries(files))fs.writeFileSync(path.join(d,f),c);
 const l=Object.keys(files).find(f=>f.endsWith('.l')),y=Object.keys(files).find(f=>f.endsWith('.y'));
 let cmd=`cd ${d} && flex ${l} 2>&1 && `+(y?`bison -dy ${y} 2>&1 && gcc -w lex.yy.c y.tab.c -o a 2>&1`:`gcc -w lex.yy.c -o a 2>&1`);
 try{cp.execSync(cmd)}catch(e){return 'BUILD FAIL '+e.stdout}
 return cp.execSync(`cd ${d} && ./a`,{input}).toString();}
const anbn={name:'anbn',rules:[{pattern:'a',action:'return A;'},{pattern:'b',action:'return B;'},{pattern:'\\n',action:'return NL;'},{pattern:'.',action:'return yytext[0];'}],
 grammar:'stmt : S NL { printf("Valid string\\n"); exit(0); }\n;\nS : A S B\n  |\n  ;', onError:'Invalid string', tests:['aabb\n']};
const calc={name:'calc',rules:[{pattern:'[0-9]+',action:'yylval=atoi(yytext); return NUMBER;'},{pattern:'[ \\t]',action:';'},{pattern:'\\n',action:'return 0;'},{pattern:'.',action:'return yytext[0];'}],
 prec:"%left '+' '-'\n%left '*' '/'", grammar:"S : E { printf(\"Result=%d\\n\", $1); }\n;\nE : E '+' E { $$=$1+$3; }\n | E '-' E { $$=$1-$3; }\n | E '*' E { $$=$1*$3; }\n | E '/' E { $$=$1/$3; }\n | '(' E ')' { $$=$2; }\n | NUMBER { $$=$1; }\n;", onError:'Invalid expression'};
const calcNoPrec=Object.assign({},calc,{prec:''});
for(const [sp,ins] of [[anbn,['aabb\n','aab\n','\n']],[calc,['2+3*4\n','(2+3)*4\n','2+*3\n']],[calcNoPrec,['2+3*4\n']]]){
 const an=L.analyse(sp); console.log('==',sp.name,'ok',an.ok,'conflicts',an.conflicts, an.issues.map(i=>i.sev+': '+i.msg.slice(0,90)));
 const asm=L.assemble(sp,an);
 for(const i of ins){const r=L.runYacc(sp,i,an); console.log(JSON.stringify(i),'SIM:',JSON.stringify(r.output),r.accepted,r.error&&r.error.at,'| REAL:',JSON.stringify(real(asm.files,i)));}
}
console.log(L.assemble(calc).files['calc.y']);
const wc={mode:'lex',decls:'int lines=0, words=0, chars=0;',rules:[{pattern:'\\n',action:'lines++; chars++;'},{pattern:'[^ \\t\\n]+',action:'words++; chars+=yyleng;'},{pattern:'.',action:'chars++;'}],endCode:'printf("lines=%d words=%d chars=%d\\n", lines, words, chars);',name:'wc'};
const i='hello world\nfoo bar baz\n';console.log('LEX SIM',JSON.stringify(L.runLex(wc,i).output),'REAL',JSON.stringify(real(L.assemble(wc).files,i)));
