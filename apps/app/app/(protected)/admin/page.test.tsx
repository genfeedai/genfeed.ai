import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('app/(protected)/admin/page.tsx', () => {
  it('mounts the real in-app admin dashboard under the guarded admin layout', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/(protected)/admin/page.tsx'),
      'utf8',
    );

    expect(source).toContain('AdminDashboardPage');
    expect(source).toContain('@protected/overview/dashboard/page');
    expect(source).not.toContain('@admin/');
  });
});
