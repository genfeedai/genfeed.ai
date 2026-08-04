import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('app/(protected)/admin/page.tsx', () => {
  it('permanently redirects bare /admin to the overview dashboard', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/(protected)/admin/page.tsx'),
      'utf8',
    );

    expect(source).toContain('permanentRedirect');
    expect(source).toContain('ADMIN.OVERVIEW.DASHBOARD');
    expect(source).not.toContain('@admin/');
  });
});
