import type { ArticleGenerationBlockData } from '@props/content/public-article.props';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ArticleGenerationBlock from './article-generation-block';

const copyToClipboard = vi.fn<(value: string) => Promise<boolean>>();

vi.mock('@services/core/clipboard.service', () => ({
  ClipboardService: { getInstance: () => ({ copyToClipboard }) },
}));

const GENERATION: ArticleGenerationBlockData = {
  description: 'A bear sheet for the cast.',
  height: 1024,
  id: 'ing-1',
  kind: 'image',
  label: 'Bear Sheet',
  modelKey: 'flux-2',
  modelLabel: 'Flux 2',
  prompt: 'A friendly bear, character sheet',
  url: 'https://cdn.test/ing-1.jpg',
  width: 1024,
};

beforeEach(() => {
  copyToClipboard.mockReset();
});

describe('ArticleGenerationBlock', () => {
  it('names the generation and links its model', () => {
    render(<ArticleGenerationBlock generation={GENERATION} />);

    expect(screen.getByText('Bear Sheet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Flux 2' })).toHaveAttribute(
      'href',
      '/models#model-flux-2',
    );
    expect(
      screen.getByRole('img', { name: 'A bear sheet for the cast.' }),
    ).toHaveAttribute('src', 'https://cdn.test/ing-1.jpg');
  });

  it('copies the prompt', async () => {
    copyToClipboard.mockResolvedValue(true);
    render(<ArticleGenerationBlock generation={GENERATION} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy prompt' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Copied' })).toBeVisible(),
    );
    expect(copyToClipboard).toHaveBeenCalledWith(
      'A friendly bear, character sheet',
    );
  });

  it('opens the app with the prompt filled in to recreate it', () => {
    render(<ArticleGenerationBlock generation={GENERATION} />);

    const href = screen
      .getByRole('link', { name: 'Recreate in Genfeed' })
      .getAttribute('href');
    const url = new URL(href ?? '');
    expect(url.pathname).toBe('/agent/new');
    expect(url.searchParams.get('prompt')).toBe(
      'Recreate this image with Flux 2: A friendly bear, character sheet',
    );
  });

  it('expands the whole prompt on request', () => {
    render(<ArticleGenerationBlock generation={GENERATION} />);

    fireEvent.click(screen.getByRole('button', { name: 'See all' }));

    expect(screen.getByRole('button', { name: 'Show less' })).toBeVisible();
  });

  it('shows the output without prompt tools when the author hid the prompt', () => {
    render(
      <ArticleGenerationBlock generation={{ ...GENERATION, prompt: null }} />,
    );

    expect(screen.getByRole('img')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Copy prompt' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Recreate in Genfeed' }),
    ).not.toBeInTheDocument();
  });
});
