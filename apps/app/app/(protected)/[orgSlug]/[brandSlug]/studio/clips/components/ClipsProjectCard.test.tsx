import '@testing-library/jest-dom/vitest';
import type { ClipProjectSummary } from '@props/studio/clips.props';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import ClipsProjectCard from './ClipsProjectCard';

vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <span data-testid="project-thumb" data-src={src}>
      {alt}
    </span>
  ),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const project: ClipProjectSummary = {
  createdAt: '2026-08-20T10:00:00.000Z',
  failedClipCount: 0,
  id: 'project-1',
  mode: 'raw-cut',
  name: 'Podcast ep 12',
  pendingClipCount: 0,
  progress: 100,
  readyClipCount: 8,
  sourceVideoUrl: 'https://youtu.be/dQw4w9WgXcQ',
  status: 'completed',
};

describe('ClipsProjectCard', () => {
  it('links to the project detail route and shows clip count', () => {
    render(
      <ClipsProjectCard
        href="/demo/koro/studio/clips/project-1"
        project={project}
      />,
    );

    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/demo/koro/studio/clips/project-1',
    );
    expect(screen.getByText('Podcast ep 12')).toBeInTheDocument();
    expect(screen.getByText(/8 clips/)).toBeInTheDocument();
    expect(screen.getByTestId('project-thumb')).toHaveAttribute(
      'data-src',
      'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    );
  });
});
