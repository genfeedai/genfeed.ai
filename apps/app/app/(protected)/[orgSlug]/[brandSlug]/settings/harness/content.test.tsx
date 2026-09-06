import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BrandSettingsHarnessPage from './content';

const mocks = vi.hoisted(() => ({
  createForBrand: vi.fn(),
  findForBrand: vi.fn(),
  promoteWinners: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@hooks/pages/use-brand-detail/use-brand-detail', () => ({
  useBrandDetail: () => ({
    brand: { id: 'brand-1', label: 'Acme' },
    brandId: 'brand-1',
    hasBrandId: true,
    isLoading: false,
  }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    createForBrand: mocks.createForBrand,
    findForBrand: mocks.findForBrand,
    promoteWinners: mocks.promoteWinners,
    updateProfile: mocks.updateProfile,
  }),
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@ui/editors/LazyRichTextEditor', () => ({
  default: ({
    onChange,
    value,
  }: {
    onChange: (html: string) => void;
    value: string;
  }) => (
    <textarea
      data-testid="rich-text-editor"
      onChange={(event) => onChange(event.target.value)}
      value={value}
    />
  ),
}));

vi.mock('@ui/layout/container/Container', () => ({
  default: ({
    children,
    headerTabs,
    label,
    right,
  }: {
    children: ReactNode;
    headerTabs: {
      activeTab: string;
      onTabChange: (tab: string) => void;
      tabs: Array<{ id: string; label: string }>;
    };
    label: string;
    right?: ReactNode;
  }) => (
    <section>
      <h1>{label}</h1>
      <nav>
        {headerTabs.tabs.map((tab) => (
          <button
            key={tab.id}
            aria-pressed={headerTabs.activeTab === tab.id}
            onClick={() => headerTabs.onTabChange(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </nav>
      {right}
      {children}
    </section>
  ),
}));

describe('BrandSettingsHarnessPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findForBrand.mockResolvedValue([]);
  });

  it('renders the five harness tabs and defaults to Identity', async () => {
    render(<BrandSettingsHarnessPage />);

    expect(await screen.findByText('Brand harness')).toBeInTheDocument();
    for (const label of [
      'Identity',
      'Structure',
      'Delivery',
      'Thesis',
      'Examples',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Identity' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(await screen.findByLabelText('Label')).toBeInTheDocument();
  });

  it('switches tabs without losing edited draft state', async () => {
    render(<BrandSettingsHarnessPage />);

    await screen.findByLabelText('Label');
    fireEvent.change(screen.getByLabelText('Label'), {
      target: { value: 'Founder Voice' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Delivery' }));
    expect(await screen.findByLabelText('Tone')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Identity' }));
    expect(await screen.findByLabelText('Label')).toHaveValue('Founder Voice');
  });

  it('saves the draft through the harness profiles service', async () => {
    mocks.createForBrand.mockResolvedValue({
      id: 'profile-1',
      label: 'Acme Harness',
      profileType: 'harness',
      scope: 'brand',
      status: 'active',
    });

    render(<BrandSettingsHarnessPage />);

    await screen.findByLabelText('Label');
    fireEvent.click(screen.getByRole('button', { name: 'Save harness' }));

    await screen.findByRole('button', { name: 'Save harness' });
    expect(mocks.createForBrand).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: 'brand-1', scope: 'brand' }),
    );
  });
});
