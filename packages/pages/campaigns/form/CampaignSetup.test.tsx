import {
  ContentCampaignItemOutcomeStatus,
  ContentCampaignStatus,
  CredentialPlatform,
} from '@genfeedai/contracts';
import CampaignGenerateDialog from '@pages/campaigns/detail/CampaignGenerateDialog';
import CampaignCreateDialog from '@pages/campaigns/form/CampaignCreateDialog';
import { Campaign } from '@services/content/campaigns.service';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

const mocks = vi.hoisted(() => ({
  generatePlan: vi.fn(),
  generate: vi.fn(),
  push: vi.fn(),
  invalidate: vi.fn(),
  accounts: vi.fn(),
}));
vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ brands: [{ id: 'brand-1', label: 'Brand' }] }),
}));
vi.mock('@hooks/navigation/use-collection-scope/use-collection-scope', () => ({
  useCollectionScope: () => ({
    brandId: 'brand-1',
    organizationId: 'org-1',
    isReady: true,
    pageScope: 'brand',
  }),
  isBrandResourceReady: () => true,
}));
vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/org/brand${path}` }),
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    generatePlan: mocks.generatePlan,
    generate: mocks.generate,
  }),
}));
vi.mock('@hooks/data/campaigns/use-campaign-accounts', () => ({
  useCampaignAccounts: () => mocks.accounts(),
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));
vi.mock('@ui/primitives/dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => (
    <div role="dialog">{children}</div>
  ),
  DialogContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: ReactNode }) => <h1>{children}</h1>,
  DialogDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
}));
vi.mock('@ui/primitives/button', () => ({
  Button: ({
    children,
    isDisabled,
    onClick,
    type,
    asChild,
  }: {
    children: ReactNode;
    isDisabled?: boolean;
    onClick?: () => void;
    type?: 'button' | 'submit';
    asChild?: boolean;
  }) =>
    asChild ? (
      children
    ) : (
      <button disabled={isDisabled} onClick={onClick} type={type ?? 'button'}>
        {children}
      </button>
    ),
}));
vi.mock('@ui/primitives/checkbox', () => ({
  Checkbox: ({
    label,
    isChecked,
    onCheckedChange,
  }: {
    label: string;
    isChecked: boolean;
    onCheckedChange: (value: boolean) => void;
  }) => (
    <label>
      <input
        type="checkbox"
        checked={isChecked}
        onChange={(e) => onCheckedChange(e.target.checked)}
      />
      {label}
    </label>
  ),
}));

const campaign = new Campaign({
  id: 'campaign-1',
  brandId: 'brand-1',
  name: 'Launch',
  status: ContentCampaignStatus.DRAFT,
});

describe('Campaign setup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generatePlan.mockResolvedValue(campaign);
    mocks.generate.mockResolvedValue({
      items: [{ status: ContentCampaignItemOutcomeStatus.SUCCEEDED }],
    });
    mocks.accounts.mockReturnValue({
      eligibleAccounts: [
        {
          id: 'account-1',
          platform: CredentialPlatform.LINKEDIN,
          externalHandle: 'our-brand',
        },
      ],
      isPending: false,
      isError: false,
    });
  });
  it('needs only a name and preserves the selected brand for AI creation', async () => {
    render(<CampaignCreateDialog onClose={vi.fn()} />);
    expect(
      screen.queryByLabelText('columns.objective'),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('setup.idea'), {
      target: { value: 'Launch' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'setup.generate' }));
    await waitFor(() =>
      expect(mocks.generatePlan).toHaveBeenCalledWith({
        brandId: 'brand-1',
        name: 'Launch',
        idempotencyKey: expect.any(String),
      }),
    );
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith(
        '/org/brand/publishing/campaigns/campaign-1',
      ),
    );
  });
  it('prefills examples without submitting an AI request', () => {
    render(<CampaignCreateDialog onClose={vi.fn()} />);
    fireEvent.click(
      screen.getByRole('button', { name: /setup.examplesList.launch.title/ }),
    );
    expect(screen.getByLabelText('setup.idea')).toHaveValue(
      'setup.examplesList.launch.idea',
    );
    expect(mocks.generatePlan).not.toHaveBeenCalled();
  });
  it('retains the idea and reuses the request key after failure', async () => {
    mocks.generatePlan.mockRejectedValueOnce(new Error('Network'));
    render(<CampaignCreateDialog onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('setup.idea'), {
      target: { value: 'Launch' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'setup.generate' }));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('setup.idea')).toHaveValue('Launch');
    fireEvent.click(screen.getByRole('button', { name: 'setup.generate' }));
    await waitFor(() => expect(mocks.generatePlan).toHaveBeenCalledTimes(2));
    expect(mocks.generatePlan.mock.calls[0]?.[0].idempotencyKey).toBe(
      mocks.generatePlan.mock.calls[1]?.[0].idempotencyKey,
    );
  });
  it('requires account selection and sends only the chosen account IDs', async () => {
    render(<CampaignGenerateDialog campaign={campaign} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'generate' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'generate' }));
    await waitFor(() =>
      expect(mocks.generate).toHaveBeenCalledWith('campaign-1', {
        credentialIds: ['account-1'],
        idempotencyKey: expect.any(String),
      }),
    );
    await screen.findByText('accounts.generated');
    expect(
      screen.getByRole('link', { name: 'accounts.review' }),
    ).toHaveAttribute(
      'href',
      '/org/brand/publishing/campaigns/campaign-1/content',
    );
  });
  it('shows connection guidance when no accounts are available', () => {
    mocks.accounts.mockReturnValue({
      eligibleAccounts: [],
      isPending: false,
      isError: false,
    });
    render(<CampaignGenerateDialog campaign={campaign} onClose={vi.fn()} />);
    expect(screen.getByText('accounts.empty')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'generate' })).toBeDisabled();
    expect(
      screen.getByRole('link', { name: 'accounts.manage' }),
    ).toHaveAttribute('href', '/org/brand/settings/integrations');
  });
  it('keeps failed generation retryable instead of displaying success', async () => {
    mocks.generate.mockResolvedValue({
      items: [{ status: ContentCampaignItemOutcomeStatus.FAILED }],
    });
    render(<CampaignGenerateDialog campaign={campaign} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'generate' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'accounts.partial',
    );
    expect(screen.queryByText('accounts.generated')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'generate' })).toBeEnabled();
  });
});
