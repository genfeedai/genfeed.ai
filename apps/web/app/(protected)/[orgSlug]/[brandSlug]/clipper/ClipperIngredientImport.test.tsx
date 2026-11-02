// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { type ReactNode, StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  brand: {
    isReady: true,
    selectedBrand: { id: 'brand-1' } as { id: string } | undefined,
  },
  createFromIngredient: vi.fn(),
  loggerError: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => mocks.brand,
}));

vi.mock('@genfeedai/hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ getToken: vi.fn() }),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (path: string) => `/acme/brand-1${path}`,
  }),
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: mocks.loggerError },
}));

vi.mock('./services/clipper-api.service', () => ({
  ClipperApiService: class {
    createFromIngredient = mocks.createFromIngredient;
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children?: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@/../tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const { default: ClipperIngredientImport } = await import(
  './ClipperIngredientImport'
);

describe('ClipperIngredientImport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, '', '/acme/brand-1/clipper');
    mocks.replace.mockImplementation((url: string) =>
      window.history.replaceState(null, '', url),
    );
    mocks.brand = { isReady: true, selectedBrand: { id: 'brand-1' } };
    mocks.createFromIngredient.mockResolvedValue({ projectId: 'project-2' });
  });

  it('waits for the brand before creating anything', async () => {
    mocks.brand = { isReady: false, selectedBrand: undefined };

    render(<ClipperIngredientImport videoId="video-1" />);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mocks.createFromIngredient).not.toHaveBeenCalled();
    expect(
      screen.getByRole('status', { name: 'Creating project…' }),
    ).toBeInTheDocument();
  });

  it('starts a project from a Library video and opens its analysis', async () => {
    render(<ClipperIngredientImport videoId="video-1" />);

    await waitFor(() => {
      expect(window.location.pathname).toBe('/acme/brand-1/clipper/project-2');
    });
    expect(mocks.createFromIngredient).toHaveBeenCalledWith({
      brandId: 'brand-1',
      ingredientId: 'video-1',
    });
  });

  it('creates one project when React remounts during the request', async () => {
    render(
      <StrictMode>
        <ClipperIngredientImport videoId="video-1" />
      </StrictMode>,
    );

    await waitFor(() =>
      expect(window.location.pathname).toBe('/acme/brand-1/clipper/project-2'),
    );
    expect(mocks.createFromIngredient).toHaveBeenCalledTimes(1);
  });

  it('shows the refusal with a way back instead of redirecting', async () => {
    mocks.createFromIngredient.mockRejectedValue(
      new Error('Clip sources must be at least 15 seconds long.'),
    );

    render(<ClipperIngredientImport videoId="video-1" />);

    expect(
      await screen.findByText('Clip sources must be at least 15 seconds long.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Back to Library' }),
    ).toHaveAttribute('href', '/acme/brand-1/library/assets');
    expect(window.location.pathname).toBe('/acme/brand-1/clipper');
  });
});
