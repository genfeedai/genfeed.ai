import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BrandAgentSettingsPage from './content';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  search: '',
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/acme/acme/settings/agent',
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}));
vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/acme${path}` }),
}));
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});
vi.mock('@hooks/pages/use-brand-detail/use-brand-detail', () => ({
  useBrandDetail: () => ({
    brand: { id: 'brand-1', label: 'Acme', slug: 'acme' },
    brandId: 'brand-1',
    handleCopy: vi.fn(),
    handleRefreshBrand: vi.fn(),
    hasBrandId: true,
    isLoading: false,
  }),
}));
vi.mock('@pages/brands/components/sidebar/BrandDetailIdentityCard', () => ({
  default: () => <p>Identity card</p>,
}));
vi.mock(
  '@pages/brands/components/sidebar/BrandDetailDefaultModelsCard',
  () => ({
    default: () => <p>Models card</p>,
  }),
);
vi.mock(
  '@pages/brands/components/brand-kit/writing-voice/BrandWritingVoiceEditor',
  () => ({ default: () => <p>Agent profile</p> }),
);
vi.mock(
  '@pages/brands/components/system-prompt/BrandDetailSystemPrompt',
  () => ({
    default: () => <p>System prompt</p>,
  }),
);
vi.mock('./agent-learning-tab', () => ({
  default: () => <p>Learning tab</p>,
}));
vi.mock('./context/content', () => ({
  default: () => <p>Context tab</p>,
}));
vi.mock('./receipts/content', () => ({
  default: () => <p>Receipts tab</p>,
}));

describe('brand-settings-agent-page', () => {
  beforeEach(() => {
    mocks.search = '';
  });

  it('exports a component', () => {
    expect(BrandAgentSettingsPage).toBeDefined();
  });

  it('shows the agent defaults heading beside identity on the defaults tab', () => {
    render(<BrandAgentSettingsPage />);

    expect(
      screen.getByRole('heading', { exact: true, name: 'Agent defaults' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Identity card')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Writing voice' })).toHaveAttribute(
      'href',
      '/acme/acme/settings/brand-kit?tab=voice',
    );
  });

  it('keeps the agent defaults heading off the other sections', () => {
    mocks.search = 'tab=context';
    render(<BrandAgentSettingsPage />);

    expect(
      screen.queryByRole('heading', { exact: true, name: 'Agent defaults' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Context tab')).toBeInTheDocument();
  });
});
