/* @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import ArtifactEditor from './artifact-editor';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./article-detail', () => ({
  default: ({
    articleId,
    credentialId,
  }: {
    articleId: string;
    credentialId?: string;
  }) => (
    <div>
      Article editor: {articleId}/{credentialId ?? 'no-credential'}
    </div>
  ),
}));

vi.mock('./newsletter-editor', () => ({
  default: ({ newsletterId }: { newsletterId?: string }) => (
    <div>Newsletter editor: {newsletterId}</div>
  ),
}));

vi.mock('@pages/posts/detail/post-detail', () => ({
  default: ({ postId, scope }: { postId: string; scope: string }) => (
    <div>
      Post editor: {postId}/{scope}
    </div>
  ),
}));

describe('ArtifactEditor', () => {
  it('routes a newsletter artifact to the newsletter editor', () => {
    render(<ArtifactEditor artifactId="newsletter-1" type="newsletter" />);

    expect(
      screen.getByText('Newsletter editor: newsletter-1'),
    ).toBeInTheDocument();
  });

  it('routes a post artifact to the post detail editor', () => {
    render(<ArtifactEditor artifactId="post-1" type="post" />);

    expect(screen.getByText(/Post editor: post-1/)).toBeInTheDocument();
  });

  it('routes an article artifact to the article editor with its credential', () => {
    render(
      <ArtifactEditor
        artifactId="article-1"
        credentialId="credential-1"
        type="article"
      />,
    );

    expect(
      screen.getByText('Article editor: article-1/credential-1'),
    ).toBeInTheDocument();
  });
});
