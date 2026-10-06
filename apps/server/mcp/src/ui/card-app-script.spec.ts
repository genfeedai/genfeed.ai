import { cardAppScript } from '@mcp/ui/card-app-script';

vi.mock('@mcp/ui/preview-client.tsx?mcp-preview', () => ({
  default: { script: 'globalThis.fixture = "<!-- <script></script>";' },
}));

it('preserves dependency strings without entering HTML script escape states', () => {
  const mount = vi.fn();
  vi.stubGlobal('GenfeedPreview', { mount });
  const script = cardAppScript(['https://cdn.genfeed.ai']);
  expect(script).not.toMatch(/<!--|<\/script/i);
  new Function(script)();
  expect(Reflect.get(globalThis, 'fixture')).toBe('<!-- <script></script>');
  expect(mount).toHaveBeenCalledWith(['https://cdn.genfeed.ai']);
  Reflect.deleteProperty(globalThis, 'fixture');
  vi.unstubAllGlobals();
});
