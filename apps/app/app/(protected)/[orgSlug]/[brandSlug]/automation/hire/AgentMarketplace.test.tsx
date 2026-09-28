import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AgentMarketplace from './AgentMarketplace';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../tests/next-intl.stub'
  );

  return { useTranslations: translateFromCatalog };
});

const { createPreset } = vi.hoisted(() => ({
  createPreset: (
    id: string,
    displayRole: string,
    teamGroup: string,
    type: string,
    defaultBudget = 10,
  ) => ({
    defaultBudget,
    defaultLabel: displayRole,
    description: `${displayRole} description.`,
    displayRole,
    id,
    platforms: ['LinkedIn'],
    teamGroup,
    type,
  }),
}));

// Six presets: the first four by name are featured, the last two are listed.
vi.mock('@pages/agents/content-team/content-team-presets', () => ({
  CONTENT_TEAM_ROLE_PRESETS: [
    createPreset(
      'video-producer',
      'Video Producer',
      'Production',
      'video_creator',
      25,
    ),
    createPreset('copywriter', 'Copywriter', 'Editorial', 'article_writer'),
    createPreset('analyst', 'Analyst', 'Research', 'general'),
    createPreset('scriptwriter', 'Scriptwriter', 'Editorial', 'youtube_script'),
    createPreset('designer', 'Designer', 'Production', 'image_creator'),
    createPreset('editor', 'Editor', 'Editorial', 'article_writer'),
  ],
}));

vi.mock('@ui/card/Card', () => ({
  default: ({
    children,
    className,
    description,
    label,
    onClick,
    'data-testid': dataTestId,
  }: {
    children?: ReactNode;
    className?: string;
    description?: string;
    label?: ReactNode;
    onClick?: () => void;
    'data-testid'?: string;
  }) =>
    onClick ? (
      <button
        className={className}
        data-testid={dataTestId}
        onClick={onClick}
        type="button"
      >
        <span>{label}</span>
        <span>{description}</span>
        {children}
      </button>
    ) : (
      <div className={className} data-testid={dataTestId}>
        {children}
      </div>
    ),
}));

vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt?: string; src: string }) => (
    <span data-alt={alt} data-src={src} />
  ),
}));

vi.mock('@ui/lists/list-row/ListRow', () => ({
  ListRow: ({
    description,
    leading,
    meta,
    title,
    trailing,
    'data-testid': dataTestId,
  }: {
    description?: ReactNode;
    leading?: ReactNode;
    meta?: ReactNode;
    title: ReactNode;
    trailing?: ReactNode;
    'data-testid'?: string;
  }) => (
    <div data-testid={dataTestId}>
      {leading}
      <p>{title}</p>
      <p>{description}</p>
      <p>{meta}</p>
      {trailing}
    </div>
  ),
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    ariaLabel,
    children,
    icon,
    isDisabled,
    label,
    onClick,
    'data-testid': dataTestId,
  }: {
    ariaLabel?: string;
    children?: ReactNode;
    icon?: ReactNode;
    isDisabled?: boolean;
    label?: ReactNode;
    onClick?: () => void;
    'data-testid'?: string;
  }) => (
    <button
      aria-label={ariaLabel}
      data-testid={dataTestId}
      disabled={isDisabled}
      onClick={onClick}
      type="button"
    >
      {icon}
      {children ?? label}
    </button>
  ),
}));

vi.mock('@ui/primitives/searchbar', () => ({
  default: ({
    ariaLabel,
    onChange,
    placeholder,
    value,
  }: {
    ariaLabel?: string;
    onChange?: (event: { target: { value: string } }) => void;
    placeholder?: string;
    value?: string;
  }) => (
    <input
      aria-label={ariaLabel}
      onChange={onChange}
      placeholder={placeholder}
      value={value}
    />
  ),
}));

// The real carousel measures its rail; jsdom ships no ResizeObserver.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function renderMarketplace(
  props: Partial<{
    isSubmitting: boolean;
    submittingPresetId: string | null;
  }> = {},
  onActivate = vi.fn(),
) {
  render(
    <AgentMarketplace
      isSubmitting={props.isSubmitting ?? false}
      onActivate={onActivate}
      submittingPresetId={props.submittingPresetId ?? null}
    />,
  );
  return onActivate;
}

function getSearch() {
  return screen.getByRole('textbox', { name: 'Search agents' });
}

describe('AgentMarketplace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the first four presets in the featured carousel and the rest in the list', () => {
    renderMarketplace();

    const featured = screen.getByTestId('agent-marketplace-featured');
    expect(
      within(featured).getByRole('heading', { name: 'Featured' }),
    ).toBeVisible();
    expect(
      within(featured)
        .getAllByTestId(/agent-preset-featured-/)
        .map((card) => card.getAttribute('data-testid')),
    ).toEqual([
      'agent-preset-featured-analyst',
      'agent-preset-featured-copywriter',
      'agent-preset-featured-designer',
      'agent-preset-featured-editor',
    ]);
    // Featured cards are fixed-width carousel slides, not a responsive grid.
    expect(screen.getByTestId('agent-preset-featured-analyst')).toHaveClass(
      'w-64',
      'shrink-0',
    );
    expect(
      screen
        .getByTestId('agent-marketplace')
        .querySelector('[class*="grid-cols"]'),
    ).toBeNull();

    const list = screen.getByTestId('agent-marketplace-list');
    expect(
      within(list).getByRole('heading', { name: 'More agents' }),
    ).toBeVisible();
    expect(
      within(list)
        .getAllByTestId(/agent-preset-row-/)
        .map((row) => row.getAttribute('data-testid')),
    ).toEqual([
      'agent-preset-row-scriptwriter',
      'agent-preset-row-video-producer',
    ]);
    // A featured preset is not repeated in the list.
    expect(
      within(list).queryByTestId('agent-preset-row-analyst'),
    ).not.toBeInTheDocument();
    expect(within(list).getByText(/25 credits/)).toBeVisible();

    expect(document.querySelector('[data-src]')?.getAttribute('data-src')).toBe(
      'https://cdn.genfeed.ai/assets/agents/analyst.webp',
    );
  });

  it('activates from a featured card and from a list row with one click', () => {
    const onActivate = renderMarketplace();

    fireEvent.click(screen.getByTestId('agent-preset-featured-copywriter'));
    expect(onActivate).toHaveBeenCalledWith('copywriter');

    const row = screen.getByTestId('agent-preset-row-video-producer');
    expect(within(row).getAllByRole('button')).toHaveLength(1);
    fireEvent.click(within(row).getByTestId('activate-video-producer'));
    expect(onActivate).toHaveBeenCalledWith('video-producer');
  });

  it('drops the carousel while searching and lists every match as All agents', () => {
    renderMarketplace();

    fireEvent.change(getSearch(), { target: { value: 'copy' } });

    expect(
      screen.queryByTestId('agent-marketplace-featured'),
    ).not.toBeInTheDocument();
    const list = screen.getByTestId('agent-marketplace-list');
    expect(
      within(list).getByRole('heading', { name: 'All agents' }),
    ).toBeVisible();
    expect(within(list).getAllByTestId(/agent-preset-row-/)).toHaveLength(1);
    expect(within(list).getByText('Copywriter')).toBeVisible();
  });

  it('hides the list section when the category fits in the carousel', () => {
    renderMarketplace();

    fireEvent.click(screen.getByRole('button', { name: 'Editorial' }));

    expect(
      screen
        .getAllByTestId(/agent-preset-featured-/)
        .map((card) => card.getAttribute('data-testid')),
    ).toEqual([
      'agent-preset-featured-copywriter',
      'agent-preset-featured-editor',
      'agent-preset-featured-scriptwriter',
    ]);
    expect(
      screen.queryByTestId('agent-marketplace-list'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Video Producer')).not.toBeInTheDocument();
  });

  it('shows the empty search message without any section', () => {
    renderMarketplace();

    fireEvent.change(getSearch(), { target: { value: 'nothing-matches' } });

    expect(screen.getByText('No agents match this search.')).toBeVisible();
    expect(
      screen.queryByTestId('agent-marketplace-featured'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('agent-marketplace-list'),
    ).not.toBeInTheDocument();
  });
});
