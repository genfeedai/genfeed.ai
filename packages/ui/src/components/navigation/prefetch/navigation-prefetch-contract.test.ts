import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const navigationSurfaces = [
  'menus/item/MenuItem.tsx',
  'menus/shared/DrillDownGroupRow.tsx',
  'menus/shared/MenuShared.tsx',
  'menus/shared/MenuSharedConversations.tsx',
  'menus/shared/MenuSharedPrimaryAction.tsx',
  'menus/sidebar-back-row/SidebarBackRow.tsx',
  'navigation/tabs/Tabs.tsx',
] as const;

// Resolve from cwd (the package root under `cd packages/ui && vitest`) rather
// than import.meta.url — under --coverage the module URL is not a file: URL,
// so fileURLToPath() throws ERR_INVALID_URL_SCHEME. Mirrors the cwd-based
// resolution used by the apps/app protected-pages source contract.
const componentsRoot = join(process.cwd(), 'src/components');

describe('navigation prefetch wiring', () => {
  it.each(navigationSurfaces)('keeps %s wired to route prefetch', (surface) => {
    const source = readFileSync(join(componentsRoot, surface), 'utf8');

    expect(source).toContain('useNavigationPrefetch');
    expect(source).toContain('onMouseEnter');
    expect(source).toContain('onFocus');
  });
});
