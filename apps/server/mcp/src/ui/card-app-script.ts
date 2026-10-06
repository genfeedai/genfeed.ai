import preview from '@mcp/ui/preview-client.tsx?mcp-preview';

export function cardAppScript(origins: readonly string[]): string {
  const domains = JSON.stringify(origins).replace(/</g, '\\u003c');
  return `${preview.script}\nGenfeedPreview.mount(${domains});`.replace(
    /<!--|<\/script/gi,
    (token) => token.replace('<', '\\x3c'),
  );
}
