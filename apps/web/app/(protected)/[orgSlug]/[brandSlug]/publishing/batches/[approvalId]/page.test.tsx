// @vitest-environment jsdom

import { assertSourceHasExport } from '@shared/pages/sourceContractTestUtils';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import * as PageModule from './page';

assertSourceHasExport(
  'app/(protected)/[orgSlug]/[brandSlug]/publishing/batches/[approvalId]/page.tsx',
);

vi.mock(
  '@/features/scheduled-batches/components/ScheduledReleaseBatchPage',
  () => ({
    default: ({ approvalId }: { approvalId: string }) => (
      <div data-approval-id={approvalId} data-testid="batch-page" />
    ),
  }),
);

describe('publishing batch review page', () => {
  it('awaits the route params and opens that approval', async () => {
    render(
      await PageModule.default({
        params: Promise.resolve({ approvalId: 'apr-week' }),
      }),
    );

    expect(await screen.findByTestId('batch-page')).toHaveAttribute(
      'data-approval-id',
      'apr-week',
    );
  });

  it('keeps its metadata and propagates rejected params', async () => {
    expect(typeof PageModule.generateMetadata).toBe('function');
    const failure = new Error('params failed');

    await expect(
      PageModule.default({ params: Promise.reject(failure) }),
    ).rejects.toBe(failure);
  });
});
