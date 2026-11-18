import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const UI_ROOT = join(process.cwd(), 'src');

function readUiSource(relativePath: string): string {
  return readFileSync(join(UI_ROOT, relativePath), 'utf8');
}

const THEME_AWARE_CHROME = [
  'primitives/switch.tsx',
  'primitives/calendar.tsx',
  'components/quick-actions/menu/QuickActionsMenu.tsx',
] as const;

describe('shared Light/Dark semantic chrome contract', () => {
  it.each(THEME_AWARE_CHROME)('%s avoids fixed black/white chrome', (path) => {
    const source = readUiSource(path);

    expect(source).not.toMatch(
      /\b(?:bg|border|divide|ring|text)-(?:black|white)(?:\b|\/|\[)/,
    );
    expect(source).not.toContain('overlay-white');
  });

  it('pairs switch tracks and thumbs with semantic contrast tokens', () => {
    const source = readUiSource('primitives/switch.tsx');

    expect(source).toContain('bg-muted-foreground');
    expect(source).toContain('data-checked:bg-primary');
    expect(source).toContain('bg-background');
    expect(source).toContain('data-checked:bg-primary-foreground');
    expect(source).toContain('focusRingClassName');
  });

  it('uses semantic calendar interaction states', () => {
    const source = readUiSource('primitives/calendar.tsx');

    expect(source).toContain('border-border');
    expect(source).toContain('hover:bg-accent');
    expect(source).toContain('text-muted-foreground');
    expect(source).toContain('bg-primary text-primary-foreground');
    expect(source).toContain('focus-visible:ring-ring');
  });
});
