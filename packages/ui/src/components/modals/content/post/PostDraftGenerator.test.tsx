import { Platform } from '@genfeedai/contracts';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PostDraftGenerator from '@ui/modals/content/post/PostDraftGenerator';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generateDraftText: vi.fn(),
  error: vi.fn(),
}));
vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    generateDraftText: mocks.generateDraftText,
  }),
}));
vi.mock('@genfeedai/services/core/notifications.service', () => ({
  NotificationsService: { getInstance: () => ({ error: mocks.error }) },
}));
vi.mock('@genfeedai/hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/main${path}` }),
}));
vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ brandId: 'brand-workspace' }),
}));
// The TipTap editor needs a real DOM layout; a textarea keeps these tests on
// the generator's own behaviour.
vi.mock('@ui/prompt-editor/PromptEditor', () => ({
  default: ({
    ariaLabel,
    value,
    isDisabled,
    onValueChange,
    onSubmit,
  }: {
    ariaLabel?: string;
    value?: string;
    isDisabled?: boolean;
    onValueChange?: (value: string) => void;
    onSubmit?: () => void;
  }) => (
    <textarea
      aria-label={ariaLabel}
      value={value}
      disabled={isDisabled}
      onChange={(event) => onValueChange?.(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          onSubmit?.();
        }
      }}
    />
  ),
}));
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

function generated(overrides: Record<string, unknown> = {}) {
  return {
    brandedReceipt: {
      compliance: 'unverified',
      id: 'receipt-1',
      isReplayed: false,
      revision: 4,
      state: 'needs_review',
    },
    description: 'Generated tweet',
    postId: 'post-1',
    ...overrides,
  };
}

describe('PostDraftGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generateDraftText.mockResolvedValue(generated());
  });
  it('generates editable text for X without any account or conversation', async () => {
    const onGenerate = vi.fn();
    const user = userEvent.setup();
    render(
      <PostDraftGenerator
        platform={Platform.TWITTER}
        onGenerate={onGenerate}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Generate draft' }),
    ).toBeDisabled();
    await user.type(screen.getByRole('textbox'), 'Product launch');
    await user.click(screen.getByRole('button', { name: 'Generate draft' }));
    await waitFor(() =>
      expect(onGenerate).toHaveBeenCalledWith('Generated tweet', {
        postId: 'post-1',
        receiptId: 'receipt-1',
        receiptState: 'needs_review',
      }),
    );
    expect(mocks.generateDraftText).toHaveBeenCalledWith({
      brandId: 'brand-workspace',
      format: undefined,
      platform: Platform.TWITTER,
      prompt: 'Product launch',
      requestKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
  });
  it('labels the prompt and generates from the keyboard once there is text', async () => {
    const onGenerate = vi.fn();
    const user = userEvent.setup();
    render(
      <PostDraftGenerator
        platform={Platform.TWITTER}
        onGenerate={onGenerate}
      />,
    );
    const prompt = screen.getByRole('textbox', {
      name: 'What do you want to post about?',
    });
    await user.type(prompt, '{Enter}');
    expect(mocks.generateDraftText).not.toHaveBeenCalled();
    await user.type(prompt, 'Product launch{Enter}');
    await waitFor(() => expect(onGenerate).toHaveBeenCalledTimes(1));
    expect(mocks.generateDraftText).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'Product launch' }),
    );
  });
  it('keeps the prompt and send button disabled while the host is disabled', async () => {
    render(
      <PostDraftGenerator
        platform={Platform.TWITTER}
        isDisabled
        onGenerate={vi.fn()}
      />,
    );
    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Generate draft' }),
    ).toBeDisabled();
  });
  it('links the saved draft to its receipt and says it is provisional', async () => {
    const user = userEvent.setup();
    render(
      <PostDraftGenerator platform={Platform.TWITTER} onGenerate={vi.fn()} />,
    );
    await user.type(screen.getByRole('textbox'), 'Product launch');
    await user.click(screen.getByRole('button', { name: 'Generate draft' }));
    const link = await screen.findByRole('link', { name: 'View receipt' });
    expect(link).toHaveAttribute(
      'href',
      '/acme/main/settings/agent/receipts?receiptId=receipt-1',
    );
    expect(screen.getByText(/provisional style/)).toBeInTheDocument();
  });
  it('tells the user to re-approve the brand kit when its identity cannot be read', async () => {
    mocks.generateDraftText.mockRejectedValueOnce({
      errors: [{ code: 'brand_identity_integrity_failed', status: '409' }],
    });
    const user = userEvent.setup();
    render(
      <PostDraftGenerator platform={Platform.TWITTER} onGenerate={vi.fn()} />,
    );
    await user.type(screen.getByRole('textbox'), 'Launch');
    await user.click(screen.getByRole('button', { name: 'Generate draft' }));
    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith(
        expect.stringContaining('approve it again'),
      ),
    );
  });
  it('retries a failed request with the same key and rotates it after success', async () => {
    mocks.generateDraftText.mockRejectedValueOnce(new Error('down'));
    const user = userEvent.setup();
    render(
      <PostDraftGenerator platform={Platform.TWITTER} onGenerate={vi.fn()} />,
    );
    await user.type(screen.getByRole('textbox'), 'Launch');
    const generate = screen.getByRole('button', { name: 'Generate draft' });
    await user.click(generate);
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'Generate draft' }));
    await waitFor(() =>
      expect(mocks.generateDraftText).toHaveBeenCalledTimes(2),
    );
    await screen.findByRole('link', { name: 'View receipt' });
    await user.click(screen.getByRole('button', { name: 'Generate draft' }));
    await waitFor(() =>
      expect(mocks.generateDraftText).toHaveBeenCalledTimes(3),
    );
    const keys = mocks.generateDraftText.mock.calls.map(
      (call) => call[0].requestKey,
    );
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[1]);
  });
  it('preserves the editor on a failed generation and allows retry', async () => {
    const onGenerate = vi.fn();
    mocks.generateDraftText.mockRejectedValueOnce(
      new Error('Model unavailable'),
    );
    const user = userEvent.setup();
    render(
      <PostDraftGenerator
        platform={Platform.TWITTER}
        onGenerate={onGenerate}
      />,
    );
    await user.type(screen.getByRole('textbox'), 'Launch');
    await user.click(screen.getByRole('button', { name: 'Generate draft' }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(onGenerate).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Generate draft' }),
    ).toBeEnabled();
  });
});
