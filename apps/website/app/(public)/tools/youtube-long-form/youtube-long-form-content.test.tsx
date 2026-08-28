import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import YoutubeLongFormContent from './youtube-long-form-content';

const mocks = vi.hoisted(() => ({
  authenticatedCreate: vi.fn(),
  capture: vi.fn(),
  isSignedIn: false,
  promote: vi.fn(),
  publicCreate: vi.fn(),
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

vi.mock('@genfeedai/hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ isSignedIn: mocks.isSignedIn }),
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    create: mocks.authenticatedCreate,
    promoteSourceToLibrary: mocks.promote,
  }),
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apps: { app: 'https://app.genfeed.ai' },
  },
}));

vi.mock('@services/external/public.service', () => ({
  PublicService: {
    getInstance: () => ({
      createPublicYoutubeLongForm: mocks.publicCreate,
    }),
  },
}));

vi.mock('../../../../packages/analytics/posthog-client', () => ({
  captureWebsiteAnalyticsEvent: mocks.capture,
}));

const baseResult = {
  content: 'Long-form body',
  executionId: 'execution-1',
  id: 'execution-1',
  outputType: 'article',
  summary: 'Summary',
  title: 'Title',
  videoId: 'video-1',
  youtubeUrl: 'https://youtu.be/video-1',
} as const;

function submit(): void {
  fireEvent.change(screen.getByLabelText('YouTube URL'), {
    target: { value: baseResult.youtubeUrl },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Transform YouTube video' }),
  );
}

describe('YoutubeLongFormContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isSignedIn = false;
    mocks.publicCreate.mockResolvedValue(baseResult);
    mocks.authenticatedCreate.mockResolvedValue({
      ...baseResult,
      contentId: 'article-1',
      id: 'article-1',
      sourceArtifactId: 'artifact-1',
    });
    mocks.promote.mockResolvedValue({ ingredientId: 'ingredient-1' });
  });

  it('keeps the free preview on the public workflow entry', async () => {
    render(<YoutubeLongFormContent />);
    submit();

    expect(await screen.findByText('Long-form body')).toBeInTheDocument();
    expect(mocks.publicCreate).toHaveBeenCalledWith(
      baseResult.youtubeUrl,
      'article',
    );
    expect(mocks.authenticatedCreate).not.toHaveBeenCalled();
    expect(
      screen.getByRole('link', { name: 'Sign in to save future results' }),
    ).toHaveAttribute('href', 'https://app.genfeed.ai/login');
  });

  it('persists an authenticated output and promotes its source explicitly', async () => {
    mocks.isSignedIn = true;
    render(<YoutubeLongFormContent />);
    submit();

    const save = await screen.findByRole('button', {
      name: 'Save YouTube source to Library',
    });
    expect(mocks.authenticatedCreate).toHaveBeenCalledWith(
      baseResult.youtubeUrl,
      'article',
    );

    fireEvent.click(save);
    await waitFor(() => {
      expect(mocks.promote).toHaveBeenCalledWith('artifact-1');
    });
    expect(
      screen.getByRole('button', { name: 'Save YouTube source to Library' }),
    ).toHaveTextContent('Source saved');
  });
});
