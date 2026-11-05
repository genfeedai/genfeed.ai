const SINGLE_QUOTES_PATTERN = /'/g;
const BACKSLASHES_PATTERN = /\\/g;

export function ffmpegEscapeString(str: string): string {
  return str
    .replace(SINGLE_QUOTES_PATTERN, '’')
    .replace(BACKSLASHES_PATTERN, '\\\\');
}
