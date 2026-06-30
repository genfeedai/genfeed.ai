import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('app/(protected)/admin/administration/warmup-accounts/page.tsx', () => {
  it('keeps the warm-up accounts route exported', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'app/(protected)/admin/administration/warmup-accounts/page.tsx',
      ),
      'utf8',
    );

    expect(source).toContain('WarmupAccountsPage');
    expect(source).toContain('createPageMetadata');
  });
});
