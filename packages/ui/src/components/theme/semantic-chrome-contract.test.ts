import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const UI_ROOT = join(process.cwd(), 'src/components');

function readComponent(relativePath: string): string {
  return readFileSync(join(UI_ROOT, relativePath), 'utf8');
}

describe('shared semantic chrome contract', () => {
  it('contains the content calendar with a semantic border', () => {
    const source = readComponent(
      'calendar/content-calendar/ContentCalendarView.tsx',
    );

    expect(source).toContain('border-border');
    expect(source).toContain("'--fc-classic-border': 'hsl(var(--border))'");
    expect(source).toContain(
      "'--fc-classic-strong-border': 'hsl(var(--border-strong))'",
    );
    expect(source).not.toContain('border-white');
    expect(source).not.toContain('rgba(255, 255, 255');
  });

  it.each([
    'analytics/trends/trending-hashtags.tsx',
    'analytics/trends/trending-sounds.tsx',
  ])('uses semantic trend-card dividers in %s', (relativePath) => {
    const source = readComponent(relativePath);

    expect(source).toContain('border-border');
    expect(source).not.toContain('border-white');
  });
});
