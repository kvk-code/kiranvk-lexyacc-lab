# Line synthesizer for the LEX/YACC code ink: renders real lab lines as handwriting by composing real glyph strokes.
#   python3 gen_lines.py eval   → ./hw-data/jstest/code_cases.json  (held-out WRITERS: MathWriting valid+test only;
#                                  held-out QUESTIONS: every 5th bank question id is eval-only)
# Each case: {field, truth, lexicon, strokes}. Characters with no held-out ink are drawn by the stroke generator (marked).
import json,glob,re,random,pickle,collections,math,sys,os
sys.path.insert(0,os.path.dirname(__file__)); from build2 import gen, CH2CLS
import numpy as np
BANK='../lexyacc-bank'
W='./hw-data/work2'
random.seed(11); rng=np.random.default_rng(11)

def bank_lines():
    qs=sorted(os.path.basename(d) for d in glob.glob(BANK+'/q/*'))
    out=[]
    for k,q in enumerate(qs):
        split='eval' if k%5==0 else 'train'
        for f in glob.glob(f'{BANK}/q/{q}/*.l'):
            s=open(f).read().split('%%')
            if len(s)<2: continue
            for ln in s[1].split('\n'):
                ln=ln.strip()
                m=re.match(r'^((?:"[^"]*"|\[[^\]]*\]|\\.|[^\s])+)\s+(.*)$',ln)
                if not m: continue
                p,a=m.group(1),m.group(2).strip()
                if len(p)<=28 and not p.startswith(('if(','for(','printf','}','else','int','char')): out.append((split,q,'pattern',p))
                if a and len(a)<=40 and a.count('"')%2==0 and not a.endswith('{'): out.append((split,q,'action',a))
        for f in glob.glob(f'{BANK}/q/{q}/*.y'):
            s=open(f).read().split('%%')
            if len(s)<2: continue
            for ln in s[1].split('\n'):
                ln=ln.strip()
                if 3<=len(ln)<=34 and ln not in (';',): out.append((split,q,'production',ln))
    return out

# ink pools by character
def pools(splits):
    P=collections.defaultdict(list)
    for sp in splits:
        for ch,S,fn in pickle.load(open(f'{W}/mined2_{sp}.pkl','rb')): P[ch].append(S)
    return P
HEIGHT={**{c:42 for c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789bdfhklt'},**{c:30 for c in 'acemnorsuvwxz'},**{c:44 for c in 'gjpqy'},
        '(':58,')':58,'[':58,']':58,'{':58,'}':58,'|':56,'/':50,'\\':50,'+':30,'-':6,'_':6,'=':18,'*':28,'<':28,'>':28,
        '.':6,',':14,';':36,':':30,"'":16,'"':16,'!':42,'?':42,'&':42,'#':40,'%':40,'$':48,'^':16,'i':34,'j':48}
BASE={**{c:50 for c in 'gjpqy'},'(':56,')':56,'[':56,']':56,'{':56,'}':56,'|':56,'-':32,'_':54,'=':32,'+':38,'*':30,'<':36,'>':36,
      '.':50,',':58,';':56,':':50,"'":14,'"':14,'^':14}
def glyph(ch,P,stats):
    if P.get(ch) and (ch not in '"\'' or random.random()<0.5): stats['ink']+=1; return random.choice(P[ch])
    g=gen(ch,rng)
    if g: stats['gen']+=1; return [[[x*60,y*60] for x,y in s] for s in g]
    alt={'_':'-','`':"'"}.get(ch)
    if alt and P.get(alt): stats['ink']+=1; return random.choice(P[alt])
    stats['miss']+=1; return None
def layout(text,P,stats,field):
    out=[];x=0;words=0
    for ch in text:
        if ch==' ': x+=random.uniform(22,34); continue
        S=glyph(ch,P,stats)
        if S is None: return None
        pts=[p for s in S for p in s]; x0=min(p[0] for p in pts);x1=max(p[0] for p in pts);y0=min(p[1] for p in pts);y1=max(p[1] for p in pts)
        h=max(y1-y0,1e-3); w=max(x1-x0,1e-3)
        H=HEIGHT.get(ch,30)*random.uniform(.85,1.15)
        sc=H/h
        if ch in '-_=': sc=random.uniform(18,28)/w
        if ch in '.': sc=min(sc,8/max(w,h))
        base=BASE.get(ch,50)+random.gauss(0,2.5)
        oy=base-y1*sc
        if ch in "'\"^": oy=base-y0*sc
        if ch in '-=+*<>': oy=base-(y0+y1)/2*sc
        if ch==',': oy=base-y0*sc-4
        ox=x-x0*sc
        out.append([[[p[0]*sc+ox,p[1]*sc+oy] for p in s] for s in S]); x=x0*sc+ox+w*sc+random.uniform(6,13)
    return [s for g in out for s in g]
def lexicon_of(text):
    return sorted(set(w for w in re.findall(r'[A-Za-z_][A-Za-z0-9_]*',text) if (w.isupper() and len(w)>1) or w in ('stmt','expr','term','factor')))
if __name__=='__main__':
    which=sys.argv[1] if len(sys.argv)>1 else 'eval'
    L=[x for x in bank_lines() if x[0]==which]
    seen=set(); L=[x for x in L if not ((x[2],x[3]) in seen or seen.add((x[2],x[3])))]
    P=pools(['valid','test'] if which=='eval' else ['train'])
    stats=collections.Counter(); cases=[]
    reps=3 if which=='eval' else 20
    for rep in range(reps):
        for sp,q,field,t in L:
            s=layout(t,P,stats,field)
            if s: cases.append({'q':q,'field':field,'truth':t,'lexicon':lexicon_of(t),'strokes':[[[round(a,1),round(b,1)] for a,b in st] for st in s]})
    out='./hw-data/jstest/code_cases.json' if which=='eval' else W+'/code_lines_train.json'
    json.dump(cases,open(out,'w'))
    print(which,len(L),'distinct lines →',len(cases),'cases',dict(collections.Counter(c['field'] for c in cases)),dict(stats))
