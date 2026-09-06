// @vitest-environment jsdom
'use client';

import { fireEvent, render, screen } from '@testing-library/react';
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
  it('disables generate while description is empty', () => {
    render(<CharacterCreateDialog {...buildProps()} />);
    expect(screen.getByTestId('generate-sheet')).toBeDisabled();
  });

  it('calls generateSheet when the generate button is clicked', () => {
    const generateSheet = vi.fn();
    render(
      <CharacterCreateDialog
        {...buildProps({
          create: {
            description: 'a tall woman',
            isNonHumanoid: false,
            seed: '',
            setDescription: vi.fn(),
            setIsNonHumanoid: vi.fn(),
            setSeed: vi.fn(),
          },
          generateSheet,
        })}
      />,
    );

    fireEvent.click(screen.getByTestId('generate-sheet'));
    expect(generateSheet).toHaveBeenCalledTimes(1);
  });

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

  it('submits the approve step with name and handle', () => {
    const createCharacter = vi.fn();
    render(
      <CharacterCreateDialog
        {...buildProps({
          candidate: { id: 'img-1', url: 'https://cdn.test/img-1.jpg' },
          createCharacter,
          step: 'approve',
        })}
      />,
    );

    fireEvent.click(screen.getByTestId('create-character'));
    expect(createCharacter).toHaveBeenCalledTimes(1);
  });
});
