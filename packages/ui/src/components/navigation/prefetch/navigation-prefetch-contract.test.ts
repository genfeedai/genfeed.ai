import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
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

const componentsRoot = fileURLToPath(new URL('../../', import.meta.url));

describe('navigation prefetch wiring', () => {
  it.each(navigationSurfaces)('keeps %s wired to route prefetch', (surface) => {
    const source = readFileSync(join(componentsRoot, surface), 'utf8');

    expect(source).toContain('useNavigationPrefetch');
    expect(source).toContain('onMouseEnter');
    expect(source).toContain('onFocus');
  });
});
