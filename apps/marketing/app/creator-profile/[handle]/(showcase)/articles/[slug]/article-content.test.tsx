import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ArticleContent from './article-content';

const copyToClipboard = vi.fn<(value: string) => Promise<boolean>>();

vi.mock('@services/core/clipboard.service', () => ({
  ClipboardService: {
    getInstance: () => ({ copyToClipboard }),
  },
}));

beforeEach(() => {
  copyToClipboard.mockReset();
  copyToClipboard.mockResolvedValue(true);
});

describe('ArticleContent', () => {
  it('turns headings and prompt blocks into useful article actions', async () => {
    render(
      <ArticleContent
        applyHref="https://app.genfeed.ai/agent/new?prompt=Apply"
        sanitizedHtml='<h2 id="first-step">First step</h2><p>Read this.</p><pre><code>Generate a useful asset.</code></pre>'
        sections={[{ id: 'first-step', label: 'First step', level: 2 }]}
        slug="a-useful-guide"
      />,
    );

    const sectionLink = await screen.findByRole('link', {
      name: 'First step',
    });
    expect(sectionLink).toHaveAttribute('href', '#first-step');

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
    expect(await screen.findByRole('status')).toHaveTextContent('Copied');
  });

  it('does not announce Copied after a handled clipboard failure', async () => {
    copyToClipboard.mockResolvedValue(false);
    render(
      <ArticleContent
        articleLabel="Guide"
        sanitizedHtml="<pre><code>Prompt</code></pre>"
      />,
    );
    const button = await screen.findByRole('button', {
      name: 'Copy this prompt',
    });
    fireEvent.click(button);
    await waitFor(() => expect(copyToClipboard).toHaveBeenCalledWith('Prompt'));
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(button).toHaveAccessibleName('Copy this prompt');
  });

  it('folds a long prompt block and unfolds it again', async () => {
    const lines = Array.from({ length: 8 }, (_, line) => `Rule ${line + 1}`);
    render(
      <ArticleContent
        sanitizedHtml={`<pre><code>${lines.join('\n')}</code></pre>`}
      />,
    );

    const collapse = await screen.findByRole('button', {
      name: 'Collapse this prompt',
    });
    expect(collapse).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(collapse);
    const expand = screen.getByRole('button', { name: 'Expand this prompt' });
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    expect(expand.closest('.gen-code-block')).toHaveAttribute(
      'data-collapsed',
      'true',
    );

    fireEvent.click(expand);
    expect(
      screen.getByRole('button', { name: 'Collapse this prompt' }),
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('gives a short prompt block a copy button and nothing to fold', async () => {
    render(
      <ArticleContent sanitizedHtml="<pre><code>One line.</code></pre>" />,
    );

    await screen.findByRole('button', { name: 'Copy this prompt' });
    expect(
      screen.queryByRole('button', { name: /collapse|expand/i }),
    ).toBeNull();
  });

  it('renders a figure of two images as a before/after slider', async () => {
    render(
      <ArticleContent
        sanitizedHtml={
          '<p>Intro</p><figure data-genfeed-compare=""><img src="https://cdn.test/a.jpg?x=1&amp;y=2" alt="Before: crowded" width="1280" height="720" /><img src="https://cdn.test/b.jpg" alt="After: one subject" /><figcaption>Same video.</figcaption></figure>'
        }
      />,
    );

    const slider = await screen.findByRole('slider', {
      name: 'Compare before and after',
    });
    expect(slider).toHaveAttribute('aria-valuenow', '50');
    expect(screen.getByAltText('Before: crowded')).toHaveAttribute(
      'src',
      'https://cdn.test/a.jpg?x=1&y=2',
    );
    expect(screen.getByAltText('After: one subject')).toBeInTheDocument();
    expect(screen.getByText('Same video.')).toBeInTheDocument();

    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(slider).toHaveAttribute('aria-valuenow', '55');
    expect(slider).toHaveAttribute('aria-valuetext', 'Showing 55% before');

    fireEvent.keyDown(slider, { key: 'End' });
    expect(slider).toHaveAttribute('aria-valuenow', '100');
    expect(slider).toHaveAttribute('aria-valuetext', 'Showing before');

    fireEvent.keyDown(slider, { key: 'Home' });
    expect(slider).toHaveAttribute('aria-valuetext', 'Showing after');
  });

  it('leaves a figure with one image as plain article HTML', async () => {
    render(
      <ArticleContent sanitizedHtml='<figure data-genfeed-compare=""><img src="https://cdn.test/a.jpg" alt="Only one" /></figure>' />,
    );

    expect(await screen.findByAltText('Only one')).toBeInTheDocument();
    expect(screen.queryByRole('slider')).toBeNull();
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
        sanitizedHtml='<h2 id="only-text">Only text</h2><p>Nothing interactive.</p>'
        sections={[{ id: 'only-text', label: 'Only text', level: 2 }]}
        slug="a-plain-article"
      />,
    );

    await screen.findByRole('link', { name: 'Only text' });
    expect(
      screen.queryByRole('heading', { name: 'See the effect, then apply it' }),
    ).toBeNull();
  });
});
