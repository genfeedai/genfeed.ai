import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { expect, it } from 'vitest';
import * as PageModule from './page';

runPageModuleTests(
  'apps/website/app/(content)/articles/[slug]/page',
  PageModule,
);

it('opts into dynamic rendering for preview query support', () => {
  expect(PageModule.dynamic).toBe('force-dynamic');
});
