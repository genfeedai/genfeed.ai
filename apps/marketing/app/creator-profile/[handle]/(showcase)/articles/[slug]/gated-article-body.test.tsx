import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GatedArticleBody from './gated-article-body';

const getSignedInBetterAuthToken = vi.fn<() => Promise<string | null>>();

vi.mock('@genfeedai/auth-client', () => ({ getSignedInBetterAuthToken }));

const PREVIEW = { html: '<p>Free opening.</p>', sections: [] };

function renderBody() {
  render(
    <GatedArticleBody
      applyHref="https://app.genfeed.ai/agent/new"
      articleId="article_1"
      handle="ada"
      preview={PREVIEW}
      slug="launch-notes"
      unlockPriceCredits={25}
    />,
  );
}

beforeEach(() => {
  getSignedInBetterAuthToken.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GatedArticleBody', () => {
  it('shows a signed-out reader the preview and the way in', async () => {
    getSignedInBetterAuthToken.mockResolvedValue(null);
    renderBody();

    expect(screen.getByText('Free opening.')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Unlock it once for 25 credits, or subscribe to @ada to read everything they publish.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Keep reading' })).toHaveAttribute(
      'href',
      expect.stringContaining('/support/ada?article=article_1'),
    );
  });

  it('shows a reader with access the full article', async () => {
    getSignedInBetterAuthToken.mockResolvedValue('token');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            full: {
              html: '<p>Free opening.</p><p>Paid ending.</p>',
              sections: [],
            },
            hasAccess: true,
            subscriptionPriceCredits: 40,
            unlockPriceCredits: 25,
          }),
        ),
      ),
    );
    renderBody();

    expect(await screen.findByText('Paid ending.')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Keep reading' }),
    ).not.toBeInTheDocument();
  });
});
