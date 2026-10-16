import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { metadata as site } from '@helpers/media/metadata/metadata.helper';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import XPlayerCardContent from './content';
import { metadata } from './page';

describe('X player card metadata', () => {
  it('overrides this route with a player card on the final apex URL', () => {
    expect(metadata.twitter?.card).toBe('player');
    if (metadata.twitter?.card !== 'player') {
      throw new Error('Expected a player card');
    }

    const player = Array.isArray(metadata.twitter.players)
      ? metadata.twitter.players[0]
      : metadata.twitter.players;

    expect(player).toEqual({
      height: 480,
      playerUrl: 'https://genfeed.ai/x/card',
      streamUrl: 'https://genfeed.ai/x/card',
      width: 640,
    });
    expect(metadata.alternates?.canonical).toBe('https://genfeed.ai/x/card');
    expect(metadata.openGraph?.url).toBe('https://genfeed.ai/x/card');
    expect(site.url).toBe('https://genfeed.ai');
    expect(site.cards.default).toBe('https://genfeed.ai/og');
    expect(metadata.twitter.images).toEqual([
      expect.objectContaining({
        height: 630,
        type: 'image/png',
        url: 'https://genfeed.ai/og',
        width: 1200,
      }),
    ]);
    expect(metadata.openGraph?.images).toEqual(metadata.twitter.images);
  });
});

describe('X player card page', () => {
  it('opens the product in a new tab and keeps the action in the top of the frame', () => {
    const { container } = render(<XPlayerCardContent />);

    expect(
      screen.getByRole('heading', { level: 1, name: /ask once/i }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open Genfeed' })).toHaveAttribute(
      'href',
      'https://genfeed.ai',
    );
    expect(screen.getByRole('link', { name: 'Open Genfeed' })).toHaveAttribute(
      'target',
      '_blank',
    );
    expect(container.querySelector('form, input, textarea, select')).toBeNull();
    expect(container.querySelector('main > div')?.className).toContain(
      'h-[70dvh]',
    );
    expect(container.querySelector('main > div')?.className).toContain(
      'sm:h-full',
    );
  });

  it('is not listed in the LLM discovery index', () => {
    const source = readFileSync(
      join(import.meta.dirname, '../../../../packages/data/llms-text.data.ts'),
      'utf8',
    );

    expect(source).not.toContain('/x/card');
  });
});
