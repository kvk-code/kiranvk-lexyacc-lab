# Build dataset for LEX/YACC ink recognition.
# Extends logic-lab build.py with code symbols: [ ] { } * ; : ' " / \ . _ % $ ^ ? ! & #
import csv,json,os,pickle,random,re,collections,numpy as np
from PIL import Image,ImageDraw
R=32; BOX=26; SS=4

# HASY mapping — extended with code symbols
HASYMAP={
    '\\wedge':'and','\\vee':'or','\\neg':'not','\\sim':'sim',
    '\\Rightarrow':'imp','\\rightarrow':'to','\\longrightarrow':'to',
    '\\Leftrightarrow':'iff','\\leftrightarrow':'lr',
    '\\forall':'all','\\exists':'ex','\\bot':'bot','\\perp':'bot','\\top':'top',
    '\\&':'amp',
    # code symbols
    '\\{':'lbrace','\\}':'rbrace','\\#':'hash','\\$':'dollar','\\%':'percent',
    '\\backslash':'backslash','\\|':'pipe','\\star':'star',
}
for ch in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-=<>|': HASYMAP[ch]=ch
# Additional HASY code symbols
HASYMAP.update({
    '[':'lbracket', ']':'rbracket',
})

# Code symbols not in HASY (will need synthetic generation)
CODE_ONLY = ['lbrace','rbrace','lbracket','rbracket','star','semi','colon',
             'squote','dquote','slash','dot','underscore','percent','dollar',
             'caret','question','excl','ampersand','hash','backslash','pipe']

CLASSES=sorted(set(HASYMAP.values())|{'(',')',','}|set(CODE_ONLY),key=lambda s:(len(s)>1,s))
CI={c:i for i,c in enumerate(CLASSES)}
print(f'{len(CLASSES)} classes:', CLASSES)

def render_strokes(S,width,rng):
    pts=np.concatenate([np.array(s) for s in S]); x0,y0=pts.min(0); x1,y1=pts.max(0)
    w,h=max(x1-x0,1e-3),max(y1-y0,1e-3); sc=BOX/max(w,h)
    ox=(R-w*sc)/2-x0*sc; oy=(R-h*sc)/2-y0*sc
    im=Image.new('L',(R*SS,R*SS),0); d=ImageDraw.Draw(im); lw=max(1,int(round(width*SS)))
    for s in S:
        p=[((x*sc+ox)*SS,(y*sc+oy)*SS) for x,y in s]
        if len(p)==1: p=p*2
        d.line(p,fill=255,width=lw,joint='curve')
        for q in (p[0],p[-1]): d.ellipse([q[0]-lw/2,q[1]-lw/2,q[0]+lw/2,q[1]+lw/2],fill=255)
    return np.asarray(im.resize((R,R),Image.BILINEAR),np.uint8), np.log(w/h)

def jitter(S,rng):
    a=rng.normal(0,0.12); sh=rng.normal(0,0.18); sx=np.exp(rng.normal(0,0.12))
    M=np.array([[np.cos(a)*sx,-np.sin(a)+sh],[np.sin(a),np.cos(a)]])
    pts=np.concatenate([np.array(s) for s in S]); c=pts.mean(0); scale=max(np.ptp(pts[:,0]),np.ptp(pts[:,1]),1)
    return [((np.array(s)-c)@M.T+rng.normal(0,0.008*scale,(len(s),2))).tolist() for s in S]

def hasy_img(path,rng):
    a=255-np.asarray(Image.open(path).convert('L'),np.uint8); ys,xs=np.nonzero(a>80)
    if len(xs)==0: return None
    c=a[ys.min():ys.max()+1,xs.min():xs.max()+1]; h,w=c.shape; sc=BOX/max(h,w)
    im=Image.fromarray(c).resize((max(1,round(w*sc)),max(1,round(h*sc))),Image.BILINEAR)
    from PIL import ImageFilter
    k=rng.choice([1,3,3])
    if k>1: im=im.filter(ImageFilter.MaxFilter(k))
    out=Image.new('L',(R,R),0); out.paste(im,((R-im.width)//2,(R-im.height)//2))
    return np.asarray(out,np.uint8), np.log(w/h)

# Synthetic glyph generator for missing code symbols
def synthesize_code_glyphs(rng):
    """Generate stroke-based glyphs for symbols not in HASY/MathWriting."""
    glyphs = {}
    
    def L(a,b,n=14): return [[a[0]+(b[0]-a[0])*i/n,a[1]+(b[1]-a[1])*i/n] for i in range(n+1)]
    def arc(cx,cy,rx,ry,a0,a1,n=24): return [[cx+rx*math.cos(math.radians(a0+(a1-a0)*i/n)),cy+ry*math.sin(math.radians(a0+(a1-a0)*i/n))] for i in range(n+1)]
    
    import math
    
    # { brace: two arcs
    glyphs['lbrace'] = [arc(55,30,25,30,180,270)+arc(30,60,25,30,90,180)[1:]]
    glyphs['rbrace'] = [arc(15,30,25,30,-90,0)+arc(40,60,25,30,0,90)[1:]]
    # [ bracket
    glyphs['lbracket'] = [L([50,0],[10,0])+L([10,0],[10,100])+L([10,100],[50,100])[1:]]
    glyphs['rbracket'] = [L([20,0],[60,0])+L([60,0],[60,100])+L([60,100],[20,100])[1:]]
    # * star
    glyphs['star'] = [L([35,0],[35,100]),L([0,30],[70,70]),L([70,30],[0,70])]
    # ; semicolon
    glyphs['semi'] = [L([30,10],[28,14],6), L([30,40],[20,80],8)]
    # : colon
    glyphs['colon'] = [L([30,15],[30,20],4), L([30,60],[30,65],4)]
    # ' single quote
    glyphs['squote'] = [L([30,0],[25,30],6)]
    # " double quote
    glyphs['dquote'] = [L([20,0],[17,28],6), L([40,0],[37,28],6)]
    # / slash
    glyphs['slash'] = [L([60,0],[10,100])]
    # . dot
    glyphs['dot'] = [L([30,70],[30,75],4)]
    # _ underscore
    glyphs['underscore'] = [L([5,90],[65,90])]
    # % percent
    glyphs['percent'] = [L([60,0],[10,100]), arc(20,20,12,12,0,360,16), arc(50,80,12,12,0,360,16)]
    # $ dollar
    glyphs['dollar'] = [arc(35,30,25,20,180,360,16)+arc(35,70,25,20,0,180,16)[1:]+L([35,0],[35,100])[1:]]
    # ^ caret
    glyphs['caret'] = [L([0,70],[35,10])+L([35,10],[70,70])[1:]]
    # ? question
    glyphs['question'] = [arc(35,30,25,25,180,0,16)+L([60,30],[35,60],8)[1:], L([35,80],[35,85],4)]
    # ! exclamation
    glyphs['excl'] = [L([35,0],[35,65]), L([35,80],[35,85],4)]
    # & ampersand
    glyphs['ampersand'] = [arc(25,35,20,25,90,270,16)+arc(40,65,25,25,-30,90,16)[1:]+L([55,45],[15,100],8)[1:]]
    # # hash
    glyphs['hash'] = [L([20,0],[15,100]), L([55,0],[50,100]), L([0,30],[70,30]), L([0,65],[70,65])]
    # backslash
    glyphs['backslash'] = [L([10,0],[60,100])]
    # pipe |  (already in HASY but ensure)
    glyphs['pipe'] = [L([35,0],[35,100])]
    
    return glyphs

if __name__=='__main__':
    import math
    rng=np.random.default_rng(0); X=[];A=[];Y=[];SRC=[]
    
    # 1. HASY images
    os.chdir('./hw-data/hasy')
    rows=[r for r in csv.DictReader(open('hasy-data-labels.csv')) if r['latex'] in HASYMAP]
    for r in rows:
        for k in range(1):
            o=hasy_img(r['path'],rng)
            if o: X.append(o[0]);A.append(o[1]);Y.append(CI[HASYMAP[r['latex']]]);SRC.append('h:'+r['user_id'])
    print('hasy',len(X))
    
    # 2. Mined MathWriting glyphs
    mined = []
    mined_path = './hw-data/work/mined_code.pkl'
    if os.path.exists(mined_path):
        mined = pickle.load(open(mined_path,'rb'))
        print('mined_code', len(mined))
    else:
        # Fall back to original mined.pkl and filter
        mined = pickle.load(open('./hw-data/work/mined.pkl','rb'))
        print('mined (original)', len(mined))
    
    # Also mine from MathWriting symbols subset for code chars
    MW='./hw-data/mathwriting-2024'
    from mine import CMD as ORIG_CMD, strokes as orig_strokes
    CODE_CHARS_MAP = {
        '[': 'lbracket', ']': 'rbracket',
        '{': 'lbrace', '}': 'rbrace',
        '*': 'star', ';': 'semi', ':': 'colon',
        "'": 'squote', '"': 'dquote',
        '/': 'slash', '.': 'dot', '_': 'underscore',
        '%': 'percent', '$': 'dollar', '^': 'caret',
        '?': 'question', '!': 'excl', '&': 'ampersand',
        '#': 'hash', '\\': 'backslash',
    }
    SYM_CMD = dict(ORIG_CMD)
    SYM_CMD.update({
        '\\{':'lbrace','\\}':'rbrace','\\#':'hash','\\$':'dollar','\\%':'percent',
        '\\backslash':'backslash','\\|':'pipe',
    })
    for fn in os.listdir(MW+'/symbols'):
        t=open(MW+'/symbols/'+fn).read()
        lbl_m = re.search(r'type="label">(.*?)</annotation>',t)
        if not lbl_m: continue
        lbl = lbl_m.group(1).replace('&amp;','&')
        lab = SYM_CMD.get(lbl, None)
        if lab is None:
            if lbl in CODE_CHARS_MAP:
                lab = CODE_CHARS_MAP[lbl]
            elif lbl in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789(),+-=<>|':
                lab = lbl
        if lab and lab in CI:
            mined.append((lab, orig_strokes(t), fn))
    
    # 3. Replicate mined glyphs
    reps=collections.Counter()
    cnt=collections.Counter(l for l,_,_ in mined)
    for lab,S,fn in mined:
        if lab not in CI: continue
        n=int(np.clip(400/max(cnt[lab],1),2,12))
        for k in range(n):
            im,asp=render_strokes(jitter(S,rng) if k else S,rng.uniform(1.4,3.0),rng)
            X.append(im);A.append(asp);Y.append(CI[lab]);SRC.append('m:'+fn)
    
    # 4. Synthetic glyphs for missing code symbols
    synth = synthesize_code_glyphs(rng)
    synth_classes = set(CODE_ONLY) - set(l for l,_,_ in mined if l in CI)
    # Also augment classes with few mined samples
    for lab in CODE_ONLY:
        c = cnt.get(lab, 0)
        if c < 50:
            synth_classes.add(lab)
    
    print('synthesizing:', sorted(synth_classes))
    for lab in synth_classes:
        if lab not in synth or lab not in CI: continue
        S = synth[lab]
        for k in range(200):
            im,asp=render_strokes(jitter(S,rng),rng.uniform(1.4,3.0),rng)
            X.append(im);A.append(asp);Y.append(CI[lab]);SRC.append('s:'+lab)
    
    X=np.stack(X);A=np.array(A,np.float32);Y=np.array(Y)
    np.savez_compressed('./hw-data/work/ds_code.npz',X=X,A=A,Y=Y,SRC=np.array(SRC))
    json.dump(CLASSES,open('./hw-data/work/classes_code.json','w'))
    print(X.shape, collections.Counter(CLASSES[y] for y in Y).most_common())
