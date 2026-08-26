import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import YoutubeClipsContent from './youtube-clips-content';

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  create: vi.fn(),
  preview: vi.fn(),
  read: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@web-components/PageLayout', () => ({
  default: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: { apps: { app: 'https://app.genfeed.ai' } },
}));

vi.mock('@services/external/public.service', () => ({
  PublicService: {
    getInstance: () => ({
      createPublicYoutubeClip: mocks.create,
      getPublicYoutubeClip: mocks.read,
      requestPublicYoutubeClipPreview: mocks.preview,
    }),
  },
}));

vi.mock('../../../../packages/analytics/posthog-client', () => ({
  captureWebsiteAnalyticsEvent: mocks.capture,
}));

const readySession = {
  expiresAt: '2026-08-26T12:00:00.000Z',
  id: 'session-1',
  preview: { status: 'available' },
  previewToken: 'a'.repeat(43),
  progress: 100,
  recommendations: [
    {
      clipType: 'educational',
      endTime: 42,
      id: 'moment-1',
      score: 82,
      startTime: 12,
      summary: 'A useful, self-contained moment.',
      tags: ['creator'],
      title: 'The strongest moment',
    },
  ],
  status: 'ready',
  transcript: [{ end: 5, start: 0, text: 'Transcript content' }],
} as const;

describe('YoutubeClipsContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('crypto', { randomUUID: () => 'request-key-1' });
    mocks.create.mockResolvedValue(readySession);
    mocks.preview.mockResolvedValue({
      ...readySession,
      preview: {
        recommendationId: 'moment-1',
        status: 'ready',
        url: 'https://cdn.example/preview.mp4',
      },
    });
  });

  it('delivers a useful result before signup and hands off only the token', async () => {
    render(<YoutubeClipsContent />);
    fireEvent.change(screen.getByLabelText('YouTube URL'), {
      target: { value: 'https://www.youtube.com/watch?v=abc12345' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Analyze YouTube video' }),
    );

    expect(await screen.findByText('The strongest moment')).toBeInTheDocument();
    expect(screen.getByText('Transcript content')).toBeInTheDocument();
    expect(mocks.create).toHaveBeenCalledWith(
      'https://www.youtube.com/watch?v=abc12345',
      'request-key-1',
    );

    const signup = screen.getByRole('link', {
      name: 'Create workspace and continue',
    });
    expect(signup.getAttribute('href')).toContain(
      `clipToolToken=${readySession.previewToken}`,
    );
    expect(signup.getAttribute('href')).not.toContain('youtube.com');
    expect(signup).toHaveAttribute('data-ph-no-capture');
    expect(mocks.capture).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ youtubeUrl: expect.anything() }),
    );
  });

  it('enforces one preview choice in the client after the server reserves it', async () => {
    render(<YoutubeClipsContent />);
    fireEvent.change(screen.getByLabelText('YouTube URL'), {
      target: { value: 'https://youtu.be/abc12345' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Analyze YouTube video' }),
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Generate free preview for The strongest moment',
      }),
    );

    await waitFor(() => {
      expect(mocks.preview).toHaveBeenCalledWith(
        readySession.previewToken,
        'moment-1',
      );
    });
    expect(screen.getByText('Your free preview')).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Generate free preview for The strongest moment',
      }),
    ).toBeDisabled();
  });
});
