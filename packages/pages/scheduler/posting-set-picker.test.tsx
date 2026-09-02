import { TargetValidationState } from '@genfeedai/contracts';
import type { IPostingSet } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PostingSetPicker from './posting-set-picker';

const mocks = vi.hoisted(() => ({
  error: vi.fn(),
  expand: vi.fn(),
  findAllSets: vi.fn(),
  findAllSignatures: vi.fn(),
  getPostingSetsService: vi.fn(),
  getPostingSignaturesService: vi.fn(),
  post: vi.fn(),
  success: vi.fn(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => {
    const service = factory('test-token');
    return 'expand' in (service as object)
      ? mocks.getPostingSetsService
      : mocks.getPostingSignaturesService;
  },
}));

vi.mock('@services/content/posting-sets.service', () => ({
  PostingSetsService: {
    getInstance: () => ({
      expand: mocks.expand,
      findAll: mocks.findAllSets,
      post: mocks.post,
    }),
  },
}));

vi.mock('@services/content/posting-signatures.service', () => ({
  PostingSignaturesService: {
    getInstance: () => ({
      findAll: mocks.findAllSignatures,
    }),
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: mocks.error,
      success: mocks.success,
    }),
  },
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    children,
    isDisabled,
    label,
    onClick,
  }: {
    children?: ReactNode;
    isDisabled?: boolean;
    label?: string;
    onClick?: () => void;
  }) => (
    <button disabled={isDisabled} type="button" onClick={onClick}>
      {label ?? children}
    </button>
  ),
}));

vi.mock('@ui/primitives/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
}));

vi.mock('@ui/primitives/select', () => ({
  Select: ({
    children,
    onValueChange,
    value,
  }: {
    children?: ReactNode;
    onValueChange?: (value: string) => void;
    value?: string;
  }) => (
    <div data-testid="signature-select" data-value={value}>
      <button type="button" onClick={() => onValueChange?.('sig-1')}>
        choose-signature
      </button>
      {children}
    </div>
  ),
  SelectContent: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({
    children,
    value,
  }: {
    children?: ReactNode;
    value: string;
  }) => <div data-value={value}>{children}</div>,
  SelectTrigger: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <span>{placeholder}</span>
  ),
}));

vi.mock('@ui/primitives/badge', () => ({
  Badge: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));

function makeSet(overrides: Partial<IPostingSet> = {}): IPostingSet {
  return {
    id: 'set-1',
    isEnabled: true,
    label: 'Short-form trio',
    organizationId: 'org-1',
    targets: [
      {
        credentialId: 'cred-ig',
        platform: 'instagram',
        signatureIds: ['sig-existing'],
        targetKey: 'instagram:cred-ig',
      },
      {
        credentialId: 'cred-yt',
        platform: 'youtube',
        targetKey: 'youtube:cred-yt',
      },
    ],
    userId: 'user-1',
    validation: {
      signatures: [],
      state: TargetValidationState.WARNING,
      targets: [
        {
          credentialId: 'cred-ig',
          issues: ['Referenced credential is disconnected.'],
          state: 'disconnected',
          targetKey: 'instagram:cred-ig',
        },
        {
          credentialId: 'cred-yt',
          issues: [],
          state: 'valid',
          targetKey: 'youtube:cred-yt',
        },
      ],
    },
    ...overrides,
  } as IPostingSet;
}

describe('PostingSetPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findAllSets.mockResolvedValue([makeSet()]);
    mocks.findAllSignatures.mockResolvedValue([
      { id: 'sig-1', label: 'Brand sign-off' },
    ]);
    mocks.expand.mockResolvedValue({
      targets: [
        { credentialId: 'cred-ig', platform: 'instagram' },
        { credentialId: 'cred-yt', platform: 'youtube' },
      ],
    });
    mocks.post.mockResolvedValue(makeSet({ id: 'set-2', label: 'Saved set' }));
    mocks.getPostingSetsService.mockResolvedValue({
      expand: mocks.expand,
      findAll: mocks.findAllSets,
      post: mocks.post,
    });
    mocks.getPostingSignaturesService.mockResolvedValue({
      findAll: mocks.findAllSignatures,
    });
  });

  it('expands a selected set and applies targets without failing on unhealthy channels', async () => {
    const onApply = vi.fn();
    render(
      <PostingSetPicker
        brandId="brand-1"
        currentTargets={[]}
        timezone="UTC"
        onApply={onApply}
      />,
    );

    expect(await screen.findByText('Short-form trio')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Use set' }));

    await waitFor(() => {
      expect(mocks.expand).toHaveBeenCalledWith('set-1', { timezone: 'UTC' });
    });
    expect(onApply).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          credentialId: 'cred-ig',
          platform: 'instagram',
          validationState: 'disconnected',
        }),
        expect.objectContaining({
          credentialId: 'cred-yt',
          platform: 'youtube',
        }),
      ]),
      'set-1',
    );
    expect(screen.getByText('disconnected')).toBeVisible();
    expect(
      screen.getByText('Referenced credential is disconnected.'),
    ).toBeVisible();
  });

  it('saves the current selection as a posting set', async () => {
    render(
      <PostingSetPicker
        brandId="brand-1"
        currentTargets={[
          {
            credentialId: 'cred-ig',
            platform: 'instagram',
            signatureIds: ['sig-existing'],
          },
        ]}
        timezone="UTC"
        onApply={vi.fn()}
      />,
    );

    await screen.findByText('Short-form trio');
    fireEvent.change(screen.getByLabelText('Posting set label'), {
      target: { value: 'Evening accounts' },
    });
    fireEvent.click(screen.getByText('choose-signature'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Save current selection as set' }),
    );

    await waitFor(() => {
      expect(mocks.post).toHaveBeenCalledWith({
        brandId: 'brand-1',
        label: 'Evening accounts',
        targets: [
          {
            credentialId: 'cred-ig',
            order: 0,
            platform: 'instagram',
            signatureIds: ['sig-existing', 'sig-1'],
            targetKey: 'instagram:cred-ig',
          },
        ],
      });
    });
  });
});
