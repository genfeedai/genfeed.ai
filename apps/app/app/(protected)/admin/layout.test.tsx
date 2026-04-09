import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('apps/app/app/(protected)/admin/layout.tsx', () => {
  it('guards the entire admin subtree behind cloud superadmin access', () => {
    const source = readFileSync(
      join(process.cwd(), 'apps/app/app/(protected)/admin/layout.tsx'),
      'utf8',
    );

    expect(source).toContain('loadProtectedBootstrap');
    expect(source).toContain('isCloudConnected');
    expect(source).toContain('bootstrap?.accessState?.isSuperAdmin');
    expect(source).toContain('notFound()');
  });
});
