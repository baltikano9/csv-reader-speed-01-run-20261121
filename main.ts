// Driver for our csv-reader-speed-01 entry, based on make.fun's house baseline driver: the harness runs
// `node /bot/main.ts` (node22). It reads every case from /input/cases.json (a JSON array of {id, input}), answers each
// one alone with run() from solve.js, and writes /output/answers.json: a JSON array of the answers, one per case and in
// the cases' order. Outside a container MAKEFUN_INPUT_DIR and MAKEFUN_OUTPUT_DIR stand in for /input and /output.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';

// V8's incremental marking off, set before solve.js is imported so all of its work runs under it (the rules: the house
// baseline runs with --no-incremental-marking, and an entry may tune V8's flags too).
setFlagsFromString('--no-incremental-marking');

/** One case of the harness's input file. */
type Case = { id: string; input: unknown };
type Solver = (input: unknown) => unknown;

/** solve.js, imported by its URL (a .js module carries no types) and typed by its contract. */
const { run } = (await import(new URL('./solve.js', import.meta.url).href)) as { run: Solver };

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const CASES_FILE = 'cases.json';
const ANSWERS_FILE = 'answers.json';

/** Answers every case on its own, in the cases' order. */
function answerAll(cases: readonly Case[], solve: Solver): unknown[] {
  const answers: unknown[] = new Array(cases.length);
  for (let i = 0; i < cases.length; i++) answers[i] = solve(cases[i].input);
  return answers;
}

const cases = JSON.parse(readFileSync(join(INPUT_DIR, CASES_FILE), 'utf8')) as Case[];
writeFileSync(join(OUTPUT_DIR, ANSWERS_FILE), JSON.stringify(answerAll(cases, run)));
