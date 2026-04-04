export function ffmpegEscapeString(str: string): string {
  return str.replace(/'/g, '’').replace(/\\/g, '\\\\');
}
