import { ModalEnum } from '@genfeedai/contracts';
import type { ModalProps } from '@genfeedai/props/modals/modal.props';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ModalNewsletter from './ModalNewsletter';

const mocks = vi.hoisted(() => ({
  generateDraft: vi.fn(),
  close: vi.fn(),
  error: vi.fn(),
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({ generateDraft: mocks.generateDraft }),
}));
vi.mock('@helpers/ui/modal/modal.helper', () => ({
  closeModal: (...args: unknown[]) => mocks.close(...args),
}));
vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: { getInstance: () => ({ error: mocks.error }) },
}));
vi.mock('@ui/modals/modal/Modal', () => ({
  default: ({ children, id }: ModalProps) => (
    <div data-testid={id}>{children}</div>
  ),
}));
const messages = {
  common: {
    newsletterCreation: {
      title: 'New newsletter',
      topic: 'Topic',
      angle: 'Angle',
      instructions: 'Instructions',
      cancel: 'Cancel',
      generate: 'Generate',
      error: 'Generation failed',
    },
  },
};

function renderModal(onCreated = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ModalNewsletter onCreated={onCreated} />
    </NextIntlClientProvider>,
  );
  return onCreated;
}

describe('ModalNewsletter', () => {
  beforeEach(() => vi.clearAllMocks());
  it('requires a topic and sends topic, angle and instructions before reporting the id', async () => {
    mocks.generateDraft.mockResolvedValue({ id: 'newsletter-1' });
    const onCreated = renderModal();
    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Topic' }), {
      target: { value: ' AI tools ' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Angle' }), {
      target: { value: 'For founders' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Instructions' }), {
      target: { value: 'Keep it practical' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('newsletter-1'));
    expect(mocks.generateDraft).toHaveBeenCalledWith({
      topic: 'AI tools',
      angle: 'For founders',
      instructions: 'Keep it practical',
    });
    expect(mocks.close).toHaveBeenCalledWith(ModalEnum.NEWSLETTER);
  });
  it('retains input and stays open on a generation error', async () => {
    mocks.generateDraft.mockRejectedValue(new Error('offline'));
    const onCreated = renderModal();
    fireEvent.change(screen.getByRole('textbox', { name: 'Topic' }), {
      target: { value: 'AI tools' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(screen.getByRole('textbox', { name: 'Topic' })).toHaveValue(
      'AI tools',
    );
    expect(onCreated).not.toHaveBeenCalled();
    expect(mocks.close).not.toHaveBeenCalled();
  });
});
