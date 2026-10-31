import { assertSourceHasExport } from '@shared/pages/sourceContractTestUtils';

for (const routePath of [
  'layout.tsx',
  'page.tsx',
  'new/page.tsx',
  '[id]/page.tsx',
  'journey/page.tsx',
]) {
  assertSourceHasExport(
    `app/(protected)/[orgSlug]/[brandSlug]/agent/${routePath}`,
  );
}
