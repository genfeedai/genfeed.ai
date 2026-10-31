import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ClipperProjectSummary } from '@/props/studio/clipper.props';

import ClipperProjectCard from './ClipperProjectCard';

vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <span data-testid="project-thumb" data-src={src}>
      {alt}
    </span>
  ),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const project: ClipperProjectSummary = {
  createdAt: '2026-08-20T10:00:00.000Z',
  failedClipCount: 0,
  id: 'project-1',
  isDraft: false,
  mode: 'raw-cut',
  name: 'Podcast ep 12',
  pendingClipCount: 0,
  progress: 100,
  readyClipCount: 8,
  sourceVideoUrl: 'https://youtu.be/dQw4w9WgXcQ',
  status: 'completed',
};

describe('ClipperProjectCard', () => {
  it('links to the project detail route and shows clip count', () => {
    render(
      <ClipperProjectCard
        href="/demo/koro/clipper/project-1"
        project={project}
      />,
    );

    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/demo/koro/clipper/project-1',
    );
    expect(
      screen.getByRole('heading', { name: 'Podcast ep 12' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/8 clips/)).toBeInTheDocument();
    expect(screen.getByTestId('project-thumb')).toHaveAttribute(
      'data-src',
      'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    );
  });

  it('labels a draft and previews the YouTube link typed into it', () => {
    render(
      <ClipperProjectCard
        href="/demo/koro/clipper/draft-1"
        project={{
          ...project,
          id: 'draft-1',
          isDraft: true,
          name: 'Clip draft — 2026-09-28',
          readyClipCount: 0,
          status: 'draft',
        }}
      />,
    );

    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.queryByText(/0 clips/)).not.toBeInTheDocument();
    expect(screen.getByTestId('project-thumb')).toHaveAttribute(
      'data-src',
      'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    );
  });
});
