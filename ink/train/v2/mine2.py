# Mine single glyphs for the LEX/YACC code model from MathWriting inks whose labels are flat sequences of code chars.
# Output: mined2_<split>.pkl = [(char, strokes, file)]  (char = the literal character, e.g. '[', '0', ';')
# Splits are kept apart: train for training; valid+test writers only for the held-out evaluation.
import os,re,sys,pickle,collections
from multiprocessing import Pool
D='./hw-data/mathwriting-2024'
CMD={'\\{':'{','\\}':'}','\\ast':'*','\\cdot':'.','\\%':'%','\\#':'#','\\$':'$','\\&':'&','\\backslash':'\\','\\setminus':'\\',
     '\\mid':'|','\\vert':'|','\\prime':"'",'\\lbrack':'[','\\rbrack':']','\\lbrace':'{','\\rbrace':'}','\\star':'*'}
SIMPLE=set('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789(),+-=<>|[]*;:.!?/\'')
def toks(lbl):
    out=[];i=0
    while i<len(lbl):
        c=lbl[i]
        if c==' ': i+=1;continue
        if c=='\\':
            m=re.match(r'\\[A-Za-z]+|\\.',lbl[i:]); w=m.group(0)
            if w not in CMD: return None
            out.append(CMD[w]); i+=len(w); continue
        if c in SIMPLE: out.append(c); i+=1; continue
        return None            # ^ _ { } are LaTeX layout, not drawn glyphs
    return out
def strokes(txt):
    tr=re.findall(r'<trace(?:\s[^>]*)?>(.*?)</trace>',txt,re.S); S=[]
    for t in tr:
        pts=[tuple(map(float,p.split()[:2])) for p in t.strip().split(',') if p.strip()]
        if pts: S.append(pts)
    return S
def group(S):
    boxes=[(min(p[0] for p in s),max(p[0] for p in s)) for s in S]
    order=sorted(range(len(S)),key=lambda k:(boxes[k][0]+boxes[k][1])/2)
    groups=[]
    for k in order:
        a,b=boxes[k]; placed=False
        if groups:
            g=groups[-1]; ga,gb=g['x']
            ov=min(b,gb)-max(a,ga); w=max(1e-6,min(b-a,gb-ga))
            if ov>0.45*max(w,1.0): g['s'].append(k); g['x']=(min(a,ga),max(b,gb)); placed=True
        if not placed: groups.append({'s':[k],'x':(a,b)})
    return groups
def work(arg):
    sp,fn=arg
    try: txt=open(os.path.join(D,sp,fn)).read()
    except Exception: return []
    m=re.search(r'type="normalizedLabel">(.*?)</annotation>',txt)
    if not m: return []
    lbl=m.group(1).replace('&amp;','&').replace('&lt;','<').replace('&gt;','>')
    T=toks(lbl)
    if not T or len(T)<2 or len(T)>30: return []
    S=strokes(txt); G=group(S)
    if len(G)!=len(T): return []
    return [(t,[S[k] for k in sorted(g['s'])],sp+'/'+fn) for t,g in zip(T,G)]
LAB={'\\{':'{','\\}':'}','*':'*','\\ast':'*','\\star':'*','\\cdot':'.','\\%':'%','\\#':'#','\\$':'$','\\&':'&','\\backslash':'\\',
     '\\mid':'|','\\|':'|','\\prime':"'",'\\bullet':'.'}
if __name__=='__main__':
    for sp in sys.argv[1:] or ['train','valid','test']:
        files=[(sp,f) for f in os.listdir(os.path.join(D,sp))]
        with Pool(8) as p: res=p.map(work,files,chunksize=400)
        out=[x for r in res for x in r]
        if sp=='train':    # the curated single-symbol subset
            for fn in os.listdir(D+'/symbols'):
                t=open(D+'/symbols/'+fn).read(); m=re.search(r'type="label">(.*?)</annotation>',t)
                if not m: continue
                l=m.group(1).replace('&amp;','&').replace('&lt;','<').replace('&gt;','>')
                c=LAB.get(l, l if (len(l)==1 and l in SIMPLE) else None)
                if c: out.append((c,strokes(t),'symbols/'+fn))
        pickle.dump(out,open(f'./hw-data/work2/mined2_{sp}.pkl','wb'))
        c=collections.Counter(t for t,_,_ in out); print(sp,len(out),'glyphs from',len({f for *_,f in out}),'inks',flush=True)
        print(sorted(c.items(),key=lambda x:x[1])[:50],flush=True)
