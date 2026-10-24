# LEX/YACC code-ink v2: glyph dataset for the dedicated code model.
# Look-alike glyphs share ONE class; the decoder resolves them from context (char-class ranges, the language model, the lexicon).
# Writer-disjoint: MathWriting train inks + HASY users train; MathWriting valid/test writers are kept for the line eval only.
import csv,json,os,pickle,collections,math,numpy as np,sys
from PIL import Image,ImageDraw,ImageFilter
R=32; BOX=26; SS=4
W='./hw-data/work2'
# class → characters it may stand for (first = the most common reading)
GROUPS={'O':'0Oo','I':'1lI|','c':'cC','k':'kK','p':'pP','s':'sS','u':'uU','v':'vV','w':'wW','x':'xX','z':'zZ',
        'tick':"',`",'bar':'-_','dot':'.'}
CH2CLS={}
for k,v in GROUPS.items():
    for ch in v: CH2CLS[ch]=k
for ch in 'abdefghijmnqrty'+'ABDEFGHJLMNQRTY'+'23456789'+'()[]{}+*;:"\\/%$?!&#=<>': CH2CLS.setdefault(ch,ch)
CLASSES=sorted(set(CH2CLS.values()),key=lambda s:(len(s)>1,s))
CI={c:i for i,c in enumerate(CLASSES)}
HASY={'\\{':'{','\\}':'}','[':'[',']':']','\\#':'#','\\%':'%','\\$':'$','\\&':'&','\\ast':'*','\\star':'*','/':'/','\\backslash':'\\','\\setminus':'\\',
      '\\mid':'|','\\cdot':'.','<':'<','>':'>','+':'+','-':'-','\\prime':"'"}
for ch in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789': HASY[ch]=ch

def render_strokes(S,width):
    pts=np.concatenate([np.array(s,float).reshape(-1,2) for s in S]); x0,y0=pts.min(0); x1,y1=pts.max(0)
    w,h=max(x1-x0,1e-3),max(y1-y0,1e-3); sc=BOX/max(w,h)
    ox=(R-w*sc)/2-x0*sc; oy=(R-h*sc)/2-y0*sc
    im=Image.new('L',(R*SS,R*SS),0); d=ImageDraw.Draw(im); lw=max(1,int(round(width*SS)))
    for s in S:
        p=[((x*sc+ox)*SS,(y*sc+oy)*SS) for x,y in s]
        if len(p)==1: p=p*2
        d.line(p,fill=255,width=lw,joint='curve')
        for q in (p[0],p[-1]): d.ellipse([q[0]-lw/2,q[1]-lw/2,q[0]+lw/2,q[1]+lw/2],fill=255)
    return np.asarray(im.resize((R,R),Image.BILINEAR),np.uint8), math.log(w/h)
def jitter(S,rng):
    a=rng.normal(0,0.12); sh=rng.normal(0,0.18); sx=math.exp(rng.normal(0,0.12))
    M=np.array([[math.cos(a)*sx,-math.sin(a)+sh],[math.sin(a),math.cos(a)]])
    pts=np.concatenate([np.array(s,float).reshape(-1,2) for s in S]); c=pts.mean(0); scale=max(np.ptp(pts[:,0]),np.ptp(pts[:,1]),1)
    return [((np.array(s,float).reshape(-1,2)-c)@M.T+rng.normal(0,0.008*scale,(len(s),2))).tolist() for s in S]
def hasy_img(path,rng):
    a=255-np.asarray(Image.open(path).convert('L'),np.uint8); ys,xs=np.nonzero(a>80)
    if len(xs)==0: return None
    c=a[ys.min():ys.max()+1,xs.min():xs.max()+1]; h,w=c.shape; sc=BOX/max(h,w)
    im=Image.fromarray(c).resize((max(1,round(w*sc)),max(1,round(h*sc))),Image.BILINEAR)
    k=rng.choice([1,3,3])
    if k>1: im=im.filter(ImageFilter.MaxFilter(int(k)))
    out=Image.new('L',(R,R),0); out.paste(im,((R-im.width)//2,(R-im.height)//2))
    return np.asarray(out,np.uint8), math.log(w/h)

# stroke generators for the few code glyphs with too little real ink (" ; : ! ? ' etc.), drawn with random wobble
def gen(ch,rng):
    r=lambda s=0.06: rng.normal(0,s)
    def L(a,b,n=10): return [[a[0]+(b[0]-a[0])*i/n+r(.015),a[1]+(b[1]-a[1])*i/n+r(.015)] for i in range(n+1)]
    def dot(x,y): return [[x+r(.02),y+r(.02)],[x+0.03+r(.02),y+0.03+r(.02)]]
    def arc(cx,cy,rx,ry,a0,a1,n=16): return [[cx+rx*math.cos(math.radians(a0+(a1-a0)*i/n))+r(.01),cy+ry*math.sin(math.radians(a0+(a1-a0)*i/n))+r(.01)] for i in range(n+1)]
    t=rng.uniform(-.12,.12)
    if ch=='"': g=rng.uniform(.25,.45); return [L([0.05+t,0],[0,0.35+r()]),L([g+t,0],[g-0.03,0.35+r()])]
    if ch=="'": return [L([0.05+t,0],[0,0.4+r()])]
    if ch==';': return [dot(0.1,0.15+r(.04)),L([0.12,0.55],[0.02+r(.03),0.95+r(.05)],6)]
    if ch==':': return [dot(0.1,0.15+r(.04)),dot(0.1,0.8+r(.04))]
    if ch=='!': return [L([0.1+t,0],[0.1,0.7+r()]),dot(0.1,0.95)]
    if ch=='?': return [arc(0.3,0.25,0.28,0.24,200,400)+L([0.55,0.32],[0.3,0.62],6)[1:],dot(0.3,0.95)]
    if ch=='&': return [arc(0.3,0.22,0.18,0.2,0,300)+L([0.2,0.4],[0.75,1.0],8)[1:]+arc(0.35,0.75,0.3,0.25,-10,200)[1:]]
    if ch=='#': return [L([0.3,0],[0.22,1]),L([0.7,0],[0.62,1]),L([0,0.33],[0.95,0.33]),L([0,0.67],[0.95,0.67])]
    if ch=='\\': return [L([0,0],[0.7+r(),1])]
    if ch=='%': return [L([0.85,0],[0.1,1]),arc(0.18,0.18,0.14,0.16,0,360),arc(0.8,0.82,0.14,0.16,0,360)]
    if ch=='^': return [L([0,0.5],[0.3,0])+L([0.3,0],[0.6+r(),0.5])[1:]]
    if ch=='$': return [arc(0.35,0.3,0.28,0.2,0,270)+arc(0.35,0.7,0.28,0.2,270,90-360+360*0)[1:],L([0.35,-0.1],[0.35,1.1])]
    return None

if __name__=='__main__':
    rng=np.random.default_rng(0); X=[];A=[];Y=[];SRC=[]
    # 1. HASY (writer = user id)
    rows=[r for r in csv.DictReader(open('./hw-data/hasy/hasy-data-labels.csv')) if r['latex'] in HASY]
    os.chdir('./hw-data/hasy'); hc=collections.Counter()
    for r in rows:
        ch=HASY[r['latex']]; c=CH2CLS.get(ch)
        if c is None or hc[c]>=900: continue
        o=hasy_img(r['path'],rng)
        if o: X.append(o[0]);A.append(o[1]);Y.append(CI[c]);SRC.append('h:'+r['user_id']); hc[c]+=1
    print('hasy',len(X),flush=True)
    # 2. MathWriting train glyphs, replicated with jitter so every class gets ~700
    mined=[x for x in pickle.load(open(W+'/mined2_train.pkl','rb')) if x[0] in CH2CLS]
    cnt=collections.Counter(CH2CLS[l] for l,_,_ in mined)
    for ch,S,fn in mined:
        c=CH2CLS[ch]; n=int(np.clip(700/max(cnt[c],1),1,14))
        for k in range(n):
            im,asp=render_strokes(jitter(S,rng) if k else S,rng.uniform(1.4,3.0))
            X.append(im);A.append(asp);Y.append(CI[c]);SRC.append('m:'+fn)
    print('mined',len(mined),flush=True)
    # 3. generated strokes for thin classes
    have=collections.Counter(CLASSES[y] for y in Y)
    for ch in '"\';:!?&#\\%$':
        c=CH2CLS[ch]; need=max(0,600-have[c])
        for k in range(need):
            S=gen(ch,rng)
            if not S: break
            im,asp=render_strokes(jitter([[[x*60,y*60] for x,y in s] for s in S],rng),rng.uniform(1.4,3.0))
            X.append(im);A.append(asp);Y.append(CI[c]);SRC.append('g:'+ch+':'+str(k))
    X=np.stack(X);A=np.array(A,np.float32);Y=np.array(Y)
    np.savez_compressed(W+'/ds2.npz',X=X,A=A,Y=Y,SRC=np.array(SRC))
    json.dump({'classes':CLASSES,'groups':GROUPS,'ch2cls':CH2CLS},open(W+'/classes2.json','w'))
    print(X.shape,len(CLASSES),'classes'); print(sorted(collections.Counter(CLASSES[y] for y in Y).items(),key=lambda x:x[1])[:20])
