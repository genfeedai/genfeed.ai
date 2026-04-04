import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('apps/web/app/app/(protected)/[orgSlug]/[brandSlug]/orchestration/skills/page.tsx', () => {
  it('keeps an exported contract in place', () => {
    const pagePath = process.cwd().endsWith('/apps/web/app')
      ? 'app/(protected)/orchestration/skills/page.tsx'
      : 'apps/web/app/app/(protected)/[orgSlug]/[brandSlug]/orchestration/skills/page.tsx';
    const source = readFileSync(join(process.cwd(), pagePath), 'utf8');
    expect(source).toContain('export ');
  });
});
