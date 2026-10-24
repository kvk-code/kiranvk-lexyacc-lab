# LEX–YACC Lab — build, check and run LEX/YACC programs in the browser

**Live:** https://kiranvk.me/compiler-lab/lexyacc/  ·  free, no login

A self-exploration board for the KTU Compiler Lab (CSL411): from a question to tokens (LEX) to a grammar (YACC) to a
working lab-manual-style `.l` + `.y` pair. Regexes, conflicts and test strings are checked in the browser (LALR(1) via jison);
a bank of 52 lab/exam questions with reference programs is included, all verified against real flex/bison.

## Files
| File | Role |
|---|---|
| `lexyacc-core.js` | LEX-dialect regex → JS, token stream, grammar checks, simulator |
| `bank.js` | Question bank with tests and reference programs (generated) |
| `app.js`, `index.php`, `style.css` | The page |
| `vendor/jison.min.js` | LALR(1) parser generator (MIT) |
| `ink/` | Handwriting pad and models · `ink/train/` training scripts |
| `ai.php` | Relay to NVIDIA NIM with the **student's own** key |
| `bench/` | Tests |

## Run it locally
```bash
git clone https://github.com/kvk-code/kiranvk-lexyacc-lab.git && cd kiranvk-lexyacc-lab
php -S localhost:8000        # then open http://localhost:8000/
```
```bash
node bench/test-core.cjs
```
`ai.php` expects the shared helper `../../ai/wumpus/lib.php` (from [kiranvk-wumpus-justify](https://github.com/kvk-code/kiranvk-wumpus-justify)); everything except Unstuck works without it.

## AI features and secrets
Unstuck is optional and *bring-your-own-key* (free NVIDIA key from build.nvidia.com), sent for one call, never stored.
No key, password or log file is in this repository. Server-side settings live in a config directory **outside the web root** and are never published.

## Relationship to the website
This repo is an exact mirror of https://kiranvk.me/compiler-lab/lexyacc/. Every deploy of the site publishes the same files here (`sync:` commits).
Community pull requests are reviewed, merged into the site source, deployed, and then come back here with the next sync.

## Licence
Code: MIT (see `LICENSE`). Third-party components and data: see `THIRD_PARTY.md` where present.
Built by **Kiran V K**, Assistant Professor, Dept. of CSE, NSS College of Engineering, Palakkad, for KTU students. Live: https://kiranvk.me/compiler-lab/lexyacc/
