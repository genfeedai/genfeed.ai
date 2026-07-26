import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('ProtectedRootPage', () => {
  it('renders the protected root resolver entrypoint', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/(protected)/page.tsx'),
      'utf8',
    );

    expect(source).not.toContain("from 'next/navigation'");
    expect(source).toContain(
      "import OperationalHomeContent from '@app/(protected)/home/content'",
    );
    expect(source).toContain(
      "import ProtectedRootResolver from '@app/(protected)/root-resolver-client'",
    );
    expect(source).toContain(
      "import { isBetterAuthEnabled } from '@genfeedai/auth-client/server'",
    );
    expect(source).toContain('if (!isBetterAuthEnabled())');
    expect(source).toContain('return <OperationalHomeContent />');
    expect(source).toContain('return <ProtectedRootResolver />');
  });
});
