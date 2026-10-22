// @vitest-environment jsdom

import type { DetailPageProps } from '@props/pages/page.props';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import * as PageModule from './page';

runPageModuleTests('app/(protected)/studio/editor/[id]/page', PageModule);

vi.mock('next/navigation', () => ({
  useParams: () => ({ orgSlug: 'org-B', brandSlug: 'brand-B' }),
}));
vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ brandId: 'brand-B' }),
}));
vi.mock('next/dynamic', async () => {
  const { lazy } = await import('react');
  return { default: lazy };
});
vi.mock('./editor-page-content', async () => {
  const { useBrand } = await import(
    '@contexts/user/brand-context/brand-context'
  );
  const { useParams } = await import('next/navigation');
  return {
    default: ({ projectId }: { projectId: string }) => {
      const { brandId } = useBrand();
      const params = useParams();
      return (
        <div
          data-testid="detail"
          data-id={projectId}
          data-org={params.orgSlug}
          data-brand={params.brandSlug}
          data-brand-id={brandId}
        />
      );
    },
  };
});

describe('direct brand server adapter', () => {
  it.each(['project-brand-2', 'project-brand-2-literal'])(
    'awaits real params and preserves %s and brand context',
    async (id) => {
      const params =
        Promise.withResolvers<Awaited<DetailPageProps['params']>>();
      const settled = vi.fn();
      const pending = PageModule.default({ params: params.promise }).then(
        (element) => {
          settled();
          return element;
        },
      );
      await Promise.resolve();
      expect(settled).not.toHaveBeenCalled();
      params.resolve({ id });
      render(await pending);
      const detail = await screen.findByTestId('detail');
      expect(detail).toHaveAttribute('data-id', id);
      expect(detail).toHaveAttribute('data-org', 'org-B');
      expect(detail).toHaveAttribute('data-brand', 'brand-B');
      expect(detail).toHaveAttribute('data-brand-id', 'brand-B');
    },
  );

  it('preserves metadata and propagates rejected params', async () => {
    expect(typeof PageModule.generateMetadata).toBe('function');
    const failure = new Error('params failed');
    await expect(
      PageModule.default({ params: Promise.reject(failure) }),
    ).rejects.toBe(failure);
  });
});
