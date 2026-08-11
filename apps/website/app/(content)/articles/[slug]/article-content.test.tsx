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
        articleLabel="A useful guide"
        html="<h2>First step</h2><p>Read this.</p><pre><code>Generate a useful asset.</code></pre>"
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
      expect.stringContaining('https://app.genfeed.ai/agent/new?prompt='),
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
        articleLabel="How to prompt assets"
        html="<h2>Video</h2><p>Direct the shot.</p>"
        slug="how-to-prompt-ai-images-videos-and-audio"
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'See the effect, then apply it' }),
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
});
