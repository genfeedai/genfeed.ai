import * as PageModule from '@public/turbo/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import type { ResolvingMetadata } from 'next';
import { expect, it } from 'vitest';

runPageModuleTests('apps/website/app/(public)/turbo/page', PageModule);

it('keeps Turbo canonical and noindex until launch', async () => {
  const metadata = await PageModule.generateMetadata(
    {},
    Promise.resolve({ openGraph: { images: [] } }) as ResolvingMetadata,
  );
  expect(metadata.robots).toEqual({ index: false, follow: false });
  expect(metadata.alternates?.canonical).toBe('https://genfeed.ai/turbo');
  expect(metadata.title).toBe(
    'Turbo — On-brand content, drafted for you | Genfeed.ai',
  );
  expect(metadata.description).toBe(
    'Sign up, tell Genfeed about your business, and Turbo drafts on-brand posts you approve before anything goes live.',
  );
});
