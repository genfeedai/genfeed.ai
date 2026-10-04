import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import IngredientPromptBlock from './IngredientPromptBlock';

const { mockCopy } = vi.hoisted(() => ({ mockCopy: vi.fn() }));

vi.mock('@genfeedai/services/core/clipboard.service', () => ({
  ClipboardService: { getInstance: () => ({ copyToClipboard: mockCopy }) },
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const LONG_PROMPT = `${'A detailed prompt line.\n'.repeat(12)}\n${'longword'.repeat(80)}`;

function getPromptText(): HTMLElement {
  return screen.getByTestId('ingredient-prompt-text');
}

describe('IngredientPromptBlock', () => {
  beforeEach(() => {
    mockCopy.mockReset();
  });

  it('renders nothing without a prompt', () => {
    const { container } = render(<IngredientPromptBlock prompt="   " />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows a short prompt in full with no toggle', () => {
    render(<IngredientPromptBlock prompt="A red mug on a table" />);

    expect(getPromptText()).toHaveTextContent('A red mug on a table');
    expect(getPromptText()).not.toHaveClass('line-clamp-4');
    expect(
      screen.queryByRole('button', { name: /show full prompt/i }),
    ).not.toBeInTheDocument();
  });

  it('opens a long prompt as a preview and expands to the full text', () => {
    render(<IngredientPromptBlock prompt={LONG_PROMPT} />);

    const text = getPromptText();
    expect(text).toHaveClass('line-clamp-4');
    expect(text).toHaveClass(
      'whitespace-pre-wrap',
      'break-words',
      'select-text',
    );

    const toggle = screen.getByRole('button', { name: /show full prompt/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);

    expect(text).not.toHaveClass('line-clamp-4');
    expect(text.textContent).toBe(LONG_PROMPT);
    expect(screen.getByRole('button', { name: /show less/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('clamps a short prompt that runs over four lines', () => {
    render(<IngredientPromptBlock prompt={'one\ntwo\nthree\nfour\nfive'} />);

    expect(getPromptText()).toHaveClass('line-clamp-4');
  });

  it('copies the full prompt without expanding it', () => {
    render(<IngredientPromptBlock prompt={`  ${LONG_PROMPT}  `} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy prompt' }));

    expect(mockCopy).toHaveBeenCalledWith(LONG_PROMPT);
    expect(getPromptText()).toHaveClass('line-clamp-4');
  });
});
