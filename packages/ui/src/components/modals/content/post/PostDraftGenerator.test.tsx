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
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

describe('PostDraftGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generateDraftText.mockResolvedValue({
      description: 'Generated tweet',
    });
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
      expect(onGenerate).toHaveBeenCalledWith('Generated tweet'),
    );
    expect(mocks.generateDraftText).toHaveBeenCalledWith({
      prompt: 'Product launch',
      platform: Platform.TWITTER,
      format: undefined,
    });
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
