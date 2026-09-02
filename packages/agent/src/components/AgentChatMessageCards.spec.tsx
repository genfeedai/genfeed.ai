import {
  ContentPreviewCard,
  OAuthConnectCard,
} from '@genfeedai/agent/components/AgentChatMessageCards';
import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { testId } from '@genfeedai/helpers/testing/test-id.helper';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Effect } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';

const IMAGE_ID = testId('image');

const action = {
  id: 'connect-twitter',
  platform: 'twitter',
  type: 'oauth_connect_card',
} as AgentUiAction;

describe('OAuthConnectCard', () => {
  it('keeps the dedicated conversation action retryable after OAuth rejects', async () => {
    const user = userEvent.setup();
    const onConnect = vi.fn().mockRejectedValue(new Error('OAuth unavailable'));
    render(<OAuthConnectCard action={action} onConnect={onConnect} />);

    const connectButton = screen.getByRole('button', {
      name: 'Connect X (Twitter)',
    });
    await user.click(connectButton);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not start the connection. Please try again.',
    );
    expect(connectButton).toBeEnabled();
  });
});

describe('ContentPreviewCard', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reconciles an accepted image asset into the persisted conversation card', async () => {
    vi.useFakeTimers();
    const getGeneratedAssetEffect = vi
      .fn()
      .mockReturnValueOnce(
        Effect.succeed({ id: 'image-queued', status: 'PROCESSING' }),
      )
      .mockReturnValue(
        Effect.succeed({
          id: 'image-queued',
          status: 'generated',
          url: 'https://cdn.test/image-queued.png',
        }),
      );

    render(
      <ContentPreviewCard
        action={{
          assetId: 'image-queued',
          assetKind: 'image',
          id: 'image-output',
          status: 'processing',
          title: 'Image generating',
          type: 'content_preview_card',
        }}
        apiService={{ getGeneratedAssetEffect } as never}
      />,
    );

    expect(screen.getByLabelText('Image generation in progress')).toBeVisible();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(
      screen.getByRole('button', {
        name: 'Open Image generating 1 preview',
      }),
    ).toBeInTheDocument();
    expect(getGeneratedAssetEffect).toHaveBeenCalledWith(
      'image-queued',
      expect.any(AbortSignal),
    );
  });

  it('bounds reconciliation polling for an asset that never becomes readable', async () => {
    vi.useFakeTimers();
    const getGeneratedAssetEffect = vi.fn(() =>
      Effect.fail(new Error('still unavailable')),
    );

    render(
      <ContentPreviewCard
        action={{
          assetId: 'image-stuck',
          assetKind: 'image',
          id: 'image-stuck-card',
          status: 'processing',
          type: 'content_preview_card',
        }}
        apiService={{ getGeneratedAssetEffect } as never}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    });
    expect(getGeneratedAssetEffect).toHaveBeenCalledTimes(150);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Unable to reconcile generated media. Please refresh and try again.',
    );
  });

  it('keeps reconciling a healthy long-running video beyond the image horizon', async () => {
    vi.useFakeTimers();
    const getGeneratedAssetEffect = vi.fn(() =>
      Effect.succeed({ id: 'video-long', status: 'PROCESSING' }),
    );

    render(
      <ContentPreviewCard
        action={{
          assetId: 'video-long',
          assetKind: 'video',
          id: 'video-long-card',
          status: 'processing',
          type: 'content_preview_card',
        }}
        apiService={{ getGeneratedAssetEffect } as never}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    });
    expect(getGeneratedAssetEffect.mock.calls.length).toBeGreaterThan(150);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('opens generated image variants from the conversation card', () => {
    render(
      <ContentPreviewCard
        action={{
          id: 'image-output',
          images: [
            'https://cdn.test/image-1.png',
            'https://cdn.test/image-2.png',
          ],
          title: 'Campaign image',
          type: 'content_preview_card',
        }}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Open Campaign image 2 preview',
      }),
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Image preview · 2 of 2')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Campaign image 2' }),
    ).toHaveAttribute('src', 'https://cdn.test/image-2.png');
  });

  it('uses a stable fallback title when generated content has no title', () => {
    render(
      <ContentPreviewCard
        action={
          {
            id: 'untitled-output',
            images: ['https://cdn.test/untitled.png'],
            type: 'content_preview_card',
          } as AgentUiAction
        }
      />,
    );

    expect(
      screen.getByRole('button', {
        name: 'Open Generated content 1 preview',
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/undefined/u)).not.toBeInTheDocument();
  });

  it('repairs retired gallery CTAs from persisted image conversations', () => {
    render(
      <ContentPreviewCard
        action={{
          ctas: [
            {
              href: `/g/image/${IMAGE_ID}`,
              label: 'View in gallery',
            },
          ],
          id: 'legacy-image-output',
          type: 'content_preview_card',
        }}
      />,
    );

    expect(
      screen.getByRole('link', { name: 'View in Library' }),
    ).toHaveAttribute('href', `/library/images?asset=${IMAGE_ID}`);
  });
});
