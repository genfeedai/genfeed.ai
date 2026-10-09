// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ReactNode, StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  brand: {
    isReady: true,
    selectedBrand: { id: 'brand-1' } as { id: string } | undefined,
  },
  analyze: vi.fn(),
  createDraft: vi.fn(),
  createFromIngredient: vi.fn(),
  loggerError: vi.fn(),
  replace: vi.fn(),
  searchParamsGet: vi.fn(),
}));

vi.mock('@ui/layout/container/Container', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('../useStudioClipsPage', () => ({
  useStudioClipsPage: () => ({
    draftSaveState: 'idle',
    error: null,
    generationMode: 'avatar',
    isSubmitting: false,
    maxClips: 10,
    minViralityScore: 50,
    handleAnalyze: mocks.analyze,
    setGenerationMode: vi.fn(),
    handleStartFromYoutube: vi.fn(),
    setMaxClips: vi.fn(),
    setMinViralityScore: vi.fn(),
    setSourceFile: vi.fn(),
    setSourceKind: vi.fn(),
    setYoutubeUrl: vi.fn(),
    sourceFile: null,
    sourceKind: 'youtube',
    uploadProgress: 0,
    youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
  }),
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

vi.mock('../services/clips-api.service', () => ({
  ClipsApiService: class {
    createDraft = mocks.createDraft;
    createFromIngredient = mocks.createFromIngredient;
  },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => ({ get: mocks.searchParamsGet }),
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

const { default: NewClipProjectPage } = await import('./new-clip-project-page');

describe('NewClipProjectPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.brand = { isReady: true, selectedBrand: { id: 'brand-1' } };
    mocks.createDraft.mockResolvedValue('draft-1');
    mocks.createFromIngredient.mockResolvedValue({ projectId: 'project-2' });
    mocks.searchParamsGet.mockReturnValue(null);
  });

  it('shows source import without creating an empty draft or starting work on mount', () => {
    render(<NewClipProjectPage />);
    expect(
      screen.getByRole('heading', { name: 'Import a clip source' }),
    ).toBeVisible();
    expect(mocks.createDraft).not.toHaveBeenCalled();
    expect(mocks.analyze).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: /import & transcribe/i }),
    );
    expect(mocks.analyze).toHaveBeenCalledOnce();
    expect(mocks.createFromIngredient).not.toHaveBeenCalled();
  });

  it('does not create duplicate empty projects during StrictMode remount', () => {
    render(
      <StrictMode>
        <NewClipProjectPage />
      </StrictMode>,
    );
    expect(mocks.createDraft).not.toHaveBeenCalled();
    expect(mocks.analyze).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('waits for the brand before creating anything', async () => {
    mocks.brand = { isReady: false, selectedBrand: undefined };
    mocks.searchParamsGet.mockReturnValue('video-1');

    render(<NewClipProjectPage />);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mocks.createDraft).not.toHaveBeenCalled();
    expect(
      screen.getByRole('status', { name: 'Creating project…' }),
    ).toBeInTheDocument();
  });

  it('starts a project from a Library video and opens its analysis', async () => {
    mocks.searchParamsGet.mockImplementation((key: string) =>
      key === 'video' ? 'video-1' : null,
    );

    render(<NewClipProjectPage />);

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith(
        '/acme/brand-1/studio/clips/project-2',
      );
    });
    expect(mocks.createFromIngredient).toHaveBeenCalledWith({
      brandId: 'brand-1',
      ingredientId: 'video-1',
    });
    expect(mocks.createDraft).not.toHaveBeenCalled();
  });

  it('shows the refusal with a way back instead of redirecting', async () => {
    mocks.searchParamsGet.mockImplementation((key: string) =>
      key === 'video' ? 'video-1' : null,
    );
    mocks.createFromIngredient.mockRejectedValue(
      new Error('Clip sources must be at least 15 seconds long.'),
    );

    render(<NewClipProjectPage />);

    expect(
      await screen.findByText('Clip sources must be at least 15 seconds long.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Back to Library' }),
    ).toHaveAttribute('href', '/acme/brand-1/library/assets');
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
