# csv-reader-speed-01-run-20261121

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/baltikano9/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/baltikano9/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A fast, dependency-free drop-in replacement for make.fun's csv-reader 1.0.0. `solve.js` exports `run(input)`, which returns exactly csv-reader's reading of a broken CSV text — `{columns, rows, errors}` with the same stray-CR, quote-junk, unterminated-quote, short-row and long-row behaviour — but reads with cached `indexOf` delimiter searches and one slice per field instead of character-by-character concatenation, making it roughly 3.4x faster on the practice set. `main.ts` is the harness driver: it answers every case in `cases.json` with `run` and writes `answers.json`.

## Run it

```sh
mkdir -p out && MAKEFUN_INPUT_DIR=<dir containing cases.json> MAKEFUN_OUTPUT_DIR=out node main.ts
```

The answers land at `out/answers.json`, one per case, in the cases' order.

---

<sub>Entered on [make.fun](https://make.fun/?ref=ftn0yn4s&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
