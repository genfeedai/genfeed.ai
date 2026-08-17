import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('app/(protected)/admin/layout.tsx', () => {
  it('guards the entire admin subtree behind platform superadmin access', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/(protected)/admin/layout.tsx'),
      'utf8',
    );

    expect(source).toContain('loadProtectedBootstrap');
    expect(source).toContain('isProtectedBootstrapBypassed');
    expect(source).toContain('bootstrap?.accessState?.isSuperAdmin');
    expect(source).toContain('notFound()');

    // Self-host / local Portless superadmins must reach admin too. The guard's
    // doc comment names `isSaaS` deliberately, so assert against code only.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(code).not.toContain('isSaaS');
  });
});
