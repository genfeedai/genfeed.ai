import { buildPresetPages } from '@data/presets.data';
import { catalogWithExamples } from '@data/presets.fixture';
import { getUseCaseBySlug } from '@data/use-cases.data';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  pages: [] as ReturnType<typeof buildPresetPages>,
}));

vi.mock('@data/presets.data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@data/presets.data')>()),
  getPresetPages: () => state.pages,
}));

vi.mock('@web-components/PageLayout', () => ({
  default: ({ children, title }: { children: ReactNode; title: string }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

vi.mock(
  '@web-components/buttons/agent-first-actions/AgentFirstActions',
  () => ({
    default: () => null,
  }),
);

const { default: UseCasesContent } = await import('./use-cases-content');

function renderUseCase(slug: string) {
  const useCase = getUseCaseBySlug(slug);
  if (!useCase) throw new Error(`No use case ${slug}`);
  return render(<UseCasesContent useCase={useCase} />);
}

describe('UseCasesContent presets row', () => {
  beforeEach(() => {
    state.pages = [];
  });

  it('shows no presets row while none of the named presets has a page', () => {
    renderUseCase('creators');

    expect(screen.queryByRole('heading', { name: /^Presets for/ })).toBeNull();
  });

  it('shows the named presets with a page, each linking to its page', () => {
    state.pages = buildPresetPages(
      catalogWithExamples([
        'studio-youtube-thumbnail',
        'studio-meme',
        'ad-ugc-selfie',
      ]),
    );
    renderUseCase('creators');

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Presets for Content Creators',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /YouTube thumbnail/ }),
    ).toHaveAttribute('href', '/presets/youtube-thumbnail');
    expect(screen.getByRole('link', { name: /Meme/ })).toHaveAttribute(
      'href',
      '/presets/meme',
    );
    expect(screen.queryByRole('link', { name: /UGC selfie ad/ })).toBeNull();
  });
});
