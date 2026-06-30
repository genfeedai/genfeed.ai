import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import Module from './content.tsx';

describe('settings-help-page.tsx', () => {
  it('exports a component', () => {
    expect(Module).toBeDefined();
  });

  it('uses the shared LinkCard instead of a local rounded link tile', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'app/(protected)/[orgSlug]/~/settings/(pages)/help/content.tsx',
      ),
      'utf8',
    );

    expect(source).toContain("from '@/components/ui/link-card'");
    expect(source).not.toContain("from '@ui/card/Card'");
    expect(source).not.toContain('<Card');
    expect(source).not.toContain('rounded-lg border border-border');
  });
});
