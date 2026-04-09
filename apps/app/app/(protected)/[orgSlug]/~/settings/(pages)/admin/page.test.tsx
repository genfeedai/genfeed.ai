import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('apps/app/app/(protected)/[orgSlug]/~/settings/(pages)/admin/page.tsx', () => {
  it('keeps an exported contract in place', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'apps/app/app/(protected)/[orgSlug]/~/settings/(pages)/admin/page.tsx',
      ),
      'utf8',
    );
    expect(source).toContain('export ');
    expect(source).toContain('Admin Settings');
    expect(source).toContain('top-level');
    expect(source).toContain('/admin');
    expect(source).not.toContain('admin-surface-ownership');
    expect(source).not.toContain('Legacy Routes');
  });
});
