import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CharactersList from './characters-list';

const mocks = vi.hoisted(() => ({
  loggerError: vi.fn(),
  refetch: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({}),
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: mocks.loggerError,
  },
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => mocks.useQuery(options),
}));

vi.mock('@genfeedai/utils/media/image-optimization.util', () => ({
  canOptimizeImageSource: () => false,
}));

describe('CharactersList shell-first loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the container chrome and refresh action while characters are loading', () => {
    mocks.useQuery.mockReturnValue({
      data: undefined,
      error: null,
      isFetching: true,
      isLoading: true,
      refetch: mocks.refetch,
    });

    render(<CharactersList />);

    expect(screen.getByRole('heading', { name: 'Characters' })).toBeVisible();
    expect(
      screen.getByText('Manage AI personas for fleet content generation'),
    ).toBeVisible();
    expect(screen.queryByText('No characters found')).not.toBeInTheDocument();
  });

  it('renders characters inside the persistent shell once loading resolves', () => {
    mocks.useQuery.mockReturnValue({
      data: [
        {
          id: 'character-1',
          label: 'Sample Character',
          reviewImagesCount: 1,
          selectedImagesCount: 2,
          slug: 'sample-character',
          trashedImagesCount: 0,
        },
      ],
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: mocks.refetch,
    });

    render(<CharactersList />);

    expect(screen.getByRole('heading', { name: 'Characters' })).toBeVisible();
    expect(screen.getByText('Sample Character')).toBeVisible();
  });

  it('shows the retry empty state inside the shell on error', () => {
    mocks.useQuery.mockReturnValue({
      data: undefined,
      error: new Error('failed'),
      isFetching: false,
      isLoading: false,
      refetch: mocks.refetch,
    });

    render(<CharactersList />);

    expect(screen.getByRole('heading', { name: 'Characters' })).toBeVisible();
    expect(screen.getByText('Failed to load characters')).toBeVisible();
  });
});
