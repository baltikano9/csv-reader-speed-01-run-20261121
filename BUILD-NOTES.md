# Build notes — csv-reader-speed-01-run-20261121

Files: `solve.js` (our own parser, no dependencies), `main.ts` (driver), `package.json`.

## Approach

- **Slice instead of concatenating.** An unquoted field ends at the nearest of the next `,` / LF / CR. Each of
  those three positions is found with `indexOf` and cached until the reader passes it, so every delimiter is
  searched for once. The field is then taken with one `slice`. Only a stray CR splits a field into joined segments.
- **Quoted fields** jump from quote to quote with `indexOf('"')`. The text between two quotes is one slice; `""`
  adds a `"` and continues. A chunk is normalised (CRLF / lone CR → LF, char loop) only when the cached next-CR
  position falls inside it. LFs inside a chunk are counted from the cached next-LF position, so clean fields do
  no line work. An unterminated quote rewinds to after the quote, resets the caches and re-reads unquoted with
  prefix `"`, as the reference does.
- **JIT-friendly shape.** The work per record is in `readRecord`, called once per record (~60k calls over the
  practice set). V8 optimises it once with normal tiering and keeps that code for every case. The first version
  had one big loop in `run`, which V8 re-compiled through OSR (~25 ms of Turbofan time) on every call. State is
  kept in module variables between calls and copied into locals inside them.
- **Packed output arrays.** Fields go into one reused scratch array, and each record is cut from it with one
  exact-size `slice`. Pre-sizing with `new Array(width)` was faster to fill, but the holey arrays it creates made
  the driver's `JSON.stringify` ~45 ms slower. The scratch approach keeps most of the fill gain and keeps arrays packed.
- `main.ts` is the house baseline driver (same flags, including `--no-incremental-marking` before importing
  solve.js, same I/O). Our changes: named `answerAll` function, `Case` / `Solver` types, constants for the file names.

Tried and dropped: a JIT warm-up over a synthetic CSV at import (cost ~25 ms and gave no measurable gain),
and V8 GC / semi-space flags set via `setFlagsFromString` (no reliable effect at runtime; only CLI flags helped,
and the harness runs plain `node main.ts`).

## Correctness

- Practice set: `MAKEFUN_INPUT_DIR=… MAKEFUN_OUTPUT_DIR=… node main.ts`, compared with
  `practice/reference/expected.json` (`cases[i].output`), using `isDeepStrictEqual` and an identical
  `JSON.stringify`: **6/6 match**.
- Differential fuzzing against the vendor `readCsv` (deep-strict equal and identical JSON, so error order and the
  `fields` / `extra` keys are checked too):
  - token fuzzer: random mixes of quotes, `""`, `"""`, quote junk, CRLF, lone CRs, CR runs, empty lines, BOMs
    (leading and mid-text), unicode/emoji, commas, trailing CRs, header `true` / `false` / `"true"`, plus
    non-string / empty text. **80,000 cases, 0 mismatches**.
  - large-text fuzzer: 50–1500-row CSVs with ragged rows, sparse corruption, CRLF/LF, and random truncation.
    **600 cases, 0 mismatches**.
- The fuzzer found one real bug during development, now fixed: the "no LF" sentinel equals `len`, so a stray CR
  as the last character of the text was mistaken for CRLF.

(The test scripts were kept outside the repo, in `/tmp/csvtest/`, to keep the repo small.)

## Benchmark (practice set, 6 cases, Node 24 locally; CPU = user + sys)

| measure | reference readCsv | ours | speed-up |
|---|---|---|---|
| in-process, first (cold) pass over 6 cases | ~1200 ms | ~265 ms | ~4.5x |
| in-process, warm pass (best of 5) | ~705 ms | ~59 ms | ~12x |
| `run` over all cases in a fresh process (median of 9) | ~1091 ms | ~316 ms | ~3.4x |
| whole driver process, `node main.ts` (median of 10) | ~2.13 s | ~0.90 s | ~2.35x |

The whole-process figure includes fixed costs that are the same for both: Node startup plus parsing the 11 MB
`cases.json` (~0.27 s), and `JSON.stringify` of the ~12 MB answer (~0.2–0.3 s). Timings on this machine vary by
about ±10–15% from run to run.
