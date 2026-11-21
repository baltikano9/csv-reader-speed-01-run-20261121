// Fast drop-in for csv-reader 1.0.0's readCsv: same answer {columns, rows, errors} for every input.
//
// Built on slicing rather than per-character concatenation:
//   - an unquoted field ends at the nearest of the next comma / LF / CR, each found with indexOf and cached
//     until passed, and is taken with one slice (a stray CR splits it into segments that are joined);
//   - a quoted field jumps quote to quote with indexOf; the text between quotes is one slice, normalised
//     (CRLF / lone CR -> LF) only when it holds a CR; its lines are counted from the cached LF / CR positions.
//
// The work per record lives in readRecord, called once per record: V8 optimises it once and reuses that code
// for every case (a single big loop in run would be re-compiled through OSR on every call). The reader's state
// sits in module variables between calls and in locals inside them. Nothing is kept from one run to the next.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

let text = '';
let len = 0;
let pos = 0; // the next character to read
let line = 1; // the line that character is on
// First LF / CR / comma at or after the last query point (-1: unknown, len: none). Queries only move forward,
// except after an unterminated quote rewinds, which resets all three.
let nextLf = -1;
let nextCr = -1;
let nextComma = -1;
let errors = null;
// Set by readRecord: how many fields it read, and whether its last field opened with a quote.
let fieldCount = 0;
let lastQuoted = false;
// readRecord's fields go here first (a packed array reused for every record); each record is then taken
// from it with one exact-size slice, which keeps the answer's arrays packed and fast to stringify.
const scratch = [];

/** Reads one record starting at pos (not at the end, not at a line break) into `fields`, from index 0. */
function readRecord(fields, recordLine, recordRow) {
  const t = text;
  const n = len;
  let p = pos;
  let ln = line;
  let lf = nextLf;
  let cr = nextCr;
  let cm = nextComma;
  let count = 0;
  let quoted = false;
  let ended = COMMA;

  while (ended === COMMA) {
    let prefix = '';
    let junk = false;

    if (t.charCodeAt(p) === 34) {
      quoted = true;
      const open = p;
      const openLine = ln;
      let q0 = p + 1;
      let value = '';
      let pieces = 0;
      let closed = false;
      for (;;) {
        const q = t.indexOf('"', q0);
        if (q < 0) break;
        if (lf < q0) {
          lf = t.indexOf('\n', q0);
          if (lf < 0) lf = n;
        }
        if (cr < q0) {
          cr = t.indexOf('\r', q0);
          if (cr < 0) cr = n;
        }
        let chunk;
        if (cr < q) {
          // Normalise CRLF / lone CR to LF and count every line break.
          chunk = '';
          let s = q0;
          for (let i = q0; i < q; i++) {
            const c = t.charCodeAt(i);
            if (c === 13) {
              chunk += t.slice(s, i) + '\n';
              ln++;
              if (t.charCodeAt(i + 1) === 10) i++;
              s = i + 1;
            } else if (c === 10) ln++;
          }
          chunk += t.slice(s, q);
        } else {
          chunk = t.slice(q0, q);
          if (lf < q) {
            let i = lf;
            while (i < q) {
              ln++;
              i = t.indexOf('\n', i + 1);
              if (i < 0) i = n;
            }
            lf = i;
          }
        }
        if (pieces === 0) value = chunk;
        else value += chunk;
        pieces++;
        if (t.charCodeAt(q + 1) === 34) {
          value += '"';
          q0 = q + 2;
          continue;
        }
        p = q + 1;
        closed = true;
        break;
      }
      if (closed) {
        if (p >= n) {
          fields[count++] = value;
          ended = END;
          continue;
        }
        const c = t.charCodeAt(p);
        if (c === 44) {
          p++;
          fields[count++] = value;
          continue;
        }
        if (c === 10) {
          p++;
          ln++;
          fields[count++] = value;
          ended = LINE_BREAK;
          continue;
        }
        if (c === 13 && t.charCodeAt(p + 1) === 10) {
          p += 2;
          ln++;
          fields[count++] = value;
          ended = LINE_BREAK;
          continue;
        }
        // What follows the closing quote is appended as it stands (quote_junk).
        prefix = value;
        junk = true;
      } else {
        // Never closes: the quote is a literal and the text after it is read again, unquoted.
        errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
        p = open + 1;
        ln = openLine;
        lf = -1;
        cr = -1;
        cm = -1;
        prefix = '"';
      }
    } else {
      quoted = false;
    }

    // Unquoted read onto `prefix` up to the next comma or line break; stray CRs are dropped.
    let s = p;
    let value = prefix;
    let split = false;
    for (;;) {
      if (cm < p) {
        cm = t.indexOf(',', p);
        if (cm < 0) cm = n;
      }
      if (lf < p) {
        lf = t.indexOf('\n', p);
        if (lf < 0) lf = n;
      }
      if (cr < p) {
        cr = t.indexOf('\r', p);
        if (cr < 0) cr = n;
      }
      const e = cm < lf ? cm : lf;
      if (cr < e) {
        p = cr;
        if (t.charCodeAt(p + 1) === 10) {
          ended = LINE_BREAK;
          break;
        }
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        value += t.slice(s, p);
        split = true;
        s = ++p;
        continue;
      }
      p = e;
      ended = e >= n ? END : e === cm ? COMMA : LINE_BREAK;
      break;
    }
    if (split || junk || prefix !== '') value += t.slice(s, p);
    else value = t.slice(s, p);
    if (junk && value.length > prefix.length) {
      errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
    }
    fields[count++] = value;
    if (ended === COMMA) p++;
    else if (ended === LINE_BREAK) {
      p += t.charCodeAt(p) === 13 ? 2 : 1;
      ln++;
    }
  }

  pos = p;
  line = ln;
  nextLf = lf;
  nextCr = cr;
  nextComma = cm;
  fieldCount = count;
  lastQuoted = quoted;
}

export function run(input) {
  const src = String(input.text);
  const header = input.header === true;
  const errs = [];
  const rows = [];
  let columns = null;
  let width = -1;

  text = src;
  len = src.length;
  pos = len > 0 && src.charCodeAt(0) === 0xfeff ? 1 : 0;
  line = 1;
  nextLf = -1;
  nextCr = -1;
  nextComma = -1;
  errors = errs;

  for (;;) {
    // Lines with no characters are no records.
    while (pos < len) {
      const c = src.charCodeAt(pos);
      if (c === 10) {
        pos++;
        line++;
      } else if (c === 13 && src.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line++;
      } else break;
    }
    if (pos >= len) break;

    const recordLine = line;
    const recordRow = header && columns === null ? null : rows.length;
    readRecord(scratch, recordLine, recordRow);
    const n = fieldCount;

    // A line that held only stray CRs is left with no characters: no record (its stray_cr errors stay).
    if (n === 1 && !lastQuoted && scratch[0] === '') continue;

    if (width < 0) width = n;
    if (header && columns === null) {
      columns = scratch.slice(0, n);
      continue;
    }
    let fields;
    if (n === width) {
      fields = scratch.slice(0, n);
    } else if (n < width) {
      errs.push({ code: 'short_row', line: recordLine, row: recordRow, fields: n });
      fields = scratch.slice(0, n);
      for (let i = n; i < width; i++) fields.push('');
    } else {
      errs.push({ code: 'long_row', line: recordLine, row: recordRow, extra: scratch.slice(width, n) });
      fields = scratch.slice(0, width);
    }
    rows.push(fields);
  }

  text = '';
  errors = null;
  scratch.length = 0;
  return { columns: header ? (columns ?? []) : null, rows, errors: errs };
}

