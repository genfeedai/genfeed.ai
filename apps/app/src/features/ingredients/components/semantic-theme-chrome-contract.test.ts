import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const COMPONENTS_ROOT = import.meta.dirname;

const THEME_AWARE_CHROME = [
  'detail/shared/IngredientWorkspacePanel.tsx',
  'tabs/info/IngredientTabsInfo.tsx',
  'tabs/sharing/IngredientTabsSharing.tsx',
] as const;

describe('ingredient Light/Dark semantic chrome contract', () => {
  it.each(THEME_AWARE_CHROME)('%s avoids fixed black/white chrome', (path) => {
    const source = readFileSync(join(COMPONENTS_ROOT, path), 'utf8');

    expect(source).not.toMatch(
      /\b(?:bg|border|divide|ring|text)-(?:black|white)(?:\b|\/|\[)/,
    );
    expect(source).not.toContain('overlay-white');
  });
});
