// @vitest-environment jsdom
'use client';

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CharacterCreateDialog from './character-create-dialog';

vi.mock('next/image', () => ({
  default: ({
    alt,
    src,
    ...props
  }: {
    alt: string;
    src: string;
    'data-testid'?: string;
  }) => (
    <span data-src={src} data-testid={props['data-testid']}>
      {alt}
    </span>
  ),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../tests/next-intl.stub'
  );
  const translate = translateFromCatalog('common.settings.characters');
  return {
    useTranslations: () => translate,
  };
});

function buildProps(
  overrides: Partial<React.ComponentProps<typeof CharacterCreateDialog>> = {},
): React.ComponentProps<typeof CharacterCreateDialog> {
  return {
    approve: {
      handle: '',
      label: '',
      setHandle: vi.fn(),
      setLabel: vi.fn(),
    },
    candidate: null,
    create: {
      description: '',
      isNonHumanoid: false,
      seed: '',
      setDescription: vi.fn(),
      setIsNonHumanoid: vi.fn(),
      setSeed: vi.fn(),
    },
    createCharacter: vi.fn(),
    discardCandidate: vi.fn(),
    approveCandidate: vi.fn(),
    generateSheet: vi.fn(),
    isCreating: false,
    isGenerating: false,
    isOpen: true,
    onOpenChange: vi.fn(),
    step: 'describe',
    ...overrides,
  };
}

describe('CharacterCreateDialog', () => {
  it('renders the candidate step actions', () => {
    render(
      <CharacterCreateDialog
        {...buildProps({
          candidate: { id: 'img-1', url: 'https://cdn.test/img-1.jpg' },
          step: 'candidate',
        })}
      />,
    );

    expect(screen.getByTestId('candidate-image')).toBeInTheDocument();
    expect(screen.getByTestId('regenerate-sheet')).toBeInTheDocument();
    expect(screen.getByTestId('discard-sheet')).toBeInTheDocument();
    expect(screen.getByTestId('approve-sheet')).toBeInTheDocument();
  });
});
