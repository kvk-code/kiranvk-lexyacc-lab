import numpy as np,json,torch,torch.nn as nn,torch.nn.functional as F,time,sys,gc
torch.set_num_threads(4); torch.manual_seed(0)
d=np.load('./hw-data/work/ds_code.npz'); C=json.load(open('./hw-data/work/classes_code.json'))
X=torch.tensor(d['X'],dtype=torch.float32).unsqueeze(1)/255.; A=torch.tensor(d['A']).clamp(-3,3).unsqueeze(1); Y=torch.tensor(d['Y'])
del d; gc.collect()
src=np.load('./hw-data/work/ds_code.npz')['SRC']; h=np.array([hash(s)%10 for s in src]); va=torch.tensor(h==0); tr=~va
del src; gc.collect()

# Original 85 classes - these must not regress
C_orig = set(json.load(open('./hw-data/work/classes.json')))
orig_indices = [i for i,c in enumerate(C) if c in C_orig]
new_indices = [i for i,c in enumerate(C) if c not in C_orig]

class Net(nn.Module):
    def __init__(s,n):
        super().__init__()
        s.c1=nn.Conv2d(1,24,3,padding=1); s.c2=nn.Conv2d(24,32,3,padding=1)
        s.c3=nn.Conv2d(32,48,3,padding=1); s.c4=nn.Conv2d(48,64,3,padding=1); s.c5=nn.Conv2d(64,96,3,padding=1)
        s.f1=nn.Linear(96*4*4+1,192); s.f2=nn.Linear(192,n)
    def forward(s,x,a):
        x=F.relu(s.c1(x)); x=F.max_pool2d(F.relu(s.c2(x)),2)
        x=F.relu(s.c3(x)); x=F.max_pool2d(F.relu(s.c4(x)),2)
        x=F.max_pool2d(F.relu(s.c5(x)),2)
        feat=F.relu(s.f1(torch.cat([x.flatten(1),a],1)))
        return s.f2(F.dropout(feat,0.3,s.training))

net=Net(len(C)); print(sum(p.numel() for p in net.parameters()),'params')

# Weighted sampling - boost original classes to prevent regression
cnt=torch.bincount(Y[tr],minlength=len(C)).float()
# Give original classes 3x weight to protect them
w=(1/cnt[Y[tr]]).double()
for i,idx in enumerate(Y[tr]):
    if idx.item() in orig_indices:
        w[i] *= 3.0
samp=torch.utils.data.WeightedRandomSampler(w,len(w))

Xt=X[tr].clone(); At=A[tr].clone(); Yt=Y[tr].clone()
Xv=X[va].clone(); Av=A[va].clone(); Yv=Y[va].clone()
del X, A, Y; gc.collect()

opt=torch.optim.AdamW(net.parameters(),2e-3,weight_decay=1e-4); E=int(sys.argv[1]) if len(sys.argv)>1 else 20
sched=torch.optim.lr_scheduler.OneCycleLR(opt,3e-3,total_steps=E*(len(w)//256+1))

def aug(x):
    n=x.shape[0]; ang=torch.randn(n)*0.10; sc=torch.exp(torch.randn(n)*0.08); sh=torch.randn(n)*0.10
    th=torch.stack([torch.stack([sc*torch.cos(ang),-sc*torch.sin(ang)+sh,torch.randn(n)*0.04],1),torch.stack([sc*torch.sin(ang),sc*torch.cos(ang),torch.randn(n)*0.04],1)],1)
    g=F.affine_grid(th,x.shape,align_corners=False); x=F.grid_sample(x,g,align_corners=False)
    m=torch.rand(n)<0.3
    if m.any(): x[m]=F.max_pool2d(x[m],3,1,1)
    return x

best_acc=0; best_orig_acc=0
for ep in range(E):
    net.train(); t=time.time(); idx=torch.tensor(list(samp)); L=0; nb=0
    for b in range(0,len(idx),256):
        j=idx[b:b+256]; xb=aug(Xt[j]); ab=At[j]; yb=Yt[j]
        out=net(xb,ab); loss=F.cross_entropy(out,yb,label_smoothing=0.05)
        opt.zero_grad(); loss.backward(); opt.step(); sched.step(); L+=loss.item(); nb+=1
        del xb
    net.eval()
    with torch.no_grad():
        ps=[]
        for b in range(0,len(Xv),512):
            ps.append(net(Xv[b:b+512],Av[b:b+512]).argmax(1))
        p=torch.cat(ps)
    acc=(p==Yv).float().mean().item()
    # Check original classes accuracy
    orig_mask = torch.tensor([y.item() in orig_indices for y in Yv])
    orig_acc = (p[orig_mask]==Yv[orig_mask]).float().mean().item() if orig_mask.sum() > 0 else 0
    if orig_acc>best_orig_acc: best_orig_acc=orig_acc; torch.save(net.state_dict(),'net_code.pt')
    print(ep,round(L/nb,3),'val',round(acc,4),'orig',round(orig_acc,4),'best_orig',round(best_orig_acc,4),round(time.time()-t),'s',flush=True)

# Load best and eval
net.load_state_dict(torch.load('net_code.pt'))
net.eval()
with torch.no_grad():
    ps=[]
    for b in range(0,len(Xv),512):
        ps.append(net(Xv[b:b+512],Av[b:b+512]).argmax(1))
    p=torch.cat(ps)
acc=(p==Yv).float().mean().item()
orig_mask = torch.tensor([y.item() in orig_indices for y in Yv])
orig_acc = (p[orig_mask]==Yv[orig_mask]).float().mean().item()
print(f'FINAL: overall {acc:.4f}, original classes {orig_acc:.4f}')

# Per-class for new symbols
for idx in new_indices[:10]:
    mask = Yv == idx
    if mask.sum() == 0: continue
    correct = (p[mask] == idx).float().mean().item()
    print(f'  {C[idx]:12s}: {correct:.3f} (n={mask.sum().item()})')
