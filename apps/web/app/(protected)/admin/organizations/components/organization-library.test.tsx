import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OrganizationLibrary from './organization-library';

const libraryState = vi.hoisted(() => ({
  value: {
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isError: false,
    isFetchingNextPage: false,
    isLoading: false,
    items: [] as unknown[],
    refetch: vi.fn(),
  },
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('../hooks/use-organization-library', () => ({
  useOrganizationLibrary: () => libraryState.value,
}));

describe('OrganizationLibrary', () => {
  beforeEach(() => {
    libraryState.value = {
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isError: false,
      isFetchingNextPage: false,
      isLoading: false,
      items: [],
      refetch: vi.fn(),
    };
  });

  it('says the organization has not generated anything yet when its library is empty', () => {
    render(<OrganizationLibrary organizationId="org-1" />);

    expect(screen.getByText('libraryEmpty')).toBeInTheDocument();
  });

  it('shows a load error instead of an empty library when the list fails', () => {
    libraryState.value = { ...libraryState.value, isError: true };

    render(<OrganizationLibrary organizationId="org-1" />);

    expect(screen.getByText('libraryLoadError')).toBeInTheDocument();
    expect(screen.queryByText('libraryEmpty')).not.toBeInTheDocument();
  });

  it('does not claim the library is empty while it is still loading', () => {
    libraryState.value = { ...libraryState.value, isLoading: true };

    render(<OrganizationLibrary organizationId="org-1" />);

    expect(screen.queryByText('libraryEmpty')).not.toBeInTheDocument();
  });

  it('keeps what already loaded and offers a retry when a later page fails', () => {
    libraryState.value = {
      ...libraryState.value,
      isError: true,
      items: [{ category: 'image', id: 'asset-1' }],
    };

    render(<OrganizationLibrary organizationId="org-1" />);

    expect(screen.getByText('libraryLoadMoreError')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'libraryRetry' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('libraryLoadError')).not.toBeInTheDocument();
  });
});
