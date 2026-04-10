// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { Voice } from '@models/ingredients/voice.model';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import VoiceCatalogList from './voice-catalog-list';

vi.mock('@ui/buttons/base/Button', () => ({
  default: ({
    children,
    isDisabled,
    onClick,
  }: {
    children: ReactNode;
    isDisabled?: boolean;
    onClick?: () => void;
  }) => (
    <button disabled={isDisabled} onClick={onClick} type="button">
      {children}
    </button>
  ),
}));

describe('VoiceCatalogList', () => {
  it('renders the filtered empty state and both actions', () => {
    const onClearFilters = vi.fn();
    const onCloneVoice = vi.fn();

    render(
      <VoiceCatalogList
        hasActiveFilters
        onClearFilters={onClearFilters}
        onCloneVoice={onCloneVoice}
        voices={[]}
      >
        <li>Unused child</li>
      </VoiceCatalogList>,
    );

    expect(
      screen.getByText('No voices match the current filters'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Clear the current filters or clone a new voice sample to populate this library.',
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear Filters' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clone Voice' }));

    expect(onClearFilters).toHaveBeenCalledTimes(1);
    expect(onCloneVoice).toHaveBeenCalledTimes(1);
  });

  it('renders the unfiltered empty state without a clear action', () => {
    render(
      <VoiceCatalogList
        hasActiveFilters={false}
        onClearFilters={vi.fn()}
        onCloneVoice={vi.fn()}
        voices={[]}
      >
        <li>Unused child</li>
      </VoiceCatalogList>,
    );

    expect(screen.getByText('No voices available yet')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Clone your first voice from an uploaded or recorded sample.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Clear Filters' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Clone Voice' }),
    ).toBeInTheDocument();
  });

  it('renders the provided children in the list when voices are present', () => {
    render(
      <VoiceCatalogList
        hasActiveFilters={false}
        onClearFilters={vi.fn()}
        onCloneVoice={vi.fn()}
        voices={[{ id: 'voice-1' } as Voice]}
      >
        <li>Voice Row</li>
      </VoiceCatalogList>,
    );

    expect(screen.getByTestId('voice-catalog-list')).toBeInTheDocument();
    expect(screen.getByText('Voice Row')).toBeInTheDocument();
    expect(
      screen.queryByText('No voices available yet'),
    ).not.toBeInTheDocument();
  });
});
