import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BatchNewProjectPage from './BatchNewProjectPage';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@/../tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ brandId: 'brand-1' }),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/moonrise${path}` }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    list: vi.fn().mockResolvedValue([]),
  }),
}));

const mocks = vi.hoisted(() => ({ isIdeasEnabled: true }));
vi.mock('@hooks/feature-flags/use-feature-flag', () => ({
  useFeatureFlag: () => mocks.isIdeasEnabled,
}));

describe('BatchNewProjectPage', () => {
  it('disables the ideas option when the batch_ideas flag is off', async () => {
    mocks.isIdeasEnabled = false;
    render(<BatchNewProjectPage />);

    const fromIdeasButton = await screen.findByRole('button', {
      name: 'From ideas',
    });
    expect(fromIdeasButton).toBeDisabled();
    expect(
      screen.getByText('Idea batches are not available right now.'),
    ).toBeInTheDocument();
  });

  it('enables the ideas option when the batch_ideas flag is on', async () => {
    mocks.isIdeasEnabled = true;
    render(<BatchNewProjectPage />);

    const fromIdeasButton = await screen.findByRole('button', {
      name: 'From ideas',
    });
    expect(fromIdeasButton).not.toBeDisabled();
    expect(
      screen.queryByText('Idea batches are not available right now.'),
    ).not.toBeInTheDocument();
  });
});
