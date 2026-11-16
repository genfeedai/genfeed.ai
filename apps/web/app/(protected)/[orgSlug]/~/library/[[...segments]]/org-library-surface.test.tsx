// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import {
  type LibraryPlace,
  LibraryShelf,
  PageScope,
} from '@genfeedai/contracts';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { notFoundMock, redirectMock } = vi.hoisted(() => ({
  notFoundMock: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  redirectMock: vi.fn((destination: string) => {
    throw new Error(`NEXT_REDIRECT:${destination}`);
  }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  notFound: notFoundMock,
  redirect: redirectMock,
}));

vi.mock('next/dynamic', async () => {
  const { lazy } = await import('react');
  return { default: lazy };
});

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');

  return { useTranslations: translateFromCatalog };
});

vi.mock('@/features/ingredients/list/ingredients-list', () => ({
  default: ({
    folderNavigation,
    scope,
    type,
  }: {
    folderNavigation?: string;
    scope: PageScope;
    type: string;
  }) => (
    <div
      data-folder-navigation={folderNavigation}
      data-scope={scope}
      data-testid="ingredients-list"
      data-type={type}
    />
  ),
}));

vi.mock('@/features/library/overview/library-overview', () => ({
  default: ({ scope }: { scope?: string }) => (
    <div data-scope={scope} data-testid="library-overview" />
  ),
}));

vi.mock('@/features/library/browser/library-browser', () => ({
  default: ({
    children,
    place,
    preset,
    scope,
    shelf,
  }: {
    children: ReactNode;
    place?: LibraryPlace;
    preset?: { label: string };
    scope: PageScope;
    shelf?: LibraryShelf;
  }) => (
    <section
      data-place={place}
      data-preset={preset?.label}
      data-scope={scope}
      data-shelf={shelf}
      data-testid="library-browser"
    >
      {children}
    </section>
  ),
}));

vi.mock('../../../[brandSlug]/library/assets/asset-deep-link', () => ({
  default: () => null,
}));

vi.mock('../../../[brandSlug]/library/captions/page', () => ({
  default: () => <div data-testid="library-captions-page" />,
}));

vi.mock('../../../[brandSlug]/library/voices/library-voices-page', () => ({
  default: ({ scope }: { scope: PageScope }) => (
    <div data-scope={scope} data-testid="library-voices-page" />
  ),
}));

const { default: OrgLibrarySurface } = await import('./org-library-surface');

describe('OrgLibrarySurface', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders org shelves through the same Library browser as brand shelves', async () => {
    const element = await OrgLibrarySurface({
      params: Promise.resolve({
        orgSlug: 'acme',
        segments: ['shelf', 'unsorted'],
      }),
    });

    render(element);

    expect(screen.getByTestId('library-browser')).toHaveAttribute(
      'data-scope',
      PageScope.ORGANIZATION,
    );
    expect(screen.getByTestId('library-browser')).toHaveAttribute(
      'data-shelf',
      LibraryShelf.UNSORTED,
    );
    expect(screen.getByTestId('ingredients-list')).toHaveAttribute(
      'data-type',
      'ingredients',
    );
    expect(screen.getByTestId('ingredients-list')).toHaveAttribute(
      'data-folder-navigation',
      'shell',
    );
  });

  it.each([
    { place: 'trash' },
    { folder: 'f1', shelf: 'approved' },
    { categories: ['IMAGE', 'IMAGE_EDIT'], search: 'hero' },
  ])(
    'renders All assets and ignores the old library query %j',
    async (search) => {
      const element = await OrgLibrarySurface({
        params: Promise.resolve({
          orgSlug: 'acme',
          segments: ['assets'],
        }),
        searchParams: Promise.resolve(search),
      });

      render(element);

      expect(screen.getByTestId('library-browser')).toBeInTheDocument();
    },
  );

  it('keeps All assets for filters that have no route of their own', async () => {
    const element = await OrgLibrarySurface({
      params: Promise.resolve({
        orgSlug: 'acme',
        segments: ['assets'],
      }),
      searchParams: Promise.resolve({ categories: ['IMAGE'], folder: 'f1' }),
    });

    render(element);

    expect(screen.getByTestId('library-browser')).toBeInTheDocument();
  });

  it('renders org type routes as presets over the unified browser', async () => {
    const element = await OrgLibrarySurface({
      params: Promise.resolve({
        orgSlug: 'acme',
        segments: ['images'],
      }),
    });

    render(element);

    expect(screen.getByTestId('library-browser')).toHaveAttribute(
      'data-preset',
      'Images',
    );
    expect(screen.getByTestId('ingredients-list')).toHaveAttribute(
      'data-type',
      'ingredients',
    );
  });

  it('reuses the brand voice library component with organization scope', async () => {
    const element = await OrgLibrarySurface({
      params: Promise.resolve({
        orgSlug: 'acme',
        segments: ['voices'],
      }),
    });

    render(element);

    expect(screen.getByTestId('library-voices-page')).toHaveAttribute(
      'data-scope',
      PageScope.ORGANIZATION,
    );
  });

  it('reuses the same captions library component in organization scope', async () => {
    const element = await OrgLibrarySurface({
      params: Promise.resolve({
        orgSlug: 'acme',
        segments: ['captions'],
      }),
    });

    render(element);

    expect(screen.getByTestId('library-captions-page')).toBeInTheDocument();
  });

  it('redirects the org Library root to the Library Overview (#5502)', async () => {
    await expect(
      OrgLibrarySurface({
        params: Promise.resolve({
          orgSlug: 'acme',
        }),
      }),
    ).rejects.toThrow('NEXT_REDIRECT:/acme/~/library/overview');

    expect(redirectMock).toHaveBeenCalledWith('/acme/~/library/overview');
  });

  it('renders the organization Library Overview without brand-only References', async () => {
    const element = await OrgLibrarySurface({
      params: Promise.resolve({
        orgSlug: 'acme',
        segments: ['overview'],
      }),
    });

    render(element);

    expect(screen.getByTestId('library-overview')).toHaveAttribute(
      'data-scope',
      PageScope.ORGANIZATION,
    );
  });
});
