import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PublishingPostComposer from './publishing-post-composer';

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand-1',
    credentials: [],
  }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => vi.fn(),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/main${path}` }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams('platform=twitter'),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@ui/modals/content/post/PostDraftGenerator', () => ({
  default: () => <div>draft generator</div>,
}));

vi.mock('@ui/previews/TargetPreview', () => ({
  default: () => <div data-testid="composer-preview">preview</div>,
}));

describe('PublishingPostComposer', () => {
  it('renders the compose form beside a live preview', () => {
    render(<PublishingPostComposer />);

    expect(
      screen.getByRole('heading', { name: 'New post' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('composer-preview')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create post' })).toBeDisabled();
  });
});
