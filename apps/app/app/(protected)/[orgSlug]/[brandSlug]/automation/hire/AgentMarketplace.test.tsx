import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AgentMarketplace from './AgentMarketplace';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../tests/next-intl.stub'
  );

  return { useTranslations: translateFromCatalog };
});

vi.mock('@pages/agents/content-team/content-team-presets', () => ({
  CONTENT_TEAM_ROLE_PRESETS: [
    {
      defaultBudget: 25,
      defaultLabel: 'Video Producer',
      description: 'Creates short-form video briefs.',
      displayRole: 'Video Producer',
      id: 'video-producer',
      platforms: ['TikTok'],
      teamGroup: 'Production',
      type: 'video_creator',
    },
    {
      defaultBudget: 10,
      defaultLabel: 'Copywriter',
      description: 'Writes launch copy.',
      displayRole: 'Copywriter',
      id: 'copywriter',
      platforms: ['LinkedIn'],
      teamGroup: 'Editorial',
      type: 'article_writer',
    },
  ],
}));

vi.mock('@ui/card/Card', () => ({
  default: ({
    children,
    description,
    label,
    onClick,
    'data-testid': dataTestId,
  }: {
    children?: ReactNode;
    description?: string;
    label?: ReactNode;
    onClick?: () => void;
    'data-testid'?: string;
  }) => (
    <button data-testid={dataTestId} onClick={onClick} type="button">
      <span>{label}</span>
      <span>{description}</span>
      {children}
    </button>
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
    children,
    isDisabled,
    label,
    onClick,
    'data-testid': dataTestId,
  }: {
    children?: ReactNode;
    isDisabled?: boolean;
    label?: ReactNode;
    onClick?: () => void;
    'data-testid'?: string;
  }) => (
    <button
      data-testid={dataTestId}
      disabled={isDisabled}
      onClick={onClick}
      type="button"
    >
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

describe('AgentMarketplace', () => {
  const onActivate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders featured cards and activate actions for every preset', () => {
    render(
      <AgentMarketplace
        isSubmitting={false}
        onActivate={onActivate}
        submittingPresetId={null}
      />,
    );

    expect(screen.getByText('Featured')).toBeVisible();
    expect(
      screen.getByTestId('agent-preset-featured-video-producer'),
    ).toBeVisible();
    expect(screen.getByTestId('activate-video-producer')).toBeVisible();
    expect(screen.getByTestId('activate-copywriter')).toBeVisible();
    expect(screen.getAllByText(/25 credits/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByTestId('agent-preset-featured-video-producer'));
    expect(onActivate).toHaveBeenCalledWith('video-producer');
  });

  it('filters presets by search and category, then activates with one click', () => {
    render(
      <AgentMarketplace
        isSubmitting={false}
        onActivate={onActivate}
        submittingPresetId={null}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Search agents' }), {
      target: { value: 'copy' },
    });

    expect(screen.queryByText('Featured')).not.toBeInTheDocument();
    expect(screen.queryByText('Video Producer')).not.toBeInTheDocument();
    expect(screen.getByText('Copywriter')).toBeVisible();

    fireEvent.change(screen.getByRole('textbox', { name: 'Search agents' }), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Editorial' }));

    expect(screen.queryByText('Video Producer')).not.toBeInTheDocument();
    expect(screen.getAllByText('Copywriter').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByTestId('activate-copywriter'));
    expect(onActivate).toHaveBeenCalledWith('copywriter');
  });

  it('lists agents alphabetically by name', () => {
    render(
      <AgentMarketplace
        isSubmitting={false}
        onActivate={onActivate}
        submittingPresetId={null}
      />,
    );

    expect(
      screen
        .getAllByTestId(/agent-preset-row-/)
        .map((row) => row.getAttribute('data-testid')),
    ).toEqual([
      'agent-preset-row-copywriter',
      'agent-preset-row-video-producer',
    ]);
    expect(document.querySelector('[data-src]')?.getAttribute('data-src')).toBe(
      'https://cdn.genfeed.ai/assets/agents/copywriter.webp',
    );
  });
});
