import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import YoutubeLongFormContent from './youtube-long-form-content';

type TransformRequest = {
  channel: 'authenticated' | 'public';
  outputType: string;
  youtubeUrl: string;
};

// Fake backends: which entry each transform request reached, and which
// source artifacts were promoted to the Library.
const backend = vi.hoisted(() => ({
  isSignedIn: false,
  promoted: [] as string[],
  requests: [] as TransformRequest[],
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

// The session is read on submit; a token means a signed-in visitor.
vi.mock('@genfeedai/auth-client', () => ({
  getSignedInBetterAuthToken: async () => (backend.isSignedIn ? 'jwt' : null),
}));

vi.mock('@services/content/youtube-long-form.service', () => ({
  YoutubeLongFormService: {
    getInstance: () => ({
      create: async (youtubeUrl: string, outputType: string) => {
        backend.requests.push({
          channel: 'authenticated',
          outputType,
          youtubeUrl,
        });
        return {
          ...baseResult,
          contentId: 'article-1',
          id: 'article-1',
          sourceArtifactId: 'artifact-1',
        };
      },
      promoteSourceToLibrary: async (artifactId: string) => {
        backend.promoted.push(artifactId);
        return { ingredientId: 'ingredient-1' };
      },
    }),
  },
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apps: { app: 'https://app.genfeed.ai' },
  },
}));

vi.mock('../../../../src/api/load-public-service', () => ({
  loadPublicService: async () => ({
    createPublicYoutubeLongForm: async (
      youtubeUrl: string,
      outputType: string,
    ) => {
      backend.requests.push({ channel: 'public', outputType, youtubeUrl });
      return baseResult;
    },
  }),
}));

vi.mock('../../../../src/analytics/posthog-client', () => ({
  captureWebsiteAnalyticsEvent: () => undefined,
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
    backend.isSignedIn = false;
    backend.promoted = [];
    backend.requests = [];
  });

  it('keeps the free preview on the public workflow entry', async () => {
    render(<YoutubeLongFormContent />);
    submit();

    expect(await screen.findByText('Long-form body')).toBeInTheDocument();
    expect(backend.requests).toEqual([
      {
        channel: 'public',
        outputType: 'article',
        youtubeUrl: baseResult.youtubeUrl,
      },
    ]);
    expect(
      screen.getByRole('link', { name: 'Sign in to save future results' }),
    ).toHaveAttribute('href', 'https://app.genfeed.ai/login');
  });

  it('persists an authenticated output and promotes its source explicitly', async () => {
    backend.isSignedIn = true;
    render(<YoutubeLongFormContent />);
    submit();

    const save = await screen.findByRole('button', {
      name: 'Save YouTube source to Library',
    });
    expect(backend.requests).toEqual([
      {
        channel: 'authenticated',
        outputType: 'article',
        youtubeUrl: baseResult.youtubeUrl,
      },
    ]);
    expect(backend.promoted).toEqual([]);

    fireEvent.click(save);
    await waitFor(() => {
      expect(backend.promoted).toEqual(['artifact-1']);
    });
    expect(
      screen.getByRole('button', { name: 'Save YouTube source to Library' }),
    ).toHaveTextContent('Source saved');
  });
});
