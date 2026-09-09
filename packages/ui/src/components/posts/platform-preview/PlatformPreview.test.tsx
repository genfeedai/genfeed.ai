import { CredentialPlatform, IngredientCategory } from '@genfeedai/contracts';
import {
  type ChannelCapability,
  getChannelCapability,
} from '@genfeedai/contracts/api-types/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import PlatformPreview, {
  buildMediaFromIngredients,
  countPreviewCharacters,
  getPlatformPreviewIcon,
  hasDedicatedPlatformPreviewRenderer,
} from '@ui/posts/platform-preview/PlatformPreview';

type MockImageProps = ComponentProps<'img'> & {
  fill?: boolean;
  priority?: boolean;
  unoptimized?: boolean;
};

vi.mock('next/image', () => ({
  default: ({
    fill: _fill,
    priority: _priority,
    unoptimized: _unoptimized,
    ...props
  }: MockImageProps) => <img {...props} alt={props.alt ?? ''} />,
}));

function requireCapability(platform: CredentialPlatform): ChannelCapability {
  const capability = getChannelCapability(platform);
  if (!capability) {
    throw new Error(`Missing capability for ${platform}`);
  }

  return capability;
}

describe('PlatformPreview', () => {
  it('registers dedicated renderers for core platforms only', () => {
    expect(
      hasDedicatedPlatformPreviewRenderer(CredentialPlatform.TWITTER),
    ).toBe(true);
    expect(
      hasDedicatedPlatformPreviewRenderer(CredentialPlatform.LINKEDIN),
    ).toBe(true);
    expect(
      hasDedicatedPlatformPreviewRenderer(CredentialPlatform.INSTAGRAM),
    ).toBe(true);
    expect(hasDedicatedPlatformPreviewRenderer(CredentialPlatform.TIKTOK)).toBe(
      true,
    );
    expect(
      hasDedicatedPlatformPreviewRenderer(CredentialPlatform.YOUTUBE),
    ).toBe(true);
    expect(hasDedicatedPlatformPreviewRenderer(CredentialPlatform.REDDIT)).toBe(
      false,
    );
  });

  it('uses the capability caption limit for X truncation and validation', () => {
    const capability = requireCapability(CredentialPlatform.TWITTER);
    const caption = 'x'.repeat(capability.caption.maxLength + 5);

    render(
      <PlatformPreview
        target={{
          author: { handle: 'genfeed', name: 'Genfeed' },
          capability,
          caption,
          platform: CredentialPlatform.TWITTER,
        }}
      />,
    );

    expect(
      screen.getByText(
        `${countPreviewCharacters(caption)}/${capability.caption.maxLength}`,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        `Truncated after ${capability.caption.maxLength} characters.`,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        `${capability.label} captions must be ${capability.caption.maxLength} characters or fewer.`,
      ),
    ).toBeInTheDocument();
  });

  it('renders thread segments with per-post counters', () => {
    const capability = requireCapability(CredentialPlatform.TWITTER);

    render(
      <PlatformPreview
        target={{
          author: { handle: 'genfeed', name: 'Genfeed' },
          capability,
          caption: 'First segment\n\nSecond segment',
          platform: CredentialPlatform.TWITTER,
          threadSegments: [
            { caption: 'First segment #launch', id: 'segment-1' },
            { caption: 'Second segment @team', id: 'segment-2' },
          ],
        }}
      />,
    );

    expect(screen.getByText('Post 1')).toBeInTheDocument();
    expect(screen.getByText('Post 2')).toBeInTheDocument();
    expect(screen.getByText('#launch')).toBeInTheDocument();
    expect(screen.getByText('@team')).toBeInTheDocument();
  });

  it('labels unsupported dedicated layouts as approximate fallback previews', () => {
    const capability = requireCapability(CredentialPlatform.REDDIT);

    render(
      <PlatformPreview
        target={{
          capability,
          caption: 'Share this to the community',
          platform: CredentialPlatform.REDDIT,
        }}
      />,
    );

    expect(screen.getAllByText('Approximate preview').length).toBeGreaterThan(
      0,
    );
    expect(screen.getByText('Reddit')).toBeInTheDocument();
    expect(
      screen.getByText('Reddit is hidden from scheduler publishing.'),
    ).toBeInTheDocument();
  });

  it('surfaces media count validation from the capability catalog', () => {
    const capability = requireCapability(CredentialPlatform.INSTAGRAM);
    const maxItems = capability.media.maxItems ?? 0;

    render(
      <PlatformPreview
        target={{
          capability,
          caption: 'Carousel launch',
          media: Array.from({ length: maxItems + 1 }, (_, index) => ({
            id: `media-${index}`,
            kind: 'image',
          })),
          platform: CredentialPlatform.INSTAGRAM,
        }}
      />,
    );

    expect(
      screen.getByText(
        `${capability.label} allows at most ${maxItems} media item(s).`,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('+1 more not shown')).toBeInTheDocument();
  });

  it('flags the affected media item with the platform animation consequence', () => {
    const capability = requireCapability(CredentialPlatform.INSTAGRAM);
    const consequence = capability.media.animated.consequence;

    render(
      <PlatformPreview
        target={{
          capability,
          caption: 'Looping teaser',
          media: [
            { id: 'still-1', kind: 'image' },
            { id: 'gif-1', isAnimated: true, kind: 'image' },
          ],
          platform: CredentialPlatform.INSTAGRAM,
        }}
      />,
    );

    expect(capability.media.animated.supported).toBe(false);
    expect(consequence).toBeDefined();

    // The consequence is attached to the offending tile, not just the summary.
    const flaggedTile = screen.getByTestId('platform-preview-media-gif-1');
    expect(flaggedTile).toHaveTextContent(consequence as string);
    expect(
      screen.getByTestId('platform-preview-media-still-1'),
    ).not.toHaveTextContent(consequence as string);
  });

  it('renders the valid-with-warnings state without blocking the target', () => {
    const capability = requireCapability(CredentialPlatform.INSTAGRAM);

    render(
      <PlatformPreview
        target={{
          capability,
          caption: 'Looping teaser',
          media: [{ id: 'gif-1', isAnimated: true, kind: 'image' }],
          platform: CredentialPlatform.INSTAGRAM,
          // Otherwise valid, so the badge can only come from the warning.
          settings: { placement: 'feed' },
        }}
      />,
    );

    expect(screen.getByText('Warnings')).toBeInTheDocument();
    expect(screen.queryByText('Blocked')).not.toBeInTheDocument();
  });

  it('resolves platform aliases through the shared platform helpers', () => {
    expect(hasDedicatedPlatformPreviewRenderer('x')).toBe(true);

    render(
      <PlatformPreview
        target={{
          author: { handle: 'genfeed', name: 'Genfeed' },
          caption: 'Alias routed draft',
          platform: 'x',
        }}
      />,
    );

    expect(
      screen.getByRole('article', { name: 'X (Twitter) platform preview' }),
    ).toBeInTheDocument();
  });

  it('never falls back to another platform brand icon', () => {
    const twitterIcon = getPlatformPreviewIcon(CredentialPlatform.TWITTER);

    expect(getPlatformPreviewIcon(CredentialPlatform.REDDIT)).not.toBe(
      twitterIcon,
    );
    expect(getPlatformPreviewIcon('myspace')).not.toBe(twitterIcon);
    expect(getPlatformPreviewIcon('x')).toBe(twitterIcon);
  });

  it('maps ingredients onto preview media for composer surfaces', () => {
    const media = buildMediaFromIngredients([
      {
        category: IngredientCategory.VIDEO,
        id: 'ing-1',
        ingredientUrl: 'https://cdn.example.com/video.mp4',
        metadataDuration: 65,
        metadataLabel: 'Launch teaser',
        thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
      } as IIngredient,
      {
        category: IngredientCategory.GIF,
        id: 'ing-2',
        ingredientUrl: 'https://cdn.example.com/loop.gif',
      } as IIngredient,
    ]);

    expect(media).toEqual([
      {
        alt: 'Launch teaser',
        durationLabel: '1:05',
        id: 'ing-1',
        isAnimated: false,
        kind: 'video',
        thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
        url: 'https://cdn.example.com/video.mp4',
      },
      {
        alt: 'Media 2',
        durationLabel: undefined,
        id: 'ing-2',
        isAnimated: true,
        kind: 'image',
        thumbnailUrl: undefined,
        url: 'https://cdn.example.com/loop.gif',
      },
    ]);
    expect(buildMediaFromIngredients(undefined)).toEqual([]);
  });
});

describe('unified completed post previews', () => {
  it.each([
    CredentialPlatform.TWITTER,
    CredentialPlatform.THREADS,
    CredentialPlatform.INSTAGRAM,
    CredentialPlatform.LINKEDIN,
    CredentialPlatform.TIKTOK,
    CredentialPlatform.YOUTUBE,
    CredentialPlatform.REDDIT,
  ])('renders the supplied author avatar on %s', (platform) => {
    render(
      <PlatformPreview
        target={{
          platform,
          caption: 'Launch day',
          author: {
            name: 'Vincent',
            avatarUrl: 'https://example.com/vincent.jpg',
          },
        }}
      />,
    );
    expect(screen.getByAltText('Vincent profile picture')).toHaveAttribute(
      'src',
      'https://example.com/vincent.jpg',
    );
  });
  it('renders Threads as a dedicated feed with every thread segment and first comment', () => {
    render(
      <PlatformPreview
        target={{
          platform: CredentialPlatform.THREADS,
          caption: 'Hook',
          threadSegments: [
            { id: '1', caption: 'Hook' },
            { id: '2', caption: 'The detail' },
          ],
          firstComment: 'A useful link',
        }}
      />,
    );
    expect(
      hasDedicatedPlatformPreviewRenderer(CredentialPlatform.THREADS),
    ).toBe(true);
    expect(screen.queryByText('Approximate preview')).not.toBeInTheDocument();
    expect(screen.getByText('The detail')).toBeInTheDocument();
    expect(screen.getByTestId('preview-first-comment')).toHaveTextContent(
      'A useful link',
    );
  });
  it('plays video assets without treating the movie URL as an image', () => {
    render(
      <PlatformPreview
        target={{
          platform: CredentialPlatform.YOUTUBE,
          caption: 'Watch this',
          media: [
            {
              id: 'movie',
              kind: 'video',
              url: 'https://example.com/movie.mp4',
            },
          ],
        }}
      />,
    );
    expect(
      screen.getByRole('group', { name: 'Video controls' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Play video' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Video 1')).toHaveAttribute(
      'src',
      'https://example.com/movie.mp4',
    );
  });
});

it('keeps same-platform accounts separately selectable and preserves selection when targets reorder', () => {
  const first = {
    id: 'account-one',
    platform: 'twitter',
    caption: 'First account draft',
    author: { name: 'First', handle: 'first' },
  };
  const second = {
    id: 'account-two',
    platform: 'twitter',
    caption: 'Second account draft',
    author: { name: 'Second', handle: 'second' },
  };
  const { rerender } = render(
    <PlatformPreview targets={[first, second]} activePlatform="twitter" />,
  );
  fireEvent.click(screen.getByRole('button', { name: /@second/ }));
  expect(screen.getByText('Second account draft')).toBeInTheDocument();
  expect(screen.queryByText('First account draft')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /@second/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(screen.getByRole('button', { name: /@first/ })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  rerender(
    <PlatformPreview targets={[second, first]} activePlatform="twitter" />,
  );
  expect(screen.getByText('Second account draft')).toBeInTheDocument();
  rerender(<PlatformPreview targets={[first]} activePlatform="twitter" />);
  expect(screen.getByText('First account draft')).toBeInTheDocument();
});
