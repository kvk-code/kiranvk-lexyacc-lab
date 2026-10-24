# Train the LEX/YACC code-ink CNN on a Modal GPU.   modal run train_modal.py --epochs 30
# Same architecture as the Logic Lab model (so ink.js forward() runs it unchanged), wider f1, stronger augmentation.
import modal
app = modal.App('lexyacc-ink-train')
image = modal.Image.from_registry('pytorch/pytorch:2.4.1-cuda12.1-cudnn9-runtime')
vol = modal.Volume.from_name('lexyacc-ink', create_if_missing=True)

@app.function(image=image, gpu='T4', timeout=3600, volumes={'/vol': vol})
def train(epochs: int = 30, seed: int = 0):
    import numpy as np, json, torch, torch.nn as nn, torch.nn.functional as F, time, io
    torch.manual_seed(seed); dev = 'cuda'
    d = np.load('/vol/ds2.npz'); C = json.load(open('/vol/classes2.json'))['classes']
    X = torch.tensor(d['X'], dtype=torch.float32).unsqueeze(1) / 255.; A = torch.tensor(d['A']).clamp(-3, 3).unsqueeze(1); Y = torch.tensor(d['Y'])
    src = d['SRC']; import zlib; h = np.array([zlib.crc32(str(s).encode()) % 10 for s in src]); va = torch.tensor(h == 0); tr = ~va
    class Net(nn.Module):
        def __init__(s, n):
            super().__init__()
            s.c1 = nn.Conv2d(1, 24, 3, padding=1); s.c2 = nn.Conv2d(24, 32, 3, padding=1)
            s.c3 = nn.Conv2d(32, 48, 3, padding=1); s.c4 = nn.Conv2d(48, 64, 3, padding=1); s.c5 = nn.Conv2d(64, 96, 3, padding=1)
            s.f1 = nn.Linear(96 * 4 * 4 + 1, 192); s.f2 = nn.Linear(192, n)
        def feat(s, x, a):
            x = F.relu(s.c1(x)); x = F.max_pool2d(F.relu(s.c2(x)), 2)
            x = F.relu(s.c3(x)); x = F.max_pool2d(F.relu(s.c4(x)), 2)
            x = F.max_pool2d(F.relu(s.c5(x)), 2)
            return F.relu(s.f1(torch.cat([x.flatten(1), a], 1)))
        def forward(s, x, a): return s.f2(F.dropout(s.feat(x, a), 0.3, s.training))
    net = Net(len(C)).to(dev)
    Xt, At, Yt = X[tr].to(dev), A[tr].to(dev), Y[tr].to(dev); Xv, Av, Yv = X[va].to(dev), A[va].to(dev), Y[va].to(dev)
    cnt = torch.bincount(Yt, minlength=len(C)).float(); w = (1 / cnt[Yt]).double().cpu()
    opt = torch.optim.AdamW(net.parameters(), 2e-3, weight_decay=1e-4); B = 512
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, 4e-3, total_steps=epochs * (len(w) // B + 1))
    def aug(x):
        n = x.shape[0]; ang = torch.randn(n, device=dev) * 0.12; sc = torch.exp(torch.randn(n, device=dev) * 0.10); sh = torch.randn(n, device=dev) * 0.15
        th = torch.stack([torch.stack([sc * torch.cos(ang), -sc * torch.sin(ang) + sh, torch.randn(n, device=dev) * 0.05], 1),
                          torch.stack([sc * torch.sin(ang), sc * torch.cos(ang), torch.randn(n, device=dev) * 0.05], 1)], 1)
        x = F.grid_sample(x, F.affine_grid(th, x.shape, align_corners=False), align_corners=False)
        m = torch.rand(n, device=dev) < 0.3
        if m.any(): x[m] = F.max_pool2d(x[m], 3, 1, 1)
        return x
    best = 0; log = []
    for ep in range(epochs):
        net.train(); t = time.time(); idx = torch.multinomial(w, len(w), replacement=True).to(dev); L = 0
        for b in range(0, len(idx), B):
            j = idx[b:b + B]; out = net(aug(Xt[j]), At[j]); loss = F.cross_entropy(out, Yt[j], label_smoothing=0.05)
            opt.zero_grad(); loss.backward(); opt.step(); sched.step(); L += loss.item()
        net.eval()
        with torch.no_grad(): p = net(Xv, Av).argmax(1)
        acc = (p == Yv).float().mean().item(); log.append((ep, round(L / (len(idx) / B), 3), round(acc, 4), round(time.time() - t, 1))); print(log[-1], flush=True)
        if acc >= best: best = acc; sd = {k: v.cpu() for k, v in net.state_dict().items()}
    conf = {}
    net.load_state_dict(sd)
    with torch.no_grad(): p = net(Xv, Av).argmax(1).cpu()
    for a, b in zip(Yv.cpu().tolist(), p.tolist()):
        if a != b: k = C[a] + '→' + C[b]; conf[k] = conf.get(k, 0) + 1
    buf = io.BytesIO(); torch.save(sd, buf)
    return {'state': buf.getvalue(), 'best': best, 'log': log, 'conf': sorted(conf.items(), key=lambda x: -x[1])[:30]}

@app.local_entrypoint()
def main(epochs: int = 30):
    import json
    r = train.remote(epochs)
    open('./hw-data/work2/net2.pt', 'wb').write(r['state'])
    json.dump({k: r[k] for k in ('best', 'log', 'conf')}, open('./hw-data/work2/train2.json', 'w'), indent=1)
    print('best val', r['best']); print(r['conf'][:15])
