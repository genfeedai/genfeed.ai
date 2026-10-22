// @vitest-environment jsdom

import { PageScope } from '@genfeedai/contracts';
import type { CampaignDetailShell } from '@pages/campaigns';
import { assertSourceHasExport } from '@shared/pages/sourceContractTestUtils';
import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import Page from './page';

assertSourceHasExport(
  'app/(protected)/[orgSlug]/[brandSlug]/publishing/campaigns/[id]/content/page.tsx',
);

const { renderPostsListPageMock } = vi.hoisted(() => ({
  renderPostsListPageMock: vi.fn(),
}));
vi.mock('../../../publishing-list-page', () => ({
  renderPostsListPage: (args: unknown) => {
    renderPostsListPageMock(args);
    return <div data-testid="posts-list" />;
  },
}));
vi.mock('@pages/campaigns', () => ({
  CampaignDetailShell: ({
    campaignId,
    section,
    children,
  }: ComponentProps<typeof CampaignDetailShell>) => (
    <section
      data-testid="campaign-shell"
      data-id={campaignId}
      data-section={section}
    >
      {children}
    </section>
  ),
}));

describe('brand campaign content adapter', () => {
  it.each(['cmp-brand-2', 'cmp-brand-literal'])(
    'awaits %s and forwards the exact search promise and publishing scope',
    async (id) => {
      const params =
        Promise.withResolvers<Awaited<Parameters<typeof Page>[0]['params']>>();
      const searchParams = Promise.resolve({ page: '2', search: 'literal' });
      const pending = Page({ params: params.promise, searchParams });
      await Promise.resolve();
      expect(renderPostsListPageMock).not.toHaveBeenCalled();
      params.resolve({ id });
      render(await pending);
      expect(renderPostsListPageMock).toHaveBeenCalledWith({
        campaignId: id,
        searchParams,
        scope: PageScope.PUBLISHING,
      });
      expect(renderPostsListPageMock.mock.calls[0][0].searchParams).toBe(
        searchParams,
      );
      expect(screen.getByTestId('campaign-shell')).toHaveAttribute(
        'data-id',
        id,
      );
      expect(screen.getByTestId('campaign-shell')).toHaveAttribute(
        'data-section',
        'content',
      );
      expect(screen.getByTestId('posts-list')).toBeInTheDocument();
    },
  );
});
