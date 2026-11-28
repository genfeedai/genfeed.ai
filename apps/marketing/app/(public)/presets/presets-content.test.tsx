import { buildPresetPages } from '@data/presets.data';
import { catalogWithExamples } from '@data/presets.fixture';
import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import PresetsContent from './presets-content';

vi.mock('@web-components/PageLayout', () => ({
  default: ({
    children,
    description,
    heroActions,
    heroVisual,
    title,
  }: {
    children: ReactNode;
    description: string;
    heroActions: ReactNode;
    heroVisual: ReactNode;
    title: string;
  }) => (
    <div>
      <h1>{title}</h1>
      <p>{description}</p>
      {heroActions}
      {heroVisual}
      {children}
    </div>
  ),
}));

describe('PresetsContent', () => {
  it('groups the published presets by what they make, each card linking to its page', () => {
    const pages = buildPresetPages(
      catalogWithExamples(['ad-ugc-selfie', 'studio-meme', 'studio-banner']),
    );
    render(<PresetsContent pages={pages} />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Presets' }),
    ).toBeInTheDocument();
    const ads = screen
      .getByRole('heading', { level: 2, name: 'Video ads' })
      .closest('section');
    expect(ads).not.toBeNull();
    expect(
      within(ads as HTMLElement).getByRole('link', { name: /UGC selfie ad/ }),
    ).toHaveAttribute('href', '/presets/ugc-selfie-ad');
    expect(screen.getByRole('link', { name: /Banner/ })).toHaveAttribute(
      'href',
      '/presets/banner',
    );
  });

  it('leaves out a group that has no published preset', () => {
    render(
      <PresetsContent
        pages={buildPresetPages(catalogWithExamples(['studio-meme']))}
      />,
    );

    expect(
      screen.getByRole('heading', { level: 2, name: 'Videos' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { level: 2, name: 'Video ads' }),
    ).toBeNull();
    expect(
      screen.queryByRole('heading', { level: 2, name: 'Photo edits' }),
    ).toBeNull();
  });

  it('shows a card picture for a clip without loading the clip', () => {
    const { container } = render(
      <PresetsContent
        pages={buildPresetPages(catalogWithExamples(['studio-meme']))}
      />,
    );

    expect(container.querySelector('video')).toBeNull();
    expect(screen.getByAltText(/Meme example/)).toHaveAttribute(
      'src',
      'https://cdn.genfeed.ai/presets/studio-meme-poster.jpg',
    );
  });
});
