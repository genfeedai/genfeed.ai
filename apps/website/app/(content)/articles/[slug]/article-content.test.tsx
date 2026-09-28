import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ArticleContent from './article-content';

const copyToClipboard = vi.fn<(value: string) => Promise<void>>();

vi.mock('@services/core/clipboard.service', () => ({
  ClipboardService: {
    getInstance: () => ({ copyToClipboard }),
  },
}));

beforeEach(() => {
  copyToClipboard.mockReset();
  copyToClipboard.mockResolvedValue();
});

describe('ArticleContent', () => {
  it('turns headings and prompt blocks into useful article actions', async () => {
    render(
      <ArticleContent
        applyHref="https://app.genfeed.ai/agent/new?prompt=Apply"
        sanitizedHtml="<h2>First step</h2><p>Read this.</p><pre><code>Generate a useful asset.</code></pre>"
        slug="a-useful-guide"
      />,
    );

    const sectionLink = await screen.findByRole('link', {
      name: 'First step',
    });
    expect(sectionLink).toHaveAttribute('href', '#article-first-step-1');

    const applyLink = screen.getByRole('link', { name: /apply this guide/i });
    expect(applyLink).toHaveAttribute(
      'href',
      'https://app.genfeed.ai/agent/new?prompt=Apply',
    );

    const copyButton = await screen.findByRole('button', {
      name: 'Copy this prompt',
    });
    fireEvent.click(copyButton);
    await waitFor(() =>
      expect(copyToClipboard).toHaveBeenCalledWith('Generate a useful asset.'),
    );
  });

  it('mounts the filmmaking effect lab on the matching article', async () => {
    render(
      <ArticleContent
        applyHref="https://app.genfeed.ai/agent/new?prompt=Apply"
        sanitizedHtml="<h2>Video</h2><p>Direct the shot.</p>"
        slug="how-to-prompt-ai-images-videos-and-audio"
      />,
    );

    // The lab loads on demand, only for this article.
    expect(
      await screen.findByRole('heading', {
        name: 'See the effect, then apply it',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Film grain applied preview' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show before' }));
    expect(
      screen.getByRole('img', { name: 'Film grain before preview' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dolly zoom' }));
    expect(
      screen.getByRole('img', { name: 'Dolly zoom applied preview' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /use in genfeed/i }),
    ).toHaveAttribute('href', expect.stringContaining('dolly-zoom'));
  });

  it('does not load the lab on other articles', async () => {
    render(
      <ArticleContent
        applyHref="https://app.genfeed.ai/agent/new?prompt=Apply"
        sanitizedHtml="<h2>Only text</h2><p>Nothing interactive.</p>"
        slug="a-plain-article"
      />,
    );

    await screen.findByRole('link', { name: 'Only text' });
    expect(
      screen.queryByRole('heading', { name: 'See the effect, then apply it' }),
    ).toBeNull();
  });
});
