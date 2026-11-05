const SINGLE_QUOTES_PATTERN = /'/g;
const BACKSLASHES_PATTERN = /\\/g;
const COLONS_PATTERN = /:/g;
const PERCENT_SIGNS_PATTERN = /%/g;

/**
 * Lossy escaping for filtergraph text: the apostrophe is replaced outright, so
 * the value can never close its quote. Callers that need the original
 * apostrophe back should use `escapeDrawtextValue` instead.
 */
export function ffmpegEscapeString(str: string): string {
  return str
    .replace(SINGLE_QUOTES_PATTERN, '’')
    .replace(BACKSLASHES_PATTERN, '\\\\');
}

/**
 * Escape a caller-supplied string for use as a quoted `drawtext` option value.
 *
 * `drawtext` values pass through the filtergraph tokenizer, which splits
 * options on `:` and treats `\` as an escape in and out of quotes. Escaping `'`
 * and `:` while leaving `\` alone is therefore not enough: `a\'` becomes `a\\'`,
 * which the tokenizer reads as one literal backslash followed by the closing
 * quote, handing the rest of the input to the option parser. `drawtext` accepts
 * `textfile=`, so that turns overlay text into arbitrary file disclosure inside
 * the rendered frame.
 *
 * Backslash is escaped first, before the characters whose escapes introduce new
 * backslashes. Pair with `expansion=none` so `%{…}` is not evaluated.
 */
export function escapeDrawtextValue(text: string): string {
  return text
    .replace(BACKSLASHES_PATTERN, '\\\\')
    .replace(SINGLE_QUOTES_PATTERN, "\\'")
    .replace(COLONS_PATTERN, '\\:')
    .replace(PERCENT_SIGNS_PATTERN, '\\%');
}
