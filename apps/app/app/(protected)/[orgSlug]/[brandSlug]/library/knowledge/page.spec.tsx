import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { assertSourceHasExport } from '@shared/pages/sourceContractTestUtils';
import { describe, expect, it } from 'vitest';

const PAGE_PATH =
  'app/(protected)/[orgSlug]/[brandSlug]/library/knowledge/page.tsx';

assertSourceHasExport(PAGE_PATH);

describe('LibraryKnowledgeRedirectPage', () => {
  it('sends the retired library path to brand settings knowledge', () => {
    const source = readFileSync(join(process.cwd(), PAGE_PATH), 'utf8');

    expect(source).toContain('redirect');
    expect(source).toContain('APP_ROUTES.SETTINGS.KNOWLEDGE');
    expect(APP_ROUTES.LIBRARY.KNOWLEDGE).toBe('/library/knowledge');
    expect(APP_ROUTES.SETTINGS.KNOWLEDGE).toBe('/settings/knowledge');
  });
});
