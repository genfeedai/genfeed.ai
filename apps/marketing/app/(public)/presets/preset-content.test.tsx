import { buildPresetPages, getRelatedPresetPages } from '@data/presets.data';
import { catalogWithExamples } from '@data/presets.fixture';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import PresetContent from './preset-content';

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

const pages = buildPresetPages(
  catalogWithExamples([
    'ad-ugc-selfie',
    'ad-talking-head',
    'studio-meme',
    'studio-edit-remove-background',
  ]),
);

function renderPage(
  key: string,
  useCases: { audience: string; slug: string }[] = [],
) {
  const page = pages.find((candidate) => candidate.key === key);
  if (!page) throw new Error(`No fixture page for ${key}`);
  return render(
    <PresetContent
      page={page}
      related={getRelatedPresetPages(page, pages)}
      useCases={useCases}
    />,
  );
}

describe('PresetContent', () => {
  it('puts the preset name in the H1 and answers each question under an H2', () => {
    renderPage('ad-ugc-selfie');

    expect(
      screen.getByRole('heading', { level: 1, name: 'UGC selfie ad' }),
    ).toBeInTheDocument();
    for (const name of [
      'What it makes',
      'The recipe',
      'Run it from your agent',
      'UGC selfie ad preset: frequently asked questions',
      'More presets like this',
    ])
      expect(
        screen.getByRole('heading', { level: 2, name }),
      ).toBeInTheDocument();
  });

  it('shows the clip with its poster, and the recipe with a copy control', () => {
    const { container } = renderPage('studio-meme');

    const video = container.querySelector('video');
    expect(video).toHaveAttribute(
      'poster',
      'https://cdn.genfeed.ai/presets/studio-meme-poster.jpg',
    );
    expect(
      screen.getByRole('button', { name: 'Copy Recipe' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Create a short reaction meme about your topic\./),
    ).toBeInTheDocument();
  });

  it('lists the settings as a table', () => {
    renderPage('studio-meme');

    expect(
      screen.getByRole('row', { name: /Aspect ratio\s*9:16/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('row', { name: /Preset key\s*studio-meme/ }),
    ).toBeInTheDocument();
  });

  it('shows a photo edit as a before and an after', () => {
    renderPage('studio-edit-remove-background');

    expect(screen.getAllByText('Before').length).toBeGreaterThan(0);
    expect(screen.getAllByText('After').length).toBeGreaterThan(0);
  });

  it('gives the agent prompt and the MCP call with the preset key', () => {
    renderPage('ad-ugc-selfie');

    expect(
      screen.getByText(/Read the genfeed preset "ad-ugc-selfie"/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'get_generation_catalog(action="preset", key="ad-ugc-selfie")',
      ),
    ).toBeInTheDocument();
  });

  it('links the other published presets of its group, and not itself', () => {
    renderPage('ad-ugc-selfie');

    expect(screen.getByRole('link', { name: 'Talking head' })).toHaveAttribute(
      'href',
      '/presets/talking-head',
    );
    expect(screen.queryByRole('link', { name: 'UGC selfie ad' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Meme' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Every preset' })).toHaveAttribute(
      'href',
      '/presets',
    );
  });

  it('sends the primary action to sign-up', () => {
    renderPage('studio-meme');

    expect(
      screen.getByRole('link', { name: /Use this preset/ }),
    ).toHaveAttribute('href', expect.stringContaining('/sign-up'));
  });

  it('links back to the use cases that name the preset, and omits the section when none does', () => {
    const { unmount } = renderPage('ad-ugc-selfie', [
      { audience: 'Agencies', slug: 'agencies' },
    ]);
    expect(
      screen.getByRole('heading', { level: 2, name: 'Used for' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Agencies' })).toHaveAttribute(
      'href',
      '/use-cases/agencies',
    );
    unmount();

    renderPage('ad-ugc-selfie');
    expect(screen.queryByRole('heading', { name: 'Used for' })).toBeNull();
  });
});
