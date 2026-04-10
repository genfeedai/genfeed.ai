// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { Voice } from '@models/ingredients/voice.model';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import VoiceCatalogRow from './voice-catalog-row';

vi.mock('@ui/lists/row-sound/ListRowSound', () => ({
  default: ({
    actions,
    badges,
    metaPrimary,
    metaSecondary,
    stats,
    subtitle,
    title,
  }: {
    actions?: ReactNode;
    badges?: ReactNode;
    metaPrimary?: ReactNode;
    metaSecondary?: ReactNode;
    stats?: ReactNode;
    subtitle?: ReactNode;
    title?: ReactNode;
  }) => (
    <div data-testid="list-row-sound">
      <div data-testid="row-title">{title}</div>
      <div data-testid="row-subtitle">{subtitle}</div>
      <div data-testid="row-badges">{badges}</div>
      <div data-testid="row-meta-primary">{metaPrimary}</div>
      <div data-testid="row-meta-secondary">{metaSecondary}</div>
      <div data-testid="row-stats">{stats}</div>
      <div data-testid="row-actions">{actions}</div>
    </div>
  ),
}));

vi.mock('@ui/audio/preview-player/AudioPreviewPlayer', () => ({
  default: ({
    audioUrl,
    label,
  }: {
    audioUrl: string | null;
    label: string;
  }) => <div>{`${label}:${audioUrl ?? 'no-preview'}`}</div>,
}));

vi.mock('@ui/buttons/base/Button', () => ({
  default: ({
    ariaLabel,
    children,
    isDisabled,
    onClick,
  }: {
    ariaLabel?: string;
    children: ReactNode;
    isDisabled?: boolean;
    onClick?: () => void;
  }) => (
    <button
      aria-label={ariaLabel}
      disabled={isDisabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  ),
}));

vi.mock('@ui/display/badge/Badge', () => ({
  default: ({
    children,
    variant,
  }: {
    children: ReactNode;
    variant: string;
  }) => <span>{`${variant}:${String(children)}`}</span>,
}));

function createVoice(overrides: Partial<Voice> = {}): Voice {
  return {
    externalVoiceId: 'voice-ext-1',
    id: 'voice-1',
    isCloned: false,
    isDefaultSelectable: true,
    metadata: {
      description: 'Warm narration voice',
    },
    metadataLabel: 'Rachel',
    provider: 'elevenlabs',
    providerData: {
      index: 4,
    },
    sampleAudioUrl: 'https://example.com/sample.mp3',
    voiceSource: 'catalog',
    ...overrides,
  } as Voice;
}

describe('VoiceCatalogRow', () => {
  it('renders provider, source, defaults, meta, and actions for a catalog voice', () => {
    const onDelete = vi.fn();
    const onSaveBrandDefault = vi.fn();
    const onSaveOrganizationDefault = vi.fn();

    render(
      <VoiceCatalogRow
        isBrandDefault
        isOrgDefault
        isSavingBrandDefault={false}
        isSavingOrgDefault={false}
        onDelete={onDelete}
        onSaveBrandDefault={onSaveBrandDefault}
        onSaveOrganizationDefault={onSaveOrganizationDefault}
        selectedBrandLabel="Acme"
        voice={createVoice({
          cloneStatus: 'ready',
          isFeatured: true,
        })}
      />,
    );

    expect(screen.getByTestId('row-title')).toHaveTextContent('Rachel');
    expect(screen.getByTestId('row-subtitle')).toHaveTextContent(
      'Warm narration voice',
    );
    expect(screen.getByText('secondary:ElevenLabs')).toBeInTheDocument();
    expect(screen.getByText('ghost:Catalog')).toBeInTheDocument();
    expect(screen.getByText('outline:ready')).toBeInTheDocument();
    expect(screen.getByText('accent:Featured')).toBeInTheDocument();
    expect(screen.getByText('success:Org Default')).toBeInTheDocument();
    expect(
      screen.getByText((content) => content.includes('primary:Acme')),
    ).toBeInTheDocument();
    expect(screen.getByTestId('row-meta-primary')).toHaveTextContent(
      'voice-ext-1',
    );
    expect(screen.getByTestId('row-meta-secondary')).toHaveTextContent(
      'Index 4',
    );
    expect(screen.getByTestId('row-stats')).toHaveTextContent(
      'Rachel:https://example.com/sample.mp3',
    );
    expect(
      screen.getByRole('button', { name: 'Organization Default' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Acme Default' }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Organization Default' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Acme Default' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Rachel' }));

    expect(onSaveOrganizationDefault).toHaveBeenCalledTimes(1);
    expect(onSaveBrandDefault).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('renders cloned voice fallbacks and disables default actions when not selectable', () => {
    render(
      <VoiceCatalogRow
        isBrandDefault={false}
        isOrgDefault={false}
        isSavingBrandDefault
        isSavingOrgDefault
        onSaveOrganizationDefault={vi.fn()}
        voice={createVoice({
          externalVoiceId: undefined,
          id: 'voice-fallback',
          isCloned: true,
          isDefaultSelectable: false,
          metadata: undefined,
          metadataLabel: '',
          provider: undefined,
          providerData: undefined,
          sampleAudioUrl: undefined,
          voiceSource: 'generated',
        })}
      />,
    );

    expect(screen.getByTestId('row-title')).toHaveTextContent('voice-fallback');
    expect(screen.getByTestId('row-subtitle')).toHaveTextContent(
      'voice-fallback',
    );
    expect(screen.getByText('secondary:Unknown')).toBeInTheDocument();
    expect(screen.getByText('ghost:Cloned')).toBeInTheDocument();
    expect(screen.getByText('Not default selectable')).toBeInTheDocument();
    expect(screen.getByTestId('row-stats')).toHaveTextContent(
      'voice-fallback:no-preview',
    );

    const orgButton = screen.getByRole('button', { name: 'Set Org Default' });
    expect(orgButton).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: /Brand Default/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Delete/i }),
    ).not.toBeInTheDocument();
  });
});
