import preview from '@mcp/ui/preview-client.tsx?mcp-preview';

const LESS_THAN_SIGNS_PATTERN = /</g;
const SCRIPT_BREAKOUT_SEQUENCES_PATTERN = /<!--|<\/script/gi;

export function cardAppScript(origins: readonly string[]): string {
  const domains = JSON.stringify(origins).replace(
    LESS_THAN_SIGNS_PATTERN,
    '\\u003c',
  );
  return `${preview.script}\nGenfeedPreview.mount(${domains});`.replace(
    SCRIPT_BREAKOUT_SEQUENCES_PATTERN,
    (token) => token.replace('<', '\\x3c'),
  );
}
