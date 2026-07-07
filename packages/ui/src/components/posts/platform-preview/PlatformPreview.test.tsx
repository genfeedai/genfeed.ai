import {
  type ChannelCapability,
  getChannelCapability,
} from '@api-types/contracts';
import { CredentialPlatform } from '@genfeedai/enums';
import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import PlatformPreview, {
  countPreviewCharacters,
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
});
